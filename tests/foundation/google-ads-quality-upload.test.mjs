import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadEdge, mockDatabase } from './edge-harness.mjs';
import { sealToken } from '../../supabase/functions/_shared/google-ads-oauth.ts';

const site = '11111111-1111-4111-8111-111111111111';
const source = readFileSync(new URL('../../supabase/functions/google-ads-quality-upload/index.ts', import.meta.url), 'utf8');

test('candidate query filters on click_id_consent_given = true', async () => {
  const db = mockDatabase(op => {
    if (op.table === 'google_ads_connections') return { data: [{ site_id: site, conversion_action_id: '1' }] };
    return { data: [] };
  });
  const handler = loadEdge('google-ads-quality-upload', db.client, { env: { GOOGLE_ADS_UPLOAD_SECRET: 's' } });
  const res = await handler(new Request('https://example.test/upload', { headers: { 'x-cron-secret': 's' } }));
  assert.equal(res.status, 200);
  const candidates = db.calls.find(c => c.table === 'conversion_events' && c.type === 'select');
  assert.ok(candidates.filters.some(([k, v]) => k === 'click_id_consent_given' && v === true));
});

test('export requires current analytics AND marketing (ad_user_data-gated) session consent', () => {
  assert.match(source, /getSessionConsent\(/);
  assert.match(source, /current\.analytics && current\.marketing/);
});


test('credentials come from the OAuth connection, never from pasted site columns', () => {
  assert.match(source, /loadSiteAdsAuth\(/);
  assert.doesNotMatch(source, /google_ads_access_token|google_ads_developer_token/);
  assert.doesNotMatch(source, /googleads\.googleapis\.com\/v1\d/);
});

test('a site without a Google Ads connection keeps its rows pending', async () => {
  const db = mockDatabase(op => {
    if (op.table === 'google_ads_connections') return op.columns?.includes('time_zone') ? { data: null } : { data: [{ site_id: site, conversion_action_id: null }] };
    if (op.table === 'conversion_events' && op.type === 'select') return { data: [{ id: 'c1', gclid: 'g', created_at: '2026-11-01T00:00:00Z', quality_classified_at: '2026-11-02T00:00:00Z' }] };
    return { data: null };
  });
  const handler = loadEdge('google-ads-quality-upload', db.client, { env: { GOOGLE_ADS_UPLOAD_SECRET: 's' } });
  const res = await handler(new Request('https://example.test/upload', { headers: { 'x-cron-secret': 's' } }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.results[0].error, 'not_connected');
  assert.ok(!db.calls.some(c => c.table === 'conversion_events' && c.type === 'update' && c.payload?.upload_status === 'uploading'));
});

test('never uploads to a remarketing tag id (AW-...) or the legacy sites column', () => {
  assert.doesNotMatch(source, /\.from\('sites'\)/);
  assert.doesNotMatch(source, /google_ads_conversion_id\b(?! ?\))/);
  assert.match(source, /conversionActions\/\$\{conversionActionId\}/);
  assert.match(source, /uploadClickConversions\(/);
});

const tokenKey = Buffer.alloc(32, 7).toString('base64');
const sealedRefresh = await sealToken('refresh-1', tokenKey);
const env = { GOOGLE_ADS_UPLOAD_SECRET: 's', GOOGLE_ADS_DEVELOPER_TOKEN: 'dev', GOOGLE_ADS_TOKEN_KEY: tokenKey };

function connectedDb({ actionId, rows }) {
  return mockDatabase(op => {
    if (op.table === 'google_ads_connections') {
      return op.columns?.includes('time_zone')
        ? { data: { customer_id: '4567890123', login_customer_id: null, currency_code: 'SEK', time_zone: 'Europe/Stockholm', conversion_action_id: actionId, status: 'connected' } }
        : { data: [{ site_id: site, conversion_action_id: actionId }] };
    }
    if (op.table === 'google_ads_tokens') return { data: { refresh_token_sealed: sealedRefresh } };
    if (op.table === 'cookie_consents') return { data: { consent_given: true, consent_types: { analytics: true, marketing: true }, expires_at: '2999-01-01T00:00:00Z' } };
    return { data: rows };
  });
}

test('without a picked conversion action the site is skipped with a clear status and nothing is claimed', async () => {
  const rows = [{ id: 'c1', gclid: 'g', quality_value: 100, created_at: '2026-11-01T00:00:00Z' }];
  const db = connectedDb({ actionId: null, rows });
  let outbound = 0;
  const handler = loadEdge('google-ads-quality-upload', db.client, {
    env, fetch: async (url) => { if (String(url).includes('oauth2')) return Response.json({ access_token: 'a' }); outbound++; return Response.json({}); },
  });
  const res = await handler(new Request('https://example.test/upload', { headers: { 'x-cron-secret': 's' } }));
  const body = await res.json();
  assert.equal(body.results[0].status, 'no_conversion_action');
  assert.equal(body.results[0].pending, 1);
  assert.equal(outbound, 0);
  assert.ok(!db.calls.some(c => c.table === 'conversion_events' && c.type === 'update' && c.payload?.upload_status === 'uploading'));
});

test('uploads click conversions to the picked action with order id, value and consent', async () => {
  const rows = [{ id: 'c1', gclid: 'g-1', hashed_email: 'ab'.repeat(32), quality_value: 300, created_at: '2026-11-01T10:00:00Z',
    form_data: { tracking_session_id: 'sess-1' } }];
  const db = connectedDb({ actionId: '987', rows });
  const sent = [];
  const handler = loadEdge('google-ads-quality-upload', db.client, {
    env,
    fetch: async (url, init) => {
      if (String(url).includes('oauth2')) return Response.json({ access_token: 'a' });
      sent.push({ url: String(url), body: JSON.parse(init.body) });
      return Response.json({});
    },
  });
  const res = await handler(new Request('https://example.test/upload', { headers: { 'x-cron-secret': 's' } }));
  assert.equal(res.status, 200);
  assert.equal(sent.length, 1);
  assert.match(sent[0].url, /customers\/4567890123:uploadClickConversions$/);
  const [conv] = sent[0].body.conversions;
  assert.equal(conv.conversionAction, 'customers/4567890123/conversionActions/987');
  assert.equal(conv.gclid, 'g-1');
  assert.equal(conv.conversionValue, 300);
  assert.equal(conv.currencyCode, 'SEK');
  assert.equal(conv.orderId, 'c1');
  assert.deepEqual(conv.consent, { adUserData: 'GRANTED' });
  assert.deepEqual(conv.userIdentifiers, [{ hashedEmail: 'ab'.repeat(32) }]);
  assert.equal(sent[0].body.partialFailure, true);
});

test('Challenge leads (value 0) are marked not_applicable and not uploaded', async () => {
  const rows = [{ id: 'c2', gclid: 'g-2', quality_value: 0, created_at: '2026-11-01T10:00:00Z', form_data: { tracking_session_id: 'sess-1' } }];
  const db = connectedDb({ actionId: '987', rows });
  let outbound = 0;
  const handler = loadEdge('google-ads-quality-upload', db.client, {
    env, fetch: async (url) => { if (String(url).includes('oauth2')) return Response.json({ access_token: 'a' }); outbound++; return Response.json({}); },
  });
  await handler(new Request('https://example.test/upload', { headers: { 'x-cron-secret': 's' } }));
  assert.equal(outbound, 0);
  assert.ok(db.calls.some(c => c.table === 'conversion_events' && c.payload?.upload_status === 'not_applicable'));
});

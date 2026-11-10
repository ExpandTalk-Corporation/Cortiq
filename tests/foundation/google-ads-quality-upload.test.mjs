import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadEdge, mockDatabase } from './edge-harness.mjs';

const site = '11111111-1111-4111-8111-111111111111';
const source = readFileSync(new URL('../../supabase/functions/google-ads-quality-upload/index.ts', import.meta.url), 'utf8');

test('candidate query filters on click_id_consent_given = true', async () => {
  const db = mockDatabase(op => {
    if (op.table === 'sites') return { data: [{ id: site, google_ads_conversion_id: '1' }] };
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
    if (op.table === 'sites') return { data: [{ id: site, google_ads_conversion_id: '123' }] };
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

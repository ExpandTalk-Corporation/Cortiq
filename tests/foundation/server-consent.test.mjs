import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEdge, mockDatabase } from './edge-harness.mjs';

const site = '11111111-1111-4111-8111-111111111111';
const otherSite = '22222222-2222-4222-8222-222222222222';
const session = 'session-1';
const active = { consent_given: true, consent_types: { analytics: true, marketing: true }, expires_at: '2099-01-01T00:00:00Z' };
const post = (body, origin) => new Request('https://example.test/function', {
  method: 'POST', body: JSON.stringify(body), headers: origin ? { Origin: origin } : {},
});

function conversion(consent, consentError = null) {
  const db = mockDatabase(op => {
    if (op.table === 'sites') return { data: { id: site, is_active: true, tracking_mode: 'full' }, error: null };
    if (op.table === 'cookie_consents') return { data: consent, error: consentError };
    if (op.table === 'unified_visitors') return { data: { gclid: 'old-click', click_id_consent_given: true }, error: null };
    return { data: { id: 'row-1' }, error: null };
  });
  return { ...db, handler: loadEdge('record-conversion', db.client) };
}

for (const [name, consent, error] of [
  ['missing', null, null],
  ['withdrawn', { ...active, consent_given: false }, null],
  ['analytics refused', { ...active, consent_types: { analytics: false, marketing: true } }, null],
  ['expired', { ...active, expires_at: '2000-01-01T00:00:00Z' }, null],
  ['missing expiry', { ...active, expires_at: null }, null],
  ['malformed boolean', { ...active, consent_types: { analytics: 'true', marketing: true } }, null],
  ['lookup failure', null, { message: 'offline' }],
]) {
  test(`conversion cannot write with ${name} consent`, async () => {
    const { handler, calls } = conversion(consent, error);
    const result = await handler(post({ siteId: site, sessionId: session, visitorId: 'old-profile', hashedEmail: 'a'.repeat(64) }));
    assert.equal(result.status, error ? 500 : 403);
    assert.equal(calls.some(c => c.type !== 'select'), false);
    assert.equal(calls.some(c => c.table === 'unified_visitors'), false);
  });
}

test('analytics-only conversion drops old marketing IDs and hashes', async () => {
  const { handler, calls } = conversion({ ...active, consent_types: { analytics: true, marketing: false } });
  assert.equal((await handler(post({ siteId: site, sessionId: session, visitorId: 'old-profile', hashedEmail: 'a'.repeat(64) }))).status, 200);
  const insert = calls.find(c => c.table === 'conversion_events' && c.type === 'insert');
  assert.equal(insert.payload.gclid, null);
  assert.equal(insert.payload.hashed_email, null);
  assert.equal(insert.payload.click_id_consent_given, false);
  assert.notEqual(insert.payload.upload_status, 'pending');
  const lookup = calls.find(c => c.table === 'cookie_consents');
  assert.deepEqual(lookup.filters, [['site_id', site], ['session_id', session]]);
});

test('current analytics and marketing grant allows an attributable conversion', async () => {
  const { handler, calls } = conversion(active);
  assert.equal((await handler(post({ siteId: site, sessionId: session, hashedEmail: 'a'.repeat(64) }))).status, 200);
  const insert = calls.find(c => c.table === 'conversion_events' && c.type === 'insert');
  assert.equal(insert.payload.upload_status, 'pending');
  assert.equal(insert.payload.hashed_email, 'a'.repeat(64));
});

function ledger(originSite = site) {
  const db = mockDatabase(op => ({ data: { id: op.table === 'sites' ? site : 'consent-1' }, error: null }),
    async name => ({ data: name === 'resolve_site_by_domain' ? originSite : true, error: null }));
  return { ...db, handler: loadEdge('store-consent', db.client) };
}
const choice = { site_id: site, session_id: session, consent_types: { analytics: false, marketing: false, preferences: false } };

test('withdrawal updates consent_given and records the denied decision', async () => {
  const { handler, calls } = ledger();
  assert.equal((await handler(post(choice, 'https://site.test'))).status, 200);
  const update = calls.find(c => c.table === 'cookie_consents' && c.type === 'update');
  assert.equal(update.payload.consent_given, false);
  assert.equal(update.payload.consent_types.analytics, false);
  assert.ok(Date.parse(update.payload.expires_at) > Date.now());
  const audit = calls.find(c => c.table === 'consent_validations' && c.type === 'insert');
  assert.equal(audit.payload.consent_status.marketing, false);
});

test('a registered origin cannot change another site consent', async () => {
  const { handler, calls } = ledger(otherSite);
  assert.equal((await handler(post(choice, 'https://other.test'))).status, 403);
  assert.equal(calls.some(c => c.type !== 'select'), false);
});

test('string booleans and oversized session IDs are rejected before writes', async () => {
  for (const body of [{ ...choice, consent_types: { ...choice.consent_types, analytics: 'false' } }, { ...choice, session_id: 'x'.repeat(256) }]) {
    const { handler, calls } = ledger();
    assert.equal((await handler(post(body))).status, 400);
    assert.equal(calls.some(c => c.type !== 'select'), false);
  }
});

for (const [name, consent] of [['missing', null], ['expired', { ...active, expires_at: '2000-01-01' }], ['active', active]]) {
  test(`consent-check cannot override ${name} visitor choice with site settings`, async () => {
    const db = mockDatabase(op => ({ data: op.table === 'sites'
      ? { server_side_tracking_config: { block_analytics_without_consent: false, block_marketing_without_consent: false } }
      : op.table === 'cookie_consents' ? consent : { id: 'audit-1' }, error: null }));
    const handler = loadEdge('consent-check', db.client);
    const response = await handler(post({ site_id: site, session_id: session, consent_types: ['analytics', 'marketing'] }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).allowed, name === 'active');
  });
}

for (const [name, consent] of [['withdrawn', { ...active, consent_given: false }], ['expired', { ...active, expires_at: '2000-01-01' }], ['active', active]]) {
  test(`queued Google Ads export checks ${name} consent again`, async () => {
    const row = { id: 'conversion-1', gclid: 'click-1', created_at: '2026-09-17T00:00:00Z', form_data: { tracking_session_id: session } };
    const db = mockDatabase(op => {
      if (op.table === 'sites') return { data: [{ id: site, google_ads_conversion_id: '123', google_ads_customer_id: '456', google_ads_developer_token: 'dev', google_ads_access_token: 'access' }] };
      if (op.table === 'cookie_consents') return { data: consent };
      return { data: [row] };
    });
    let exports = 0;
    const handler = loadEdge('google-ads-quality-upload', db.client, { env: { GOOGLE_ADS_UPLOAD_SECRET: 'secret' }, fetch: async () => { exports++; return Response.json({}); } });
    const response = await handler(new Request('https://example.test/upload', { headers: { 'x-cron-secret': 'secret' } }));
    assert.equal(response.status, 200);
    assert.equal(exports, name === 'active' ? 1 : 0);
    if (name !== 'active') assert.ok(db.calls.some(c => c.payload?.upload_status === 'skipped_no_consent'));
  });
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEdge, mockDatabase } from './edge-harness.mjs';

const SITE = '11111111-1111-4111-8111-111111111111';
const LEDGER_OK = { consent_given: true, consent_types: { analytics: true, marketing: true }, gpc_signal: false, expires_at: '2099-01-01T00:00:00Z' };
const TEST_SITE_POLICY = { profile: null, tighten: {}, exceptions: [], testSite: true };
const OFF_POLICY = { profile: null, tighten: { attribution: 'off' }, exceptions: [], testSite: false };

function db({ site, ledger = LEDGER_OK, policy = null, extra = () => null }) {
  const rpcCalls = [];
  const m = mockDatabase((op) => {
    if (op.table === 'sites') return { data: site, error: null };
    if (op.table === 'cookie_consents') return { data: ledger, error: null };
    return extra(op) ?? { data: { id: 'row-1' }, error: null };
  }, async (name, args) => {
    rpcCalls.push({ name, args });
    if (name === 'get_site_jurisdiction') return { data: policy, error: null };
    if (name === 'upsert_unified_visitor') return { data: 'visitor-1', error: null };
    return { data: true, error: null };
  });
  return { ...m, rpcCalls };
}
const logs = (rpcCalls) => rpcCalls.filter((c) => c.name === 'log_jurisdiction_decision').map((c) => c.args);
const post = (path, body) => new Request(`https://fn.test/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

// ---------- record-conversion ----------
const CONV_SITE = { id: SITE, is_active: true, tracking_mode: 'full' };
const visitorRow = (op) => (op.table === 'unified_visitors' ? { data: { gclid: 'g-1', click_id_consent_given: true }, error: null } : null);
async function conversion({ env = {}, policy = null } = {}) {
  const d = db({ site: CONV_SITE, policy, extra: visitorRow });
  const handler = loadEdge('record-conversion', d.client, { env });
  const res = await handler(post('record-conversion', { siteId: SITE, sessionId: 's-1', visitorId: 'v-1', hashedEmail: 'a'.repeat(64) }));
  return { res, body: await res.json(), d, insert: d.calls.find((c) => c.table === 'conversion_events' && c.type === 'insert')?.payload };
}

test('record-conversion shadow: two decisions logged, row unchanged', async () => {
  const { insert, d } = await conversion();
  assert.equal(insert.upload_status, 'pending');
  assert.deepEqual(logs(d.rpcCalls).map((l) => [l.p_purpose, l.p_evidence, l.p_enforced]), [['conversion', 'ledger', false], ['attribution', 'ledger', false]]);
});

test('record-conversion: a rate-limited request is refused before any jurisdiction read or log', async () => {
  const rpcCalls = [];
  const m = mockDatabase((op) => {
    if (op.table === 'sites') return { data: CONV_SITE, error: null };
    if (op.table === 'cookie_consents') return { data: LEDGER_OK, error: null };
    return { data: null, error: null };
  }, async (name, args) => { rpcCalls.push({ name, args }); return { data: name === 'check_rate_limit' ? false : true, error: null }; });
  const res = await loadEdge('record-conversion', m.client)(post('record-conversion', { siteId: SITE, sessionId: 's-1' }));
  assert.equal(res.status, 429);
  assert.deepEqual(rpcCalls.map((c) => c.name).filter((n) => n !== 'check_rate_limit'), []);
});

test('record-conversion enforce: customer "off" for attribution strips the click and marks skipped_jurisdiction', async () => {
  const { insert } = await conversion({ env: { JURISDICTION_ENFORCE: 'record-conversion' }, policy: OFF_POLICY });
  assert.deepEqual([insert.gclid, insert.hashed_email, insert.click_id_consent_given, insert.upload_status], [null, null, false, 'skipped_jurisdiction']);
});

test('record-conversion enforce with consent: the baseline is met, the conversion is kept', async () => {
  const { insert } = await conversion({ env: { JURISDICTION_ENFORCE: 'record-conversion' } });
  assert.equal(insert.upload_status, 'pending');
});

// ---------- visitor-identification ----------
const VI_SITE = { id: SITE, is_active: true, tracking_mode: 'full', domain: 'example.com', fingerprint_salt: 's' };
async function identify({ env = {}, policy = null, ledger = LEDGER_OK } = {}) {
  const d = db({ site: VI_SITE, policy, ledger });
  const handler = loadEdge('visitor-identification', d.client, { env });
  const res = await handler(post('visitor-identification', {
    siteId: SITE, sessionId: 's-1', userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0', screenResolution: '1920x1080',
    viewport: '1200x800', timezone: -60, language: 'sv-SE', platform: 'Win32', currentUrl: 'https://example.com/',
    gclid: 'g-1', clickIdConsentGiven: true,
  }));
  return { body: await res.json(), d, clickUpdate: d.calls.find((c) => c.table === 'unified_visitors' && c.type === 'update') };
}

test('visitor-identification enforce: tighten attribution off keeps the visitor but drops click IDs', async () => {
  const { clickUpdate, d } = await identify({ env: { JURISDICTION_ENFORCE: 'visitor-identification' }, policy: OFF_POLICY });
  assert.equal(clickUpdate, undefined);
  assert.ok(d.rpcCalls.some((c) => c.name === 'upsert_unified_visitor'));
  assert.deepEqual(logs(d.rpcCalls).map((l) => [l.p_purpose, l.p_reason]), [['statistics', 'allowed'], ['attribution', 'customer_off']]);
});

test('visitor-identification enforce: refused ledger = no profile, no fingerprint', async () => {
  const refused = { ...LEDGER_OK, consent_given: false };
  const { body, d } = await identify({ env: { JURISDICTION_ENFORCE: 'all' }, ledger: refused });
  assert.equal(body.skipped, 'jurisdiction');
  assert.equal(d.rpcCalls.some((c) => c.name === 'upsert_unified_visitor'), false);
});

// ---------- track-event ----------
// form_session is used because it returns before the hourly rate-limit query, which uses .gte()
// (not supported by mockDatabase).
async function formSession({ env = {}, ledger = null } = {}) {
  const d = db({
    site: { id: SITE }, ledger,
    extra: (op) => (op.table === 'companies' ? { data: { id: 'c-1', is_active: true }, error: null } : null),
  });
  const handler = loadEdge('track-event', d.client, { env });
  const res = await handler(new Request('https://fn.test/track-event', {
    method: 'POST', headers: { 'content-type': 'application/json', Authorization: 'Bearer acct_' + 'b'.repeat(32) },
    body: JSON.stringify({ company_id: 'c-1', site_id: SITE, session_id: 's-1', event_type: 'form_session', content_type: 'page', content_id: 'x',
      metadata: { status: 'completed', form_id: 'f', fields: [] } }),
  }));
  return { body: await res.json(), d };
}

test('Review Focus 1: no ledger row yet = tracker-gate evidence, the event is kept under enforcement', async () => {
  const { body, d } = await formSession({ env: { JURISDICTION_ENFORCE: 'track-event' } });
  assert.notEqual(body.skipped, 'jurisdiction');
  assert.equal(logs(d.rpcCalls)[0].p_evidence, 'tracker_gate');
});

test('track-event enforce: a refused ledger row drops the event without a write', async () => {
  const { body, d } = await formSession({ env: { JURISDICTION_ENFORCE: 'track-event' }, ledger: { ...LEDGER_OK, consent_types: { analytics: false, marketing: false } } });
  assert.deepEqual(body, { success: true, skipped: 'jurisdiction' });
  assert.equal(d.rpcCalls.some((c) => c.name === 'ingest_form_session' || c.name === 'record_form_session'), false);
  assert.equal(d.calls.some((c) => c.type === 'insert'), false);
});

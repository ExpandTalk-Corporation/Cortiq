// tests/foundation/jurisdiction-customer-off.test.mjs
// Decided 2026-11-20: the customer's own "Off" applies now, without JURISDICTION_ENFORCE; "Require opt-in"
// and the market rules stay shadow. Sites without an Off keep the shadow path off the response.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEdge, mockDatabase } from './edge-harness.mjs';
import { signGeo, GEO_HEADER } from '../../supabase/functions/_shared/geo-token.js';
import { gateAdsUpload, STRICT_POLICY } from '../../supabase/functions/_shared/jurisdiction-edge.ts';

const SITE = '11111111-1111-4111-8111-111111111111';
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const KEY = 'tk_' + 'a'.repeat(32);
const GEO_KEY = 'g'.repeat(32);
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36';
const LEDGER_OK = { consent_given: true, consent_types: { analytics: true, marketing: true }, gpc_signal: false, expires_at: '2099-01-01T00:00:00Z' };
const tighten = (t) => ({ profile: null, tighten: t, exceptions: [], testSite: false });

// `hold` (a promise) delays the decision log (and, with holdLedger, the consent-ledger read) until the test
// releases it.
function db({ site, policy = null, ledger = LEDGER_OK, extra = () => null, hold = null, holdLedger = true }) {
  const rpcCalls = [];
  const m = mockDatabase(async (op) => {
    if (op.table === 'sites') return { data: site, error: null };
    if (op.table === 'cookie_consents' && op.type === 'select') { if (hold && holdLedger) await hold; return { data: ledger, error: null }; }
    return extra(op) ?? { data: { id: 'row-1' }, error: null };
  }, async (name, args) => {
    rpcCalls.push({ name, args });
    if (name === 'get_site_jurisdiction') return { data: policy, error: null };
    if (name === 'log_jurisdiction_decision') { if (hold) await hold; return { data: null, error: null }; }
    if (name === 'aggregate_daily_salt') return { data: 'f'.repeat(64), error: null };
    if (name === 'upsert_unified_visitor') return { data: 'visitor-1', error: null };
    return { data: true, error: null };
  });
  return { ...m, rpcCalls };
}
const logs = (rpcCalls) => rpcCalls.filter((c) => c.name === 'log_jurisdiction_decision').map((c) => c.args);
const named = (rpcCalls, n) => rpcCalls.filter((c) => c.name === n);
const inserts = (d, table) => d.calls.filter((c) => c.table === table && c.type === 'insert');
const post = (path, body, headers = {}) => new Request(`https://fn.test/${path}`, {
  method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const geoHeader = async (country) => ({ [GEO_HEADER]: await signGeo({ country, region: null, ip: '203.0.113.9' }, GEO_KEY, Math.floor(Date.now() / 1000)) });

// Runs one request. With `slow`, the log (and the gate's ledger read, unless slowLedger is false) hang until
// after the response is checked.
async function run(name, request, { site, policy = null, ledger, extra, env = {}, slow = false, slowLedger = true }) {
  let release = () => {};
  const hold = slow ? new Promise((r) => { release = r; }) : null;
  const d = db({ site, policy, ledger, extra, hold, holdLedger: slowLedger });
  const handler = loadEdge(name, d.client, { env: { GEO_SIGNING_KEY: GEO_KEY, ...env }, flushWaitUntil: !slow });
  let settled = false;
  const pending = handler(await request()).then((res) => { settled = true; return res; });
  if (slow) await new Promise((r) => setTimeout(r, 20));
  const answeredBeforeLog = settled;
  release();
  const res = await pending;
  if (slow) await Promise.all(handler.waitUntilWork);
  const body = res.status === 200 ? await res.json() : null;
  return { res, body, d, answeredBeforeLog };
}

// ---------- aggregate-hit ----------
const AGG_SITE = { id: SITE, user_id: OWNER, is_active: true, domain: 'shop.test', aggregate_measurement: true, conversion_goals: [] };
const agg = async (opts) => run('aggregate-hit', async () => post('aggregate-hit',
  { siteId: SITE, kind: 'pageview', url: 'https://shop.test/' }, { Authorization: `Bearer ${KEY}`, 'user-agent': CHROME, ...(await geoHeader('SE')) }),
  { site: AGG_SITE, ...opts });

test('aggregate-hit: customer Off for statistics drops without the flag; logged as applied', async () => {
  const { body, d } = await agg({ policy: tighten({ statistics: 'off' }) });
  assert.deepEqual(body, { skipped: 'jurisdiction' });
  assert.equal(named(d.rpcCalls, 'ingest_aggregate_hit').length, 0);
  assert.equal(named(d.rpcCalls, 'aggregate_daily_salt').length, 0);
  const [l] = logs(d.rpcCalls);
  assert.deepEqual([l.p_reason, l.p_outcome, l.p_enforced], ['customer_off', 'blocked', true]);
});

test('aggregate-hit: opt_in stays shadow; an Off for another purpose does not drop', async () => {
  for (const t of [{ statistics: 'opt_in' }, { conversion: 'off' }]) {
    const { body, d } = await agg({ policy: tighten(t) });
    assert.deepEqual(body, { goals: [] }, JSON.stringify(t));
    assert.equal(named(d.rpcCalls, 'ingest_aggregate_hit').length, 1);
    assert.equal(logs(d.rpcCalls)[0].p_enforced, false);
  }
});

test('aggregate-hit: with an Off elsewhere the decision is inline but the log stays off the response', async () => {
  const { body, answeredBeforeLog, d } = await agg({ policy: tighten({ attribution: 'off' }), slow: true });
  assert.deepEqual(body, { goals: [] });
  assert.equal(answeredBeforeLog, true);
  assert.equal(logs(d.rpcCalls).length, 1);
});

// ---------- server-hit ----------
const SH_SITE = { id: SITE, is_active: true, domain: 'https://www.shop.test/' };
const serverHit = (opts) => run('server-hit', async () => post('server-hit', { hits: [
  { url: 'https://shop.test/a', userAgent: 'GPTBot/1.2', ip: '203.0.113.7' },
  { url: 'https://shop.test/b', userAgent: 'ClaudeBot/1.0' },
] }, { Authorization: `Bearer ${KEY}` }), { site: SH_SITE, ...opts });

test('server-hit: customer Off for agent_measurement drops the batch without the flag', async () => {
  const { body, d } = await serverHit({ policy: tighten({ agent_measurement: 'off' }) });
  assert.deepEqual(body, { accepted: 2, stored: 0, ignored: 0, rejected: 0, skipped: 'jurisdiction' });
  assert.equal(inserts(d, 'ai_bot_traffic').length, 0);
  assert.deepEqual([logs(d.rpcCalls)[0].p_reason, logs(d.rpcCalls)[0].p_enforced], ['customer_off', true]);
});

test('server-hit: opt_in is not applied', async () => {
  const { body } = await serverHit({ policy: tighten({ agent_measurement: 'opt_in' }) });
  assert.equal(body.stored, 2);
});

test('server-hit: no tighten = answers before a slow decision log', async () => {
  const { body, answeredBeforeLog } = await serverHit({ slow: true });
  assert.equal(body.stored, 2);
  assert.equal(answeredBeforeLog, true);
});

// ---------- ai-bot-tracker ----------
const BOT_SITE = { id: SITE, is_active: true, domain: 'shop.test', user_id: OWNER };
const aiBot = (opts) => run('ai-bot-tracker', async () => post('ai-bot-tracker', { siteId: SITE, url: 'https://shop.test/', sessionId: 's-1' },
  { 'user-agent': 'Mozilla/5.0 (compatible; GPTBot/1.2)' }), { site: BOT_SITE, ...opts });

test('ai-bot-tracker: customer Off for agent_measurement drops without the flag; opt_in does not', async () => {
  const off = await aiBot({ policy: tighten({ agent_measurement: 'off' }) });
  assert.equal(off.body.skipped, 'jurisdiction');
  assert.equal(inserts(off.d, 'ai_bot_traffic').length, 0);
  const optIn = await aiBot({ policy: tighten({ agent_measurement: 'opt_in' }) });
  assert.notEqual(optIn.body.skipped, 'jurisdiction');
});

test('ai-bot-tracker: no tighten = answers before a slow ledger read and log', async () => {
  const { body, answeredBeforeLog } = await aiBot({ slow: true });
  assert.notEqual(body.skipped, 'jurisdiction');
  assert.equal(answeredBeforeLog, true);
});

// ---------- track-event (form_session returns before the .gte() rate-limit query) ----------
const formSession = (opts) => run('track-event', async () => post('track-event', {
  company_id: 'c-1', site_id: SITE, session_id: 's-1', event_type: 'form_session', content_type: 'page', content_id: 'x',
  metadata: { status: 'completed', form_id: 'f', fields: [] },
}, { Authorization: 'Bearer acct_' + 'b'.repeat(32) }), {
  site: { id: SITE }, ledger: null, extra: (op) => (op.table === 'companies' ? { data: { id: 'c-1', is_active: true }, error: null } : null), ...opts,
});

test('track-event: customer Off for statistics drops without the flag; opt_in does not', async () => {
  const off = await formSession({ policy: tighten({ statistics: 'off' }) });
  assert.deepEqual(off.body, { success: true, skipped: 'jurisdiction' });
  assert.equal(off.d.calls.some((c) => c.type === 'insert'), false);
  assert.equal(named(off.d.rpcCalls, 'get_site_jurisdiction').length, 1, 'policy loaded once per request');
  const optIn = await formSession({ policy: tighten({ statistics: 'opt_in' }) });
  assert.notEqual(optIn.body.skipped, 'jurisdiction');
});

test('track-event: no tighten = answers before a slow ledger read and log', async () => {
  const { body, answeredBeforeLog } = await formSession({ slow: true });
  assert.notEqual(body.skipped, 'jurisdiction');
  assert.equal(answeredBeforeLog, true);
});

// ---------- visitor-identification ----------
const VI_SITE = { id: SITE, is_active: true, tracking_mode: 'full', domain: 'example.com', fingerprint_salt: 's' };
const identify = (opts) => run('visitor-identification', async () => post('visitor-identification', {
  siteId: SITE, sessionId: 's-1', userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0', screenResolution: '1920x1080',
  viewport: '1200x800', timezone: -60, language: 'sv-SE', platform: 'Win32', currentUrl: 'https://example.com/',
  gclid: 'g-1', clickIdConsentGiven: true,
}), { site: VI_SITE, ...opts });
const clickUpdate = (d) => d.calls.find((c) => c.table === 'unified_visitors' && c.type === 'update');

test('visitor-identification: customer Off applies without the flag (statistics = no profile, attribution = no click IDs)', async () => {
  const stats = await identify({ policy: tighten({ statistics: 'off' }) });
  assert.equal(stats.body.skipped, 'jurisdiction');
  assert.equal(named(stats.d.rpcCalls, 'upsert_unified_visitor').length, 0);
  const attr = await identify({ policy: tighten({ attribution: 'off' }) });
  assert.equal(named(attr.d.rpcCalls, 'upsert_unified_visitor').length, 1);
  assert.equal(clickUpdate(attr.d), undefined);
  assert.deepEqual(logs(attr.d.rpcCalls).map((l) => [l.p_purpose, l.p_reason, l.p_enforced]),
    [['statistics', 'allowed', false], ['attribution', 'customer_off', true]]);
});

test('visitor-identification: opt_in is not applied', async () => {
  const { d } = await identify({ policy: tighten({ statistics: 'opt_in', attribution: 'opt_in' }) });
  assert.ok(clickUpdate(d));
});

// visitor-identification and record-conversion read the consent ledger on the response path themselves
// (consent gate, before and unchanged by this work), so only the decision log is slowed here.
test('visitor-identification: no tighten = answers before a slow decision log', async () => {
  const { body, answeredBeforeLog } = await identify({ slow: true, slowLedger: false });
  assert.notEqual(body.skipped, 'jurisdiction');
  assert.equal(answeredBeforeLog, true);
});

// ---------- record-conversion ----------
const visitorRow = (op) => (op.table === 'unified_visitors' ? { data: { gclid: 'g-1', click_id_consent_given: true }, error: null } : null);
const conversion = (opts) => run('record-conversion', async () => post('record-conversion',
  { siteId: SITE, sessionId: 's-1', visitorId: 'v-1', hashedEmail: 'a'.repeat(64) }),
  { site: { id: SITE, is_active: true, tracking_mode: 'full' }, extra: visitorRow, ...opts });
const convInsert = (d) => inserts(d, 'conversion_events')[0]?.payload;

test('record-conversion: customer Off applies without the flag (conversion = skipped, attribution = click stripped)', async () => {
  const conv = await conversion({ policy: tighten({ conversion: 'off' }) });
  assert.deepEqual(conv.body, { success: true, skipped: 'jurisdiction' });
  assert.equal(convInsert(conv.d), undefined);
  const attr = await conversion({ policy: tighten({ attribution: 'off' }) });
  const row = convInsert(attr.d);
  assert.deepEqual([row.gclid, row.hashed_email, row.click_id_consent_given, row.upload_status], [null, null, false, 'skipped_jurisdiction']);
});

test('record-conversion: opt_in is not applied', async () => {
  const { d } = await conversion({ policy: tighten({ conversion: 'opt_in', attribution: 'opt_in' }) });
  assert.equal(convInsert(d).upload_status, 'pending');
});

test('record-conversion: no tighten = answers before a slow decision log', async () => {
  const { d, answeredBeforeLog } = await conversion({ slow: true, slowLedger: false });
  assert.equal(convInsert(d).upload_status, 'pending');
  assert.equal(answeredBeforeLog, true);
});

// ---------- store-consent never blocks ----------
test('store-consent: a customer Off never blocks storing the choice and is not logged as applied', async () => {
  const d = db({ site: { id: SITE }, policy: tighten({ statistics: 'off', attribution: 'off' }), ledger: null,
    extra: (op) => (op.table === 'cookie_consents' && op.type === 'insert' ? { data: { id: 'row-1', ...op.payload }, error: null } : null) });
  const res = await loadEdge('store-consent', d.client)(post('store-consent',
    { site_id: SITE, session_id: 'c-1', consent_types: { analytics: true, marketing: true, preferences: false } }));
  assert.equal(res.status, 200);
  assert.equal(inserts(d, 'cookie_consents').length, 1);
  assert.equal(logs(d.rpcCalls)[0].p_enforced, false);
});

// ---------- google-ads-quality-upload ----------
test('gateAdsUpload: customer Off for ad_platform_sharing drops without the flag; opt_in with consent does not', async () => {
  const ledgerDb = () => db({ site: null });
  const off = ledgerDb();
  assert.equal((await gateAdsUpload(off.client, SITE, 's-1', { ...STRICT_POLICY, tighten: { ad_platform_sharing: 'off' } }, undefined)).drop, true);
  assert.equal(logs(off.rpcCalls)[0].p_enforced, true);
  assert.equal((await gateAdsUpload(ledgerDb().client, SITE, 's-1', { ...STRICT_POLICY, tighten: { ad_platform_sharing: 'opt_in' } }, undefined)).drop, false);
  // A failed policy load (STRICT_POLICY) never drops in shadow.
  assert.equal((await gateAdsUpload(ledgerDb().client, SITE, 's-1', STRICT_POLICY, undefined)).drop, false);
});

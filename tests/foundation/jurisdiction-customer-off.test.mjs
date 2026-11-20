// tests/foundation/jurisdiction-customer-off.test.mjs
// Decided 2026-11-20: the customer's own "Off" applies now, without JURISDICTION_ENFORCE; "Require opt-in"
// and the market rules stay shadow. Sites without an Off keep the shadow path off the response.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { loadEdge, mockDatabase } from './edge-harness.mjs';
import { signGeo, GEO_HEADER } from '../../supabase/functions/_shared/geo-token.js';
import { gateAdsUpload, jurisdictionGate, resetPolicyCache, STRICT_POLICY, POLICY_TIMEOUT_MS } from '../../supabase/functions/_shared/jurisdiction-edge.ts';
import { PACK } from '../../supabase/functions/_shared/jurisdiction/packs.ts';

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
    if (name === 'resolve_site_by_domain') return { data: SITE, error: null };
    return { data: true, error: null };
  });
  // import-server-logs checks the caller's session before the RLS-scoped site read.
  m.client.auth = { getUser: async () => ({ data: { user: { id: OWNER } }, error: null }) };
  return { ...m, rpcCalls };
}
const logs = (rpcCalls) => rpcCalls.filter((c) => c.name === 'log_jurisdiction_decision').map((c) => c.args);
const named = (rpcCalls, n) => rpcCalls.filter((c) => c.name === n);
const inserts = (d, table) => d.calls.filter((c) => c.table === table && c.type === 'insert');
const post = (path, body, headers = {}) => new Request(`https://fn.test/${path}`, {
  method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const geoHeader = async (country) => ({ [GEO_HEADER]: await signGeo({ country, region: null, ip: '203.0.113.9' }, GEO_KEY, Math.floor(Date.now() / 1000)) });

// Resolves 'answered' when `p` settles, or 'stuck' if it has not after 2 s. The 2 s only bounds a
// failing test; a passing one never depends on timing, because the held work is released only after.
async function answered(p) {
  let timer;
  const stuck = new Promise((r) => { timer = setTimeout(() => r('stuck'), 2000); });
  const out = await Promise.race([p.then(() => 'answered'), stuck]);
  clearTimeout(timer);
  return out;
}

// Runs one request. With `slow`, the log (and the gate's ledger read, unless slowLedger is false) are held
// on a promise the test releases only after the response has arrived.
async function run(name, request, { site, policy = null, ledger, extra, env = {}, slow = false, slowLedger = true }) {
  let release = () => {};
  const hold = slow ? new Promise((r) => { release = r; }) : null;
  const d = db({ site, policy, ledger, extra, hold, holdLedger: slowLedger });
  const handler = loadEdge(name, d.client, { env: { GEO_SIGNING_KEY: GEO_KEY, ...env }, flushWaitUntil: !slow });
  const pending = handler(await request());
  const answeredBeforeLog = slow ? (await answered(pending)) === 'answered' : true;
  release();
  const res = await pending;
  if (slow) await Promise.all(handler.waitUntilWork);
  const body = res.status === 200 && (res.headers.get('content-type') ?? '').includes('json') ? await res.json() : null;
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

// ---------- Off is read from the policy, and fails closed ----------
const statsInput = (over = {}) => () => ({ visitor: { country: 'SE', region: null, geoSource: 'ip' }, purpose: 'statistics',
  signals: { consent: { analytics: true, marketing: true }, evidence: 'ledger', gpc: false }, technique: { storage: 'none', identifiers: 'none' }, ...over });
const policyClient = (policy) => db({ site: null, policy }).client;
// A rule that already blocks statistics in every market: decide() then reports rule_blocked, not customer_off.
const BLOCKING = { version: 'test-blocking', rules: [{ ...PACK.rules[0], id: 'test.block', version: 1,
  markets: ['eu', 'uk', 'ch', 'us_ca', 'us_other', 'ca_qc', 'ca_other', 'br', 'other'], purposes: ['statistics'], outcome: 'blocked',
  relaxable: false, status: 'approved_internal', law: null, effectiveFrom: '2020-01-01',
  technique: { storage: 'persistent', identifiers: 'cross_site' }, approval: { approvedBy: 'test', approvedAt: '2026-11-01', reviewDue: '2027-01-31' } }] };

test('Off still drops in shadow when a market rule already blocks the purpose', async () => {
  resetPolicyCache();
  const off = jurisdictionGate(policyClient(tighten({ statistics: 'off' })), 'track-event', SITE, undefined);
  assert.equal(await off.gate(statsInput({ pack: BLOCKING })), true);
  resetPolicyCache();
  const noOff = jurisdictionGate(policyClient(tighten({ conversion: 'off' })), 'track-event', SITE, undefined);
  assert.equal(await noOff.gate(statsInput({ pack: BLOCKING })), false, 'a blocking rule alone stays shadow');
});

test('Off fails closed: decide() throwing on an Off purpose drops; other purposes and store-consent do not', async () => {
  const broken = { pack: { version: 'broken', rules: null } };
  resetPolicyCache();
  assert.equal(await jurisdictionGate(policyClient(tighten({ statistics: 'off' })), 'track-event', SITE, undefined).gate(statsInput(broken)), true);
  resetPolicyCache();
  assert.equal(await jurisdictionGate(policyClient(tighten({ conversion: 'off' })), 'track-event', SITE, undefined).gate(statsInput(broken)), false);
  resetPolicyCache();
  assert.equal(await jurisdictionGate(policyClient(tighten({ statistics: 'off' })), 'store-consent', SITE, undefined).gate(statsInput(broken)), false,
    'store-consent never drops');
});

// ---------- policy cache and timeout ----------
test('policy cache: two requests for the same site within the TTL load the policy once', async () => {
  const d = db({ site: AGG_SITE, policy: tighten({ statistics: 'opt_in' }) });
  const handler = loadEdge('aggregate-hit', d.client, { env: { GEO_SIGNING_KEY: GEO_KEY } });
  const req = async () => post('aggregate-hit', { siteId: SITE, kind: 'pageview', url: 'https://shop.test/' },
    { Authorization: `Bearer ${KEY}`, 'user-agent': CHROME, ...(await geoHeader('SE')) });
  assert.equal((await handler(await req())).status, 200);
  assert.equal((await handler(await req())).status, 200);
  assert.equal(named(d.rpcCalls, 'get_site_jurisdiction').length, 1);
  assert.equal(named(d.rpcCalls, 'ingest_aggregate_hit').length, 2);
});

test('policy cache: a failed load is not cached', async () => {
  resetPolicyCache();
  let calls = 0;
  const client = { rpc: async (name) => { if (name === 'get_site_jurisdiction') calls++; return { data: null, error: { message: 'down' } }; } };
  for (let i = 0; i < 2; i++) assert.equal(await jurisdictionGate(client, 'track-event', SITE, undefined).gate(statsInput()), false);
  assert.equal(calls, 2);
});

test('policy timeout: a hung policy RPC falls back to the safe default and the handler stores the hit', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    let called;
    const policyCalled = new Promise((r) => { called = r; });
    const d = db({ site: AGG_SITE });
    const rpc = d.client.rpc;
    d.client.rpc = (name, args) => {
      if (name !== 'get_site_jurisdiction') return rpc(name, args);
      d.rpcCalls.push({ name, args });
      called();
      return new Promise(() => {});
    };
    const handler = loadEdge('aggregate-hit', d.client, { env: { GEO_SIGNING_KEY: GEO_KEY } });
    const pending = handler(post('aggregate-hit', { siteId: SITE, kind: 'pageview', url: 'https://shop.test/' },
      { Authorization: `Bearer ${KEY}`, 'user-agent': CHROME }));
    await policyCalled;
    mock.timers.tick(POLICY_TIMEOUT_MS);
    const res = await pending;
    assert.deepEqual(await res.json(), { goals: [] });
    assert.equal(named(d.rpcCalls, 'ingest_aggregate_hit').length, 1, 'nothing dropped');
  } finally {
    mock.timers.reset();
  }
});

// ---------- collectors wired 2026-11-20 (runbook "Not yet wired") ----------
// Each: the customer's Off for its purpose drops without the flag and is logged as applied; opt_in is
// not applied; with no tighten the response does not wait for the ledger read or the decision log.
const rows = (d, table) => d.calls.filter((c) => c.table === table && (c.type === 'insert' || c.type === 'update'));
const appliedOff = (d, purpose) => {
  const [l] = logs(d.rpcCalls);
  assert.deepEqual([l.p_purpose, l.p_reason, l.p_enforced], [purpose, 'customer_off', true]);
};

// ai-search-tracker
const aiSearch = (opts) => run('ai-search-tracker', async () => post('ai-search-tracker',
  { siteId: SITE, sessionId: 's-1', aiPlatform: 'chatgpt', url: 'https://shop.test/?utm_source=chatgpt' }),
  { site: { id: SITE, is_active: true }, extra: (op) => (op.table === 'ai_search_traffic' && op.type === 'select' ? { data: null, error: null } : null), ...opts });

test('ai-search-tracker: customer Off for statistics drops without the flag; opt_in does not', async () => {
  const off = await aiSearch({ policy: tighten({ statistics: 'off' }) });
  assert.deepEqual(off.body, { success: true, skipped: 'jurisdiction' });
  assert.equal(rows(off.d, 'ai_search_traffic').length, 0);
  appliedOff(off.d, 'statistics');
  const optIn = await aiSearch({ policy: tighten({ statistics: 'opt_in' }) });
  assert.equal(optIn.body.action, 'session_created');
  assert.equal(logs(optIn.d.rpcCalls)[0].p_enforced, false);
});

test('ai-search-tracker: no tighten = answers before a slow ledger read and log', async () => {
  const { body, answeredBeforeLog } = await aiSearch({ slow: true });
  assert.equal(body.action, 'session_created');
  assert.equal(answeredBeforeLog, true);
});

// link-click-counter (aggregate counter, no session id: no ledger read)
const linkClick = (opts) => run('link-click-counter', async () => post('link-click-counter',
  { siteId: SITE, pagePath: '/', linkKind: 'link', linkKey: 'shop.test/a', linkLabel: 'A', deviceType: 'desktop' },
  { Authorization: `Bearer ${KEY}` }), { site: { id: SITE, is_active: true, tracking_id: KEY, user_id: OWNER }, ...opts });

test('link-click-counter: customer Off for statistics drops without the flag; opt_in does not', async () => {
  const off = await linkClick({ policy: tighten({ statistics: 'off' }) });
  assert.deepEqual(off.body, { ok: true, skipped: 'jurisdiction' });
  assert.equal(named(off.d.rpcCalls, 'increment_link_click').length, 0);
  appliedOff(off.d, 'statistics');
  const optIn = await linkClick({ policy: tighten({ statistics: 'opt_in' }) });
  assert.deepEqual(optIn.body, { ok: true });
  assert.equal(named(optIn.d.rpcCalls, 'increment_link_click').length, 1);
});

test('link-click-counter: no tighten = answers before a slow log', async () => {
  const { body, answeredBeforeLog } = await linkClick({ slow: true });
  assert.deepEqual(body, { ok: true });
  assert.equal(answeredBeforeLog, true);
});

// ecommerce-tracking
const ecommerce = (opts) => run('ecommerce-tracking', async () => post('ecommerce-tracking', {
  siteId: SITE, sessionId: 's-1', eventType: 'purchase', consentGranted: true, userId: 'u-1',
  transactionData: { id: 't-1', revenue: 100 },
}), { site: { id: SITE }, ...opts });

test('ecommerce-tracking: customer Off for statistics drops without the flag; opt_in does not', async () => {
  const off = await ecommerce({ policy: tighten({ statistics: 'off' }) });
  assert.deepEqual(off.body, { success: true, skipped: 'jurisdiction' });
  assert.equal(inserts(off.d, 'ecommerce_events').length, 0);
  assert.equal(named(off.d.rpcCalls, 'upsert_user_identity').length, 0);
  appliedOff(off.d, 'statistics');
  const optIn = await ecommerce({ policy: tighten({ statistics: 'opt_in' }) });
  assert.equal(optIn.body.success, true);
  assert.equal(inserts(optIn.d, 'ecommerce_events').length, 1);
});

// The consent-ledger read is on the response path here (consent comes from the ledger, fail closed),
// so only the decision log is held.
test('ecommerce-tracking: no tighten = answers before a slow log', async () => {
  const { body, answeredBeforeLog } = await ecommerce({ slow: true, slowLedger: false });
  assert.equal(body.success, true);
  assert.equal(answeredBeforeLog, true);
});

// canary-tracker (agent_measurement; the pixel answer never depends on the gate)
const canary = (opts) => run('canary-tracker', async () => new Request(`https://fn.test/canary-tracker/tok12345?s=${SITE}&v=px`,
  { headers: { 'user-agent': 'python-requests/2.31' } }), { site: { id: SITE }, ...opts });

test('canary-tracker: customer Off for agent_measurement drops the hit without the flag; the pixel is still served', async () => {
  const off = await canary({ policy: tighten({ agent_measurement: 'off' }) });
  assert.equal(off.res.headers.get('content-type'), 'image/gif');
  assert.equal(inserts(off.d, 'canary_hits').length, 0);
  appliedOff(off.d, 'agent_measurement');
  const optIn = await canary({ policy: tighten({ agent_measurement: 'opt_in' }) });
  assert.equal(inserts(optIn.d, 'canary_hits').length, 1);
});

// track-web-vitals (no caller in this repo; per-page-load id, no ledger read)
const webVitals = (opts) => run('track-web-vitals', async () => post('track-web-vitals', {
  tracking_id: KEY, session_id: 'p-1', metric_name: 'LCP', metric_value: 1200, metric_rating: 'good', page_url: 'https://shop.test/a',
}, { apikey: 'anon' }), { site: { id: SITE }, ...opts });

test('track-web-vitals: customer Off for statistics drops without the flag; opt_in does not', async () => {
  const off = await webVitals({ policy: tighten({ statistics: 'off' }) });
  assert.deepEqual(off.body, { success: true, skipped: 'jurisdiction' });
  assert.equal(off.d.calls.filter((c) => c.table === 'web_vitals').length, 0);
  appliedOff(off.d, 'statistics');
  const optIn = await webVitals({ policy: tighten({ statistics: 'opt_in' }) });
  assert.deepEqual(optIn.body, { success: true });
  assert.equal(optIn.d.calls.filter((c) => c.table === 'web_vitals' && c.type === 'upsert').length, 1);
});

test('track-web-vitals: no tighten = answers before a slow log', async () => {
  const { body, answeredBeforeLog } = await webVitals({ slow: true });
  assert.deepEqual(body, { success: true });
  assert.equal(answeredBeforeLog, true);
});

// pixel-tracking (first-party proxy path; the caller sets consent.analytics)
const pixel = (opts) => run('pixel-tracking', async () => post('pixel-tracking', {
  type: 'pageview', siteId: KEY, sessionId: 'sess_1_abc', consent: { analytics: true }, data: { url: 'https://shop.test/' },
}), { site: { id: SITE }, ...opts });

test('pixel-tracking: customer Off for statistics drops without the flag; opt_in does not', async () => {
  const off = await pixel({ policy: tighten({ statistics: 'off' }) });
  assert.deepEqual(off.body, { success: true, skipped: 'jurisdiction' });
  assert.equal(off.d.calls.some((c) => c.type !== 'select' && c.table !== 'cookie_consents'), false);
  appliedOff(off.d, 'statistics');
  const optIn = await pixel({ policy: tighten({ statistics: 'opt_in' }) });
  assert.deepEqual(optIn.body, { success: true });
  assert.equal(inserts(optIn.d, 'page_views').length, 1);
});

test('pixel-tracking: no tighten = answers before a slow ledger read and log', async () => {
  const { body, answeredBeforeLog } = await pixel({ slow: true });
  assert.deepEqual(body, { success: true });
  assert.equal(answeredBeforeLog, true);
});

// content-tracking (three POST collectors)
const content = (path, body, opts) => run('content-tracking', async () => post(`content-tracking/${path}`, body), { site: null, ...opts });
const INTERACTION = { site_id: SITE, session_id: 's-1', interaction: { element_id: 'e-1', page_url: '/', interaction_type: 'click', mouse_x: 1, mouse_y: 2 } };

test('content-tracking: customer Off for statistics drops every POST collector without the flag; opt_in does not', async () => {
  for (const [path, body] of [['element', { site_id: SITE, element: { element_id: 'e-1', element_type: 'a', element_selector: '#a', page_url: '/' } }],
    ['interaction', INTERACTION], ['scroll', { site_id: SITE, session_id: 's-1', page_url: '/', scroll_depth: 50 }]]) {
    const off = await content(path, body, { policy: tighten({ statistics: 'off' }) });
    assert.deepEqual(off.body, { success: true, skipped: 'jurisdiction' }, path);
    assert.equal(off.d.calls.some((c) => c.type !== 'select'), false, path);
    appliedOff(off.d, 'statistics');
    const optIn = await content(path, body, { policy: tighten({ statistics: 'opt_in' }) });
    assert.deepEqual(optIn.body, { success: true }, path);
    assert.equal(optIn.d.calls.some((c) => c.type !== 'select'), true, path);
  }
});

test('content-tracking: no tighten = answers before a slow ledger read and log', async () => {
  const { body, answeredBeforeLog } = await content('interaction', INTERACTION, { slow: true });
  assert.deepEqual(body, { success: true });
  assert.equal(answeredBeforeLog, true);
});

// media-analytics
const media = (opts) => run('media-analytics', async () => post('media-analytics/event',
  { site_id: SITE, session_id: 's-1', event: { media_id: 'm-1', media_type: 'video', event_type: 'play' } }), { site: null, ...opts });

test('media-analytics: customer Off for statistics drops without the flag; opt_in does not', async () => {
  const off = await media({ policy: tighten({ statistics: 'off' }) });
  assert.deepEqual(off.body, { success: true, skipped: 'jurisdiction' });
  assert.equal(inserts(off.d, 'media_events').length, 0);
  appliedOff(off.d, 'statistics');
  const optIn = await media({ policy: tighten({ statistics: 'opt_in' }) });
  assert.deepEqual(optIn.body, { success: true });
  assert.equal(inserts(optIn.d, 'media_events').length, 1);
});

test('media-analytics: no tighten = answers before a slow ledger read and log', async () => {
  const { body, answeredBeforeLog } = await media({ slow: true });
  assert.deepEqual(body, { success: true });
  assert.equal(answeredBeforeLog, true);
});

// cloudflare-ingest (Worker push; automated = agent_measurement, the anonymous human count = statistics)
const GPTBOT = 'Mozilla/5.0 (compatible; GPTBot/1.2)';
const cfIngest = (extraBody, opts) => run('cloudflare-ingest', async () => post('cloudflare-ingest',
  { domain: 'shop.test', urlPath: '/a', statusCode: 200, userAgent: GPTBOT, ...extraBody }, { 'x-ingest-key': 'test-value' }),
  { site: null, ...opts });
const cfWrites = (d) => d.calls.filter((c) => c.type === 'insert' && ['cloudflare_traffic', 'ai_bot_traffic'].includes(c.table));

test('cloudflare-ingest: customer Off drops by purpose without the flag; opt_in does not', async () => {
  const bot = await cfIngest({}, { policy: tighten({ agent_measurement: 'off' }) });
  assert.deepEqual(bot.body, { ok: true, skipped: 'jurisdiction' });
  assert.equal(cfWrites(bot.d).length, 0);
  appliedOff(bot.d, 'agent_measurement');
  // A human-looking request is statistics, so an agent_measurement Off leaves its anonymous count alone.
  const human = await cfIngest({ userAgent: CHROME }, { policy: tighten({ agent_measurement: 'off' }) });
  assert.equal(human.body.ok, true);
  assert.equal(inserts(human.d, 'cloudflare_traffic').length, 1);
  const humanOff = await cfIngest({ userAgent: CHROME }, { policy: tighten({ statistics: 'off' }) });
  assert.deepEqual(humanOff.body, { ok: true, skipped: 'jurisdiction' });
  appliedOff(humanOff.d, 'statistics');
  const optIn = await cfIngest({}, { policy: tighten({ agent_measurement: 'opt_in' }) });
  assert.equal(optIn.body.visitorType, 'ai_bot');
  assert.deepEqual(cfWrites(optIn.d).map((c) => c.table).sort(), ['ai_bot_traffic', 'cloudflare_traffic']);
});

test('cloudflare-ingest: a hit with gpc: true is never stored; its decision is logged with GPC', async () => {
  const { body, d } = await cfIngest({ gpc: true }, { policy: { profile: null, tighten: {}, exceptions: [], testSite: true } });
  assert.deepEqual(body, { ok: true, skipped: 'gpc' });
  assert.equal(cfWrites(d).length, 0);
  const [l] = logs(d.rpcCalls);
  assert.deepEqual([l.p_fn, l.p_purpose, l.p_reason], ['cloudflare-ingest', 'agent_measurement', 'gpc']);
  // gpc: 'true' (not a boolean) is no objection, as in server-hit.
  const str = await cfIngest({ gpc: 'true' }, {});
  assert.equal(cfWrites(str.d).length, 2);
});

test('cloudflare-ingest: no tighten = answers before a slow log', async () => {
  const { body, answeredBeforeLog } = await cfIngest({}, { slow: true });
  assert.equal(body.ok, true);
  assert.equal(answeredBeforeLog, true);
});

// import-server-logs (dashboard upload; humans only are aggregated = statistics)
const LOG_LINES = [
  JSON.stringify({ timestamp: '2026-11-19T10:00:00Z', ip: '85.1.2.3', method: 'GET', url: '/a', status: 200, user_agent: CHROME }),
  JSON.stringify({ timestamp: '2026-11-19T10:01:00Z', ip: '85.1.2.4', method: 'GET', url: '/b', status: 200, user_agent: CHROME, sec_gpc: '1' }),
  JSON.stringify({ timestamp: '2026-11-19T10:02:00Z', ip: '85.1.2.5', method: 'GET', url: '/c', status: 200, user_agent: CHROME, gpc: true }),
].join('\n');
const importLogs = (opts) => run('import-server-logs', async () => post('import-server-logs',
  { site_id: SITE, log_content: LOG_LINES, log_format: 'json' }, { Authorization: 'Bearer user-jwt' }), { site: { id: SITE }, ...opts });
const aggregated = (d) => named(d.rpcCalls, 'increment_server_log_analytics');

test('import-server-logs: customer Off for statistics drops the whole import without the flag; opt_in does not', async () => {
  const off = await importLogs({ policy: tighten({ statistics: 'off' }) });
  assert.deepEqual(off.body, { success: true, skipped: 'jurisdiction', stats: { total_lines: 3, processed_lines: 0, failed_lines: 0 } });
  assert.equal(aggregated(off.d).length, 0);
  assert.equal(inserts(off.d, 'server_log_imports').length, 0);
  appliedOff(off.d, 'statistics');
  const optIn = await importLogs({ policy: tighten({ statistics: 'opt_in' }) });
  assert.equal(optIn.body.success, true);
  assert.equal(aggregated(optIn.d).length, 1);
});

test('import-server-logs: lines with Sec-GPC are not aggregated; their decision is logged with GPC', async () => {
  const { body, d } = await importLogs({});
  assert.deepEqual(body.stats, { total_lines: 3, processed_lines: 3, failed_lines: 0, objected_lines: 2 });
  assert.deepEqual(aggregated(d).map((c) => c.args.p_url), ['/a']);
  const ls = logs(d.rpcCalls).map((l) => [l.p_fn, l.p_purpose, l.p_count]).sort();
  assert.deepEqual(ls, [['import-server-logs', 'statistics', 2], ['import-server-logs', 'statistics', 3]]);
});

test('canary-tracker: the pixel never waits for the gate', async () => {
  const { res, answeredBeforeLog } = await canary({ slow: true, policy: tighten({ agent_measurement: 'off' }) });
  assert.equal(res.headers.get('content-type'), 'image/gif');
  assert.equal(answeredBeforeLog, true);
});

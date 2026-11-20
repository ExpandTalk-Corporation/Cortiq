import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEdge, mockDatabase } from './edge-harness.mjs';
import { signGeo, GEO_HEADER } from '../../supabase/functions/_shared/geo-token.js';

const SITE = '11111111-1111-4111-8111-111111111111';
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const KEY = 'tk_' + 'a'.repeat(32);
const GEO_KEY = 'g'.repeat(32);
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36';
const TEST_SITE_POLICY = { profile: null, tighten: {}, exceptions: [], testSite: true };

function db({ site, policy = null, logError = null }) {
  const rpcCalls = [];
  const m = mockDatabase(
    (op) => (op.table === 'sites' ? { data: site, error: null } : { data: null, error: null }),
    async (name, args) => {
      rpcCalls.push({ name, args });
      if (name === 'get_site_jurisdiction') return { data: policy, error: null };
      if (name === 'log_jurisdiction_decision') return { data: null, error: logError };
      if (name === 'aggregate_daily_salt') return { data: 'f'.repeat(64), error: null };
      return { data: true, error: null };
    },
  );
  return { ...m, rpcCalls };
}
const logs = (rpcCalls) => rpcCalls.filter((c) => c.name === 'log_jurisdiction_decision').map((c) => c.args);
const named = (rpcCalls, n) => rpcCalls.filter((c) => c.name === n);
const geoHeader = async (country) => ({ [GEO_HEADER]: await signGeo({ country, region: null, ip: '203.0.113.9' }, GEO_KEY, Math.floor(Date.now() / 1000)) });

// ---------- aggregate-hit ----------
const AGG_SITE = { id: SITE, user_id: OWNER, is_active: true, domain: 'shop.test', aggregate_measurement: true, conversion_goals: [] };
async function agg({ env = {}, policy = null, headers = {}, logError = null, kind = 'pageview' } = {}) {
  const d = db({ site: AGG_SITE, policy, logError });
  const handler = loadEdge('aggregate-hit', d.client, { env: { GEO_SIGNING_KEY: GEO_KEY, ...env } });
  const res = await handler(new Request('https://fn.test/aggregate-hit', {
    method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'user-agent': CHROME, ...headers },
    body: JSON.stringify({ siteId: SITE, kind, url: 'https://shop.test/', ...(kind === 'goal' ? { formId: 'f' } : {}) }),
  }));
  return { res, body: res.status === 200 ? await res.json() : null, rpcCalls: d.rpcCalls };
}

test('aggregate-hit shadow: decision logged, ingest unchanged', async () => {
  const { body, rpcCalls } = await agg({ headers: await geoHeader('SE') });
  assert.deepEqual(body, { goals: [] });
  const [l] = logs(rpcCalls);
  assert.deepEqual([l.p_fn, l.p_purpose, l.p_country, l.p_enforced, l.p_outcome], ['aggregate-hit', 'statistics', 'SE', false, 'needs_opt_in']);
  assert.equal(named(rpcCalls, 'ingest_aggregate_hit').length, 1);
});

test('aggregate-hit enforce: unapproved rule = skipped jurisdiction, nothing ingested, no salt read', async () => {
  const { body, rpcCalls } = await agg({ env: { JURISDICTION_ENFORCE: 'aggregate-hit' }, headers: await geoHeader('SE') });
  assert.deepEqual(body, { skipped: 'jurisdiction' });
  assert.equal(named(rpcCalls, 'ingest_aggregate_hit').length, 0);
  assert.equal(named(rpcCalls, 'aggregate_daily_salt').length, 0);
  assert.equal(logs(rpcCalls)[0].p_enforced, true);
});

test('aggregate-hit enforce on an admin test site: reviewed_agent EU rule applies', async () => {
  const { body, rpcCalls } = await agg({ env: { JURISDICTION_ENFORCE: 'all' }, policy: TEST_SITE_POLICY, headers: await geoHeader('SE') });
  assert.deepEqual(body, { goals: [] });
  // No profile: markets = eu, uk, ca_qc, so the EU rule and the draft world rule both apply.
  assert.equal(logs(rpcCalls)[0].p_rule_id, 'eu.statistics.aggregate@1,world.statistics.aggregate@1');
  const goal = await agg({ env: { JURISDICTION_ENFORCE: 'all' }, policy: TEST_SITE_POLICY, headers: await geoHeader('SE'), kind: 'goal' });
  assert.equal(goal.res.status, 204);
  assert.equal(logs(goal.rpcCalls)[0].p_purpose, 'conversion');
});

test('aggregate-hit: GPC still skips with reason gpc, and the decision is logged with reason gpc', async () => {
  const { body, rpcCalls } = await agg({ policy: TEST_SITE_POLICY, headers: { ...(await geoHeader('SE')), 'sec-gpc': '1' } });
  assert.deepEqual(body, { skipped: 'gpc' });
  assert.equal(logs(rpcCalls)[0].p_reason, 'gpc');
  assert.equal(named(rpcCalls, 'ingest_aggregate_hit').length, 0);
});

test('aggregate-hit: GPC never uses up the rate limit; GPC with an unknown key is still 401', async () => {
  const { body, rpcCalls } = await agg({ headers: { ...(await geoHeader('SE')), 'sec-gpc': '1' } });
  assert.deepEqual(body, { skipped: 'gpc' });
  assert.equal(named(rpcCalls, 'check_rate_limit').length, 0);
  assert.equal(logs(rpcCalls).length, 1, 'the GPC decision is still logged');
  const plain = await agg({ headers: await geoHeader('SE') });
  assert.equal(named(plain.rpcCalls, 'check_rate_limit').length, 1);

  const unknown = mockDatabase(() => ({ data: null, error: null }), async () => ({ data: null, error: null }));
  const handler = loadEdge('aggregate-hit', unknown.client, { env: { GEO_SIGNING_KEY: GEO_KEY } });
  const res = await handler(new Request('https://fn.test/aggregate-hit', {
    method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'user-agent': CHROME, 'sec-gpc': '1' },
    body: JSON.stringify({ siteId: SITE, kind: 'pageview', url: 'https://shop.test/' }),
  }));
  assert.equal(res.status, 401);
});

test('shadow mode: the handler answers before a slow decision log finishes', async () => {
  let release;
  const slow = new Promise((r) => { release = r; });
  let logDone = false;
  const rpcCalls = [];
  const m = mockDatabase(
    (op) => (op.table === 'sites' ? { data: AGG_SITE, error: null } : { data: null, error: null }),
    async (name, args) => {
      rpcCalls.push({ name, args });
      if (name === 'log_jurisdiction_decision') { await slow; logDone = true; return { data: null, error: null }; }
      if (name === 'aggregate_daily_salt') return { data: 'f'.repeat(64), error: null };
      return { data: true, error: null };
    },
  );
  const handler = loadEdge('aggregate-hit', m.client, { env: { GEO_SIGNING_KEY: GEO_KEY }, flushWaitUntil: false });
  const res = await handler(new Request('https://fn.test/aggregate-hit', {
    method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'user-agent': CHROME, ...(await geoHeader('SE')) },
    body: JSON.stringify({ siteId: SITE, kind: 'pageview', url: 'https://shop.test/' }),
  }));
  assert.deepEqual(await res.json(), { goals: [] });
  assert.equal(logDone, false, 'the response did not wait for the log');
  assert.equal(named(rpcCalls, 'ingest_aggregate_hit').length, 1);
  assert.equal(handler.waitUntilWork.length, 1, 'the decision runs in EdgeRuntime.waitUntil');
  release();
  await Promise.all(handler.waitUntilWork);
  assert.equal(logDone, true);
  assert.equal(logs(rpcCalls)[0].p_enforced, false);
});

test('Review Focus 3: a failing decision log never fails ingest', async () => {
  const { body, rpcCalls } = await agg({ logError: { message: 'constraint' }, headers: await geoHeader('SE') });
  assert.deepEqual(body, { goals: [] });
  assert.equal(named(rpcCalls, 'ingest_aggregate_hit').length, 1);
});

// ---------- server-hit ----------
async function serverHit(env = {}) {
  const d = db({ site: { id: SITE, is_active: true, domain: 'https://www.shop.test/' } });
  const handler = loadEdge('server-hit', d.client, { env });
  const res = await handler(new Request('https://fn.test/server-hit', {
    method: 'POST', headers: { Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ hits: [
      { url: 'https://shop.test/a', userAgent: 'GPTBot/1.2', ip: '203.0.113.7', country: 'SE' },
      { url: 'https://shop.test/b', userAgent: 'ClaudeBot/1.0', country: 'US', region: 'CA' },
    ] }),
  }));
  return { body: await res.json(), d };
}

test('server-hit: one decision per batch, adapter geo is never logged as a country', async () => {
  const { body, d } = await serverHit();
  assert.equal(body.stored, 2);
  const ls = logs(d.rpcCalls);
  assert.equal(ls.length, 1);
  assert.deepEqual([ls[0].p_purpose, ls[0].p_country, ls[0].p_count], ['security', '', 2]);
  const enforced = await serverHit({ JURISDICTION_ENFORCE: 'server-hit' });
  assert.deepEqual(enforced.body, { accepted: 2, stored: 0, ignored: 0, rejected: 0, skipped: 'jurisdiction' });
  assert.equal(enforced.d.calls.some((c) => c.table === 'ai_bot_traffic' && c.type === 'insert'), false);
});

// ---------- ai-bot-tracker ----------
async function aiBot(env = {}) {
  const d = db({ site: { id: SITE, is_active: true, domain: 'shop.test', user_id: OWNER } });
  const handler = loadEdge('ai-bot-tracker', d.client, { env });
  const res = await handler(new Request('https://fn.test/ai-bot-tracker', {
    method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0 (compatible; GPTBot/1.2)' },
    body: JSON.stringify({ siteId: SITE, url: 'https://shop.test/', sessionId: 's-1' }),
  }));
  return { body: await res.json(), d };
}

test('ai-bot-tracker: security decision with tracker-gate evidence; enforce drops without writes', async () => {
  const shadow = await aiBot();
  const [l] = logs(shadow.d.rpcCalls);
  assert.deepEqual([l.p_fn, l.p_purpose, l.p_evidence], ['ai-bot-tracker', 'security', 'tracker_gate']);
  const enforced = await aiBot({ JURISDICTION_ENFORCE: 'ai-bot-tracker' });
  // Consent via tracker gate permits needs_opt_in, so enforcement keeps the row.
  assert.notEqual(enforced.body.skipped, 'jurisdiction');
});

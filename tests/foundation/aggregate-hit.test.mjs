// tests/foundation/aggregate-hit.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEdge, mockDatabase } from './edge-harness.mjs';

const SITE = '11111111-1111-4111-8111-111111111111';
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const KEY = 'tk_' + 'a'.repeat(32);
const ACCOUNT_KEY = 'acct_' + 'b'.repeat(32);
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36';
const GOALS = [
  { id: 'g-form', name: 'Demo form', type: 'form_submission', selector: '#demo-form', value: 100 },
  { id: 'g-thanks', name: 'Thank-you page', type: 'page_visit', selector: '/tack' },
  { id: 'g-click', name: 'Phone', type: 'phone_click', selector: 'a[href^=tel]' },
];

function setup({ site = { id: SITE, user_id: OWNER, is_active: true, domain: 'https://www.shop.test/', aggregate_measurement: true, conversion_goals: GOALS },
                 company = null, domainSiteId = null, rate = { data: true, error: null }, salt = { data: 'f'.repeat(64), error: null } } = {}) {
  const rpcCalls = [];
  const db = mockDatabase(
    (op) => {
      if (op.table === 'sites') {
        const byKey = op.filters.find(([k]) => k === 'tracking_id');
        if (byKey) return { data: byKey[1] === KEY ? site : null, error: null };
        const byId = op.filters.find(([k]) => k === 'id');
        return { data: byId && site && byId[1] === site.id ? site : null, error: null };
      }
      if (op.table === 'companies') return { data: company, error: null };
      return { data: null, error: null };
    },
    async (name, args) => {
      rpcCalls.push({ name, args });
      if (name === 'check_rate_limit') return rate;
      if (name === 'aggregate_daily_salt') return salt;
      if (name === 'resolve_site_by_domain') return { data: domainSiteId, error: null };
      return { data: true, error: null };
    },
  );
  return { ...db, rpcCalls, handler: loadEdge('aggregate-hit', db.client) };
}

const post = (body, { key = KEY, ua = CHROME, headers = {} } = {}) => new Request('https://fn.test/aggregate-hit', {
  method: 'POST',
  headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}), 'user-agent': ua, 'cf-connecting-ip': '203.0.113.9', ...headers },
  body: JSON.stringify(body),
});
const ingests = (rpcCalls) => rpcCalls.filter((c) => c.name === 'ingest_aggregate_hit').map((c) => c.args);

test('pageview: sanitized ingest, page-visit goal emitted, form goals returned without names', async () => {
  const { handler, rpcCalls } = setup();
  const res = await handler(post({ siteId: SITE, kind: 'pageview', url: 'https://www.shop.test/tack/?email=a@b.se#x',
    referrer: 'https://www.linkedin.com/feed/?trk=1', utm: { utm_source: 'linkedin', utm_medium: 'paid', utm_campaign: 'q4' } }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { goals: [{ id: 'g-form', selector: '#demo-form' }] });
  const [view, goal] = ingests(rpcCalls);
  assert.equal(view.p_kind, 'pageview');
  assert.equal(view.p_path, '/tack');
  assert.equal(view.p_referrer_domain, 'linkedin.com');
  assert.equal(view.p_utm_source, 'linkedin');
  assert.equal(view.p_device, 'desktop');
  assert.match(view.p_hash, /^[0-9a-f]{64}$/);
  assert.equal(goal.p_kind, 'goal');
  assert.equal(goal.p_goal_id, 'g-thanks');
  assert.equal(goal.p_goal_name, 'Thank-you page');
  // IP and UA never leave the function.
  const serialized = JSON.stringify(rpcCalls);
  assert.equal(serialized.includes('203.0.113.9'), false);
  assert.equal(serialized.includes('Chrome/130'), false);
});

test('form goal by id uses the configured name and value; unknown form falls back to content id', async () => {
  const { handler, rpcCalls } = setup();
  assert.equal((await handler(post({ siteId: SITE, kind: 'goal', url: 'https://shop.test/demo', goalId: 'g-form' }))).status, 204);
  assert.equal((await handler(post({ siteId: SITE, kind: 'goal', url: 'https://shop.test/demo', formId: 'contact', contentId: 'Contact form', value: 50 }))).status, 204);
  const [byId, fallback] = ingests(rpcCalls);
  assert.deepEqual([byId.p_goal_id, byId.p_goal_name, byId.p_value], ['g-form', 'Demo form', 100]);
  assert.deepEqual([fallback.p_goal_id, fallback.p_goal_name, fallback.p_value], ['form:contact', 'Contact form', 50]);
});

test('click goals are not accepted without consent', async () => {
  const { handler, rpcCalls } = setup();
  await handler(post({ siteId: SITE, kind: 'goal', url: 'https://shop.test/', goalId: 'g-click' }));
  assert.equal(ingests(rpcCalls)[0].p_goal_id, 'form:/');
});

test('skips: disabled site, GPC, bots and audit tools (Review Focus 4), rate limit, limiter error, salt error', async () => {
  const cases = [
    [setup({ site: { id: SITE, user_id: OWNER, is_active: true, domain: 'shop.test', aggregate_measurement: false, conversion_goals: [] } }), {}, 'disabled'],
    [setup(), { headers: { 'sec-gpc': '1' } }, 'gpc'],
    [setup(), { ua: 'Mozilla/5.0 (compatible; GPTBot/1.2)' }, 'bot'],
    [setup(), { ua: 'Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/130.0 Safari/537.36' }, 'bot'],
    [setup(), { ua: 'Mozilla/5.0 Chrome-Lighthouse' }, 'bot'],
    [setup(), { ua: '' }, 'bot'],
    [setup({ rate: { data: false, error: null } }), {}, 'rate_limited'],
    [setup({ rate: { data: null, error: { message: 'down' } } }), {}, 'unavailable'],
    [setup({ salt: { data: null, error: { message: 'down' } } }), {}, 'unavailable'],
  ];
  for (const [{ handler, rpcCalls }, opts, reason] of cases) {
    const res = await handler(post({ siteId: SITE, kind: 'pageview', url: 'https://shop.test/' }, opts));
    assert.equal(res.status, 200, reason);
    assert.deepEqual(await res.json(), { skipped: reason });
    assert.equal(ingests(rpcCalls).length, 0, reason);
  }
});

test('auth and validation: bad key 401, wrong siteId 401, foreign host 400, bad kind 400, big body 413', async () => {
  assert.equal((await setup().handler(post({ siteId: SITE, kind: 'pageview', url: 'https://shop.test/' }, { key: null }))).status, 401);
  assert.equal((await setup().handler(post({ siteId: 'other', kind: 'pageview', url: 'https://shop.test/' }))).status, 401);
  assert.equal((await setup().handler(post({ siteId: SITE, kind: 'pageview', url: 'https://evilshop.test/' }))).status, 400);
  assert.equal((await setup().handler(post({ siteId: SITE, kind: 'click', url: 'https://shop.test/' }))).status, 400);
  assert.equal((await setup().handler(post({ siteId: SITE, kind: 'pageview', url: 'javascript:alert(1)' }))).status, 400);
  const big = await setup().handler(post({ siteId: SITE, kind: 'pageview', url: 'https://shop.test/' }, { headers: { 'content-length': String(20 * 1024) } }));
  assert.equal(big.status, 413);
});

test('WordPress account key resolves the site by domain, incl. www (Review Focus 3)', async () => {
  const company = { id: OWNER, is_active: true };
  const ok = setup({ company, domainSiteId: SITE });
  const res = await ok.handler(post({ siteId: OWNER, kind: 'pageview', url: 'https://www.shop.test/' }, { key: ACCOUNT_KEY }));
  assert.equal(res.status, 200);
  assert.equal(ingests(ok.rpcCalls)[0].p_site_id, SITE);

  const foreign = setup({ company: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', is_active: true }, domainSiteId: SITE });
  const denied = await foreign.handler(post({ siteId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', kind: 'pageview', url: 'https://shop.test/' }, { key: ACCOUNT_KEY }));
  assert.equal(denied.status, 401);
});

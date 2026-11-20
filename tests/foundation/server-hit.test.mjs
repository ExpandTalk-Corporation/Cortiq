import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadEdge, mockDatabase } from './edge-harness.mjs';

const SITE = '11111111-1111-4111-8111-111111111111';
const KEY = 'tk_' + 'a'.repeat(32);

function setup({ site = { id: SITE, is_active: true, domain: 'https://www.shop.test/' }, rate = { data: true, error: null }, policy = null } = {}) {
  const rpcCalls = [];
  const db = mockDatabase(
    op => (op.table === 'sites' ? { data: site, error: null } : { data: null, error: null }),
    async (name, args) => {
      rpcCalls.push({ name, args });
      if (name === 'check_rate_limit') return rate;
      if (name === 'get_site_jurisdiction') return { data: policy, error: null };
      return { data: null, error: null };
    },
  );
  return { ...db, rpcCalls, handler: loadEdge('server-hit', db.client) };
}

const post = (hits, key = KEY, headers = {}) => new Request('https://fn.test/server-hit', {
  method: 'POST', headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}), ...headers }, body: JSON.stringify({ hits }),
});
const inserted = calls => calls.find(c => c.table === 'ai_bot_traffic' && c.type === 'insert')?.payload ?? [];

test('stores registry bots with signal, truncated IP, no query strings', async () => {
  const { handler, calls } = setup();
  const res = await handler(post([
    { url: 'https://shop.test/products?id=42&email=a@b.se', userAgent: 'Mozilla/5.0 (compatible; GPTBot/1.2)', ip: '203.0.113.77', referrer: 'https://ref.test/s?q=secret&token=abc' },
    { url: 'https://shop.test/robots.txt', userAgent: 'ClaudeBot/1.0', ip: '2001:db8:abcd:12::1' },
    { url: 'https://shop.test/llms.txt', userAgent: 'PerplexityBot/1.0' },
  ]));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { accepted: 3, stored: 3, ignored: 0, rejected: 0 });
  const rows = inserted(calls);
  assert.equal(rows[0].url, 'https://shop.test/products');
  assert.equal(rows[0].referrer, 'https://ref.test/s');
  assert.equal(rows[0].ip_address, '203.0.113.0');
  assert.equal(rows[0].request_type, 'training');
  assert.equal(rows[0].source, 'server_log');
  assert.equal(rows[0].server_signal, 'request');
  assert.equal(rows[0].js_executed, false);
  assert.equal(rows[1].server_signal, 'robots_txt');
  assert.equal(rows[1].ip_address, '2001:db8:abcd:0:0:0:0:0');
  assert.equal(rows[2].server_signal, 'llms_txt');
  assert.equal(rows[2].ip_address, null);
});

test('ignores humans and generic bots; honeypot visitors stored as unknown, not citation', async () => {
  const { handler, calls } = setup();
  const res = await handler(post([
    { url: 'https://shop.test/', userAgent: 'Mozilla/5.0 Firefox/130.0', ip: '198.51.100.9' },
    { url: 'https://shop.test/', userAgent: 'SomeRandomCrawler/1.0 bot' },
    { url: 'https://shop.test/cortiq-trap/', userAgent: 'Mozilla/5.0 Chrome/129.0' },
    { url: 'https://shop.test/cortiq-trap/', userAgent: 'SomeRandomCrawler/1.0 bot' },
  ]));
  assert.deepEqual(await res.json(), { accepted: 4, stored: 2, ignored: 2, rejected: 0 });
  const rows = inserted(calls);
  assert.ok(rows.every(r => r.server_signal === 'honeypot' && r.probe_triggered && r.request_type === 'unknown'));
  assert.equal(rows[0].bot_name, 'Honeypot visitor');
});

test('host must be the key\'s own domain or a subdomain (www, scheme, case, port ignored)', async () => {
  const { handler, calls } = setup();
  const res = await handler(post([
    { url: 'https://victim.test/', userAgent: 'GPTBot' },
    { url: 'https://shop.test.evil.test/', userAgent: 'GPTBot' },
    { url: 'https://evilshop.test/', userAgent: 'GPTBot' },
    { url: 'javascript:alert(1)', userAgent: 'GPTBot' },
    { url: 'https://SHOP.test:8443/a', userAgent: 'GPTBot' },
    { url: 'https://www.shop.test/b', userAgent: 'GPTBot' },
    { url: 'http://blog.shop.test/c', userAgent: 'GPTBot' },
  ]));
  assert.deepEqual(await res.json(), { accepted: 7, stored: 3, ignored: 0, rejected: 4 });
  assert.equal(inserted(calls).length, 3);
});

test('IDN domain stored as Unicode matches the punycode request host', async () => {
  const { handler } = setup({ site: { id: SITE, is_active: true, domain: 'båtguide.nu' } });
  const res = await handler(post([{ url: 'https://xn--btguide-exa.nu/', userAgent: 'GPTBot' }]));
  assert.equal((await res.json()).stored, 1);
});

test('auth: missing, malformed, unknown and inactive keys are refused without writes', async () => {
  for (const [key, site] of [[null, undefined], ['not-a-key', undefined], [KEY, null], [KEY, { id: SITE, is_active: false, domain: 'shop.test' }]]) {
    const { handler, calls } = setup(site === undefined ? {} : { site });
    const res = await handler(post([{ url: 'https://shop.test/', userAgent: 'GPTBot' }], key));
    assert.equal(res.status, 401, String(key));
    assert.equal(calls.some(c => c.type === 'insert'), false);
  }
});

test('rate limit: 429 when exceeded, 503 (fail closed) when the limiter errors', async () => {
  for (const [rate, status] of [[{ data: false, error: null }, 429], [{ data: null, error: { message: 'down' } }, 503]]) {
    const { handler, calls } = setup({ rate });
    const res = await handler(post([{ url: 'https://shop.test/', userAgent: 'GPTBot' }]));
    assert.equal(res.status, status);
    assert.equal(calls.some(c => c.type === 'insert'), false);
  }
});

test('caps a batch at 25 hits, rejects oversized bodies and host-spraying batches', async () => {
  const { handler } = setup();
  const hits = Array.from({ length: 40 }, (_, i) => ({ url: `https://shop.test/p${i}`, userAgent: 'GPTBot' }));
  assert.equal((await (await handler(post(hits))).json()).accepted, 25);

  const big = await setup().handler(post([{ url: 'https://shop.test/', userAgent: 'GPTBot' }], KEY, { 'content-length': String(70 * 1024) }));
  assert.equal(big.status, 413);

  const spray = ['a', 'b', 'c', 'd'].map(s => ({ url: `https://${s}.shop.test/`, userAgent: 'GPTBot' }));
  assert.equal((await setup().handler(post(spray))).status, 400);
});

test('older base64 site keys are accepted', async () => {
  const { handler } = setup();
  const res = await handler(post([{ url: 'https://shop.test/', userAgent: 'GPTBot' }], '7wU' + 'A'.repeat(40) + '='));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).stored, 1);
});

test('server-hit stores the adapter country (alpha-2) and US/CA region only', async () => {
  const { handler, calls } = setup();
  await handler(post([
    { url: 'https://www.shop.test/a', userAgent: 'Mozilla/5.0 (compatible; GPTBot/1.2)', country: 'us', region: 'ca' },
    { url: 'https://www.shop.test/b', userAgent: 'Mozilla/5.0 (compatible; GPTBot/1.2)', country: 'BR', region: 'SP' },
    { url: 'https://www.shop.test/c', userAgent: 'Mozilla/5.0 (compatible; GPTBot/1.2)', country: 'XX' },
  ]));
  assert.deepEqual(inserted(calls).map((r) => [r.country_code, r.region_code]), [['US', 'CA'], ['BR', null], [null, null]]);
});

test('Cloudflare adapter sends request.cf country and region', () => {
  const src = readFileSync('public/cloudflare-worker.js', 'utf8');
  assert.match(src, /country: request\.cf\?\.country \|\| undefined,/);
  assert.match(src, /region: request\.cf\?\.regionCode \|\| undefined,/);
});

test('honeypot hits from unclassified user agents keep no IP, UA, geo or referrer; registry agents unchanged', async () => {
  const { handler, calls } = setup();
  await handler(post([
    { url: 'https://shop.test/cortiq-trap/x', userAgent: 'Mozilla/5.0 Chrome/129.0', ip: '198.51.100.9', country: 'SE', referrer: 'https://shop.test/a' },
    { url: 'https://shop.test/cortiq-trap/x', userAgent: 'Mozilla/5.0 (compatible; GPTBot/1.2)', ip: '198.51.100.9', country: 'SE' },
  ]));
  const [unknown, gpt] = inserted(calls);
  assert.deepEqual([unknown.ip_address, unknown.user_agent, unknown.country_code, unknown.region_code, unknown.referrer], [null, null, null, null, null]);
  assert.deepEqual([unknown.server_signal, unknown.probe_triggered, unknown.bot_name], ['honeypot', true, 'Honeypot visitor']);
  assert.deepEqual([gpt.ip_address, gpt.user_agent, gpt.country_code], ['198.51.100.0', 'Mozilla/5.0 (compatible; GPTBot/1.2)', 'SE']);
});

test('objection: a hit with gpc: true is counted as ignored and never stored; its decision is logged with GPC', async () => {
  // A test site, so the draft server-log rule (allowed_unless_opt_out) decides and the reason shows GPC.
  const { handler, calls, rpcCalls } = setup({ policy: { profile: null, tighten: {}, exceptions: [], testSite: true } });
  const res = await handler(post([
    { url: 'https://shop.test/a', userAgent: 'GPTBot/1.2', gpc: true },
    { url: 'https://shop.test/b', userAgent: 'ClaudeBot/1.0', gpc: false },
    { url: 'https://shop.test/c', userAgent: 'ClaudeBot/1.0' },
    { url: 'https://shop.test/d', userAgent: 'ClaudeBot/1.0', gpc: 'true' },
  ]));
  assert.deepEqual(await res.json(), { accepted: 4, stored: 3, ignored: 1, rejected: 0 });
  assert.deepEqual(inserted(calls).map((r) => r.url), ['https://shop.test/b', 'https://shop.test/c', 'https://shop.test/d']);
  const ls = rpcCalls.filter((c) => c.name === 'log_jurisdiction_decision').map((c) => c.args);
  assert.deepEqual(ls.map((l) => [l.p_purpose, l.p_count, l.p_reason === 'gpc']).sort(), [['agent_measurement', 1, true], ['agent_measurement', 3, false]]);

  // Production policy (draft rule unusable): the objected hit is still never stored.
  const only = setup();
  const r2 = await only.handler(post([{ url: 'https://shop.test/a', userAgent: 'GPTBot/1.2', gpc: true }]));
  assert.deepEqual(await r2.json(), { accepted: 1, stored: 0, ignored: 1, rejected: 0 });
  assert.equal(inserted(only.calls).length, 0);
});

test('adapters forward Sec-GPC per hit', () => {
  assert.match(readFileSync('public/cortiq-server.mjs', 'utf8'), /gpc: header\(request\.headers, 'sec-gpc'\) === '1'/);
  assert.match(readFileSync('public/cloudflare-worker.js', 'utf8'), /gpc: request\.headers\.get\('sec-gpc'\) === '1'/);
  assert.match(readFileSync('public/cortiq-server-php.txt', 'utf8'), /'gpc'\s*=>\s*\( \$_SERVER\['HTTP_SEC_GPC'\] \?\? '' \) === '1'/);
  assert.match(readFileSync('wordpress-plugin/cortiq-analytics.php', 'utf8'), /'gpc'\s*=>\s*\( isset\( \$_SERVER\['HTTP_SEC_GPC'\] \)[^\n]*\) === '1'/);
});

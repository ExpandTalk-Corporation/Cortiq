import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEdge, mockDatabase } from './edge-harness.mjs';

const SITE = '11111111-1111-4111-8111-111111111111';
const KEY = 'tk_' + 'a'.repeat(32);

function setup({ site = { id: SITE, is_active: true, domain: 'https://www.shop.test/' }, rate = { data: true, error: null } } = {}) {
  const rpcCalls = [];
  const db = mockDatabase(
    op => (op.table === 'sites' ? { data: site, error: null } : { data: null, error: null }),
    async (name, args) => {
      rpcCalls.push({ name, args });
      if (name === 'check_rate_limit') return rate;
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

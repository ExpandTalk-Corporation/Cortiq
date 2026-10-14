import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEdge, mockDatabase } from './edge-harness.mjs';

const SITE = '11111111-1111-4111-8111-111111111111';
const KEY = 'tk_' + 'a'.repeat(32);

function setup({ site = { id: SITE, is_active: true }, domains = { 'https://shop.test': SITE }, rateOk = true } = {}) {
  const rpcCalls = [];
  const db = mockDatabase(
    op => (op.table === 'sites' ? { data: site, error: null } : { data: null, error: null }),
    async (name, args) => {
      rpcCalls.push({ name, args });
      if (name === 'check_rate_limit') return { data: rateOk, error: null };
      if (name === 'resolve_site_by_domain') return { data: domains[args.p_url] ?? null, error: null };
      return { data: null, error: null };
    },
  );
  return { ...db, rpcCalls, handler: loadEdge('server-hit', db.client) };
}

const post = (hits, key = KEY) => new Request('https://fn.test/server-hit', {
  method: 'POST', headers: key ? { Authorization: `Bearer ${key}` } : {}, body: JSON.stringify({ hits }),
});
const inserted = calls => calls.find(c => c.table === 'ai_bot_traffic' && c.type === 'insert')?.payload ?? [];

test('stores registry bots with signal, truncated IP and no query string', async () => {
  const { handler, calls } = setup();
  const res = await handler(post([
    { url: 'https://shop.test/products?id=42&email=a@b.se', userAgent: 'Mozilla/5.0 (compatible; GPTBot/1.2)', ip: '203.0.113.77' },
    { url: 'https://shop.test/robots.txt', userAgent: 'ClaudeBot/1.0', ip: '2001:db8:abcd:12::1' },
    { url: 'https://shop.test/llms.txt', userAgent: 'PerplexityBot/1.0' },
  ]));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { accepted: 3, stored: 3, ignored: 0, rejected: 0 });
  const rows = inserted(calls);
  assert.equal(rows[0].url, 'https://shop.test/products');
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

test('ignores human requests and generic bots, stores any honeypot visitor', async () => {
  const { handler, calls } = setup();
  const res = await handler(post([
    { url: 'https://shop.test/', userAgent: 'Mozilla/5.0 Firefox/130.0', ip: '198.51.100.9' },
    { url: 'https://shop.test/', userAgent: 'SomeRandomCrawler/1.0 bot' },
    { url: 'https://shop.test/cortiq-trap/', userAgent: 'Mozilla/5.0 Chrome/129.0' },
  ]));
  assert.deepEqual(await res.json(), { accepted: 3, stored: 1, ignored: 2, rejected: 0 });
  const [row] = inserted(calls);
  assert.equal(row.server_signal, 'honeypot');
  assert.equal(row.probe_triggered, true);
  assert.equal(row.bot_name, 'Honeypot visitor');
  assert.equal(row.request_type, 'unknown');
});

test('rejects hits for hosts that do not belong to the key\'s site', async () => {
  const { handler, calls } = setup({ domains: { 'https://shop.test': SITE, 'https://victim.test': '99999999-9999-4999-8999-999999999999' } });
  const res = await handler(post([
    { url: 'https://victim.test/', userAgent: 'GPTBot' },
    { url: 'https://unknown.test/', userAgent: 'GPTBot' },
    { url: 'javascript:alert(1)', userAgent: 'GPTBot' },
    { url: 'https://shop.test/a', userAgent: 'GPTBot' },
  ]));
  assert.deepEqual(await res.json(), { accepted: 4, stored: 1, ignored: 0, rejected: 3 });
  assert.equal(inserted(calls).length, 1);
});

test('auth: missing, malformed and unknown keys are refused without writes', async () => {
  for (const [key, site] of [[null, undefined], ['not-a-key', undefined], [KEY, null], [KEY, { id: SITE, is_active: false }]]) {
    const { handler, calls } = setup(site === undefined ? {} : { site });
    const res = await handler(post([{ url: 'https://shop.test/', userAgent: 'GPTBot' }], key));
    assert.equal(res.status, 401, String(key));
    assert.equal(calls.some(c => c.type === 'insert'), false);
  }
});

test('rate limit returns 429 before any write', async () => {
  const { handler, calls } = setup({ rateOk: false });
  const res = await handler(post([{ url: 'https://shop.test/', userAgent: 'GPTBot' }]));
  assert.equal(res.status, 429);
  assert.equal(calls.some(c => c.type === 'insert'), false);
});

test('caps a batch at 100 hits and resolves the host once', async () => {
  const { handler, rpcCalls } = setup();
  const hits = Array.from({ length: 150 }, (_, i) => ({ url: `https://shop.test/p${i}`, userAgent: 'GPTBot' }));
  const res = await handler(post(hits));
  assert.equal((await res.json()).accepted, 100);
  assert.equal(rpcCalls.filter(c => c.name === 'resolve_site_by_domain').length, 1);
});

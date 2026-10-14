import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';

const read = rel => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
const mod = await import(new URL('../../public/cortiq-server.mjs', import.meta.url));
const { createCortiq, cortiqExpress, truncateIp, AGENT_UA, TRAP_PATH } = mod;

const KEY = 'tk_' + 'b'.repeat(32);

// ── pre-filter stays in sync with the registry and across adapters ──────────────

test('AGENT_UA pre-filter covers every bot in the canonical registry', () => {
  const names = [...read('supabase/functions/_shared/ai-bot-registry.ts').matchAll(/name:\s*'([^']+)'/g)].map(m => m[1]);
  assert.ok(names.length > 20, 'registry parsed');
  for (const name of names) assert.match(name, AGENT_UA, `${name} would never reach server-hit`);
});

test('worker and WordPress plugin use the same pre-filter and trap path', () => {
  const src = AGENT_UA.source;
  const worker = read('public/cloudflare-worker.js').match(/const AGENT_UA = \/(.+)\/i;/)[1];
  const php = read('wordpress-plugin/cortiq-analytics.php').match(/define\( 'CORTIQ_AGENT_UA',\s*'\/(.+)\/i' \);/)[1];
  assert.equal(worker, src);
  assert.equal(php, src);
  assert.match(read('public/cloudflare-worker.js'), new RegExp(`TRAP_PATH = '${TRAP_PATH}'`));
  assert.match(read('wordpress-plugin/cortiq-analytics.php'), new RegExp(`'CORTIQ_TRAP_PATH',\\s*'${TRAP_PATH}'`));
});

test('ordinary browsers are not matched by the pre-filter', () => {
  for (const ua of [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0',
  ]) assert.doesNotMatch(ua, AGENT_UA);
});

// ── cortiq-server.mjs ───────────────────────────────────────────────────────────

test('truncateIp keeps only the network part', () => {
  assert.equal(truncateIp('203.0.113.77'), '203.0.113.0');
  assert.equal(truncateIp('203.0.113.77, 10.0.0.1'), '203.0.113.0');
  assert.equal(truncateIp('::ffff:203.0.113.77'), '203.0.113.0');
  assert.equal(truncateIp('2001:db8:abcd:12::1'), '2001:db8:abcd::');
  assert.equal(truncateIp('garbage'), null);
  assert.equal(truncateIp(null), null);
});

function capture() {
  const sent = [];
  const fetchImpl = async (url, init) => { sent.push({ url, init, body: JSON.parse(init.body) }); return new Response('{}'); };
  return { sent, fetchImpl };
}
const req = (url, ua, headers = {}) => new Request(url, { headers: { 'user-agent': ua, ...headers } });

test('reports agents with truncated IP and no query string; ignores humans', async () => {
  const { sent, fetchImpl } = capture();
  const c = createCortiq({ siteKey: KEY, fetchImpl });
  const pending = [];
  await c.report(req('https://shop.test/p?id=1&email=x@y.se', 'Mozilla/5.0 (compatible; GPTBot/1.2)', { 'x-forwarded-for': '198.51.100.23, 10.0.0.1', referer: 'https://ref.test/' }), { status: 200, waitUntil: p => pending.push(p) });
  await c.report(req('https://shop.test/', 'Mozilla/5.0 Firefox/130.0', { 'x-forwarded-for': '198.51.100.24' }));
  assert.equal(pending.length, 1, 'waitUntil receives the pending report');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].init.headers.Authorization, `Bearer ${KEY}`);
  assert.deepEqual(sent[0].body.hits[0], {
    url: 'https://shop.test/p', method: 'GET', status: 200,
    userAgent: 'Mozilla/5.0 (compatible; GPTBot/1.2)', referrer: 'https://ref.test/', ip: '198.51.100.0',
  });
});

test('robots.txt / llms.txt are reported for any user agent', async () => {
  const { sent, fetchImpl } = capture();
  const c = createCortiq({ siteKey: KEY, fetchImpl });
  await c.report(req('https://shop.test/robots.txt', 'Mozilla/5.0 Firefox/130.0'));
  await c.report(req('https://shop.test/llms.txt', ''));
  assert.equal(sent.length, 2);
});

test('trap: 404 + noindex, and the hit is reported', async () => {
  const { sent, fetchImpl } = capture();
  const c = createCortiq({ siteKey: KEY, fetchImpl });
  const r = req(`https://shop.test${TRAP_PATH}`, 'Mozilla/5.0 Chrome/129.0');
  assert.equal(c.isTrap(r), true);
  const res = c.trapResponse(r);
  assert.equal(res.status, 404);
  assert.match(res.headers.get('x-robots-tag'), /noindex/);
  await new Promise(r => setImmediate(r));
  assert.equal(sent[0].body.hits[0].status, 404);
});

test('without a tk_ key nothing is sent and errors never throw', async () => {
  const { sent, fetchImpl } = capture();
  await createCortiq({ siteKey: '', fetchImpl }).report(req('https://shop.test/', 'GPTBot'));
  assert.equal(sent.length, 0);
  const failing = createCortiq({ siteKey: KEY, fetchImpl: async () => { throw new Error('down'); } });
  await failing.report(req('https://shop.test/', 'GPTBot'));
});

test('Express middleware: socket IP when no proxy headers, reports after finish', async () => {
  const { sent, fetchImpl } = capture();
  const mw = cortiqExpress(createCortiq({ siteKey: KEY, fetchImpl }));
  const res = Object.assign(new EventEmitter(), { statusCode: 200, setHeader() {}, end() {} });
  let nexted = false;
  mw({ method: 'GET', originalUrl: '/a?q=1', headers: { host: 'shop.test', 'user-agent': 'ClaudeBot/1.0' }, socket: { remoteAddress: '203.0.113.5' } }, res, () => { nexted = true; });
  assert.ok(nexted);
  res.emit('finish');
  await new Promise(r => setImmediate(r));
  assert.equal(sent[0].body.hits[0].url, 'http://shop.test/a');
  assert.equal(sent[0].body.hits[0].ip, '203.0.113.0');
});

test('Express middleware answers the trap itself', async () => {
  const { sent, fetchImpl } = capture();
  const mw = cortiqExpress(createCortiq({ siteKey: KEY, fetchImpl }));
  let ended = false;
  const res = Object.assign(new EventEmitter(), { statusCode: 200, setHeader() {}, end() { ended = true; } });
  mw({ method: 'GET', url: TRAP_PATH, headers: { host: 'shop.test', 'x-forwarded-proto': 'https', 'x-forwarded-for': '198.51.100.1' } }, res, () => assert.fail('next called'));
  assert.ok(ended);
  assert.equal(res.statusCode, 404);
  await new Promise(r => setImmediate(r));
  assert.equal(sent[0].body.hits[0].url, `https://shop.test${TRAP_PATH}`);
});

// ── Cloudflare Worker ───────────────────────────────────────────────────────────

async function loadWorker(origin) {
  const src = read('public/cloudflare-worker.js').replace('export default', 'globalThis.__worker =');
  const sent = [];
  const globals = {
    fetch: async (input, init) => {
      if (init && init.method === 'POST') { sent.push(JSON.parse(init.body)); return new Response('{}'); }
      return origin(input);
    },
    HTMLRewriter: class {
      on(_sel, handler) { this.handler = handler; return this; }
      // Real HTMLRewriter streams; resolving to a Response is enough here because the
      // worker returns the transformed value straight from its async fetch handler.
      transform(res) {
        const { handler } = this;
        return res.text().then(html => {
          handler.element({ append: s => { html = html.replace('</body>', s + '</body>'); } });
          return new Response(html, res);
        });
      }
    },
  };
  const fn = new Function('fetch', 'HTMLRewriter', 'globalThis', src + '; return globalThis.__worker;');
  const worker = fn(globals.fetch, globals.HTMLRewriter, {});
  const waits = [];
  const run = async (url, ua, headers = {}) => {
    const res = await worker.fetch(new Request(url, { headers: { 'User-Agent': ua, ...headers } }), { CORTIQ_SITE_KEY: KEY }, { waitUntil: p => waits.push(p) });
    await Promise.all(waits);
    return res;
  };
  return { run, sent };
}

test('worker: reports GPTBot, not humans; truncates CF-Connecting-IP', async () => {
  const w = await loadWorker(() => new Response('<html><body>hi</body></html>', { headers: { 'Content-Type': 'text/html' } }));
  await w.run('https://shop.test/page?x=1', 'GPTBot/1.2', { 'CF-Connecting-IP': '203.0.113.9' });
  await w.run('https://shop.test/page', 'Mozilla/5.0 Firefox/130.0', { 'CF-Connecting-IP': '203.0.113.10' });
  assert.equal(w.sent.length, 1);
  assert.equal(w.sent[0].hits[0].url, 'https://shop.test/page');
  assert.equal(w.sent[0].hits[0].ip, '203.0.113.0');
});

test('worker: injects honeypot into HTML, Disallow into robots.txt, answers the trap', async () => {
  const w = await loadWorker(input => {
    const u = new URL(input.url);
    if (u.pathname === '/robots.txt') return new Response('User-agent: *\nAllow: /\n', { headers: { 'Content-Type': 'text/plain' } });
    return new Response('<html><body>hi</body></html>', { headers: { 'Content-Type': 'text/html' } });
  });
  const html = await (await w.run('https://shop.test/', 'Mozilla/5.0 Firefox/130.0')).text();
  assert.match(html, new RegExp(`href="${TRAP_PATH}"`));
  const robots = await (await w.run('https://shop.test/robots.txt', 'Mozilla/5.0 Firefox/130.0')).text();
  assert.match(robots, new RegExp(`Disallow: ${TRAP_PATH}`));
  const trap = await w.run(`https://shop.test${TRAP_PATH}`, 'Mozilla/5.0 Chrome/129.0');
  assert.equal(trap.status, 404);
  assert.equal(w.sent.filter(b => b.hits[0].url.endsWith(TRAP_PATH)).length, 1);
});

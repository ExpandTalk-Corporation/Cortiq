// tests/foundation/geo-edge-worker.test.mjs
// Spec 2026-11-18 phase 2: the Worker signs Cloudflare geo for allowlisted ingest functions only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { ALLOWED_FUNCTIONS } from '../../workers/geo-edge/src/index.js';
import { verifyGeo, GEO_HEADER } from '../../supabase/functions/_shared/geo-token.js';

const env = { SUPABASE_URL: 'https://proj.supabase.co', GEO_SIGNING_KEY: 'k'.repeat(32) };

function call(path, { cf = { country: 'US', regionCode: 'CA' }, headers = {}, method = 'POST', upstream } = {}) {
  const seen = [];
  globalThis.fetch = async (r) => {
    seen.push(r);
    if (upstream) return upstream(r);
    return new Response('{"ok":true}', { status: 200, headers: { 'access-control-allow-origin': '*' } });
  };
  const req = new Request(`https://geo.test${path}`, {
    method, headers: { 'cf-connecting-ip': '203.0.113.5', 'content-type': 'application/json', ...headers },
    body: method === 'POST' ? '{"a":1}' : undefined,
  });
  Object.defineProperty(req, 'cf', { value: cf });
  return worker.fetch(req, env).then((res) => ({ res, seen }));
}

test('allowlist covers browser ingest, not server-to-server or dashboard functions', () => {
  for (const fn of ['track-event', 'visitor-identification', 'record-conversion', 'link-click-counter', 'ecommerce-tracking',
                    'ai-search-tracker', 'ai-bot-tracker', 'canary-tracker', 'store-consent', 'aggregate-hit', 'geo-check']) {
    assert.ok(ALLOWED_FUNCTIONS.has(fn), fn);
  }
  for (const fn of ['server-hit', 'cloudflare-ingest', 'public-api', 'mcp-server', 'csp-report']) assert.ok(!ALLOWED_FUNCTIONS.has(fn), fn);
});

test('proxies to the function with a fresh signed token, body and query kept', async () => {
  const { res, seen } = await call('/track-event?x=1');
  assert.equal(res.status, 200);
  assert.equal(seen[0].url, 'https://proj.supabase.co/functions/v1/track-event?x=1');
  assert.equal(await seen[0].text(), '{"a":1}');
  const claims = await verifyGeo(seen[0].headers.get(GEO_HEADER), env.GEO_SIGNING_KEY, Math.floor(Date.now() / 1000));
  assert.deepEqual([claims.c, claims.r, claims.ip], ['US', 'CA', '203.0.113.5']);
});

test('client header stripped: a forged token never reaches Supabase', async () => {
  const { seen } = await call('/store-consent', { headers: { [GEO_HEADER]: 'v1.forged.sig' } });
  assert.notEqual(seen[0].headers.get(GEO_HEADER), 'v1.forged.sig');
  assert.ok(await verifyGeo(seen[0].headers.get(GEO_HEADER), env.GEO_SIGNING_KEY, Math.floor(Date.now() / 1000)));
});

test('region only US/CA', async () => {
  const { seen } = await call('/aggregate-hit', { cf: { country: 'BR', regionCode: 'SP' } });
  const claims = await verifyGeo(seen[0].headers.get(GEO_HEADER), env.GEO_SIGNING_KEY, Math.floor(Date.now() / 1000));
  assert.deepEqual([claims.c, claims.r], ['BR', null]);
});

test('sub-paths (canary-tracker/<type>) and OPTIONS preflight pass through', async () => {
  const { seen } = await call('/canary-tracker/pixel', { method: 'GET' });
  assert.equal(seen[0].url, 'https://proj.supabase.co/functions/v1/canary-tracker/pixel');
  const pre = await call('/track-event', { method: 'OPTIONS' });
  assert.equal(pre.seen[0].method, 'OPTIONS');
});

test('unknown function → 404, nothing fetched', async () => {
  const { res, seen } = await call('/server-hit');
  assert.equal(res.status, 404);
  assert.equal(seen.length, 0);
});

test('upstream unreachable → 502 with the proxy-error header the tracker reads', async () => {
  const { res } = await call('/track-event', { upstream: () => { throw new TypeError('network'); } });
  assert.equal(res.status, 502);
  assert.equal(res.headers.get('x-cortiq-geo-proxy'), 'error');
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  assert.match(res.headers.get('access-control-expose-headers'), /x-cortiq-geo-proxy/);
});

test('missing signing key → proxied without a token (functions fall back to time zone)', async () => {
  globalThis.fetch = async (r) => new Response('ok', { status: 200, headers: { seen: r.headers.has(GEO_HEADER) ? '1' : '0' } });
  const req = new Request('https://geo.test/track-event', { method: 'POST', body: '{}' });
  Object.defineProperty(req, 'cf', { value: { country: 'SE' } });
  const res = await worker.fetch(req, { SUPABASE_URL: env.SUPABASE_URL });
  assert.equal(res.headers.get('seen'), '0');
});

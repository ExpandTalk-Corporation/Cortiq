// tests/foundation/geo-endpoint-fallback.test.mjs
// Spec 2026-11-18 phase 2: scripts call the geo Worker and fall back to direct Supabase when it
// fails (quota, ad blocker, CSP, outage), without losing the request.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const ENDPOINT = readFileSync('workers/geo-edge/ENDPOINT', 'utf8');
const DIRECT = 'https://cxmkdtgfocgbfizawlwa.supabase.co/functions/v1';
const tracker = readFileSync('public/spa-tracking.js', 'utf8');
const banner = readFileSync('public/consent-banner.js', 'utf8');
const beacon = readFileSync('src/lib/aggregate-beacon.js', 'utf8');
const plugin = readFileSync('wordpress-plugin/cortiq-analytics.php', 'utf8');

test('the built-in Worker URL matches the deployed endpoint everywhere', () => {
  assert.match(ENDPOINT, /^https:\/\/[a-z0-9.-]+$/);
  for (const [name, src] of [['tracker', tracker], ['banner', banner], ['beacon', beacon]]) {
    assert.ok(src.includes(`'${ENDPOINT}'`), name);
  }
  assert.match(plugin, new RegExp(`define\\( 'CORTIQ_GEO_API',\\s+'${ENDPOINT.replace(/\./g, '\\.')}' \\);`));
  assert.match(readFileSync('public/.htaccess', 'utf8'), new RegExp(`connect-src [^;]*${ENDPOINT.replace(/\./g, '\\.')}`));
});

test('tracker: no raw fetch to API_URL is left; everything goes through apiFetch', () => {
  assert.doesNotMatch(tracker, /fetch\(\s*`\$\{API_URL\}/);
  assert.doesNotMatch(tracker, /fetch\(\s*API_URL\s*\+/);
  assert.match(tracker, /function apiFetch\(path, init\)/);
});

// Run the tracker's routing helpers in isolation.
function routing(config, fetchImpl) {
  const start = tracker.indexOf('// --- API routing');
  const end = tracker.indexOf('// --- end API routing');
  const code = tracker.slice(start, end) + '\n;({ apiFetch, base: () => API_URL });';
  return runInNewContext(code, { config, fetch: fetchImpl, Promise });
}
const ok = (headers = {}) => Promise.resolve(new Response('{}', { status: 200, headers }));

test('default: Worker first', async () => {
  const urls = [];
  const r = routing({}, (u) => { urls.push(u); return ok(); });
  await r.apiFetch('/track-event', {});
  assert.deepEqual(urls, [`${ENDPOINT}/track-event`]);
});

test('reject → direct, and direct stays for the page load', async () => {
  const urls = [];
  const r = routing({}, (u) => { urls.push(u); return u.startsWith(ENDPOINT) ? Promise.reject(new TypeError('blocked')) : ok(); });
  await r.apiFetch('/track-event', {});
  await r.apiFetch('/record-conversion', {});
  assert.deepEqual(urls, [`${ENDPOINT}/track-event`, `${DIRECT}/track-event`, `${DIRECT}/record-conversion`]);
});

test('proxy error header → direct', async () => {
  const urls = [];
  const r = routing({}, (u) => { urls.push(u); return u.startsWith(ENDPOINT) ? ok({ 'x-cortiq-geo-proxy': 'error' }) : ok(); });
  await r.apiFetch('/store-consent', {});
  assert.deepEqual(urls, [`${ENDPOINT}/store-consent`, `${DIRECT}/store-consent`]);
});

test('function 500 → no retry (would duplicate the event)', async () => {
  const urls = [];
  const r = routing({}, (u) => { urls.push(u); return Promise.resolve(new Response('x', { status: 500 })); });
  const res = await r.apiFetch('/track-event', {});
  assert.equal(res.status, 500);
  assert.equal(urls.length, 1);
});

test('own apiUrl proxy or geoUrl:false → never the Worker', async () => {
  for (const config of [{ apiUrl: 'https://proxy.example/fn' }, { geoUrl: false }]) {
    const urls = [];
    const r = routing(config, (u) => { urls.push(u); return ok(); });
    await r.apiFetch('/track-event', {});
    assert.ok(!urls[0].startsWith(ENDPOINT), JSON.stringify(config));
  }
});

test('banner and beacon use the same rule and fallback', () => {
  for (const src of [banner, beacon]) {
    assert.match(src, /x-cortiq-geo-proxy/);
    assert.match(src, /geoUrl/);
  }
  assert.match(plugin, /CQ_GEO\s*=/);
  assert.match(plugin, /x-cortiq-geo-proxy/);
});

// Legal review 2026-11 point 4a: the direct supabase.co host can set __cf_bm, which browsers only
// store for credentialed requests. No CortIQ call may send credentials, and sendBeacon (always
// credentialed, and blind to a blocked Worker) is not used.
test('credentials omitted on every call, Worker and direct fallback alike', async () => {
  const seen = [];
  const r = routing({}, (url, init) => { seen.push(init.credentials); return seen.length === 1 ? Promise.reject(new TypeError('blocked')) : ok(); });
  await r.apiFetch('/ai-bot-tracker', { method: 'POST', body: '{}', keepalive: true });
  assert.deepEqual(seen, ['omit', 'omit']);
});

test('no sendBeacon in the tracker; banner, beacon and WP banner omit credentials', () => {
  assert.doesNotMatch(tracker, /navigator.sendBeacon/);
  assert.match(banner, /credentials: 'omit'/);
  assert.match(beacon, /credentials: 'omit'/);
  assert.match(plugin, /function cqFetch\(path, init\)\{\n\s+init = Object\.assign\(\{\}, init, \{ credentials: 'omit' \}\);/);
});

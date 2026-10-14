import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';

// INTEGRATION-GUIDE/README historically documented a single script tag with
// data-site-id. The tracker must honour it; a tag's own attributes win over a global config.

const script = readFileSync(new URL('../../public/spa-tracking.js', import.meta.url), 'utf8');
const settle = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); };

function run({ attrs = {}, cortiqConfig } = {}) {
  const requests = [];
  const errors = [];
  const listeners = new Map();
  const surface = () => ({
    addEventListener(name, handler) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(handler); },
    removeEventListener(name, handler) { listeners.get(name)?.delete(handler); },
    dispatchEvent(event) { for (const handler of [...(listeners.get(event.type) || [])]) handler(event); },
  });
  const window = Object.assign(surface(), {
    ...(cortiqConfig && { cortiqConfig }),
    location: { href: 'https://site.test/', origin: 'https://site.test', pathname: '/', search: '' },
    innerWidth: 1200, innerHeight: 800, scrollY: 0,
  });
  const document = Object.assign(surface(), {
    readyState: 'complete', referrer: '', title: 'Start', documentElement: { scrollHeight: 4000 },
    currentScript: { getAttribute: name => attrs[name] ?? null },
    createElement: () => ({ getContext: () => null }),
  });
  runInNewContext(script, {
    window, document, history: { pushState() {}, replaceState() {} }, crypto: webcrypto, URL, URLSearchParams, TextEncoder,
    screen: { width: 1200, height: 800 }, navigator: { userAgent: 'Mozilla/5.0 Firefox/130.0', language: 'sv' },
    localStorage: { getItem: () => null }, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    console: { log() {}, warn() {}, error: (...a) => errors.push(a.join(' ')) },
    setTimeout: () => 0, setInterval: () => 0, clearInterval() {}, requestAnimationFrame: fn => fn(),
    fetch: async (url, options) => { requests.push({ url, body: JSON.parse(options.body) }); return { ok: true, json: async () => ({ success: true }) }; },
  });
  window.dispatchEvent({ type: 'siteConsentUpdated', detail: { analytics: true, marketing: false } });
  return { requests, errors };
}

test('single-tag install with data-site-id tracks after consent', async () => {
  const r = run({ attrs: { 'data-site-id': 'site-attr', 'data-api-key': 'key-attr', 'data-cookieless': 'true', 'data-api-url': 'https://api.test/v1' } });
  await settle();
  assert.deepEqual(r.errors.filter(e => e.includes('Missing siteId')), []);
  const pv = r.requests.find(x => x.url === 'https://api.test/v1/track-event');
  assert.ok(pv, 'page view sent to the data-api-url endpoint');
  assert.equal(pv.body.siteId ?? pv.body.site_id, 'site-attr');
  // cookieless from the attribute: no visitor identification call
  assert.equal(r.requests.some(x => x.url.endsWith('/visitor-identification')), false);
});

test('data-* on the tag win over a global cortiqConfig; unset attributes fall back to it', async () => {
  const r = run({ attrs: { 'data-site-id': 'site-attr', 'data-api-url': 'https://attr.test/v1' }, cortiqConfig: { siteId: 'site-config', apiUrl: 'https://config.test/v1', cookieless: true } });
  await settle();
  const pv = r.requests.find(x => x.url.endsWith('/track-event'));
  assert.ok(pv.url.startsWith('https://attr.test/v1'));
  assert.equal(pv.body.siteId ?? pv.body.site_id, 'site-attr');
  assert.equal(r.requests.some(x => x.url.endsWith('/visitor-identification')), false, 'cookieless from cortiqConfig kept');
});

test('no siteId anywhere logs a clear error and sends nothing', async () => {
  const r = run();
  await settle();
  assert.equal(r.requests.length, 0);
  assert.ok(r.errors.some(e => e.includes('data-site-id')));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';

// The client-side bot layer reads device properties (navigator/screen) and loads
// a canary pixel. Both are terminal-equipment access under LEK 9:28 / ePrivacy
// Art. 5.3, so nothing of it may happen before analytics consent.

const script = readFileSync(new URL('../../public/spa-tracking.js', import.meta.url), 'utf8');
const settle = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); };

const DEVICE_PROPS = new Set(['plugins', 'deviceMemory', 'hardwareConcurrency', 'languages', 'webdriver', 'platform']);

function browser(userAgent) {
  const deviceReads = [];
  const appended = [];
  const requests = [];
  const listeners = new Map();
  const surface = () => ({
    addEventListener(name, handler) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(handler); },
    removeEventListener(name, handler) { listeners.get(name)?.delete(handler); },
    dispatchEvent(event) { for (const handler of [...(listeners.get(event.type) || [])]) handler(event); },
  });
  const watch = (target, label) => new Proxy(target, {
    get(obj, key) { if (typeof key === 'string' && (DEVICE_PROPS.has(key) || label === 'screen')) deviceReads.push(`${label}.${key}`); return obj[key]; },
  });
  const navigatorRaw = {
    userAgent, language: 'sv', languages: ['sv'], platform: 'Linux', plugins: { length: 0 },
    hardwareConcurrency: 2, webdriver: true,
    sendBeacon: (url, body) => { requests.push({ url, body }); return true; },
  };
  const element = () => ({ style: {}, setAttribute() {}, addEventListener() {}, appendChild() {}, getContext: () => null });
  const window = Object.assign(surface(), {
    cortiqConfig: { siteId: 'site-1', apiKey: 'tracking-key' },
    location: { href: 'https://site.test/', origin: 'https://site.test', pathname: '/', search: '' },
    innerWidth: 1200, innerHeight: 800, scrollY: 0,
  });
  window.self = window; window.top = window;
  const document = Object.assign(surface(), {
    readyState: 'complete', referrer: '', title: 'Start', documentElement: { scrollHeight: 4000 },
    body: { appendChild: el => appended.push(el) },
    createElement: element,
    getElementById: () => null,
  });
  runInNewContext(script, {
    window, document, history: { pushState() {}, replaceState() {} }, crypto: webcrypto, URL, URLSearchParams, TextEncoder, btoa,
    screen: watch({ width: 800, height: 600, colorDepth: 24 }, 'screen'), navigator: watch(navigatorRaw, 'navigator'),
    localStorage: { getItem: () => null }, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    performance: { now: () => 0 },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    console: { log() {}, warn() {}, error() {} },
    setTimeout: () => 0, setInterval: () => 0, clearInterval() {}, requestAnimationFrame: fn => fn(),
    fetch: async (url, options) => {
      requests.push({ url, body: options?.body });
      return { ok: true, json: async () => ({ success: true, visitor: null }) };
    },
  });
  const choose = (analytics) => window.dispatchEvent({ type: 'siteConsentUpdated', detail: { analytics, marketing: false } });
  return { deviceReads, appended, requests, choose };
}

for (const ua of ['Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/120.0', 'Mozilla/5.0 (compatible; GPTBot/1.2)', 'Mozilla/5.0 Firefox/130.0']) {
  test(`no device reads, canary or bot beacon before consent: ${ua}`, async () => {
    const b = browser(ua);
    await settle();
    assert.deepEqual(b.deviceReads, []);
    assert.equal(b.appended.length, 0);
    assert.equal(b.requests.length, 0);
  });
}

test('declining consent keeps the bot layer off', async () => {
  const b = browser('Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/120.0');
  b.choose(false);
  await settle();
  assert.deepEqual(b.deviceReads, []);
  assert.equal(b.appended.length, 0);
  assert.equal(b.requests.filter(r => String(r.url).includes('ai-bot-tracker')).length, 0);
});

test('after analytics consent the bot probe, canary and honeypot run', async () => {
  const b = browser('Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/120.0');
  b.choose(true);
  await settle();
  assert.ok(b.requests.some(r => String(r.url).endsWith('/ai-bot-tracker')), 'bot probe beacon sent');
  assert.ok(b.appended.length >= 2, 'canary and honeypot inserted');
});

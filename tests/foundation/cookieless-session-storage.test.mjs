// tests/foundation/cookieless-session-storage.test.mjs
// Cookieless mode keeps the session id and its expiry in sessionStorage after analytics consent
// (same keys as full mode), so a visit survives full page loads within the tab. Nothing is
// written before consent, withdrawal clears both keys, and sessionStorage: false (or
// data-session-storage="false") keeps the id in memory only. Never a cookie or localStorage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';

const script = readFileSync(new URL('../../public/spa-tracking.js', import.meta.url), 'utf8');
const settle = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); };
const MIN = 60_000;
const START = Date.UTC(2026, 10, 20, 10, 0);

// One page load. `tab` is shared between loads to simulate the same browser tab: sessionStorage,
// localStorage and the clock survive a reload, everything else is new.
function newTab() {
  return { clock: { now: START }, session: new Map(), local: new Map(), sessionWrites: [], localWrites: [], cookieWrites: [] };
}

function load(tab, { config = {}, attributes = {}, search = '' } = {}) {
  const { clock } = tab;
  class FakeDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock.now])); }
    static now() { return clock.now; }
  }
  const calls = [];
  const surface = () => {
    const listeners = new Map();
    return {
      addEventListener(name, handler) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(handler); },
      removeEventListener(name, handler) { listeners.get(name)?.delete(handler); },
      dispatchEvent(event) { for (const handler of [...(listeners.get(event.type) || [])]) handler(event); },
    };
  };
  const window = Object.assign(surface(), {
    cortiqConfig: { siteId: 'site-1', apiKey: 'tracking-key', ...config },
    location: { href: `https://site.test/start${search}`, origin: 'https://site.test', pathname: '/start', search },
    innerWidth: 1200, innerHeight: 800, scrollY: 0,
  });
  const document = Object.assign(surface(), {
    readyState: 'complete', referrer: '', title: 'Start', documentElement: { scrollHeight: 4000 },
    currentScript: { getAttribute: name => attributes[name] ?? null },
    createElement() { return { getContext: () => null }; },
  });
  Object.defineProperty(document, 'cookie', {
    get: () => '',
    set: value => { tab.cookieWrites.push(value); },
  });
  const history = {
    pushState(_state, _unused, path) { window.location.pathname = path; },
    replaceState(_state, _unused, path) { window.location.pathname = path; },
  };
  runInNewContext(script, {
    window, document, history, crypto: webcrypto, URL, URLSearchParams, TextEncoder, Date: FakeDate,
    screen: { width: 1200, height: 800 }, navigator: { userAgent: 'Test', language: 'sv', platform: 'test' },
    localStorage: {
      getItem: key => tab.local.get(key) ?? null,
      setItem: (key, value) => { tab.localWrites.push(key); tab.local.set(key, String(value)); },
      removeItem: key => { tab.localWrites.push(key); tab.local.delete(key); },
    },
    sessionStorage: {
      getItem: key => tab.session.get(key) ?? null,
      setItem: (key, value) => { tab.sessionWrites.push(key); tab.session.set(key, String(value)); },
      removeItem: key => tab.session.delete(key),
    },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    console: { log() {}, warn() {}, error() {} },
    setTimeout, setInterval: () => 0, clearInterval() {}, requestAnimationFrame: fn => fn(),
    fetch: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return { ok: true, json: async () => ({ success: true, visitor: { visitorId: 'visitor-1', visitorType: 'human' } }) };
    },
  });
  const choose = (analytics, marketing = false) => window.dispatchEvent({ type: 'siteConsentUpdated', detail: { analytics, marketing } });
  const sessionIds = () => calls.filter(c => c.url.endsWith('/track-event')).map(c => c.body.session_id);
  return { window, calls, choose, sessionIds };
}

// The CortIQ banner stores the visitor's choice in localStorage; the tracker only reads it.
const storeConsent = (tab, consent) => tab.local.set('site_cookie_consent', JSON.stringify({ expiresAt: '2099-01-01T00:00:00Z', ...consent }));
const SESSION_KEYS = ['cortiq_session_id', 'cortiq_session_expires'];

test('cookieless: nothing is written before analytics consent', async () => {
  const tab = newTab();
  const page = load(tab, { config: { cookieless: true } });
  await settle();
  page.window.CortIQ.trackClick('cta');
  await settle();
  assert.equal(page.window.CortIQ.getSessionId(), null);
  assert.deepEqual(tab.sessionWrites, []);
  assert.equal(tab.session.size, 0);
  assert.equal(page.sessionIds().length, 0, 'no events before consent');
});

test('cookieless: after consent the session id and expiry are kept in sessionStorage', async () => {
  const tab = newTab();
  const page = load(tab, { config: { cookieless: true } });
  page.choose(true);
  await settle();
  const id = page.window.CortIQ.getSessionId();
  assert.match(id, /^sess_/);
  assert.equal(tab.session.get('cortiq_session_id'), id);
  assert.equal(Number(tab.session.get('cortiq_session_expires')), tab.clock.now + 30 * MIN);
  assert.deepEqual([...new Set(tab.sessionWrites)].sort(), SESSION_KEYS.slice().sort());
});

test('cookieless: one session id across full page loads within the timeout', async () => {
  const tab = newTab();
  storeConsent(tab, { analytics: true });
  const first = load(tab, { config: { cookieless: true } });
  await settle();
  const id = first.window.CortIQ.getSessionId();
  assert.match(id, /^sess_/);

  tab.clock.now += 10 * MIN;
  const second = load(tab, { config: { cookieless: true } });
  await settle();
  assert.equal(second.window.CortIQ.getSessionId(), id, 'reload 10 minutes later keeps the visit');
  assert.ok(second.sessionIds().length > 0 && second.sessionIds().every(s => s === id), 'events carry the same id');

  tab.clock.now += 25 * MIN;
  const third = load(tab, { config: { cookieless: true } });
  await settle();
  assert.equal(third.window.CortIQ.getSessionId(), id, 'activity on the second load extended the expiry');
});

test('cookieless: a reload after the timeout starts a new session', async () => {
  const tab = newTab();
  storeConsent(tab, { analytics: true });
  const first = load(tab, { config: { cookieless: true } });
  await settle();
  const id = first.window.CortIQ.getSessionId();

  tab.clock.now += 31 * MIN;
  const second = load(tab, { config: { cookieless: true } });
  await settle();
  const next = second.window.CortIQ.getSessionId();
  assert.match(next, /^sess_/);
  assert.notEqual(next, id);
  assert.equal(tab.session.get('cortiq_session_id'), next);
});

test('cookieless: withdrawing consent clears both keys', async () => {
  const tab = newTab();
  const page = load(tab, { config: { cookieless: true } });
  page.choose(true);
  await settle();
  assert.ok(tab.session.has('cortiq_session_id'));
  page.choose(false);
  await settle();
  for (const key of SESSION_KEYS) assert.equal(tab.session.has(key), false, `${key} removed`);
  assert.equal(page.window.CortIQ.getSessionId(), null);
  const writes = tab.sessionWrites.length;
  page.window.CortIQ.trackClick('cta');
  await settle();
  assert.equal(tab.sessionWrites.length, writes, 'nothing written after withdrawal');
});

for (const [label, options] of [
  ['config sessionStorage: false', { config: { cookieless: true, sessionStorage: false } }],
  ['data-session-storage="false"', { config: { cookieless: true }, attributes: { 'data-session-storage': 'false' } }],
  ['data-cookieless + data-session-storage attributes', { attributes: { 'data-cookieless': 'true', 'data-session-storage': 'false' } }],
]) {
  test(`cookieless memory only (${label}): nothing is written and every load is a new visit`, async () => {
    const tab = newTab();
    storeConsent(tab, { analytics: true });
    const first = load(tab, options);
    await settle();
    const id = first.window.CortIQ.getSessionId();
    assert.match(id, /^sess_/);
    first.window.CortIQ.trackClick('cta');
    await settle();

    tab.clock.now += 1 * MIN;
    const second = load(tab, options);
    await settle();
    assert.notEqual(second.window.CortIQ.getSessionId(), id, 'no stitching across page loads');
    assert.deepEqual(tab.sessionWrites, []);
    assert.equal(tab.session.size, 0);
  });
}

test('sessionStorage: false has no effect in full mode', async () => {
  const tab = newTab();
  const page = load(tab, { config: { sessionStorage: false } });
  page.choose(true);
  await settle();
  assert.equal(tab.session.get('cortiq_session_id'), page.window.CortIQ.getSessionId());
});

test('cookieless never writes cookies or localStorage, and click IDs stay off', async () => {
  for (const config of [{ cookieless: true }, { cookieless: true, sessionStorage: false }]) {
    const tab = newTab();
    const page = load(tab, { config, search: '?gclid=abc123&fbclid=def456' });
    page.choose(true, true);
    await settle();
    page.window.CortIQ.trackClick('cta');
    tab.clock.now += 31 * MIN;
    page.window.CortIQ.trackClick('cta');
    page.choose(false);
    await settle();
    assert.deepEqual(tab.cookieWrites, [], `no cookies (${JSON.stringify(config)})`);
    assert.deepEqual(tab.localWrites, [], `no localStorage (${JSON.stringify(config)})`);
    assert.equal(tab.sessionWrites.includes('cortiq_click_ids'), false, 'click IDs keep their marketing gate');
    // The page URL itself is sent as is; what must stay off is the captured click-id field.
    const clickIdFields = JSON.stringify(page.calls.map(c => c.body)).match(/"(gclid|fbclid)":"[^"]+"/g);
    assert.equal(clickIdFields, null, 'no click id field sent');
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';

const script = readFileSync(new URL('../../public/spa-tracking.js', import.meta.url), 'utf8');
const settle = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); };

function browser(config = {}, storedConsent = null, identifyResponse = null) {
  const calls = [];
  const storageWrites = [];
  const local = new Map(storedConsent ? [['site_cookie_consent', JSON.stringify({ expiresAt: '2099-01-01T00:00:00Z', ...storedConsent })]] : []);
  const session = new Map();
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
    location: { href: 'https://site.test/start', origin: 'https://site.test', pathname: '/start', search: '' },
    innerWidth: 1200, innerHeight: 800, scrollY: 0,
  });
  let canvasReads = 0;
  const document = Object.assign(surface(), {
    readyState: 'complete', referrer: '', documentElement: { scrollHeight: 4000 },
    createElement() { canvasReads++; return { getContext: () => null }; },
  });
  const history = {
    pushState(_state, _unused, path) { window.location.pathname = path; },
    replaceState(_state, _unused, path) { window.location.pathname = path; },
  };
  runInNewContext(script, {
    window, document, history, crypto: webcrypto, URL, URLSearchParams, TextEncoder,
    screen: { width: 1200, height: 800 }, navigator: { userAgent: 'Test', language: 'sv', platform: 'test' },
    localStorage: { getItem: key => local.get(key) ?? null },
    sessionStorage: {
      getItem: key => session.get(key) ?? null,
      setItem: (key, value) => { storageWrites.push(key); session.set(key, value); },
      removeItem: key => session.delete(key),
    },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    console: { log() {}, warn() {}, error() {} },
    setTimeout, requestAnimationFrame: fn => fn(),
    fetch: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      if (url.endsWith('/visitor-identification') && identifyResponse) return identifyResponse;
      return { ok: true, json: async () => ({ success: true, visitor: { visitorId: 'visitor-1', visitorType: 'human' } }) };
    },
  });
  const choose = (analytics, marketing = false) => window.dispatchEvent({ type: 'siteConsentUpdated', detail: { analytics, marketing } });
  const click = () => document.dispatchEvent({ type: 'click', target: { closest: selector => selector.startsWith('#crtq') ? null : ({
    tagName: 'A', href: 'https://site.test/next', textContent: 'Next', getAttribute: key => key === 'href' ? '/next' : null,
  }) } });
  return { window, document, history, calls, storageWrites, session, choose, click, canvasReads: () => canvasReads };
}

for (const config of [{}, { requireConsent: false }, { cookieless: true }, { cookieless: true, requireConsent: false }]) {
  test(`no tracking/storage before consent, including public API and SPA: ${JSON.stringify(config)}`, async () => {
    const b = browser(config);
    b.window.CortIQ.trackClick('button');
    b.window.CortIQ.identify();
    b.history.pushState({}, '', '/next');
    b.click();
    await settle();
    assert.equal(b.calls.length, 0);
    assert.equal(b.storageWrites.length, 0);
    assert.equal(b.window.CortIQ.getSessionId(), null);
    assert.equal(b.canvasReads(), 0);
  });
}

test('analytics grant starts once, without canvas/WebGL reads or marketing data', async () => {
  const b = browser();
  b.choose(true);
  b.choose(true);
  await settle();
  assert.equal(b.calls.filter(c => c.url.endsWith('/visitor-identification')).length, 1);
  assert.equal(b.calls.filter(c => c.body.event_type === 'view').length, 1);
  assert.ok(b.session.has('cortiq_session_id'));
  assert.equal(b.canvasReads(), 0);
});

for (const expiresAt of ['2000-01-01T00:00:00Z', null, 'invalid']) {
  test(`stored consent with invalid/expired expiry is not used: ${expiresAt}`, async () => {
    const b = browser({}, { analytics: true, marketing: true, expiresAt });
    b.window.CortIQ.trackClick('test');
    await settle();
    assert.equal(b.calls.length, 0);
    assert.equal(b.storageWrites.length, 0);
  });
}

test('cookieless with consent does not identify visitors or persist IDs', async () => {
  const b = browser({ cookieless: true }, { analytics: true, marketing: true });
  await settle();
  assert.ok(b.calls.some(c => c.body.event_type === 'view'));
  assert.equal(b.calls.some(c => c.url.endsWith('/visitor-identification')), false);
  assert.equal(b.storageWrites.length, 0);
});

test('revocation wins over stale stored consent and blocks listeners, SPA and public API', async () => {
  const b = browser({}, { analytics: true, marketing: true });
  await settle();
  const oldSession = b.window.CortIQ.getSessionId();
  b.session.set('cortiq_click_ids', '{"gclid":"old"}');
  b.choose(false);
  const count = b.calls.length;
  b.click();
  b.window.scrollY = 4000;
  b.window.dispatchEvent({ type: 'scroll' });
  b.history.pushState({}, '', '/after-revocation');
  b.window.CortIQ.trackConversion('test');
  await b.window.CortIQ.identify();
  await settle();
  assert.equal(b.calls.length, count);
  assert.equal(b.window.CortIQ.getVisitorId(), null);
  assert.equal(b.window.CortIQ.getSessionId(), null);
  assert.equal(b.session.size, 0);
  b.choose(true);
  await settle();
  assert.notEqual(b.window.CortIQ.getSessionId(), oldSession);
  const before = b.calls.filter(c => c.url.endsWith('/link-click-counter')).length;
  b.click();
  await settle();
  assert.equal(b.calls.filter(c => c.url.endsWith('/link-click-counter')).length, before + 1);
});

test('in-flight identification cannot restore a revoked identity or start page tracking', async () => {
  let finish;
  const response = new Promise(resolve => { finish = resolve; });
  const b = browser({}, null, response);
  b.choose(true);
  b.choose(false);
  finish({ ok: true, json: async () => ({ success: true, visitor: { visitorId: 'stale' } }) });
  await settle();
  assert.equal(b.window.CortIQ.getVisitorId(), null);
  assert.equal(b.calls.length, 1); // only the request already sent before withdrawal
});

test('Cookiebot decline overrides an older CortIQ analytics grant', async () => {
  const b = browser({}, { analytics: true });
  await settle();
  b.window.Cookiebot = { consent: { statistics: false, marketing: false } };
  b.window.dispatchEvent({ type: 'CookiebotOnDecline' });
  const count = b.calls.length;
  b.click();
  b.history.pushState({}, '', '/declined');
  await settle();
  assert.equal(b.calls.length, count);
  assert.equal(b.window.CortIQ.getSessionId(), null);
});

for (const cookieless of [false, true]) {
  test(`analytics-only form submission does not read email (cookieless=${cookieless})`, async () => {
    const b = browser({ cookieless }, { analytics: true, marketing: false });
    await settle();
    let emailReads = 0;
    const form = {
      id: 'contact',
      hasAttribute: key => key === 'data-wfa-conversion',
      getAttribute: key => key === 'data-wfa-conversion' ? 'Contact' : null,
      querySelector() { emailReads++; return { value: 'private@example.test' }; },
    };
    b.document.dispatchEvent({ type: 'submit', target: form });
    await settle();
    assert.equal(emailReads, 0);
    const conversions = b.calls.filter(c => c.url.endsWith('/record-conversion'));
    assert.equal(conversions.length, cookieless ? 0 : 1);
    if (!cookieless) assert.equal(conversions[0].body.hashedEmail, null);
    assert.equal(JSON.stringify(b.calls).includes('private@example.test'), false);
    b.choose(false);
    const count = b.calls.length;
    b.document.dispatchEvent({ type: 'submit', target: form });
    await settle();
    assert.equal(b.calls.length, count);
  });
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';

const script = readFileSync(new URL('../../public/spa-tracking.js', import.meta.url), 'utf8');
const settle = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); };

function browser(config = {}, storedConsent = null, identifyResponse = null, page = {}) {
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
    location: { href: 'https://site.test/start', origin: 'https://site.test', pathname: '/start', search: page.search || '' },
    innerWidth: 1200, innerHeight: 800, scrollY: 0,
    ...(page.dataLayer && { dataLayer: page.dataLayer }),
  });
  let canvasReads = 0;
  const document = Object.assign(surface(), {
    readyState: 'complete', referrer: page.referrer || '', title: 'Start', documentElement: { scrollHeight: 4000 },
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
    setTimeout, setInterval: () => 0, clearInterval() {}, requestAnimationFrame: fn => fn(),
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

// Human visits arriving from AI services are visitor analytics, not security.
const aiReferral = { referrer: 'https://chatgpt.com/', search: '?utm_source=chatgpt.com' };
const isAIReferralCall = c => c.url.endsWith('/ai-search-tracker') || (c.url.endsWith('/ai-bot-tracker') && c.body.citationData);

test('AI-referral visit sends nothing before consent', async () => {
  const b = browser({}, null, null, aiReferral);
  await settle();
  assert.equal(b.calls.filter(isAIReferralCall).length, 0);
});

test('AI-referral visit is measured once after consent, and not after revocation', async () => {
  const b = browser({}, null, null, aiReferral);
  b.choose(true);
  await settle();
  assert.equal(b.calls.filter(c => c.url.endsWith('/ai-search-tracker')).length, 1);
  assert.equal(b.calls.filter(c => c.url.endsWith('/ai-bot-tracker') && c.body.citationData).length, 1);
  b.choose(false);
  b.choose(true);
  await settle();
  assert.equal(b.calls.filter(c => c.url.endsWith('/ai-search-tracker')).length, 1, 'no duplicate on re-grant');
});

test('AI-referral visit with stored consent is measured on load', async () => {
  const b = browser({ cookieless: true }, { analytics: true }, null, aiReferral);
  await settle();
  assert.equal(b.calls.filter(isAIReferralCall).length, 2);
});

// WordPress plugin < 5.4.0 stored { timestamp, consentId, policyVersion } without expiresAt.
const DAY = 24 * 60 * 60 * 1000;
const legacy = (extra) => ({ analytics: true, marketing: false, expiresAt: undefined, consentId: 'c1', policyVersion: '1', ...extra });

test('legacy WP plugin consent (no expiresAt) is honoured within 365 days', async () => {
  const b = browser({}, legacy({ timestamp: Date.now() - 10 * DAY }));
  await settle();
  assert.ok(b.calls.some(c => c.body.event_type === 'view'));
});

for (const [label, extra] of [
  ['older than 365 days', { timestamp: Date.now() - 366 * DAY }],
  ['timestamp in the future', { timestamp: Date.now() + DAY }],
  ['missing consentId', { timestamp: Date.now(), consentId: undefined }],
  ['missing policyVersion', { timestamp: Date.now(), policyVersion: undefined }],
]) {
  test(`legacy consent is not used when ${label}`, async () => {
    const b = browser({}, legacy(extra));
    await settle();
    assert.equal(b.calls.length, 0);
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

// Google Consent Mode v2 fallback: CMPs wired to gtag/GTM (OneTrust, Usercentrics …)
const gtagArgs = (...a) => { const args = (function () { return arguments; })(...a); return args; };
const pageViews = calls => calls.filter(c => c.url.endsWith('/track-event') && c.body.event_type === 'view');

test('Consent Mode grant on the dataLayer starts analytics when no CortIQ or Cookiebot record exists', async () => {
  const dataLayer = [gtagArgs('consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied' })];
  const page = browser({}, null, null, { dataLayer });
  await settle();
  assert.equal(pageViews(page.calls).length, 0, 'denied default must not track');
  page.window.dataLayer.push(gtagArgs('consent', 'update', { analytics_storage: 'granted' }));
  await settle();
  assert.equal(pageViews(page.calls).length, 1);
});

test('Consent Mode withdrawal on the dataLayer stops analytics', async () => {
  const dataLayer = [gtagArgs('consent', 'update', { analytics_storage: 'granted' })];
  const page = browser({}, null, null, { dataLayer });
  await settle();
  assert.equal(pageViews(page.calls).length, 1);
  page.window.dataLayer.push(gtagArgs('consent', 'update', { analytics_storage: 'denied' }));
  page.history.pushState({}, '', '/next');
  await settle();
  assert.equal(pageViews(page.calls).length, 1, 'no page view after withdrawal');
});

test('region-scoped Consent Mode defaults are not treated as the visitor choice', async () => {
  const dataLayer = [gtagArgs('consent', 'default', { analytics_storage: 'granted', region: ['US'] })];
  const page = browser({}, null, null, { dataLayer });
  await settle();
  assert.equal(pageViews(page.calls).length, 0);
});

test('a stored CortIQ choice wins over Consent Mode (WordPress plugin re-sends only analytics_storage)', async () => {
  const dataLayer = [gtagArgs('consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied' }),
    gtagArgs('consent', 'update', { analytics_storage: 'granted' })];
  const page = browser({}, { analytics: true, marketing: true }, null, { dataLayer, search: '?gclid=abc' });
  await settle();
  const view = pageViews(page.calls)[0];
  assert.ok(view, 'tracks with stored analytics consent');
  assert.ok(page.session.get('cortiq_click_ids'), 'stored marketing grant still captures click IDs');
});

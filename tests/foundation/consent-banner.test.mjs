import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// public/consent-banner.js — the optional CortIQ banner offered by the install snippet.
// Runs the real file against a minimal DOM stub: only what the banner touches.

const source = readFileSync(new URL('../../public/consent-banner.js', import.meta.url), 'utf8');

function makeElement(id) {
  const listeners = {};
  return {
    id, style: {}, checked: false, innerHTML: '', textContent: '', parentNode: null,
    setAttribute(name, value) { this[name] = value; },
    addEventListener(name, fn) { (listeners[name] ||= []).push(fn); },
    click() { (listeners.click || []).forEach(fn => fn()); },
    focus() {},
  };
}

function page({ attrs = {}, stored = null, htmlLang = '', hostname = 'www.vikingage.se', cortiqConfig, extraWindow = {} } = {}) {
  const store = new Map(stored ? [['site_cookie_consent', JSON.stringify(stored)]] : []);
  const byId = new Map();
  const events = [];
  const posts = [];
  const timers = [];
  const script = { getAttribute: name => (name in attrs ? attrs[name] : null) };
  const body = {
    appendChild(el) {
      byId.set(el.id, el);
      el.parentNode = { removeChild: () => byId.delete(el.id) };
      // Register children the banner writes via innerHTML, with their checked state.
      for (const m of el.innerHTML.matchAll(/<(button|input)[^>]*id="([^"]+)"([^>]*)>/g)) {
        const child = makeElement(m[2]);
        child.checked = /\schecked/.test(m[0]);
        byId.set(m[2], child);
      }
    },
  };
  const document = {
    currentScript: script, readyState: 'complete', body, cookie: '',
    documentElement: { lang: htmlLang },
    getElementById: id => byId.get(id) || null,
    createElement: () => makeElement(''),
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  const window = { cortiqConfig, dispatchEvent: e => events.push(e.detail), matchMedia: () => ({ matches: false }), ...extraWindow };
  const context = {
    window, document, navigator: { language: 'en-US' }, location: { hostname },
    localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
    sessionStorage: { getItem: () => null, setItem() {} },
    CustomEvent: class { constructor(name, init) { this.detail = init.detail; } },
    crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000001' },
    fetch: (url, init) => { posts.push({ url, body: JSON.parse(init.body) }); return Promise.resolve({ json: () => ({ consent_id: 'ledger-1' }) }); },
    setTimeout: fn => timers.push(fn), Date, JSON, Math, String, Array, Promise,
  };
  runInNewContext(source, context);
  timers.splice(0).forEach(fn => fn());
  return {
    byId, events, posts, window,
    consent: () => (window.dataLayer || []).map(a => Array.from(a)),
    saved: () => JSON.parse(store.get('site_cookie_consent') || 'null'),
    flush: () => new Promise(r => setImmediate(r)),
  };
}

test('defaults: analytics is the only category offered, sender is the site, html lang wins', () => {
  const p = page({ htmlLang: 'sv-SE' });
  const banner = p.byId.get('crtq-consent-banner');
  assert.ok(banner, 'banner shown');
  assert.ok(p.byId.has('crtq-toggle-analytics'));
  assert.equal(p.byId.has('crtq-toggle-marketing'), false);
  assert.equal(p.byId.has('crtq-toggle-preferences'), false);
  assert.match(banner.innerHTML, /vikingage\.se ansvarar för dina personuppgifter/);
  assert.doesNotMatch(banner.innerHTML, /anonymt/);
  assert.equal(p.byId.get('crtq-toggle-analytics').checked, false, 'nothing preselected');
});

test('accept all grants only the categories the site uses; record carries consentId + policyVersion', async () => {
  const p = page({ attrs: { 'data-site-id': 'site-uuid', 'data-policy-version': '2026-11' } });
  p.byId.get('crtq-cb-accept').click();
  const saved = p.saved();
  assert.deepEqual({ a: saved.analytics, m: saved.marketing, p: saved.preferences }, { a: true, m: false, p: false });
  assert.equal(saved.policyVersion, '2026-11');
  assert.equal(typeof saved.consentId, 'string');
  assert.ok(Date.parse(saved.expiresAt) > Date.now());
  assert.equal(p.events[0].analytics, true);
  assert.equal(p.events[0].marketing, false);
  assert.equal(p.posts[0].body.policy_version, '2026-11');
  assert.equal(p.posts[0].body.site_id, 'site-uuid');
  await p.flush();
  assert.equal(p.saved().consentId, 'ledger-1', 'server ledger id replaces the local id');
});

test('necessary only stores a refusal', () => {
  const p = page({ attrs: { 'data-categories': 'analytics,marketing' } });
  p.byId.get('crtq-cb-necessary').click();
  assert.deepEqual([p.saved().analytics, p.saved().marketing], [false, false]);
  assert.equal(p.events[0].analytics, false);
});

test('custom choice: only the toggled category is granted', () => {
  const p = page({ attrs: { 'data-categories': 'analytics, marketing, bogus' } });
  assert.equal(p.byId.has('crtq-toggle-bogus'), false);
  p.byId.get('crtq-toggle-marketing').checked = true;
  p.byId.get('crtq-cb-save').click();
  assert.deepEqual([p.saved().analytics, p.saved().marketing], [false, true]);
});

test('a stored choice for the same policy version hides the banner; a new version asks again', () => {
  const stored = { necessary: true, analytics: true, marketing: false, preferences: false, consentId: 'x',
    policyVersion: '1', expiresAt: new Date(Date.now() + 1e9).toISOString() };
  assert.equal(page({ stored }).byId.has('crtq-consent-banner'), false);
  assert.equal(page({ stored, attrs: { 'data-policy-version': '2' } }).byId.has('crtq-consent-banner'), true);
  assert.equal(page({ stored: { ...stored, policyVersion: undefined } }).byId.has('crtq-consent-banner'), true, 'legacy record without version');
});

test('withdrawal control is always present, in the banner language', () => {
  const p = page({ attrs: { 'data-lang': 'de' } });
  assert.ok(p.byId.has('crtq-consent-settings'));
  assert.match(p.byId.get('crtq-consent-banner').innerHTML, /Dürfen wir/);
});

test('company and policy URL are escaped', () => {
  const p = page({ attrs: { 'data-company': '<img src=x>', 'data-policy-url': '"/x" onclick="y' } });
  const html = p.byId.get('crtq-consent-banner').innerHTML;
  assert.doesNotMatch(html, /<img src=x>/);
  assert.doesNotMatch(html, /href=""\/x" onclick/);
});

test('every language defines the same keys', () => {
  const block = source.slice(source.indexOf('var T = {'), source.indexOf('var cfg = {'));
  const langs = [...block.matchAll(/^ {4}(\w\w): \{/gm)].map(m => m[1]);
  assert.deepEqual(langs, ['sv', 'en', 'de', 'fr', 'pt']);
  const keyCount = lang => {
    const start = block.indexOf(`    ${lang}: {`);
    const rest = block.slice(block.indexOf("{", start) + 1);
    const end = rest.search(/^ {4}\w\w: \{/m);
    return [...(end === -1 ? rest : rest.slice(0, end)).matchAll(/^\s+(\w+)\s*:/gm)].map(m => m[1]).join(',');
  };
  for (const lang of langs) assert.equal(keyCount(lang), keyCount('sv'), lang);
});

test('purposes are visible in the first layer; one category means a plain Accept button', () => {
  const p = page({ htmlLang: 'sv', cortiqConfig: { cookieless: true } });
  const html = p.byId.get('crtq-consent-banner').innerHTML;
  assert.match(html, /<li[^>]*><strong[^>]*>Statistik:<\/strong> Mäter hur webbplatsen används/);
  assert.match(html, /återkommande besök känns inte igen/, 'cookieless text');
  assert.match(html, /Sparas på din enhet bara under besöket/, 'retention');
  assert.match(html, />\s*Godkänn\s*</);
  assert.doesNotMatch(html, /Godkänn alla/);
  assert.doesNotMatch(html, /knyts inte till ditt namn/);
});

test('standard mode explains device recognition; marketing names the email hash and Google', () => {
  const p = page({ htmlLang: 'sv', attrs: { 'data-categories': 'analytics,marketing' } });
  const html = p.byId.get('crtq-consent-banner').innerHTML;
  assert.match(html, /känna igen återkommande besök/);
  assert.match(html, /hash av din e-postadress/);
  assert.match(html, /Google Ads/);
  assert.match(html, /och våra annonser\?/);
  assert.match(html, /Godkänn alla/);
});

test('data-tracking-mode overrides the tracker config', () => {
  const p = page({ htmlLang: 'en', cortiqConfig: { cookieless: true }, attrs: { 'data-tracking-mode': 'standard' } });
  assert.match(p.byId.get('crtq-consent-banner').innerHTML, /recognise returning visits, information about your browser/);
});

test('Google Consent Mode v2: denied default at load, then an update per category on the choice', () => {
  const p = page({ attrs: { 'data-categories': 'analytics,marketing' } });
  const [def] = p.consent();
  assert.equal(def[0], 'consent');
  assert.equal(def[1], 'default');
  assert.equal(Object.prototype.toString.call(p.window.dataLayer[0]), '[object Arguments]', 'gtag needs an arguments object');
  for (const k of ['analytics_storage', 'ad_storage', 'ad_user_data', 'ad_personalization', 'functionality_storage', 'personalization_storage']) {
    assert.equal(def[2][k], 'denied', k);
  }
  assert.equal(def[2].security_storage, 'granted');
  assert.equal(def[2].wait_for_update, 500);

  p.byId.get('crtq-toggle-analytics').checked = true;
  p.byId.get('crtq-cb-save').click();
  const update = p.consent().at(-1);
  assert.equal(update[1], 'update');
  assert.equal(update[2].analytics_storage, 'granted');
  assert.equal(update[2].ad_storage, 'denied');
  assert.equal(update[2].ad_user_data, 'denied');
  assert.equal('wait_for_update' in update[2], false);
});

test('Google Consent Mode v2: accept all grants ads signals only when marketing is a listed category', () => {
  const only = page();
  only.byId.get('crtq-cb-accept').click();
  assert.equal(only.consent().at(-1)[2].analytics_storage, 'granted');
  assert.equal(only.consent().at(-1)[2].ad_storage, 'denied');
  const ads = page({ attrs: { 'data-categories': 'analytics,marketing' } });
  ads.byId.get('crtq-cb-accept').click();
  for (const k of ['ad_storage', 'ad_user_data', 'ad_personalization']) assert.equal(ads.consent().at(-1)[2][k], 'granted', k);
});

test('Google Consent Mode v2: a stored choice is replayed as an update on the next page', () => {
  const stored = { necessary: true, analytics: true, marketing: false, preferences: false, policyVersion: '1',
    expiresAt: '2099-01-01T00:00:00Z' };
  const p = page({ stored });
  const [def, update] = p.consent();
  assert.equal(def[1], 'default');
  assert.equal(update[1], 'update');
  assert.equal(update[2].analytics_storage, 'granted');
  const bumped = page({ stored, attrs: { 'data-policy-version': '2' } });
  assert.equal(bumped.consent().length, 1, 'a bumped policy version replays nothing');
});

test('Google Consent Mode v2: off switch and another CMP send nothing', () => {
  assert.deepEqual(page({ attrs: { 'data-consent-mode': 'off' } }).consent(), []);
  assert.deepEqual(page({ extraWindow: { Cookiebot: {} } }).consent(), []);
});

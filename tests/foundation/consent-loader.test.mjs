import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// The install snippet must not request the tracker (and so send the visitor's IP to cortiq.se)
// before analytics consent. EDPB Guidelines 2/2023 para. 34: a site instructing the browser to
// send information to a third party.

const source = readFileSync(new URL('../../src/lib/consent-loader.js', import.meta.url), 'utf8')
  .replace('__CORTIQ_SRC__', 'https://cortiq.se/spa-tracking.js');

function page({ stored = null, cookiebot = null, dataLayer, bannerVersion, googleTagData } = {}) {
  const appended = [];
  let interval = null;
  const listeners = {};
  const window = {
    addEventListener: (n, f) => { (listeners[n] ||= []).push(f); },
    ...(cookiebot !== null && { Cookiebot: { consent: { statistics: cookiebot } } }),
    ...(dataLayer && { dataLayer }),
    ...(googleTagData && { google_tag_data: googleTagData }),
  };
  const banner = bannerVersion === undefined ? null
    : { getAttribute: n => (n === 'data-policy-version' ? bannerVersion : null) };
  const document = {
    createElement: () => ({}),
    head: { appendChild: el => appended.push(el.src) },
    querySelector: sel => (sel.includes('consent-banner') ? banner : null),
  };
  const localStorage = { getItem: () => (stored ? JSON.stringify(stored) : null) };
  runInNewContext(source, { window, document, localStorage, Date, JSON, Array, setInterval: fn => { interval = fn; return 1; }, clearInterval: () => { interval = null; } });
  const fire = (name, detail) => (listeners[name] || []).forEach(f => f({ detail }));
  const tick = () => interval && interval();
  return { appended, fire, window, tick, polling: () => interval !== null };
}

test('no request before any consent', () => {
  assert.deepEqual(page().appended, []);
});

test('declined or expired stored consent loads nothing', () => {
  assert.deepEqual(page({ stored: { analytics: false, expiresAt: '2099-01-01T00:00:00Z' } }).appended, []);
  assert.deepEqual(page({ stored: { analytics: true, expiresAt: '2000-01-01T00:00:00Z' } }).appended, []);
  assert.deepEqual(page({ stored: { analytics: true, expiresAt: 946684800000 } }).appended, []);
});

test('stored analytics consent loads the tracker once (ISO or epoch ms)', () => {
  assert.deepEqual(page({ stored: { analytics: true, expiresAt: '2099-01-01T00:00:00Z' } }).appended, ['https://cortiq.se/spa-tracking.js']);
  assert.deepEqual(page({ stored: { analytics: true, expiresAt: Date.now() + 1e6 } }).appended.length, 1);
});

test('the CortIQ banner event loads it after the choice, only once, and not on a refusal', () => {
  const p = page();
  p.fire('siteConsentUpdated', { analytics: false });
  assert.deepEqual(p.appended, []);
  p.fire('siteConsentUpdated', { analytics: true });
  p.fire('siteConsentUpdated', { analytics: true });
  assert.equal(p.appended.length, 1);
});

test('Cookiebot statistics consent loads it', () => {
  assert.equal(page({ cookiebot: true }).appended.length, 1);
  const p = page({ cookiebot: false });
  p.window.Cookiebot.consent.statistics = true;
  p.fire('CookiebotOnAccept');
  assert.equal(p.appended.length, 1);
});

test('Google Consent Mode: an analytics_storage grant loads it, a default or denial does not', () => {
  assert.deepEqual(page({ dataLayer: [['consent', 'default', { analytics_storage: 'granted' }]] }).appended, []);
  const p = page({ dataLayer: [] });
  p.window.dataLayer.push(['consent', 'update', { analytics_storage: 'denied' }]);
  assert.deepEqual(p.appended, []);
  p.window.dataLayer.push(['consent', 'update', { analytics_storage: 'granted' }]);
  assert.equal(p.appended.length, 1);
  assert.equal(p.window.dataLayer.length, 2, 'pushes still reach the dataLayer');
});

test('with the CortIQ banner, stored consent counts only for its current policy version', () => {
  const ok = { analytics: true, expiresAt: '2099-01-01T00:00:00Z' };
  assert.equal(page({ stored: { ...ok, policyVersion: '2' }, bannerVersion: '2' }).appended.length, 1);
  assert.deepEqual(page({ stored: { ...ok, policyVersion: '1' }, bannerVersion: '2' }).appended, [], 'bumped version waits');
  assert.deepEqual(page({ stored: ok, bannerVersion: '1' }).appended, [], 'pre-version record waits for a new answer');
  assert.equal(page({ stored: { ...ok, policyVersion: '1' }, bannerVersion: null }).appended.length, 1, 'attribute missing = "1"');
  const p = page({ stored: { ...ok, policyVersion: '1' }, bannerVersion: '2' });
  p.fire('siteConsentUpdated', { analytics: true });
  assert.equal(p.appended.length, 1, 'the new answer loads it');
});

test('without the CortIQ banner (own CMP) the stored record needs no policy version', () => {
  assert.equal(page({ stored: { analytics: true, expiresAt: '2099-01-01T00:00:00Z' } }).appended.length, 1);
});

test('Consent Mode: gtag arguments objects count like arrays', () => {
  const p = page({ dataLayer: [] });
  (function () { p.window.dataLayer.push(arguments); })('consent', 'update', { analytics_storage: 'granted' });
  assert.equal(p.appended.length, 1);
});

test('Consent Mode: a replaced dataLayer or push is caught by the poll', () => {
  const replaced = page({ dataLayer: [] });
  replaced.window.dataLayer = [['consent', 'update', { analytics_storage: 'granted' }]];
  assert.deepEqual(replaced.appended, []);
  replaced.tick();
  assert.equal(replaced.appended.length, 1);

  const newPush = page({ dataLayer: [] });
  const dl = newPush.window.dataLayer;
  dl.push = function () { return Array.prototype.push.apply(dl, arguments); };
  dl.push(['consent', 'update', { analytics_storage: 'denied' }]);
  newPush.tick();
  assert.deepEqual(newPush.appended, []);
  dl.push(['consent', 'update', { analytics_storage: 'granted' }]);
  newPush.tick();
  assert.equal(newPush.appended.length, 1);
  newPush.tick();
  assert.equal(newPush.polling(), false, 'poll stops after loading');
});

test("Consent Mode: Google's own update state counts, its default does not", () => {
  const state = update => ({ ics: { entries: { analytics_storage: { default: true, update } } } });
  assert.equal(page({ googleTagData: state(true) }).appended.length, 1);
  const p = page({ googleTagData: state(undefined) });
  assert.deepEqual(p.appended, []);
  p.window.google_tag_data.ics.entries.analytics_storage.update = true;
  p.tick();
  assert.equal(p.appended.length, 1);
});

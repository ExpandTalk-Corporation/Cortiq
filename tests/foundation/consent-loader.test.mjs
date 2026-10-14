import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// The install snippet must not request the tracker (and so send the visitor's IP to cortiq.se)
// before analytics consent. EDPB Guidelines 2/2023 para. 34: a site instructing the browser to
// send information to a third party.

const source = readFileSync(new URL('../../src/lib/consent-loader.js', import.meta.url), 'utf8')
  .replace('__CORTIQ_SRC__', 'https://cortiq.se/spa-tracking.js');

function page({ stored = null, cookiebot = null, dataLayer } = {}) {
  const appended = [];
  const listeners = {};
  const window = {
    addEventListener: (n, f) => { (listeners[n] ||= []).push(f); },
    ...(cookiebot !== null && { Cookiebot: { consent: { statistics: cookiebot } } }),
    ...(dataLayer && { dataLayer }),
  };
  const document = { createElement: () => ({}), head: { appendChild: el => appended.push(el.src) } };
  const localStorage = { getItem: () => (stored ? JSON.stringify(stored) : null) };
  runInNewContext(source, { window, document, localStorage, Date, JSON, Array });
  const fire = (name, detail) => (listeners[name] || []).forEach(f => f({ detail }));
  return { appended, fire, window };
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

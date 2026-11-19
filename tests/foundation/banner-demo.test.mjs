// public/banner-demo/: the real consent banner shown on the homepage inside <iframe sandbox="allow-scripts">.
// It must never log consent (no data-site-id), never be indexed, and survive the opaque origin
// where every storage access throws.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const html = read('public/banner-demo/index.html');
const demo = read('public/banner-demo/demo.js');

test('demo page is noindex, has no site id, no inline script and no inline handlers', () => {
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.doesNotMatch(html + demo, /data-site-id/);
  assert.doesNotMatch(html, /<script(?![^>]*\ssrc=)[^>]*>/, 'inline scripts need a CSP hash; use demo.js');
  assert.doesNotMatch(html, /<[a-z][^>]*\son[a-z]+\s*=/i);
  assert.doesNotMatch(read('src/marketing-routes.ts'), /banner-demo/);
});

function runDemo(search) {
  const appended = [];
  const documentElement = { lang: '' };
  const document = {
    documentElement,
    body: { appendChild: (el) => appended.push(el) },
    createElement: () => {
      const attrs = {};
      return { attrs, setAttribute: (k, v) => { attrs[k] = String(v); } };
    },
  };
  runInNewContext(demo, { document, location: { search } });
  assert.equal(appended.length, 1);
  return { script: appended[0], lang: documentElement.lang };
}

test('demo.js loads the real banner with a whitelisted language', () => {
  const { script, lang } = runDemo('?lang=de');
  assert.equal(script.src, '/consent-banner.js');
  assert.equal(script.attrs['data-lang'], 'de');
  assert.equal(script.attrs['data-company'], 'Example Company AB');
  assert.equal(script.attrs['data-policy-url'], '/privacy/');
  assert.equal(script.attrs['data-theme'], 'light');
  assert.equal(lang, 'de');
  assert.equal('data-site-id' in script.attrs, false);
});

test('demo.js falls back to English for unknown or hostile values', () => {
  for (const search of ['', '?lang=xx', '?lang=%22%3E%3Cscript%3E', '?lang=sv-SE', '?foo=1&lang=EN']) {
    assert.equal(runDemo(search).script.attrs['data-lang'], 'en', search);
  }
});

test('the real banner renders and sends nothing when storage throws and no site id is set', () => {
  const source = read('public/consent-banner.js');
  const byId = new Map();
  const fetches = [];
  const timers = [];
  const el = (id) => {
    const listeners = {};
    return {
      id, style: {}, checked: false, innerHTML: '', textContent: '', parentNode: null,
      setAttribute(n, v) { this[n] = v; },
      addEventListener(n, fn) { (listeners[n] ||= []).push(fn); },
      click() { (listeners.click || []).forEach((fn) => fn()); },
      focus() {},
    };
  };
  const body = {
    appendChild(node) {
      byId.set(node.id, node);
      node.parentNode = { removeChild: () => byId.delete(node.id) };
      for (const m of node.innerHTML.matchAll(/<(button|input)[^>]*id="([^"]+)"[^>]*>/g)) byId.set(m[2], el(m[2]));
    },
  };
  const attrs = { 'data-lang': 'en', 'data-company': 'Example Company AB' };
  const blocked = () => { throw new Error('SecurityError: opaque origin'); };
  const context = {
    window: { dispatchEvent() {}, matchMedia: () => ({ matches: false }) },
    document: {
      currentScript: { getAttribute: (n) => (n in attrs ? attrs[n] : null) }, readyState: 'complete', body, cookie: '',
      documentElement: { lang: 'en' }, getElementById: (id) => byId.get(id) || null,
      createElement: () => el(''), querySelector: () => null, querySelectorAll: () => [],
    },
    navigator: { language: 'en-US' }, location: { hostname: 'cortiq.se' },
    Intl: { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: 'Europe/Stockholm' }) }) },
    CustomEvent: class { constructor(n, init) { this.detail = init.detail; } },
    crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000001' },
    fetch: (...args) => { fetches.push(args); return Promise.resolve({ headers: { get: () => null }, json: () => ({}) }); },
    setTimeout: (fn) => timers.push(fn), Date, JSON, Math, String, Array, Promise,
  };
  Object.defineProperty(context, 'localStorage', { get: blocked });
  Object.defineProperty(context, 'sessionStorage', { get: blocked });
  runInNewContext(source, context);
  timers.splice(0).forEach((fn) => fn());
  assert.ok(byId.get('crtq-consent-banner'), 'banner shown');
  byId.get('crtq-cb-accept').click();
  timers.splice(0).forEach((fn) => fn());
  assert.equal(fetches.length, 0, 'no request leaves the demo');
});

// tests/foundation/aggregate-beacon.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../../src/lib/aggregate-beacon.js', import.meta.url), 'utf8');
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };

function browser({ config = { siteId: 'site-1', apiKey: 'tk_key', aggregate: true }, stored = null, gpc = false,
                   cookiebot, dataLayer, referrer = 'https://www.linkedin.com/feed/', search = '?utm_source=linkedin&utm_campaign=q4',
                   goals = [{ id: 'g-form', selector: '#demo' }], pathname = '/start' } = {}) {
  const calls = [];
  const storageTouches = [];
  const listeners = new Map();
  const on = (target) => ({
    addEventListener(n, h) { (listeners.get(target + n) || listeners.set(target + n, []).get(target + n)).push(h); },
  });
  const fire = (target, type, event) => (listeners.get(target + type) || []).forEach((h) => h({ type, ...event }));
  const local = new Map(stored ? [['site_cookie_consent', JSON.stringify(stored)]] : []);
  const window = Object.assign(on('w'), {
    cortiqConfig: config,
    ...(cookiebot && { Cookiebot: cookiebot }),
    ...(dataLayer && { dataLayer }),
  });
  const location = { origin: 'https://shop.test', pathname, search };
  const history = {
    pushState(_s, _t, path) { location.pathname = path; },
    replaceState(_s, _t, path) { location.pathname = path; },
  };
  const ctx = {
    window, location, history,
    document: Object.assign(on('d'), { referrer }),
    navigator: { globalPrivacyControl: gpc },
    URLSearchParams,
    localStorage: { getItem: (k) => { storageTouches.push(['get', k]); return local.get(k) ?? null; },
                    setItem: (k) => storageTouches.push(['set', k]) },
    sessionStorage: { getItem: (k) => { storageTouches.push(['sget', k]); return null; }, setItem: (k) => storageTouches.push(['sset', k]) },
    fetch: async (url, opts) => {
      calls.push({ url, opts, body: JSON.parse(opts.body) });
      const pageview = JSON.parse(opts.body).kind === 'pageview';
      return { status: pageview ? 200 : 204, json: async () => ({ goals }) };
    },
  };
  ctx.window.window = ctx.window;
  const run = () => runInNewContext(source, ctx);
  run();
  const submit = (form) => fire('d', 'submit', { target: form });
  const consent = (detail) => fire('w', 'siteConsentUpdated', { detail });
  return { calls, storageTouches, ctx, run, submit, consent, history, location };
}
const form = (matches, attrs = {}) => ({
  id: attrs.id || '', closest: (sel) => (matches.includes(sel) ? {} : null),
  hasAttribute: (a) => a in attrs, getAttribute: (a) => attrs[a] ?? null,
});

test('sends one pageview with referrer and UTM, no storage writes, no session reads', async () => {
  const b = browser();
  await settle();
  assert.equal(b.calls.length, 1);
  const { url, opts, body } = b.calls[0];
  assert.equal(url, 'https://cxmkdtgfocgbfizawlwa.supabase.co/functions/v1/aggregate-hit');
  assert.equal(opts.keepalive, true);
  assert.equal(opts.credentials, 'omit');
  assert.equal(opts.headers.Authorization, 'Bearer tk_key');
  assert.deepEqual(body, { kind: 'pageview', url: 'https://shop.test/start', referrer: 'https://www.linkedin.com/feed/',
    utm: { utm_source: 'linkedin', utm_campaign: 'q4' }, siteId: 'site-1' });
  assert.equal(b.storageTouches.some(([op]) => op !== 'get'), false, 'only reads the consent record');
  assert.deepEqual(b.storageTouches.filter(([op]) => op === 'get').map(([, k]) => k), ['site_cookie_consent']);
});

test('SPA navigation sends a pageview per new path, without the original referrer', async () => {
  const b = browser();
  await settle();
  b.ctx.history.pushState({}, '', '/pricing');
  b.ctx.history.replaceState({}, '', '/pricing');
  await settle();
  assert.equal(b.calls.length, 2);
  assert.equal(b.calls[1].body.url, 'https://shop.test/pricing');
  assert.equal(b.calls[1].body.referrer, '');
});

test('form goals: configured selector by id, data-wfa-conversion fallback, nothing for other forms', async () => {
  const b = browser();
  await settle();
  b.submit(form(['#demo']));
  b.submit(form([], { 'data-wfa-conversion': '', id: 'contact', 'data-wfa-content-id': 'Contact form', 'data-wfa-value': '50' }));
  b.submit(form([]));
  await settle();
  const goals = b.calls.slice(1).map((c) => c.body);
  assert.equal(goals.length, 2);
  assert.deepEqual(goals[0], { kind: 'goal', url: 'https://shop.test/start', goalId: 'g-form', siteId: 'site-1' });
  assert.deepEqual(goals[1], { kind: 'goal', url: 'https://shop.test/start', formId: 'contact', contentId: 'Contact form', value: 50, siteId: 'site-1' });
});

test('suppressed: GPC, stored refusal, Cookiebot refusal, Consent Mode denied, missing aggregate flag', async () => {
  const variants = [
    { gpc: true },
    { stored: { analytics: false, expiresAt: '2099-01-01T00:00:00Z' } },
    { cookiebot: { hasResponse: true, consent: { statistics: false } } },
    { dataLayer: [['consent', 'default', { analytics_storage: 'granted' }], ['consent', 'update', { analytics_storage: 'denied' }]] },
    { config: { siteId: 'site-1', apiKey: 'tk_key' } },
  ];
  for (const v of variants) {
    const b = browser(v);
    await settle();
    assert.equal(b.calls.length, 0, JSON.stringify(v));
  }
});

test('a later refusal stops further hits; a later grant resumes', async () => {
  const b = browser();
  await settle();
  b.consent({ analytics: false });
  b.ctx.history.pushState({}, '', '/after-refusal');
  await settle();
  assert.equal(b.calls.length, 1);
  b.consent({ analytics: true });
  b.ctx.history.pushState({}, '', '/after-grant');
  await settle();
  assert.equal(b.calls.length, 2);
});

test('loaded twice on one page still counts once (Review Focus 1)', async () => {
  const b = browser();
  b.run();
  await settle();
  assert.equal(b.calls.length, 1);
});

test('excludePaths: no page views or goal hits on excluded path prefixes', async () => {
  const b = browser({ config: { siteId: 'site-1', apiKey: 'tk_key', aggregate: true, excludePaths: ' /dashboard, ,/tracking-check' },
                      pathname: '/dashboard/x' });
  await settle();
  assert.equal(b.calls.length, 0, 'initial excluded page sends nothing');
  b.ctx.history.pushState({}, '', '/pricing');
  await settle();
  assert.equal(b.calls.length, 1);
  assert.equal(b.calls[0].body.url, 'https://shop.test/pricing');
  b.ctx.history.pushState({}, '', '/tracking-check/r/abc');
  b.submit(form(['#demo'], { 'data-wfa-conversion': '' }));
  await settle();
  assert.equal(b.calls.length, 1, 'excluded page view and goal send nothing');
});

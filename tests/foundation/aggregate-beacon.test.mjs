// tests/foundation/aggregate-beacon.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../../src/lib/aggregate-beacon.js', import.meta.url), 'utf8');
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };

function browser({ config = { siteId: 'site-1', apiKey: 'tk_key', aggregate: true }, stored = null, gpc = false,
                   cookiebot, dataLayer, referrer = 'https://www.linkedin.com/feed/', search = '?utm_source=linkedin&utm_campaign=q4',
                   goals = [{ id: 'g-form', selector: '#demo' }], pathname = '/start', visibility } = {}) {
  const calls = [];
  const storageTouches = [];
  const listeners = new Map();
  const on = (target) => ({
    addEventListener(n, h) { (listeners.get(target + n) || listeners.set(target + n, []).get(target + n)).push(h); },
    removeEventListener(n, h) { listeners.set(target + n, (listeners.get(target + n) || []).filter((x) => x !== h)); },
  });
  // Fake clock and timers: elapse(ms) advances Date.now() and runs what is due.
  let now = 0, nextId = 1;
  const timers = new Map();
  const setTimeout = (fn, ms) => { const id = nextId++; timers.set(id, { fn, at: now + ms }); return id; };
  const clearTimeout = (id) => timers.delete(id);
  const elapse = (ms) => {
    now += ms;
    for (const [id, t] of [...timers]) if (t.at <= now) { timers.delete(id); t.fn(); }
  };
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
    document: Object.assign(on('d'), { referrer, ...(visibility && { visibilityState: visibility }) }),
    setTimeout, clearTimeout, Date: { now: () => now },
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
  const setVisibility = (state) => { ctx.document.visibilityState = state; fire('d', 'visibilitychange', {}); };
  const listenerCount = (key) => (listeners.get(key) || []).length;
  return { calls, storageTouches, ctx, run, submit, consent, history, location, elapse, setVisibility, fire, listenerCount };
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

const engagement = (b) => b.calls.filter((c) => c.body.kind === 'engagement').map((c) => c.body);

test('page view goes out at once, also for a visitor who leaves quickly', async () => {
  const b = browser();
  b.elapse(500);
  b.fire('w', 'pagehide', {});
  await settle();
  assert.equal(b.calls.length, 1);
  assert.equal(b.calls[0].body.kind, 'pageview');
  assert.deepEqual(engagement(b), [], 'under a second of engagement is not sent');
});

test('engagement: one ping when 10 s of visible time is reached, then on hide', async () => {
  const b = browser();
  b.elapse(9999);
  await settle();
  assert.deepEqual(engagement(b), []);
  b.elapse(1);
  await settle();
  assert.deepEqual(engagement(b), [{ kind: 'engagement', url: 'https://shop.test/start', ms: 10000, siteId: 'site-1' }]);
  b.elapse(5000);
  b.setVisibility('hidden');
  b.elapse(60000);
  await settle();
  assert.deepEqual(engagement(b).map((e) => e.ms), [10000, 5000], 'background time does not count');
  b.setVisibility('visible');
  b.elapse(2000);
  b.fire('w', 'pagehide', {});
  await settle();
  assert.deepEqual(engagement(b).map((e) => e.ms), [10000, 5000, 2000]);
});

test('engagement: visible time adds up across hide/show before the 10 s ping', async () => {
  const b = browser();
  b.elapse(4000);
  b.setVisibility('hidden');
  b.setVisibility('visible');
  b.elapse(6000);
  await settle();
  assert.deepEqual(engagement(b).map((e) => e.ms), [4000, 6000], 'hide sends 4 s; the timer fires at 10 s in total');
});

test('engagement: prerendered time does not count', async () => {
  const b = browser({ visibility: 'prerender' });
  b.elapse(30000);
  await settle();
  assert.deepEqual(engagement(b), []);
  b.setVisibility('visible');
  b.elapse(10000);
  await settle();
  assert.deepEqual(engagement(b).map((e) => e.ms), [10000]);
});

test('engagement: SPA navigation sends the previous page time before the new page view; excluded paths send none', async () => {
  const b = browser({ config: { siteId: 'site-1', apiKey: 'tk_key', aggregate: true, excludePaths: '/admin' } });
  b.elapse(3000);
  b.ctx.history.pushState({}, '', '/pricing');
  await settle();
  assert.deepEqual(b.calls.map((c) => [c.body.kind, c.body.url, c.body.ms]), [
    ['pageview', 'https://shop.test/start', undefined],
    ['engagement', 'https://shop.test/start', 3000],
    ['pageview', 'https://shop.test/pricing', undefined],
  ]);
  b.elapse(2000);
  b.ctx.history.pushState({}, '', '/admin/x');
  b.elapse(20000);
  b.setVisibility('hidden');
  await settle();
  assert.deepEqual(engagement(b).map((e) => [e.url, e.ms]), [
    ['https://shop.test/start', 3000], ['https://shop.test/pricing', 2000],
  ]);
});

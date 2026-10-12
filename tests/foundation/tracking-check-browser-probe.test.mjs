import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProbeSource, pickConsentButton, inPageCollect, cmpSignal, consentSignal } from '../../supabase/functions/_shared/tracking-check/browser-probe.js';
import { runBrowserProbe } from '../../supabase/functions/_shared/tracking-check/browserless.ts';

test('picks reject and accept buttons in Swedish and English', () => {
  const c = (...texts) => texts.map((text, index) => ({ index, text }));
  assert.equal(pickConsentButton(c('Inställningar', 'Neka alla', 'Acceptera alla'), 'reject'), 1);
  assert.equal(pickConsentButton(c('Inställningar', 'Neka alla', 'Acceptera alla'), 'accept'), 2);
  assert.equal(pickConsentButton(c('Customize', 'Only necessary cookies', 'Accept all cookies'), 'reject'), 1);
  assert.equal(pickConsentButton(c('Read more', 'Settings'), 'reject'), null);
});

test('collects consent commands, Enhanced Conversions config and storage keys from the page', () => {
  const store = (keys) => ({ length: keys.length, key: (i) => keys[i] });
  globalThis.window = {
    dataLayer: [{ event: 'gtm.js' }, ['consent', 'default', { ad_storage: 'denied', wait_for_update: 500 }], ['config', 'AW-1', { allow_enhanced_conversions: true }]],
    __tcCsp: [{ blockedUrl: 'https://js.hs-scripts.com/1.js', directive: 'script-src-elem' }],
    localStorage: store(['_hjSession']), sessionStorage: store([]),
    document: { documentElement: { outerHTML: '<html></html>' } },
  };
  try {
    const out = inPageCollect(true);
    assert.deepEqual(out.consentCommands, [{ kind: 'default', params: { ad_storage: 'denied', wait_for_update: '500' } }]);
    assert.equal(out.ec, true);
    assert.deepEqual(out.storageKeys, ['_hjSession']);
    assert.equal(out.csp.length, 1);
    assert.equal(out.html, '<html></html>');
  } finally {
    delete globalThis.window;
  }
});

test('the probe source is a valid ES module with a default export', async () => {
  const mod = await import('data:text/javascript,' + encodeURIComponent(buildProbeSource()));
  assert.equal(typeof mod.default, 'function');
});

test('runBrowserProbe posts code and context, unwraps the response and reports errors', async () => {
  let sent;
  const observation = { url: 'https://new.example/', cmp: 'cookieyes', states: [], html: '' };
  const ok = async (url, init) => { sent = { url, body: JSON.parse(init.body) }; return Response.json({ data: observation, type: 'application/json' }); };
  const result = await runBrowserProbe({ endpoint: 'https://bl.example/', token: 't k', url: 'https://new.example/', states: ['none'], basicAuth: null, fetchImpl: ok });
  assert.equal(result.cmp, 'cookieyes');
  assert.equal(sent.url, 'https://bl.example/function?token=t%20k&timeout=90000');
  assert.deepEqual(sent.body.context, { url: 'https://new.example/', states: ['none'], basicAuth: null });
  assert.match(sent.body.code, /export default async function/);

  const denied = async () => new Response('bad token', { status: 401 });
  await assert.rejects(runBrowserProbe({ endpoint: 'https://bl.example', token: 't', url: 'https://new.example/', states: ['none'], basicAuth: null, fetchImpl: denied }), /Browserless 401/);
  await assert.rejects(runBrowserProbe({ endpoint: 'https://bl.example', token: 't', url: 'http://10.0.0.1/', states: ['none'], basicAuth: null, fetchImpl: ok }), /Blocked host/);
});

test('collects Consent Mode defaults from google_tag_data when the dataLayer has none', () => {
  globalThis.window = {
    dataLayer: [['consent', 'update', { analytics_storage: 'granted' }]],
    google_tag_data: { ics: { entries: {
      ad_storage: { default: false }, analytics_storage: { default: 'denied' }, ad_user_data: { default: false }, ad_personalization: { default: true }, functionality_storage: {},
    } } },
    localStorage: { length: 0 }, sessionStorage: { length: 0 },
  };
  try {
    const out = inPageCollect(false);
    assert.deepEqual(out.consentCommands, [
      { kind: 'default', params: { ad_storage: 'denied', analytics_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'granted' } },
      { kind: 'update', params: { analytics_storage: 'granted' } },
    ]);
  } finally {
    delete globalThis.window;
  }
});

test('cmpSignal sees CMPs the visible-banner heuristic cannot (TCF API, globals, shadow DOM, iframes)', () => {
  assert.equal(cmpSignal({}, [], []), false);
  assert.equal(cmpSignal({ __tcfapi() {} }, [], []), true);
  assert.equal(cmpSignal({ UC_UI: {} }, [], []), true);
  assert.equal(cmpSignal({}, ['usercentrics-root '], []), true);
  assert.equal(cmpSignal({}, ['app-shell main'], []), false);
  assert.equal(cmpSignal({}, [], ['https://cdn.privacy-mgmt.com/index.html?message_id=1']), true);
  assert.equal(cmpSignal({}, [], ['https://consent.trustarc.com/x']), true);
  assert.equal(cmpSignal({}, [], ['https://www.youtube.com/embed/x', 'about:blank', '']), false);
});

test('consentSignal recognises stored consent choices', () => {
  assert.equal(consentSignal('', [], false), false);
  assert.equal(consentSignal('', [], true), true, 'Cookiebot.hasResponse');
  assert.equal(consentSignal('a=1; OptanonAlertBoxClosed=2026-10-13T10:00:00Z', [], false), true);
  assert.equal(consentSignal('cookieyes-consent=consentid:abc,consent:no,action:yes,necessary:yes', [], false), true);
  assert.equal(consentSignal('cookieyes-consent=consentid:abc,consent:no,action:no,necessary:yes', [], false), false, 'no decision yet');
  assert.equal(consentSignal('cookieyes-consent=consentid%3Aabc%2Caction%3Ayes', [], false), true, 'URL-encoded cookie');
  assert.equal(consentSignal('cmplz_banner-status=dismissed', [], false), true);
  assert.equal(consentSignal('', ['site_cookie_consent'], false), true, 'CortIQ banner');
  assert.equal(consentSignal('_ga=GA1.1.1', ['other'], false), false);
});

// ── observeState through the real probe module with a fake Puppeteer ─────────────────────
// Each load (goto, then reload) is described by: status, requests, cookies, globals (window
// properties), banner (a visible cookie banner element) and storage (localStorage keys).
function fakeBrowser(loadsFor) {
  return {
    async createBrowserContext() {
      return {
        async close() {},
        async newPage() {
          const loads = [];
          let win = null;
          let cookies = [];
          const listeners = [];
          const elements = (banner) => (banner ? [{ getBoundingClientRect: () => ({ width: 400, height: 120 }) }] : []);
          const load = (spec) => {
            const keys = spec.storage ?? [];
            win = { ...(spec.globals ?? {}), dataLayer: [], localStorage: { length: keys.length, key: (i) => keys[i] }, sessionStorage: { length: 0 } };
            win.document = {
              title: '', body: { innerText: '' }, cookie: '', documentElement: { outerHTML: '<html></html>' },
              querySelectorAll: (sel) => (/cookie/.test(sel) ? elements(spec.banner) : []),
              querySelector: () => null, getElementById: () => null,
            };
            cookies = [...cookies, ...(spec.cookies ?? [])];
            for (const r of spec.requests ?? []) for (const fn of listeners) fn({ url: () => r.url, postData: () => r.postData ?? null, resourceType: () => 'script' });
            return { status: () => spec.status ?? 200 };
          };
          const run = (fn, args) => {
            const saved = { window: globalThis.window, document: globalThis.document, getComputedStyle: globalThis.getComputedStyle };
            Object.assign(globalThis, { window: win, document: win.document, getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) });
            try { return typeof fn === 'string' ? new Function(fn)() : fn(...args); } finally { Object.assign(globalThis, saved); }
          };
          return {
            on(event, fn) { if (event === 'request') listeners.push(fn); },
            async authenticate() {}, async setViewport() {}, async evaluateOnNewDocument() {},
            async goto() { loads.push(...loadsFor()); return load(loads.shift()); },
            async reload() { return load(loads.shift() ?? {}); },
            async waitForNetworkIdle() {},
            async evaluate(fn, ...args) { return run(fn, args); },
            async createCDPSession() { return { send: async () => ({ cookies: cookies.map((c) => ({ value: '1', domain: '.new.example', ...c })) }) }; },
          };
        },
      };
    },
  };
}
async function probe(states, loadsByState) {
  const mod = await import('data:text/javascript,' + encodeURIComponent(buildProbeSource()));
  let i = 0;
  const browser = fakeBrowser(() => loadsByState[states[i++]]);
  const res = await mod.default({ page: { browser: () => browser }, context: { url: 'https://new.example/', states, basicAuth: null } });
  return Object.fromEntries(res.data.states.map((s) => [s.state, s]));
}
const cookiebot = (hasResponse) => ({ Cookiebot: { hasResponse, submitCustomConsent() {} } });

test('observeState records the HTTP status of the main document', async () => {
  const out = await probe(['none'], { none: [{ status: 500 }] });
  assert.equal(out.none.status, 500);
});

test('observeState only flags Enhanced Conversions on requests to Google hosts', async () => {
  const other = await probe(['none'], { none: [{ requests: [{ url: 'https://crm.example/api?user_data=1&em=x' }] }] });
  assert.equal(other.none.enhancedConversions, false);
  const google = await probe(['none'], { none: [{ requests: [{ url: 'https://www.google.com/ccm/collect?em=tv.1~em.abc' }] }] });
  assert.equal(google.none.enhancedConversions, true);
});

test('observeState keeps an adapter choice only when it is verified after the reload', async () => {
  const unverified = await probe(['reject'], { reject: [{ globals: cookiebot(false), banner: true }, { globals: cookiebot(false), banner: true }] });
  assert.equal(unverified.reject.method, 'not_automated');
  const viaSignal = await probe(['reject'], { reject: [{ globals: cookiebot(false), banner: true }, { globals: cookiebot(true), banner: true }] });
  assert.equal(viaSignal.reject.method, 'adapter');
  const bannerGone = await probe(['reject'], { reject: [{ globals: cookiebot(false), banner: true }, { globals: cookiebot(false), banner: false }] });
  assert.equal(bannerGone.reject.method, 'adapter');
  const newCookie = await probe(['reject'], { reject: [{ globals: cookiebot(false), banner: true }, { globals: cookiebot(false), banner: true, cookies: [{ name: 'CookieConsent' }] }] });
  assert.equal(newCookie.reject.method, 'adapter');
});

test('observeState does not report "no banner needed" when a CMP is present but not visible', async () => {
  const hidden = await probe(['reject'], { reject: [{ globals: { __tcfapi() {} } }] });
  assert.equal(hidden.reject.method, 'not_automated');
  const none = await probe(['reject'], { reject: [{}] });
  assert.equal(none.reject.method, 'not_needed');
});

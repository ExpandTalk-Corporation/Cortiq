import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProbeSource, pickConsentButton, inPageCollect } from '../../supabase/functions/_shared/tracking-check/browser-probe.js';
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

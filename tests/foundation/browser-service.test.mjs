import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../browser-service/app.mjs';
import { runBrowserProbe } from '../../supabase/functions/_shared/tracking-check/browserless.ts';

const TOKEN = 'x'.repeat(32);

function fakeLaunch(log = []) {
  return async () => {
    const page = {
      setViewport: async (v) => log.push(['viewport', v]),
      goto: async (url, opts) => log.push(['goto', url, opts]),
      screenshot: async (opts) => { log.push(['screenshot', opts]); return Buffer.from('PNG'); },
    };
    return { newPage: async () => page, close: async () => log.push(['close']) };
  };
}

async function serve(opts) {
  const server = createApp({ token: TOKEN, launch: fakeLaunch(), ...opts });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) };
}

test('rejects requests without the right token', async () => {
  const s = await serve();
  try {
    for (const q of ['', '?token=wrong', `?token=${'y'.repeat(32)}`]) {
      const res = await fetch(`${s.base}/function${q}`, { method: 'POST', body: '{}' });
      assert.equal(res.status, 401);
    }
    assert.equal((await fetch(`${s.base}/health`)).status, 200);
  } finally { await s.close(); }
});

test('/function runs the module and answers in the Browserless { data, type } shape', async () => {
  const s = await serve();
  try {
    const code = 'export default async function ({ page, context }) { return { data: { states: [], echo: context.url, hasPage: !!page }, type: "application/json" }; }';
    const res = await fetch(`${s.base}/function?token=${TOKEN}&timeout=5000`, { method: 'POST', body: JSON.stringify({ code, context: { url: 'https://example.com/' } }) });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { states: [], echo: 'https://example.com/', hasPage: true });
  } finally { await s.close(); }
});

test('the existing Tracking Check client parses the service response', async () => {
  const s = await serve();
  try {
    const out = await runBrowserProbe({
      endpoint: s.base, token: TOKEN, url: 'https://example.com/', states: ['none'], basicAuth: null,
      // The probe source is replaced to avoid needing Chromium; endpoint + response handling stay real.
      fetchImpl: (u, init) => fetch(u, { ...init, body: JSON.stringify({ ...JSON.parse(init.body), code: 'export default async () => ({ data: { states: [], html: "" }, type: "application/json" })' }) }),
    });
    assert.deepEqual(out, { states: [], html: '' });
  } finally { await s.close(); }
});

test('/screenshot passes viewport and goto options and never writes to disk', async () => {
  const log = [];
  const s = await serve({ launch: fakeLaunch(log) });
  try {
    const res = await fetch(`${s.base}/screenshot?token=${TOKEN}`, {
      method: 'POST',
      body: JSON.stringify({ url: 'https://example.com/', options: { fullPage: true, type: 'png', path: '/tmp/x.png' }, viewport: { width: 1920, height: 1080 }, gotoOptions: { waitUntil: 'networkidle2', timeout: 45000 } }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/png');
    assert.equal(await res.text(), 'PNG');
    assert.deepEqual(log[0], ['viewport', { width: 1920, height: 1080 }]);
    assert.equal(log[1][1], 'https://example.com/');
    assert.equal(log[2][1].path, undefined);
    assert.deepEqual(log.at(-1), ['close']);
  } finally { await s.close(); }
});

test('rejects non-http URLs and modules without a default export', async () => {
  const s = await serve();
  try {
    const shot = await fetch(`${s.base}/screenshot?token=${TOKEN}`, { method: 'POST', body: JSON.stringify({ url: 'file:///etc/passwd' }) });
    assert.equal(shot.status, 400);
    const fn = await fetch(`${s.base}/function?token=${TOKEN}`, { method: 'POST', body: JSON.stringify({ code: '1+1' }) });
    assert.equal(fn.status, 400);
  } finally { await s.close(); }
});

test('times out long tasks and closes the browser', async () => {
  const log = [];
  const s = await serve({ launch: fakeLaunch(log) });
  try {
    const code = 'export default async () => new Promise((r) => setTimeout(() => r({ data: {}, type: "application/json" }), 2000))';
    const res = await fetch(`${s.base}/function?token=${TOKEN}&timeout=100`, { method: 'POST', body: JSON.stringify({ code }) });
    assert.equal(res.status, 408);
    assert.deepEqual(log.at(-1), ['close']);
  } finally { await s.close(); }
});

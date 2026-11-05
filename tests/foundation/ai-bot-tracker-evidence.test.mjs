import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEdge } from './edge-harness.mjs';

// Trackers before 5.5.8 probed on soft signals that are normal in Safari/Firefox and
// logged real iPhones as "Unknown Bot". The endpoint must drop such reports itself,
// because WordPress sites keep a cached old tracker until the plugin updates.

const SITE = '482bf9a6-1ab8-4536-b0f3-16c875cff677';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5.2 Mobile/15E148 Safari/604.1';
const SOFT = { noPlugins: true, noChromeRuntime: true, noNotifications: true, noSpeech: true, singleLanguage: true, noDeviceMemory: true };

function recordingClient() {
  const calls = [];
  const chain = () => new Proxy(function () {}, {
    get: (_t, key) => key === 'then'
      ? (resolve) => resolve({ data: null, error: null })
      : (...args) => { calls.push([key, ...args]); return chain(); },
  });
  return { calls, client: { from: (t) => { calls.push(['from', t]); return chain(); }, rpc: (n) => { calls.push(['rpc', n]); return chain(); } } };
}

function post(ua, body) {
  return new Request('https://edge.test/ai-bot-tracker', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': ua },
    body: JSON.stringify({ siteId: SITE, url: 'https://expandtalk.se/', ...body }),
  });
}

test('an iPhone probe with only soft signals is acknowledged and not stored', async () => {
  const { calls, client } = recordingClient();
  const handler = loadEdge('ai-bot-tracker', client);
  const res = await handler(post(IPHONE, { probeData: { jsExecuted: true, signals: SOFT, capScore: 6, knownAgent: false } }));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).skipped, 'no_bot_evidence');
  assert.deepEqual(calls, []);
});

for (const [label, ua, body] of [
  ['webdriver signal', IPHONE, { probeData: { jsExecuted: true, signals: { ...SOFT, webdriver: true } } }],
  ['honeypot trigger', IPHONE, { probeData: { jsExecuted: true, signals: { honeypotTriggered: true } } }],
  ['citation data', IPHONE, { citationData: { url: 'https://expandtalk.se/', utm_source: 'chatgpt' } }],
  ['registered AI UA', 'Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)', {}],
]) {
  test(`${label} still reaches storage`, async () => {
    const { calls, client } = recordingClient();
    const handler = loadEdge('ai-bot-tracker', client);
    const res = await handler(post(ua, body));
    assert.notEqual((await res.json()).skipped, 'no_bot_evidence');
    assert.ok(calls.length > 0, 'went past the guard');
  });
}

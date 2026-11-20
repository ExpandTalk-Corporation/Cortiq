// tests/foundation/reported-channel-form.test.mjs
// Attribution layer 1.5, form path (jurist review 2026-11-20, blocking 3 and 5): the tracker reads
// only the site-configured select/radio, on submit, with analytics consent, maps it in the browser
// and sends only the category; full mode only. track-event keeps the category out of
// tracking_events; record-conversion stores it only when the SQL consent gate says yes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import { REPORTED_CHANNELS } from '../../supabase/functions/_shared/reported-channel.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const tracker = read('../../public/spa-tracking.js');
const settle = async () => { for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve)); };

const CONFIG = { field: 'heard_from', map: { 'chatgpt': 'ai_assistant', 'google': 'organic_search', 'religion': 'faith' } };
const GOALS = [{ id: 'contact', type: 'form_submission', selector: '#contact' }];

function run({ cookieless = false, consent = true, config = CONFIG } = {}) {
  const requests = [];
  const listeners = new Map();
  const surface = () => ({
    addEventListener(name, handler) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(handler); },
    removeEventListener() {},
    dispatchEvent(event) { for (const handler of [...(listeners.get(event.type) || [])]) handler(event); },
  });
  const window = Object.assign(surface(), {
    cortiqConfig: { siteId: 'site-1', apiUrl: 'https://api.test/v1', cookieless },
    location: { href: 'https://site.test/contact', origin: 'https://site.test', pathname: '/contact', search: '' },
    innerWidth: 1200, innerHeight: 800, scrollY: 0,
  });
  const document = Object.assign(surface(), {
    readyState: 'complete', referrer: '', title: 'Contact', documentElement: { scrollHeight: 4000 },
    currentScript: { getAttribute: () => null },
    createElement: () => ({ getContext: () => null }),
    querySelectorAll: () => [],
  });
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  runInNewContext(tracker, {
    window, document, history: { pushState() {}, replaceState() {} }, crypto: webcrypto, URL, URLSearchParams, TextEncoder,
    screen: { width: 1200, height: 800 }, navigator: { userAgent: 'Mozilla/5.0 Firefox/130.0', language: 'sv' },
    localStorage: storage, sessionStorage: storage,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    MutationObserver: class { observe() {} disconnect() {} },
    console: { log() {}, warn() {}, error() {} },
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, requestAnimationFrame: (fn) => fn(),
    fetch: async (url, options) => {
      const body = options?.body ? JSON.parse(options.body) : null;
      requests.push({ url, body });
      const view = String(url).endsWith('/track-event') && body?.event_type === 'view';
      const json = view ? { success: true, goals: GOALS, ...(config && { reported_channel: config }) } : { success: true };
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => json };
    },
  });
  if (consent) window.dispatchEvent({ type: 'siteConsentUpdated', detail: { analytics: true, marketing: false } });
  return { requests, document, window };
}

// A form whose elements.namedItem behaves like the browser's: one field -> that element, several with
// the same name (including fields outside the form tag via form="id") -> a RadioNodeList-like list.
// The tracker must never fall back to querySelectorAll.
function form(fields, { conversion = false } = {}) {
  const names = [];
  return {
    names,
    id: 'contact',
    closest: (sel) => (sel === '#contact' ? {} : null),
    hasAttribute: (n) => conversion && n === 'data-wfa-conversion',
    getAttribute: () => null,
    querySelector: () => null,
    querySelectorAll() { throw new Error('querySelectorAll must not be used'); },
    elements: {
      namedItem(name) {
        names.push(name);
        const hits = fields.filter((f) => f.name === name);
        if (hits.length === 0) return null;
        if (hits.length === 1) return hits[0];
        return Object.assign(hits.slice(), { item: (i) => hits[i] ?? null });
      },
    },
  };
}
const select = (name, value, { disabled = false, optionDisabled = false, multiple = false } = {}) => ({
  tagName: 'SELECT', name, value, multiple, disabled, selectedIndex: 0, length: 1,
  options: [{ value, disabled: optionDisabled }],
});
const radio = (name, value, checked, disabled = false) => ({ tagName: 'INPUT', type: 'radio', name, value, checked, disabled });
const text = (name, value) => ({ tagName: 'INPUT', type: 'text', name, value });
const textarea = (name, value) => ({ tagName: 'TEXTAREA', name, value });

async function submit(r, f) {
  await settle();
  r.document.dispatchEvent({ type: 'submit', target: f });
  await settle();
  return r.requests.filter((x) => x.body?.event_type === 'conversion' || String(x.url).endsWith('/record-conversion'));
}
const goalHit = (sent) => sent.find((x) => x.body?.metadata?.goal_id === 'contact');

test('the tracker category list equals the shared list', () => {
  const list = tracker.match(/const REPORTED_CHANNELS = \[([\s\S]*?)\];/)[1];
  assert.deepEqual([...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]), [...REPORTED_CHANNELS]);
});

test('a configured select: only the mapped category is sent with the goal hit', async () => {
  const r = run();
  const f = form([text('heard_from', 'my secret note'), select('heard_from', ' ChatGPT ')]);
  const hit = goalHit(await submit(r, f));
  assert.ok(hit, 'goal hit sent');
  assert.equal(hit.body.metadata.reported_channel, 'ai_assistant');
  assert.deepEqual(f.names, ['heard_from'], 'only the configured name is looked up');
  assert.equal(JSON.stringify(r.requests).includes('my secret note'), false);
  assert.equal(JSON.stringify(r.requests).toLowerCase().includes('chatgpt'), false, 'raw answer never leaves the page');
});

test('radio group: the checked option; unknown value becomes other; invalid map targets are dropped', async () => {
  let r = run();
  let hit = goalHit(await submit(r, form([radio('heard_from', 'Google', false), radio('heard_from', 'A friend at church', true)])));
  assert.equal(hit.body.metadata.reported_channel, 'other');
  r = run();
  hit = goalHit(await submit(r, form([radio('heard_from', 'religion', true)])));
  assert.equal(hit.body.metadata.reported_channel, 'other', 'a map entry outside the list is ignored');
  r = run();
  hit = goalHit(await submit(r, form([radio('heard_from', 'Google', false)])));
  assert.equal('reported_channel' in hit.body.metadata, false, 'nothing chosen: nothing sent');
});

test('an empty or disabled choice sends nothing; a multiple select is not read', async () => {
  for (const fields of [
    [select('heard_from', '')],
    [select('heard_from', 'ChatGPT', { optionDisabled: true })],
    [select('heard_from', 'ChatGPT', { disabled: true })],
    [select('heard_from', 'ChatGPT', { multiple: true })],
    [radio('heard_from', 'ChatGPT', true, true)],
    [radio('heard_from', '', true)],
  ]) {
    const r = run();
    const hit = goalHit(await submit(r, form(fields)));
    assert.equal('reported_channel' in hit.body.metadata, false, JSON.stringify(fields));
  }
});

test('a radio group from namedItem (RadioNodeList), also with form="id" fields', async () => {
  const r = run();
  const f = form([radio('heard_from', 'Google', false), radio('heard_from', 'ChatGPT', true)]);
  const hit = goalHit(await submit(r, f));
  assert.equal(hit.body.metadata.reported_channel, 'ai_assistant');
  assert.match(tracker, /form\.elements\.namedItem\(cfg\.field\)/);
});

test('text inputs, textareas and other field names are never read', async () => {
  const r = run();
  const hit = goalHit(await submit(r, form([text('heard_from', 'ChatGPT'), textarea('heard_from', 'ChatGPT'), select('other_field', 'ChatGPT')])));
  assert.equal('reported_channel' in hit.body.metadata, false);
});

test('off without config, in cookieless mode and without consent', async () => {
  for (const opts of [{ config: null }, { cookieless: true }]) {
    const r = run(opts);
    const sent = await submit(r, form([select('heard_from', 'ChatGPT')], { conversion: true }));
    assert.equal(JSON.stringify(sent).includes('reported'), false, JSON.stringify(opts));
  }
  const r = run({ consent: false });
  const sent = await submit(r, form([select('heard_from', 'ChatGPT')], { conversion: true }));
  assert.equal(JSON.stringify(sent).includes('reported'), false);
});

test('record-conversion carries the category for data-wfa-conversion forms', async () => {
  const r = run();
  const sent = await submit(r, form([select('heard_from', 'google')], { conversion: true }));
  const rc = sent.find((x) => String(x.url).endsWith('/record-conversion'));
  assert.ok(rc, 'record-conversion called');
  assert.equal(rc.body.reportedChannel, 'organic_search');
});

test('track-event: the category never reaches tracking_events and config is full mode only', () => {
  const src = read('../../supabase/functions/track-event/index.ts');
  assert.match(src, /delete body\.metadata\.reported_channel;/);
  const strip = src.indexOf('delete body.metadata.reported_channel');
  const insert = src.indexOf("from('tracking_events')");
  assert.ok(strip > 0 && insert > strip, 'stripped before any tracking_events write');
  assert.match(src, /conv\.type === 'form_submission' \? reportedChannel : null/);
  assert.match(src, /rcRow\.tracking_mode !== 'cookieless'/);
  assert.match(src, /rcRow\.reported_channel_policy_version && rcRow\.reported_channel_form_field/);
});

test('record-conversion: the category goes through attach_reported_channel (consent gate in SQL)', () => {
  const src = read('../../supabase/functions/record-conversion/index.ts');
  assert.match(src, /if \(isReportedChannel\(reportedChannel\)\)/);
  assert.match(src, /rpc\('attach_reported_channel', \{\s*p_site_id: site\.id, p_conversion_id: inserted\.id, p_session: sessionId, p_category: reportedChannel,/);
  assert.doesNotMatch(src, /reported_channel:/, 'never written as a conversion_events column');
  assert.doesNotMatch(src, /from\('conversion_reported_channel'\)/, 'no direct table write');
});

// California follow-up R5 (jurist review 2026-11-21): form analytics in public/spa-tracking.js sends
// field name, label (<= 60 chars), time in field and error count, never what the visitor typed.
// This locks that boundary. The one documented exception is the site-configured "how did you hear
// about us" select/radio (tracker 5.5.21, readReportedChannel): read via form.elements.namedItem on
// submit and mapped in the browser to a fixed category; the raw choice is never sent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tracker = readFileSync(new URL('../../public/spa-tracking.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

function fnSource(name) {
  const start = tracker.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  let depth = 0;
  for (let i = tracker.indexOf('{', start); i < tracker.length; i++) {
    if (tracker[i] === '{') depth++;
    else if (tracker[i] === '}' && --depth === 0) return tracker.slice(start, i + 1);
  }
  throw new Error(`unbalanced ${name}`);
}
const formAnalytics = fnSource('setupFormAnalytics');

test('setupFormAnalytics: no value, value length, selection or key data in the source', () => {
  assert.doesNotMatch(formAnalytics, /\.value\b/, 'reads a field value');
  assert.doesNotMatch(formAnalytics, /selectionStart|selectionEnd|setSelectionRange/);
  // (charCodeAt in formKey hashes the form's action/id, not input.)
  assert.doesNotMatch(formAnalytics, /\.key\b|keyCode|\.code\b|\.which\b|\.charCode\b/);
  assert.doesNotMatch(formAnalytics, /'(keydown|keyup|keypress|input|change|paste|beforeinput)'/);
  assert.doesNotMatch(formAnalytics, /namedItem|FormData|checked|selectedIndex|innerText|outerHTML/);
});

test('setupFormAnalytics: field_data has exactly name, label, focus time and errors', () => {
  const m = formAnalytics.match(/return \{ (field_name: [^}]*) \};/);
  assert.ok(m, 'field_data mapping found');
  const keys = m[1].split(',').map((p) => p.split(':')[0].trim());
  assert.deepEqual(keys, ['field_name', 'field_label', 'focus_time_ms', 'errors']);
  assert.match(formAnalytics, /\.slice\(0, 60\)/, 'label capped at 60 chars');
});

// Runs the real function against fake fields that record every property read.
function runFormAnalytics() {
  const reads = [];
  const posts = [];
  const handlers = new Map();
  const on = (target) => (type, fn) => { handlers.set(`${target}:${type}`, fn); };
  const field = (name, type, id) => new Proxy({ name, type, id, addEventListener: on(name) }, {
    get(t, prop) {
      if (typeof prop === 'string') reads.push(`${name}.${prop}`);
      if (prop === 'value') return 'secret typed by the visitor';
      if (prop === 'selectionStart' || prop === 'selectionEnd') return 7;
      return t[prop];
    },
  });
  const inputs = [field('email', 'email', 'f-email'), field('message', 'textarea', ''), field('token', 'hidden', '')];
  const form = {
    action: '/contact', id: 'contact', className: 'contact', elements: inputs,
    classList: { contains: () => false }, getAttribute: () => null, addEventListener: on('form'),
  };
  const document = {
    forms: [form], body: null, hidden: false,
    querySelector: (sel) => (sel === 'label[for="f-email"]' ? { textContent: 'Your email address' } : null),
    addEventListener: on('document'),
  };
  const window = { addEventListener: on('window') };
  const apiFetch = (url, init) => { posts.push({ url, body: JSON.parse(init.body) }); return Promise.resolve(); };
  const setup = new Function('hasInteractionConsent', 'deferUntilInteractionConsent', 'apiFetch', 'API_KEY', 'SITE_ID',
    'touchSession', 'SESSION_ID', 'document', 'window', 'MutationObserver', `${formAnalytics}\nreturn setupFormAnalytics;`)(
    () => true, () => {}, apiFetch, null, 'site-1', () => 'sess-1', 'sess-1', document, window, undefined);
  setup();
  handlers.get('email:focus')(); handlers.get('email:invalid')(); handlers.get('email:blur')();
  handlers.get('message:focus')(); handlers.get('message:blur')();
  handlers.get('form:submit')();
  return { reads, posts };
}

test('setupFormAnalytics at runtime: never reads value or selection, and sends no typed text', () => {
  const { reads, posts } = runFormAnalytics();
  assert.deepEqual(reads.filter((r) => /\.(value|selectionStart|selectionEnd)$/.test(r)), []);
  assert.equal(posts.length, 1);
  const raw = JSON.stringify(posts[0].body);
  assert.doesNotMatch(raw, /secret typed/);
  const { metadata } = posts[0].body;
  assert.equal(metadata.status, 'completed');
  assert.deepEqual(metadata.field_data.map((f) => Object.keys(f)), [
    ['field_name', 'field_label', 'focus_time_ms', 'errors'], ['field_name', 'field_label', 'focus_time_ms', 'errors']]);
  assert.deepEqual(metadata.field_data.map((f) => [f.field_name, f.field_label, f.errors]), [['email', 'Your email address', 1], ['message', 'message', 0]]);
  assert.ok(!metadata.field_data.some((f) => f.field_name === 'token'), 'hidden fields skipped');
});

test('the only documented exception: the reported-channel select/radio, mapped to a category', () => {
  // namedItem appears once in the whole tracker, inside readReportedChannel.
  assert.equal(tracker.match(/namedItem\(/g).length, 1);
  const read = fnSource('readReportedChannel');
  assert.match(read, /form\.elements\.namedItem\(cfg\.field\)/);
  assert.match(read, /return cfg\.map\[key\] \|\| 'other';/, 'only a category leaves the function');
  // reportedChoice reads a single select or a checked radio, nothing else, and only readReportedChannel calls it.
  const choice = fnSource('reportedChoice');
  assert.match(choice, /el\.tagName === 'SELECT' && !el\.multiple/);
  assert.match(choice, /el\.type === 'radio' && el\.checked/);
  assert.equal(tracker.match(/reportedChoice\(/g).length, 2, 'definition + one call');
});

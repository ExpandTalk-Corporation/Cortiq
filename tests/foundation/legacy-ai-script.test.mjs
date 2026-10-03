// public/ai-tracking-unified.js runs without consent, so it must stay a pure bot layer:
// no device storage, no fingerprinting and no human AI-referral measurement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const code = readFileSync(new URL('../../public/ai-tracking-unified.js', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

test('legacy AI script writes nothing to the device and does not fingerprint', () => {
  for (const banned of ['localStorage', 'sessionStorage', 'document.cookie', 'toDataURL', 'getContext(']) {
    assert.ok(!code.includes(banned), `must not use ${banned}`);
  }
});

test('legacy AI script sends no human AI-referral data', () => {
  assert.ok(!code.includes('ai-search-tracker'));
  assert.ok(!code.includes('citationData'));
});

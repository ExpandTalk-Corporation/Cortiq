// tests/foundation/referrer-policy.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { storedReferrer } from '../../supabase/functions/_shared/referrer.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

// Regression: every live company had consent_settings.gdpr_settings = null, so the old
// `if (!gdpr_settings?.store_referrer)` gate dropped 100 % of referrers from 2026-07-16.
test('missing gdpr settings keep the referrer (default on)', () => {
  assert.equal(storedReferrer('https://chatgpt.com/', null), 'https://chatgpt.com/');
  assert.equal(storedReferrer('https://www.google.com/', undefined), 'https://www.google.com/');
  assert.equal(storedReferrer('https://www.google.com/', {}), 'https://www.google.com/');
  assert.equal(storedReferrer('https://www.google.com/', { store_user_agent: false }), 'https://www.google.com/');
});

test('explicit store_referrer: false is still honoured', () => {
  assert.equal(storedReferrer('https://chatgpt.com/', { store_referrer: false }), null);
});

test('query string and fragment are stripped', () => {
  assert.equal(
    storedReferrer('https://mail.example.com/inbox?email=a%40b.se&token=x#msg', {}),
    'https://mail.example.com/inbox',
  );
});

test('android-app referrers keep the package name', () => {
  assert.equal(storedReferrer('android-app://com.openai.chatgpt/', {}), 'android-app://com.openai.chatgpt/');
});

test('empty, malformed and non-web schemes are dropped', () => {
  for (const v of ['', null, undefined, 'not a url', 'javascript:alert(1)', 'data:text/html,x', 42]) {
    assert.equal(storedReferrer(v, {}), null, String(v));
  }
});

test('track-event uses the shared policy instead of the default-deny gate', () => {
  const src = read('../../supabase/functions/track-event/index.ts');
  assert.match(src, /storedReferrer\(/);
  assert.doesNotMatch(src, /!consentSettings\.gdpr_settings\?\.store_referrer/);
});

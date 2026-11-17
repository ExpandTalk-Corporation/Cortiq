// P-a/b/c: the GTM container audit privacy blurb must live in its own subsection (not inside 3B's server/edge
// logs section, which is about a different data flow), must mention the audit engine version, and must say
// where counters are untouched rather than implying nothing about the request is ever logged anywhere.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../../src/pages/Privacy.tsx', import.meta.url), 'utf8');

test('the GTM container audit has its own subsection after 3B/3C', () => {
  const i3B = src.indexOf('3B. Server');
  const i3C = src.indexOf('3C. Aggregate Measurement');
  const i3D = src.indexOf('3D.');
  const i4 = src.indexOf('4. First-Party Data from Logged-In Users');
  assert.ok(i3B > 0 && i3C > i3B && i3D > i3C && i4 > i3D, 'expected order 3B < 3C < 3D < 4');
  const gtmBox = src.indexOf('GTM container audit');
  assert.ok(gtmBox > i3D && gtmBox < i4, 'GTM container audit box must be inside the new 3D section');
});

test('the GTM container audit box names the audit engine version and the counters', () => {
  const box = src.slice(src.indexOf('GTM container audit'), src.indexOf('4. First-Party Data from Logged-In Users'));
  assert.match(box, /audit engine version/);
  assert.match(box, /are stored\s+in the counters/);
});

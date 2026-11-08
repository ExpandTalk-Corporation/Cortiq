// tests/foundation/builtin-segments.test.mjs
// The built-in segment rules live in SQL; these tests keep them in step with the names in
// the UI and with the lists the Ads, Social media and AI referral views already use.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BUILTIN_SEGMENTS, SEGMENT_PRESETS, builtinSegment, builtinSegmentId } from '../../src/lib/dashboard/builtinSegments.ts';
import { PAID_MEDIUMS } from '../../src/lib/paidMediums.ts';
import { traffic } from '../../src/ontology/traffic.ts';

const sql = readFileSync('supabase/migrations/20261109000003_builtin_segments.sql', 'utf8');
const fn = sql.slice(sql.indexOf('FUNCTION public.builtin_segment_match'), sql.indexOf('GRANT EXECUTE'));

test('every UI segment has a SQL rule and vice versa', () => {
  const sqlKeys = [...fn.matchAll(/WHEN '([a-z]+)'\s+THEN/g)].map((m) => m[1]).sort();
  assert.deepEqual(sqlKeys, BUILTIN_SEGMENTS.map((s) => s.key).sort());
});

test('paid uses the same mediums as Ads', () => {
  const list = fn.match(/v\.med IN \(([^)]+)\)/)[1].split(',').map((m) => m.trim().replace(/'/g, ''));
  assert.deepEqual(list, [...PAID_MEDIUMS]);
});

test('social uses the same patterns as the Social media tab', () => {
  const tab = readFileSync('supabase/migrations/20261016000001_tabs_date_range_rpcs.sql', 'utf8');
  const social = tab.slice(tab.indexOf('FUNCTION public.get_social_daily'), tab.indexOf('agg AS', tab.indexOf('FUNCTION public.get_social_daily')));
  const pats = (s, col) => [...s.matchAll(new RegExp(`${col} +ILIKE '([^']+)'`, 'g'))].map((m) => m[1]).sort();
  assert.equal(pats(fn, 'c\\.ref').length, 15);
  assert.deepEqual(pats(fn, 'c\\.ref'), pats(social, 'ts\\.referrer'));
  assert.deepEqual(pats(fn, 'c\\.src'), pats(social, 'ts\\.utm_source'));
});

test('AI referrals cover every AI search referral in the traffic ontology', () => {
  for (const id of traffic.ai_search_referral.children) {
    for (const host of traffic[id].referrerPatterns ?? []) assert.ok(fn.includes(host.replace(/\./g, '\\.')), host);
    for (const src of traffic[id].utmSources ?? []) assert.match(fn, new RegExp(`\\^\\([a-z|]*${src}`), src);
  }
});

test('the overview applies built-in segments through the shared rule', () => {
  assert.match(sql, /f->>'field' = 'builtin'\s+THEN public\.builtin_segment_match\(/);
});

test('segment ids round-trip and presets name real segments', () => {
  assert.equal(builtinSegment(builtinSegmentId('ai')).key, 'ai');
  assert.equal(builtinSegment('builtin:nope'), null);
  assert.equal(builtinSegment('6f1c0f52-uuid'), null);
  for (const p of SEGMENT_PRESETS) assert.ok(BUILTIN_SEGMENTS.some((s) => s.key === p.segment), p.id);
});

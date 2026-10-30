// tests/foundation/pixel-readiness.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessPixelReadiness } from '../../src/lib/pixelReadiness.ts';

const base = { hasPrimaryGoal: true, primaryGoalStatus: 'healthy', primaryConversions30d: 0, acceptanceRate: 1, adsConnected: true, daysOfData: 30 };
const state = (over) => assessPixelReadiness({ ...base, ...over }).state;

test('no primary goal, then unhealthy primary goal, short-circuit', () => {
  assert.equal(state({ hasPrimaryGoal: false, primaryConversions30d: 500 }), 'no_primary_goal');
  for (const s of ['silent', 'fires_too_often', 'duplicate_primary']) {
    assert.equal(state({ primaryGoalStatus: s, primaryConversions30d: 500 }), 'fix_goals');
  }
});

test('threshold edges use effective conversions (conversions × acceptance)', () => {
  assert.equal(state({ primaryConversions30d: 29 }), 'aggregate_enough');
  assert.equal(state({ primaryConversions30d: 30 }), 'borderline');
  assert.equal(state({ primaryConversions30d: 49 }), 'borderline');
  assert.equal(state({ primaryConversions30d: 50 }), 'attribution_pays');
  // 80 conversions behind a 55% banner → 44 seen by the ad platform
  const r = assessPixelReadiness({ ...base, primaryConversions30d: 80, acceptanceRate: 0.55 });
  assert.equal(r.effectiveConversions, 44);
  assert.equal(r.state, 'borderline');
});

test('enough volume without an ad platform is still aggregate_enough, with a reason', () => {
  const r = assessPixelReadiness({ ...base, primaryConversions30d: 200, adsConnected: false });
  assert.equal(r.state, 'aggregate_enough');
  assert.ok(r.reasons.some((x) => x.includes('no ad platform')));
});

test('brand-new empty site: assumption + short history reasons, no NaN (Review Focus 5)', () => {
  const r = assessPixelReadiness({ ...base, primaryConversions30d: 0, acceptanceRate: null, daysOfData: 2 });
  assert.equal(r.state, 'aggregate_enough');
  assert.equal(r.acceptanceAssumed, true);
  assert.equal(r.acceptanceUsed, 0.5);
  assert.equal(r.effectiveConversions, 0);
  assert.ok(r.reasons.some((x) => x.includes('assumed 50%')));
  assert.ok(r.reasons.some((x) => x.includes('2 days')));
  assert.equal(r.reasons.some((x) => x.includes('NaN')), false);
});

test('out-of-range inputs are clamped', () => {
  const r = assessPixelReadiness({ ...base, primaryConversions30d: -5, acceptanceRate: 3 });
  assert.equal(r.effectiveConversions, 0);
  assert.equal(r.acceptanceUsed, 1);
});

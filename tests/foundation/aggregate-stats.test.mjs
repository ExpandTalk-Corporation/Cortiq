// tests/foundation/aggregate-stats.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toAggregateSummary, sourceLabel } from '../../src/lib/aggregateStats.ts';

test('sourceLabel: UTM wins, then referrer, else Direct', () => {
  assert.equal(sourceLabel({ utm_source: 'linkedin', utm_medium: 'paid', referrer_domain: 'linkedin.com' }), 'linkedin / paid');
  assert.equal(sourceLabel({ utm_source: 'newsletter' }), 'newsletter');
  assert.equal(sourceLabel({ referrer_domain: 'google.com' }), 'google.com');
  assert.equal(sourceLabel({}), 'Direct');
});

test('toAggregateSummary maps the RPC payload and tolerates junk', () => {
  const s = toAggregateSummary({
    visitors: 3, visits: '4', pageviews: 6, days_with_data: 1,
    top_sources: [{ referrer_domain: 'google.com', utm_source: '', utm_medium: '', visits: 1, visitors: 1 }],
    top_pages: [{ path: '/', pageviews: 3, entries: 2 }],
    conversions: [{ goal_id: 'g1', goal_name: 'Demo', referrer_domain: '', utm_source: 'linkedin', utm_medium: 'paid', conversions: 1, value: '100' }],
    conversions_by_goal: [{ goal_id: 'g1', goal_name: 'Demo', conversions: 2 }],
  });
  assert.deepEqual(s, {
    visitors: 3, visits: 4, pageviews: 6, daysWithData: 1,
    topSources: [{ label: 'google.com', visits: 1, visitors: 1 }],
    topPages: [{ path: '/', pageviews: 3, entries: 2 }],
    conversions: [{ goalId: 'g1', goalName: 'Demo', source: 'linkedin / paid', conversions: 1, value: 100 }],
    conversionsByGoal: [{ goalId: 'g1', goalName: 'Demo', conversions: 2 }],
  });
  assert.deepEqual(toAggregateSummary(null), {
    visitors: 0, visits: 0, pageviews: 0, daysWithData: 0, topSources: [], topPages: [], conversions: [], conversionsByGoal: [],
  });
});

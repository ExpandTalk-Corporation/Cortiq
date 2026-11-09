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
    visitors: 4, visits: '5', pageviews: 6, engaged_visits: 2, engagement_ms: 170000, filtered_hits: 9, days_with_data: 1,
    top_sources: [{ referrer_domain: 'google.com', utm_source: '', utm_medium: '', visits: 1, visitors: 1, engaged_visits: 1 }],
    top_pages: [{ path: '/', pageviews: 3, entries: 2 }],
    conversions: [{ goal_id: 'g1', goal_name: 'Demo', referrer_domain: '', utm_source: 'linkedin', utm_medium: 'paid', conversions: 1, value: '100' }],
    conversions_by_goal: [{ goal_id: 'g1', goal_name: 'Demo', conversions: 2 }],
  });
  assert.deepEqual(s, {
    visitors: 4, visits: 5, pageviews: 6,
    engagedVisits: 2, engagementRate: 0.4, engagedVisitsPerVisitor: 0.5, avgEngagementSeconds: 42.5, filteredHits: 9,
    daysWithData: 1,
    topSources: [{ label: 'google.com', visits: 1, visitors: 1, engagedVisits: 1 }],
    topPages: [{ path: '/', pageviews: 3, entries: 2 }],
    otherSources: { visits: 4, visitors: 3, engagedVisits: 1 },
    otherPages: { pageviews: 3 },
    conversions: [{ goalId: 'g1', goalName: 'Demo', source: 'linkedin / paid', conversions: 1, value: 100 }],
    conversionsByGoal: [{ goalId: 'g1', goalName: 'Demo', conversions: 2 }],
  });
  assert.deepEqual(toAggregateSummary(null), {
    visitors: 0, visits: 0, pageviews: 0, engagedVisits: 0, engagementRate: 0, engagedVisitsPerVisitor: 0,
    avgEngagementSeconds: 0, filteredHits: 0, daysWithData: 0, topSources: [], topPages: [], otherSources: null, otherPages: null, conversions: [], conversionsByGoal: [],
  });
});

test('toAggregateSummary: Other row makes the top lists add up to the totals', () => {
  const sources = Array.from({ length: 10 }, (_, i) => ({ referrer_domain: `s${i}.com`, visits: 10, visitors: 8, engaged_visits: 5 }));
  const pages = Array.from({ length: 10 }, (_, i) => ({ path: `/p${i}`, pageviews: 20, entries: 10 }));
  const s = toAggregateSummary({ visits: 130, visitors: 100, engaged_visits: 60, pageviews: 260, top_sources: sources, top_pages: pages });
  assert.deepEqual(s.otherSources, { visits: 30, visitors: 20, engagedVisits: 10 });
  assert.deepEqual(s.otherPages, { pageviews: 60 });
  assert.equal(s.topSources.reduce((a, r) => a + r.visits, 0) + s.otherSources.visits, s.visits);
  assert.equal(s.topPages.reduce((a, r) => a + r.pageviews, 0) + s.otherPages.pageviews, s.pageviews);
  // Nothing cut: no Other row; totals below the listed sum never go negative.
  const exact = toAggregateSummary({ visits: 10, pageviews: 5, top_sources: [{ visits: 10 }], top_pages: [{ path: '/', pageviews: 7 }] });
  assert.equal(exact.otherSources, null);
  assert.equal(exact.otherPages, null);
});

// tests/foundation/tabs-date-range.test.mjs
// Ten dashboard tabs follow the global date filter instead of local pickers or hardcoded
// windows; the year-based tabs compare with the same period one year earlier.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import {
  rangeDays, rangeBounds, sameRangeLastYear, monthsInRange, monthColumns, trendBuckets,
} from '../../src/lib/dashboard/filters.ts';
import { pickLowCTRPages } from '../../src/lib/dashboard/gscSnapshots.ts';
import * as reportRange from '../../supabase/functions/_shared/report-range.ts';

const MIGRATION = new URL('../../supabase/migrations/20261016000001_tabs_date_range_rpcs.sql', import.meta.url);
const src = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('PostgreSQL: date-range RPCs for AI bots, KPI fallback and social — bounds, access, legacy signature', async () => {
  const db = new PGlite();
  const fixture = readFileSync(new URL('./tabs-date-range.sql', import.meta.url), 'utf8');
  const migration = readFileSync(MIGRATION, 'utf8');
  try {
    await assert.doesNotReject(db.exec(fixture.replace(/^\\ir .*$/m, () => migration)));
  } finally {
    await db.close();
  }
});

test('range helpers: inclusive days, exclusive UTC end bound', () => {
  assert.equal(rangeDays('2026-09-01', '2026-09-30'), 30);
  assert.equal(rangeDays('2026-10-15', '2026-10-15'), 1);
  assert.deepEqual(rangeBounds('2026-02-27', '2026-02-28'),
    { start: '2026-02-27T00:00:00.000Z', end: '2026-03-01T00:00:00.000Z' });
  assert.deepEqual(rangeBounds('2026-12-31', '2026-12-31'),
    { start: '2026-12-31T00:00:00.000Z', end: '2027-01-01T00:00:00.000Z' });
});

test('same period one year earlier, Feb 29 clamps to Feb 28', () => {
  assert.deepEqual(sameRangeLastYear('2026-09-16', '2026-10-15'), { from: '2025-09-16', to: '2025-10-15' });
  assert.deepEqual(sameRangeLastYear('2028-02-01', '2028-02-29'), { from: '2027-02-01', to: '2027-02-28' });
  assert.deepEqual(sameRangeLastYear('2025-12-20', '2026-01-10'), { from: '2024-12-20', to: '2025-01-10' });
  // The edge functions use the same rule for their default comparison period.
  assert.deepEqual(reportRange.sameRangeLastYear({ startDate: '2028-02-01', endDate: '2028-02-29' }),
    { startDate: '2027-02-01', endDate: '2027-02-28' });
});

test('months, month columns and trend buckets follow the range', () => {
  assert.deepEqual(monthsInRange('2025-11-20', '2026-02-03'), ['2025-11', '2025-12', '2026-01', '2026-02']);
  assert.deepEqual(monthColumns('2025-11-20', '2026-02-03'), { months: ['11', '12', '01', '02'], foldedMonths: false });
  const yearLong = monthColumns('2025-10-16', '2026-10-15');
  assert.equal(yearLong.months.length, 12);
  assert.equal(yearLong.months[0], '10');
  assert.equal(yearLong.foldedMonths, true, 'October appears in both years');

  const daily = trendBuckets('2026-09-29', '2026-10-02');
  assert.equal(daily.granularity, 'day');
  assert.deepEqual(daily.keys, ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
  assert.equal(daily.keyOf('2026-10-01'), '2026-10-01');
  const monthly = trendBuckets('2026-01-01', '2026-06-30');
  assert.equal(monthly.granularity, 'month');
  assert.deepEqual(monthly.keys, ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']);
  assert.equal(monthly.keyOf('2026-03-14'), '2026-03');
});

test('report-range: explicit dates win, year stays supported, bad input is rejected', () => {
  const today = new Date('2026-10-15T12:00:00Z');
  assert.deepEqual(reportRange.resolveRange({ startDate: '2026-09-01', endDate: '2026-09-30', year: 2024 }, today),
    { startDate: '2026-09-01', endDate: '2026-09-30' });
  assert.deepEqual(reportRange.resolveRange({ year: 2024 }, today), { startDate: '2024-01-01', endDate: '2024-12-31' });
  assert.deepEqual(reportRange.resolveRange({ year: 2026 }, today), { startDate: '2026-01-01', endDate: '2026-10-15' },
    'current year is capped at today');
  assert.equal(reportRange.resolveRange({}, today), null);
  assert.equal(reportRange.validRange('2026-09-30', '2026-09-01'), null, 'inverted');
  assert.equal(reportRange.validRange('2026-02-30', '2026-03-01'), null, 'not a date');
  assert.equal(reportRange.validRange('2024-01-01', '2026-01-01'), null, 'over 366 days');
  assert.equal(reportRange.rangeDays({ startDate: '2026-09-01', endDate: '2026-09-07' }), 7);
  assert.deepEqual(reportRange.rangeBounds({ startDate: '2026-09-01', endDate: '2026-09-07' }),
    { start: '2026-09-01T00:00:00.000Z', end: '2026-09-08T00:00:00.000Z' });
});

test('GA4 rows tagged per dateRange fold into current and comparison instead of being summed', () => {
  const response = {
    dimensionHeaders: [{ name: 'month' }, { name: 'dateRange' }],
    metricHeaders: [{ name: 'sessions' }, { name: 'activeUsers' }],
    rows: [
      { dimensionValues: [{ value: '09' }, { value: 'date_range_0' }], metricValues: [{ value: '100' }, { value: '80' }] },
      { dimensionValues: [{ value: '09' }, { value: 'date_range_1' }], metricValues: [{ value: '50' }, { value: '40' }] },
      { dimensionValues: [{ value: '10' }, { value: 'date_range_0' }], metricValues: [{ value: '30' }, { value: '20' }] },
    ],
  };
  const merged = reportRange.mergeDateRangeRows(response);
  assert.deepEqual(merged.dimensionNames, ['month']);
  assert.deepEqual(merged.metricNames, ['sessions', 'activeUsers']);
  assert.equal(merged.rows.length, 2);
  const sep = merged.rows.find(r => r.dimensions.month === '09');
  assert.deepEqual(sep.current, [100, 80]);
  assert.deepEqual(sep.comparison, [50, 40]);
  const oct = merged.rows.find(r => r.dimensions.month === '10');
  assert.deepEqual(oct.comparison, [0, 0], 'missing comparison row means zero, not unknown');

  const single = reportRange.mergeDateRangeRows({
    dimensionHeaders: [{ name: 'month' }], metricHeaders: [{ name: 'sessions' }],
    rows: [{ dimensionValues: [{ value: '09' }], metricValues: [{ value: '7' }] }],
  });
  assert.deepEqual(single.rows[0], { dimensions: { month: '09' }, current: [7], comparison: null });

  const doubled = reportRange.mergeDateRangeRows({
    dimensionHeaders: [{ name: 'month' }], metricHeaders: [{ name: 'sessions' }],
    rows: [{ dimensionValues: [{ value: '09' }], metricValues: [{ value: '7' }, { value: '3' }] }],
  });
  assert.deepEqual(doubled.rows[0].comparison, [3], 'legacy layout: comparison values after current ones');
});

test('GSC low-CTR list keeps the latest snapshot per page instead of repeating it per sync', () => {
  const rows = [
    { value: 'https://a.se/x', impressions: 900, clicks: 1, ctr: '0.0011', position: '7.2', period_end: '2026-10-14' },
    { value: 'https://a.se/y', impressions: 2000, clicks: 50, ctr: '0.025', position: '3.1', period_end: '2026-10-14' },
    { value: 'https://a.se/x', impressions: 700, clicks: 0, ctr: '0', position: '8.0', period_end: '2026-10-07' },
    { value: 'https://a.se/z', impressions: 600, clicks: 2, ctr: '0.0033', position: '9.9', period_end: '2026-10-07' },
  ];
  const pages = pickLowCTRPages(rows, 500, 0.005);
  assert.deepEqual(pages.map(p => p.url), ['https://a.se/x', 'https://a.se/z']);
  assert.equal(pages[0].impressions, 900, 'newest snapshot wins');
  assert.equal(pages[0].ctr, 0.0011);
});

const TABS = {
  'ai-bots':         ['src/components/dashboard/tabs/AIBotTab.tsx'],
  ai:                ['src/components/dashboard/tabs/AITab.tsx'],
  'ai-visibility':   ['src/components/dashboard/GSCAIPerformanceSection.tsx'],
  'zero-click-risk': ['src/components/dashboard/ZeroClickRiskIndex.tsx', 'src/components/dashboard/HighImpressionLowCTR.tsx'],
  'kpi-catalog':     ['src/components/dashboard/tabs/KPICatalogTab.tsx'],
  segments:          ['src/components/dashboard/tabs/SegmentsTab.tsx'],
  ecommerce:         ['src/components/dashboard/tabs/EcommerceTab.tsx'],
  'social-media':    ['src/components/dashboard/tabs/SocialMediaTab.tsx'],
  kpi:               ['src/components/dashboard/tabs/KPITab.tsx'],
  'paid-ads':        ['src/components/dashboard/tabs/PaidAdsTab.tsx'],
};

test('all ten tabs are DATE_AWARE and read the global filter', () => {
  const tabs = src('src/components/dashboard/DashboardTabs.tsx');
  const set = tabs.match(/const DATE_AWARE = new Set\(\[([\s\S]*?)\]\);/)[1];
  for (const [value, files] of Object.entries(TABS)) {
    assert.match(set, new RegExp(`'${value}'`), `${value} missing from DATE_AWARE`);
    for (const file of files) assert.match(src(file), /useDashboardFilters\(\)/, `${file} reads the global filter`);
  }
});

test('local date controls are gone: one date control on the dashboard', () => {
  for (const file of ['src/components/dashboard/tabs/SegmentsTab.tsx', 'src/components/dashboard/tabs/EcommerceTab.tsx']) {
    assert.doesNotMatch(src(file), /DateRangePicker/, `${file} still renders a local DateRangePicker`);
  }
  for (const file of ['src/components/dashboard/tabs/AIBotTab.tsx', 'src/components/dashboard/tabs/AITab.tsx']) {
    assert.doesNotMatch(src(file), /Last (7|30|90) days/, `${file} still has its own day selector`);
  }
  for (const file of ['src/components/dashboard/tabs/SocialMediaTab.tsx', 'src/components/dashboard/tabs/KPITab.tsx',
    'src/components/dashboard/tabs/PaidAdsTab.tsx']) {
    assert.doesNotMatch(src(file), /selectedYear|setSelectedYear/, `${file} still has a year selector`);
  }
});

test('hooks put the range in the query key and query, not a hardcoded window', () => {
  const hooks = {
    'src/hooks/useAIBotTracking.tsx': /p_from: range\.from, p_to: range\.to/,
    'src/hooks/useAIAgentJourney.tsx': /\.lt\('started_at', end\)/,
    'src/hooks/useAISearchTraffic.tsx': /\.lt\('landed_at', end\)/,
    'src/hooks/useGSCAIData.ts': /\.lte\('period_start', range\.to\)/,
    'src/hooks/useZeroClickRisk.ts': /\.lt\('detected_at', end\)/,
    'src/hooks/useHighImpressionLowCTR.ts': /\.lte\('period_start', range\.to\)/,
    'src/hooks/useSegmentAnalytics.tsx': /\.lt\('created_at', end\)/,
    'src/hooks/useGASegmentAnalytics.tsx': /\.lt\('started_at', end\)/,
    'src/hooks/useSocialMedia.tsx': /rpc\('get_social_daily'/,
    'src/hooks/useKPIDashboard.tsx': /comparisonStartDate: comparison\.from/,
  };
  for (const [file, pattern] of Object.entries(hooks)) {
    const code = src(file);
    assert.match(code, pattern, file);
    assert.doesNotMatch(code, /subDays\(new Date\(\)|Date\.now\(\) - 30 \* 24/, `${file} still uses a rolling window`);
  }
  assert.match(src('src/hooks/useAIBotTracking.tsx'), /queryKey: \['ai-bot-tracking', siteId, range\.from, range\.to\]/);
  assert.match(src('src/components/dashboard/tabs/EcommerceTab.tsx'),
    /queryKey: \['ecommerce-analytics', selectedSiteId, filters\.from, filters\.to\]/);
  assert.match(src('src/hooks/useKPIDashboard.tsx'), /sameRangeLastYear\(range\.from, range\.to\)/);
  assert.match(src('src/hooks/useSocialMedia.tsx'), /sameRangeLastYear\(range\.from, range\.to\)/);
});

test('edge functions accept a date range and keep their legacy inputs', () => {
  const monthly = src('supabase/functions/ga4-monthly-kpi/index.ts');
  assert.match(monthly, /resolveRange\(body, today\) \?\? resolveRange\(\{ year: today\.getUTCFullYear\(\) \}, today\)/);
  assert.match(monthly, /comparisonTotals/);
  const kpi = src('supabase/functions/ga4-kpi-dashboard/index.ts');
  assert.match(kpi, /mergeDateRangeRows\(response\)/);
  assert.match(kpi, /validRange\(body\.comparisonStartDate, body\.comparisonEndDate\) \?\? sameRangeLastYear\(range\)/);
  const behaviour = src('supabase/functions/ai-bot-behavior-analysis/index.ts');
  assert.match(behaviour, /validRange\(body\.startDate, body\.endDate\)/);
  assert.match(behaviour, /body\.days \?\? 7/);
  assert.match(src('src/components/dashboard/AIBotSecurityWidget.tsx'), /startDate: from, endDate: to/);
});

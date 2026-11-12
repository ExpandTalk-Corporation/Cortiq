// tests/foundation/filters-remaining-tabs.test.mjs
// The global date / URL / segment filters reach Forms, the KPI fallback and Ads (CortIQ source)
// through their RPCs (20261123000001_filters_remaining_tabs.sql). Click fraud follows the date
// only, and the page funnel follows the date with a URL-filtered page list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('PostgreSQL: forms, KPI and paid ads RPCs filter by path and segment, owner only, not anon', async () => {
  const db = new PGlite();
  const sql = read('./filters-remaining-tabs.sql').replace(/^\\ir \.\.\/\.\.\/(.*)$/gm, (_, p) => read(`../../${p}`));
  try {
    await assert.doesNotReject(db.exec(sql));
  } finally {
    await db.close();
  }
});

test('the paid medium list in get_paid_ads_summary matches PAID_MEDIUMS', () => {
  const migration = read('../../supabase/migrations/20261123000001_filters_remaining_tabs.sql');
  const list = migration.match(/lower\(ts\.utm_medium\) IN \(([^)]+)\)/)[1].split(',').map((m) => m.trim().replace(/'/g, ''));
  const lib = read('../../src/lib/paidMediums.ts').match(/PAID_MEDIUMS = \[([^\]]+)\]/)[1]
    .split(',').map((m) => m.trim().replace(/'/g, ''));
  assert.deepEqual(list, lib);
});

test('forms, KPI and ads pass the filters to their RPCs and key their queries on them', () => {
  const forms = read('../../src/hooks/useFormAnalytics.tsx');
  assert.match(forms, /rpc\('get_form_stats'/);
  assert.match(forms, /queryKey: \['form-stats', siteId, p_from, p_to, p_path, p_segment\]/);

  const ads = read('../../src/hooks/usePaidAdsAnalytics.tsx');
  assert.match(ads, /rpc\('get_paid_ads_summary'/);
  assert.match(ads, /queryKey: \['paid-ads-summary', siteId, p_from, p_to, p_path, p_segment\]/);
  assert.doesNotMatch(ads, /functions\.invoke\('paid-ads-analytics'/, 'ads no longer reads through the capped Edge Function');

  const kpi = read('../../src/hooks/useKPIDashboard.tsx');
  assert.match(kpi, /rpc\('get_kpi_monthly'[\s\S]{0,200}p_path[\s\S]{0,60}p_segment/);
  assert.match(read('../../src/components/dashboard/tabs/KPITab.tsx'), /useKPIDashboard\([^)]*\{ from: filters\.from, to: filters\.to \}, useFilterParams\(\)\)/);

  for (const file of ['../../src/components/dashboard/tabs/FormAnalyticsTab.tsx', '../../src/components/dashboard/FormAnalyticsOverview.tsx']) {
    const src = read(file);
    assert.match(src, /useFormStats/, `${file} uses the filtered form stats`);
    assert.doesNotMatch(src, /sv-SE/, `${file} English number format`);
  }
});

test('click fraud and the page funnel follow the global date range', () => {
  const tabs = read('../../src/components/dashboard/DashboardTabs.tsx');
  assert.doesNotMatch(tabs, /toISOString\(\)\.split\('T'\)\[0\]/, 'no UTC day shift from toISOString');
  assert.match(tabs, /<ClickFraudTab[\s\S]{0,120}startDate=\{filters\.from\}[\s\S]{0,40}endDate=\{filters\.to\}/);

  const funnel = read('../../src/components/dashboard/PageFunnelAnalyzer.tsx');
  assert.match(funnel, /rpc\('get_top_pages', \{[^}]*p_from, p_to, p_limit: 200, p_path/);
  assert.match(funnel, /rpc\('get_page_funnel', \{[^}]*p_from, p_to/);
  assert.doesNotMatch(funnel, /timeRange|Analyserar/, 'no local time range, English copy');
  assert.match(funnel, /pages=\{availablePages\}/, 'page list comes from the filtered RPC');
});

test('dashboard declares what each of these tabs applies', () => {
  const tabs = read('../../src/components/dashboard/DashboardTabs.tsx');
  const set = (name) => tabs.match(new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\)`))[1]
    .match(/'([^']+)'/g).map((s) => s.slice(1, -1));
  assert.ok(set('FILTER_AWARE').includes('forms'), 'forms filter aware');
  for (const tab of ['kpi', 'paid-ads']) {
    assert.ok(set('SELF_NOTICE').includes(tab), `${tab} renders its own notice`);
    assert.ok(!set('FILTER_AWARE').includes(tab), `${tab} support depends on the source`);
  }
  assert.ok(!set('FILTER_AWARE').includes('click-fraud') && !set('PATH_AWARE').includes('click-fraud'), 'click fraud is date only');
  for (const tab of ['forms', 'kpi', 'paid-ads', 'click-fraud', 'analytics']) assert.ok(set('DATE_AWARE').includes(tab), `${tab} date aware`);
  assert.match(tabs, /!SELF_NOTICE\.has\(activeTab\)/);
  assert.match(tabs, /'click-fraud': \{\s*path: '/, 'click fraud explains the URL filter');

  const kpiTab = read('../../src/components/dashboard/tabs/KPITab.tsx');
  assert.match(kpiTab, /supports=\{\{ date: true, path: usingFallback, segment: usingFallback \}\}/);
  const adsTab = read('../../src/components/dashboard/tabs/AdsTab.tsx');
  assert.match(adsTab, /supports=\{\{ date: true, path: source === 'cortiq', segment: source === 'cortiq' \}\}/);

  const notice = read('../../src/components/dashboard/FilterScopeNotice.tsx');
  assert.match(notice, /notes\?\.path/, 'notice explains an ignored URL filter');
});

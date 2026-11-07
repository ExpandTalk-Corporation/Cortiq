// A site that runs only the consent-free aggregate beacon has no tracking_sessions or page_views.
// The Overview must not present that as broken tracking (0 visits, "▼ 100%", "Install the tracking
// script"); it shows the aggregate figures instead and says why consented figures are absent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../../src/components/dashboard/${p}`, import.meta.url), 'utf8');

test('OverviewTab derives aggregate-only from the site setting and zero consented visits', () => {
  const tab = read('tabs/OverviewTab.tsx');
  assert.match(tab, /aggregateOnly\s*=\s*aggregateOn\s*&&\s*m\.current\.visits === 0\s*&&\s*m\.current\.pageViews === 0/);
  assert.match(tab, /<KpiRow[^>]*aggregateOnly=\{aggregateOnly\}/);
  assert.match(tab, /<StatusStrip[^>]*aggregateOnly=\{aggregateOnly\}/);
});

test('OverviewTab replaces the consent-based Top pages list when aggregate-only', () => {
  assert.match(read('tabs/OverviewTab.tsx'), /!aggregateOnly\s*&&\s*\(?\s*<TopPagesData/);
});

test('KpiRow keeps only consent-independent tiles and explains why when aggregate-only', () => {
  const kpi = read('overview/KpiRow.tsx');
  assert.match(kpi, /aggregateOnly/);
  assert.match(kpi, /No consented visits/);
});

test('StatusStrip does not warn about missing page views when aggregate-only', () => {
  const strip = read('overview/StatusStrip.tsx');
  assert.match(strip, /aggregateOnly\s*\?/);
  assert.match(strip, /Aggregate measurement/);
});

test('AggregateOverview lists top pages', () => {
  assert.match(read('overview/AggregateOverview.tsx'), /data\.topPages/);
});

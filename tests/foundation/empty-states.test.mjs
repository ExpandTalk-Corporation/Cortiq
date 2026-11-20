// Panels with no data show a compact notice that says why and what to do, not a card of zeros.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bannerEmptyState, MIN_BANNER_ANSWERS_FOR_INSIGHT } from '../../src/lib/cookiefreeSummary.ts';

const read = (p) => readFileSync(new URL(`../../src/${p}`, import.meta.url), 'utf8');

test('bannerEmptyState: own CMP and no banner are expected zeros, not faults', () => {
  const cmp = bannerEmptyState('own-cmp', 'cookiebot');
  assert.match(cmp.body, /Cookiebot/);
  assert.equal(cmp.action.tab, 'consent');
  assert.equal(cmp.trackingCheck, false);
  assert.match(bannerEmptyState('own-cmp', null).body, /its own consent tool/);
  assert.equal(bannerEmptyState('none', null).trackingCheck, false);
});

test('bannerEmptyState: CortIQ banner with no answers points to the snippet and Tracking Check', () => {
  const s = bannerEmptyState('cortiq-banner', null);
  assert.equal(s.action.tab, 'setup');
  assert.equal(s.trackingCheck, true);
});

test('bannerEmptyState: no setup chosen asks the owner to choose one', () => {
  for (const v of [null, undefined, 'unknown']) assert.equal(bannerEmptyState(v, null).action.tab, 'consent');
});

test('Cookie Banner view: answers, not views; no share of sessions; insight only with enough answers', () => {
  const tab = read('components/dashboard/tabs/CookiefreeAnalyticsTab.tsx');
  assert.doesNotMatch(tab, /Banner Views/);
  assert.doesNotMatch(tab, /% of sessions/);
  assert.match(tab, /totalBannerViews === 0 \?\s*\(\s*<BannerEmptyNotice/);
  assert.match(tab, /totalBannerViews >= MIN_BANNER_ANSWERS_FOR_INSIGHT/);
  assert.ok(MIN_BANNER_ANSWERS_FOR_INSIGHT >= 10);
});

test('AggregateOverview: zero visits and page views render the compact notice with the last counted day', () => {
  const src = read('components/dashboard/overview/AggregateOverview.tsx');
  assert.match(src, /empty\s*=\s*!!data && data\.visits === 0 && data\.pageviews === 0/);
  assert.match(src, /if \(empty\) return <AggregateEmpty/);
  assert.match(src, /useLastAggregateDay\(siteId, empty\)/);
  assert.match(read('components/dashboard/tabs/OverviewTab.tsx'), /<AggregateOverview[^>]*onNavigate=\{onNavigate\}/);
});

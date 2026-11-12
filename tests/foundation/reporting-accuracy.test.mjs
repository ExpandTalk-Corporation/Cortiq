// tests/foundation/reporting-accuracy.test.mjs
// Our own Tracking Check runs must not show up as visits or AI traffic in customers'
// dashboards, and "AI visits" counts only classified traffic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(p, 'utf8');
const INGEST = ['track-event', 'ai-bot-tracker', 'visitor-identification', 'record-conversion', 'link-click-counter'];

test('ingest functions acknowledge Tracking Check requests before any write', () => {
  for (const fn of INGEST) {
    const src = read(`supabase/functions/${fn}/index.ts`);
    const handler = src.slice(src.search(/serve\(async \(req\)/));
    const skip = handler.indexOf('skipTrackingCheck(req');
    assert.ok(skip > 0, fn);
    assert.ok(skip < handler.search(/createClient\(|req\.json\(\)/), `${fn}: skip must come before the body is read`);
  }
});

test('both browser probes mark their User-Agent with the shared token', () => {
  const ua = read('supabase/functions/_shared/tracking-check-ua.ts');
  assert.match(ua, /TRACKING_CHECK_UA_TOKEN = 'CortIQ-TrackingCheck'/);
  // The fetch probe sends its own User-Agent, which must carry the same token.
  assert.match(read('supabase/functions/_shared/tracking-check/fetch-probe.ts'), /USER_AGENT = '[^']*CortIQ-TrackingCheck/);
  // Hosts that check the TLS handshake reset clients that claim to be a browser (xensam.com, SiteGround).
  assert.doesNotMatch(read('supabase/functions/_shared/tracking-check/fetch-probe.ts'), /USER_AGENT = 'Mozilla/);
  const client = read('supabase/functions/_shared/tracking-check/browserless.ts');
  assert.equal(client.match(/uaToken: TRACKING_CHECK_UA_TOKEN/g)?.length, 2);
  assert.match(client, /page\.setUserAgent\(/);
  assert.match(read('supabase/functions/_shared/tracking-check/browser-probe.js'), /context\.uaToken\) await p\.setUserAgent\(/);
});

test('overview AI total leaves unclassified hits out and reports them apart', () => {
  const sql = read('supabase/migrations/20261122000001_ai_visits_classified.sql');
  assert.match(sql, /count\(\*\) FILTER \(WHERE cat <> 'other'\),/);
  assert.match(sql, /'unclassified', COALESCE\(sum\(pd\.unclassified\), 0\)/);
  assert.match(sql, /public\.session_matches_filters\(ts, /);
  assert.match(read('src/components/dashboard/overview/ModuleCards.tsx'), /ai\.unclassified \?\?/);
});

test('analytics tab never shows the previous site\'s answers', () => {
  const sources = read('src/components/dashboard/TrafficSourcesAnalysis.tsx');
  assert.match(sources, /const id = \+\+loadId\.current;/);
  assert.equal(sources.match(/await loadTrackingData\(stale\)/g)?.length, 5);
  assert.match(sources, /if \(stale\(\)\) return;\s*if \(error\) throw error;/);
  assert.match(read('src/components/dashboard/tabs/AnalyticsTab.tsx'), /<PageFunnelAnalyzer key=\{selectedSite\.id\}/);
  assert.match(read('src/components/dashboard/PageFunnelAnalyzer.tsx'), /if \(stale\(\)\) return;\s*if \(error\) throw error;/);
});

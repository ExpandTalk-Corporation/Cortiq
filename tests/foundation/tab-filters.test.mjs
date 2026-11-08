// tests/foundation/tab-filters.test.mjs
// The URL and segment filters reach the tab RPCs through one SQL helper; these tests keep
// every filter-aware tab, its RPC and the "filter not applied" notice in step.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync('supabase/migrations/20261109000004_tab_filters.sql', 'utf8');
const tabs = readFileSync('src/components/dashboard/DashboardTabs.tsx', 'utf8');

const RPCS = ['get_geo_breakdown', 'get_campaign_breakdown', 'get_social_daily', 'get_navigation_flow', 'get_analytics_summary'];
const HOOKS = {
  get_geo_breakdown: 'src/hooks/useGeoBreakdown.ts',
  get_campaign_breakdown: 'src/hooks/useCampaignBreakdown.ts',
  get_social_daily: 'src/hooks/useSocialMedia.tsx',
  get_navigation_flow: 'src/hooks/useNavigationFlow.ts',
  get_analytics_summary: 'src/hooks/useAnalytics.tsx',
};

function body(name) {
  const start = sql.indexOf(`FUNCTION public.${name}(`, sql.indexOf(`DROP FUNCTION IF EXISTS public.${name}(`));
  return sql.slice(start, sql.indexOf('$$;', start));
}

test('each tab RPC drops its old signature and takes p_path and p_segment', () => {
  for (const rpc of RPCS) {
    assert.match(sql, new RegExp(`DROP FUNCTION IF EXISTS public\\.${rpc}\\(uuid, [a-z]+, [a-z]+\\);`), rpc);
    assert.match(body(rpc), /p_path +text DEFAULT NULL,\s*p_segment +jsonb DEFAULT NULL/, rpc);
    assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${rpc}\\(uuid, [a-z]+, [a-z]+, text, jsonb\\) TO authenticated`), rpc);
  }
});

test('every filtered RPC applies the shared session rule', () => {
  for (const rpc of [...RPCS, 'get_overview_metrics']) {
    const b = rpc === 'get_overview_metrics' ? sql.slice(sql.indexOf('FUNCTION public.get_overview_metrics')) : body(rpc);
    assert.match(b, /public\.session_matches_filters\(ts, /, rpc);
  }
});

test('the session rule is internal and handles built-in segments', () => {
  assert.match(sql, /REVOKE EXECUTE ON FUNCTION public\.session_matches_filters\(public\.tracking_sessions, text, jsonb\) FROM PUBLIC, anon, authenticated/);
  const helper = sql.slice(sql.indexOf('FUNCTION public.session_matches_filters'), sql.indexOf('REVOKE EXECUTE'));
  assert.match(helper, /THEN public\.builtin_segment_match\(/);
  assert.match(sql, /replace\(replace\(replace\(p_path, '\\', '\\\\'\), '%', '\\%'\), '_', '\\_'\)/);
});

test('the hooks send the filters and the tabs stop showing the notice', () => {
  for (const [rpc, file] of Object.entries(HOOKS)) {
    const src = readFileSync(file, 'utf8');
    assert.ok(src.includes(rpc), file);
    assert.match(src, /useFilterParams|p_path: filterParams/, file);
  }
  const aware = tabs.match(/const FILTER_AWARE = new Set\(\[([^\]]+)\]\)/)[1].match(/'([^']+)'/g).map((s) => s.slice(1, -1));
  assert.deepEqual(aware.sort(), ['analytics', 'campaigns', 'geolocation', 'navigation', 'social-media']);
  assert.match(tabs, /filters: FILTER_AWARE\.has\(activeTab\)/);
});

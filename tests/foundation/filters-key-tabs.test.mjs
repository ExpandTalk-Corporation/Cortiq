// tests/foundation/filters-key-tabs.test.mjs
// The global date / URL / segment filters reach Pages, Content, Heatmaps, AI bots and
// Attribution through their RPCs (20261119000001_filters_key_tabs.sql), and the dashboard
// says which filters each tab applies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('PostgreSQL: key tab RPCs filter by path and segment, owner only, not anon', async () => {
  const db = new PGlite();
  const sql = read('./filters-key-tabs.sql').replace(/^\\ir \.\.\/\.\.\/(.*)$/gm, (_, p) => read(`../../${p}`));
  try {
    await assert.doesNotReject(db.exec(sql));
  } finally {
    await db.close();
  }
});

test('the key tabs pass the filters to their RPCs and key their queries on them', () => {
  const calls = {
    '../../src/components/dashboard/TopPagesData.tsx': ['get_top_pages', ['p_path', 'p_segment']],
    '../../src/components/dashboard/TrafficSourcesAnalysis.tsx': ['get_source_breakdown', ['p_path', 'p_segment']],
    '../../src/hooks/useContentPages.ts': ['get_content_pages', ['p_path', 'p_segment']],
    '../../src/hooks/useHeatmapData.tsx': ['get_heatmap_pages', ['p_path']],
    '../../src/hooks/useAIBotTracking.tsx': ['get_ai_bot_tracking', ['p_path']],
    '../../src/hooks/useAttributionGap.ts': ['get_attribution_gap', ['p_path', 'p_segment', 'p_from', 'p_to']],
  };
  for (const [file, [rpc, params]] of Object.entries(calls)) {
    const src = read(file);
    assert.match(src, new RegExp(`rpc\\('${rpc}'`), `${file} calls ${rpc}`);
    for (const param of params) assert.match(src, new RegExp(`${param}\\b`), `${file} passes ${param}`);
  }
  assert.doesNotMatch(read('../../src/hooks/useAttributionGap.ts'), /p_days/, 'attribution uses the date range');
  for (const file of ['../../src/hooks/useContentPages.ts', '../../src/components/dashboard/TopPagesData.tsx', '../../src/hooks/useAttributionGap.ts']) {
    assert.match(read(file), /queryKey: \[[^\]]*p_path[^\]]*p_segment/, `${file} keys on the filters`);
  }
  assert.match(read('../../src/hooks/useAIBotTracking.tsx'), /queryKey: \[[^\]]*path/, 'AI bot query keyed on path');
});

test('dashboard declares path-only tabs and the notice covers them', () => {
  const tabs = read('../../src/components/dashboard/DashboardTabs.tsx');
  const set = (name) => tabs.match(new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\)`))[1]
    .match(/'([^']+)'/g).map((s) => s.slice(1, -1));
  for (const tab of ['content-performance', 'attribution']) assert.ok(set('FILTER_AWARE').includes(tab), `${tab} filter aware`);
  for (const tab of ['heatmap', 'ai-bots']) {
    assert.ok(set('PATH_AWARE').includes(tab), `${tab} path aware`);
    assert.ok(!set('FILTER_AWARE').includes(tab), `${tab} must not claim segment support`);
  }
  assert.ok(set('DATE_AWARE').includes('attribution'), 'attribution date aware');
  assert.match(tabs, /path: FILTER_AWARE\.has\(activeTab\) \|\| PATH_AWARE\.has\(activeTab\)/);
  assert.match(tabs, /segment: FILTER_AWARE\.has\(activeTab\)/);
  const notice = read('../../src/components/dashboard/FilterScopeNotice.tsx');
  assert.match(notice, /supports\.path/);
  assert.match(notice, /supports\.segment/);
});

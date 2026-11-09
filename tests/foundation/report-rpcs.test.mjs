// tests/foundation/report-rpcs.test.mjs
// Top pages, traffic sources, segments and the page funnel are counted in the database.
// They used to fetch raw rows in the browser, which the API caps at 1,000 rows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('PostgreSQL: report RPCs count every row and keep the tab contract', async () => {
  const db = new PGlite();
  const sql = read('./report-rpcs.sql').replace(/^\\ir \.\.\/\.\.\/(.*)$/gm, (_, p) => read(`../../${p}`));
  try {
    await assert.doesNotReject(db.exec(sql));
  } finally {
    await db.close();
  }
});

test('the views call the RPCs instead of reading raw rows', () => {
  const views = {
    '../../src/components/dashboard/TopPagesData.tsx': ['get_top_pages'],
    '../../src/components/dashboard/TrafficSourcesAnalysis.tsx': ['get_source_breakdown'],
    '../../src/components/dashboard/PageFunnelAnalyzer.tsx': ['get_top_pages', 'get_page_funnel'],
    '../../src/hooks/useSegmentAnalytics.tsx': ['get_segment_stats'],
    '../../src/hooks/useGASegmentAnalytics.tsx': ['get_segment_stats'],
  };
  for (const [file, rpcs] of Object.entries(views)) {
    const src = read(file);
    for (const rpc of rpcs) assert.match(src, new RegExp(`rpc\\('${rpc}'`), `${file} calls ${rpc}`);
    for (const table of ['page_views', 'tracking_sessions', 'conversion_events', 'heatmap_data']) {
      assert.doesNotMatch(src, new RegExp(`from\\('${table}'\\)`), `${file} reads ${table} rows`);
    }
  }
});

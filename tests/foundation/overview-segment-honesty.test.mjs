// With a segment selected, AI traffic is not segmented (bots carry no UTM tags), so the
// Overview must say so and must not show a ratio that mixes segmented and unsegmented counts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../../src/components/dashboard/${p}`, import.meta.url), 'utf8');

test('KpiRow drops the AI-per-visits ratio and labels AI as unsegmented when a segment is active', () => {
  const kpi = read('overview/KpiRow.tsx');
  assert.match(kpi, /segmented\s*\?/);
  assert.match(kpi, /not segmented/i);
});

test('OverviewTab passes the segment state to KpiRow', () => {
  assert.match(read('tabs/OverviewTab.tsx'), /<KpiRow[^>]*segmented=\{/);
});

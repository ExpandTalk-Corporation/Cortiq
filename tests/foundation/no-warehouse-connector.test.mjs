// The data-warehouse connector was a stub (no sync, plain-text credentials) and was removed.
// Public copy lists data-warehouse export as not included; keep the dashboard consistent with that.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

test('no data-warehouse connector in the dashboard or edge functions', () => {
  assert.equal(existsSync('supabase/functions/warehouse-connector'), false);
  assert.equal(existsSync('src/components/dashboard/WarehouseConnectorManager.tsx'), false);
  const nav = readFileSync('src/components/dashboard/nav/navSections.ts', 'utf8');
  assert.doesNotMatch(nav, /value: 'warehouse'/);
  const tabs = readFileSync('src/components/dashboard/DashboardTabs.tsx', 'utf8');
  assert.doesNotMatch(tabs, /WarehouseConnector/);
});

test('public copy still says data-warehouse export is not included', () => {
  for (const f of ['public/llms.txt', 'public/llms-full.txt']) {
    const txt = readFileSync(f, 'utf8');
    const notIncluded = txt.slice(txt.search(/does not (offer|include)/i));
    assert.match(notIncluded, /Data-warehouse export/, f);
  }
});

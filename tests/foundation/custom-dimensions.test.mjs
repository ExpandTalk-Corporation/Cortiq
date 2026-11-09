// tests/foundation/custom-dimensions.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('PostgreSQL: event site_id backfill, custom dimension registration and breakdown', async () => {
  const db = new PGlite();
  const fixture = read('./custom-dimensions.sql')
    .replace(/^\\ir .*custom_dimensions\.sql$/m, () => read('../../supabase/migrations/20261111000001_custom_dimensions.sql'));
  try {
    await assert.doesNotReject(db.exec(fixture));
  } finally {
    await db.close();
  }
});

test('track-event stores the owning site on every event', () => {
  const src = read('../../supabase/functions/track-event/index.ts');
  assert.match(src, /site_id: eventSiteId/);
  assert.match(src, /siteRow\.user_id === company\.id/, 'site is only set after an ownership check');
});

test('Custom dimensions view reads the RPCs and only offers discovered keys', () => {
  const hook = read('../../src/hooks/useCustomDimensions.ts');
  assert.match(hook, /rpc\('get_event_property_keys'/);
  assert.match(hook, /rpc\('get_custom_dimension_breakdown'/);
  assert.match(hook, /from\('custom_dimensions'\)/);
  const tabs = read('../../src/components/dashboard/DashboardTabs.tsx');
  assert.match(tabs, /<CustomDimensions siteId=\{selectedSite\.id\}/);
});

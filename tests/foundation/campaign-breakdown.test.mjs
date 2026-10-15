// tests/foundation/campaign-breakdown.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('PostgreSQL: UTM tags parsed onto sessions + campaign breakdown', async () => {
  const db = new PGlite();
  const fixture = read('./campaign-breakdown.sql')
    .replace(/^\\ir .*session_country\.sql$/m, () => read('../../supabase/migrations/20261015100000_session_country.sql'))
    .replace(/^\\ir .*session_utm\.sql$/m, () => read('../../supabase/migrations/20261015110000_session_utm.sql'));
  try {
    await assert.doesNotReject(db.exec(fixture));
  } finally {
    await db.close();
  }
});

test('Campaigns tab reads the RPC and explains how to get data when empty', () => {
  const src = read('../../src/components/dashboard/CampaignDashboard.tsx');
  assert.match(src, /useCampaignBreakdown\(siteId\)/);
  assert.match(read('../../src/hooks/useCampaignBreakdown.ts'), /rpc\('get_campaign_breakdown'/);
  assert.doesNotMatch(src, /campaign_performance/);
  assert.match(src, /utm_source=/, 'empty state shows an example tagged link');
});

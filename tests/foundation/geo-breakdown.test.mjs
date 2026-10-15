// tests/foundation/geo-breakdown.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const MIGRATION = new URL('../../supabase/migrations/20261015100000_session_country.sql', import.meta.url);

test('PostgreSQL: session country ingest + geo breakdown — normalisation, unknown bucket, access', async () => {
  const db = new PGlite();
  const fixture = readFileSync(new URL('./geo-breakdown.sql', import.meta.url), 'utf8');
  const migration = readFileSync(MIGRATION, 'utf8');
  try {
    await assert.doesNotReject(db.exec(fixture.replace(/^\\ir .*$/m, () => migration)));
  } finally {
    await db.close();
  }
});

test('track-event forwards the Cloudflare country to ingest_pageview', () => {
  const src = readFileSync(new URL('../../supabase/functions/track-event/index.ts', import.meta.url), 'utf8');
  assert.match(src, /p_country:\s*req\.headers\.get\('cf-ipcountry'\)/);
});

test('Locations tab reads the RPC, not the dead /api proxy or empty aggregate tables', () => {
  const src = readFileSync(new URL('../../src/components/dashboard/GeolocationDashboard.tsx', import.meta.url), 'utf8');
  const hook = readFileSync(new URL('../../src/hooks/useGeoBreakdown.ts', import.meta.url), 'utf8');
  assert.match(src, /useGeoBreakdown\(siteId\)/);
  assert.match(hook, /rpc\('get_geo_breakdown'/);
  assert.doesNotMatch(src, /\/api\/geolocation-lookup/);
  assert.doesNotMatch(src, /geolocation_aggregates/);
});

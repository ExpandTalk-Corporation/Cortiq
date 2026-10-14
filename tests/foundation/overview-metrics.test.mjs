// tests/foundation/overview-metrics.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('PostgreSQL: overview metrics — periods, gaps, path, segment, AI split, access', async () => {
  const db = new PGlite();
  const fixture = readFileSync(new URL('./overview-metrics.sql', import.meta.url), 'utf8');
  const migration = readFileSync(new URL('../../supabase/migrations/20261015000001_overview_metrics.sql', import.meta.url), 'utf8');
  try {
    await assert.doesNotReject(db.exec(fixture.replace(/^\\ir .*$/m, () => migration)));
  } finally {
    await db.close();
  }
});

test('daily series aggregates each source once instead of one subquery per day', () => {
  const migration = readFileSync(new URL('../../supabase/migrations/20261015000001_overview_metrics.sql', import.meta.url), 'utf8');
  assert.ok(!/WHERE\s+\w+\.d\s*=\s*days\.d/.test(migration), 'no correlated per-day count(*)');
  assert.match(migration, /GROUP BY d/);
});

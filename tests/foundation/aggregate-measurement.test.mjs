// tests/foundation/aggregate-measurement.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('PostgreSQL: aggregate ingest, visit rule, retention, privileges and tenant isolation', async () => {
  const db = new PGlite();
  const fixture = readFileSync(new URL('./aggregate-measurement.sql', import.meta.url), 'utf8');
  const migration = readFileSync(new URL('../../supabase/migrations/20261030000001_aggregate_measurement.sql', import.meta.url), 'utf8');
  try {
    await assert.doesNotReject(db.exec(fixture.replace(/^\\ir .*$/m, () => migration)));
  } finally {
    await db.close();
  }
});

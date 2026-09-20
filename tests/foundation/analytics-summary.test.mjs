import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('PostgreSQL: pageview totals, empty period, exclusions and tenant access', async () => {
  // Real PostgreSQL compiled to WASM, in memory: no credentials or live DB access.
  const db = new PGlite();
  const fixture = readFileSync(new URL('./analytics-summary.sql', import.meta.url), 'utf8');
  const migration = readFileSync(new URL('../../supabase/migrations/20260917000001_fix_pageview_total.sql', import.meta.url), 'utf8');
  const sql = fixture.replace(/^\\ir .*$/m, () => migration);
  try {
    await assert.doesNotReject(db.exec(sql));
  } finally {
    await db.close();
  }
});

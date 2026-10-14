// tests/foundation/saved-filters-rls.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('PostgreSQL: saved filters are isolated per site owner', async () => {
  const db = new PGlite();
  const fixture = readFileSync(new URL('./saved-filters-rls.sql', import.meta.url), 'utf8');
  const migration = readFileSync(new URL('../../supabase/migrations/20261015000002_dashboard_saved_filters.sql', import.meta.url), 'utf8');
  try {
    await assert.doesNotReject(db.exec(fixture.replace(/^\\ir .*$/m, () => migration)));
  } finally {
    await db.close();
  }
});

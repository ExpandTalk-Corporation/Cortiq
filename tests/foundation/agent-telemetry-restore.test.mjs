// tests/foundation/agent-telemetry-restore.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('PostgreSQL: restored agent telemetry + cyber/canary objects, privileges and tenant isolation', async () => {
  const db = new PGlite();
  const fixture = readFileSync(new URL('./agent-telemetry-restore.sql', import.meta.url), 'utf8');
  const migration = readFileSync(new URL('../../supabase/migrations/20261030000002_restore_agent_telemetry_and_cyber.sql', import.meta.url), 'utf8');
  try {
    await assert.doesNotReject(db.exec(fixture.replace(/^\\ir .*$/m, () => migration)));
  } finally {
    await db.close();
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { monthPeriods, GSC_HISTORY_MONTHS } from '../../supabase/functions/_shared/gsc-periods.ts';

test('daily sync covers the previous and the current month, current month ends today', () => {
  assert.deepEqual(monthPeriods(new Date('2026-11-07T05:15:00Z'), 2), [
    { periodStart: '2026-10-01', periodEnd: '2026-10-31', queryEnd: '2026-10-31' },
    { periodStart: '2026-11-01', periodEnd: '2026-11-30', queryEnd: '2026-11-07' },
  ]);
});

test('periods cross the year boundary and handle leap years', () => {
  const p = monthPeriods(new Date('2028-03-02T00:00:00Z'), 4);
  assert.deepEqual(p.map((x) => [x.periodStart, x.periodEnd]), [
    ['2027-12-01', '2027-12-31'],
    ['2028-01-01', '2028-01-31'],
    ['2028-02-01', '2028-02-29'],
    ['2028-03-01', '2028-03-31'],
  ]);
});

test('history is 16 months and periods never overlap', () => {
  const p = monthPeriods(new Date('2026-11-07T00:00:00Z'), GSC_HISTORY_MONTHS);
  assert.equal(p.length, 16);
  assert.equal(p[0].periodStart, '2025-08-01');
  for (let i = 1; i < p.length; i++) assert.ok(p[i - 1].periodEnd < p[i].periodStart);
});

test('gsc-sync uses calendar months, not a rolling window', () => {
  const src = readFileSync(new URL('../../supabase/functions/gsc-sync/index.ts', import.meta.url), 'utf8');
  assert.match(src, /monthPeriods\(/);
  assert.doesNotMatch(src, /days_back/);
});

test('the daily cron job never carries a secret in the migration', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/20261108000002_gsc_daily_sync.sql', import.meta.url), 'utf8');
  assert.match(sql, /cron\.schedule\(\s*'gsc-daily-sync'/);
  assert.match(sql, /vault\.decrypted_secrets/);
  assert.doesNotMatch(sql, /eyJhbGciOi|sb_secret_/);
});

test('PostgreSQL: the migration applies without Vault or pg_cron and the secret check fails closed', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  try {
    await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
    await db.exec(readFileSync(new URL('../../supabase/migrations/20261108000002_gsc_daily_sync.sql', import.meta.url), 'utf8'));
    const { rows } = await db.query(`SELECT public.gsc_cron_secret_matches($1) AS ok, public.gsc_cron_secret_matches(null) AS nul`, ['a'.repeat(64)]);
    assert.deepEqual(rows[0], { ok: false, nul: false });
    const { rows: grants } = await db.query(
      `SELECT has_function_privilege('anon', 'public.gsc_cron_secret_matches(text)', 'EXECUTE') AS anon,
              has_function_privilege('authenticated', 'public.gsc_cron_secret_matches(text)', 'EXECUTE') AS auth,
              has_function_privilege('service_role', 'public.gsc_cron_secret_matches(text)', 'EXECUTE') AS svc`);
    assert.deepEqual(grants[0], { anon: false, auth: false, svc: true });
  } finally {
    await db.close();
  }
});

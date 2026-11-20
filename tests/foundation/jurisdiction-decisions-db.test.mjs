// tests/foundation/jurisdiction-decisions-db.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jurisdictionDb, asUser, read, OWNER, OTHER, S1, S2 } from './jurisdiction-db-fixture.mjs';

const LEGACY = `
  CREATE TABLE public.companies (id uuid PRIMARY KEY, jurisdiction text NOT NULL DEFAULT 'eu_strict', auto_eu_geo_override boolean NOT NULL DEFAULT true);
  INSERT INTO public.companies VALUES ('${OWNER}', 'permissive', false), ('${OTHER}', 'eu_strict', true);
  CREATE FUNCTION public.effective_pipeline_mode(p_company_id uuid, p_visitor_country text DEFAULT NULL) RETURNS text LANGUAGE sql AS $$ SELECT 'x' $$;
  CREATE TABLE public.conversion_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id uuid, upload_status text);
  ALTER TABLE public.conversion_events ADD CONSTRAINT conversion_events_upload_status_check CHECK (upload_status IN (
    'not_applicable','pending','uploading','uploaded','skipped_no_consent','skipped_no_gclid','failed'));`;

async function db() {
  const pg = await jurisdictionDb(LEGACY);
  await pg.exec(read('../../supabase/migrations/20261207000002_jurisdiction_decisions.sql'));
  await pg.exec('GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;');
  return pg;
}
const log = (pg, over = {}) => {
  const a = { site: S1, fn: 'aggregate-hit', purpose: 'statistics', country: 'SE', rule: 'baseline.statistics', outcome: 'needs_opt_in',
    reason: 'consent_missing', evidence: 'none', enforced: false, count: 1, now: '2026-11-20T10:00:00Z', ...over };
  return pg.query('SELECT public.log_jurisdiction_decision($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
    [a.site, a.fn, a.purpose, a.country, a.rule, a.outcome, a.reason, a.evidence, a.enforced, a.count, a.now]);
};

test('decision log: daily counts only, same key adds up, owner RLS', async () => {
  const pg = await db();
  try {
    await log(pg); await log(pg); await log(pg, { count: 5 });
    await log(pg, { country: 'xx' });            // invalid → '' (unknown)
    await log(pg, { site: S2 });
    const rows = (await pg.query(`SELECT country, count FROM jurisdiction_decisions_daily WHERE site_id = '${S1}' ORDER BY country`)).rows;
    assert.deepEqual(rows, [{ country: '', count: 1 }, { country: 'SE', count: 7 }]);
    const cols = (await pg.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'jurisdiction_decisions_daily' ORDER BY ordinal_position`)).rows.map((r) => r.column_name);
    assert.deepEqual(cols, ['site_id', 'day', 'fn', 'purpose', 'country', 'rule_id', 'outcome', 'reason', 'evidence', 'enforced', 'count']);
    const mine = await asUser(pg, OWNER, () => pg.query('SELECT DISTINCT site_id FROM jurisdiction_decisions_daily'));
    assert.deepEqual(mine.rows, [{ site_id: S1 }]);
    await assert.rejects(log(pg, { fn: 'evil' }), /check/i);
    await assert.rejects(log(pg, { outcome: 'maybe' }), /check/i);
    // decideAndLog sends ruleIds.join(',') = '' when only the baseline decided; it must still be logged.
    await log(pg, { site: S2, rule: '' });
    await log(pg, { site: S2, rule: null });
    const base = (await pg.query(`SELECT rule_id, count FROM jurisdiction_decisions_daily WHERE site_id = '${S2}' AND rule_id = 'baseline'`)).rows;
    assert.deepEqual(base, [{ rule_id: 'baseline', count: 2 }]);
    for (const role of ['anon', 'authenticated']) {
      const g = (await pg.query(`SELECT has_function_privilege('${role}', 'public.log_jurisdiction_decision(uuid,text,text,text,text,text,text,text,boolean,integer,timestamptz)', 'EXECUTE') a`)).rows[0].a;
      assert.equal(g, false, role);
    }
  } finally { await pg.close(); }
});

test('retention removes rows older than 400 days', async () => {
  const pg = await db();
  try {
    await log(pg, { now: '2025-01-01T00:00:00Z' });
    await log(pg, { now: new Date().toISOString() });
    assert.equal((await pg.query('SELECT public.jurisdiction_decisions_retention() n')).rows[0].n, 1);
    assert.equal(Number((await pg.query('SELECT count(*) n FROM jurisdiction_decisions_daily')).rows[0].n), 1);
  } finally { await pg.close(); }
});

test('AC1: legacy columns and function gone, old values kept as log rows; skipped_jurisdiction allowed', async () => {
  const pg = await db();
  try {
    const cols = (await pg.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'companies'`)).rows.map((r) => r.column_name);
    assert.deepEqual(cols, ['id']);
    assert.equal((await pg.query(`SELECT count(*)::int n FROM pg_proc WHERE proname = 'effective_pipeline_mode'`)).rows[0].n, 0);
    const legacy = (await pg.query('SELECT site_id, legacy_jurisdiction FROM site_legal_profile_log ORDER BY site_id')).rows;
    assert.deepEqual(legacy, [{ site_id: S1, legacy_jurisdiction: 'permissive' }, { site_id: S2, legacy_jurisdiction: 'eu_strict' }]);
    assert.equal((await pg.query('SELECT count(*)::int n FROM site_legal_profiles')).rows[0].n, 0, 'legacy values never become a profile');
    await pg.query(`INSERT INTO conversion_events (site_id, upload_status) VALUES ('${S1}', 'skipped_jurisdiction')`);
    await assert.rejects(pg.query(`INSERT INTO conversion_events (site_id, upload_status) VALUES ('${S1}', 'nope')`), /check/i);
  } finally { await pg.close(); }
});

// 20261207000006: applied after 1-5 on a database where anon/authenticated start with ALL, as
// Supabase's default privileges give them.
async function hardenedDb({ beforeFollowups = '' } = {}) {
  const pg = await jurisdictionDb(LEGACY + `
    CREATE TABLE public.cookie_consents (site_id uuid, created_at timestamptz, consent_types jsonb, geo_country text, geo_source text);`);
  for (const f of ['20261207000002_jurisdiction_decisions', '20261207000003_consent_banner_lang',
    '20261207000004_aggregate_goal_countries', '20261207000005_coverage_by_country']) {
    await pg.exec(read(`../../supabase/migrations/${f}.sql`));
  }
  await pg.exec('GRANT USAGE ON SCHEMA public TO anon; GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;');
  await pg.exec(read('../../supabase/migrations/20261207000006_jurisdiction_hardening.sql'));
  if (beforeFollowups) await pg.exec(beforeFollowups);
  await pg.exec(read('../../supabase/migrations/20261208000001_jurisdiction_followups.sql'));
  return pg;
}

test('hardening: grants match the RLS policies; anon gets nothing', async () => {
  const pg = await hardenedDb();
  try {
    const expected = {
      site_jurisdiction_tighten: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
      site_legal_profiles: ['SELECT'], site_legal_profile_log: ['SELECT'],
      jurisdiction_decisions_daily: ['SELECT'], aggregate_goal_countries_daily: ['SELECT'],
      // 20261208000001
      jurisdiction_exceptions: ['SELECT'], jurisdiction_test_sites: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
    };
    for (const [table, privs] of Object.entries(expected)) {
      for (const p of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
        const q = (role) => pg.query(`SELECT has_table_privilege('${role}', 'public.${table}', '${p}') a`).then((r) => r.rows[0].a);
        assert.equal(await q('anon'), false, `anon ${p} ${table}`);
        assert.equal(await q('authenticated'), privs.includes(p), `authenticated ${p} ${table}`);
      }
    }
  } finally { await pg.close(); }
});

test('hardening: set_by is always the signed-in user; a negative count is refused', async () => {
  const pg = await hardenedDb();
  try {
    await asUser(pg, OWNER, () => pg.query(
      `INSERT INTO site_jurisdiction_tighten (site_id, purpose, setting, set_by) VALUES ('${S1}', 'statistics', 'opt_in', '${OTHER}')`));
    await asUser(pg, OWNER, () => pg.query(
      `INSERT INTO site_jurisdiction_tighten (site_id, purpose, setting) VALUES ('${S1}', 'attribution', 'off')`));
    await asUser(pg, OWNER, () => pg.query(
      `UPDATE site_jurisdiction_tighten SET setting = 'off', set_by = '${OTHER}' WHERE purpose = 'statistics'`));
    const rows = (await pg.query('SELECT purpose, set_by FROM site_jurisdiction_tighten ORDER BY purpose')).rows;
    assert.deepEqual(rows, [{ purpose: 'attribution', set_by: OWNER }, { purpose: 'statistics', set_by: OWNER }]);
    // Service role (no auth.uid()) keeps the value it sends.
    await pg.query(`INSERT INTO site_jurisdiction_tighten (site_id, purpose, setting, set_by) VALUES ('${S2}', 'statistics', 'off', '${OTHER}')`);
    assert.equal((await pg.query(`SELECT set_by FROM site_jurisdiction_tighten WHERE site_id = '${S2}'`)).rows[0].set_by, OTHER);

    await assert.rejects(log(pg, { count: -1 }), /negative_count/);
    await log(pg, { count: 0 });
    await log(pg, { count: null });
    assert.equal((await pg.query('SELECT sum(count)::int n FROM jurisdiction_decisions_daily')).rows[0].n, 1);
  } finally { await pg.close(); }
});

test('followups: purpose security becomes agent_measurement; daily counts merge on the same key; old value refused', async () => {
  const key = `'2026-11-20', 'server-hit', 'SE', 'baseline', 'needs_opt_in', 'consent_missing', 'none', false`;
  const pg = await hardenedDb({ beforeFollowups: `
    INSERT INTO site_jurisdiction_tighten (site_id, purpose, setting) VALUES ('${S1}', 'security', 'off'), ('${S1}', 'statistics', 'opt_in');
    INSERT INTO jurisdiction_decisions_daily (site_id, day, fn, country, rule_id, outcome, reason, evidence, enforced, purpose, count) VALUES
      ('${S1}', ${key}, 'security', 4), ('${S2}', ${key}, 'security', 2);
    -- Simulate a row written under the new name before the migration ran (the old CHECK would refuse it).
    ALTER TABLE jurisdiction_decisions_daily DROP CONSTRAINT jurisdiction_decisions_daily_purpose_check;
    INSERT INTO jurisdiction_decisions_daily (site_id, day, fn, country, rule_id, outcome, reason, evidence, enforced, purpose, count) VALUES
      ('${S1}', ${key}, 'agent_measurement', 3);` });
  try {
    const t = (await pg.query('SELECT purpose, setting FROM site_jurisdiction_tighten ORDER BY purpose')).rows;
    assert.deepEqual(t, [{ purpose: 'agent_measurement', setting: 'off' }, { purpose: 'statistics', setting: 'opt_in' }]);
    const d = (await pg.query('SELECT site_id, purpose, count FROM jurisdiction_decisions_daily ORDER BY site_id')).rows;
    assert.deepEqual(d, [{ site_id: S1, purpose: 'agent_measurement', count: 7 }, { site_id: S2, purpose: 'agent_measurement', count: 2 }]);
    await assert.rejects(log(pg, { purpose: 'security' }), /check/i);
    await log(pg, { fn: 'server-hit', purpose: 'agent_measurement' });
    await assert.rejects(pg.query(`INSERT INTO site_jurisdiction_tighten (site_id, purpose, setting) VALUES ('${S2}', 'security', 'off')`), /check/i);
  } finally { await pg.close(); }
});

test('more collectors (20261208000002): the fn CHECK accepts exactly INGEST_FUNCTIONS', async () => {
  const { INGEST_FUNCTIONS } = await import('../../supabase/functions/_shared/jurisdiction-edge.ts');
  const pg = await hardenedDb();
  try {
    await pg.exec(read('../../supabase/migrations/20261208000002_jurisdiction_more_collectors.sql'));
    for (const fn of INGEST_FUNCTIONS) await log(pg, { fn, purpose: 'statistics' });
    assert.equal((await pg.query('SELECT count(DISTINCT fn)::int n FROM jurisdiction_decisions_daily')).rows[0].n, INGEST_FUNCTIONS.length);
    await assert.rejects(log(pg, { fn: 'agent-telemetry' }), /check/i);
    const def = (await pg.query(`SELECT pg_get_constraintdef(oid) d FROM pg_constraint WHERE conname = 'jurisdiction_decisions_daily_fn_check'`)).rows[0].d;
    assert.equal((def.match(/'[a-z-]+'/g) ?? []).length, INGEST_FUNCTIONS.length, 'CHECK and INGEST_FUNCTIONS list the same names');
  } finally { await pg.close(); }
});

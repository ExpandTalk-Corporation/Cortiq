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

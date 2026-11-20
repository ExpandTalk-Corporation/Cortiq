import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jurisdictionDb, asUser, read, OWNER, OTHER, S1, S2 } from './jurisdiction-db-fixture.mjs';

// Same legacy shape the Task 8 migration expects (see jurisdiction-decisions-db.test.mjs).
const EXTRA = `
  CREATE TABLE public.companies (id uuid PRIMARY KEY, jurisdiction text NOT NULL DEFAULT 'eu_strict', auto_eu_geo_override boolean NOT NULL DEFAULT true);
  CREATE FUNCTION public.effective_pipeline_mode(p_company_id uuid, p_visitor_country text DEFAULT NULL) RETURNS text LANGUAGE sql AS $$ SELECT 'x' $$;
  CREATE TABLE public.conversion_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id uuid, upload_status text);
  ALTER TABLE public.conversion_events ADD CONSTRAINT conversion_events_upload_status_check CHECK (upload_status IN (
    'not_applicable','pending','uploading','uploaded','skipped_no_consent','skipped_no_gclid','failed'));
  CREATE TABLE public.cookie_consents (site_id uuid, created_at timestamptz, consent_types jsonb, geo_country text, geo_source text, banner_lang text);
  ALTER TABLE public.cookie_consents ENABLE ROW LEVEL SECURITY;
  CREATE POLICY owner_view ON public.cookie_consents FOR SELECT USING (EXISTS (SELECT 1 FROM public.sites WHERE sites.id = cookie_consents.site_id AND sites.user_id = auth.uid()));`;

async function db() {
  const pg = await jurisdictionDb(EXTRA);
  await pg.exec(read('../../supabase/migrations/20261207000002_jurisdiction_decisions.sql'));
  await pg.exec(read('../../supabase/migrations/20261207000005_coverage_by_country.sql'));
  await pg.exec('GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;');
  const log = (site, country, reason, enforced, count, day = '2026-11-10') => pg.query(
    'SELECT public.log_jurisdiction_decision($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
    [site, 'aggregate-hit', 'statistics', country, 'baseline',
     reason === 'customer_off' ? 'blocked' : reason === 'allowed' || reason === 'opt_out' ? 'allowed_unless_opt_out' : 'needs_opt_in',
     reason, 'none', enforced, count, `${day}T10:00:00Z`]);
  await log(S1, 'SE', 'allowed', false, 7);
  await log(S1, 'SE', 'consent_missing', true, 3);
  await log(S1, 'SE', 'opt_out', false, 1);
  await log(S1, 'DE', 'customer_off', true, 2);
  await log(S1, 'SE', 'allowed', false, 50, '2026-09-01');   // out of range
  await log(S2, 'SE', 'allowed', false, 99);
  await pg.exec(`INSERT INTO cookie_consents VALUES
    ('${S1}', '2026-11-10', '{"analytics":true,"marketing":false}', 'SE', 'ip', 'sv'),
    ('${S1}', '2026-11-10', '{"analytics":false,"marketing":false}', 'SE', 'ip', 'sv'),
    ('${S1}', '2026-11-10', '{"analytics":"yes","marketing":true}', 'SE', 'ip', 'en'),
    ('${S1}', '2026-11-10', '{"analytics":true,"marketing":true}', 'SE', 'timezone', NULL),
    ('${S2}', '2026-11-10', '{"analytics":true,"marketing":true}', 'NO', 'ip', 'nb');`);
  return pg;
}

test('coverage_by_country: counts per country and purpose in range, owner only', async () => {
  const pg = await db();
  try {
    const rows = (await asUser(pg, OWNER, () => pg.query(`SELECT * FROM public.coverage_by_country('${S1}', '2026-11-01', '2026-11-30') ORDER BY country`))).rows
      .map((r) => [r.country, r.purpose, ...['decisions', 'permitted', 'refused', 'missing', 'gpc', 'blocked', 'enforced_drops'].map((k) => Number(r[k]))]);
    assert.deepEqual(rows, [['DE', 'statistics', 2, 0, 0, 0, 0, 2, 2], ['SE', 'statistics', 11, 7, 1, 3, 0, 0, 3]]);
    const foreign = (await asUser(pg, OTHER, () => pg.query(`SELECT * FROM public.coverage_by_country('${S1}', '2026-11-01', '2026-11-30')`))).rows;
    assert.equal(foreign.length, 0, 'RLS: another owner sees nothing');
    assert.equal((await pg.query(`SELECT has_function_privilege('anon', 'public.coverage_by_country(uuid,date,date)', 'EXECUTE') a`)).rows[0].a, false);
  } finally { await pg.close(); }
});

test('consent_acceptance_by_country_lang: signed country only, boolean true only', async () => {
  const pg = await db();
  try {
    const rows = (await asUser(pg, OWNER, () => pg.query(`SELECT * FROM public.consent_acceptance_by_country_lang('${S1}', '2026-11-01', '2026-11-30') ORDER BY country, banner_lang`))).rows
      .map((r) => [r.country, r.banner_lang, Number(r.answers), Number(r.analytics_accepted), Number(r.marketing_accepted)]);
    assert.deepEqual(rows, [['', '', 1, 1, 1], ['SE', 'en', 1, 0, 1], ['SE', 'sv', 2, 1, 0]]);
    assert.equal((await asUser(pg, OTHER, () => pg.query(`SELECT * FROM public.consent_acceptance_by_country_lang('${S1}', '2026-11-01', '2026-11-30')`))).rows.length, 0);
  } finally { await pg.close(); }
});

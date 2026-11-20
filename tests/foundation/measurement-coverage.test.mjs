// tests/foundation/measurement-coverage.test.mjs
// Spec 2026-11-18 phase 1 AC8: one row per site with the baseline phase 6 builds on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const S1 = '11111111-1111-4111-8111-111111111111';

test('PostgreSQL: coverage v0 counts per site in range, service role only', async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE public.sites (id uuid PRIMARY KEY, domain text, is_active boolean DEFAULT true);
      CREATE TABLE public.tracking_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id uuid, started_at timestamptz,
        referrer text, utm_source text, utm_medium text);
      CREATE TABLE public.cookie_consents (site_id uuid, created_at timestamptz, consent_types jsonb);
      CREATE TABLE public.aggregate_sources_daily (site_id uuid, day date, visits int);
      CREATE TABLE public.ai_bot_traffic (site_id uuid, source text, detected_at timestamptz);
      CREATE TABLE public.conversion_events (site_id uuid, session_id uuid, created_at timestamptz);
      CREATE FUNCTION public._norm_host(u text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
        SELECT regexp_replace(split_part(split_part(regexp_replace(lower(coalesce(u, '')), '^https?://', ''), '/', 1), ':', 1), '^www\\.', '') $$;
      INSERT INTO sites VALUES ('${S1}', 'site.se');
      INSERT INTO tracking_sessions (id, site_id, started_at, referrer, utm_source) VALUES
        ('00000000-0000-4000-8000-000000000001', '${S1}', '2026-11-02', 'https://www.google.com/', NULL),
        ('00000000-0000-4000-8000-000000000002', '${S1}', '2026-11-02', 'https://site.se/a', NULL),
        ('00000000-0000-4000-8000-000000000003', '${S1}', '2026-10-01', NULL, NULL);
      INSERT INTO cookie_consents VALUES ('${S1}', '2026-11-02', '{"analytics":true,"marketing":false}'),
                                         ('${S1}', '2026-11-03', '{"analytics":false,"marketing":false}'),
                                         -- non-boolean consent_types payload (in range): must not throw,
                                         -- and must not count as analytics or marketing consent.
                                         ('${S1}', '2026-11-03', '{"analytics":"yes","marketing":{}}');
      INSERT INTO aggregate_sources_daily VALUES ('${S1}', '2026-11-02', 7), ('${S1}', '2026-11-03', 5);
      INSERT INTO ai_bot_traffic VALUES ('${S1}', 'server_log', '2026-11-02'), ('${S1}', 'js_tag', '2026-11-02');
      INSERT INTO conversion_events VALUES ('${S1}', '00000000-0000-4000-8000-000000000001', '2026-11-02'),
                                           ('${S1}', '00000000-0000-4000-8000-000000000002', '2026-11-02');`);
    const src = read('../../supabase/migrations/20261202000001_source_self_referral_utm.sql');
    await pg.exec(src.match(/CREATE OR REPLACE FUNCTION public\.session_source_medium[\s\S]*?\n\$\$;/)[0]);
    await pg.exec(read('../../supabase/migrations/20261202000005_measurement_coverage_v0.sql'));
    const r = (await pg.query(`SELECT * FROM public.measurement_coverage_v0('2026-11-01', '2026-11-30')`)).rows[0];
    assert.deepEqual(
      [r.consent_rows, r.consents_analytics, r.consents_marketing, r.consented_sessions, r.aggregate_visits, r.server_bot_hits, r.conversions, r.conversions_with_source].map(Number),
      [3, 1, 0, 2, 12, 1, 2, 1]);
    const grants = (await pg.query(`SELECT has_function_privilege('authenticated', 'public.measurement_coverage_v0(date,date)', 'EXECUTE') a`)).rows[0].a;
    assert.equal(grants, false);
    const anonGrants = (await pg.query(`SELECT has_function_privilege('anon', 'public.measurement_coverage_v0(date,date)', 'EXECUTE') a`)).rows[0].a;
    assert.equal(anonGrants, false);
  } finally { await pg.close(); }
});

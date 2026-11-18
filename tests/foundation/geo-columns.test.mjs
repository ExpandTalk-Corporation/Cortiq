// tests/foundation/geo-columns.test.mjs
// Spec 2026-11-18 phase 2 AC4: geo lands on sessions, consents, AI bot rows and (country only) aggregates.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const SITE = '11111111-1111-4111-8111-111111111111';

async function db() {
  const pg = new PGlite();
  await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
    CREATE TABLE public.sites (id uuid PRIMARY KEY, user_id uuid, domain text, session_timeout_minutes int);
    CREATE TABLE public.tracking_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id uuid, session_id text,
      device_type text, browser text, os text, referrer text, started_at timestamptz, last_activity timestamptz,
      page_views int, duration_seconds int, country_code text,
      utm_source text, utm_medium text, utm_campaign text, utm_term text, utm_content text);
    CREATE TABLE public.page_views (site_id uuid, session_id uuid, url text, viewed_at timestamptz, referrer text);
    CREATE TABLE public.cookie_consents (id uuid DEFAULT gen_random_uuid(), geo_country text, geo_source text);
    CREATE TABLE public.ai_bot_traffic (id uuid DEFAULT gen_random_uuid(), site_id uuid);
    CREATE TABLE public.aggregate_pages_daily (site_id uuid, day date, path text, pageviews int);
    CREATE FUNCTION public._norm_host(u text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
      SELECT regexp_replace(split_part(split_part(regexp_replace(lower(coalesce(u, '')), '^https?://', ''), '/', 1), ':', 1), '^www\\.', '') $$;
    CREATE FUNCTION public._url_param(u text, k text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT NULL::text $$;
    INSERT INTO sites VALUES ('${SITE}', '${SITE}', 'site.se', 30);`);
  await pg.exec(read('../../supabase/migrations/20261124000001_session_browser_os.sql'));
  await pg.exec(read('../../supabase/migrations/20261203000001_geo_columns.sql'));
  await pg.exec(read('../../supabase/migrations/20261203000002_aggregate_countries.sql'));
  return pg;
}

test('PostgreSQL: ingest_pageview stores region (US/CA only) and geo_source from the first view', async () => {
  const pg = await db();
  try {
    const view = (s, at, c, r, src) => pg.query(
      `SELECT public.ingest_pageview('https://site.se/', $1, 'desktop', NULL, $2::timestamptz, $3, NULL, NULL, $4, $5)`, [s, at, c, r, src]);
    await view('a', '2026-12-01 10:00Z', 'US', 'CA', 'ip');
    await view('a', '2026-12-01 10:01Z', 'SE', null, 'timezone');
    await view('b', '2026-12-01 10:00Z', 'BR', 'SP', 'ip');
    await view('c', '2026-12-01 10:00Z', null, null, 'bogus');
    const rows = (await pg.query(`SELECT session_id, country_code, region_code, geo_source FROM tracking_sessions ORDER BY session_id`)).rows;
    assert.deepEqual(rows, [
      { session_id: 'a', country_code: 'US', region_code: 'CA', geo_source: 'ip' },
      { session_id: 'b', country_code: 'BR', region_code: null, geo_source: 'ip' },
      { session_id: 'c', country_code: null, region_code: null, geo_source: 'unknown' },
    ]);
  } finally { await pg.close(); }
});

test('PostgreSQL: CHECK constraints refuse bad geo values', async () => {
  const pg = await db();
  try {
    await assert.rejects(pg.query(`INSERT INTO tracking_sessions (site_id, region_code) VALUES ($1, 'california')`, [SITE]));
    await assert.rejects(pg.query(`INSERT INTO tracking_sessions (site_id, geo_source) VALUES ($1, 'gps')`, [SITE]));
    await assert.rejects(pg.query(`INSERT INTO ai_bot_traffic (site_id, country_code) VALUES ($1, 'usa')`, [SITE]));
    await pg.query(`INSERT INTO ai_bot_traffic (site_id, country_code, region_code) VALUES ($1, 'US', 'NY')`, [SITE]);
    await pg.query(`INSERT INTO cookie_consents (geo_country, geo_source, geo_region) VALUES ('CA', 'ip', 'QC')`);
  } finally { await pg.close(); }
});

test('PostgreSQL: country aggregate counts per day, unknown as empty string, retention follows pages', async () => {
  const pg = await db();
  try {
    for (const c of ['SE', 'SE', 'us', null, 'XX']) {
      await pg.query(`SELECT public.ingest_aggregate_country($1, $2, '2026-12-01 10:00Z')`, [SITE, c]);
    }
    const rows = (await pg.query(`SELECT country, pageviews FROM aggregate_countries_daily ORDER BY country`)).rows;
    assert.deepEqual(rows, [{ country: '', pageviews: 2 }, { country: 'SE', pageviews: 2 }, { country: 'US', pageviews: 1 }]);
    await pg.query(`SELECT public.ingest_aggregate_country($1, 'SE', '2026-11-01 10:00Z')`, [SITE]);
    await pg.query(`INSERT INTO aggregate_pages_daily VALUES ($1, '2026-12-01', '/', 1)`, [SITE]);
    assert.equal((await pg.query(`SELECT public.aggregate_countries_retention() AS n`)).rows[0].n, 1);
    assert.equal((await pg.query(`SELECT count(*)::int n FROM aggregate_countries_daily WHERE day = '2026-11-01'`)).rows[0].n, 0);
    const g = (await pg.query(`SELECT has_function_privilege('anon', 'public.ingest_aggregate_country(uuid,text,timestamptz)', 'EXECUTE') a`)).rows[0].a;
    assert.equal(g, false);
  } finally { await pg.close(); }
});

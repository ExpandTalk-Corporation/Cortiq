// tests/foundation/source-attribution.test.mjs
// Traffic sources: the site's own pages are never a source, and UTM tags beat the referrer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const SITE = '11111111-1111-4111-8111-111111111111';
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

async function db() {
  const pg = new PGlite();
  await pg.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE public.sites (id uuid PRIMARY KEY, user_id uuid NOT NULL, domain text);
    CREATE TABLE public.tracking_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id uuid, started_at timestamptz, referrer text,
      device_type text, page_views integer, duration_seconds integer,
      utm_source text, utm_medium text, utm_campaign text, utm_content text, utm_term text);
    CREATE TABLE public.page_views (site_id uuid, session_id uuid, url text, title text, viewed_at timestamptz);
    CREATE TABLE public.conversion_events (site_id uuid, session_id uuid, event_value numeric, created_at timestamptz);
    CREATE TABLE public.heatmap_data (site_id uuid, url text, interaction_type text, element_text text, created_at timestamptz);
    CREATE FUNCTION public._norm_host(u text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
      SELECT regexp_replace(split_part(split_part(regexp_replace(lower(coalesce(u, '')), '^https?://', ''), '/', 1), ':', 1), '^www\\.', '') $$;
  `);
  for (const f of ['20261109000003_builtin_segments.sql', '20261109000004_tab_filters.sql',
                   '20261114000001_report_rpcs.sql', '20261202000001_source_self_referral_utm.sql']) {
    await pg.exec(read(`../../supabase/migrations/${f}`));
  }
  await pg.query(`INSERT INTO sites VALUES ($1, $2, 'https://www.site.se/')`, [SITE, OWNER]);
  return pg;
}

const sm = async (pg, ref, src, med, host) =>
  (await pg.query(`SELECT source, medium FROM public.session_source_medium($1, $2, $3, $4)`, [ref, src, med, host])).rows[0];

test('PostgreSQL: own-site referrers are direct, www and subdomains included', async () => {
  const pg = await db();
  try {
    assert.deepEqual(await sm(pg, 'https://site.se/a', null, null, 'site.se'), { source: '(direct)', medium: '(none)' });
    assert.deepEqual(await sm(pg, 'https://www.site.se/a', null, null, 'site.se'), { source: '(direct)', medium: '(none)' });
    assert.deepEqual(await sm(pg, 'https://shop.site.se/', null, null, 'site.se'), { source: '(direct)', medium: '(none)' });
    // A different domain that merely ends in the same letters is not the site.
    assert.deepEqual(await sm(pg, 'https://notsite.se/', null, null, 'site.se'), { source: 'notsite.se', medium: 'referral' });
    assert.deepEqual(await sm(pg, 'https://www.google.com/', null, null, 'site.se'), { source: 'google', medium: 'organic' });
    assert.deepEqual(await sm(pg, null, null, null, 'site.se'), { source: '(direct)', medium: '(none)' });
  } finally { await pg.close(); }
});

test('PostgreSQL: utm beats referrer; utm_source without medium gets (not set)', async () => {
  const pg = await db();
  try {
    assert.deepEqual(await sm(pg, 'https://www.google.com/', 'Newsletter', 'Email', 'site.se'), { source: 'newsletter', medium: 'email' });
    assert.deepEqual(await sm(pg, null, 'chatgpt.com', null, 'site.se'), { source: 'chatgpt.com', medium: '(not set)' });
    // utm_medium alone is not a source tag; the referrer decides.
    assert.deepEqual(await sm(pg, 'https://www.linkedin.com/', null, 'cpc', 'site.se'), { source: 'linkedin', medium: 'social' });
  } finally { await pg.close(); }
});

test('PostgreSQL: get_source_breakdown groups self-referrals as direct and uses UTM', async () => {
  const pg = await db();
  try {
    await pg.query(`INSERT INTO tracking_sessions (site_id, started_at, referrer, page_views, utm_source, utm_medium) VALUES
      ($1, '2026-11-02 10:00Z', 'https://www.site.se/admin', 2, NULL, NULL),
      ($1, '2026-11-02 10:00Z', NULL, 1, NULL, NULL),
      ($1, '2026-11-02 10:00Z', 'https://www.google.com/', 1, 'newsletter', 'email'),
      ($1, '2026-11-02 10:00Z', 'https://www.google.com/', 3, NULL, NULL)`, [SITE]);
    await pg.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [OWNER]);
    const r = (await pg.query(`SELECT public.get_source_breakdown($1, '2026-11-01', '2026-11-30') AS r`, [SITE])).rows[0].r;
    assert.equal(r.total_sessions, 4);
    const by = Object.fromEntries(r.sources.map((s) => [`${s.source}/${s.medium}`, s.sessions]));
    assert.deepEqual(by, { '(direct)/(none)': 2, 'newsletter/email': 1, 'google/organic': 1 });
    await pg.query(`SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', false)`);
    await assert.rejects(pg.query(`SELECT public.get_source_breakdown($1, '2026-11-01', '2026-11-30')`, [SITE]), /not authorised/);
  } finally { await pg.close(); }
});

test('the old referrer-only classifier is gone and nothing else calls it', () => {
  const sql = read('../../supabase/migrations/20261202000001_source_self_referral_utm.sql');
  assert.match(sql, /DROP FUNCTION IF EXISTS public\.referrer_source_medium\(text\);/);
});

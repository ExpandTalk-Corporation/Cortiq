// tests/foundation/visit-timeout.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const S = '11111111-1111-4111-8111-111111111111';

test('PostgreSQL: a page view after 30 minutes of inactivity starts a new visit', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE public.sites (id uuid PRIMARY KEY, user_id uuid, domain text);
      CREATE TABLE public.tracking_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id uuid, session_id text,
        device_type text, referrer text, started_at timestamptz, last_activity timestamptz, page_views int,
        duration_seconds int, country_code text,
        utm_source text, utm_medium text, utm_campaign text, utm_term text, utm_content text);
      CREATE TABLE public.page_views (id uuid DEFAULT gen_random_uuid(), site_id uuid, session_id uuid, url text,
        viewed_at timestamptz, referrer text);
      CREATE FUNCTION public._norm_host(u text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
        SELECT regexp_replace(split_part(split_part(regexp_replace(lower(coalesce(u, '')), '^https?://', ''), '/', 1), ':', 1), '^www\.', '') $$;
      CREATE FUNCTION public._url_param(u text, k text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
        SELECT nullif(substring(u from '[?&]' || k || '=([^&#]*)'), '') $$;
      INSERT INTO sites VALUES ('${S}', '${S}', 'a.se');`);
    await db.exec(read('../../supabase/migrations/20261108000001_visit_inactivity_timeout.sql'));

    const view = (url, session, at) => db.query(
      `SELECT public.ingest_pageview($1, $2, 'desktop', null, $3::timestamptz, 'SE')`, [url, session, at]);
    await view('https://a.se/', 's1', '2026-11-08 10:00Z');
    await view('https://a.se/a', 's1', '2026-11-08 10:29Z');   // 29 min gap: same visit
    await view('https://a.se/b', 's1', '2026-11-08 10:58Z');   // 29 min after the last view: same visit
    await view('https://a.se/?utm_source=newsletter', 's1', '2026-11-08 11:30Z'); // 32 min gap: new visit
    await view('https://a.se/c', 's1', '2026-11-08 11:31Z');
    await view('https://a.se/', 's2', '2026-11-08 10:00Z');

    const { rows } = await db.query(`SELECT session_id, started_at, page_views, duration_seconds, utm_source
      FROM tracking_sessions ORDER BY session_id, started_at`);
    assert.equal(rows.length, 3, JSON.stringify(rows));
    assert.deepEqual(rows.map((r) => [r.session_id, r.page_views, r.duration_seconds, r.utm_source]), [
      ['s1', 3, 58 * 60, null],
      ['s1', 2, 60, 'newsletter'],
      ['s2', 1, null, null],
    ]);
    const { rows: pv } = await db.query(`SELECT count(DISTINCT session_id)::int AS n FROM page_views WHERE url LIKE '%/c'`);
    assert.equal(pv[0].n, 1);
    const { rows: link } = await db.query(`SELECT ts.started_at FROM page_views p JOIN tracking_sessions ts ON ts.id = p.session_id
      WHERE p.url = 'https://a.se/c'`);
    assert.equal(new Date(link[0].started_at).toISOString(), '2026-11-08T11:30:00.000Z', 'later page views join the new visit');
  } finally {
    await db.close();
  }
});

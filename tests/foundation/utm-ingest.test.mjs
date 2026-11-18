// tests/foundation/utm-ingest.test.mjs
// Spec 2026-11-18 phase 1 AC2: a visit with utm_* lands in tracking_sessions on a full page load
// and keeps it across SPA route changes (first touch). The aggregate side is covered by
// aggregate-measurement.sql and aggregate-helpers.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const SITE = '11111111-1111-4111-8111-111111111111';

test('PostgreSQL: first-touch UTM on landing, kept on SPA views, new visit takes new tags', async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE public.sites (id uuid PRIMARY KEY, user_id uuid, domain text, session_timeout_minutes integer NOT NULL DEFAULT 30);
      CREATE TABLE public.tracking_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id uuid, session_id text,
        device_type text, browser text, os text, referrer text, started_at timestamptz, last_activity timestamptz,
        page_views int, duration_seconds int, country_code text,
        utm_source text, utm_medium text, utm_campaign text, utm_term text, utm_content text);
      CREATE TABLE public.page_views (id uuid DEFAULT gen_random_uuid(), site_id uuid, session_id uuid, url text,
        viewed_at timestamptz, referrer text);
      CREATE FUNCTION public._norm_host(u text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
        SELECT regexp_replace(split_part(split_part(regexp_replace(lower(coalesce(u, '')), '^https?://', ''), '/', 1), ':', 1), '^www\\.', '') $$;
      INSERT INTO sites VALUES ('${SITE}', '${SITE}', 'site.se');`);
    // The real _url_param (percent-decoding) — only the function block, not the old ingest_pageview.
    const utm = read('../../supabase/migrations/20261015110000_session_utm.sql');
    await pg.exec(utm.match(/CREATE OR REPLACE FUNCTION public\._url_param[\s\S]*?\n\$\$;/)[0]);
    await pg.exec(read('../../supabase/migrations/20261108000001_visit_inactivity_timeout.sql'));
    await pg.exec(read('../../supabase/migrations/20261120000001_session_timeout.sql'));
    await pg.exec(read('../../supabase/migrations/20261124000001_session_browser_os.sql'));

    const view = (url, at, ref = null) => pg.query(
      `SELECT public.ingest_pageview($1, 's1', 'desktop', $2, $3::timestamptz)`, [url, ref, at]);
    const sessions = async () => (await pg.query(
      `SELECT utm_source, utm_medium, utm_campaign, page_views FROM tracking_sessions ORDER BY started_at`)).rows;

    // Full page load with tags (percent-encoded campaign), then two SPA views without tags.
    await view('https://www.site.se/?utm_source=x&utm_medium=y&utm_campaign=z%20q4', '2026-11-20 10:00Z', 'https://www.linkedin.com/');
    await view('https://www.site.se/pricing', '2026-11-20 10:01Z');
    await view('https://www.site.se/contact?utm_source=other', '2026-11-20 10:02Z');
    assert.deepEqual(await sessions(), [{ utm_source: 'x', utm_medium: 'y', utm_campaign: 'z q4', page_views: 3 }]);

    // After the 30-minute timeout the same tab starts a new visit with its own tags.
    await view('https://www.site.se/?utm_source=news&utm_medium=email', '2026-11-20 11:00Z');
    const rows = await sessions();
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[1], { utm_source: 'news', utm_medium: 'email', utm_campaign: null, page_views: 1 });
  } finally {
    await pg.close();
  }
});

test('tracker sends the full URL (with query string) on every page view, SPA included', () => {
  const tracker = read('../../public/spa-tracking.js');
  // trackEvent's metadata carries window.location.href, which keeps ?utm_*.
  assert.match(tracker, /url: window\.location\.href,/);
  // SPA route changes go through the same trackPageView.
  assert.match(tracker, /history\.pushState = function\(/);
  assert.match(tracker, /window\.addEventListener\('popstate', checkPathChange\)/);
});

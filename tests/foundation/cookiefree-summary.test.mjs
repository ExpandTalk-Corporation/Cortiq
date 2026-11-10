// tests/foundation/cookiefree-summary.test.mjs
// Cookie-free tab: get_cookiefree_summary (SQL aggregation, owner-checked) and the client shaping.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { buildCookiefreeAnalytics, periodDays } from '../../src/lib/cookiefreeSummary.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const MIGRATION = '../../supabase/migrations/20261117000001_cookiefree_summary.sql';
const SITE = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

async function setup() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE public.sites (id uuid PRIMARY KEY, user_id uuid NOT NULL);
    CREATE TABLE public.tracking_sessions (site_id uuid, session_id text, started_at timestamptz, duration_seconds int,
      page_views int, device_type text, browser text, os text, referrer text);
    CREATE TABLE public.page_views (site_id uuid, session_id text, url text, title text, viewed_at timestamptz);
    CREATE TABLE public.cookie_consents (site_id uuid, consent_types jsonb, created_at timestamptz);
    INSERT INTO sites VALUES ('${SITE}', '${OWNER}'), ('${OTHER}', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  `);
  await db.exec(read(MIGRATION));
  return db;
}
const asOwner = (db) => db.exec(`SELECT set_config('request.jwt.claim.sub', '${OWNER}', false); SET ROLE authenticated;`);

test('PostgreSQL: cookie-free summary — sessions, sources, top pages, banner answers, access', async () => {
  const db = await setup();
  try {
    await db.exec(`INSERT INTO tracking_sessions VALUES
      ('${SITE}','s1','2026-11-01 10:00Z', 120, 3, 'desktop','Chrome','Windows','https://www.google.com/'),
      ('${SITE}','s2','2026-11-01 11:00Z', 99999, 1, 'mobile','Safari','iOS',''),
      ('${SITE}','s3','2026-11-02 11:00Z', 0, 1, '', NULL, 'macOS','https://x.com/post'),
      ('${SITE}','s4','2026-11-02 12:00Z', 60, 2, 'mobile','Safari','iOS','https://example.org/'),
      ('${SITE}','old','2026-10-01 12:00Z', 60, 2, 'mobile','Safari','iOS',NULL),
      ('${OTHER}','x','2026-11-01 12:00Z', 60, 2, 'mobile','Safari','iOS',NULL)`);
    await db.exec(`INSERT INTO page_views VALUES
      ('${SITE}','s1','https://a.se/','Home','2026-11-01 10:00Z'),
      ('${SITE}','s1','https://a.se/pricing?utm_source=x','Pricing','2026-11-01 10:01Z'),
      ('${SITE}','s1','https://a.se/pricing#faq','Pricing','2026-11-01 10:04Z'),
      ('${SITE}','s2','https://a.se/pricing','Pricing','2026-11-01 11:00Z'),
      ('${SITE}','s4','https://a.se/','Home','2026-11-02 12:00Z'),
      ('${SITE}','s4','https://a.se/blog','','2026-11-02 13:00Z'),
      ('${SITE}','old','https://a.se/old','Old','2026-10-01 12:00Z')`);
    await db.exec(`INSERT INTO cookie_consents VALUES
      ('${SITE}','{"analytics":true,"marketing":true,"preferences":true}','2026-11-01 10:00Z'),
      ('${SITE}','{"analytics":false,"marketing":false,"preferences":false}','2026-11-01 10:00Z'),
      ('${SITE}','{"analytics":true,"marketing":false}','2026-11-01 10:00Z'),
      ('${SITE}','{"analytics":"yes","marketing":1,"preferences":true}','2026-11-02 10:00Z'),
      ('${SITE}','{}','2026-11-02 10:00Z'),
      ('${SITE}','{"analytics":true}','2026-10-01 10:00Z')`);
    await asOwner(db);
    const r = (await db.query(`SELECT public.get_cookiefree_summary('${SITE}','2026-11-01','2026-11-02') AS r`)).rows[0].r;
    assert.equal(r.sessions, 4);
    assert.equal(r.unique_visitors, 4);
    assert.equal(r.bounces, 2);
    assert.equal(r.duration_sessions, 3, 'zero-duration sessions excluded');
    assert.equal(r.duration_sum, 120 + 7200 + 60, 'duration capped at 2 h');
    assert.deepEqual(r.devices, { desktop: 1, mobile: 2, unknown: 1 });
    assert.equal(r.browsers.unknown, 1);
    assert.deepEqual(r.sources, { Google: 1, Direct: 1, 'Twitter/X': 1, Other: 1 });

    assert.equal(r.page_views, 6);
    assert.equal(r.top_pages[0].url, 'https://a.se/pricing', 'query string and fragment stripped');
    assert.equal(r.top_pages[0].views, 3);
    // s1: /pricing?utm 10:01 -> 10:04 = 180 s; the other two pricing views have no successor.
    assert.equal(r.top_pages[0].avgTime, 180);
    const home = r.top_pages.find((p) => p.url === 'https://a.se/');
    assert.equal(home.avgTime, 60, '3600 s gap is over the 30 min cap and ignored');
    assert.equal(r.top_pages.find((p) => p.url === 'https://a.se/blog').title, null);

    assert.equal(r.banner_views, 5);
    assert.equal(r.accepted_all, 2, 'truthy values count like the old JS');
    assert.equal(r.rejected_all, 2);
    assert.equal(r.selective, 1);
    assert.equal(r.analytics_granted, 2, 'analytics strictly true');

    await assert.rejects(db.query(`SELECT public.get_cookiefree_summary('${OTHER}','2026-11-01','2026-11-02')`), /not authorised/);
    await assert.rejects(db.query(`SELECT public.get_cookiefree_summary('${SITE}','2025-01-01','2026-11-02')`), /invalid range/);
    await db.exec('RESET ROLE');
    const priv = (await db.query(`SELECT has_function_privilege('anon','public.get_cookiefree_summary(uuid,date,date)','execute') AS anon,
      has_function_privilege('authenticated','public.get_cookiefree_summary(uuid,date,date)','execute') AS auth`)).rows[0];
    assert.equal(priv.anon, false);
    assert.equal(priv.auth, true);
  } finally {
    await db.close();
  }
});

test('cookie-free migration: owner check, revoke, query stripping, site index', () => {
  const sql = read(MIGRATION);
  assert.match(sql, /user_id = auth\.uid\(\)/);
  assert.match(sql, /REVOKE EXECUTE ON FUNCTION public\.get_cookiefree_summary\(uuid, date, date\) FROM PUBLIC, anon/);
  assert.match(sql, /\[\?#\]\.\*\$/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_cookie_consents_site_created/);
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /SET search_path = ''/);
});

test('cookiefree-analytics Edge Function is gone and no longer proxied', () => {
  assert.equal(existsSync(new URL('../../supabase/functions/cookiefree-analytics', import.meta.url)), false);
  assert.doesNotMatch(read('../../supabase/functions/first-party-proxy/index.ts'), /cookiefree-analytics/);
  assert.doesNotMatch(read('../../src/hooks/useCookiefreeAnalytics.tsx'), /functions\.invoke/);
});

test('periodDays counts both ends', () => {
  assert.equal(periodDays('2026-11-01', '2026-11-01'), 1);
  assert.equal(periodDays('2026-11-01', '2026-11-30'), 30);
  assert.equal(periodDays('bad', '2026-11-30'), 1);
});

test('buildCookiefreeAnalytics: rates, consent-loss estimate, empty input', () => {
  const a = buildCookiefreeAnalytics({
    sessions: 40, unique_visitors: 38, bounces: 10, duration_sessions: 20, duration_sum: 2000,
    devices: { mobile: 10, desktop: 30 }, browsers: { Chrome: 40 }, os: {}, sources: { Direct: 40 },
    page_views: 100, top_pages: [{ url: 'https://a.se/', views: 5, title: null, avgTime: 12 }],
    banner_views: 200, accepted_all: 50, rejected_all: 100, selective: 50, analytics_granted: 80,
  }, '2026-11-01', '2026-11-07');
  assert.equal(a.avgSessionDuration, 100);
  assert.equal(a.avgPagesPerSession, 2.5);
  assert.equal(a.bounceRate, 25);
  assert.equal(a.acceptanceRate, 25);
  assert.equal(a.rejectionRate, 50);
  assert.equal(a.consentRate, 40);
  assert.equal(a.estimatedTotalSessions, 100);
  assert.equal(a.estimatedLostData, 60);
  assert.equal(a.dataLossPercentage, 60);
  assert.equal(a.mobileMetrics.mobilePercentage, 25);
  assert.equal(a.topPages[0].title, '');
  assert.equal(a.period.days, 7);

  const e = buildCookiefreeAnalytics(null, '2026-11-01', '2026-11-01');
  assert.equal(e.totalSessions, 0);
  assert.equal(e.bounceRate, 0);
  assert.equal(e.estimatedTotalSessions, 0);
  assert.equal(e.consentRate, 0);
  assert.deepEqual(e.topPages, []);
});

// tests/foundation/content-pages.test.mjs
// Content tab first-party view: get_content_pages (owner-checked) and the client scoring.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { summariseContentPages, engagementScore, formatSeconds, MIN_VIEWS_FOR_SCORE } from '../../src/lib/contentPages.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const MIGRATION = '../../supabase/migrations/20261117000003_content_pages.sql';
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
    CREATE TABLE public.page_views (site_id uuid, session_id text, url text, title text, viewed_at timestamptz);
    CREATE TABLE public.heatmap_data (site_id uuid, url text, interaction_type text, y_coordinate int, created_at timestamptz);
    INSERT INTO sites VALUES ('${SITE}', '${OWNER}'), ('${OTHER}', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  `);
  await db.exec(read(MIGRATION));
  return db;
}
const asOwner = (db) => db.exec(`SELECT set_config('request.jwt.claim.sub', '${OWNER}', false); SET ROLE authenticated;`);

test('PostgreSQL: content pages — views, visits, entries/exits, time, scroll, access', async () => {
  const db = await setup();
  try {
    await db.exec(`INSERT INTO page_views VALUES
      ('${SITE}','s1','https://a.se/','Home','2026-11-01 10:00Z'),
      ('${SITE}','s1','https://a.se/pricing?utm_source=x','Pricing','2026-11-01 10:01Z'),
      ('${SITE}','s1','https://a.se/pricing#faq','Pricing','2026-11-01 10:03Z'),
      ('${SITE}','s2','https://a.se/pricing','','2026-11-01 11:00Z'),
      ('${SITE}','s2','https://a.se','Home','2026-11-01 12:00Z'),
      ('${SITE}','s3','https://a.se/wp-admin/edit.php','Admin','2026-11-01 12:00Z'),
      ('${SITE}',NULL,'https://a.se/','Home','2026-11-01 12:00Z'),
      ('${SITE}','s4','https://a.se/old','Old','2026-10-01 12:00Z'),
      ('${OTHER}','x','https://b.se/','B','2026-11-01 12:00Z')`);
    await db.exec(`INSERT INTO heatmap_data VALUES
      ('${SITE}','https://a.se/pricing','scroll',25,'2026-11-01 10:01Z'),
      ('${SITE}','https://a.se/pricing','scroll',50,'2026-11-01 10:01Z'),
      ('${SITE}','https://a.se/pricing?x=1','scroll',75,'2026-11-01 10:01Z'),
      ('${SITE}','https://a.se/pricing','scroll',25,'2026-11-01 11:00Z'),
      ('${SITE}','https://a.se/pricing','click',100,'2026-11-01 11:00Z'),
      ('${SITE}','https://a.se/pricing','scroll',100,'2026-10-01 11:00Z')`);
    await asOwner(db);
    const r = (await db.query(`SELECT public.get_content_pages('${SITE}','2026-11-01','2026-11-01') AS r`)).rows[0].r;
    assert.equal(r.visits, 2, 'null session and wp-admin excluded');
    assert.equal(r.page_views, 5);
    assert.equal(r.has_scroll, true);
    assert.deepEqual(r.pages.map((p) => p.path), ['/pricing', '/']);
    const pricing = r.pages[0];
    assert.equal(pricing.views, 3, 'query string and fragment stripped');
    assert.equal(pricing.visits, 2);
    assert.equal(pricing.entries, 1);
    assert.equal(pricing.entries, 1, 's2 starts on /pricing');
    assert.equal(pricing.exits, 1, 's1 ends on /pricing#faq');
    assert.equal(pricing.title, 'Pricing', 'latest non-empty title');
    // s1 10:01 -> 10:03 = 120 s; s1 10:03 is followed by nothing; s2 11:00 -> 12:00 = 3600 s (over cap).
    assert.equal(pricing.time_samples, 1);
    assert.equal(pricing.avg_time_seconds, 120);
    assert.deepEqual([pricing.scroll_25, pricing.scroll_50, pricing.scroll_75, pricing.scroll_100], [2, 1, 1, 0]);
    const home = r.pages[1];
    assert.equal(home.views, 2, 'bare origin is /');
    assert.equal(home.entries, 1);
    assert.equal(home.exits, 1);
    assert.equal(home.avg_time_seconds, 60);
    assert.equal(home.scroll_25, 0);

    const limited = (await db.query(`SELECT public.get_content_pages('${SITE}','2026-11-01','2026-11-01', 1) AS r`)).rows[0].r;
    assert.equal(limited.pages.length, 1);

    await assert.rejects(db.query(`SELECT public.get_content_pages('${OTHER}','2026-11-01','2026-11-01')`), /not authorised/);
    await assert.rejects(db.query(`SELECT public.get_content_pages('${SITE}','2026-11-02','2026-11-01')`), /invalid range/);
    await db.exec('RESET ROLE');
    const priv = (await db.query(`SELECT has_function_privilege('anon','public.get_content_pages(uuid,date,date,int)','execute') AS anon,
      has_function_privilege('authenticated','public.get_content_pages(uuid,date,date,int)','execute') AS auth`)).rows[0];
    assert.equal(priv.anon, false);
    assert.equal(priv.auth, true);
  } finally {
    await db.close();
  }
});

test('content pages migration: owner check, revoke, query stripping, heatmap index', () => {
  const sql = read(MIGRATION);
  assert.match(sql, /user_id = auth\.uid\(\)/);
  assert.match(sql, /REVOKE EXECUTE ON FUNCTION public\.get_content_pages\(uuid, date, date, int\) FROM PUBLIC, anon/);
  assert.match(sql, /\[\?#\]\.\*\$/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_heatmap_data_site_created/);
  assert.match(sql, /SET search_path = ''/);
});

test('summariseContentPages: shares, reach, score threshold', () => {
  const s = summariseContentPages({
    visits: 10, page_views: 30, has_scroll: true,
    pages: [
      { path: '/', title: 'Home', views: 20, visits: 10, entries: 8, exits: 5, time_samples: 15, avg_time_seconds: 60,
        scroll_25: 18, scroll_50: 15, scroll_75: 10, scroll_100: 4 },
      { path: '/x', title: null, views: 3, visits: 3, entries: 2, exits: 3, time_samples: 0, avg_time_seconds: null,
        scroll_25: 0, scroll_50: 0, scroll_75: 0, scroll_100: 0 },
    ],
  });
  const [home, x] = s.pages;
  assert.equal(home.entryShare, 80);
  assert.equal(home.exitRate, 25);
  assert.equal(home.reach50, 75);
  assert.equal(home.reach75, 50);
  assert.equal(home.reach100, 20);
  assert.equal(home.avgTimeSeconds, 60);
  // mean(100 - 25, 60/120 * 100, 50) = 58.33
  assert.equal(home.engagement, 58);
  assert.equal(x.avgTimeSeconds, null);
  assert.equal(x.reach50, null, 'no scroll rows -> null, not 0%');
  assert.equal(x.engagement, null, `fewer than ${MIN_VIEWS_FOR_SCORE} views`);
  assert.deepEqual(summariseContentPages(null), { visits: 0, pageViews: 0, hasScroll: false, pages: [] });
});

test('engagementScore and formatSeconds', () => {
  assert.equal(engagementScore({ views: 10, exitRate: 0, avgTimeSeconds: 300, reach75: 100 }), 100);
  assert.equal(engagementScore({ views: 10, exitRate: 40, avgTimeSeconds: null, reach75: null }), 60);
  assert.equal(engagementScore({ views: 4, exitRate: 0, avgTimeSeconds: 300, reach75: 100 }), null);
  assert.equal(formatSeconds(null), '—');
  assert.equal(formatSeconds(42), '42s');
  assert.equal(formatSeconds(125), '2m 5s');
});

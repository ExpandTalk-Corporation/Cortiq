// tests/foundation/navigation-content.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
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
    CREATE TABLE public.page_views (id uuid DEFAULT gen_random_uuid(), site_id uuid, session_id uuid, url text, viewed_at timestamptz);
    CREATE TABLE public.content_performance (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id uuid, content_id text NOT NULL,
      content_name text, content_type text, date date NOT NULL, impressions int DEFAULT 0, clicks int DEFAULT 0, hovers int DEFAULT 0,
      ctr numeric, updated_at timestamptz DEFAULT now(), UNIQUE (site_id, content_id, date));
    INSERT INTO sites VALUES ('${SITE}', '${OWNER}'), ('${OTHER}', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  `);
  await db.exec(read('../../supabase/migrations/20261016110000_navigation_flow_content.sql'));
  return db;
}
const asOwner = (db) => db.exec(`SELECT set_config('request.jwt.claim.sub', '${OWNER}', false); SET ROLE authenticated;`);

test('PostgreSQL: navigation flow — transitions, reloads ignored, entries/exits, query stripped, access', async () => {
  const db = await setup();
  try {
    const s1 = '00000000-0000-4000-8000-000000000001', s2 = '00000000-0000-4000-8000-000000000002', s3 = '00000000-0000-4000-8000-000000000003';
    await db.exec(`INSERT INTO page_views (site_id, session_id, url, viewed_at) VALUES
      ('${SITE}','${s1}','https://a.se/','2026-09-01 10:00Z'),
      ('${SITE}','${s1}','https://a.se/pricing?utm_source=x','2026-09-01 10:01Z'),
      ('${SITE}','${s1}','https://a.se/pricing','2026-09-01 10:02Z'),
      ('${SITE}','${s1}','https://a.se/contact#form','2026-09-01 10:03Z'),
      ('${SITE}','${s2}','https://a.se/','2026-09-02 10:00Z'),
      ('${SITE}','${s2}','https://a.se/pricing','2026-09-02 10:01Z'),
      ('${SITE}','${s3}','https://a.se/blog','2026-09-02 11:00Z'),
      ('${SITE}','${s3}','https://a.se/wp-admin/x','2026-09-02 11:01Z'),
      ('${SITE}','${s1}','https://a.se/old','2026-08-01 10:00Z')`);
    await asOwner(db);
    const r = (await db.query(`SELECT public.get_navigation_flow('${SITE}','2026-09-01','2026-09-03') AS r`)).rows[0].r;
    assert.equal(r.sessions, 3);
    assert.equal(r.multi_page_sessions, 2);
    assert.deepEqual(r.transitions[0], { from: '/', to: '/pricing', count: 2 });
    assert.ok(r.transitions.some((t) => t.from === '/pricing' && t.to === '/contact' && t.count === 1));
    assert.ok(!r.transitions.some((t) => t.from === t.to), 'reload is not a transition');
    assert.deepEqual(r.entries[0], { path: '/', sessions: 2 });
    assert.deepEqual(r.exits.map((e) => e.path).sort(), ['/contact', '/pricing']);
    await assert.rejects(db.query(`SELECT public.get_navigation_flow('${OTHER}','2026-09-01','2026-09-03')`), /not authorised/);
  } finally {
    await db.close();
  }
});

test('PostgreSQL: content metrics — increments, CTR, junk ignored, owner-checked read', async () => {
  const db = await setup();
  try {
    const items = (arr) => `'${JSON.stringify(arr)}'::jsonb`;
    await db.exec(`SELECT public.record_content_metrics('${SITE}', ${items([
      { id: 'hero', name: 'Hero banner', type: 'banner', action: 'impression' },
      { id: 'hero', action: 'impression' },
      { id: 'hero', action: 'impression' },
      { id: 'hero', action: 'impression' },
      { id: 'hero', action: 'click' },
      { id: 'cta', type: 'button', action: 'impression' },
      { id: '', action: 'click' },
      { id: 'x', action: 'hack' },
    ])})`);
    await asOwner(db);
    const rows = (await db.query(`SELECT public.get_content_performance('${SITE}', current_date - 1, current_date) AS r`)).rows[0].r;
    assert.deepEqual(rows.map((r) => r.content_id), ['hero', 'cta']);
    const hero = rows[0];
    assert.equal(hero.content_name, 'Hero banner', 'name kept when later items omit it');
    assert.equal(hero.impressions, 4);
    assert.equal(hero.clicks, 1);
    assert.equal(Number(hero.ctr), 25);
    await assert.rejects(db.query(`SELECT public.get_content_performance('${OTHER}', current_date - 1, current_date)`), /not authorised/);
  } finally {
    await db.close();
  }
});

test('tracker counts data-cortiq-content and track-event stores it', () => {
  const tracker = read('../../public/spa-tracking.js');
  assert.match(tracker, /function setupContentTracking\(\)/);
  assert.match(tracker, /setupContentTracking\(\);/);
  assert.match(tracker, /event_type: 'content'/);
  assert.match(tracker, /threshold: 0\.5/);
  const fn = read('../../supabase/functions/track-event/index.ts');
  assert.match(fn, /body\.event_type === 'content'/);
  assert.match(fn, /rpc\('record_content_metrics'/);
});

test('Navigation and Content tabs read owner-checked RPCs with the global range', () => {
  assert.match(read('../../src/hooks/useNavigationFlow.ts'), /rpc\('get_navigation_flow'/);
  assert.match(read('../../src/hooks/useContentPerformance.ts'), /rpc\('get_content_performance'/);
  const tab = read('../../src/components/dashboard/tabs/NavigationTab.tsx');
  assert.doesNotMatch(tab, /DateRangePicker|NavigationAnalytics/);
  assert.doesNotMatch(read('../../src/components/dashboard/LinkClickCounts.tsx'), /SelectItem value="7"/);
});

// tests/foundation/aggregate-never.test.mjs
// Spec 2026-11-18 phase 1 AC4: a site with aggregate measurement on that has never sent a hit
// gets an alert after 24 h (the freshness rule needs 7 days of history, so it never fired).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { alertSentence, PIPELINES } from '../../supabase/functions/_shared/pipeline-alerts.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const S1 = '11111111-1111-4111-8111-111111111111';
const S2 = '22222222-2222-4222-8222-222222222222';
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

async function db() {
  const pg = new PGlite();
  await pg.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE public.sites (id uuid PRIMARY KEY, user_id uuid NOT NULL, is_active boolean DEFAULT true,
      aggregate_measurement boolean NOT NULL DEFAULT false);
    CREATE TABLE public.page_views (site_id uuid, viewed_at timestamptz);
    CREATE TABLE public.cookie_consents (site_id uuid, created_at timestamptz);
    CREATE TABLE public.ai_bot_traffic (site_id uuid, source text, detected_at timestamptz);
    CREATE TABLE public.link_click_counts (site_id uuid, updated_at timestamptz);
    CREATE TABLE public.aggregate_pages_daily (site_id uuid, day date);
    GRANT SELECT ON public.sites TO authenticated;
    INSERT INTO public.sites (id, user_id) VALUES ('${S1}', '${OWNER}'), ('${S2}', '${OWNER}');
  `);
  await pg.exec(read('../../supabase/migrations/20261115000001_pipeline_freshness.sql'));
  await pg.exec(read('../../supabase/migrations/20261202000002_aggregate_never_alert.sql'));
  return pg;
}
const open = async (pg) => (await pg.query(
  `SELECT site_id, pipeline FROM public.pipeline_alerts WHERE resolved_at IS NULL ORDER BY site_id`)).rows;
const check = (pg, now) => pg.query(`SELECT * FROM public.check_pipeline_freshness($1)`, [now]);

test('PostgreSQL: enabling sets aggregate_enabled_at; disabling clears it', async () => {
  const pg = await db();
  try {
    await pg.exec(`UPDATE sites SET aggregate_measurement = true WHERE id = '${S1}'`);
    assert.ok((await pg.query(`SELECT aggregate_enabled_at FROM sites WHERE id = $1`, [S1])).rows[0].aggregate_enabled_at);
    await pg.exec(`UPDATE sites SET aggregate_measurement = false WHERE id = '${S1}'`);
    assert.equal((await pg.query(`SELECT aggregate_enabled_at FROM sites WHERE id = $1`, [S1])).rows[0].aggregate_enabled_at, null);
  } finally { await pg.close(); }
});

test('PostgreSQL: no hit 24 h after enabling opens one aggregate_never alert; a hit resolves it', async () => {
  const pg = await db();
  try {
    await pg.exec(`UPDATE sites SET aggregate_measurement = true, aggregate_enabled_at = '2026-11-20 08:00Z' WHERE id IN ('${S1}', '${S2}')`);
    await pg.exec(`INSERT INTO aggregate_pages_daily VALUES ('${S2}', '2026-11-20')`);
    await check(pg, '2026-11-21 07:00Z');           // 23 h: too early
    assert.deepEqual(await open(pg), []);
    await check(pg, '2026-11-21 09:00Z');           // 25 h: S1 alerts, S2 has a hit
    assert.deepEqual(await open(pg), [{ site_id: S1, pipeline: 'aggregate_never' }]);
    await check(pg, '2026-11-21 10:00Z');           // no duplicate
    assert.equal((await pg.query(`SELECT count(*)::int n FROM pipeline_alerts`)).rows[0].n, 1);
    await pg.exec(`INSERT INTO aggregate_pages_daily VALUES ('${S1}', '2026-11-21')`);
    await check(pg, '2026-11-21 11:00Z');
    assert.deepEqual(await open(pg), []);
  } finally { await pg.close(); }
});

test('PostgreSQL: flag off resolves the alert; on again later starts a new 24 h window', async () => {
  const pg = await db();
  try {
    await pg.exec(`UPDATE sites SET aggregate_measurement = true, aggregate_enabled_at = '2026-11-20 08:00Z' WHERE id = '${S1}'`);
    await check(pg, '2026-11-21 09:00Z');
    assert.equal((await open(pg)).length, 1);
    await pg.exec(`UPDATE sites SET aggregate_measurement = false WHERE id = '${S1}'`);
    await check(pg, '2026-11-21 10:00Z');
    assert.deepEqual(await open(pg), []);
    await pg.exec(`UPDATE sites SET aggregate_measurement = true WHERE id = '${S1}'`);
    await pg.exec(`UPDATE sites SET aggregate_enabled_at = '2026-11-22 08:00Z' WHERE id = '${S1}'`);
    await check(pg, '2026-11-22 20:00Z');
    assert.deepEqual(await open(pg), [], 'new window has not elapsed');
  } finally { await pg.close(); }
});

test('PostgreSQL: install status for the owner only', async () => {
  const pg = await db();
  try {
    await pg.exec(`UPDATE sites SET aggregate_measurement = true, aggregate_enabled_at = now() - interval '2 days' WHERE id = '${S1}'`);
    await pg.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [OWNER]);
    const s = (await pg.query(`SELECT public.get_aggregate_install_status($1) AS s`, [S1])).rows[0].s;
    assert.equal(s.enabled, true);
    assert.equal(s.last_hit_day, null);
    assert.equal(s.missing, true);
    await pg.query(`SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', false)`);
    await assert.rejects(pg.query(`SELECT public.get_aggregate_install_status($1)`, [S1]), /not authorised/);
  } finally { await pg.close(); }
});

test('alert wording for a pipeline that never delivered', () => {
  assert.equal(PIPELINES.aggregate_never.label, 'Aggregate measurement (no hits yet)');
  const s = alertSentence({ pipeline: 'aggregate_never', last_seen_at: '2026-11-20T08:00:00Z', expected: 0 }, new Date('2026-11-22T08:00:00Z'));
  assert.equal(s, 'Aggregate measurement was turned on 2 days ago and no hit has arrived since.');
});

test('snippet setup warns when the flag is on and no hit has arrived in 24 h', () => {
  const ui = read('../../src/components/dashboard/TrackingSnippetSetup.tsx');
  assert.match(ui, /rpc\('get_aggregate_install_status', \{ p_site_id: siteId \}\)/);
  assert.match(ui, /installStatus\?\.missing &&/);
  assert.match(ui, /no aggregate hit has arrived/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { alertSentence, PIPELINES } from '../../supabase/functions/_shared/pipeline-alerts.ts';

const migration = readFileSync(new URL('../../supabase/migrations/20261115000001_pipeline_freshness.sql', import.meta.url), 'utf8');

const FIXTURE = `
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE TABLE public.sites (id uuid PRIMARY KEY, user_id uuid NOT NULL, is_active boolean DEFAULT true);
CREATE TABLE public.page_views (site_id uuid, viewed_at timestamptz);
CREATE TABLE public.cookie_consents (site_id uuid, created_at timestamptz);
CREATE TABLE public.ai_bot_traffic (site_id uuid, source text, detected_at timestamptz);
CREATE TABLE public.link_click_counts (site_id uuid, updated_at timestamptz);
CREATE TABLE public.aggregate_pages_daily (site_id uuid, day date);
GRANT SELECT ON public.sites TO authenticated;
INSERT INTO public.sites (id, user_id) VALUES
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
`;
const S1 = '11111111-1111-4111-8111-111111111111';
const S2 = '22222222-2222-4222-8222-222222222222';
const NOW = '2026-11-09T20:00:00Z';

async function db() {
  const pg = new PGlite();
  await pg.exec(FIXTURE);
  await pg.exec(migration);
  return pg;
}
const check = async (pg, now = NOW) => (await pg.query(`SELECT pipeline, site_id, expected, resolved_at FROM public.check_pipeline_freshness($1)`, [now])).rows;

test('PostgreSQL: a busy pipeline that stops opens one alert; overnight quiet and small sites do not', async () => {
  const pg = await db();
  try {
    // S1: 6 page views a day for 28 days, nothing in the last 5 days (båtguide.nu shape).
    await pg.query(`INSERT INTO public.page_views SELECT $1, $2::timestamptz - (h || ' hours')::interval FROM generate_series(120, 672, 4) h`, [S1, NOW]);
    // S1 consents keep flowing, so only page views alert.
    await pg.query(`INSERT INTO public.cookie_consents SELECT $1, $2::timestamptz - (h || ' hours')::interval FROM generate_series(1, 672, 4) h`, [S1, NOW]);
    // S2: busy, but quiet for the last 20 hours (a night and a morning): below 36 h, no alert.
    await pg.query(`INSERT INTO public.page_views SELECT $1, $2::timestamptz - (m || ' minutes')::interval FROM generate_series(1200, 40000, 10) m`, [S2, NOW]);
    // S2: two server-side bot hits a week, silent for 4 days: too few expected, no alert.
    await pg.query(`INSERT INTO public.ai_bot_traffic SELECT $1, 'server_hit', $2::timestamptz - (d || ' days')::interval FROM generate_series(4, 27, 3) d`, [S2, NOW]);
    // S2: a burst of 70 browser agent detections 26 days ago: browser detections never alert.
    await pg.query(`INSERT INTO public.ai_bot_traffic SELECT $1, 'js_tag', $2::timestamptz - interval '26 days' + (m || ' minutes')::interval FROM generate_series(1, 70) m`, [S2, NOW]);
    // S2: a burst of 80 server hits on one day 20 days ago: one day of data sets no rate.
    await pg.query(`INSERT INTO public.ai_bot_traffic SELECT $1, 'cloudflare', $2::timestamptz - interval '20 days' + (m || ' minutes')::interval FROM generate_series(1, 80) m`, [S2, NOW]);

    const first = await check(pg);
    assert.deepEqual(first.map((r) => [r.site_id, r.pipeline]), [[S1, 'page_views']]);
    assert.ok(first[0].expected >= 12 && first[0].expected <= 40, `expected ${first[0].expected}`);

    // Next hour: still open, still returned (no email yet), never duplicated.
    assert.equal((await check(pg, '2026-11-09T21:00:00Z')).length, 1);
    assert.equal((await pg.query(`SELECT count(*)::int n FROM public.pipeline_alerts`)).rows[0].n, 1);

    // The email went out; a page view arrives; the alert resolves and is returned once for the recovery email.
    await pg.exec(`UPDATE public.pipeline_alerts SET opened_notified_at = now()`);
    assert.equal((await check(pg, '2026-11-09T21:30:00Z')).length, 0);
    await pg.query(`INSERT INTO public.page_views VALUES ($1, '2026-11-09T21:40:00Z')`, [S1]);
    const recovered = await check(pg, '2026-11-09T22:00:00Z');
    assert.equal(recovered.length, 1);
    assert.ok(recovered[0].resolved_at);
  } finally {
    await pg.close();
  }
});

test('PostgreSQL: alerts without an opening email do not ask for a recovery email', async () => {
  const pg = await db();
  try {
    await pg.query(`INSERT INTO public.page_views SELECT $1, $2::timestamptz - (h || ' hours')::interval FROM generate_series(48, 672, 2) h`, [S1, NOW]);
    assert.equal((await check(pg)).length, 1);
    await pg.query(`INSERT INTO public.page_views VALUES ($1, '2026-11-09T20:30:00Z')`, [S1]);
    assert.equal((await check(pg, '2026-11-09T21:00:00Z')).length, 0);
    assert.equal((await pg.query(`SELECT count(*)::int n FROM public.pipeline_alerts WHERE resolved_at IS NOT NULL`)).rows[0].n, 1);
  } finally {
    await pg.close();
  }
});

test('PostgreSQL: owners read only their own alerts; the check and the secret are service_role only', async () => {
  const pg = await db();
  try {
    await pg.query(`INSERT INTO public.page_views SELECT s, $1::timestamptz - (h || ' hours')::interval FROM generate_series(48, 672, 2) h, unnest(array[$2, $3]::uuid[]) s`, [NOW, S1, S2]);
    assert.equal((await check(pg)).length, 2);
    await pg.exec(`SET ROLE authenticated; SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';`);
    assert.deepEqual((await pg.query(`SELECT site_id FROM public.pipeline_alerts`)).rows.map((r) => r.site_id), [S1]);
    await pg.exec('RESET ROLE');
    const { rows } = await pg.query(`SELECT
      has_function_privilege('authenticated', 'public.check_pipeline_freshness(timestamptz)', 'EXECUTE') AS auth_check,
      has_function_privilege('anon', 'public.pipeline_activity(timestamptz,timestamptz)', 'EXECUTE') AS anon_activity,
      has_function_privilege('service_role', 'public.check_pipeline_freshness(timestamptz)', 'EXECUTE') AS svc_check,
      has_table_privilege('authenticated', 'public.pipeline_alerts', 'UPDATE') AS auth_update,
      public.pipeline_freshness_cron_secret_matches(repeat('a', 64)) AS secret_without_vault`);
    assert.deepEqual(rows[0], { auth_check: false, anon_activity: false, svc_check: true, auth_update: false, secret_without_vault: false });
  } finally {
    await pg.close();
  }
});

test('the cron job never carries a secret in the migration', () => {
  assert.match(migration, /cron\.schedule\(\s*'pipeline-freshness'/);
  assert.doesNotMatch(migration, /eyJhbGciOi|sb_secret_/);
});

test('every pipeline the SQL emits has wording, and the sentence reads well', () => {
  for (const name of migration.matchAll(/'(page_views|consents|ai_bots_server|link_clicks|aggregate)'/g)) {
    assert.ok(PIPELINES[name[1]], name[1]);
  }
  assert.equal(alertSentence({ pipeline: 'page_views', last_seen_at: '2026-11-04T18:25:00Z', expected: 30 }, new Date(NOW)),
    'Page views stopped arriving 5 days ago; about 30 were expected since, going by the last 28 days.');
  assert.match(alertSentence({ pipeline: 'consents', last_seen_at: '2026-11-08T04:00:00Z', expected: 14 }, new Date(NOW)), /^Consent choices stopped arriving 40 hours ago/);
});

// PGlite schema for the measurement health and conversion alert tests: minimal stubs of the
// production tables (only the columns the functions read) plus the real migrations.
import { existsSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

export const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const S1 = '11111111-1111-4111-8111-111111111111';
export const S2 = '22222222-2222-4222-8222-222222222222';

const MIGRATIONS = [
  '20261115000001_pipeline_freshness.sql',
  '20261130000001_site_uptime.sql',
  '20261204000001_uptime_snippet_version.sql',
  '20261204000002_conversion_alerts.sql',
  '20261204000003_measurement_health.sql',
];

export async function measurementDb() {
  const pg = new PGlite();
  await pg.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE public.sites (id uuid PRIMARY KEY, user_id uuid NOT NULL, domain text, is_active boolean DEFAULT true,
      aggregate_measurement boolean NOT NULL DEFAULT false, conversion_goals jsonb DEFAULT '[]'::jsonb);
    ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
    CREATE POLICY own ON public.sites FOR SELECT TO authenticated USING (user_id = auth.uid());
    CREATE TABLE public.page_views (site_id uuid, viewed_at timestamptz);
    CREATE TABLE public.cookie_consents (site_id uuid, created_at timestamptz, consent_types jsonb);
    CREATE TABLE public.ai_bot_traffic (site_id uuid, source text, detected_at timestamptz);
    CREATE TABLE public.link_click_counts (site_id uuid, day date, click_count integer, updated_at timestamptz);
    CREATE TABLE public.aggregate_pages_daily (site_id uuid, day date, pageviews integer);
    CREATE TABLE public.tracking_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id uuid, started_at timestamptz);
    CREATE TABLE public.user_interactions (session_id uuid, interaction_type text, created_at timestamptz);
    CREATE TABLE public.form_sessions (site_id uuid, form_id text, started_at timestamptz, completed_at timestamptz, abandoned_at timestamptz);
    CREATE TABLE public.conversion_events (site_id uuid, event_name text, element_selector text, created_at timestamptz);
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
    INSERT INTO public.sites (id, user_id, domain) VALUES ('${S1}', '${OWNER}', 'one.example.test'), ('${S2}', '${OTHER}', 'two.example.test');
  `);
  for (const name of MIGRATIONS) {
    const url = new URL(`../../supabase/migrations/${name}`, import.meta.url);
    if (existsSync(url)) await pg.exec(readFileSync(url, 'utf8'));
  }
  // Tables created by the migrations are granted there; the stubs above were granted before them.
  return pg;
}

/** Runs fn as a signed-in user (RLS applies), then switches back. */
export async function asUser(pg, userId, fn) {
  await pg.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${userId}', false);`);
  try { return await fn(); } finally { await pg.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', false);`); }
}

/** n rows at evenly spaced times between fromHoursAgo and toHoursAgo before now. */
export function spread(n, now, fromHoursAgo, toHoursAgo) {
  const end = Date.parse(now);
  return Array.from({ length: n }, (_, i) =>
    new Date(end - (fromHoursAgo - ((fromHoursAgo - toHoursAgo) * (i + 0.5)) / n) * 3_600_000).toISOString());
}

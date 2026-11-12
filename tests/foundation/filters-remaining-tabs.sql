-- Run only in an EMPTY, disposable cortiq_test database. All fixtures roll back.
-- Global dashboard filters (date, path, segment) on Forms, the KPI fallback and Ads (CortIQ):
-- 20261123000001_filters_remaining_tabs.sql.
BEGIN;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE TABLE public.sites (id uuid PRIMARY KEY, user_id uuid NOT NULL);
CREATE TABLE public.tracking_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id uuid, session_id text, started_at timestamptz,
  referrer text, device_type text, page_views integer, duration_seconds integer,
  utm_source text, utm_medium text, utm_campaign text, utm_content text, utm_term text
);
CREATE TABLE public.page_views (site_id uuid, session_id uuid, url text, title text, viewed_at timestamptz);
CREATE TABLE public.conversion_events (
  site_id uuid, session_id uuid, event_value numeric, created_at timestamptz,
  lead_quality text, upload_status text
);
CREATE TABLE public.form_sessions (
  site_id uuid, session_id text, form_id text, form_type text, started_at timestamptz,
  completed_at timestamptz, abandoned_at timestamptz, completion_time integer
);
CREATE TABLE public.form_analytics (
  site_id uuid, form_id text, form_name text, form_type text, updated_at timestamptz
);
-- Stand-in for the date-only overload from 20261016000001; the migration must drop it.
CREATE FUNCTION public.get_kpi_monthly(p_site_id uuid, p_from date, p_to date)
RETURNS TABLE (month text, sessions bigint, unique_users bigint, page_views bigint, avg_duration numeric)
LANGUAGE sql AS $$ SELECT NULL::text, 0::bigint, 0::bigint, 0::bigint, 0::numeric WHERE false $$;
\ir ../../supabase/migrations/20261109000003_builtin_segments.sql
\ir ../../supabase/migrations/20261109000004_tab_filters.sql
\ir ../../supabase/migrations/20261123000001_filters_remaining_tabs.sql

INSERT INTO sites VALUES
 ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

-- v1 newsletter (/, /blog/a, /pricing). v2 google cpc (/pricing). v3 direct (/blog/b).
-- v4 facebook Paid-Social, mixed case (/pricing). v5 is sess-2 again after the session timeout,
-- now from the newsletter (/blog/c). v6 is an October cpc visit.
INSERT INTO tracking_sessions (id, site_id, session_id, started_at, device_type, page_views, duration_seconds,
                               utm_source, utm_medium, utm_campaign) VALUES
 ('00000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'sess-1', '2026-11-01 10:00+00', 'desktop', 3, 100, 'newsletter', 'email', 'nov'),
 ('00000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'sess-2', '2026-11-01 11:00+00', 'mobile', 1, 30, 'google', 'cpc', 'brand'),
 ('00000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'sess-3', '2026-11-01 12:00+00', 'desktop', 2, 60, NULL, NULL, NULL),
 ('00000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'sess-4', '2026-11-01 13:00+00', 'tablet', 2, 50, 'facebook', 'Paid-Social', NULL),
 ('00000000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', 'sess-2', '2026-11-01 15:00+00', 'mobile', 1, 20, 'newsletter', 'email', 'nov'),
 ('00000000-0000-4000-8000-000000000006', '11111111-1111-4111-8111-111111111111', 'sess-6', '2026-10-01 10:00+00', 'desktop', 1, 10, 'google', 'cpc', 'brand');

INSERT INTO page_views VALUES
 ('11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000001', 'https://a.se/', 'Home', '2026-11-01 10:00+00'),
 ('11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000001', 'https://a.se/blog/a', 'A', '2026-11-01 10:01+00'),
 ('11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000001', 'https://a.se/pricing', 'Pricing', '2026-11-01 10:03+00'),
 ('11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000002', 'https://a.se/pricing', 'Pricing', '2026-11-01 11:00+00'),
 ('11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000003', 'https://a.se/blog/b', 'B', '2026-11-01 12:00+00'),
 ('11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000004', 'https://a.se/pricing', 'Pricing', '2026-11-01 13:00+00'),
 ('11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000005', 'https://a.se/blog/c', 'C', '2026-11-01 15:00+00'),
 ('11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000006', 'https://a.se/pricing', 'Pricing', '2026-10-01 10:00+00');

INSERT INTO conversion_events VALUES
 ('11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000001', 10, '2026-11-01 10:05+00', NULL, NULL),
 ('11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000002', 100, '2026-11-01 11:10+00', NULL, NULL),
 ('11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000002', 50.5, '2026-11-01 11:20+00', NULL, NULL),
 ('11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000006', 70, '2026-10-01 10:05+00', NULL, NULL);

-- f2 belongs to v2 (completed before v5 started); f6 to v5. f4 has no visit. f5 is October.
INSERT INTO form_sessions VALUES
 ('11111111-1111-4111-8111-111111111111', 'sess-1', 'contact', 'custom', '2026-11-01 10:02+00', '2026-11-01 10:04+00', NULL, 120),
 ('11111111-1111-4111-8111-111111111111', 'sess-2', 'contact', 'custom', '2026-11-01 11:05+00', '2026-11-01 11:10+00', NULL, 300),
 ('11111111-1111-4111-8111-111111111111', 'sess-3', 'signup', 'custom', '2026-11-01 12:01+00', NULL, '2026-11-01 12:03+00', NULL),
 ('11111111-1111-4111-8111-111111111111', 'sess-x', 'contact', 'custom', '2026-11-01 12:30+00', NULL, '2026-11-01 12:31+00', NULL),
 ('11111111-1111-4111-8111-111111111111', 'sess-6', 'contact', 'custom', '2026-10-01 10:02+00', '2026-10-01 10:04+00', NULL, 90),
 ('11111111-1111-4111-8111-111111111111', 'sess-2', 'contact', 'custom', '2026-11-01 15:20+00', '2026-11-01 15:30+00', NULL, 60);
INSERT INTO form_analytics VALUES
 ('11111111-1111-4111-8111-111111111111', 'contact', 'Old name', 'custom', '2026-09-01 00:00+00'),
 ('11111111-1111-4111-8111-111111111111', 'contact', 'Contact us', 'contact_form_7', '2026-11-01 00:00+00');

SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);

DO $$
DECLARE
  s   constant uuid := '11111111-1111-4111-8111-111111111111';
  seg constant jsonb := '[{"field":"utm_source","op":"eq","value":"newsletter"}]';
  goo constant jsonb := '[{"field":"utm_source","op":"eq","value":"google"}]';
  r jsonb; f jsonb; t record;
BEGIN
  -- Forms: range, then path (the visit viewed the page) and segment.
  r := public.get_form_stats(s, '2026-11-01', '2026-11-30');
  ASSERT (r->>'total_starts')::int = 5 AND (r->>'total_completions')::int = 3
     AND (r->>'total_abandons')::int = 2 AND (r->>'avg_completion_time')::int = 160, 'forms unfiltered: ' || r;
  SELECT x INTO f FROM jsonb_array_elements(r->'forms') x WHERE x->>'form_id' = 'contact';
  ASSERT (f->>'starts')::int = 4 AND (f->>'completions')::int = 3 AND (f->>'abandons')::int = 1
     AND (f->>'conversion_rate')::numeric = 75.0, 'contact form row: ' || f;
  ASSERT f->>'form_name' = 'Contact us' AND f->>'form_type' = 'contact_form_7', 'newest form_analytics name: ' || f;
  r := public.get_form_stats(s, '2026-11-01', '2026-11-30', '/pricing');
  ASSERT (r->>'total_starts')::int = 2 AND (r->>'total_completions')::int = 2, 'forms path /pricing: ' || r;
  r := public.get_form_stats(s, '2026-11-01', '2026-11-30', '/blog');
  ASSERT (r->>'total_starts')::int = 3, 'forms path /blog (f1, f3, f6): ' || r;
  r := public.get_form_stats(s, '2026-11-01', '2026-11-30', NULL, seg);
  ASSERT (r->>'total_starts')::int = 2 AND (r->>'total_completions')::int = 2,
    'forms segment: f1 and f6 (the split visit), not f2: ' || r;
  r := public.get_form_stats(s, '2026-11-01', '2026-11-30', '/pricing', seg);
  ASSERT (r->>'total_starts')::int = 1, 'forms path + segment: ' || r;
  r := public.get_form_stats(s, '2026-10-01', '2026-10-31');
  ASSERT (r->>'total_starts')::int = 1 AND jsonb_array_length(r->'forms') = 1, 'forms October: ' || r;

  -- KPI fallback: monthly sessions with the filters.
  SELECT * INTO t FROM public.get_kpi_monthly(s, '2026-11-01'::date, '2026-11-30'::date);
  ASSERT t.month = '2026-11' AND t.sessions = 5 AND t.unique_users = 4 AND t.page_views = 9, 'kpi unfiltered';
  ASSERT (SELECT count(*) FROM public.get_kpi_monthly(s, '2026-10-01'::date, '2026-11-30'::date)) = 2, 'kpi two months';
  SELECT * INTO t FROM public.get_kpi_monthly(s, '2026-11-01'::date, '2026-11-30'::date, '/pricing');
  ASSERT t.sessions = 3, 'kpi path';
  SELECT * INTO t FROM public.get_kpi_monthly(s, '2026-11-01'::date, '2026-11-30'::date, NULL, seg);
  ASSERT t.sessions = 2 AND t.unique_users = 2, 'kpi segment';

  -- Ads (CortIQ): paid medium is case-insensitive; conversions and revenue from the visits.
  r := public.get_paid_ads_summary(s, '2026-11-01', '2026-11-30');
  ASSERT (r->'summary'->>'totalSessions')::int = 2 AND (r->'summary'->>'totalConversions')::int = 2
     AND (r->'summary'->>'totalRevenue')::numeric = 150.5 AND (r->'summary'->>'conversionRate')::numeric = 100
     AND (r->'summary'->>'totalPageViews')::int = 3 AND (r->>'rawSessions')::int = 2, 'ads unfiltered: ' || r;
  ASSERT jsonb_array_length(r->'campaigns') = 2, 'ads campaigns: ' || r;
  SELECT x INTO f FROM jsonb_array_elements(r->'campaigns') x WHERE x->>'campaign' = 'brand';
  ASSERT (f->>'revenuePerSession')::numeric = 150.5 AND (f->'devices'->>'mobile')::int = 1, 'brand campaign: ' || f;
  ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(r->'campaigns') x WHERE x->>'campaign' = 'Unknown Campaign'), 'unknown campaign';
  ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(r->'sources') x WHERE x->>'source' = 'facebook/paid-social'), 'sources: ' || r;
  ASSERT r->'monthly'->0->>'month' = '2026-11', 'monthly: ' || r;
  r := public.get_paid_ads_summary(s, '2026-11-01', '2026-11-30', '/blog');
  ASSERT (r->'summary'->>'totalSessions')::int = 0 AND r->'campaigns' = '[]'::jsonb, 'ads path /blog: ' || r;
  r := public.get_paid_ads_summary(s, '2026-11-01', '2026-11-30', NULL, goo);
  ASSERT (r->'summary'->>'totalSessions')::int = 1 AND (r->'summary'->>'totalRevenue')::numeric = 150.5, 'ads segment: ' || r;
  r := public.get_paid_ads_summary(s, '2026-10-01', '2026-10-31');
  ASSERT (r->'summary'->>'totalSessions')::int = 1 AND (r->'summary'->>'totalRevenue')::numeric = 70, 'ads October: ' || r;

  -- Range guard.
  BEGIN
    PERFORM public.get_form_stats(s, '2025-01-01', '2026-11-30');
    ASSERT false, 'range over 366 days must fail';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.get_paid_ads_summary(s, '2026-11-30', '2026-11-01');
    ASSERT false, 'reversed range must fail';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END $$;

-- Another user's site: every RPC refuses.
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);
DO $$
DECLARE s constant uuid := '11111111-1111-4111-8111-111111111111'; n int := 0;
BEGIN
  BEGIN PERFORM public.get_form_stats(s, '2026-11-01', '2026-11-30', '/blog');
  EXCEPTION WHEN insufficient_privilege THEN n := n + 1; END;
  BEGIN PERFORM * FROM public.get_kpi_monthly(s, '2026-11-01'::date, '2026-11-30'::date, '/blog');
  EXCEPTION WHEN insufficient_privilege THEN n := n + 1; END;
  BEGIN PERFORM public.get_paid_ads_summary(s, '2026-11-01', '2026-11-30', '/blog');
  EXCEPTION WHEN insufficient_privilege THEN n := n + 1; END;
  ASSERT n = 3, 'non-owner refused by all three RPCs, got ' || n;
END $$;

-- Grants: authenticated may execute, anon may not; the old KPI overload is gone.
DO $$
DECLARE sig text;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.get_form_stats(uuid, date, date, text, jsonb)',
    'public.get_kpi_monthly(uuid, date, date, text, jsonb)',
    'public.get_paid_ads_summary(uuid, date, date, text, jsonb)'
  ] LOOP
    ASSERT has_function_privilege('authenticated', sig, 'EXECUTE'), 'authenticated can execute ' || sig;
    ASSERT NOT has_function_privilege('anon', sig, 'EXECUTE'), 'anon cannot execute ' || sig;
  END LOOP;
  ASSERT to_regprocedure('public.get_kpi_monthly(uuid, date, date)') IS NULL, 'old kpi overload dropped';
END $$;

ROLLBACK;

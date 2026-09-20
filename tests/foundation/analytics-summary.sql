-- Run only in an EMPTY, disposable cortiq_test database. All fixtures roll back.
BEGIN;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE TABLE public.sites (id uuid PRIMARY KEY, user_id uuid NOT NULL);
CREATE TABLE public.page_views (site_id uuid, url text, viewed_at timestamptz);
CREATE TABLE public.tracking_sessions (
  site_id uuid, started_at timestamptz, duration_seconds integer, page_views integer, device_type text
);
\ir ../../supabase/migrations/20260917000001_fix_pageview_total.sql

INSERT INTO sites VALUES
 ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO page_views
 SELECT '11111111-1111-4111-8111-111111111111', '/page-' || (i % 10), '2026-09-10 12:00:00+00'::timestamptz
 FROM generate_series(1, 1000) i;
INSERT INTO page_views VALUES
 ('11111111-1111-4111-8111-111111111111', '/wp-admin', '2026-09-10 12:00:00+00'),
 ('11111111-1111-4111-8111-111111111111', '/outside', '2026-08-01 12:00:00+00'),
 ('22222222-2222-4222-8222-222222222222', '/other-site', '2026-09-10 12:00:00+00');
INSERT INTO tracking_sessions VALUES
 ('11111111-1111-4111-8111-111111111111', '2026-09-10 12:00:00+00', 30, 2, 'desktop');
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);

DO $$
DECLARE result jsonb;
BEGIN
  result := public.get_analytics_summary('11111111-1111-4111-8111-111111111111', '2026-09-10 00:00:00+00', '2026-09-11 00:00:00+00');
  ASSERT (result->>'total_page_views')::int = 1000, 'must count views, not URL groups';
  ASSERT jsonb_array_length(result->'top_pages') = 10, 'top pages preserved';
  ASSERT (result->'top_pages'->0->>'views')::int = 100, 'group counts preserved';
  ASSERT (result->>'total_sessions')::int = 1, 'session count unchanged';
  ASSERT (result->>'engaged_sessions')::int = 1, 'engagement unchanged';
  result := public.get_analytics_summary('11111111-1111-4111-8111-111111111111', '2027-01-01+00', '2027-01-02+00');
  ASSERT (result->>'total_page_views')::int = 0, 'empty period must be zero, not null';
  result := public.get_analytics_summary('22222222-2222-4222-8222-222222222222', '2026-09-10+00', '2026-09-11+00');
  ASSERT result = '{}'::jsonb, 'another tenant must not be visible';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  ASSERT public.get_analytics_summary('11111111-1111-4111-8111-111111111111', '2026-09-10+00', '2026-09-11+00') = '{}'::jsonb,
    'missing identity must not be visible';
  ASSERT NOT has_function_privilege('anon', 'public.get_analytics_summary(uuid,timestamptz,timestamptz)', 'EXECUTE'), 'anon must not have execute';
  ASSERT has_function_privilege('authenticated', 'public.get_analytics_summary(uuid,timestamptz,timestamptz)', 'EXECUTE'), 'authenticated must have execute';
END $$;
ROLLBACK;

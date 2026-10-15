-- tests/foundation/tabs-date-range.sql
BEGIN;
-- Range bounds are UTC days regardless of the session time zone.
SET LOCAL TIME ZONE 'Europe/Stockholm';
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE TABLE public.sites (id uuid PRIMARY KEY, user_id uuid NOT NULL, domain text);
CREATE TABLE public.ai_bot_traffic (site_id uuid, bot_name text, bot_type text, request_type text,
  url text, detected_at timestamptz);
CREATE TABLE public.ai_citations (site_id uuid, clicked boolean, created_at timestamptz);
CREATE TABLE public.tracking_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id uuid, session_id text,
  referrer text, utm_source text, utm_medium text, utm_campaign text, started_at timestamptz,
  page_views int, duration_seconds int);
-- Stand-in for the deployed day-count signature: it must keep resolving next to the overload.
CREATE FUNCTION public.get_ai_bot_tracking(p_site_id uuid, p_days int DEFAULT 7)
  RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('legacy', p_days) $$;
\ir ../../supabase/migrations/20261016000001_tabs_date_range_rpcs.sql

INSERT INTO sites VALUES ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','a.se'),
                         ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','b.se');

-- AI bot traffic: two rows inside 2026-09-01..2026-09-02, one on each edge outside it.
INSERT INTO ai_bot_traffic VALUES
  ('11111111-1111-4111-8111-111111111111','GPTBot','openai','training','https://a.se/',      '2026-09-01 00:00Z'),
  ('11111111-1111-4111-8111-111111111111','PerplexityBot','perplexity','citation','https://a.se/app.js','2026-09-02 23:59Z'),
  ('11111111-1111-4111-8111-111111111111','GPTBot','openai','training','https://a.se/',      '2026-08-31 23:59Z'),
  ('11111111-1111-4111-8111-111111111111','GPTBot','openai','training','https://a.se/',      '2026-09-03 00:00Z'),
  ('22222222-2222-4222-8222-222222222222','GPTBot','openai','training','https://b.se/',      '2026-09-01 10:00Z');
INSERT INTO ai_citations VALUES
  ('11111111-1111-4111-8111-111111111111', true,  '2026-09-01 12:00Z'),
  ('11111111-1111-4111-8111-111111111111', false, '2026-09-02 12:00Z'),
  ('11111111-1111-4111-8111-111111111111', true,  '2026-09-05 12:00Z');

-- Sessions: social (by referrer and by UTM), direct, a year boundary and an out-of-range row.
INSERT INTO tracking_sessions (site_id, session_id, referrer, utm_source, utm_medium, utm_campaign, started_at, page_views, duration_seconds) VALUES
  ('11111111-1111-4111-8111-111111111111','s1','https://l.facebook.com/l.php?u=x', null, null, null, '2025-12-31 23:00Z', 1, 10),
  ('11111111-1111-4111-8111-111111111111','s2','https://www.linkedin.com/feed/',  null, null, null, '2026-01-01 09:00Z', 3, 50),
  ('11111111-1111-4111-8111-111111111111','s3', null, 'facebook', 'social', 'launch',                '2026-01-01 10:00Z', 2, 30),
  ('11111111-1111-4111-8111-111111111111','s4', null, null, null, null,                              '2026-01-01 11:00Z', 5, 90),
  ('11111111-1111-4111-8111-111111111111','s5','https://t.co/abc', null, null, null,                 '2026-01-03 11:00Z', 1, 5),
  ('22222222-2222-4222-8222-222222222222','s6','https://facebook.com/', null, null, null,            '2026-01-01 11:00Z', 1, 5);

SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE r jsonb;
BEGIN
  -- get_ai_bot_tracking: both ends inclusive, nothing outside, asset URLs left out of top URLs.
  r := public.get_ai_bot_tracking('11111111-1111-4111-8111-111111111111','2026-09-01','2026-09-02');
  ASSERT (r->>'totalTraffic')::int = 2, 'two in-range bot hits: ' || r::text;
  ASSERT (r->>'trainingCrawlers')::int = 1, 'one training hit';
  ASSERT (r->>'citationRequests')::int = 2, 'citations bounded by range';
  ASSERT (r->>'citationCtr')::numeric = 50, 'one of two citations clicked';
  ASSERT jsonb_array_length(r->'dailyTrend') = 2, 'one trend point per day';
  ASSERT jsonb_array_length(r->'topUrls') = 1 AND r->'topUrls'->0->>'url' = 'https://a.se/', 'asset URL excluded';
  ASSERT jsonb_array_length(r->'botBreakdown') = 2, 'GPTBot and PerplexityBot';

  -- The original day-count signature still resolves, with and without its default.
  ASSERT public.get_ai_bot_tracking('11111111-1111-4111-8111-111111111111') = '{"legacy": 7}'::jsonb, 'legacy default call';
  ASSERT public.get_ai_bot_tracking('11111111-1111-4111-8111-111111111111', 30) = '{"legacy": 30}'::jsonb, 'legacy days call';

  -- get_kpi_monthly(range): per calendar month across the year boundary.
  ASSERT (SELECT count(*) FROM public.get_kpi_monthly('11111111-1111-4111-8111-111111111111','2025-12-01','2026-01-31')) = 2,
    'December and January rows';
  ASSERT (SELECT sessions FROM public.get_kpi_monthly('11111111-1111-4111-8111-111111111111','2025-12-01','2026-01-31') WHERE month = '2026-01') = 4,
    'January sessions (other tenant excluded)';
  ASSERT (SELECT page_views FROM public.get_kpi_monthly('11111111-1111-4111-8111-111111111111','2025-12-01','2026-01-31') WHERE month = '2026-01') = 11,
    'January page views';
  ASSERT (SELECT count(*) FROM public.get_kpi_monthly('11111111-1111-4111-8111-111111111111','2026-01-01','2026-01-01')) = 1,
    'single-day range';

  -- get_social_daily: only social sessions, referrer reduced to host, bounded by range.
  r := public.get_social_daily('11111111-1111-4111-8111-111111111111','2026-01-01','2026-01-02');
  ASSERT jsonb_array_length(r) = 2, 'linkedin referrer + facebook UTM, direct and t.co (out of range) excluded: ' || r::text;
  ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(r) e WHERE e->>'referrer' = 'www.linkedin.com' AND (e->>'page_views')::int = 3),
    'referrer host only';
  ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(r) e WHERE e->>'utm_source' = 'facebook' AND e->>'utm_campaign' = 'launch'
    AND (e->>'bounces')::int = 0), 'UTM-tagged session kept with campaign';
  r := public.get_social_daily('11111111-1111-4111-8111-111111111111','2025-12-31','2026-01-03');
  ASSERT (SELECT sum((e->>'sessions')::int) FROM jsonb_array_elements(r) e) = 4, 'facebook referrer, linkedin, utm, t.co';

  -- Access and range validation.
  BEGIN
    PERFORM public.get_ai_bot_tracking('22222222-2222-4222-8222-222222222222','2026-09-01','2026-09-02');
    RAISE EXCEPTION 'expected denial (ai bots)';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.get_kpi_monthly('22222222-2222-4222-8222-222222222222','2026-01-01','2026-01-31');
    RAISE EXCEPTION 'expected denial (kpi)';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.get_social_daily('22222222-2222-4222-8222-222222222222','2026-01-01','2026-01-31');
    RAISE EXCEPTION 'expected denial (social)';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.get_ai_bot_tracking('11111111-1111-4111-8111-111111111111','2026-09-02','2026-09-01');
    RAISE EXCEPTION 'expected invalid range';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.get_social_daily('11111111-1111-4111-8111-111111111111','2025-01-01','2026-01-31');
    RAISE EXCEPTION 'expected range too long';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END $$;
ROLLBACK;

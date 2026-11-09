-- Run only in an EMPTY, disposable cortiq_test database. All fixtures roll back.
BEGIN;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE TABLE public.sites (id uuid PRIMARY KEY, user_id uuid NOT NULL);
CREATE TABLE public.tracking_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id uuid, started_at timestamptz, referrer text,
  device_type text, page_views integer, duration_seconds integer,
  utm_source text, utm_medium text, utm_campaign text, utm_content text, utm_term text
);
CREATE TABLE public.page_views (site_id uuid, session_id uuid, url text, title text, viewed_at timestamptz);
CREATE TABLE public.conversion_events (site_id uuid, session_id uuid, event_value numeric, created_at timestamptz);
CREATE TABLE public.heatmap_data (site_id uuid, url text, interaction_type text, element_text text, created_at timestamptz);
\ir ../../supabase/migrations/20261109000003_builtin_segments.sql
\ir ../../supabase/migrations/20261109000004_tab_filters.sql
\ir ../../supabase/migrations/20261114000001_report_rpcs.sql

INSERT INTO sites VALUES
 ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

-- 1,500 sessions: more than the 1,000-row API cap the old client code hit.
INSERT INTO tracking_sessions (id, site_id, started_at, referrer, device_type, page_views, duration_seconds)
SELECT md5('s' || i)::uuid, '11111111-1111-4111-8111-111111111111', '2026-11-01 12:00+00',
       CASE WHEN i % 3 = 0 THEN 'https://www.google.com/' WHEN i % 3 = 1 THEN NULL ELSE 'https://www.example.org/a' END,
       CASE WHEN i % 2 = 0 THEN 'mobile' ELSE 'desktop' END,
       CASE WHEN i % 5 = 0 THEN 1 ELSE 3 END, 60
FROM generate_series(1, 1500) i;
INSERT INTO tracking_sessions (site_id, started_at, referrer, device_type, page_views)
VALUES ('11111111-1111-4111-8111-111111111111', '2026-10-01 12:00+00', NULL, 'desktop', 1),
       ('22222222-2222-4222-8222-222222222222', '2026-11-01 12:00+00', NULL, 'desktop', 1);

-- 3,000 page views over 3 URLs; one outside the range.
INSERT INTO page_views
SELECT '11111111-1111-4111-8111-111111111111', md5('s' || (1 + i % 1500))::uuid,
       'https://site.test/p' || (i % 3), CASE WHEN i % 3 = 0 THEN 'Home' END, '2026-11-02 12:00+00'
FROM generate_series(1, 3000) i;
INSERT INTO page_views VALUES ('11111111-1111-4111-8111-111111111111', NULL, 'https://site.test/old', NULL, '2026-09-01 12:00+00');

-- 10 converting sessions (two events on one), value 5 each event.
INSERT INTO conversion_events
SELECT '11111111-1111-4111-8111-111111111111', md5('s' || i)::uuid, 5, '2026-11-01 13:00+00' FROM generate_series(1, 10) i;
INSERT INTO conversion_events VALUES ('11111111-1111-4111-8111-111111111111', md5('s1')::uuid, 5, '2026-11-01 13:00+00');

INSERT INTO heatmap_data
SELECT '11111111-1111-4111-8111-111111111111', 'https://site.test/p0', 'click',
       CASE WHEN i % 4 = 0 THEN 'Skicka' WHEN i % 4 = 1 THEN 'Ring oss' ELSE 'Read more' END, '2026-11-02 12:00+00'
FROM generate_series(1, 1200) i;

SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);

DO $$
DECLARE r jsonb; g jsonb;
BEGIN
  -- Top pages: every row counted, title kept, limit respected.
  r := public.get_top_pages('11111111-1111-4111-8111-111111111111', '2026-11-01', '2026-11-30', 2);
  ASSERT (r->>'total_views')::int = 3000, 'top pages must count all 3,000 views: ' || r;
  ASSERT jsonb_array_length(r->'pages') = 2, 'limit';
  ASSERT (r->'pages'->0->>'views')::int = 1000, 'per-URL count';
  ASSERT (SELECT count(*) FROM jsonb_array_elements(public.get_top_pages('11111111-1111-4111-8111-111111111111', '2026-11-01', '2026-11-30')->'pages') p
          WHERE p->>'title' = 'Home') = 1, 'title kept';
  r := public.get_top_pages('11111111-1111-4111-8111-111111111111', '2026-11-01', '2026-11-30', 10, '/p1');
  ASSERT (r->>'total_views')::int = 1000, 'path filter';

  -- Sources: all 1,500 sessions, referrer classification, distinct converting sessions.
  r := public.get_source_breakdown('11111111-1111-4111-8111-111111111111', '2026-11-01', '2026-11-30');
  ASSERT (r->>'total_sessions')::int = 1500, 'sources must count all sessions: ' || (r->>'total_sessions');
  SELECT s INTO g FROM jsonb_array_elements(r->'sources') s WHERE s->>'source' = 'google';
  ASSERT g->>'medium' = 'organic' AND (g->>'sessions')::int = 500, 'google organic';
  SELECT s INTO g FROM jsonb_array_elements(r->'sources') s WHERE s->>'source' = 'example.org';
  ASSERT g->>'medium' = 'referral', 'www. stripped, referral';
  SELECT s INTO g FROM jsonb_array_elements(r->'sources') s WHERE s->>'source' = '(direct)';
  ASSERT (g->>'sessions')::int = 500, 'direct';
  ASSERT (SELECT sum((s->>'conversions')::int) FROM jsonb_array_elements(r->'sources') s) = 10, 'converting sessions, not events';
  ASSERT (SELECT sum((s->>'bounces')::int) FROM jsonb_array_elements(r->'sources') s) = 300, 'bounces = single-page sessions';

  -- Segments: devices and direct/referred, conversion value summed per session.
  r := public.get_segment_stats('11111111-1111-4111-8111-111111111111', '2026-11-01', '2026-11-30');
  ASSERT (r->>'total_sessions')::int = 1500, 'segments must count all sessions';
  ASSERT (SELECT sum((d->>'sessions')::int) FROM jsonb_array_elements(r->'devices') d) = 1500, 'devices add up';
  ASSERT (SELECT sum((d->>'converting_sessions')::int) FROM jsonb_array_elements(r->'devices') d) = 10, 'converting sessions';
  ASSERT (SELECT sum((d->>'conversion_value')::numeric) FROM jsonb_array_elements(r->'devices') d) = 55, 'value';
  ASSERT (SELECT (a->>'sessions')::int FROM jsonb_array_elements(r->'arrivals') a WHERE a->>'key' = 'referred') = 1000, 'referred';

  -- Funnel: all 1,200 clicks, heuristics.
  r := public.get_page_funnel('11111111-1111-4111-8111-111111111111', 'https://site.test/p0', '2026-11-01', '2026-11-30');
  ASSERT (r->>'page_visits')::int = 1000, 'funnel page visits';
  ASSERT (r->>'total_clicks')::int = 1200, 'funnel must count all clicks';
  ASSERT (r->>'form_submissions')::int = 300 AND (r->>'phone_clicks')::int = 300, 'click types: ' || r;

  -- Contract: other tenant and bad ranges are refused.
  BEGIN
    PERFORM public.get_top_pages('22222222-2222-4222-8222-222222222222', '2026-11-01', '2026-11-30');
    RAISE EXCEPTION 'other tenant visible';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.get_segment_stats('11111111-1111-4111-8111-111111111111', '2025-01-01', '2026-11-30');
    RAISE EXCEPTION 'range not limited';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;

  ASSERT NOT has_function_privilege('anon', 'public.get_top_pages(uuid,date,date,int,text,jsonb)', 'EXECUTE'), 'anon top pages';
  ASSERT NOT has_function_privilege('anon', 'public.get_source_breakdown(uuid,date,date,text,jsonb)', 'EXECUTE'), 'anon sources';
  ASSERT NOT has_function_privilege('anon', 'public.get_segment_stats(uuid,date,date,text,jsonb)', 'EXECUTE'), 'anon segments';
  ASSERT NOT has_function_privilege('anon', 'public.get_page_funnel(uuid,text,date,date)', 'EXECUTE'), 'anon funnel';
  ASSERT has_function_privilege('authenticated', 'public.get_page_funnel(uuid,text,date,date)', 'EXECUTE'), 'authenticated funnel';
END $$;
ROLLBACK;

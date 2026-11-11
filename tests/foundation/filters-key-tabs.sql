-- Run only in an EMPTY, disposable cortiq_test database. All fixtures roll back.
-- Global dashboard filters (date, path, segment) on Pages, Content, Heatmaps, AI bots and
-- Attribution: 20261119000001_filters_key_tabs.sql.
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
CREATE TABLE public.conversion_events (
  site_id uuid, session_id uuid, event_value numeric, created_at timestamptz,
  lead_quality text, upload_status text
);
CREATE TABLE public.heatmap_data (
  site_id uuid, url text, interaction_type text, element_text text, y_coordinate int, created_at timestamptz
);
CREATE TABLE public.ai_bot_traffic (
  site_id uuid, bot_name text, bot_type text, request_type text, url text, detected_at timestamptz
);
CREATE TABLE public.ai_citations (site_id uuid, cited_url text, clicked boolean, created_at timestamptz);
\ir ../../supabase/migrations/20261109000003_builtin_segments.sql
\ir ../../supabase/migrations/20261109000004_tab_filters.sql
\ir ../../supabase/migrations/20261114000001_report_rpcs.sql
\ir ../../supabase/migrations/20261117000003_content_pages.sql
\ir ../../supabase/migrations/20261119000001_filters_key_tabs.sql

INSERT INTO sites VALUES
 ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

-- s1: newsletter visit, / → /blog/a → /pricing. s2: google visit, /blog/b only.
-- s3: direct visit, /pricing only.
INSERT INTO tracking_sessions (id, site_id, started_at, utm_source, utm_medium) VALUES
 ('00000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', '2026-11-01 10:00+00', 'newsletter', 'email'),
 ('00000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', '2026-11-01 11:00+00', 'google', 'cpc'),
 ('00000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', '2026-11-01 12:00+00', NULL, NULL);

INSERT INTO page_views VALUES
 ('11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000001', 'https://a.se/', 'Home', '2026-11-01 10:00+00'),
 ('11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000001', 'https://a.se/blog/a', 'A', '2026-11-01 10:01+00'),
 ('11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000001', 'https://a.se/pricing', 'Pricing', '2026-11-01 10:03+00'),
 ('11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000002', 'https://a.se/blog/b', 'B', '2026-11-01 11:00+00'),
 ('11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000003', 'https://a.se/pricing', 'Pricing', '2026-11-01 12:00+00'),
 ('11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000003', 'https://a.se/wp-admin/edit.php', 'Admin', '2026-11-01 12:01+00'),
 ('11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000003', 'https://a.se/?elementor-preview=4', 'Prev', '2026-11-01 12:02+00'),
 ('11111111-1111-4111-8111-111111111111', NULL, 'https://a.se/blog/old', 'Old', '2026-10-01 12:00+00');

INSERT INTO conversion_events VALUES
 ('11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000001', 1, '2026-11-01 10:05+00', 'Priority', 'uploaded'),
 ('11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000002', 1, '2026-11-01 11:05+00', 'Qualified', 'pending'),
 ('11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000003', 1, '2026-11-01 12:05+00', NULL, NULL),
 ('11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-000000000003', 1, '2026-10-01 12:05+00', 'Priority', 'uploaded');

INSERT INTO heatmap_data VALUES
 ('11111111-1111-4111-8111-111111111111', 'https://a.se/blog/a', 'click', 'x', NULL, '2026-11-01 10:01+00'),
 ('11111111-1111-4111-8111-111111111111', 'https://a.se/blog/a', 'scroll', NULL, 25, '2026-11-01 10:01+00'),
 ('11111111-1111-4111-8111-111111111111', 'https://a.se/pricing', 'click', 'y', NULL, '2026-11-01 10:03+00'),
 ('11111111-1111-4111-8111-111111111111', 'https://a.se/pricing', 'click', 'y', NULL, '2026-11-01 12:00+00'),
 ('11111111-1111-4111-8111-111111111111', 'https://a.se/pricing', 'scroll', NULL, 50, '2026-11-01 12:00+00');

INSERT INTO ai_bot_traffic VALUES
 ('11111111-1111-4111-8111-111111111111', 'GPTBot', 'openai', 'training', 'https://a.se/blog/a', '2026-11-01 09:00+00'),
 ('11111111-1111-4111-8111-111111111111', 'GPTBot', 'openai', 'training', 'https://a.se/blog/b', '2026-11-01 09:00+00'),
 ('11111111-1111-4111-8111-111111111111', 'ChatGPT-User', 'openai', 'agentic', '/pricing', '2026-11-01 09:00+00'),
 ('11111111-1111-4111-8111-111111111111', 'GPTBot', 'openai', 'training', 'https://a.se/blog/old', '2026-10-01 09:00+00');
INSERT INTO ai_citations VALUES
 ('11111111-1111-4111-8111-111111111111', 'https://a.se/blog/a', true, '2026-11-01 09:00+00'),
 ('11111111-1111-4111-8111-111111111111', 'https://a.se/pricing', false, '2026-11-01 09:00+00');

SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);

DO $$
DECLARE
  s   constant uuid := '11111111-1111-4111-8111-111111111111';
  seg constant jsonb := '[{"field":"utm_source","op":"eq","value":"newsletter"}]';
  r jsonb; p jsonb; t record;
BEGIN
  -- Top pages: editor/preview rows excluded, path and segment filter in the database.
  r := public.get_top_pages(s, '2026-11-01', '2026-11-30', 10);
  ASSERT (r->>'total_views')::int = 5, 'top pages excludes wp-admin and elementor preview: ' || r;
  r := public.get_top_pages(s, '2026-11-01', '2026-11-30', 10, '/blog');
  ASSERT (r->>'total_views')::int = 2, 'top pages path: ' || r;
  r := public.get_top_pages(s, '2026-11-01', '2026-11-30', 10, NULL, seg);
  ASSERT (r->>'total_views')::int = 3, 'top pages segment: ' || r;
  r := public.get_top_pages(s, '2026-11-01', '2026-11-30', 10, '/blog', seg);
  ASSERT (r->>'total_views')::int = 1, 'top pages path + segment: ' || r;

  -- Content pages: path keeps entry/exit from the full visit.
  r := public.get_content_pages(s, '2026-11-01', '2026-11-30');
  ASSERT (r->>'page_views')::int = 5 AND (r->>'visits')::int = 3, 'content unfiltered: ' || r;
  ASSERT (r->>'has_scroll')::boolean, 'content scroll without segment';
  r := public.get_content_pages(s, '2026-11-01', '2026-11-30', 100, '/blog');
  ASSERT (r->>'page_views')::int = 2 AND (r->>'visits')::int = 2, 'content path totals: ' || r;
  SELECT x INTO p FROM jsonb_array_elements(r->'pages') x WHERE x->>'path' = '/blog/a';
  ASSERT (p->>'entries')::int = 0 AND (p->>'exits')::int = 0, '/blog/a is mid-visit: ' || p;
  ASSERT (p->>'avg_time_seconds')::int = 120, 'time to next page kept: ' || p;
  ASSERT (p->>'scroll_25')::int = 1, 'scroll by path: ' || p;
  ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r->'pages') x WHERE x->>'path' NOT LIKE '/blog%'), 'only /blog pages';
  r := public.get_content_pages(s, '2026-11-01', '2026-11-30', 100, NULL, seg);
  ASSERT (r->>'page_views')::int = 3 AND (r->>'visits')::int = 1, 'content segment: ' || r;
  ASSERT NOT (r->>'has_scroll')::boolean, 'scroll has no session: hidden under a segment';

  -- Heatmap pages: path only.
  ASSERT (SELECT count(*) FROM public.get_heatmap_pages(s, '2026-11-01', '2026-11-30')) = 2, 'heatmap pages';
  SELECT * INTO t FROM public.get_heatmap_pages(s, '2026-11-01', '2026-11-30', 50, '/pricing');
  ASSERT t.url = 'https://a.se/pricing' AND t.clicks = 2 AND t.scrolls = 1, 'heatmap path';
  ASSERT (SELECT count(*) FROM public.get_heatmap_pages(s, '2026-11-01', '2026-11-30', 50, '/pricing')) = 1, 'heatmap path rows';

  -- AI bots: path on bot url (full URL or path) and on citation cited_url.
  r := public.get_ai_bot_tracking(s, '2026-11-01', '2026-11-30');
  ASSERT (r->>'totalTraffic')::int = 3 AND (r->>'citationRequests')::int = 2, 'ai unfiltered: ' || r;
  r := public.get_ai_bot_tracking(s, '2026-11-01', '2026-11-30', '/blog');
  ASSERT (r->>'totalTraffic')::int = 2 AND (r->>'trainingCrawlers')::int = 2, 'ai path: ' || r;
  ASSERT (r->>'citationRequests')::int = 1 AND (r->>'citationCtr')::float = 100, 'ai citation path: ' || r;
  ASSERT jsonb_array_length(r->'topUrls') = 2, 'ai top urls path';
  r := public.get_ai_bot_tracking(s, '2026-11-01', '2026-11-30', '/pricing');
  ASSERT (r->>'totalTraffic')::int = 1, 'ai path matches a bare path url: ' || r;

  -- Attribution gap: range, path (visit viewed it) and segment.
  SELECT * INTO t FROM public.get_attribution_gap(s, '2026-11-01'::date, '2026-11-30'::date);
  ASSERT t.cortiq_conversions = 3 AND t.hubspot_mqls = 2 AND t.uploaded = 1 AND t.pending_upload = 1
     AND t.classified_count = 2 AND t.unclassified_count = 1, 'attribution range';
  SELECT * INTO t FROM public.get_attribution_gap(s, '2026-11-01'::date, '2026-11-30'::date, '/pricing');
  ASSERT t.cortiq_conversions = 2 AND t.hubspot_mqls = 1, 'attribution path';
  SELECT * INTO t FROM public.get_attribution_gap(s, '2026-11-01'::date, '2026-11-30'::date, NULL, seg);
  ASSERT t.cortiq_conversions = 1 AND t.hubspot_mqls = 1 AND t.uploaded = 1, 'attribution segment';

  -- Range guard.
  BEGIN
    PERFORM public.get_attribution_gap(s, '2026-11-30'::date, '2026-11-01'::date);
    ASSERT false, 'reversed range must fail';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END $$;

-- Another user's site: every RPC refuses.
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);
DO $$
DECLARE s constant uuid := '11111111-1111-4111-8111-111111111111'; n int := 0;
BEGIN
  BEGIN PERFORM public.get_top_pages(s, '2026-11-01', '2026-11-30', 10, '/blog');
  EXCEPTION WHEN insufficient_privilege THEN n := n + 1; END;
  BEGIN PERFORM public.get_content_pages(s, '2026-11-01', '2026-11-30', 100, '/blog');
  EXCEPTION WHEN insufficient_privilege THEN n := n + 1; END;
  BEGIN PERFORM public.get_heatmap_pages(s, '2026-11-01', '2026-11-30', 50, '/blog');
  EXCEPTION WHEN insufficient_privilege THEN n := n + 1; END;
  BEGIN PERFORM public.get_ai_bot_tracking(s, '2026-11-01', '2026-11-30', '/blog');
  EXCEPTION WHEN insufficient_privilege THEN n := n + 1; END;
  BEGIN PERFORM public.get_attribution_gap(s, '2026-11-01'::date, '2026-11-30'::date, '/blog');
  EXCEPTION WHEN insufficient_privilege THEN n := n + 1; END;
  ASSERT n = 5, 'non-owner refused by all five RPCs, got ' || n;
END $$;

-- Grants: authenticated may execute, anon may not; old overloads are gone.
DO $$
DECLARE sig text;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.get_top_pages(uuid, date, date, int, text, jsonb)',
    'public.get_content_pages(uuid, date, date, int, text, jsonb)',
    'public.get_heatmap_pages(uuid, date, date, int, text)',
    'public.get_ai_bot_tracking(uuid, date, date, text)',
    'public.get_attribution_gap(uuid, date, date, text, jsonb)'
  ] LOOP
    ASSERT has_function_privilege('authenticated', sig, 'EXECUTE'), 'authenticated can execute ' || sig;
    ASSERT NOT has_function_privilege('anon', sig, 'EXECUTE'), 'anon cannot execute ' || sig;
  END LOOP;
  ASSERT to_regprocedure('public.get_content_pages(uuid, date, date, int)') IS NULL, 'old content overload dropped';
  ASSERT to_regprocedure('public.get_heatmap_pages(uuid, date, date, int)') IS NULL, 'old heatmap overload dropped';
  ASSERT to_regprocedure('public.get_ai_bot_tracking(uuid, date, date)') IS NULL, 'old ai overload dropped';
END $$;

ROLLBACK;

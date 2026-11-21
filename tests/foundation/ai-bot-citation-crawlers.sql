-- Run only in an EMPTY, disposable cortiq_test database. All fixtures roll back.
-- AI bots tab: "citation requests" = citation crawler rows, not ai_citations
-- (20261212000001_ai_bot_citation_crawlers.sql).
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
  site_id uuid, bot_name text, bot_type text, request_type text, bot_category text, url text, detected_at timestamptz
);
CREATE TABLE public.ai_citations (site_id uuid, cited_url text, clicked boolean, created_at timestamptz);
\ir ../../supabase/migrations/20261109000003_builtin_segments.sql
\ir ../../supabase/migrations/20261109000004_tab_filters.sql
\ir ../../supabase/migrations/20261114000001_report_rpcs.sql
\ir ../../supabase/migrations/20261117000003_content_pages.sql
\ir ../../supabase/migrations/20261119000001_filters_key_tabs.sql

\ir ../../supabase/migrations/20261212000001_ai_bot_citation_crawlers.sql

INSERT INTO sites VALUES
 ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

-- Two real citation crawlers, one training crawler, and the two legacy shapes that carry
-- request_type 'citation' without being one: a human from ChatGPT stored as "Unknown Bot"
-- by trackAICitation, and AhrefsBot from before the registry. Plus an ai_citations row
-- that must no longer count.
INSERT INTO ai_bot_traffic VALUES
 ('11111111-1111-4111-8111-111111111111', 'PerplexityBot', 'perplexity', 'citation', 'citation', 'https://a.se/blog/a', '2026-11-01 09:00+00'),
 ('11111111-1111-4111-8111-111111111111', 'OAI-SearchBot', 'openai', 'citation', 'citation', 'https://a.se/pricing', '2026-11-01 09:00+00'),
 ('11111111-1111-4111-8111-111111111111', 'GPTBot', 'openai', 'training', 'training', 'https://a.se/blog/b', '2026-11-01 09:00+00'),
 ('11111111-1111-4111-8111-111111111111', 'Unknown Bot', 'unknown', 'citation', 'other', 'https://a.se/blog/a', '2026-11-01 09:00+00'),
 ('11111111-1111-4111-8111-111111111111', 'Other Bot', 'other', 'citation', 'other', 'https://a.se/blog/c', '2026-11-01 09:00+00'),
 ('22222222-2222-4222-8222-222222222222', 'PerplexityBot', 'perplexity', 'citation', 'citation', 'https://b.se/', '2026-11-01 09:00+00');
INSERT INTO ai_citations VALUES
 ('11111111-1111-4111-8111-111111111111', 'https://a.se/blog/a', true, '2026-11-01 09:00+00');

SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);

DO $$
DECLARE
  s constant uuid := '11111111-1111-4111-8111-111111111111';
  r jsonb;
BEGIN
  r := public.get_ai_bot_tracking(s, '2026-11-01', '2026-11-30');
  ASSERT (r->>'totalTraffic')::int = 5, 'total unchanged: ' || r;
  ASSERT (r->>'citationRequests')::int = 2, 'only registry citation crawlers count: ' || r;
  ASSERT (r->>'trainingCrawlers')::int = 1, 'training: ' || r;
  ASSERT NOT r ? 'citationCtr', 'citationCtr was ai_citations.clicked and is gone: ' || r;

  r := public.get_ai_bot_tracking(s, '2026-11-01', '2026-11-30', '/blog');
  ASSERT (r->>'citationRequests')::int = 1, 'path filter on the crawler url: ' || r;

  ASSERT NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_ai_bot_tracking' AND pronargs = 2),
    'the (uuid, integer) overload that read ai_citations is dropped';
  ASSERT NOT position('ai_citations' IN pg_get_functiondef('public.get_ai_bot_tracking(uuid,date,date,text)'::regprocedure)) > 0,
    'the RPC no longer reads ai_citations';
  ASSERT NOT has_function_privilege('anon', 'public.get_ai_bot_tracking(uuid,date,date,text)', 'EXECUTE'), 'not anon';
END $$;

-- Owner only.
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);
DO $$
BEGIN
  PERFORM public.get_ai_bot_tracking('11111111-1111-4111-8111-111111111111', '2026-11-01', '2026-11-30');
  RAISE EXCEPTION 'expected not authorised';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;

ROLLBACK;

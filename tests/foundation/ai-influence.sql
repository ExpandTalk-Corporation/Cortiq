-- Run only in an EMPTY, disposable database. All fixtures roll back.
-- Attribution layer 2: get_ai_influence (20261127000001_ai_influence.sql).
BEGIN;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE TABLE public.sites (id uuid PRIMARY KEY, user_id uuid NOT NULL, aggregate_measurement boolean DEFAULT false);
CREATE TABLE public.ai_bot_traffic (site_id uuid, url text, bot_type text, request_type text, detected_at timestamptz);
CREATE TABLE public.tracking_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id uuid, started_at timestamptz, referrer text, utm_source text);
CREATE TABLE public.aggregate_sources_daily (site_id uuid, day date, referrer_domain text, utm_source text, visits integer);
CREATE TABLE public.page_views (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id uuid, url text);
CREATE TABLE public.conversion_events (site_id uuid, page_view_id uuid, created_at timestamptz);
CREATE TABLE public.site_google_credentials (site_id uuid, is_active boolean, brand_keywords text);
CREATE TABLE public.gsc_data (site_id uuid, period_start date, period_end date, dimension text, value text, clicks integer, impressions integer);

\ir ../../supabase/migrations/20261127000001_ai_influence.sql

-- Site A (sessions) and site B (aggregate measurement), both owned by user a.
INSERT INTO public.sites VALUES
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false),
  ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);

INSERT INTO public.ai_bot_traffic VALUES
  ('11111111-1111-4111-8111-111111111111', 'https://a.se/pricing/?x=1', 'chatgpt', 'agentic', '2026-11-05 10:00Z'),
  ('11111111-1111-4111-8111-111111111111', 'https://a.se/pricing', 'perplexity', 'citation', '2026-11-05 11:00Z'),
  ('11111111-1111-4111-8111-111111111111', 'https://a.se/blog', 'perplexity', 'citation', '2026-11-06 11:00Z'),
  ('11111111-1111-4111-8111-111111111111', 'https://a.se/blog', 'gptbot', 'training', '2026-11-06 12:00Z'),
  -- Before the range but inside the window of a conversion on 2026-11-02.
  ('11111111-1111-4111-8111-111111111111', 'https://a.se/', 'chatgpt', 'agentic', '2026-10-25 09:00Z');

INSERT INTO public.tracking_sessions (site_id, started_at, referrer, utm_source) VALUES
  ('11111111-1111-4111-8111-111111111111', '2026-11-05 12:00Z', 'https://chatgpt.com/', NULL),
  ('11111111-1111-4111-8111-111111111111', '2026-11-05 13:00Z', NULL, 'chatgpt.com'),
  ('11111111-1111-4111-8111-111111111111', '2026-11-05 14:00Z', 'https://www.google.com/', NULL),
  ('11111111-1111-4111-8111-111111111111', '2026-11-06 14:00Z', 'https://www.perplexity.ai/search', NULL),
  ('22222222-2222-4222-8222-222222222222', '2026-11-05 12:00Z', 'https://chatgpt.com/', NULL);

INSERT INTO public.aggregate_sources_daily VALUES
  ('22222222-2222-4222-8222-222222222222', '2026-11-05', 'chatgpt.com', NULL, 4),
  ('22222222-2222-4222-8222-222222222222', '2026-11-05', 'google.com', NULL, 9),
  -- Aggregate rows on a sessions site are not counted.
  ('11111111-1111-4111-8111-111111111111', '2026-11-05', 'chatgpt.com', NULL, 50);

INSERT INTO public.page_views (id, site_id, url) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'https://a.se/pricing/'),
  ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'https://a.se/contact'),
  ('aaaaaaaa-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'https://a.se/');
INSERT INTO public.conversion_events VALUES
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001', '2026-11-07 10:00Z'), -- after fetch, in window
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001', '2026-11-04 10:00Z'), -- before the fetch
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000002', '2026-11-07 10:00Z'), -- never fetched
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000003', '2026-11-02 10:00Z'), -- fetched 2026-10-25, in window
  ('11111111-1111-4111-8111-111111111111', NULL, '2026-11-08 10:00Z');                                      -- no page

INSERT INTO public.site_google_credentials VALUES
  ('11111111-1111-4111-8111-111111111111', true, 'Acme, acme corp'),
  ('11111111-1111-4111-8111-111111111111', false, 'old');
INSERT INTO public.gsc_data VALUES
  ('11111111-1111-4111-8111-111111111111', '2026-11-01', '2026-11-30', 'query', 'acme pricing', 5, 50),
  ('11111111-1111-4111-8111-111111111111', '2026-11-01', '2026-11-30', 'query', 'ACME CORP login', 3, 20),
  ('11111111-1111-4111-8111-111111111111', '2026-11-01', '2026-11-30', 'query', 'old crm tools', 7, 300),
  ('11111111-1111-4111-8111-111111111111', '2026-11-01', '2026-11-30', 'page', 'https://a.se/acme', 99, 999),
  ('11111111-1111-4111-8111-111111111111', '2026-09-01', '2026-09-30', 'query', 'acme', 1, 1);

SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
DO $$
DECLARE
  a constant uuid := '11111111-1111-4111-8111-111111111111';
  b constant uuid := '22222222-2222-4222-8222-222222222222';
  r jsonb; d jsonb;
BEGIN
  ASSERT public.url_path_key('https://a.se/pricing/?x=1#top') = '/pricing', 'path key strips host, query, fragment, slash';
  ASSERT public.url_path_key('https://a.se') = '/' AND public.url_path_key('/blog/') = '/blog', 'path key root and bare path';
  ASSERT public.url_path_key(NULL) IS NULL, 'no url, no path';

  r := public.get_ai_influence(a, '2026-11-01', '2026-11-30');
  ASSERT NOT (r->>'aggregate')::boolean AND (r->>'windowDays')::int = 14, 'meta: ' || r::text;
  ASSERT jsonb_array_length(r->'daily') = 30, 'one row per day';
  SELECT x INTO d FROM jsonb_array_elements(r->'daily') x WHERE x->>'day' = '2026-11-05';
  ASSERT (d->>'agentic')::int = 1 AND (d->>'citation')::int = 1 AND (d->>'referrals')::int = 2, 'day 5 (sessions, referrer + utm): ' || d::text;
  SELECT x INTO d FROM jsonb_array_elements(r->'daily') x WHERE x->>'day' = '2026-11-06';
  ASSERT (d->>'citation')::int = 1 AND (d->>'agentic')::int = 0 AND (d->>'referrals')::int = 1, 'day 6, training left out: ' || d::text;
  ASSERT (SELECT sum((x->>'agentic')::int + (x->>'citation')::int) FROM jsonb_array_elements(r->'daily') x) = 3, 'fetch before range not in daily';

  ASSERT r->'assistants'->0->>'botType' = 'perplexity' AND (r->'assistants'->0->>'citation')::int = 2, 'assistants: ' || (r->'assistants')::text;
  ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r->'assistants') x WHERE x->>'botType' = 'gptbot'), 'no training crawler';

  SELECT x INTO d FROM jsonb_array_elements(r->'pages') x WHERE x->>'path' = '/pricing';
  ASSERT (d->>'agentic')::int = 1 AND (d->>'citation')::int = 1 AND (d->>'conversions')::int = 2, 'pricing page: ' || d::text;

  ASSERT (r->'conversions'->>'total')::int = 5 AND (r->'conversions'->>'onAiReadPages')::int = 2, 'conversions: ' || (r->'conversions')::text;

  ASSERT jsonb_array_length(r->'brand') = 1, 'brand snapshot in range only: ' || (r->'brand')::text;
  d := r->'brand'->0;
  ASSERT (d->>'brandClicks')::int = 8 AND (d->>'brandImpressions')::int = 70 AND (d->>'otherClicks')::int = 7, 'brand split, page rows ignored: ' || d::text;

  -- Window 1 day: the 2026-10-25 fetch no longer counts for the 2026-11-02 conversion.
  r := public.get_ai_influence(a, '2026-11-01', '2026-11-30', 1);
  ASSERT (r->'conversions'->>'onAiReadPages')::int = 0, 'window 1 day: ' || (r->'conversions')::text;

  -- Aggregate site: aggregate rows only, sessions not added on top; no brand keywords = null.
  r := public.get_ai_influence(b, '2026-11-01', '2026-11-30');
  SELECT x INTO d FROM jsonb_array_elements(r->'daily') x WHERE x->>'day' = '2026-11-05';
  ASSERT (r->>'aggregate')::boolean AND (d->>'referrals')::int = 4, 'aggregate referrals: ' || d::text;
  ASSERT r->'brand' = 'null'::jsonb, 'no brand keywords: ' || coalesce(r->>'brand', 'sql null');
  ASSERT (r->'conversions'->>'total')::int = 0 AND jsonb_array_length(r->'pages') = 0, 'empty site sections';

  BEGIN
    PERFORM public.get_ai_influence(a, '2026-11-30', '2026-11-01');
    ASSERT false, 'reversed range must fail';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.get_ai_influence(a, '2026-11-01', '2026-11-30', 0);
    ASSERT false, 'window 0 must fail';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END $$;

SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);
DO $$
BEGIN
  PERFORM public.get_ai_influence('11111111-1111-4111-8111-111111111111', '2026-11-01', '2026-11-30');
  ASSERT false, 'non-owner must be refused';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;

DO $$
BEGIN
  ASSERT has_function_privilege('authenticated', 'public.get_ai_influence(uuid, date, date, integer)', 'EXECUTE'), 'authenticated can execute';
  ASSERT NOT has_function_privilege('anon', 'public.get_ai_influence(uuid, date, date, integer)', 'EXECUTE'), 'anon cannot execute';
END $$;

ROLLBACK;

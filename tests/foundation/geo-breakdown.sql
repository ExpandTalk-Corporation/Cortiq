-- tests/foundation/geo-breakdown.sql
BEGIN;
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE TABLE public.sites (id uuid PRIMARY KEY, user_id uuid NOT NULL, domain text);
CREATE TABLE public.tracking_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id uuid, session_id text,
  device_type text, referrer text, started_at timestamptz, last_activity timestamptz,
  page_views int, duration_seconds int);
CREATE TABLE public.page_views (id uuid DEFAULT gen_random_uuid(), site_id uuid, session_id uuid, url text,
  viewed_at timestamptz, referrer text);
CREATE TABLE public.conversion_events (site_id uuid, session_id uuid, created_at timestamptz);
CREATE FUNCTION public._norm_host(u text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT regexp_replace(split_part(split_part(regexp_replace(lower(coalesce(u, '')), '^https?://', ''), '/', 1), ':', 1), '^www\.', '') $$;
CREATE FUNCTION public.ingest_pageview(p_url text, p_session text, p_device text, p_referrer text, p_viewed_at timestamptz)
  RETURNS void LANGUAGE sql AS $$ SELECT $$;
\ir ../../supabase/migrations/20261015100000_session_country.sql

INSERT INTO sites VALUES ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','a.se'),
                         ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','b.se');

-- Ingest: country is stamped on session creation, normalised, and junk is dropped.
SELECT public.ingest_pageview('https://a.se/', 's1', 'desktop', null, '2026-09-01 10:00Z', 'se');
SELECT public.ingest_pageview('https://a.se/x', 's1', 'desktop', null, '2026-09-01 10:01Z', 'US'); -- same session: keeps SE
SELECT public.ingest_pageview('https://a.se/', 's2', 'mobile', null, '2026-09-02 10:00Z', 'SE');
SELECT public.ingest_pageview('https://a.se/', 's3', 'mobile', null, '2026-09-02 11:00Z', 'US');
SELECT public.ingest_pageview('https://a.se/', 's4', 'mobile', null, '2026-09-02 12:00Z', 'XX'); -- Cloudflare unknown
SELECT public.ingest_pageview('https://a.se/', 's5', 'mobile', null, '2026-09-02 13:00Z', 'T1'); -- Tor
SELECT public.ingest_pageview('https://a.se/', 's6', 'mobile', null, '2026-09-02 14:00Z', 'Sweden');
SELECT public.ingest_pageview('https://a.se/', 's7', 'mobile', null, '2026-09-02 15:00Z');        -- old 5-arg call shape
SELECT public.ingest_pageview('https://a.se/', 's8', 'mobile', null, '2026-08-01 10:00Z', 'DE');  -- outside range
SELECT public.ingest_pageview('https://b.se/', 's9', 'mobile', null, '2026-09-02 10:00Z', 'NO');  -- other tenant

DO $$
BEGIN
  ASSERT (SELECT country_code FROM tracking_sessions WHERE session_id = 's1') = 'SE', 'first page view sets country, lower-case normalised';
  ASSERT (SELECT page_views FROM tracking_sessions WHERE session_id = 's1') = 2, 'second page view still counted';
  ASSERT (SELECT count(*) FROM tracking_sessions WHERE session_id IN ('s4','s5','s6','s7') AND country_code IS NULL) = 4,
    'XX, T1, non-ISO and missing country are stored as NULL';
END $$;

INSERT INTO conversion_events SELECT site_id, id, started_at FROM tracking_sessions WHERE session_id = 's2';

SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE r jsonb; se jsonb; unk jsonb;
BEGIN
  r := public.get_geo_breakdown('11111111-1111-4111-8111-111111111111','2026-09-01','2026-09-03');
  ASSERT jsonb_array_length(r) = 3, 'SE, US and unknown rows: ' || r::text;
  ASSERT r->0->>'country_code' = 'SE', 'sorted by sessions desc';
  ASSERT r->2->'country_code' = 'null'::jsonb, 'unknown bucket last even when largest';
  SELECT e INTO se FROM jsonb_array_elements(r) e WHERE e->>'country_code' = 'SE';
  ASSERT (se->>'sessions')::int = 2 AND (se->>'page_views')::int = 3, 'SE sessions/page views';
  ASSERT (se->>'conversions')::int = 1, 'SE conversions';
  ASSERT (se->>'bounce_rate')::numeric = 50, 'SE bounce: s2 single-page';
  SELECT e INTO unk FROM jsonb_array_elements(r) e WHERE e->'country_code' = 'null'::jsonb;
  ASSERT (unk->>'sessions')::int = 4, 'unknown bucket keeps totals honest';

  BEGIN
    PERFORM public.get_geo_breakdown('22222222-2222-4222-8222-222222222222','2026-09-01','2026-09-03');
    RAISE EXCEPTION 'expected denial';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.get_geo_breakdown('11111111-1111-4111-8111-111111111111','2026-09-03','2026-09-01');
    RAISE EXCEPTION 'expected invalid range';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END $$;
ROLLBACK;

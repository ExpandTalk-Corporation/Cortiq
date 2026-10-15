-- tests/foundation/campaign-breakdown.sql
BEGIN;
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE TABLE public.sites (id uuid PRIMARY KEY, user_id uuid NOT NULL, domain text);
CREATE TABLE public.tracking_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id uuid, session_id text,
  device_type text, referrer text, started_at timestamptz, last_activity timestamptz,
  page_views int, duration_seconds int,
  utm_source text, utm_medium text, utm_campaign text, utm_term text, utm_content text);
CREATE TABLE public.page_views (id uuid DEFAULT gen_random_uuid(), site_id uuid, session_id uuid, url text,
  viewed_at timestamptz, referrer text);
CREATE TABLE public.conversion_events (site_id uuid, session_id uuid, created_at timestamptz);
CREATE FUNCTION public._norm_host(u text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT regexp_replace(split_part(split_part(regexp_replace(lower(coalesce(u, '')), '^https?://', ''), '/', 1), ':', 1), '^www\.', '') $$;
CREATE FUNCTION public.ingest_pageview(p_url text, p_session text, p_device text, p_referrer text, p_viewed_at timestamptz)
  RETURNS void LANGUAGE sql AS $$ SELECT $$;
\ir ../../supabase/migrations/20261015100000_session_country.sql
-- Pre-existing session whose landing URL carried UTM tags: the migration backfills it.
INSERT INTO sites VALUES ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','a.se'),
                         ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','b.se');
INSERT INTO tracking_sessions (id, site_id, session_id, started_at, page_views)
  VALUES ('00000000-0000-4000-8000-0000000000aa','11111111-1111-4111-8111-111111111111','old','2026-09-01 08:00Z',2);
INSERT INTO page_views (site_id, session_id, url, viewed_at) VALUES
  ('11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-0000000000aa','https://a.se/?utm_source=chatgpt.com','2026-09-01 08:00Z'),
  ('11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-0000000000aa','https://a.se/x?utm_source=other','2026-09-01 08:01Z');
\ir ../../supabase/migrations/20261015110000_session_utm.sql

SELECT public.ingest_pageview('https://a.se/?utm_source=Newsletter&utm_medium=email&utm_campaign=Okt%20launch&utm_term=a+b&utm_content=hero#top', 's1', 'desktop', null, '2026-09-01 10:00Z', 'SE');
SELECT public.ingest_pageview('https://a.se/pricing?utm_source=google', 's1', 'desktop', null, '2026-09-01 10:01Z', 'SE'); -- same session keeps first-touch tags
SELECT public.ingest_pageview('https://a.se/?utm_source=newsletter&utm_medium=email&utm_campaign=Okt%20launch', 's2', 'mobile', null, '2026-09-02 10:00Z', 'SE');
SELECT public.ingest_pageview('https://a.se/?xutm_source=nope&ref=1', 's3', 'mobile', null, '2026-09-02 11:00Z', 'SE');
SELECT public.ingest_pageview('https://a.se/?utm_source=', 's4', 'mobile', null, '2026-09-02 12:00Z', 'SE');
SELECT public.ingest_pageview('https://a.se/?utm_source=%E0%A4%A', 's5', 'mobile', null, '2026-09-02 13:00Z', 'SE'); -- malformed escape
SELECT public.ingest_pageview('https://b.se/?utm_source=newsletter', 's9', 'mobile', null, '2026-09-02 10:00Z', 'NO');

DO $$
DECLARE t tracking_sessions;
BEGIN
  SELECT * INTO t FROM tracking_sessions WHERE session_id = 's1';
  ASSERT t.utm_source = 'Newsletter' AND t.utm_medium = 'email' AND t.utm_campaign = 'Okt launch'
     AND t.utm_term = 'a b' AND t.utm_content = 'hero', 'parsed + decoded: ' || row_to_json(t)::text;
  ASSERT (SELECT utm_source FROM tracking_sessions WHERE session_id = 'old') = 'chatgpt.com', 'backfill uses the first page view';
  ASSERT (SELECT utm_source FROM tracking_sessions WHERE session_id = 's3') IS NULL, 'xutm_source is not utm_source';
  ASSERT (SELECT utm_source FROM tracking_sessions WHERE session_id = 's4') IS NULL, 'empty value is NULL';
  ASSERT (SELECT utm_source FROM tracking_sessions WHERE session_id = 's5') = '%E0%A4%A', 'malformed escape keeps the raw value';
END $$;

INSERT INTO conversion_events SELECT site_id, id, started_at FROM tracking_sessions WHERE session_id = 's2';

SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE r jsonb; nl jsonb;
BEGIN
  r := public.get_campaign_breakdown('11111111-1111-4111-8111-111111111111','2026-09-01','2026-09-03');
  SELECT e INTO nl FROM jsonb_array_elements(r->'campaigns') e WHERE e->>'utm_campaign' = 'Okt launch';
  ASSERT (nl->>'sessions')::int = 2, 'source grouped case-insensitively: ' || r::text;
  ASSERT nl->>'utm_source' = 'newsletter', 'source normalised to lower case';
  ASSERT (nl->>'conversions')::int = 1 AND (nl->>'page_views')::int = 3, 'conversions + page views';
  ASSERT (r->>'tagged_sessions')::int = 4 AND (r->>'total_sessions')::int = 6, 'tagged vs total: ' || r::text;
  ASSERT jsonb_array_length(r->'campaigns') = 3, 'newsletter, chatgpt.com (backfilled), raw malformed value';

  BEGIN
    PERFORM public.get_campaign_breakdown('22222222-2222-4222-8222-222222222222','2026-09-01','2026-09-03');
    RAISE EXCEPTION 'expected denial';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
ROLLBACK;

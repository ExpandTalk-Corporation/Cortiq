-- tests/foundation/overview-metrics.sql
BEGIN;
CREATE ROLE anon; CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE TABLE public.sites (id uuid PRIMARY KEY, user_id uuid NOT NULL);
CREATE TABLE public.tracking_sessions (id uuid PRIMARY KEY, site_id uuid, started_at timestamptz,
  utm_source text, utm_medium text, utm_campaign text, utm_content text, utm_term text);
CREATE TABLE public.page_views (id uuid DEFAULT gen_random_uuid(), site_id uuid, session_id uuid, url text, viewed_at timestamptz);
CREATE TABLE public.conversion_events (site_id uuid, session_id uuid, created_at timestamptz);
CREATE TABLE public.ai_bot_traffic (site_id uuid, url text, request_type text, source text, detected_at timestamptz);
\ir ../../supabase/migrations/20261015000001_overview_metrics.sql

INSERT INTO sites VALUES ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
                         ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
-- current period 2026-09-01..2026-09-03; previous 2026-08-29..2026-08-31
INSERT INTO tracking_sessions VALUES
 ('00000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','2026-09-01 10:00Z','newsletter',null,null,null,null),
 ('00000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','2026-09-03 10:00Z','google',null,null,null,null),
 ('00000000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','2026-08-30 10:00Z',null,null,null,null,null),
 ('00000000-0000-4000-8000-000000000009','22222222-2222-4222-8222-222222222222','2026-09-01 10:00Z',null,null,null,null,null);
INSERT INTO page_views (site_id, session_id, url, viewed_at) VALUES
 ('11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000001','https://a.se/pricing','2026-09-01 10:00Z'),
 ('11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000001','https://a.se/50%_off','2026-09-01 10:01Z'),
 ('11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000002','https://a.se/blog','2026-09-03 10:00Z'),
 ('11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000002','https://a.se/wp-admin/x','2026-09-03 10:01Z'),
 ('11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000003','https://a.se/pricing','2026-08-30 10:00Z'),
 ('11111111-1111-4111-8111-111111111111',null,'https://a.se/500off','2026-09-02 10:00Z');
INSERT INTO conversion_events VALUES ('11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000001','2026-09-01 10:02Z');
INSERT INTO ai_bot_traffic VALUES
 ('11111111-1111-4111-8111-111111111111','https://a.se/pricing','training','server_log','2026-09-02 01:00Z'),
 ('11111111-1111-4111-8111-111111111111','https://a.se/blog','agentic','js_tag','2026-09-02 02:00Z'),
 ('11111111-1111-4111-8111-111111111111','https://a.se/blog','citation','server_log','2026-09-03 03:00Z');

SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE r jsonb;
BEGIN
  r := public.get_overview_metrics('11111111-1111-4111-8111-111111111111','2026-09-01','2026-09-03');
  ASSERT (r->'current'->>'visits')::int = 2, 'visits current';
  ASSERT (r->'current'->>'pageViews')::int = 4, 'page views exclude wp-admin';
  ASSERT (r->'current'->>'conversions')::int = 1, 'conversions';
  ASSERT (r->'current'->'ai'->>'total')::int = 3 AND (r->'current'->'ai'->>'training')::int = 1
     AND (r->'current'->'ai'->>'agentic')::int = 1 AND (r->'current'->'ai'->>'citation')::int = 1, 'ai split';
  ASSERT (r->'previous'->>'visits')::int = 1, 'previous visits';
  ASSERT jsonb_array_length(r->'daily') = 3, 'one point per day incl. empty 2026-09-02 visits';
  ASSERT (r->'daily'->1->>'visits')::int = 0 AND (r->'daily'->1->>'ai')::int = 2, 'gap day present';
  ASSERT (r->>'serverHits')::int = 2, 'server hits';

  r := public.get_overview_metrics('11111111-1111-4111-8111-111111111111','2026-09-01','2026-09-03','/50%_off');
  ASSERT (r->'current'->>'pageViews')::int = 1, '% and _ are literal (500off must not match)';
  ASSERT (r->'current'->>'visits')::int = 1, 'path filters sessions';

  r := public.get_overview_metrics('11111111-1111-4111-8111-111111111111','2026-09-01','2026-09-03', NULL,
         '[{"field":"utm_source","op":"eq","value":"Newsletter"}]');
  ASSERT (r->'current'->>'visits')::int = 1 AND (r->'current'->>'conversions')::int = 1, 'segment eq, case-insensitive';
  ASSERT (r->'current'->'ai'->>'total')::int = 3, 'segment does not filter AI';

  r := public.get_overview_metrics('11111111-1111-4111-8111-111111111111','2026-09-01','2026-09-03', NULL,
         '[{"field":"bogus","op":"eq","value":"x"}]');
  ASSERT (r->'current'->>'visits')::int = 0, 'unknown field matches nothing';

  BEGIN
    PERFORM public.get_overview_metrics('22222222-2222-4222-8222-222222222222','2026-09-01','2026-09-03');
    RAISE EXCEPTION 'expected denial';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.get_overview_metrics('11111111-1111-4111-8111-111111111111','2026-09-03','2026-09-01');
    RAISE EXCEPTION 'expected invalid range';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END $$;
ROLLBACK;

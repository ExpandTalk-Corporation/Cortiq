-- tests/foundation/aggregate-measurement.sql — run in an ephemeral PGlite instance; everything rolls back.
BEGIN;
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE TABLE public.sites (id uuid PRIMARY KEY, user_id uuid NOT NULL);
GRANT SELECT ON public.sites TO authenticated;
\ir ../../supabase/migrations/20261030000001_aggregate_measurement.sql

INSERT INTO sites VALUES ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
                         ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

DO $$
DECLARE
  s1 uuid := '11111111-1111-4111-8111-111111111111';
  t0 timestamptz := '2026-10-30 10:00:00+00';
  salt text;
  sig text := 'public.ingest_aggregate_hit(uuid,text,text,text,text,text,text,text,text,text,text,numeric,timestamptz)';
BEGIN
  ASSERT (SELECT aggregate_measurement FROM public.sites WHERE id = s1) = false, 'off by default';

  salt := public.aggregate_daily_salt(t0);
  ASSERT length(salt) = 64, 'salt is sha256 hex';
  ASSERT public.aggregate_daily_salt(t0 + interval '5 hours') = salt, 'one salt per UTC day';
  ASSERT public.aggregate_daily_salt(t0 + interval '1 day') <> salt, 'new salt the next day';

  -- Visitor A: LinkedIn campaign → /produkt → /demo → goal twice (counts once)
  PERFORM public.ingest_aggregate_hit(s1, 'hashA', 'pageview', '/produkt', 'linkedin.com', 'linkedin', 'paid', 'q4', 'desktop', NULL, NULL, NULL, t0);
  PERFORM public.ingest_aggregate_hit(s1, 'hashA', 'pageview', '/demo', '', '', '', '', 'desktop', NULL, NULL, NULL, t0 + interval '2 minutes');
  PERFORM public.ingest_aggregate_hit(s1, 'hashA', 'goal', '/tack', '', '', '', '', 'desktop', 'g1', 'Demo request', 100, t0 + interval '3 minutes');
  PERFORM public.ingest_aggregate_hit(s1, 'hashA', 'goal', '/tack', '', '', '', '', 'desktop', 'g1', 'Demo request', 100, t0 + interval '4 minutes');
  -- Visitor B: direct, then Google within 30 min → new visit with Google as source
  PERFORM public.ingest_aggregate_hit(s1, 'hashB', 'pageview', '/', '', '', '', '', 'mobile', NULL, NULL, NULL, t0);
  PERFORM public.ingest_aggregate_hit(s1, 'hashB', 'pageview', '/blog', 'google.com', '', '', '', 'mobile', NULL, NULL, NULL, t0 + interval '5 minutes');
  -- Visitor A returns after 50 minutes, direct → new visit, same visitor
  PERFORM public.ingest_aggregate_hit(s1, 'hashA', 'pageview', '/', '', '', '', '', 'desktop', NULL, NULL, NULL, t0 + interval '50 minutes');

  ASSERT (SELECT sum(pageviews) FROM public.aggregate_pages_daily WHERE site_id = s1) = 5, 'five page views';
  ASSERT (SELECT entries FROM public.aggregate_pages_daily WHERE site_id = s1 AND path = '/produkt') = 1, 'landing counted as entry';
  ASSERT (SELECT entries FROM public.aggregate_pages_daily WHERE site_id = s1 AND path = '/demo') = 0, 'second page is not an entry';
  ASSERT (SELECT sum(visitors) FROM public.aggregate_sources_daily WHERE site_id = s1) = 2, 'two distinct visitors';
  ASSERT (SELECT sum(visits) FROM public.aggregate_sources_daily WHERE site_id = s1) = 4, 'A: linkedin + return, B: direct + google';
  ASSERT (SELECT visits FROM public.aggregate_sources_daily WHERE site_id = s1 AND referrer_domain = 'google.com') = 1, 'google visit';
  ASSERT (SELECT conversions FROM public.aggregate_conversions_daily
          WHERE site_id = s1 AND goal_id = 'g1' AND utm_source = 'linkedin' AND utm_campaign = 'q4') = 1,
    'goal counted once per visit and attributed to the entry source';
  ASSERT (SELECT value FROM public.aggregate_conversions_daily WHERE site_id = s1 AND utm_source = 'linkedin') = 100, 'value kept';

  -- Same goal in A's new (direct) visit counts again, attributed to direct
  PERFORM public.ingest_aggregate_hit(s1, 'hashA', 'goal', '/tack', '', '', '', '', 'desktop', 'g1', 'Demo request', NULL, t0 + interval '55 minutes');
  ASSERT (SELECT conversions FROM public.aggregate_conversions_daily WHERE site_id = s1 AND goal_id = 'g1' AND utm_source = '' AND referrer_domain = '') = 1,
    'second visit converts again, as direct';

  -- Review Focus 2: crossing midnight UTC splits into two days
  PERFORM public.ingest_aggregate_hit(s1, 'hashN1', 'pageview', '/', '', '', '', '', 'desktop', NULL, NULL, NULL, '2026-10-30 23:59:00+00');
  PERFORM public.ingest_aggregate_hit(s1, 'hashN2', 'pageview', '/', '', '', '', '', 'desktop', NULL, NULL, NULL, '2026-10-31 00:01:00+00');
  ASSERT (SELECT visitors FROM public.aggregate_sources_daily WHERE site_id = s1 AND day = '2026-10-31') = 1, 'next day counted on its own';

  -- Invalid input is refused without writes
  ASSERT NOT public.ingest_aggregate_hit(s1, '', 'pageview', '/', '', '', '', '', '', NULL, NULL, NULL, t0), 'empty hash';
  ASSERT NOT public.ingest_aggregate_hit(s1, 'h', 'click', '/', '', '', '', '', '', NULL, NULL, NULL, t0), 'unknown kind';
  ASSERT NOT public.ingest_aggregate_hit(s1, 'h', 'goal', '/', '', '', '', '', '', NULL, NULL, NULL, t0), 'goal without id';

  -- Retention: salts and visitor map go once their day has ended; aggregates stay
  PERFORM public.aggregate_retention('2026-10-31 00:30:00+00');
  ASSERT (SELECT count(*) FROM public.aggregate_salts WHERE day < '2026-10-31') = 0, 'old salts deleted';
  ASSERT (SELECT count(*) FROM public.aggregate_visitors WHERE day < '2026-10-31') = 0, 'old visitor map deleted';
  ASSERT (SELECT count(*) FROM public.aggregate_visitors WHERE day = '2026-10-31') = 1, 'today kept';
  ASSERT (SELECT count(*) FROM public.aggregate_pages_daily WHERE site_id = s1) > 0, 'aggregates kept';

  -- Privileges
  ASSERT NOT has_function_privilege('anon', sig, 'EXECUTE'), 'anon cannot ingest';
  ASSERT NOT has_function_privilege('authenticated', sig, 'EXECUTE'), 'users cannot ingest';
  ASSERT has_function_privilege('service_role', sig, 'EXECUTE'), 'service role ingests';
  ASSERT NOT has_function_privilege('authenticated', 'public.aggregate_daily_salt(timestamptz)', 'EXECUTE'), 'salt is private';
  ASSERT NOT has_function_privilege('authenticated', 'public.aggregate_retention(timestamptz)', 'EXECUTE'), 'retention is private';
  ASSERT NOT has_table_privilege('authenticated', 'public.aggregate_salts', 'SELECT'), 'salts unreadable';
  ASSERT NOT has_table_privilege('authenticated', 'public.aggregate_visitors', 'SELECT'), 'visitor map unreadable';
  ASSERT NOT has_table_privilege('authenticated', 'public.aggregate_pages_daily', 'INSERT'), 'no client writes';
  ASSERT has_function_privilege('authenticated', 'public.get_aggregate_summary(uuid,date,date)', 'EXECUTE'), 'summary readable';
  ASSERT NOT has_function_privilege('anon', 'public.get_aggregate_summary(uuid,date,date)', 'EXECUTE'), 'anon cannot read';
END $$;

INSERT INTO public.aggregate_pages_daily (site_id, day, path, pageviews, entries)
VALUES ('22222222-2222-4222-8222-222222222222', '2026-10-30', '/other', 7, 7);

SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE r jsonb;
BEGIN
  r := public.get_aggregate_summary('11111111-1111-4111-8111-111111111111', '2026-10-30', '2026-10-30');
  ASSERT (r->>'pageviews')::int = 6, 'own pageviews (5 + the 23:59 hit)';
  ASSERT (r->>'visitors')::int = 3, 'A, B and the 23:59 visitor';
  ASSERT (r->>'days_with_data')::int = 1, 'one day';
  ASSERT jsonb_array_length(r->'top_pages') = 4, 'distinct paths: /produkt, /demo, /, /blog';
  ASSERT (r->'conversions_by_goal'->0->>'conversions')::int = 2, 'goal total across sources';
  ASSERT (r->'conversions_by_goal'->0->>'goal_name') = 'Demo request', 'goal name';
  r := public.get_aggregate_summary('22222222-2222-4222-8222-222222222222', '2026-10-30', '2026-10-30');
  ASSERT (r->>'pageviews')::int = 0, 'other tenant invisible';
  ASSERT jsonb_array_length(r->'top_pages') = 0, 'other tenant rows invisible';
  ASSERT (SELECT count(*) FROM public.aggregate_pages_daily WHERE site_id = '22222222-2222-4222-8222-222222222222') = 0, 'RLS on table';
END $$;
ROLLBACK;

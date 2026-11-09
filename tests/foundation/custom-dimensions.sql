-- tests/foundation/custom-dimensions.sql
BEGIN;
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE TABLE public.sites (id uuid PRIMARY KEY, user_id uuid NOT NULL, domain text);
CREATE TABLE public.tracking_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL,
  content_type text NOT NULL, content_id uuid NOT NULL DEFAULT gen_random_uuid(), event_type text NOT NULL,
  platform text, session_id text NOT NULL, metadata jsonb DEFAULT '{}'::jsonb,
  timestamp timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now());
CREATE FUNCTION public._norm_host(u text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT regexp_replace(split_part(split_part(regexp_replace(lower(coalesce(u, '')), '^https?://', ''), '/', 1), ':', 1), '^www\.', '') $$;

GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT SELECT ON public.sites TO authenticated;
-- Company A owns a.se and a2.se; company B owns b.se.
INSERT INTO sites VALUES
  ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','a.se'),
  ('33333333-3333-4333-8333-333333333333','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','a2.se'),
  ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','b.se');
-- Pre-existing events: the migration backfills site_id from metadata.url within the owning company.
INSERT INTO tracking_events (company_id, content_type, event_type, session_id, metadata, timestamp) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','page','conversion','s1','{"url":"https://www.a.se/x","plan":"pro","visitor_id":"v1"}','2026-11-01 10:00Z'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','page','conversion','s2','{"url":"https://a2.se/","plan":"free"}','2026-11-01 10:00Z'),
  -- b.se URL under company A: not A's site, stays unassigned
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','page','click','s3','{"url":"https://b.se/","plan":"pro"}','2026-11-01 10:00Z');

\ir ../../supabase/migrations/20261111000001_custom_dimensions.sql

DO $$
DECLARE n int; r record; k text[];
BEGIN
  -- Backfill
  SELECT count(*) INTO n FROM tracking_events WHERE site_id = '11111111-1111-4111-8111-111111111111';
  IF n <> 1 THEN RAISE EXCEPTION 'backfill a.se: %', n; END IF;
  SELECT count(*) INTO n FROM tracking_events WHERE site_id = '33333333-3333-4333-8333-333333333333';
  IF n <> 1 THEN RAISE EXCEPTION 'backfill a2.se: %', n; END IF;
  SELECT count(*) INTO n FROM tracking_events WHERE site_id IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'cross-tenant URL must stay unassigned: %', n; END IF;

  -- More events on a.se for the breakdown
  INSERT INTO tracking_events (company_id, site_id, content_type, event_type, session_id, metadata, timestamp)
  SELECT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','page','conversion', 's' || (g % 3),
         jsonb_build_object('plan', CASE WHEN g <= 4 THEN 'pro' WHEN g <= 6 THEN 'team' ELSE 'v' || g END,
                            'seats', g, 'beta', g % 2 = 0, 'nested', jsonb_build_object('x', 1), 'user_agent', 'UA'),
         '2026-11-02 10:00Z'
  FROM generate_series(1, 10) g;
  INSERT INTO tracking_events (company_id, site_id, content_type, event_type, session_id, metadata, timestamp) VALUES
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','page','view','s9','{"url":"https://a.se/"}','2026-11-02 10:00Z'),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','page','click','s9',
      jsonb_build_object('plan', repeat('x', 300)),'2026-11-02 10:00Z'),
    -- outside the range
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','page','click','s9','{"plan":"old"}','2026-10-01 10:00Z');

  -- Owner A
  PERFORM set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
  SET LOCAL ROLE authenticated;

  -- Discovery: scalar, non-reserved keys only, most used first
  SELECT array_agg(key ORDER BY events DESC, key) INTO k
  FROM public.get_event_property_keys('11111111-1111-4111-8111-111111111111', '2026-11-01', '2026-11-02');
  IF k <> ARRAY['plan','beta','seats'] THEN RAISE EXCEPTION 'discovered keys: %', k; END IF;
  SELECT * INTO r FROM public.get_event_property_keys('11111111-1111-4111-8111-111111111111', '2026-11-01', '2026-11-02') WHERE key = 'plan';
  IF r.events <> 12 OR r.registered THEN RAISE EXCEPTION 'plan discovery: %', r; END IF;

  -- Breakdown requires a registered key
  BEGIN
    PERFORM * FROM public.get_custom_dimension_breakdown('11111111-1111-4111-8111-111111111111', 'plan', '2026-11-01', '2026-11-02');
    RAISE EXCEPTION 'unregistered key should fail';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;

  -- Registration rules
  INSERT INTO custom_dimensions (site_id, key, label) VALUES ('11111111-1111-4111-8111-111111111111', 'plan', 'Plan');
  INSERT INTO custom_dimensions (site_id, key, label) VALUES ('11111111-1111-4111-8111-111111111111', 'seats', 'Seats');
  BEGIN
    INSERT INTO custom_dimensions (site_id, key, label) VALUES ('11111111-1111-4111-8111-111111111111', 'visitor_id', 'Visitor');
    RAISE EXCEPTION 'reserved key accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO custom_dimensions (site_id, key, label) VALUES ('11111111-1111-4111-8111-111111111111', 'bad key', 'Bad');
    RAISE EXCEPTION 'invalid key accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO custom_dimensions (site_id, key, label) VALUES ('22222222-2222-4222-8222-222222222222', 'plan', 'Plan');
    RAISE EXCEPTION 'registered a dimension on another tenant''s site';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- Breakdown with top 3 + (other); long values truncated to 100 characters
  SELECT array_agg(value || ':' || events || ':' || sessions ORDER BY is_other, events DESC, value) INTO k
  FROM public.get_custom_dimension_breakdown('11111111-1111-4111-8111-111111111111', 'plan', '2026-11-01', '2026-11-02', 3);
  IF k[1] <> 'pro:5:3' OR k[2] <> 'team:2:2' THEN RAISE EXCEPTION 'breakdown top: %', k; END IF;
  SELECT * INTO r FROM public.get_custom_dimension_breakdown('11111111-1111-4111-8111-111111111111', 'plan', '2026-11-01', '2026-11-02', 3) WHERE is_other;
  -- 12 events with plan: pro 5, team 2, v7..v10 + long x = 5 singletons; top 3 = pro, team, one singleton → other = 4
  IF r.events <> 4 OR r.value <> '(other)' THEN RAISE EXCEPTION 'other row: %', r; END IF;
  SELECT sum(events) INTO n FROM public.get_custom_dimension_breakdown('11111111-1111-4111-8111-111111111111', 'plan', '2026-11-01', '2026-11-02', 3);
  IF n <> 12 THEN RAISE EXCEPTION 'rows must add up to the total: %', n; END IF;
  SELECT max(char_length(value)) INTO n FROM public.get_custom_dimension_breakdown('11111111-1111-4111-8111-111111111111', 'plan', '2026-11-01', '2026-11-02', 100);
  IF n <> 100 THEN RAISE EXCEPTION 'value truncation: %', n; END IF;
  -- Numeric values are grouped as text
  SELECT count(*) INTO n FROM public.get_custom_dimension_breakdown('11111111-1111-4111-8111-111111111111', 'seats', '2026-11-01', '2026-11-02', 100);
  IF n <> 10 THEN RAISE EXCEPTION 'seats rows: %', n; END IF;
  -- No (other) row when everything fits
  SELECT count(*) INTO n FROM public.get_custom_dimension_breakdown('11111111-1111-4111-8111-111111111111', 'plan', '2026-11-01', '2026-11-02', 100) WHERE is_other;
  IF n <> 0 THEN RAISE EXCEPTION 'unexpected other row'; END IF;

  -- Another tenant cannot read A's site
  PERFORM set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);
  BEGIN
    PERFORM * FROM public.get_event_property_keys('11111111-1111-4111-8111-111111111111', '2026-11-01', '2026-11-02');
    RAISE EXCEPTION 'cross-tenant discovery allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public.get_custom_dimension_breakdown('11111111-1111-4111-8111-111111111111', 'plan', '2026-11-01', '2026-11-02');
    RAISE EXCEPTION 'cross-tenant breakdown allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  SELECT count(*) INTO n FROM custom_dimensions;
  IF n <> 0 THEN RAISE EXCEPTION 'RLS leaks dimensions to another tenant: %', n; END IF;
  RESET ROLE;

  -- 25 dimensions per site
  BEGIN
    INSERT INTO custom_dimensions (site_id, key, label)
    SELECT '11111111-1111-4111-8111-111111111111', 'k' || g, 'K' || g FROM generate_series(1, 24) g;
    RAISE EXCEPTION 'limit not enforced';
  EXCEPTION WHEN SQLSTATE '54000' THEN NULL;
  END;
END $$;
ROLLBACK;

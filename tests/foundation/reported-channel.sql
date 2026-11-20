-- Run only in an EMPTY, disposable database. All fixtures roll back.
-- Attribution layer 1.5: self-reported source (20261210000001_reported_channel.sql).
BEGIN;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE TABLE public.sites (id uuid PRIMARY KEY, user_id uuid NOT NULL, tracking_mode text NOT NULL DEFAULT 'full');
CREATE TABLE public.tracking_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id uuid, session_id text,
  started_at timestamptz DEFAULT now(), referrer text, utm_source text, utm_medium text);
CREATE TABLE public.conversion_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id uuid, session_id uuid,
  event_type text, event_name text, event_value numeric, element_selector text, hashed_email text,
  click_id_consent_given boolean DEFAULT false, form_data jsonb, upload_status text, lead_quality text,
  quality_classified_at timestamptz, created_at timestamptz DEFAULT now());
CREATE TABLE public.cookie_consents (site_id uuid, session_id text, consent_given boolean, consent_types jsonb,
  expires_at timestamptz, policy_version text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());

\ir ../../supabase/migrations/20261117000002_social_overview.sql
\ir ../../supabase/migrations/20261127000001_ai_influence.sql
\ir ../../supabase/migrations/20261210000001_reported_channel.sql

INSERT INTO public.sites (id, user_id) VALUES
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

DO $$
DECLARE
  a constant uuid := '11111111-1111-4111-8111-111111111111';
  h constant text := repeat('ab', 32);
  r jsonb;
  n integer;
BEGIN
  -- Category list and value-list validation.
  ASSERT public.is_reported_channel('ai_assistant') AND NOT public.is_reported_channel('Podcast')
     AND NOT public.is_reported_channel(NULL), 'category list';
  ASSERT public.is_valid_reported_channel_map('{"ChatGPT": "ai_assistant", "A friend": "colleague_or_friend"}'), 'valid map';
  ASSERT NOT public.is_valid_reported_channel_map('{"x": "health"}'), 'unknown category rejected';
  ASSERT NOT public.is_valid_reported_channel_map('["ai_assistant"]'), 'array rejected';
  ASSERT NOT public.is_valid_reported_channel_map('{"x": 1}'), 'non-string value rejected';
  ASSERT NOT public.is_valid_reported_channel_map(jsonb_build_object(repeat('x', 101), 'other')), 'long key rejected';
  BEGIN
    UPDATE public.sites SET reported_channel_form_map = '{"x": "religion"}' WHERE id = a;
    ASSERT false, 'site map with unknown category must fail';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.sites SET reported_channel_form_field = 'form > input[type=text]' WHERE id = a;
    ASSERT false, 'a CSS selector is not a field name';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.conversion_events (site_id, reported_channel) VALUES (a, 'free text');
    ASSERT false, 'reported_channel outside the list must fail';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Observed channel.
  ASSERT public.observed_channel('https://chatgpt.com/', NULL, NULL) = 'ai_assistant', 'ai referrer';
  ASSERT public.observed_channel(NULL, 'perplexity', NULL) = 'ai_assistant', 'ai utm';
  ASSERT public.observed_channel('https://www.google.com/', 'google', 'cpc') = 'paid_search', 'paid search';
  ASSERT public.observed_channel(NULL, 'facebook', 'cpc') = 'paid_social', 'paid social';
  ASSERT public.observed_channel(NULL, 'mailchimp', 'email') = 'email', 'email';
  ASSERT public.observed_channel('https://l.instagram.com/', NULL, NULL) = 'social', 'social';
  ASSERT public.observed_channel('https://www.bing.com/search', NULL, NULL) = 'organic_search', 'search';
  ASSERT public.observed_channel('https://blog.example.org/post', NULL, NULL) = 'referral', 'referral';
  ASSERT public.observed_channel(NULL, NULL, NULL) = 'direct' AND public.observed_channel('', '', '') = 'direct', 'direct';

  -- Nothing is stored until the site sets a policy version and a field.
  INSERT INTO public.tracking_sessions (id, site_id, session_id, referrer) VALUES
    ('aaaaaaaa-0000-4000-8000-000000000001', a, 's-form', NULL),
    ('aaaaaaaa-0000-4000-8000-000000000002', a, 's-old', 'https://chatgpt.com/'),
    ('aaaaaaaa-0000-4000-8000-000000000003', a, 's-withdrawn', NULL),
    ('aaaaaaaa-0000-4000-8000-000000000004', a, 's-hub', 'https://www.google.com/');
  INSERT INTO public.cookie_consents (site_id, session_id, consent_given, consent_types, expires_at, policy_version, updated_at) VALUES
    (a, 's-form', true, '{"analytics": true, "marketing": false}', now() + interval '1 day', '2', now()),
    (a, 's-old', true, '{"analytics": true, "marketing": true}', now() + interval '1 day', '1', now()),
    -- Granted, then withdrawn: the latest row wins.
    (a, 's-withdrawn', true, '{"analytics": true}', now() + interval '1 day', '2', now() - interval '1 hour'),
    (a, 's-withdrawn', false, '{"analytics": false}', now() + interval '1 day', '2', now()),
    (a, 's-hub', true, '{"analytics": true, "marketing": true}', now() + interval '1 day', '2', now()),
    (a, 's-expired', true, '{"analytics": true, "marketing": true}', now() - interval '1 day', '2', now());

  ASSERT NOT public.reported_channel_consent_ok(a, 's-form', 'form'), 'off until configured';
  PERFORM public.record_conversion_event(a, 's-form', 'Lead', 'form_submission', 'form', NULL, 'podcast');
  ASSERT (SELECT reported_channel FROM public.conversion_events WHERE event_name = 'Lead') IS NULL, 'not stored while off';
  DELETE FROM public.conversion_events;

  UPDATE public.sites SET reported_channel_policy_version = '2', reported_channel_form_field = 'heard_about',
    reported_channel_form_map = '{"pod": "podcast"}' WHERE id = a;

  ASSERT public.reported_channel_consent_ok(a, 's-form', 'form'), 'form: analytics + version 2';
  ASSERT NOT public.reported_channel_consent_ok(a, 's-form', 'hubspot'), 'hubspot path not configured';
  ASSERT NOT public.reported_channel_consent_ok(a, 's-old', 'form'), 'older policy version';
  ASSERT NOT public.reported_channel_consent_ok(a, 's-withdrawn', 'form'), 'withdrawal wins';
  ASSERT NOT public.reported_channel_consent_ok(a, 's-expired', 'form'), 'expired';
  ASSERT NOT public.reported_channel_consent_ok(a, 'nope', 'form') AND NOT public.reported_channel_consent_ok(a, NULL, 'form'), 'no consent row';

  -- Form path through record_conversion_event (the 6-argument call still works).
  ASSERT public.record_conversion_event(a, 's-form', 'Lead', 'form_submission', 'form', NULL, 'podcast'), 'inserted';
  ASSERT public.record_conversion_event(a, 's-old', 'Lead', 'form_submission', 'form', NULL, 'ai_assistant'), 'inserted, old version';
  ASSERT public.record_conversion_event(a, 's-withdrawn', 'Lead', 'form_submission', 'form', NULL, 'event'), 'inserted, withdrawn';
  ASSERT public.record_conversion_event(a, 's-hub', 'Lead', 'form_submission', 'form', NULL, 'free text'), 'inserted, bad category';
  ASSERT public.record_conversion_event(a, 's-hub', 'Call', 'element_click', 'a', NULL), 'old 6-argument call';
  ASSERT (SELECT reported_channel FROM public.conversion_events WHERE session_id = 'aaaaaaaa-0000-4000-8000-000000000001') = 'podcast', 'stored';
  ASSERT (SELECT count(*) FROM public.conversion_events WHERE reported_channel IS NOT NULL) = 1, 'only the consented answer is stored';

  -- Cookieless site: never.
  UPDATE public.sites SET tracking_mode = 'cookieless' WHERE id = a;
  ASSERT NOT public.reported_channel_consent_ok(a, 's-form', 'form'), 'cookieless never';
  UPDATE public.sites SET tracking_mode = 'full' WHERE id = a;

  -- HubSpot path: only marketing-consented rows by hash, under the policy version; never touches upload_status.
  INSERT INTO public.conversion_events (site_id, session_id, event_name, hashed_email, click_id_consent_given, form_data, upload_status, quality_classified_at) VALUES
    (a, 'aaaaaaaa-0000-4000-8000-000000000004', 'Contact', h, true, '{"tracking_session_id": "s-hub"}', 'uploaded', now()),
    (a, 'aaaaaaaa-0000-4000-8000-000000000002', 'Contact', h, true, '{"tracking_session_id": "s-old"}', 'pending', NULL),
    (a, NULL, 'Contact', h, false, '{"tracking_session_id": "s-hub"}', 'skipped_no_consent', NULL);
  ASSERT public.apply_reported_channel_hubspot(a, h, 'ai_assistant') = 0, 'hubspot path not configured yet';
  UPDATE public.sites SET reported_channel_hubspot_property = 'how_did_you_hear' WHERE id = a;
  n := public.apply_reported_channel_hubspot(a, h, 'ai_assistant');
  ASSERT n = 1, 'one consented row under version 2, got ' || n;
  ASSERT (SELECT upload_status FROM public.conversion_events WHERE form_data->>'tracking_session_id' = 's-hub' AND click_id_consent_given)
         = 'uploaded', 'upload_status untouched';
  ASSERT public.apply_reported_channel_hubspot(a, h, 'podcast') = 0, 'an existing answer is not overwritten';
  ASSERT public.apply_reported_channel_hubspot(a, 'not-a-hash', 'podcast') = 0, 'hash only';
  ASSERT public.apply_reported_channel_hubspot(a, h, 'Podcast') = 0, 'category only';

  -- Aggregate read. Owner a.
  PERFORM set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
  r := public.get_reported_channel(a, current_date - 1, current_date);
  ASSERT (r->'conversions'->>'n')::int = 8, 'conversions: ' || r::text;
  ASSERT (r->'answered'->>'lt5')::boolean AND r->'answered'->'n' = 'null'::jsonb, 'answered 2 = fewer than 5: ' || r::text;
  ASSERT jsonb_array_length(r->'cells') = 2, 'cells: ' || (r->'cells')::text;
  ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(r->'cells') x
                 WHERE x->>'reported' = 'ai_assistant' AND x->>'observed' = 'organic_search' AND (x->>'lt5')::boolean), 'said AI, arrived via search';
  ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(r->'cells') x
                 WHERE x->>'reported' = 'podcast' AND x->>'observed' = 'direct'), 'said podcast, arrived direct';
  ASSERT r::text !~ 's-hub|s-form|abab|aaaaaaaa-0000', 'no session, hash or row ids in the output';

  -- Five answers: counts shown.
  INSERT INTO public.conversion_events (site_id, event_name, reported_channel)
    SELECT a, 'Bulk ' || g, 'colleague_or_friend' FROM generate_series(1, 5) g;
  r := public.get_reported_channel(a, current_date - 1, current_date);
  ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(r->'cells') x
                 WHERE x->>'reported' = 'colleague_or_friend' AND x->>'observed' = 'unknown' AND (x->>'n')::int = 5), 'count shown at 5';
  ASSERT (r->'answered'->>'n')::int = 7, 'answered 7';

  BEGIN
    PERFORM public.get_reported_channel(a, current_date, current_date - 1);
    ASSERT false, 'reversed range must fail';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END $$;

SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);
DO $$
BEGIN
  PERFORM public.get_reported_channel('11111111-1111-4111-8111-111111111111', current_date - 1, current_date);
  ASSERT false, 'non-owner must be refused';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;

DO $$
BEGIN
  ASSERT has_function_privilege('authenticated', 'public.get_reported_channel(uuid, date, date)', 'EXECUTE'), 'authenticated can read the aggregate';
  ASSERT NOT has_function_privilege('anon', 'public.get_reported_channel(uuid, date, date)', 'EXECUTE'), 'anon cannot';
  ASSERT NOT has_function_privilege('authenticated', 'public.apply_reported_channel_hubspot(uuid, text, text)', 'EXECUTE'), 'hubspot write: service role only';
  ASSERT NOT has_function_privilege('authenticated', 'public.reported_channel_consent_ok(uuid, text, text)', 'EXECUTE'), 'consent gate: service role only';
  ASSERT NOT has_function_privilege('anon', 'public.record_conversion_event(uuid, text, text, text, text, numeric, text)', 'EXECUTE'), 'record: service role only';
  ASSERT has_function_privilege('service_role', 'public.apply_reported_channel_hubspot(uuid, text, text)', 'EXECUTE'), 'service role can write';
  ASSERT (SELECT prosecdef FROM pg_proc WHERE proname = 'get_reported_channel') = false, 'aggregate read is SECURITY INVOKER';
END $$;

ROLLBACK;

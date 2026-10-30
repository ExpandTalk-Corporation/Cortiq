-- tests/foundation/agent-telemetry-restore.sql — run in an ephemeral PGlite instance; everything rolls back.
BEGIN;
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
-- Minimal stand-ins for the production objects the migration depends on.
CREATE TABLE public.companies (id uuid PRIMARY KEY);
CREATE TABLE public.sites (id uuid PRIMARY KEY, user_id uuid NOT NULL);
GRANT SELECT ON public.sites TO authenticated;
CREATE TABLE public.tracking_events (company_id uuid, session_id text, event_type text, created_at timestamptz);
CREATE TABLE public.behavioral_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id uuid, alert_type text, alert_name text,
  alert_description text, severity text CHECK (severity IN ('low','medium','high','critical')),
  threshold_config jsonb, is_active boolean, notification_settings jsonb);
CREATE TABLE public.bot_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text UNIQUE, display_name text, category text,
  ua_patterns text[], description text, vendor text);
-- The newer retention function (20261014000001) must survive the restore untouched.
CREATE FUNCTION public.run_canary_retention() RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"version":"2026-10-14"}'::jsonb $$;
\ir ../../supabase/migrations/20261030000002_restore_agent_telemetry_and_cyber.sql

INSERT INTO companies VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO sites VALUES ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
                         ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

DO $$
DECLARE
  a uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  h timestamptz := '2026-10-30 10:00:00+00';
  r jsonb;
BEGIN
  -- Two tasks for company A: one OK root with a tool call, one failed root. 1.5 s root span.
  INSERT INTO public.agent_spans (company_id, trace_id, span_id, parent_span_id, span_name, status_code,
    start_time, end_time, gen_ai_agent_name, gen_ai_request_model, gen_ai_operation_name,
    gen_ai_usage_input_tokens, gen_ai_usage_output_tokens, web_session_id)
  VALUES
    (a, 't1', 's1', NULL, 'invoke_agent', 'OK',    h, h + interval '1500 milliseconds', 'support', 'claude-sonnet-4-6', 'invoke_agent', 1000, 500, 'sess-1'),
    (a, 't1', 's2', 's1', 'tool_call',    'OK',    h + interval '100 milliseconds', h + interval '400 milliseconds', 'support', 'claude-sonnet-4-6', 'tool_call', NULL, NULL, 'sess-1'),
    (a, 't2', 's3', NULL, 'invoke_agent', 'ERROR', h + interval '10 minutes', h + interval '11 minutes', 'support', 'claude-sonnet-4-6', 'invoke_agent', 200, 100, 'sess-2');
  INSERT INTO public.tracking_events VALUES (a, 'sess-1', 'conversion', h + interval '5 minutes');

  ASSERT (SELECT duration_ms FROM public.agent_spans WHERE span_id = 's1') = 1500, 'sub-second precision kept';
  ASSERT public.compute_span_cost('claude-sonnet-4-6', 1000000, 1000000) = 18, 'pricing seeded';

  PERFORM public.refresh_agent_hourly_stats(a, h);
  ASSERT (SELECT total_tasks FROM public.agent_hourly_stats WHERE company_id = a) = 2, 'two root spans';
  ASSERT (SELECT tool_calls_ok FROM public.agent_hourly_stats WHERE company_id = a) = 1, 'tool call counted';

  -- Cyber/canary restore
  ASSERT (SELECT count(*) FROM public.bot_catalog WHERE name IN ('adidxbot','microsoft-preview','bing-video-preview')) = 3, 'bing crawlers';
  r := public.seed_cyber_alerts('11111111-1111-4111-8111-111111111111');
  ASSERT (r->>'alerts_created')::int = 4, 'four default alerts';
  r := public.seed_cyber_alerts('11111111-1111-4111-8111-111111111111');
  ASSERT (r->>'alerts_created')::int = 0, 'idempotent';
  ASSERT public.run_canary_retention()->>'version' = '2026-10-14', 'newer canary retention not overwritten';

  -- Privileges
  ASSERT NOT has_function_privilege('anon', 'public.get_agent_overview(uuid,timestamptz,timestamptz)', 'EXECUTE'), 'anon cannot read overview';
  ASSERT has_function_privilege('authenticated', 'public.get_agent_overview(uuid,timestamptz,timestamptz)', 'EXECUTE'), 'users read overview';
  ASSERT has_function_privilege('authenticated', 'public.get_agent_trace(uuid,text)', 'EXECUTE'), 'users read trace';
  ASSERT has_function_privilege('authenticated', 'public.get_agent_conversions(uuid,timestamptz,timestamptz)', 'EXECUTE'), 'users read conversions';
  ASSERT NOT has_function_privilege('authenticated', 'public.refresh_agent_hourly_stats(uuid,timestamptz)', 'EXECUTE'), 'refresh is service-only';
  ASSERT NOT has_function_privilege('authenticated', 'public.compute_span_cost(text,integer,integer)', 'EXECUTE'), 'cost is service-only';
  ASSERT NOT has_function_privilege('authenticated', 'public.run_agent_telemetry_retention()', 'EXECUTE'), 'retention is service-only';
  ASSERT NOT has_function_privilege('authenticated', 'public.seed_cyber_alerts(uuid)', 'EXECUTE'), 'seeding is service-only';
  ASSERT has_function_privilege('service_role', 'public.refresh_agent_hourly_stats(uuid,timestamptz)', 'EXECUTE'), 'service refreshes';
  ASSERT NOT has_table_privilege('authenticated', 'public.agent_spans', 'INSERT'), 'no client span writes';
  ASSERT NOT has_table_privilege('authenticated', 'public.agent_hourly_stats', 'DELETE'), 'no client stat writes';
  ASSERT NOT has_table_privilege('anon', 'public.agent_spans', 'SELECT'), 'anon cannot read spans';
  ASSERT NOT has_table_privilege('authenticated', 'public.canary_hits', 'INSERT'), 'no client canary writes';
END $$;

INSERT INTO public.canary_hits (site_id, token) VALUES
  ('11111111-1111-4111-8111-111111111111', 'own'), ('22222222-2222-4222-8222-222222222222', 'other');

-- Owner A
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE a uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
BEGIN
  ASSERT (SELECT total_tasks FROM public.get_agent_overview(a, '2026-10-01', '2026-11-01')) = 2, 'owner sees overview';
  ASSERT (SELECT task_completion_rate FROM public.get_agent_overview(a, '2026-10-01', '2026-11-01')) = 50.0, 'completion rate';
  ASSERT (SELECT count(*) FROM public.get_agent_trace(a, 't1')) = 2, 'owner sees trace';
  ASSERT (SELECT conversions FROM public.get_agent_conversions(a, '2026-10-01', '2026-11-01')) = 1, 'agent-assisted conversion';
  ASSERT (SELECT count(*) FROM public.agent_spans) = 3, 'owner reads own spans';
  ASSERT (SELECT count(*) FROM public.agent_hourly_stats) = 1, 'owner reads own stats';
  ASSERT (SELECT count(*) FROM public.canary_hits) = 1, 'owner reads own canary hits only';
END $$;

-- Other tenant B
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);
DO $$
DECLARE a uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
BEGIN
  ASSERT (SELECT count(*) FROM public.get_agent_overview(a, '2026-10-01', '2026-11-01')) = 0, 'other tenant overview empty';
  ASSERT (SELECT count(*) FROM public.get_agent_trace(a, 't1')) = 0, 'other tenant trace empty';
  ASSERT (SELECT count(*) FROM public.get_agent_conversions(a, '2026-10-01', '2026-11-01')) = 0, 'other tenant conversions empty';
  ASSERT (SELECT count(*) FROM public.agent_spans) = 0, 'other tenant spans hidden';
  ASSERT (SELECT count(*) FROM public.agent_hourly_stats) = 0, 'other tenant stats hidden';
END $$;
ROLLBACK;

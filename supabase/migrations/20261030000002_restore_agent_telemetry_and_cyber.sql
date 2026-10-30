-- supabase/migrations/20261030000002_restore_agent_telemetry_and_cyber.sql
-- Restores the objects of 20260403000004_agent_telemetry, 20260403000005_cyber_detection and
-- the canary_hits table from 20260403000006_canary_detection. Those three are recorded as
-- applied in the migration history but never ran in production: 0004's RLS policies read
-- organization_members.company_id, a column that does not exist (it is organization_id), so the
-- whole migration rolled back. Verified 2026-10-30: none of their tables, functions or seed rows
-- exist, so the AgentOps tab and the canary-tracker writes have been failing since April.
--
-- Same schema as the originals, hardened to today's conventions:
--  - Tenant = company id = auth.uid() (companies.id == sites.user_id in this data model).
--  - No client write policies; Edge Functions write with the service role (bypasses RLS).
--  - SECURITY DEFINER read RPCs check ownership; maintenance RPCs are service_role only.
--  - agent_spans.duration_ms keeps millisecond precision (the original truncated to whole seconds).
-- run_canary_retention() is NOT recreated: 20261014000001 already defines the current version.

-- ── Agent telemetry (from 0004) ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.agent_model_pricing (
  model_id              TEXT          PRIMARY KEY,
  provider              TEXT          NOT NULL,
  input_cost_per_1m     NUMERIC(10,4) NOT NULL DEFAULT 0,
  output_cost_per_1m    NUMERIC(10,4) NOT NULL DEFAULT 0,
  effective_from        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  notes                 TEXT
);
COMMENT ON TABLE public.agent_model_pricing IS
  'Provider model pricing in USD per 1M tokens. Used to compute estimated_cost_usd in agent_spans.';

CREATE TABLE IF NOT EXISTS public.agent_definitions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  agent_name    TEXT        NOT NULL,
  description   TEXT,
  default_model TEXT,
  tags          TEXT[]      NOT NULL DEFAULT '{}',
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, agent_name)
);

-- One row per OTel span (GenAI semantic conventions). Root spans (parent_span_id IS NULL) are tasks.
CREATE TABLE IF NOT EXISTS public.agent_spans (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  received_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  trace_id        TEXT        NOT NULL,
  span_id         TEXT        NOT NULL,
  parent_span_id  TEXT,
  span_name       TEXT        NOT NULL,
  span_kind       TEXT,
  status_code     TEXT        NOT NULL DEFAULT 'UNSET'
    CONSTRAINT agent_spans_status_check CHECK (status_code IN ('OK', 'ERROR', 'UNSET')),
  status_message  TEXT,
  start_time      TIMESTAMPTZ NOT NULL,
  end_time        TIMESTAMPTZ,
  duration_ms     INT GENERATED ALWAYS AS (
    CASE WHEN end_time IS NOT NULL
    THEN (EXTRACT(EPOCH FROM (end_time - start_time)) * 1000)::INT
    ELSE NULL END
  ) STORED,
  gen_ai_provider_name       TEXT,
  gen_ai_request_model       TEXT,
  gen_ai_operation_name      TEXT,
  gen_ai_conversation_id     TEXT,
  gen_ai_agent_name          TEXT,
  gen_ai_agent_id            TEXT,
  gen_ai_agent_version       TEXT,
  gen_ai_usage_input_tokens  INT,
  gen_ai_usage_output_tokens INT,
  gen_ai_usage_total_tokens  INT GENERATED ALWAYS AS (
    COALESCE(gen_ai_usage_input_tokens, 0) + COALESCE(gen_ai_usage_output_tokens, 0)
  ) STORED,
  estimated_cost_usd         NUMERIC(12,6),
  tool_name                  TEXT,
  tool_call_id               TEXT,
  mcp_server                 TEXT,
  data_source_id             TEXT,
  retrieval_score            NUMERIC(5,4),
  eval_score                 NUMERIC(5,2),
  had_retry                  BOOLEAN NOT NULL DEFAULT false,
  escalated                  BOOLEAN NOT NULL DEFAULT false,
  has_hallucination_flag     BOOLEAN NOT NULL DEFAULT false,
  web_session_id             TEXT,
  attributes                 JSONB   NOT NULL DEFAULT '{}',
  resource_attributes        JSONB   NOT NULL DEFAULT '{}',
  UNIQUE (company_id, trace_id, span_id)
);
CREATE INDEX IF NOT EXISTS agent_spans_company_time_idx  ON public.agent_spans(company_id, start_time DESC);
CREATE INDEX IF NOT EXISTS agent_spans_company_agent_idx ON public.agent_spans(company_id, gen_ai_agent_name, start_time DESC);
CREATE INDEX IF NOT EXISTS agent_spans_trace_idx         ON public.agent_spans(company_id, trace_id);
CREATE INDEX IF NOT EXISTS agent_spans_web_session_idx   ON public.agent_spans(company_id, web_session_id)
  WHERE web_session_id IS NOT NULL;
COMMENT ON COLUMN public.agent_spans.web_session_id IS
  'CortIQ web session ID (from gen_ai.conversation_id or cortiq.web_session_id) for conversion attribution.';

CREATE TABLE IF NOT EXISTS public.agent_hourly_stats (
  company_id          UUID          NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  hour                TIMESTAMPTZ   NOT NULL,
  agent_name          TEXT          NOT NULL,
  model               TEXT          NOT NULL DEFAULT '',
  total_tasks         INT           NOT NULL DEFAULT 0,
  total_spans         INT           NOT NULL DEFAULT 0,
  input_tokens        BIGINT        NOT NULL DEFAULT 0,
  output_tokens       BIGINT        NOT NULL DEFAULT 0,
  estimated_cost_usd  NUMERIC(12,4) NOT NULL DEFAULT 0,
  p50_duration_ms     INT,
  p95_duration_ms     INT,
  p99_duration_ms     INT,
  tool_calls_total    INT           NOT NULL DEFAULT 0,
  tool_calls_ok       INT           NOT NULL DEFAULT 0,
  escalations         INT           NOT NULL DEFAULT 0,
  hallucination_flags INT           NOT NULL DEFAULT 0,
  tasks_with_retry    INT           NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, hour, agent_name, model)
);
CREATE INDEX IF NOT EXISTS agent_hourly_stats_company_hour_idx ON public.agent_hourly_stats(company_id, hour DESC);

ALTER TABLE public.agent_model_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_definitions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_spans         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_hourly_stats  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.agent_model_pricing, public.agent_definitions, public.agent_spans, public.agent_hourly_stats
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.agent_model_pricing, public.agent_definitions, public.agent_spans, public.agent_hourly_stats
  TO authenticated;

DROP POLICY IF EXISTS "agent_model_pricing_read" ON public.agent_model_pricing;
CREATE POLICY "agent_model_pricing_read" ON public.agent_model_pricing FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "agent_definitions_owner_read" ON public.agent_definitions;
CREATE POLICY "agent_definitions_owner_read" ON public.agent_definitions FOR SELECT TO authenticated
  USING (company_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "agent_spans_owner_read" ON public.agent_spans;
CREATE POLICY "agent_spans_owner_read" ON public.agent_spans FOR SELECT TO authenticated
  USING (company_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "agent_hourly_stats_owner_read" ON public.agent_hourly_stats;
CREATE POLICY "agent_hourly_stats_owner_read" ON public.agent_hourly_stats FOR SELECT TO authenticated
  USING (company_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.compute_span_cost(p_model TEXT, p_input_tokens INT, p_output_tokens INT)
RETURNS NUMERIC
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT ROUND(
    COALESCE(p_input_tokens,  0)::NUMERIC / 1000000.0 * mp.input_cost_per_1m +
    COALESCE(p_output_tokens, 0)::NUMERIC / 1000000.0 * mp.output_cost_per_1m, 6)
  FROM public.agent_model_pricing mp
  WHERE mp.model_id = p_model
  LIMIT 1;
$$;

-- Rebuild hourly stats for a company + hour from raw spans. Called by agent-telemetry after ingest.
CREATE OR REPLACE FUNCTION public.refresh_agent_hourly_stats(p_company_id UUID, p_hour TIMESTAMPTZ)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.agent_hourly_stats WHERE company_id = p_company_id AND hour = p_hour;

  INSERT INTO public.agent_hourly_stats (
    company_id, hour, agent_name, model, total_tasks, total_spans,
    input_tokens, output_tokens, estimated_cost_usd,
    p50_duration_ms, p95_duration_ms, p99_duration_ms,
    tool_calls_total, tool_calls_ok, escalations, hallucination_flags, tasks_with_retry
  )
  SELECT
    p_company_id, p_hour,
    COALESCE(s.gen_ai_agent_name, 'unknown'),
    COALESCE(s.gen_ai_request_model, ''),
    COUNT(*) FILTER (WHERE s.parent_span_id IS NULL),
    COUNT(*),
    COALESCE(SUM(s.gen_ai_usage_input_tokens),  0)::BIGINT,
    COALESCE(SUM(s.gen_ai_usage_output_tokens), 0)::BIGINT,
    COALESCE(SUM(s.estimated_cost_usd), 0),
    PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY s.duration_ms)
      FILTER (WHERE s.parent_span_id IS NULL AND s.duration_ms IS NOT NULL)::INT,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY s.duration_ms)
      FILTER (WHERE s.parent_span_id IS NULL AND s.duration_ms IS NOT NULL)::INT,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY s.duration_ms)
      FILTER (WHERE s.parent_span_id IS NULL AND s.duration_ms IS NOT NULL)::INT,
    COUNT(*) FILTER (WHERE s.gen_ai_operation_name = 'tool_call')::INT,
    COUNT(*) FILTER (WHERE s.gen_ai_operation_name = 'tool_call' AND s.status_code = 'OK')::INT,
    COUNT(*) FILTER (WHERE s.escalated)::INT,
    COUNT(*) FILTER (WHERE s.has_hallucination_flag)::INT,
    COUNT(*) FILTER (WHERE s.had_retry AND s.parent_span_id IS NULL)::INT
  FROM public.agent_spans s
  WHERE s.company_id = p_company_id
    AND date_trunc('hour', s.start_time) = p_hour
  GROUP BY s.gen_ai_agent_name, s.gen_ai_request_model;
END;
$$;

-- Per-agent KPIs. Returns nothing unless the caller owns the company.
CREATE OR REPLACE FUNCTION public.get_agent_overview(
  p_company_id UUID,
  p_from       TIMESTAMPTZ DEFAULT now() - interval '30 days',
  p_to         TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE(
  agent_name           TEXT,
  total_tasks          BIGINT,
  task_completion_rate NUMERIC,
  first_pass_rate      NUMERIC,
  tool_success_rate    NUMERIC,
  p50_latency_ms       NUMERIC,
  p95_latency_ms       NUMERIC,
  escalation_rate      NUMERIC,
  total_input_tokens   BIGINT,
  total_output_tokens  BIGINT,
  estimated_cost_usd   NUMERIC,
  hallucination_flags  BIGINT,
  last_active          TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT
    COALESCE(s.gen_ai_agent_name, 'unknown'),
    COUNT(*) FILTER (WHERE s.parent_span_id IS NULL),
    ROUND(100.0 * COUNT(*) FILTER (WHERE s.parent_span_id IS NULL AND s.status_code = 'OK') /
      NULLIF(COUNT(*) FILTER (WHERE s.parent_span_id IS NULL), 0), 1),
    ROUND(100.0 * COUNT(*) FILTER (WHERE s.parent_span_id IS NULL AND NOT s.had_retry) /
      NULLIF(COUNT(*) FILTER (WHERE s.parent_span_id IS NULL), 0), 1),
    ROUND(100.0 * COUNT(*) FILTER (WHERE s.gen_ai_operation_name = 'tool_call' AND s.status_code = 'OK') /
      NULLIF(COUNT(*) FILTER (WHERE s.gen_ai_operation_name = 'tool_call'), 0), 1),
    (PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY s.duration_ms)
      FILTER (WHERE s.parent_span_id IS NULL AND s.duration_ms IS NOT NULL))::NUMERIC,
    (PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY s.duration_ms)
      FILTER (WHERE s.parent_span_id IS NULL AND s.duration_ms IS NOT NULL))::NUMERIC,
    ROUND(100.0 * COUNT(*) FILTER (WHERE s.escalated AND s.parent_span_id IS NULL) /
      NULLIF(COUNT(*) FILTER (WHERE s.parent_span_id IS NULL), 0), 1),
    COALESCE(SUM(s.gen_ai_usage_input_tokens),  0)::BIGINT,
    COALESCE(SUM(s.gen_ai_usage_output_tokens), 0)::BIGINT,
    COALESCE(SUM(s.estimated_cost_usd), 0),
    COUNT(*) FILTER (WHERE s.has_hallucination_flag)::BIGINT,
    MAX(s.start_time)
  FROM public.agent_spans s
  WHERE s.company_id = p_company_id
    AND p_company_id = (SELECT auth.uid())
    AND s.start_time BETWEEN p_from AND p_to
  GROUP BY s.gen_ai_agent_name
  ORDER BY 2 DESC;
$$;

-- Span tree for one trace. Returns nothing unless the caller owns the company.
CREATE OR REPLACE FUNCTION public.get_agent_trace(p_company_id UUID, p_trace_id TEXT)
RETURNS TABLE(
  span_id                    TEXT,
  parent_span_id             TEXT,
  span_name                  TEXT,
  gen_ai_operation_name      TEXT,
  gen_ai_agent_name          TEXT,
  gen_ai_request_model       TEXT,
  tool_name                  TEXT,
  mcp_server                 TEXT,
  status_code                TEXT,
  start_time                 TIMESTAMPTZ,
  duration_ms                INT,
  gen_ai_usage_input_tokens  INT,
  gen_ai_usage_output_tokens INT,
  estimated_cost_usd         NUMERIC,
  had_retry                  BOOLEAN,
  escalated                  BOOLEAN,
  eval_score                 NUMERIC,
  attributes                 JSONB
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT
    s.span_id, s.parent_span_id, s.span_name, s.gen_ai_operation_name,
    s.gen_ai_agent_name, s.gen_ai_request_model, s.tool_name, s.mcp_server, s.status_code,
    s.start_time, s.duration_ms, s.gen_ai_usage_input_tokens, s.gen_ai_usage_output_tokens,
    s.estimated_cost_usd, s.had_retry, s.escalated, s.eval_score, s.attributes
  FROM public.agent_spans s
  WHERE s.company_id = p_company_id
    AND p_company_id = (SELECT auth.uid())
    AND s.trace_id = p_trace_id
  ORDER BY s.start_time;
$$;

-- Agent-assisted conversions: web sessions an agent touched that later converted.
CREATE OR REPLACE FUNCTION public.get_agent_conversions(
  p_company_id UUID,
  p_from       TIMESTAMPTZ DEFAULT now() - interval '30 days',
  p_to         TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE(agent_name TEXT, sessions_with_agent BIGINT, conversions BIGINT, conversion_rate NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  WITH agent_sessions AS (
    SELECT DISTINCT COALESCE(s.gen_ai_agent_name, 'unknown') AS agent_name, s.web_session_id
    FROM public.agent_spans s
    WHERE s.company_id = p_company_id
      AND p_company_id = (SELECT auth.uid())
      AND s.web_session_id IS NOT NULL
      AND s.start_time BETWEEN p_from AND p_to
  ),
  converted AS (
    SELECT DISTINCT e.session_id
    FROM public.tracking_events e
    WHERE e.company_id = p_company_id
      AND e.event_type = 'conversion'
      AND e.created_at BETWEEN p_from AND p_to
  )
  SELECT
    a.agent_name,
    COUNT(DISTINCT a.web_session_id)::BIGINT,
    COUNT(DISTINCT a.web_session_id) FILTER (WHERE a.web_session_id IN (SELECT session_id FROM converted))::BIGINT,
    ROUND(100.0 * COUNT(DISTINCT a.web_session_id) FILTER (WHERE a.web_session_id IN (SELECT session_id FROM converted))
      / NULLIF(COUNT(DISTINCT a.web_session_id), 0), 1)
  FROM agent_sessions a
  GROUP BY a.agent_name
  ORDER BY 3 DESC;
$$;

-- Retention: 365 days for spans, 730 days for hourly stats.
CREATE OR REPLACE FUNCTION public.run_agent_telemetry_retention()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  d_spans BIGINT;
  d_stats BIGINT;
BEGIN
  DELETE FROM public.agent_spans WHERE received_at < now() - interval '365 days';
  GET DIAGNOSTICS d_spans = ROW_COUNT;
  DELETE FROM public.agent_hourly_stats WHERE hour < now() - interval '730 days';
  GET DIAGNOSTICS d_stats = ROW_COUNT;
  RETURN jsonb_build_object('spans_deleted', d_spans, 'stats_deleted', d_stats);
END;
$$;

INSERT INTO public.agent_model_pricing (model_id, provider, input_cost_per_1m, output_cost_per_1m, notes)
VALUES
  ('claude-opus-4-6',           'anthropic', 15.00, 75.00, 'Claude Opus 4.6'),
  ('claude-sonnet-4-6',         'anthropic',  3.00, 15.00, 'Claude Sonnet 4.6'),
  ('claude-haiku-4-5-20251001', 'anthropic',  0.80,  4.00, 'Claude Haiku 4.5'),
  ('claude-opus-4-5',           'anthropic', 15.00, 75.00, 'Claude Opus 4.5'),
  ('claude-sonnet-4-5',         'anthropic',  3.00, 15.00, 'Claude Sonnet 4.5'),
  ('gpt-4o',                    'openai',     2.50, 10.00, 'GPT-4o'),
  ('gpt-4o-mini',               'openai',     0.15,  0.60, 'GPT-4o mini'),
  ('gpt-4-turbo',               'openai',    10.00, 30.00, 'GPT-4 Turbo'),
  ('o1',                        'openai',    15.00, 60.00, 'OpenAI o1'),
  ('o3-mini',                   'openai',     1.10,  4.40, 'OpenAI o3-mini'),
  ('gemini-2.0-flash',          'google',     0.075, 0.30, 'Gemini 2.0 Flash'),
  ('gemini-1.5-pro',            'google',     1.25,  5.00, 'Gemini 1.5 Pro'),
  ('mistral-large-latest',      'mistral',    2.00,  6.00, 'Mistral Large'),
  ('mistral-small-latest',      'mistral',    0.10,  0.30, 'Mistral Small')
ON CONFLICT (model_id) DO UPDATE SET
  input_cost_per_1m  = EXCLUDED.input_cost_per_1m,
  output_cost_per_1m = EXCLUDED.output_cost_per_1m;

-- ── Cyber detection (from 0005) ─────────────────────────────────────────────────

INSERT INTO public.bot_catalog (name, display_name, category, ua_patterns, description, vendor)
VALUES
  ('adidxbot', 'AdIdxBot (Bing Ads)', 'search_crawler', ARRAY['adidxbot'],
   'Bing Ads crawler — crawls ad landing pages for quality control. Desktop and mobile variants.', 'Microsoft'),
  ('microsoft-preview', 'MicrosoftPreview', 'search_crawler', ARRAY['MicrosoftPreview'],
   'Generates page snapshots for Microsoft products (Teams link previews, Outlook, etc.).', 'Microsoft'),
  ('bing-video-preview', 'BingVideoPreview', 'search_crawler', ARRAY['BingVideoPreview'],
   'Crawls and generates video previews for Bing search results.', 'Microsoft')
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  ua_patterns  = EXCLUDED.ua_patterns,
  description  = EXCLUDED.description,
  vendor       = EXCLUDED.vendor;

-- ── Canary detection (from 0006, table + final seed_cyber_alerts) ───────────────

CREATE TABLE IF NOT EXISTS public.canary_hits (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id      UUID        NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  token        TEXT        NOT NULL,
  canary_type  TEXT        NOT NULL DEFAULT 'pixel'
    CONSTRAINT canary_hits_type_check CHECK (canary_type IN ('pixel', 'link')),
  ip_anon      TEXT,
  ua_category  TEXT,
  country      TEXT,
  referrer     TEXT,
  detected_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS canary_hits_site_time_idx ON public.canary_hits(site_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS canary_hits_token_idx     ON public.canary_hits(token);
COMMENT ON TABLE public.canary_hits IS
  'Canary pixel/link requests, written by the canary-tracker Edge Function. Raw IP and UA are never stored.';

ALTER TABLE public.canary_hits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.canary_hits FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.canary_hits TO authenticated;
DROP POLICY IF EXISTS "canary_hits_owner_read" ON public.canary_hits;
CREATE POLICY "canary_hits_owner_read" ON public.canary_hits FOR SELECT TO authenticated
  USING (site_id IN (SELECT id FROM public.sites WHERE user_id = (SELECT auth.uid())));

-- Seed the default cyber alerts for a site. Idempotent.
CREATE OR REPLACE FUNCTION public.seed_cyber_alerts(p_site_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_inserted INT := 0;
  v_count    INT;
  v_alert    RECORD;
BEGIN
  FOR v_alert IN
    SELECT * FROM (VALUES
      ('traffic_spike', 'Traffic Spike Detected',
       'Session volume in the last 5 minutes exceeds 3× the 7-day baseline.', 'high',
       jsonb_build_object('window_minutes', 5, 'spike_multiplier', 3.0, 'min_baseline_sessions', 3)),
      ('scraping_activity', 'Scraping Activity Detected',
       'Sessions visiting 15+ pages at robot-speed pace (<3 sec/page average).', 'high',
       jsonb_build_object('min_page_views', 15, 'max_seconds_per_page', 3, 'min_suspicious_sessions', 1)),
      ('honeypot_triggered', 'Honeypot Triggered',
       'A hidden element invisible to real users was interacted with. High-confidence bot signal.', 'critical',
       '{}'::jsonb),
      ('canary_hit', 'Canary Detected',
       'A hidden tracking URL invisible to real users was requested. '
       'Canary pixel = server-side image fetcher; canary link = automated link traversal.', 'critical',
       '{}'::jsonb)
    ) AS t(alert_type, alert_name, alert_description, severity, threshold_config)
  LOOP
    INSERT INTO public.behavioral_alerts (
      site_id, alert_type, alert_name, alert_description,
      severity, threshold_config, is_active, notification_settings
    )
    SELECT p_site_id, v_alert.alert_type, v_alert.alert_name, v_alert.alert_description,
           v_alert.severity, v_alert.threshold_config, true, '{}'::jsonb
    WHERE NOT EXISTS (
      SELECT 1 FROM public.behavioral_alerts b WHERE b.site_id = p_site_id AND b.alert_type = v_alert.alert_type
    );
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_inserted := v_inserted + v_count;
  END LOOP;
  RETURN jsonb_build_object('alerts_created', v_inserted, 'site_id', p_site_id);
END;
$$;

-- ── Privileges ──────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.compute_span_cost(TEXT, INT, INT),
                       public.refresh_agent_hourly_stats(UUID, TIMESTAMPTZ),
                       public.run_agent_telemetry_retention(),
                       public.seed_cyber_alerts(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_span_cost(TEXT, INT, INT),
                          public.refresh_agent_hourly_stats(UUID, TIMESTAMPTZ),
                          public.run_agent_telemetry_retention(),
                          public.seed_cyber_alerts(UUID)
  TO service_role;

REVOKE ALL ON FUNCTION public.get_agent_overview(UUID, TIMESTAMPTZ, TIMESTAMPTZ),
                       public.get_agent_trace(UUID, TEXT),
                       public.get_agent_conversions(UUID, TIMESTAMPTZ, TIMESTAMPTZ)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_agent_overview(UUID, TIMESTAMPTZ, TIMESTAMPTZ),
                          public.get_agent_trace(UUID, TEXT),
                          public.get_agent_conversions(UUID, TIMESTAMPTZ, TIMESTAMPTZ)
  TO authenticated, service_role;

-- Daily span retention. pg_cron is not available in every environment.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('daily-agent-telemetry-retention', '45 3 * * *',
      'select public.run_agent_telemetry_retention()');
  END IF;
END $$;

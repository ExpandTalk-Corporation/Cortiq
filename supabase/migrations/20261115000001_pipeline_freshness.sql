-- Pipeline freshness alerts: notice when a data pipeline that normally delivers goes silent.
--
-- An hourly pg_cron job calls the pipeline-freshness Edge Function, which runs
-- check_pipeline_freshness(). A pipeline (page views, consents, server-side AI bot hits, link clicks,
-- aggregate pages) is silent when, per site:
--   - nothing has arrived for at least 36 hours,
--   - it has at least 7 days of history (of the last 28),
--   - its own rate over that history says at least 12 rows should have arrived since, and
--   - the days it delivered on make this many silent days unlikely: with data on d of h history days,
--     (1 - d/h) ^ silent_days must be at most 1 %. A pipeline with data every day alerts after 36 h;
--     one burst on a single day never alerts, however many rows it had.
-- Browser AI-agent detections are left out: they are sporadic events, and page views already show
-- whether the script that detects them is still running.
-- Calibrated 2026-11-09 against production: small sites are normally quiet 13–26 h overnight and at
-- weekends; the real outages (sentrisk.se 185 h, itsäkerhet 105 h, båtguide.nu since 2026-11-04) all trip it.
-- An alert stays open until a newer row arrives. The dashboard shows open alerts; the Edge Function
-- also emails the site owner once on open and once on recovery when RESEND_API_KEY is set.

CREATE TABLE IF NOT EXISTS public.pipeline_alerts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id              uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  pipeline             text NOT NULL,
  last_seen_at         timestamptz NOT NULL,
  expected             integer NOT NULL,
  opened_at            timestamptz NOT NULL DEFAULT now(),
  resolved_at          timestamptz,
  opened_notified_at   timestamptz,
  resolved_notified_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS pipeline_alerts_one_open
  ON public.pipeline_alerts (site_id, pipeline) WHERE resolved_at IS NULL;

ALTER TABLE public.pipeline_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners read their pipeline alerts" ON public.pipeline_alerts;
CREATE POLICY "Owners read their pipeline alerts" ON public.pipeline_alerts
  FOR SELECT TO authenticated
  USING (site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid()));

REVOKE ALL ON public.pipeline_alerts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.pipeline_alerts TO authenticated;
GRANT SELECT, UPDATE ON public.pipeline_alerts TO service_role;

-- Rows per site and pipeline in [p_from, p_to), with the newest timestamp.
-- Aggregate tables are daily, so a day counts as seen until its end.
CREATE OR REPLACE FUNCTION public.pipeline_activity(p_from timestamptz, p_to timestamptz)
RETURNS TABLE (site_id uuid, pipeline text, first_at timestamptz, last_at timestamptz, n bigint, days bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH rows AS (
    SELECT pv.site_id, 'page_views'::text AS pipeline, pv.viewed_at AS t
      FROM public.page_views pv WHERE pv.viewed_at >= p_from AND pv.viewed_at < p_to
    UNION ALL
    SELECT cc.site_id, 'consents', cc.created_at
      FROM public.cookie_consents cc WHERE cc.created_at >= p_from AND cc.created_at < p_to
    UNION ALL
    SELECT ab.site_id, 'ai_bots_server', ab.detected_at
      FROM public.ai_bot_traffic ab WHERE ab.source <> 'js_tag' AND ab.detected_at >= p_from AND ab.detected_at < p_to
    UNION ALL
    SELECT lc.site_id, 'link_clicks', lc.updated_at
      FROM public.link_click_counts lc WHERE lc.updated_at >= p_from AND lc.updated_at < p_to
    UNION ALL
    SELECT ap.site_id, 'aggregate', least((ap.day + 1)::timestamptz, p_to)
      FROM public.aggregate_pages_daily ap WHERE ap.day >= p_from::date AND ap.day < p_to::date + 1
  )
  SELECT r.site_id, r.pipeline, min(r.t), max(r.t), count(*), count(DISTINCT (r.t AT TIME ZONE 'UTC')::date) FROM rows r WHERE r.site_id IS NOT NULL GROUP BY 1, 2
$$;

-- Resolves alerts whose pipeline delivers again, opens new ones, and returns the alerts that still
-- need an email (opened, or resolved after an opening email went out).
CREATE OR REPLACE FUNCTION public.check_pipeline_freshness(p_now timestamptz DEFAULT now())
RETURNS SETOF public.pipeline_alerts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.pipeline_alerts a SET resolved_at = p_now
    FROM public.pipeline_activity(p_now - interval '28 days', p_now) s
   WHERE a.resolved_at IS NULL AND s.site_id = a.site_id AND s.pipeline = a.pipeline AND s.last_at > a.last_seen_at;

  INSERT INTO public.pipeline_alerts (site_id, pipeline, last_seen_at, expected, opened_at)
  SELECT s.site_id, s.pipeline, s.last_at, floor(s.expected)::integer, p_now
    FROM (
      SELECT a.*, h.history_days,
             a.n / (h.history_days * 24) * extract(epoch FROM p_now - a.last_at) / 3600 AS expected,
             floor(extract(epoch FROM p_now - a.last_at) / 86400) AS silent_days
        FROM public.pipeline_activity(p_now - interval '28 days', p_now) a
        CROSS JOIN LATERAL (SELECT ceil(extract(epoch FROM p_now - a.first_at) / 86400) AS history_days) h
    ) s
    JOIN public.sites st ON st.id = s.site_id AND coalesce(st.is_active, true)
   WHERE p_now - s.last_at >= interval '36 hours'
     AND s.history_days >= 7
     AND s.expected >= 12
     AND power(greatest(0, 1 - s.days / s.history_days), s.silent_days) <= 0.01
  ON CONFLICT (site_id, pipeline) WHERE resolved_at IS NULL DO NOTHING;

  RETURN QUERY
    SELECT * FROM public.pipeline_alerts a
     WHERE (a.resolved_at IS NULL AND a.opened_notified_at IS NULL)
        OR (a.resolved_at IS NOT NULL AND a.opened_notified_at IS NOT NULL AND a.resolved_notified_at IS NULL)
     ORDER BY a.site_id, a.opened_at;
END;
$$;

REVOKE ALL ON FUNCTION public.pipeline_activity(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_pipeline_freshness(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_pipeline_freshness(timestamptz) TO service_role;

-- Cron auth, as for gsc-daily-sync: a random secret in Vault, sent in x-cron-secret.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'supabase_vault') THEN
    IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'pipeline_freshness_cron_secret') THEN
      PERFORM vault.create_secret(
        encode(extensions.gen_random_bytes(32), 'hex'),
        'pipeline_freshness_cron_secret',
        'x-cron-secret for the pipeline-freshness cron job → pipeline-freshness Edge Function'
      );
    END IF;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.pipeline_freshness_cron_secret_matches(p_secret text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_secret IS NULL OR length(p_secret) < 32 THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name = 'pipeline_freshness_cron_secret' AND decrypted_secret = p_secret
  );
EXCEPTION WHEN undefined_table OR invalid_schema_name THEN
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.pipeline_freshness_cron_secret_matches(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pipeline_freshness_cron_secret_matches(text) TO service_role;

-- Hourly at :41. Needs pg_cron, pg_net and Vault (not in every environment).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'supabase_vault') THEN
    PERFORM cron.schedule(
      'pipeline-freshness',
      '41 * * * *',
      $job$
      SELECT net.http_post(
        url := 'https://cxmkdtgfocgbfizawlwa.supabase.co/functions/v1/pipeline-freshness',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'pipeline_freshness_cron_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
      );
      $job$
    );
  END IF;
END $$;

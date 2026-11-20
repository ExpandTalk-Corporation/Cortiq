-- Uptime monitoring: notice within minutes when a site goes down or its CortIQ snippet disappears.
--
-- Every 5 minutes pg_cron calls the site-uptime Edge Function, which fetches each active site's home page
-- (supabase/functions/_shared/uptime.ts) and records the result with record_uptime_check():
--   - down: no answer, a timeout or an HTTP error (a host that suspends the site after finding malware
--     answers this way);
--   - snippet_missing: the page loads but no longer contains the CortIQ snippet, after it was seen there
--     before. Sites that load CortIQ from their own JavaScript bundle never had it in the HTML and never
--     get this alert;
--   - inconclusive (a bot challenge, basic auth, a blocked address) changes nothing.
-- An alert opens after the same problem in two checks in a row (about 5–10 minutes) and resolves on the
-- first check without it. The pipeline freshness alerts (36 h of silent data) stay for broken tracking
-- on a site that is up. Calibrated 2026-11-17 against the ekonom.biz suspension of 2026-11-16 (21 h
-- silent, never alerted by the data rule).

CREATE TABLE IF NOT EXISTS public.site_uptime (
  site_id         uuid PRIMARY KEY REFERENCES public.sites(id) ON DELETE CASCADE,
  checked_at      timestamptz NOT NULL,
  status          integer,
  detail          text,
  problem         text,
  streak          integer NOT NULL DEFAULT 0,
  snippet_seen_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.uptime_alerts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id              uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  kind                 text NOT NULL CHECK (kind IN ('down', 'snippet_missing')),
  detail               text,
  opened_at            timestamptz NOT NULL DEFAULT now(),
  resolved_at          timestamptz,
  opened_notified_at   timestamptz,
  resolved_notified_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uptime_alerts_one_open
  ON public.uptime_alerts (site_id, kind) WHERE resolved_at IS NULL;

ALTER TABLE public.site_uptime ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uptime_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners read their site uptime" ON public.site_uptime;
CREATE POLICY "Owners read their site uptime" ON public.site_uptime
  FOR SELECT TO authenticated
  USING (site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Owners read their uptime alerts" ON public.uptime_alerts;
CREATE POLICY "Owners read their uptime alerts" ON public.uptime_alerts
  FOR SELECT TO authenticated
  USING (site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid()));

REVOKE ALL ON public.site_uptime, public.uptime_alerts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.site_uptime, public.uptime_alerts TO authenticated;
GRANT SELECT ON public.site_uptime TO service_role;
GRANT SELECT, UPDATE ON public.uptime_alerts TO service_role;

-- Records one check. p_problem is 'down', 'inconclusive' or null (the page loaded); p_snippet_found says
-- whether the loaded page contains the CortIQ snippet (null when it did not load).
CREATE OR REPLACE FUNCTION public.record_uptime_check(
  p_site_id uuid, p_problem text, p_status integer, p_detail text, p_snippet_found boolean,
  p_now timestamptz DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  prev public.site_uptime;
  v_problem text := p_problem;
  v_streak integer;
BEGIN
  IF v_problem IS NOT NULL AND v_problem NOT IN ('down', 'inconclusive') THEN
    RAISE EXCEPTION 'unknown problem %', v_problem;
  END IF;
  SELECT * INTO prev FROM public.site_uptime WHERE site_id = p_site_id FOR UPDATE;

  IF v_problem = 'inconclusive' THEN
    INSERT INTO public.site_uptime (site_id, checked_at, status, detail)
    VALUES (p_site_id, p_now, p_status, p_detail)
    ON CONFLICT (site_id) DO UPDATE SET checked_at = p_now, status = p_status, detail = p_detail;
    RETURN;
  END IF;

  IF v_problem IS NULL AND p_snippet_found IS FALSE AND prev.snippet_seen_at IS NOT NULL THEN
    v_problem := 'snippet_missing';
  END IF;
  v_streak := CASE WHEN v_problem IS NULL THEN 0
                 WHEN v_problem IS NOT DISTINCT FROM prev.problem THEN prev.streak + 1
                 ELSE 1 END;

  INSERT INTO public.site_uptime AS u (site_id, checked_at, status, detail, problem, streak, snippet_seen_at)
  VALUES (p_site_id, p_now, p_status, p_detail, v_problem, v_streak, CASE WHEN p_snippet_found THEN p_now END)
  ON CONFLICT (site_id) DO UPDATE SET
    checked_at = p_now, status = p_status, detail = p_detail, problem = EXCLUDED.problem, streak = EXCLUDED.streak,
    snippet_seen_at = coalesce(EXCLUDED.snippet_seen_at, u.snippet_seen_at);

  -- A page that loads resolves "down"; a page with the snippet resolves "snippet_missing". While the site is
  -- down nothing is known about the snippet, so that alert stays as it is.
  UPDATE public.uptime_alerts SET resolved_at = p_now
   WHERE site_id = p_site_id AND resolved_at IS NULL
     AND ((kind = 'down' AND v_problem IS DISTINCT FROM 'down')
       OR (kind = 'snippet_missing' AND v_problem IS NULL));

  IF v_streak >= 2 THEN
    INSERT INTO public.uptime_alerts (site_id, kind, detail, opened_at)
    VALUES (p_site_id, v_problem, p_detail, p_now)
    ON CONFLICT (site_id, kind) WHERE resolved_at IS NULL DO NOTHING;
  END IF;
END;
$$;

-- Alerts that still need an email: opened, or resolved after an opening email went out.
CREATE OR REPLACE FUNCTION public.uptime_alerts_to_email()
RETURNS SETOF public.uptime_alerts
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT * FROM public.uptime_alerts a
   WHERE (a.resolved_at IS NULL AND a.opened_notified_at IS NULL)
      OR (a.resolved_at IS NOT NULL AND a.opened_notified_at IS NOT NULL AND a.resolved_notified_at IS NULL)
   ORDER BY a.site_id, a.opened_at
$$;

REVOKE ALL ON FUNCTION public.record_uptime_check(uuid, text, integer, text, boolean, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.uptime_alerts_to_email() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_uptime_check(uuid, text, integer, text, boolean, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.uptime_alerts_to_email() TO service_role;

-- Whether alert emails can go out (RESEND_API_KEY set on the Edge Functions), written by every site-uptime run
-- so the dashboard can say when emails are off. One row; nothing secret in it.
CREATE TABLE IF NOT EXISTS public.alert_email_status (
  id         integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  configured boolean NOT NULL,
  checked_at timestamptz NOT NULL
);
ALTER TABLE public.alert_email_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Signed-in users read alert email status" ON public.alert_email_status;
CREATE POLICY "Signed-in users read alert email status" ON public.alert_email_status
  FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.alert_email_status FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.alert_email_status TO authenticated;

CREATE OR REPLACE FUNCTION public.record_alert_email_status(p_configured boolean)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.alert_email_status (id, configured, checked_at) VALUES (1, p_configured, now())
  ON CONFLICT (id) DO UPDATE SET configured = EXCLUDED.configured, checked_at = EXCLUDED.checked_at
$$;
REVOKE ALL ON FUNCTION public.record_alert_email_status(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_alert_email_status(boolean) TO service_role;

-- Cron auth, as for pipeline-freshness: a random secret in Vault, sent in x-cron-secret.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'supabase_vault') THEN
    IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'site_uptime_cron_secret') THEN
      PERFORM vault.create_secret(
        encode(extensions.gen_random_bytes(32), 'hex'),
        'site_uptime_cron_secret',
        'x-cron-secret for the site-uptime cron job → site-uptime Edge Function'
      );
    END IF;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.site_uptime_cron_secret_matches(p_secret text)
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
    WHERE name = 'site_uptime_cron_secret' AND decrypted_secret = p_secret
  );
EXCEPTION WHEN undefined_table OR invalid_schema_name THEN
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.site_uptime_cron_secret_matches(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.site_uptime_cron_secret_matches(text) TO service_role;

-- Every 5 minutes. Needs pg_cron, pg_net and Vault (not in every environment).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'supabase_vault') THEN
    PERFORM cron.schedule(
      'site-uptime',
      '*/5 * * * *',
      $job$
      SELECT net.http_post(
        url := 'https://cxmkdtgfocgbfizawlwa.supabase.co/functions/v1/site-uptime',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'site_uptime_cron_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      );
      $job$
    );
  END IF;
END $$;

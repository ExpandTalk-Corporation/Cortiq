-- supabase/migrations/20261202000002_aggregate_never_alert.sql
-- Spec 2026-11-18 phase 1 AC4. A site with aggregate measurement on that never sends a hit was
-- invisible: check_pipeline_freshness needs 7 days of history. sentrisk.se had the flag on and
-- no beacon in its install. New alert 'aggregate_never': flag on for 24 h, no aggregate_pages_daily
-- row since the day it was turned on. Resolves when a hit arrives or the flag goes off.
-- Same body as 20261115000001 otherwise.

ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS aggregate_enabled_at timestamptz;
COMMENT ON COLUMN public.sites.aggregate_enabled_at IS
  'When aggregate_measurement last turned true; null while off. Set by trigger sites_aggregate_enabled_at.';

UPDATE public.sites SET aggregate_enabled_at = now() WHERE aggregate_measurement AND aggregate_enabled_at IS NULL;

-- Stamps now() when the flag turns true, unless the same statement also set aggregate_enabled_at
-- explicitly (used to backdate it, e.g. in tests or a data fix) — detected by comparing against OLD,
-- since a column left out of an UPDATE's SET list keeps NEW equal to OLD.
CREATE OR REPLACE FUNCTION public.sites_set_aggregate_enabled_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.aggregate_measurement AND (TG_OP = 'INSERT' OR NOT coalesce(OLD.aggregate_measurement, false)) THEN
    IF TG_OP = 'INSERT' OR NEW.aggregate_enabled_at IS NOT DISTINCT FROM OLD.aggregate_enabled_at THEN
      NEW.aggregate_enabled_at := now();
    END IF;
  ELSIF NOT NEW.aggregate_measurement THEN
    NEW.aggregate_enabled_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sites_aggregate_enabled_at ON public.sites;
CREATE TRIGGER sites_aggregate_enabled_at
  BEFORE INSERT OR UPDATE OF aggregate_measurement ON public.sites
  FOR EACH ROW EXECUTE FUNCTION public.sites_set_aggregate_enabled_at();

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

  -- aggregate_never: resolved by any hit on/after the enable day, or by the flag going off.
  UPDATE public.pipeline_alerts a SET resolved_at = p_now
   WHERE a.resolved_at IS NULL AND a.pipeline = 'aggregate_never'
     AND (NOT EXISTS (SELECT 1 FROM public.sites st WHERE st.id = a.site_id AND st.aggregate_measurement)
          OR EXISTS (SELECT 1 FROM public.aggregate_pages_daily ap
                      WHERE ap.site_id = a.site_id AND ap.day >= (a.last_seen_at AT TIME ZONE 'UTC')::date));

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

  INSERT INTO public.pipeline_alerts (site_id, pipeline, last_seen_at, expected, opened_at)
  SELECT st.id, 'aggregate_never', st.aggregate_enabled_at, 0, p_now
    FROM public.sites st
   WHERE coalesce(st.is_active, true) AND st.aggregate_measurement
     AND st.aggregate_enabled_at IS NOT NULL AND st.aggregate_enabled_at <= p_now - interval '24 hours'
     AND NOT EXISTS (SELECT 1 FROM public.aggregate_pages_daily ap
                      WHERE ap.site_id = st.id AND ap.day >= (st.aggregate_enabled_at AT TIME ZONE 'UTC')::date)
  ON CONFLICT (site_id, pipeline) WHERE resolved_at IS NULL DO NOTHING;

  RETURN QUERY
    SELECT * FROM public.pipeline_alerts a
     WHERE (a.resolved_at IS NULL AND a.opened_notified_at IS NULL)
        OR (a.resolved_at IS NOT NULL AND a.opened_notified_at IS NOT NULL AND a.resolved_notified_at IS NULL)
     ORDER BY a.site_id, a.opened_at;
END;
$$;

REVOKE ALL ON FUNCTION public.check_pipeline_freshness(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_pipeline_freshness(timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.get_aggregate_install_status(p_site_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_on   boolean;
  v_at   timestamptz;
  v_last date;
BEGIN
  SELECT s.aggregate_measurement, s.aggregate_enabled_at INTO v_on, v_at
    FROM public.sites s WHERE s.id = p_site_id AND s.user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501';
  END IF;
  SELECT max(ap.day) INTO v_last FROM public.aggregate_pages_daily ap WHERE ap.site_id = p_site_id;
  RETURN jsonb_build_object(
    'enabled', v_on, 'enabled_at', v_at, 'last_hit_day', v_last,
    'missing', coalesce(v_on AND v_at <= now() - interval '24 hours'
                        AND (v_last IS NULL OR v_last < (v_at AT TIME ZONE 'UTC')::date), false));
END;
$$;

REVOKE ALL ON FUNCTION public.get_aggregate_install_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_aggregate_install_status(uuid) TO authenticated;

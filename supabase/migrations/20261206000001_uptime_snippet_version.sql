-- Tracker version seen on the home page by the 5-minute uptime check (spec 2026-11-19 §1.2).
-- The dashboard compares it with src/lib/sri-manifest.json. Only overwritten when a version is read,
-- so a failed fetch or an auto-updating snippet (no version in the HTML) keeps the last one seen.

ALTER TABLE public.site_uptime ADD COLUMN IF NOT EXISTS snippet_version text;

DROP FUNCTION IF EXISTS public.record_uptime_check(uuid, text, integer, text, boolean, timestamptz);

CREATE FUNCTION public.record_uptime_check(
  p_site_id uuid, p_problem text, p_status integer, p_detail text, p_snippet_found boolean,
  p_now timestamptz DEFAULT now(), p_snippet_version text DEFAULT NULL
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
  v_version text := CASE WHEN p_snippet_version ~ '^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,4}$' THEN p_snippet_version END;
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

  INSERT INTO public.site_uptime AS u (site_id, checked_at, status, detail, problem, streak, snippet_seen_at, snippet_version)
  VALUES (p_site_id, p_now, p_status, p_detail, v_problem, v_streak, CASE WHEN p_snippet_found THEN p_now END, v_version)
  ON CONFLICT (site_id) DO UPDATE SET
    checked_at = p_now, status = p_status, detail = p_detail, problem = EXCLUDED.problem, streak = EXCLUDED.streak,
    snippet_seen_at = coalesce(EXCLUDED.snippet_seen_at, u.snippet_seen_at),
    snippet_version = coalesce(EXCLUDED.snippet_version, u.snippet_version);

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

REVOKE ALL ON FUNCTION public.record_uptime_check(uuid, text, integer, text, boolean, timestamptz, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_uptime_check(uuid, text, integer, text, boolean, timestamptz, text) TO service_role;

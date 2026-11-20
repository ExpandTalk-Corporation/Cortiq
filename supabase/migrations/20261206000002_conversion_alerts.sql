-- Rule-based conversion alerts (spec 2026-11-19 §2). Evaluated hourly by the pipeline-freshness Edge
-- Function through check_conversion_alerts(). Covers configured goals (sites.conversion_goals ×
-- conversion_events) and measured forms (form_sessions; a row is written at completion or abandonment,
-- so starts = completed + abandoned). Windows: last 7 days vs the 28 days before them.
-- Thresholds are repeated in supabase/functions/_shared/conversion-alerts.ts for the UI text;
-- tests/foundation/conversion-alert-thresholds.test.mjs keeps them equal.

CREATE TABLE IF NOT EXISTS public.conversion_alerts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id              uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  kind                 text NOT NULL CHECK (kind IN ('goal_silent', 'form_zero_completions', 'form_abandon_spike')),
  subject              text NOT NULL,
  detail               jsonb NOT NULL DEFAULT '{}'::jsonb,
  opened_at            timestamptz NOT NULL DEFAULT now(),
  resolved_at          timestamptz,
  opened_notified_at   timestamptz,
  resolved_notified_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS conversion_alerts_one_open
  ON public.conversion_alerts (site_id, kind, subject) WHERE resolved_at IS NULL;

ALTER TABLE public.conversion_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owners read their conversion alerts" ON public.conversion_alerts;
CREATE POLICY "Owners read their conversion alerts" ON public.conversion_alerts
  FOR SELECT TO authenticated
  USING (site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid()));

REVOKE ALL ON public.conversion_alerts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.conversion_alerts TO authenticated;
GRANT SELECT, UPDATE ON public.conversion_alerts TO service_role;

-- One row per (site, kind, subject) that has data in the last 35 days, with whether the rule says
-- open or resolve now. A subject with no row (goal deleted, form without traffic) resolves.
CREATE OR REPLACE FUNCTION public.conversion_alert_stats(p_now timestamptz DEFAULT now())
RETURNS TABLE (site_id uuid, kind text, subject text, should_open boolean, should_resolve boolean, detail jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  c_goal_min_prior_hits  CONSTANT integer := 3;
  c_goal_min_site_views  CONSTANT integer := 50;
  c_form_zero_min_starts CONSTANT integer := 5;
  c_spike_min_starts     CONSTANT integer := 10;
  c_spike_open_pp        CONSTANT numeric := 25;
  c_spike_close_pp       CONSTANT numeric := 15;
  v_recent timestamptz := p_now - interval '7 days';
  v_prior  timestamptz := p_now - interval '35 days';
BEGIN
  RETURN QUERY
  WITH goals AS (
    -- Same rule as matchesGoal (src/lib/goalMatching.ts): event_name = goal name, or element_selector
    -- contains the first comma-separated part of goal.selector. Keep both in step.
    SELECT s.id AS gsite, g->>'id' AS goal_id, g->>'name' AS goal_name,
           nullif(btrim(split_part(coalesce(g->>'selector', ''), ',', 1)), '') AS sel
      FROM public.sites s
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(s.conversion_goals) = 'array' THEN s.conversion_goals ELSE '[]'::jsonb END) g
     WHERE s.is_active IS NOT FALSE AND g->>'id' IS NOT NULL
  ), goal_hits AS (
    SELECT gl.gsite, gl.goal_id, gl.goal_name,
           count(e.created_at) FILTER (WHERE e.created_at >= v_recent) AS recent,
           count(e.created_at) FILTER (WHERE e.created_at < v_recent) AS prior
      FROM goals gl
      LEFT JOIN public.conversion_events e
        ON e.site_id = gl.gsite AND e.created_at >= v_prior AND e.created_at < p_now
       AND (e.event_name = gl.goal_name OR (gl.sel IS NOT NULL AND strpos(coalesce(e.element_selector, ''), gl.sel) > 0))
     GROUP BY gl.gsite, gl.goal_id, gl.goal_name
  ), site_views AS (
    SELECT pv.site_id AS vsite, count(*) AS n
      FROM public.page_views pv
     WHERE pv.viewed_at >= v_recent AND pv.viewed_at < p_now
     GROUP BY pv.site_id
  ), forms AS (
    SELECT f.site_id AS fsite, f.form_id,
           count(*) FILTER (WHERE f.started_at >= v_recent AND f.completed_at IS NOT NULL) AS r_done,
           count(*) FILTER (WHERE f.started_at >= v_recent AND f.completed_at IS NULL AND f.abandoned_at IS NOT NULL) AS r_drop,
           count(*) FILTER (WHERE f.started_at < v_recent AND f.completed_at IS NOT NULL) AS p_done,
           count(*) FILTER (WHERE f.started_at < v_recent AND f.completed_at IS NULL AND f.abandoned_at IS NOT NULL) AS p_drop
      FROM public.form_sessions f
      JOIN public.sites s ON s.id = f.site_id AND s.is_active IS NOT FALSE
     WHERE f.started_at >= v_prior AND f.started_at < p_now AND f.form_id IS NOT NULL
     GROUP BY f.site_id, f.form_id
  ), form_rates AS (
    SELECT fo.fsite, fo.form_id, fo.r_done, fo.p_done,
           fo.r_done + fo.r_drop AS r_starts, fo.p_done + fo.p_drop AS p_starts,
           CASE WHEN fo.r_done + fo.r_drop > 0 THEN round(100.0 * fo.r_drop / (fo.r_done + fo.r_drop), 1) END AS r_rate,
           CASE WHEN fo.p_done + fo.p_drop > 0 THEN round(100.0 * fo.p_drop / (fo.p_done + fo.p_drop), 1) END AS p_rate
      FROM forms fo
  )
  SELECT gh.gsite, 'goal_silent'::text, gh.goal_id,
         (gh.prior >= c_goal_min_prior_hits AND gh.recent = 0 AND coalesce(v.n, 0) >= c_goal_min_site_views),
         (gh.recent >= 1),
         jsonb_build_object('goal_name', gh.goal_name, 'hits_7d', gh.recent, 'hits_prior_28d', gh.prior,
                            'page_views_7d', coalesce(v.n, 0))
    FROM goal_hits gh LEFT JOIN site_views v ON v.vsite = gh.gsite
  UNION ALL
  SELECT fr.fsite, 'form_zero_completions'::text, fr.form_id,
         (fr.r_starts >= c_form_zero_min_starts AND fr.r_done = 0 AND fr.p_done >= 1),
         (fr.r_done >= 1),
         jsonb_build_object('starts_7d', fr.r_starts, 'completions_7d', fr.r_done, 'completions_prior_28d', fr.p_done)
    FROM form_rates fr
  UNION ALL
  SELECT fr.fsite, 'form_abandon_spike'::text, fr.form_id,
         coalesce(fr.r_starts >= c_spike_min_starts AND fr.p_starts >= c_spike_min_starts
                  AND fr.r_rate - fr.p_rate >= c_spike_open_pp, false),
         coalesce(fr.r_starts < c_spike_min_starts OR fr.r_rate - fr.p_rate < c_spike_close_pp, true),
         jsonb_build_object('starts_7d', fr.r_starts, 'starts_prior_28d', fr.p_starts,
                            'abandon_rate_7d', fr.r_rate, 'abandon_rate_prior_28d', fr.p_rate)
    FROM form_rates fr;
END;
$$;

-- Opens and resolves alerts, deletes resolved alerts older than a year, and returns the alerts that
-- still need an email: opened, or resolved after an opening email went out.
CREATE OR REPLACE FUNCTION public.check_conversion_alerts(p_now timestamptz DEFAULT now())
RETURNS SETOF public.conversion_alerts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_retention_days CONSTANT integer := 365;
BEGIN
  WITH st AS (SELECT * FROM public.conversion_alert_stats(p_now))
  UPDATE public.conversion_alerts a SET resolved_at = p_now
   WHERE a.resolved_at IS NULL
     -- An inactive site has no rows in st (conversion_alert_stats filters to active sites), so its
     -- open alerts would otherwise look unconditionally resolved. Leave them open instead: no stats,
     -- no resolve, no "fixed" email for a site nobody is tracking anymore.
     AND EXISTS (SELECT 1 FROM public.sites s WHERE s.id = a.site_id AND s.is_active IS NOT FALSE)
     AND NOT EXISTS (SELECT 1 FROM st
                      WHERE st.site_id = a.site_id AND st.kind = a.kind AND st.subject = a.subject
                        AND NOT st.should_resolve);

  INSERT INTO public.conversion_alerts (site_id, kind, subject, detail, opened_at)
  SELECT st.site_id, st.kind, st.subject, st.detail, p_now
    FROM public.conversion_alert_stats(p_now) st
   WHERE st.should_open
  ON CONFLICT (site_id, kind, subject) WHERE resolved_at IS NULL DO NOTHING;

  DELETE FROM public.conversion_alerts a
   WHERE a.resolved_at < p_now - make_interval(days => c_retention_days);

  RETURN QUERY
  SELECT * FROM public.conversion_alerts a
   WHERE (a.resolved_at IS NULL AND a.opened_notified_at IS NULL)
      OR (a.resolved_at IS NOT NULL AND a.opened_notified_at IS NOT NULL AND a.resolved_notified_at IS NULL)
   ORDER BY a.site_id, a.opened_at;
END;
$$;

REVOKE ALL ON FUNCTION public.conversion_alert_stats(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_conversion_alerts(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.conversion_alert_stats(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_conversion_alerts(timestamptz) TO service_role;

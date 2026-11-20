-- Measurement health for one site (spec 2026-11-19 §1): checks + signal inventory in one JSON object.
-- SECURITY INVOKER: RLS on every table decides access, and a site the caller cannot see raises 42501.
-- Sentences are not built here; supabase/functions/_shared/measurement-health.ts turns key + evidence into
-- text. The tracker version is compared with the SRI manifest in the dashboard, not here.

CREATE OR REPLACE FUNCTION public.get_measurement_health(p_site_id uuid, p_now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  c_goal_fire_rate      CONSTANT numeric := 0.30;  -- same as useConversionGoalHealth
  c_consent_drop_pp     CONSTANT numeric := 15;
  c_consent_min_choices CONSTANT integer := 30;
  v_7d  timestamptz := p_now - interval '7 days';
  v_28d timestamptz := p_now - interval '28 days';
  v_30d timestamptz := p_now - interval '30 days';
  v_35d timestamptz := p_now - interval '35 days';
  v_goals jsonb;
  v_checks jsonb := '[]'::jsonb;
  v_tmp jsonb;
  v_checked_at timestamptz;
  v_version text;
  v_seen timestamptz;
  v_sessions bigint;
  v_primary bigint;
  v_cr bigint; v_cr_yes bigint; v_cp bigint; v_cp_yes bigint;
  v_rate_r numeric; v_rate_p numeric;
  v_signals jsonb;
BEGIN
  SELECT CASE WHEN jsonb_typeof(s.conversion_goals) = 'array' THEN s.conversion_goals ELSE '[]'::jsonb END
    INTO v_goals FROM public.sites s WHERE s.id = p_site_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501';
  END IF;

  -- uptime
  SELECT u.checked_at, u.snippet_version, u.snippet_seen_at INTO v_checked_at, v_version, v_seen
    FROM public.site_uptime u WHERE u.site_id = p_site_id;
  SELECT coalesce(jsonb_agg(jsonb_build_object('kind', a.kind, 'detail', a.detail, 'opened_at', a.opened_at) ORDER BY a.opened_at), '[]'::jsonb)
    INTO v_tmp FROM public.uptime_alerts a WHERE a.site_id = p_site_id AND a.resolved_at IS NULL;
  v_checks := v_checks || jsonb_build_object('key', 'uptime', 'status',
      CASE WHEN v_tmp @> '[{"kind":"down"}]' THEN 'broken'
           WHEN v_tmp @> '[{"kind":"snippet_missing"}]' THEN 'warning'
           WHEN v_checked_at IS NULL THEN 'unknown' ELSE 'ok' END,
      'evidence', jsonb_build_object('open', v_tmp, 'checked_at', v_checked_at, 'snippet_version', v_version, 'snippet_seen_at', v_seen));

  -- pipelines
  SELECT coalesce(jsonb_agg(jsonb_build_object('pipeline', a.pipeline, 'last_seen_at', a.last_seen_at, 'opened_at', a.opened_at) ORDER BY a.opened_at), '[]'::jsonb)
    INTO v_tmp FROM public.pipeline_alerts a WHERE a.site_id = p_site_id AND a.resolved_at IS NULL;
  v_checks := v_checks || jsonb_build_object('key', 'pipelines',
      'status', CASE WHEN jsonb_array_length(v_tmp) > 0 THEN 'warning' ELSE 'ok' END,
      'evidence', jsonb_build_object('open', v_tmp));

  -- goals_configured
  v_checks := v_checks || jsonb_build_object('key', 'goals_configured',
      'status', CASE WHEN jsonb_array_length(v_goals) = 0 THEN 'warning' ELSE 'ok' END,
      'evidence', jsonb_build_object('goals', jsonb_array_length(v_goals)));

  -- goal_health. Matching = matchesGoal (src/lib/goalMatching.ts) and conversion_alert_stats().
  SELECT count(*) INTO v_sessions FROM public.tracking_sessions t
   WHERE t.site_id = p_site_id AND t.started_at >= v_30d AND t.started_at < p_now;
  SELECT count(*) INTO v_primary FROM jsonb_array_elements(v_goals) g WHERE g->'is_primary' = 'true'::jsonb;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', x.goal_id, 'name', x.goal_name, 'hits_30d', x.hits, 'issue',
           CASE WHEN x.hits = 0 THEN 'silent'
                WHEN v_sessions > 0 AND x.hits::numeric / v_sessions > c_goal_fire_rate THEN 'fires_too_often' END)
           ORDER BY x.ord), '[]'::jsonb)
    INTO v_tmp
    FROM (SELECT g.ord, g.value->>'id' AS goal_id, g.value->>'name' AS goal_name,
                 (SELECT count(*) FROM public.conversion_events e
                   WHERE e.site_id = p_site_id AND e.created_at >= v_30d AND e.created_at < p_now
                     AND (e.event_name = g.value->>'name'
                          OR (nullif(btrim(split_part(coalesce(g.value->>'selector', ''), ',', 1)), '') IS NOT NULL
                              AND strpos(coalesce(e.element_selector, ''), btrim(split_part(g.value->>'selector', ',', 1))) > 0))) AS hits
            FROM jsonb_array_elements(v_goals) WITH ORDINALITY AS g(value, ord)) x;
  v_checks := v_checks || jsonb_build_object('key', 'goal_health',
      'status', CASE WHEN jsonb_array_length(v_goals) = 0 THEN 'unknown'
                     WHEN v_primary > 1 OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_tmp) e WHERE e->>'issue' IS NOT NULL) THEN 'warning'
                     ELSE 'ok' END,
      'evidence', jsonb_build_object('sessions_30d', v_sessions, 'primary_goals', v_primary, 'goals', v_tmp));

  -- consent_rate: analytics acceptance, last 7 d vs the 28 d before.
  SELECT count(*) FILTER (WHERE c.created_at >= v_7d),
         count(*) FILTER (WHERE c.created_at >= v_7d AND c.consent_types->>'analytics' = 'true'),
         count(*) FILTER (WHERE c.created_at < v_7d),
         count(*) FILTER (WHERE c.created_at < v_7d AND c.consent_types->>'analytics' = 'true')
    INTO v_cr, v_cr_yes, v_cp, v_cp_yes
    FROM public.cookie_consents c
   WHERE c.site_id = p_site_id AND c.created_at >= v_35d AND c.created_at < p_now;
  v_rate_r := CASE WHEN v_cr > 0 THEN round(100.0 * v_cr_yes / v_cr, 1) END;
  v_rate_p := CASE WHEN v_cp > 0 THEN round(100.0 * v_cp_yes / v_cp, 1) END;
  v_checks := v_checks || jsonb_build_object('key', 'consent_rate',
      'status', CASE WHEN v_cr < c_consent_min_choices OR v_cp < c_consent_min_choices THEN 'unknown'
                     WHEN v_rate_p - v_rate_r >= c_consent_drop_pp THEN 'warning' ELSE 'ok' END,
      'evidence', jsonb_build_object('choices_7d', v_cr, 'choices_prior_28d', v_cp, 'rate_7d', v_rate_r, 'rate_prior_28d', v_rate_p));

  -- conversions
  SELECT coalesce(jsonb_agg(jsonb_build_object('kind', a.kind, 'subject', a.subject, 'detail', a.detail, 'opened_at', a.opened_at) ORDER BY a.opened_at), '[]'::jsonb)
    INTO v_tmp FROM public.conversion_alerts a WHERE a.site_id = p_site_id AND a.resolved_at IS NULL;
  v_checks := v_checks || jsonb_build_object('key', 'conversions',
      'status', CASE WHEN jsonb_array_length(v_tmp) > 0 THEN 'warning' ELSE 'ok' END,
      'evidence', jsonb_build_object('open', v_tmp));

  -- signals: every count bounded to 28 days on its time column.
  SELECT jsonb_agg(x.j ORDER BY x.ord) INTO v_signals FROM (
    SELECT 1 AS ord, jsonb_build_object('signal', 'page_views', 'count_7d', count(*) FILTER (WHERE pv.viewed_at >= v_7d),
             'count_28d', count(*), 'last_seen', max(pv.viewed_at)) AS j
      FROM public.page_views pv WHERE pv.site_id = p_site_id AND pv.viewed_at >= v_28d AND pv.viewed_at < p_now
    UNION ALL
    SELECT 1 + k.n, jsonb_build_object('signal', k.signal,
             'count_7d', count(ui.created_at) FILTER (WHERE ui.created_at >= v_7d),
             'count_28d', count(ui.created_at), 'last_seen', max(ui.created_at))
      FROM (VALUES (1, 'clicks_button', 'button_click'), (2, 'clicks_link', 'link_click'), (3, 'clicks_nav', 'nav_navigation')) AS k(n, signal, itype)
      LEFT JOIN (public.user_interactions ui JOIN public.tracking_sessions t ON t.id = ui.session_id AND t.site_id = p_site_id)
        ON ui.interaction_type = k.itype AND ui.created_at >= v_28d AND ui.created_at < p_now
     GROUP BY k.n, k.signal
    UNION ALL
    SELECT 5, jsonb_build_object('signal', 'form_sessions', 'count_7d', count(*) FILTER (WHERE f.started_at >= v_7d),
             'count_28d', count(*), 'last_seen', max(f.started_at))
      FROM public.form_sessions f WHERE f.site_id = p_site_id AND f.started_at >= v_28d AND f.started_at < p_now
    UNION ALL
    SELECT 6, jsonb_build_object('signal', 'consent_choices', 'count_7d', count(*) FILTER (WHERE c.created_at >= v_7d),
             'count_28d', count(*), 'last_seen', max(c.created_at))
      FROM public.cookie_consents c WHERE c.site_id = p_site_id AND c.created_at >= v_28d AND c.created_at < p_now
    UNION ALL
    SELECT 7, jsonb_build_object('signal', 'aggregate_hits',
             'count_7d', coalesce(sum(ap.pageviews) FILTER (WHERE ap.day >= v_7d::date), 0),
             'count_28d', coalesce(sum(ap.pageviews), 0), 'last_seen', max(ap.day)::timestamptz)
      FROM public.aggregate_pages_daily ap WHERE ap.site_id = p_site_id AND ap.day >= v_28d::date AND ap.day <= p_now::date
    UNION ALL
    SELECT 8, jsonb_build_object('signal', 'server_hits', 'count_7d', count(*) FILTER (WHERE b.detected_at >= v_7d),
             'count_28d', count(*), 'last_seen', max(b.detected_at))
      FROM public.ai_bot_traffic b WHERE b.site_id = p_site_id AND b.source <> 'js_tag' AND b.detected_at >= v_28d AND b.detected_at < p_now
    UNION ALL
    SELECT 9, jsonb_build_object('signal', 'link_clicks',
             'count_7d', coalesce(sum(l.click_count) FILTER (WHERE l.day >= v_7d::date), 0),
             'count_28d', coalesce(sum(l.click_count), 0), 'last_seen', max(l.updated_at))
      FROM public.link_click_counts l WHERE l.site_id = p_site_id AND l.day >= v_28d::date AND l.day <= p_now::date
    UNION ALL
    SELECT 10, jsonb_build_object('signal', 'conversions', 'count_7d', count(*) FILTER (WHERE e.created_at >= v_7d),
             'count_28d', count(*), 'last_seen', max(e.created_at))
      FROM public.conversion_events e WHERE e.site_id = p_site_id AND e.created_at >= v_28d AND e.created_at < p_now
  ) x;

  RETURN jsonb_build_object(
    'status', CASE WHEN v_checks @> '[{"status":"broken"}]' THEN 'broken'
                   WHEN v_checks @> '[{"status":"warning"}]' THEN 'warning' ELSE 'ok' END,
    'checked_at', p_now,
    'checks', v_checks,
    'signals', v_signals);
END;
$$;

REVOKE ALL ON FUNCTION public.get_measurement_health(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_measurement_health(uuid, timestamptz) TO authenticated;

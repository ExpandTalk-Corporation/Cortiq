-- supabase/migrations/20261202000005_measurement_coverage_v0.sql
-- Spec 2026-11-18 phase 1 AC8: per-site baseline for the phase 6 coverage dashboard.
-- consented_sessions = tracking_sessions (full/cookieless mode only runs after consent),
-- aggregate_visits = consent-free aggregate visits, server_bot_hits = non-browser AI bot rows,
-- conversions_with_source = conversions whose session has a non-direct source (UTM or external referrer).
-- Service role only (operator report). Run: select * from measurement_coverage_v0(current_date - 30, current_date);
CREATE OR REPLACE FUNCTION public.measurement_coverage_v0(p_from date, p_to date)
RETURNS TABLE (site_id uuid, domain text, consent_rows bigint, consents_analytics bigint, consents_marketing bigint,
               consented_sessions bigint, aggregate_visits bigint, server_bot_hits bigint,
               conversions bigint, conversions_with_source bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.id, s.domain,
    (SELECT count(*) FROM public.cookie_consents c WHERE c.site_id = s.id AND c.created_at >= p_from AND c.created_at < p_to + 1),
    (SELECT count(*) FROM public.cookie_consents c WHERE c.site_id = s.id AND c.created_at >= p_from AND c.created_at < p_to + 1
        AND (c.consent_types->>'analytics')::boolean),
    (SELECT count(*) FROM public.cookie_consents c WHERE c.site_id = s.id AND c.created_at >= p_from AND c.created_at < p_to + 1
        AND (c.consent_types->>'marketing')::boolean),
    (SELECT count(*) FROM public.tracking_sessions t WHERE t.site_id = s.id AND t.started_at >= p_from AND t.started_at < p_to + 1),
    (SELECT coalesce(sum(a.visits), 0) FROM public.aggregate_sources_daily a WHERE a.site_id = s.id AND a.day BETWEEN p_from AND p_to),
    (SELECT count(*) FROM public.ai_bot_traffic b WHERE b.site_id = s.id AND b.source <> 'js_tag'
        AND b.detected_at >= p_from AND b.detected_at < p_to + 1),
    (SELECT count(*) FROM public.conversion_events e WHERE e.site_id = s.id AND e.created_at >= p_from AND e.created_at < p_to + 1),
    (SELECT count(*) FROM public.conversion_events e
       JOIN public.tracking_sessions t ON t.id = e.session_id
       CROSS JOIN LATERAL public.session_source_medium(t.referrer, t.utm_source, t.utm_medium, public._norm_host(s.domain)) sm
      WHERE e.site_id = s.id AND e.created_at >= p_from AND e.created_at < p_to + 1 AND sm.source <> '(direct)')
  FROM public.sites s
  WHERE coalesce(s.is_active, true)
  ORDER BY s.domain
$$;

REVOKE ALL ON FUNCTION public.measurement_coverage_v0(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.measurement_coverage_v0(date, date) TO service_role;

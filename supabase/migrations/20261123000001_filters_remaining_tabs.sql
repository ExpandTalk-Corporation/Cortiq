-- supabase/migrations/20261121000001_filters_remaining_tabs.sql
-- Global dashboard filters (date range, URL path, segment) on the Forms, KPI and Ads (CortIQ
-- source) tabs. Same rules as the overview (20261109000004_tab_filters.sql):
--   path    - the visit viewed a page whose URL path starts with the prefix
--   segment - the visit matches the segment's UTM conditions (or built-in segment)
-- Rows that are not linked to a visit are left out while a path or segment filter is active.
--
-- Not here, on purpose:
--   * Click fraud: get_click_fraud_signals keeps date only. Its signals (reused click ids,
--     bursts per campaign) and the comparison with Google Ads clicks need every paid session;
--     a filtered subset next to unfiltered Ads clicks would read as missing sessions.
--   * Page funnel: get_page_funnel keeps its signature. The funnel's clicks come from
--     heatmap_data, which has no session, so it cannot be segmented. The dashboard passes the
--     global date range, and the URL filter limits the page list (get_top_pages p_path).
--
-- All functions: SECURITY DEFINER (session_matches_filters is not executable by
-- authenticated), caller must own the site, range at most 366 days, authenticated only.

-- ── Forms tab: get_form_stats ─────────────────────────────────────────────────────────
-- form_sessions.session_id is the tracker's text session id. A form belongs to the visit row
-- with that id that was active when the form was completed or abandoned (newest started_at
-- at or before that moment; the session timeout can split one id into several rows).
-- form_sessions rows are only written on completion or abandonment, so starts = both.
CREATE INDEX IF NOT EXISTS idx_form_sessions_site_started ON public.form_sessions(site_id, started_at);
CREATE INDEX IF NOT EXISTS idx_tracking_sessions_site_session_started
  ON public.tracking_sessions(site_id, session_id, started_at DESC);

CREATE OR REPLACE FUNCTION public.get_form_stats(
  p_site_id uuid, p_from date, p_to date,
  p_path    text DEFAULT NULL,
  p_segment jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sites WHERE id = p_site_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from + 1 > 366 THEN
    RAISE EXCEPTION 'invalid range' USING ERRCODE = '22023';
  END IF;

  WITH fs AS (
    SELECT f.form_id, f.form_type, f.completed_at, f.abandoned_at, f.completion_time
    FROM public.form_sessions f
    WHERE f.site_id = p_site_id
      AND f.started_at >= p_from AND f.started_at < p_to + 1
      AND ((p_path IS NULL AND p_segment IS NULL) OR EXISTS (
        SELECT 1 FROM public.tracking_sessions ts
        WHERE ts.id = (
            SELECT v.id FROM public.tracking_sessions v
            WHERE v.site_id = p_site_id AND v.session_id = f.session_id
              AND v.started_at <= coalesce(f.completed_at, f.abandoned_at, f.started_at)
            ORDER BY v.started_at DESC
            LIMIT 1)
          AND public.session_matches_filters(ts, p_path, p_segment)))
  ),
  per_form AS (
    SELECT fs.form_id,
           max(fs.form_type) AS form_type,
           count(*) AS starts,
           count(*) FILTER (WHERE fs.completed_at IS NOT NULL) AS completions,
           count(*) FILTER (WHERE fs.abandoned_at IS NOT NULL AND fs.completed_at IS NULL) AS abandons,
           coalesce(round(avg(fs.completion_time) FILTER (WHERE fs.completed_at IS NOT NULL)), 0)::int AS avg_time
    FROM fs
    GROUP BY fs.form_id
  )
  SELECT jsonb_build_object(
    'total_starts',        (SELECT count(*) FROM fs),
    'total_completions',   (SELECT count(*) FILTER (WHERE completed_at IS NOT NULL) FROM fs),
    'total_abandons',      (SELECT count(*) FILTER (WHERE abandoned_at IS NOT NULL AND completed_at IS NULL) FROM fs),
    'avg_completion_time', (SELECT coalesce(round(avg(completion_time) FILTER (WHERE completed_at IS NOT NULL)), 0)::int FROM fs),
    'forms', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'form_id', p.form_id,
               'form_name', fa.form_name,
               'form_type', coalesce(fa.form_type, p.form_type),
               'starts', p.starts,
               'completions', p.completions,
               'abandons', p.abandons,
               'avg_completion_time', p.avg_time,
               'conversion_rate', CASE WHEN p.starts > 0 THEN round(p.completions * 100.0 / p.starts, 1) ELSE 0 END)
             ORDER BY p.starts DESC, p.form_id)
      FROM per_form p
      LEFT JOIN LATERAL (
        SELECT a.form_name, a.form_type FROM public.form_analytics a
        WHERE a.site_id = p_site_id AND a.form_id = p.form_id
        ORDER BY a.updated_at DESC
        LIMIT 1
      ) fa ON true), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_form_stats(uuid, date, date, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_form_stats(uuid, date, date, text, jsonb) TO authenticated;

-- ── KPI tab first-party fallback: get_kpi_monthly ─────────────────────────────────────
-- Replaces get_kpi_monthly(uuid, date, date) from 20261016000001. The old bundle calls it with
-- named p_site_id/p_from/p_to, which still resolves through the defaults, so the old overload
-- is dropped. The year overload get_kpi_monthly(uuid, int) is untouched.
DROP FUNCTION IF EXISTS public.get_kpi_monthly(uuid, date, date);

CREATE OR REPLACE FUNCTION public.get_kpi_monthly(
  p_site_id uuid, p_from date, p_to date,
  p_path    text DEFAULT NULL,
  p_segment jsonb DEFAULT NULL
)
RETURNS TABLE (
  month        text,
  sessions     bigint,
  unique_users bigint,
  page_views   bigint,
  avg_duration numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sites WHERE id = p_site_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from + 1 > 366 THEN
    RAISE EXCEPTION 'invalid range' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    to_char(ts.started_at AT TIME ZONE 'UTC', 'YYYY-MM') AS month,
    count(*)                                            AS sessions,
    count(DISTINCT ts.session_id)                       AS unique_users,
    coalesce(sum(ts.page_views), 0)::bigint             AS page_views,
    coalesce(avg(ts.duration_seconds), 0)::numeric      AS avg_duration
  FROM public.tracking_sessions ts
  WHERE ts.site_id = p_site_id
    AND ts.started_at >= p_from::timestamp AT TIME ZONE 'UTC'
    AND ts.started_at <  (p_to + 1)::timestamp AT TIME ZONE 'UTC'
    AND ((p_path IS NULL AND p_segment IS NULL) OR public.session_matches_filters(ts, p_path, p_segment))
  GROUP BY 1
  ORDER BY 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_kpi_monthly(uuid, date, date, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_kpi_monthly(uuid, date, date, text, jsonb) TO authenticated;

-- ── Ads tab, CortIQ source: get_paid_ads_summary ──────────────────────────────────────
-- Same numbers the paid-ads-analytics Edge Function computed, counted in the database (the
-- function read sessions through the API, capped at 1,000 rows) and with the filters applied.
-- Paid = utm_medium cpc, ppc, paid-social, display or paid (case-insensitive). Conversions are
-- all conversion events of those visits. The Edge Function stays for browsers on the old bundle.
CREATE OR REPLACE FUNCTION public.get_paid_ads_summary(
  p_site_id uuid, p_from date, p_to date,
  p_path    text DEFAULT NULL,
  p_segment jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sites WHERE id = p_site_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from + 1 > 366 THEN
    RAISE EXCEPTION 'invalid range' USING ERRCODE = '22023';
  END IF;

  WITH s AS (
    SELECT ts.id,
           coalesce(NULLIF(ts.utm_campaign, ''), 'Unknown Campaign') AS campaign,
           coalesce(NULLIF(ts.utm_source, ''), 'Unknown') AS source,
           lower(ts.utm_medium) AS medium,
           ts.started_at,
           coalesce(ts.duration_seconds, 0) AS dur,
           coalesce(ts.page_views, 0) AS pv,
           CASE WHEN ts.device_type IN ('mobile', 'tablet') THEN ts.device_type ELSE 'desktop' END AS device
    FROM public.tracking_sessions ts
    WHERE ts.site_id = p_site_id
      AND ts.started_at >= p_from AND ts.started_at < p_to + 1
      AND lower(ts.utm_medium) IN ('cpc', 'ppc', 'paid-social', 'display', 'paid')
      AND ((p_path IS NULL AND p_segment IS NULL) OR public.session_matches_filters(ts, p_path, p_segment))
  ),
  conv AS (
    SELECT ce.session_id, count(*) AS n, coalesce(sum(ce.event_value), 0) AS value
    FROM public.conversion_events ce
    WHERE ce.site_id = p_site_id AND ce.session_id IN (SELECT id FROM s)
    GROUP BY ce.session_id
  ),
  j AS (
    SELECT s.*, coalesce(c.n, 0) AS conversions, coalesce(c.value, 0) AS revenue
    FROM s LEFT JOIN conv c ON c.session_id = s.id
  ),
  camp AS (
    SELECT campaign,
           (array_agg(source ORDER BY started_at))[1] AS source,
           (array_agg(medium ORDER BY started_at))[1] AS medium,
           count(*) AS sessions, sum(pv) AS page_views, sum(conversions) AS conversions,
           sum(revenue) AS revenue, sum(dur) AS dur,
           count(*) FILTER (WHERE device = 'desktop') AS desktop,
           count(*) FILTER (WHERE device = 'mobile') AS mobile,
           count(*) FILTER (WHERE device = 'tablet') AS tablet
    FROM j GROUP BY campaign
  )
  SELECT jsonb_build_object(
    'summary', (SELECT jsonb_build_object(
        'totalSessions', count(*),
        'totalPageViews', coalesce(sum(pv), 0),
        'totalConversions', coalesce(sum(conversions), 0),
        'totalRevenue', coalesce(sum(revenue), 0),
        'avgDuration', CASE WHEN count(*) > 0 THEN sum(dur)::numeric / count(*) ELSE 0 END,
        'conversionRate', CASE WHEN count(*) > 0 THEN sum(conversions) * 100.0 / count(*) ELSE 0 END)
      FROM j),
    'campaigns', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'campaign', campaign, 'source', source, 'medium', medium,
        'sessions', sessions, 'pageViews', page_views, 'conversions', conversions, 'revenue', revenue,
        'avgDuration', dur::numeric / sessions,
        'conversionRate', conversions * 100.0 / sessions,
        'revenuePerSession', revenue / sessions,
        'devices', jsonb_build_object('desktop', desktop, 'mobile', mobile, 'tablet', tablet))
      ORDER BY sessions DESC, campaign) FROM camp), '[]'::jsonb),
    'sources', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'source', key, 'sessions', sessions, 'conversions', conversions, 'revenue', revenue)
      ORDER BY sessions DESC, key) FROM (
        SELECT source || '/' || medium AS key, count(*) AS sessions,
               sum(conversions) AS conversions, sum(revenue) AS revenue
        FROM j GROUP BY 1) x), '[]'::jsonb),
    'monthly', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'month', month, 'sessions', sessions, 'conversions', conversions, 'revenue', revenue)
      ORDER BY month) FROM (
        SELECT to_char(started_at AT TIME ZONE 'UTC', 'YYYY-MM') AS month, count(*) AS sessions,
               sum(conversions) AS conversions, sum(revenue) AS revenue
        FROM j GROUP BY 1) m), '[]'::jsonb),
    'rawSessions', (SELECT count(*) FROM j)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_paid_ads_summary(uuid, date, date, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_paid_ads_summary(uuid, date, date, text, jsonb) TO authenticated;

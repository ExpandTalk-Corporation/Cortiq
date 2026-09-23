-- Lock down SECURITY DEFINER functions that anon (via the default PUBLIC grant) could
-- execute without any ownership check.
--
-- Why: a 2026-09-23 sweep found ~60 public SECURITY DEFINER functions executable by
-- anon. With the public anon key anyone could read other tenants' data
-- (get_visitor_profile, get_bot_overview, get_gsc_aggregated, ...), write fake data
-- (increment_heatmap_*, upsert_*), or trigger deletes (run_data_retention, cleanup_*).
-- Revoking from anon alone is not enough — anon inherits the PUBLIC grant.
--
-- Caller audit (code grep across this repo and the other apps on this Supabase project,
-- plus 24h of API logs — every RPC call came from service_role):
--   * Edge Functions call RPCs with SUPABASE_SERVICE_ROLE_KEY only.
--   * Cron jobs and triggers run as the function owner and need no EXECUTE grant.
--   * The dashboard (authenticated) calls get_ai_agent_funnel, get_bot_overview,
--     get_gsc_aggregated, get_ip_segment_stats, get_realtime_stats, get_top_pages,
--     get_social_monthly, get_kpi_monthly. The first four get an ownership guard here.
--   * Left untouched: RLS helpers (has_role, is_org_admin, is_org_member) and
--     validate_email (CHECK constraint on video_orders).
--
-- Rollback for a single function, if something turns out to depend on it:
--   GRANT EXECUTE ON FUNCTION public.<name>(<arg types>) TO anon, authenticated;

-- ── 1. Service-role only: ingest, maintenance, cron, Edge-Function-only, unused ──
DO $$
DECLARE r regprocedure;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY (ARRAY[
      'aggregate_campaign_stats','aggregate_daily_stats','aggregate_geo_clusters',
      'aggregate_geolocation_stats','aggregate_tracking_events','calculate_cohort_retention',
      'calculate_engagement_score','calculate_rfm_scores','calculate_web_vitals_aggregates',
      'check_rate_limit','classify_visitor_segments','cleanup_debug_logs',
      'cleanup_expired_recordings','cleanup_old_tracking_data','cleanup_rate_limit_buckets',
      'effective_pipeline_mode','generate_geoheatmap_density','generate_tracking_id',
      'get_ai_search_summary','get_gsc_monthly','get_segment_visitors','get_sentrisk_dashboard',
      'get_site_cookie_summary','get_visitor_profile','increment_heatmap_grid_intensity',
      'increment_heatmap_intensity','increment_navigation_clicks','increment_server_log_analytics',
      'link_session_to_visitor','log_api_usage','log_warehouse_audit','match_bot',
      'match_ip_segment','refresh_analytics_views','resolve_site_by_domain',
      'run_bot_detection_retention','run_data_retention','schedule_warehouse_sync',
      'should_rotate_session','test_warehouse_connection','update_content_performance',
      'update_visitor_metrics','upsert_ai_agent_session','upsert_bot_hourly_stats',
      'upsert_unified_visitor','upsert_user_identity','validate_api_key',
      'validate_consent_for_tracking'])
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r);
  END LOOP;
END $$;

-- ── 2. Trigger functions: nobody needs to call them directly ─────────────────────
DO $$
DECLARE r regprocedure;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY (ARRAY[
      'auto_anonymize_ip','handle_new_user','handle_new_user_organization','set_tracking_id',
      'update_behavioral_updated_at','update_server_log_analytics_updated_at'])
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r);
  END LOOP;
END $$;

-- ── 3. Dashboard reads: authenticated only ───────────────────────────────────────
DO $$
DECLARE r regprocedure;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY (ARRAY[
      'get_kpi_monthly','get_realtime_stats','get_social_monthly','get_top_pages',
      'log_security_event','get_ai_agent_funnel','get_bot_overview','get_gsc_aggregated',
      'get_ip_segment_stats'])
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r);
  END LOOP;
END $$;

-- ── 4. Ownership guards on dashboard reads that had none ─────────────────────────
-- Site-scoped: caller must own the site (same check as the sites RLS policies).

CREATE OR REPLACE FUNCTION public.get_ai_agent_funnel(
  p_site_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone
)
RETURNS TABLE(page_type text, sessions_count bigint, drop_off_rate numeric)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH page_type_stats AS (
    SELECT
      js.page_type,
      COUNT(DISTINCT js.session_id) as sessions_count,
      ROW_NUMBER() OVER (ORDER BY
        CASE js.page_type
          WHEN 'landing' THEN 1
          WHEN 'category' THEN 2
          WHEN 'product' THEN 3
          WHEN 'checkout' THEN 4
          WHEN 'conversion' THEN 5
          ELSE 6
        END
      ) as step_order
    FROM public.ai_agent_journey_steps js
    JOIN public.ai_agent_sessions s ON js.session_id = s.id
    WHERE s.site_id = p_site_id
      AND s.started_at >= p_start_date
      AND s.started_at <= p_end_date
      AND EXISTS (SELECT 1 FROM public.sites o WHERE o.id = p_site_id AND o.user_id = auth.uid())
    GROUP BY js.page_type
  )
  SELECT
    page_type,
    sessions_count,
    ROUND(
      CASE
        WHEN LAG(sessions_count) OVER (ORDER BY step_order) IS NULL THEN 0
        ELSE (1 - sessions_count::NUMERIC / LAG(sessions_count) OVER (ORDER BY step_order)) * 100
      END,
      1
    ) as drop_off_rate
  FROM page_type_stats
  ORDER BY step_order;
$$;

CREATE OR REPLACE FUNCTION public.get_gsc_aggregated(
  p_site_id uuid, p_dimension text, p_limit integer DEFAULT 200
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'value',       value,
        'clicks',      total_clicks,
        'impressions', total_impressions,
        'ctr',         CASE WHEN total_impressions > 0 THEN total_clicks::float / total_impressions ELSE 0 END,
        'position',    avg_position
      )
      ORDER BY total_clicks DESC
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT
      value,
      SUM(clicks)::int                                                  AS total_clicks,
      SUM(impressions)::int                                             AS total_impressions,
      ROUND((SUM(position * clicks) / NULLIF(SUM(clicks), 0))::numeric, 1)::float AS avg_position
    FROM public.gsc_data
    WHERE site_id = p_site_id
      AND dimension = p_dimension
      AND EXISTS (SELECT 1 FROM public.sites o WHERE o.id = p_site_id AND o.user_id = auth.uid())
    GROUP BY value
    ORDER BY SUM(clicks) DESC
    LIMIT p_limit
  ) sub;
$$;

-- Company-scoped: company_id in bot_detections / tracking_events is either the owning
-- user's id or a site id (the dashboard passes selectedSite.id), so accept both.
-- #variable_conflict use_column: the OUT column bot_name clashed with the table column
-- inside the query ("column reference is ambiguous"), so get_bot_overview always failed.

CREATE OR REPLACE FUNCTION public.get_bot_overview(
  p_company_id uuid,
  p_from timestamp with time zone DEFAULT (now() - '30 days'::interval),
  p_to   timestamp with time zone DEFAULT now()
)
RETURNS TABLE(bot_name text, bot_category text, total_requests bigint, last_seen timestamp with time zone,
              top_countries jsonb, top_pages jsonb, avg_confidence numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  IF NOT (p_company_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.sites WHERE id = p_company_id AND user_id = auth.uid())) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    d.bot_name,
    MAX(d.bot_category),
    COUNT(*)::BIGINT                                           AS total_requests,
    MAX(d.detected_at)                                        AS last_seen,
    COALESCE(
      jsonb_agg(
        DISTINCT jsonb_build_object('country', d.country, 'count', country_counts.cnt)
        ORDER BY jsonb_build_object('country', d.country, 'count', country_counts.cnt) DESC
      ) FILTER (WHERE d.country IS NOT NULL),
      '[]'::jsonb
    )                                                          AS top_countries,
    COALESCE(
      (SELECT jsonb_agg(r)
       FROM (
         SELECT jsonb_build_object('url', page_url, 'count', COUNT(*)) AS r
         FROM public.bot_detections bd2
         WHERE bd2.company_id = p_company_id
           AND bd2.bot_name   = d.bot_name
           AND bd2.detected_at BETWEEN p_from AND p_to
           AND bd2.page_url IS NOT NULL
         GROUP BY page_url
         ORDER BY COUNT(*) DESC
         LIMIT 5
       ) sub),
      '[]'::jsonb
    )                                                          AS top_pages,
    ROUND(AVG(d.confidence)::NUMERIC, 2)                      AS avg_confidence
  FROM public.bot_detections d
  LEFT JOIN (
    SELECT bot_name AS bn, country, COUNT(*) AS cnt
    FROM public.bot_detections
    WHERE company_id = p_company_id
      AND detected_at BETWEEN p_from AND p_to
      AND country IS NOT NULL
    GROUP BY bot_name, country
  ) country_counts ON country_counts.bn = d.bot_name
                   AND country_counts.country = d.country
  WHERE d.company_id = p_company_id
    AND d.detected_at BETWEEN p_from AND p_to
  GROUP BY d.bot_name
  ORDER BY total_requests DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_ip_segment_stats(
  p_company_id uuid,
  p_from timestamp with time zone DEFAULT (now() - '30 days'::interval),
  p_to   timestamp with time zone DEFAULT now()
)
RETURNS TABLE(segment_name text, segment_category text, segment_color text, total_events bigint,
              unique_sessions bigint, page_views bigint, conversions bigint, top_pages jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  IF NOT (p_company_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.sites WHERE id = p_company_id AND user_id = auth.uid())) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      te.metadata->>'ip_segment_name'     AS seg_name,
      te.metadata->>'ip_segment_category' AS seg_category,
      te.metadata->>'ip_segment_color'    AS seg_color,
      te.session_id,
      te.event_type,
      te.metadata->>'url'                 AS page_url
    FROM public.tracking_events te
    WHERE te.company_id = p_company_id
      AND te.created_at BETWEEN p_from AND p_to
      AND te.metadata->>'ip_segment_name' IS NOT NULL
  ),
  top AS (
    SELECT
      seg_name,
      jsonb_agg(
        jsonb_build_object('url', page_url, 'views', cnt)
        ORDER BY cnt DESC
      ) AS top_pages
    FROM (
      SELECT seg_name, page_url, COUNT(*) AS cnt
      FROM base
      WHERE event_type = 'view' AND page_url IS NOT NULL
      GROUP BY seg_name, page_url
      ORDER BY cnt DESC
    ) ranked
    GROUP BY seg_name
  )
  SELECT
    b.seg_name,
    MAX(b.seg_category),
    MAX(b.seg_color),
    COUNT(*)::BIGINT                                            AS total_events,
    COUNT(DISTINCT b.session_id)::BIGINT                       AS unique_sessions,
    COUNT(*) FILTER (WHERE b.event_type = 'view')::BIGINT      AS page_views,
    COUNT(*) FILTER (WHERE b.event_type = 'conversion')::BIGINT AS conversions,
    COALESCE(t.top_pages, '[]'::jsonb)
  FROM base b
  LEFT JOIN top t ON t.seg_name = b.seg_name
  GROUP BY b.seg_name, t.top_pages;
END;
$$;

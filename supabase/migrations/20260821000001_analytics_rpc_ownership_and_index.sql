-- Harden the analytics aggregate RPCs before wiring them into the dashboard hooks,
-- and add the missing tracking_sessions hot-path indexes.
--
-- Why: get_analytics_summary / get_realtime_stats / get_top_pages are SECURITY DEFINER
-- and were GRANTed to anon with NO ownership check on p_site_id. Called directly with
-- the public anon key they would leak any site's analytics cross-tenant. We add an
-- auth.uid() ownership guard (matching the existing sites RLS pattern) and revoke anon.
--
-- Indexes: every hot query filters tracking_sessions by (site_id, started_at) or
-- (site_id, last_activity), but only a site_id-only index existed — the time column was
-- filtered/sorted unindexed. page_views already got its composite in 20260706000004.

-- ── get_analytics_summary ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_analytics_summary(
  p_site_id  uuid,
  p_from     timestamptz,
  p_to       timestamptz
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
  -- Ownership guard: caller must own the site (same check as the sites RLS policies).
  IF NOT EXISTS (
    SELECT 1 FROM public.sites WHERE id = p_site_id AND user_id = auth.uid()
  ) THEN
    RETURN '{}'::jsonb;
  END IF;

  SELECT jsonb_build_object(
    'total_page_views',       pv.total,
    'total_sessions',         s.total,
    'engaged_sessions',       s.engaged,
    'avg_session_duration',   COALESCE(s.avg_duration, 0),
    'avg_engagement_time',    COALESCE(s.avg_engaged_duration, 0),
    'top_pages',              pv.top_pages,
    'device_breakdown',       s.device_breakdown
  )
  INTO v_result
  FROM (
    SELECT
      COUNT(*)                                                         AS total,
      jsonb_agg(
        jsonb_build_object('url', url, 'views', cnt) ORDER BY cnt DESC
      ) FILTER (WHERE rn <= 10)                                        AS top_pages
    FROM (
      SELECT
        url,
        COUNT(*) AS cnt,
        ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC) AS rn
      FROM public.page_views
      WHERE site_id = p_site_id
        AND viewed_at BETWEEN p_from AND p_to
        AND url NOT LIKE '%wp-admin%'
        AND url NOT LIKE '%wp-login%'
        AND url NOT LIKE '%elementor-preview%'
        AND url NOT LIKE '%elementor=%'
        AND url NOT LIKE '%preview=true%'
      GROUP BY url
    ) sub
  ) pv,
  (
    SELECT
      COUNT(*)                                                                       AS total,
      COUNT(*) FILTER (
        WHERE duration_seconds > 10 OR page_views > 1
      )                                                                              AS engaged,
      AVG(duration_seconds)                                                          AS avg_duration,
      AVG(duration_seconds) FILTER (
        WHERE duration_seconds > 10 OR page_views > 1
      )                                                                              AS avg_engaged_duration,
      jsonb_object_agg(
        COALESCE(device_type, 'unknown'),
        cnt
      )                                                                              AS device_breakdown
    FROM (
      SELECT device_type, duration_seconds, page_views,
             COUNT(*) OVER (PARTITION BY COALESCE(device_type, 'unknown')) AS cnt
      FROM public.tracking_sessions
      WHERE site_id = p_site_id
        AND started_at BETWEEN p_from AND p_to
    ) sub
  ) s;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

-- ── get_realtime_stats ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_realtime_stats(
  p_site_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_today_start  timestamptz := date_trunc('day', now() AT TIME ZONE 'UTC');
  v_active_since timestamptz := now() - interval '5 minutes';
  v_result       jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.sites WHERE id = p_site_id AND user_id = auth.uid()
  ) THEN
    RETURN '{}'::jsonb;
  END IF;

  SELECT jsonb_build_object(
    'active_visitors',   act.cnt,
    'page_views_today',  pv.cnt,
    'top_page',          pv.top_page,
    'device_breakdown',  s.device_breakdown
  )
  INTO v_result
  FROM (
    SELECT COUNT(*) AS cnt
    FROM public.tracking_sessions
    WHERE site_id = p_site_id
      AND last_activity >= v_active_since
  ) act,
  (
    SELECT
      COUNT(*)                                                       AS cnt,
      (SELECT jsonb_build_object('url', url, 'views', COUNT(*))
       FROM public.page_views
       WHERE site_id = p_site_id AND viewed_at >= v_today_start
       GROUP BY url ORDER BY COUNT(*) DESC LIMIT 1)                 AS top_page
    FROM public.page_views
    WHERE site_id = p_site_id
      AND viewed_at >= v_today_start
  ) pv,
  (
    SELECT jsonb_object_agg(device, cnt) AS device_breakdown
    FROM (
      SELECT COALESCE(lower(device_type), 'desktop') AS device, COUNT(*) AS cnt
      FROM public.tracking_sessions
      WHERE site_id = p_site_id
        AND started_at >= v_today_start
      GROUP BY COALESCE(lower(device_type), 'desktop')
    ) sub
  ) s;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

-- ── get_top_pages (converted to plpgsql for the ownership guard) ───────────────
CREATE OR REPLACE FUNCTION public.get_top_pages(
  p_site_id uuid,
  p_limit   int DEFAULT 20
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
  IF NOT EXISTS (
    SELECT 1 FROM public.sites WHERE id = p_site_id AND user_id = auth.uid()
  ) THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('url', url, 'pageViews', cnt)
      ORDER BY cnt DESC
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM (
    SELECT url, COUNT(*) AS cnt
    FROM public.page_views
    WHERE site_id = p_site_id
      AND url NOT LIKE '%wp-admin%'
      AND url NOT LIKE '%wp-login%'
      AND url NOT LIKE '%elementor-preview%'
      AND url NOT LIKE '%preview=true%'
    GROUP BY url
    ORDER BY cnt DESC
    LIMIT p_limit
  ) sub;

  RETURN v_result;
END;
$$;

-- Lock these down to logged-in users only — the dashboard always calls them
-- authenticated, and the ownership guard needs a real auth.uid().
REVOKE EXECUTE ON FUNCTION public.get_analytics_summary(uuid, timestamptz, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_realtime_stats(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_top_pages(uuid, int) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_analytics_summary(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_realtime_stats(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_top_pages(uuid, int) TO authenticated;

-- ── Hot-path indexes on tracking_sessions ─────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tracking_sessions_site_started
  ON public.tracking_sessions (site_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_tracking_sessions_site_activity
  ON public.tracking_sessions (site_id, last_activity DESC);

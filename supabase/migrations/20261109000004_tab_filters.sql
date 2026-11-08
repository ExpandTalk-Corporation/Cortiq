-- supabase/migrations/20261109000004_tab_filters.sql
-- The dashboard's Website URL and segment filters, applied beyond the overview:
-- Analytics, Geolocation, Campaigns, Navigation and Social media.
-- One rule for "does this visit match the filter", used by every RPC including the overview:
--   segment  all conditions must hold; UTM conditions or a built-in segment (builtin_segment_match)
--   URL      the visit viewed at least one page whose path starts with the filter path
-- New optional parameters change the signatures, so the old functions are dropped first.

CREATE OR REPLACE FUNCTION public.path_like_prefix(p_path text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  -- Literal prefix match: escape LIKE metacharacters.
  SELECT CASE WHEN p_path IS NULL THEN NULL
         ELSE replace(replace(replace(p_path, '\', '\\'), '%', '\%'), '_', '\_') || '%' END
$$;

CREATE OR REPLACE FUNCTION public.session_matches_filters(
  p_session public.tracking_sessions, p_path text, p_segment jsonb
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT (p_segment IS NULL OR NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(p_segment) f
            WHERE NOT COALESCE(CASE WHEN f->>'field' = 'builtin'
              THEN public.builtin_segment_match(f->>'value', p_session.device_type, p_session.referrer,
                                                p_session.utm_source, p_session.utm_medium)
              ELSE (
              WITH c AS (SELECT CASE f->>'field'
                           WHEN 'utm_source'   THEN p_session.utm_source
                           WHEN 'utm_medium'   THEN p_session.utm_medium
                           WHEN 'utm_campaign' THEN p_session.utm_campaign
                           WHEN 'utm_content'  THEN p_session.utm_content
                           WHEN 'utm_term'     THEN p_session.utm_term END AS col,
                         replace(replace(replace(f->>'value', '\', '\\'), '%', '\%'), '_', '\_') AS v)
              SELECT CASE f->>'op'
                       WHEN 'eq'          THEN lower(c.col) = lower(f->>'value')
                       WHEN 'contains'    THEN c.col ILIKE '%' || c.v || '%'
                       WHEN 'starts_with' THEN c.col ILIKE c.v || '%'
                       ELSE false END
              FROM c) END, false)))
     AND (p_path IS NULL OR EXISTS (
            SELECT 1 FROM public.page_views pv
            WHERE pv.session_id = p_session.id
              AND regexp_replace(pv.url, '^https?://[^/]+', '') LIKE public.path_like_prefix(p_path)))
$$;

REVOKE EXECUTE ON FUNCTION public.session_matches_filters(public.tracking_sessions, text, jsonb) FROM PUBLIC, anon, authenticated;

-- Overview: same behaviour, now through the shared rule.
CREATE OR REPLACE FUNCTION public.get_overview_metrics(
  p_site_id uuid, p_from date, p_to date, p_path text DEFAULT NULL, p_segment jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_days     int := p_to - p_from + 1;
  v_prev     date := p_from - (p_to - p_from + 1);
  v_like     text;
  v_result   jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sites WHERE id = p_site_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR v_days > 366 THEN
    RAISE EXCEPTION 'invalid range' USING ERRCODE = '22023';
  END IF;
  -- Literal prefix match: escape LIKE metacharacters.
  v_like := CASE WHEN p_path IS NULL THEN NULL
            ELSE replace(replace(replace(p_path, '\', '\\'), '%', '\%'), '_', '\_') || '%' END;

  WITH
  sess AS (
    SELECT ts.id, ts.started_at::date AS d
    FROM public.tracking_sessions ts
    WHERE ts.site_id = p_site_id
      AND ts.started_at >= v_prev AND ts.started_at < p_to + 1
      AND ((p_path IS NULL AND p_segment IS NULL) OR public.session_matches_filters(ts, p_path, p_segment))
  ),
  pvs AS (
    SELECT pv.viewed_at::date AS d
    FROM public.page_views pv
    WHERE pv.site_id = p_site_id
      AND pv.viewed_at >= v_prev AND pv.viewed_at < p_to + 1
      AND pv.url NOT LIKE '%wp-admin%' AND pv.url NOT LIKE '%wp-login%'
      AND pv.url NOT LIKE '%elementor-preview%' AND pv.url NOT LIKE '%elementor=%'
      AND pv.url NOT LIKE '%preview=true%'
      AND (v_like IS NULL OR regexp_replace(pv.url, '^https?://[^/]+', '') LIKE v_like)
      AND (p_segment IS NULL OR pv.session_id IN (SELECT id FROM sess))
  ),
  conv AS (
    SELECT ce.created_at::date AS d
    FROM public.conversion_events ce
    WHERE ce.site_id = p_site_id
      AND ce.created_at >= v_prev AND ce.created_at < p_to + 1
      AND ((p_segment IS NULL AND v_like IS NULL) OR ce.session_id IN (SELECT id FROM sess))
  ),
  ai AS (
    SELECT a.detected_at::date AS d,
           -- 'unknown' and unclassified rows count in the AI total only, never as a category.
           CASE WHEN a.request_type IN ('training', 'agentic', 'citation') THEN a.request_type ELSE 'other' END AS cat
    FROM public.ai_bot_traffic a
    WHERE a.site_id = p_site_id
      AND a.detected_at >= v_prev AND a.detected_at < p_to + 1
      AND (v_like IS NULL OR regexp_replace(a.url, '^https?://[^/]+', '') LIKE v_like)
  ),
  -- One aggregate per source and day (at most 2 x 366 rows each); totals and the daily
  -- series read these small sets instead of rescanning the raw rows per day.
  per_day AS (
    SELECT d, sum(visits) AS visits, sum(page_views) AS page_views, sum(conversions) AS conversions,
           sum(ai) AS ai, sum(training) AS training, sum(agentic) AS agentic, sum(citation) AS citation
    FROM (
      SELECT d, count(*) AS visits, 0 AS page_views, 0 AS conversions, 0 AS ai, 0 AS training, 0 AS agentic, 0 AS citation
        FROM sess GROUP BY d
      UNION ALL SELECT d, 0, count(*), 0, 0, 0, 0, 0 FROM pvs  GROUP BY d
      UNION ALL SELECT d, 0, 0, count(*), 0, 0, 0, 0 FROM conv GROUP BY d
      UNION ALL SELECT d, 0, 0, 0, count(*),
                       count(*) FILTER (WHERE cat = 'training'),
                       count(*) FILTER (WHERE cat = 'agentic'),
                       count(*) FILTER (WHERE cat = 'citation')
        FROM ai GROUP BY d
    ) u
    GROUP BY d
  ),
  totals AS (
    SELECT p.period,
      jsonb_build_object(
        'visits',      COALESCE(sum(pd.visits), 0),
        'pageViews',   COALESCE(sum(pd.page_views), 0),
        'conversions', COALESCE(sum(pd.conversions), 0),
        'ai', jsonb_build_object(
          'total',    COALESCE(sum(pd.ai), 0),
          'training', COALESCE(sum(pd.training), 0),
          'agentic',  COALESCE(sum(pd.agentic), 0),
          'citation', COALESCE(sum(pd.citation), 0))
      ) AS obj
    FROM (VALUES ('current', p_from, p_to), ('previous', v_prev, p_from - 1)) AS p(period, lo, hi)
    LEFT JOIN per_day pd ON pd.d BETWEEN p.lo AND p.hi
    GROUP BY p.period
  ),
  days AS (SELECT g::date AS d FROM generate_series(p_from, p_to, interval '1 day') g)
  SELECT jsonb_build_object(
    'current',  (SELECT obj FROM totals WHERE period = 'current'),
    'previous', (SELECT obj FROM totals WHERE period = 'previous'),
    'daily', (SELECT jsonb_agg(jsonb_build_object(
                'date',        to_char(days.d, 'YYYY-MM-DD'),
                'visits',      COALESCE(pd.visits, 0),
                'pageViews',   COALESCE(pd.page_views, 0),
                'conversions', COALESCE(pd.conversions, 0),
                'ai',          COALESCE(pd.ai, 0)) ORDER BY days.d)
              FROM days LEFT JOIN per_day pd ON pd.d = days.d),
    'lastPageViewAt',  (SELECT max(viewed_at) FROM public.page_views WHERE site_id = p_site_id),
    'lastServerHitAt', (SELECT max(detected_at) FROM public.ai_bot_traffic
                        WHERE site_id = p_site_id AND source = 'server_log'),
    'serverHits',      (SELECT count(*) FROM public.ai_bot_traffic
                        WHERE site_id = p_site_id AND source = 'server_log'
                          AND detected_at >= p_from AND detected_at < p_to + 1)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

DROP FUNCTION IF EXISTS public.get_geo_breakdown(uuid, date, date);
CREATE OR REPLACE FUNCTION public.get_geo_breakdown(p_site_id uuid, p_from date, p_to date, p_path text DEFAULT NULL, p_segment jsonb DEFAULT NULL)
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

  WITH sess AS (
    SELECT ts.id, ts.country_code, coalesce(ts.page_views, 0) AS pv, coalesce(ts.duration_seconds, 0) AS dur
    FROM public.tracking_sessions ts
    WHERE ts.site_id = p_site_id
      AND ts.started_at >= p_from AND ts.started_at < p_to + 1
      AND ((p_path IS NULL AND p_segment IS NULL) OR public.session_matches_filters(ts, p_path, p_segment))
  ),
  conv AS (
    SELECT DISTINCT ce.session_id
    FROM public.conversion_events ce
    WHERE ce.site_id = p_site_id
      AND ce.created_at >= p_from AND ce.created_at < p_to + 1
  ),
  agg AS (
    SELECT s.country_code,
           count(*)                                                  AS sessions,
           sum(s.pv)                                                 AS page_views,
           round(100.0 * count(*) FILTER (WHERE s.pv <= 1) / count(*), 1) AS bounce_rate,
           round(avg(s.dur))                                         AS avg_duration,
           count(c.session_id)                                       AS conversions
    FROM sess s
    LEFT JOIN conv c ON c.session_id = s.id
    GROUP BY s.country_code
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'country_code', country_code,
           'sessions',     sessions,
           'page_views',   page_views,
           'bounce_rate',  bounce_rate,
           'avg_duration', avg_duration,
           'conversions',  conversions
         ) ORDER BY country_code IS NULL, sessions DESC, country_code), '[]'::jsonb)
  INTO v_result
  FROM agg;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_geo_breakdown(uuid, date, date, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_geo_breakdown(uuid, date, date, text, jsonb) TO authenticated;

DROP FUNCTION IF EXISTS public.get_campaign_breakdown(uuid, date, date);
CREATE OR REPLACE FUNCTION public.get_campaign_breakdown(p_site_id uuid, p_from date, p_to date, p_path text DEFAULT NULL, p_segment jsonb DEFAULT NULL)
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

  WITH sess AS (
    SELECT ts.id, lower(ts.utm_source) AS src, lower(ts.utm_medium) AS med, ts.utm_campaign AS camp,
           coalesce(ts.page_views, 0) AS pv
    FROM public.tracking_sessions ts
    WHERE ts.site_id = p_site_id
      AND ts.started_at >= p_from AND ts.started_at < p_to + 1
      AND ((p_path IS NULL AND p_segment IS NULL) OR public.session_matches_filters(ts, p_path, p_segment))
  ),
  conv AS (
    SELECT DISTINCT ce.session_id
    FROM public.conversion_events ce
    WHERE ce.site_id = p_site_id
      AND ce.created_at >= p_from AND ce.created_at < p_to + 1
  ),
  agg AS (
    SELECT s.src, s.med, s.camp, count(*) AS sessions, sum(s.pv) AS page_views, count(c.session_id) AS conversions
    FROM sess s
    LEFT JOIN conv c ON c.session_id = s.id
    WHERE s.src IS NOT NULL OR s.med IS NOT NULL OR s.camp IS NOT NULL
    GROUP BY s.src, s.med, s.camp
  )
  SELECT jsonb_build_object(
    'total_sessions',  (SELECT count(*) FROM sess),
    'tagged_sessions', (SELECT coalesce(sum(sessions), 0) FROM agg),
    'campaigns', coalesce((SELECT jsonb_agg(jsonb_build_object(
                   'utm_source',   src,
                   'utm_medium',   med,
                   'utm_campaign', camp,
                   'sessions',     sessions,
                   'page_views',   page_views,
                   'conversions',  conversions
                 ) ORDER BY sessions DESC, src, med, camp) FROM agg), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_campaign_breakdown(uuid, date, date, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_campaign_breakdown(uuid, date, date, text, jsonb) TO authenticated;

DROP FUNCTION IF EXISTS public.get_social_daily(uuid, date, date);
CREATE OR REPLACE FUNCTION public.get_social_daily(p_site_id uuid, p_from date, p_to date, p_path text DEFAULT NULL, p_segment jsonb DEFAULT NULL)
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

  WITH social AS (
    SELECT
      to_char(ts.started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')                              AS day,
      lower(split_part(regexp_replace(coalesce(ts.referrer, ''), '^[a-zA-Z]+://', ''), '/', 1)) AS referrer,
      coalesce(ts.utm_source, '')   AS utm_source,
      coalesce(ts.utm_medium, '')   AS utm_medium,
      coalesce(ts.utm_campaign, '') AS utm_campaign,
      ts.session_id,
      coalesce(ts.page_views, 0)       AS pv,
      coalesce(ts.duration_seconds, 0) AS dur
    FROM public.tracking_sessions ts
    WHERE ts.site_id = p_site_id
      AND ts.started_at >= p_from::timestamp AT TIME ZONE 'UTC'
      AND ts.started_at <  (p_to + 1)::timestamp AT TIME ZONE 'UTC'
      AND ((p_path IS NULL AND p_segment IS NULL) OR public.session_matches_filters(ts, p_path, p_segment))
      AND (
        ts.referrer   ILIKE '%facebook%'  OR ts.referrer   ILIKE '%instagram%' OR
        ts.referrer   ILIKE '%linkedin%'  OR ts.referrer   ILIKE '%twitter%'   OR
        ts.referrer   ILIKE '%tiktok%'    OR ts.referrer   ILIKE '%youtube%'   OR
        ts.referrer   ILIKE '%pinterest%' OR ts.referrer   ILIKE '%reddit%'    OR
        ts.referrer   ILIKE '%lnkd.in%'   OR ts.referrer   ILIKE '%t.co/%'     OR
        ts.referrer   ILIKE '%x.com%'     OR ts.referrer   ILIKE '%youtu.be%'  OR
        ts.referrer   ILIKE '%fb.com%'    OR ts.referrer   ILIKE '%redd.it%'   OR
        ts.referrer   ILIKE '%pin.it%'    OR
        ts.utm_source ILIKE '%facebook%'  OR ts.utm_source ILIKE '%instagram%' OR
        ts.utm_source ILIKE '%linkedin%'  OR ts.utm_source ILIKE '%twitter%'   OR
        ts.utm_source ILIKE '%tiktok%'    OR ts.utm_source ILIKE '%youtube%'   OR
        ts.utm_source ILIKE '%pinterest%' OR ts.utm_source ILIKE '%reddit%'    OR
        ts.utm_source ILIKE '%fb'         OR ts.utm_source ILIKE '%ig'         OR
        ts.utm_source = 'x'
      )
  ),
  agg AS (
    SELECT day, referrer, utm_source, utm_medium, utm_campaign,
           count(*)                            AS sessions,
           count(DISTINCT session_id)          AS unique_users,
           sum(pv)                             AS page_views,
           round(avg(dur), 1)                  AS avg_duration,
           count(*) FILTER (WHERE pv <= 1)     AS bounces
    FROM social
    GROUP BY day, referrer, utm_source, utm_medium, utm_campaign
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'day', day, 'referrer', referrer, 'utm_source', utm_source,
           'utm_medium', utm_medium, 'utm_campaign', utm_campaign,
           'sessions', sessions, 'unique_users', unique_users, 'page_views', page_views,
           'avg_duration', avg_duration, 'bounces', bounces
         ) ORDER BY day, sessions DESC), '[]'::jsonb)
  INTO v_result
  FROM agg;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_social_daily(uuid, date, date, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_social_daily(uuid, date, date, text, jsonb) TO authenticated;

DROP FUNCTION IF EXISTS public.get_navigation_flow(uuid, date, date);
CREATE OR REPLACE FUNCTION public.get_navigation_flow(p_site_id uuid, p_from date, p_to date, p_path text DEFAULT NULL, p_segment jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
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

  WITH pv AS (
    SELECT pv.session_id, pv.viewed_at,
           coalesce(nullif(regexp_replace(split_part(split_part(pv.url, '#', 1), '?', 1), '^https?://[^/]+', ''), ''), '/') AS path
    FROM public.page_views pv
    WHERE pv.site_id = p_site_id
      AND pv.session_id IS NOT NULL
      AND pv.viewed_at >= p_from AND pv.viewed_at < p_to + 1
      AND pv.url NOT LIKE '%wp-admin%' AND pv.url NOT LIKE '%wp-login%'
      AND pv.url NOT LIKE '%elementor-preview%' AND pv.url NOT LIKE '%preview=true%'
      AND ((p_path IS NULL AND p_segment IS NULL) OR EXISTS (
        SELECT 1 FROM public.tracking_sessions ts
        WHERE ts.id = pv.session_id AND public.session_matches_filters(ts, p_path, p_segment)))
  ),
  ordered AS (
    SELECT session_id, path, viewed_at,
           lag(path) OVER (PARTITION BY session_id ORDER BY viewed_at) AS prev_path
    FROM pv
  ),
  steps AS (   -- drop reloads of the same path
    SELECT session_id, path, viewed_at FROM ordered WHERE prev_path IS DISTINCT FROM path
  ),
  seq AS (
    SELECT session_id, path,
           lag(path)  OVER w AS from_path,
           row_number() OVER w AS n,
           count(*)   OVER (PARTITION BY session_id) AS total
    FROM steps
    WINDOW w AS (PARTITION BY session_id ORDER BY viewed_at)
  ),
  transitions AS (
    SELECT from_path, path AS to_path, count(*) AS cnt
    FROM seq WHERE from_path IS NOT NULL
    GROUP BY from_path, path ORDER BY cnt DESC, from_path, path LIMIT 50
  ),
  entries AS (
    SELECT path, count(*) AS cnt FROM seq WHERE n = 1 GROUP BY path ORDER BY cnt DESC, path LIMIT 20
  ),
  exits AS (
    SELECT path, count(*) AS cnt FROM seq WHERE n = total AND total > 1 GROUP BY path ORDER BY cnt DESC, path LIMIT 20
  )
  SELECT jsonb_build_object(
    'sessions',            (SELECT count(DISTINCT session_id) FROM seq),
    'multi_page_sessions', (SELECT count(DISTINCT session_id) FROM seq WHERE total > 1),
    'transitions', coalesce((SELECT jsonb_agg(jsonb_build_object('from', from_path, 'to', to_path, 'count', cnt)) FROM transitions), '[]'::jsonb),
    'entries',     coalesce((SELECT jsonb_agg(jsonb_build_object('path', path, 'sessions', cnt)) FROM entries), '[]'::jsonb),
    'exits',       coalesce((SELECT jsonb_agg(jsonb_build_object('path', path, 'sessions', cnt)) FROM exits), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_navigation_flow(uuid, date, date, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_navigation_flow(uuid, date, date, text, jsonb) TO authenticated;

DROP FUNCTION IF EXISTS public.get_analytics_summary(uuid, timestamptz, timestamptz);
CREATE OR REPLACE FUNCTION public.get_analytics_summary(
  p_site_id  uuid,
  p_from     timestamptz,
  p_to       timestamptz,
  p_path     text DEFAULT NULL,
  p_segment  jsonb DEFAULT NULL
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
      COALESCE(SUM(cnt), 0)                                              AS total,
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
        AND (p_path IS NULL OR regexp_replace(url, '^https?://[^/]+', '') LIKE public.path_like_prefix(p_path))
        AND (p_segment IS NULL OR EXISTS (
          SELECT 1 FROM public.tracking_sessions ts
          WHERE ts.id = page_views.session_id AND public.session_matches_filters(ts, NULL, p_segment)))
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
      FROM public.tracking_sessions ts
      WHERE ts.site_id = p_site_id
        AND ts.started_at BETWEEN p_from AND p_to
        AND ((p_path IS NULL AND p_segment IS NULL) OR public.session_matches_filters(ts, p_path, p_segment))
    ) sub
  ) s;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_analytics_summary(uuid, timestamptz, timestamptz, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_analytics_summary(uuid, timestamptz, timestamptz, text, jsonb) TO authenticated;

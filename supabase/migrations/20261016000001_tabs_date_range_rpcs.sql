-- supabase/migrations/20261016000001_tabs_date_range_rpcs.sql
-- Date-range variants of dashboard RPCs that only took a day count or a calendar year, so
-- the AI Agents, KPI and Social Media tabs can follow the global date filter
-- (inclusive p_from..p_to as UTC days, max 366 days). The original signatures are left
-- untouched and keep working for existing callers.
--
-- All three are SECURITY DEFINER with the get_geo_breakdown ownership guard: the caller
-- must own the site, otherwise 42501.

-- ── AI Agents tab: get_ai_bot_tracking(uuid, date, date) ─────────────────────────────
-- Same payload as get_ai_bot_tracking(uuid, int); bounded on both ends instead of
-- "last N days from now".
CREATE OR REPLACE FUNCTION public.get_ai_bot_tracking(p_site_id uuid, p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_start           timestamptz;
  v_end             timestamptz;
  total             bigint;
  citation_requests bigint;
  citation_clicks   bigint;
  training          bigint;
  bot_breakdown     jsonb;
  daily             jsonb;
  top_urls          jsonb;
  -- mirrors ASSET_URL_RE in useAIBotTracking.tsx
  asset_re constant text := '(?i)\.(css|js|mjs|png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|eot|otf|json|xml|txt|pdf|map)(\?|$)';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sites WHERE id = p_site_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from + 1 > 366 THEN
    RAISE EXCEPTION 'invalid range' USING ERRCODE = '22023';
  END IF;
  v_start := p_from::timestamp AT TIME ZONE 'UTC';
  v_end   := (p_to + 1)::timestamp AT TIME ZONE 'UTC';

  SELECT count(*), count(*) FILTER (WHERE request_type = 'training') INTO total, training
    FROM public.ai_bot_traffic
    WHERE site_id = p_site_id AND detected_at >= v_start AND detected_at < v_end;

  SELECT count(*), count(*) FILTER (WHERE clicked) INTO citation_requests, citation_clicks
    FROM public.ai_citations
    WHERE site_id = p_site_id AND created_at >= v_start AND created_at < v_end;

  SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY b.count DESC), '[]'::jsonb) INTO bot_breakdown
  FROM (
    SELECT
      coalesce(bot_name, bot_type) AS name,
      count(*)                     AS count,
      (array_agg(request_type ORDER BY detected_at DESC))[1] AS category,
      CASE WHEN total > 0 THEN count(*)::float * 100 / total ELSE 0 END AS percentage
    FROM public.ai_bot_traffic
    WHERE site_id = p_site_id AND detected_at >= v_start AND detected_at < v_end
    GROUP BY coalesce(bot_name, bot_type)
  ) b;

  SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.date), '[]'::jsonb) INTO daily
  FROM (
    SELECT to_char(detected_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date, count(*) AS traffic
    FROM public.ai_bot_traffic
    WHERE site_id = p_site_id AND detected_at >= v_start AND detected_at < v_end
    GROUP BY 1
  ) d;

  SELECT coalesce(jsonb_agg(to_jsonb(u) ORDER BY u.visits DESC), '[]'::jsonb) INTO top_urls
  FROM (
    SELECT url, count(*) AS visits
    FROM public.ai_bot_traffic
    WHERE site_id = p_site_id AND detected_at >= v_start AND detected_at < v_end
      AND url IS NOT NULL AND url !~ asset_re
    GROUP BY url
    ORDER BY count(*) DESC
    LIMIT 10
  ) u;

  RETURN jsonb_build_object(
    'totalTraffic',     total,
    'citationRequests', citation_requests,
    'trainingCrawlers', training,
    'citationCtr',      CASE WHEN citation_requests > 0 THEN citation_clicks::float * 100 / citation_requests ELSE 0 END,
    'botBreakdown',     bot_breakdown,
    'dailyTrend',       daily,
    'topUrls',          top_urls
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_ai_bot_tracking(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ai_bot_tracking(uuid, date, date) TO authenticated;

-- ── KPI tab first-party fallback: get_kpi_monthly(uuid, date, date) ───────────────────
-- Per calendar month inside the range. month is 'YYYY-MM' here (the year variant returns
-- 'MM'), because a range can cross a year boundary. Replaces the raw tracking_sessions
-- fetch in useKPIDashboard, which was capped at the API row limit.
CREATE OR REPLACE FUNCTION public.get_kpi_monthly(p_site_id uuid, p_from date, p_to date)
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
  GROUP BY 1
  ORDER BY 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_kpi_monthly(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_kpi_monthly(uuid, date, date) TO authenticated;

-- ── Social Media tab: get_social_daily(uuid, date, date) ─────────────────────────────
-- Social sessions per UTC day, referrer host and UTM tags. Returned as one jsonb array
-- (not SETOF) so a long range is not truncated by the API row limit. The referrer is
-- reduced to its host: platform detection only needs the domain, and it keeps the
-- number of groups small.
CREATE OR REPLACE FUNCTION public.get_social_daily(p_site_id uuid, p_from date, p_to date)
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

REVOKE EXECUTE ON FUNCTION public.get_social_daily(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_social_daily(uuid, date, date) TO authenticated;

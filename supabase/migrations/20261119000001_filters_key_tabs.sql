-- supabase/migrations/20261119000001_filters_key_tabs.sql
-- Global dashboard filters (date range, page path, segment) on the key tabs.
-- Same semantics as get_overview_metrics (20261109000004_tab_filters.sql):
--   path    → URL without scheme/host LIKE public.path_like_prefix(p_path)
--   segment → the row's session matches public.session_matches_filters(ts, NULL, p_segment)
-- Rows without a session (heatmap_data, bot traffic) cannot be segmented; those RPCs take a
-- path only and the dashboard says so in FilterScopeNotice.
-- All functions: SECURITY DEFINER (session_matches_filters is not executable by
-- authenticated), caller must own the site, range at most 366 days, authenticated only.

-- ── Pages tab: get_top_pages ─────────────────────────────────────────────────────────
-- Same signature as 20261114000001; adds the editor/preview exclusions the overview uses.
CREATE OR REPLACE FUNCTION public.get_top_pages(
  p_site_id uuid, p_from date, p_to date, p_limit int DEFAULT 10,
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

  WITH pv AS (
    SELECT pv.url, pv.title
    FROM public.page_views pv
    WHERE pv.site_id = p_site_id
      AND pv.viewed_at >= p_from AND pv.viewed_at < p_to + 1
      AND pv.url NOT LIKE '%wp-admin%' AND pv.url NOT LIKE '%wp-login%'
      AND pv.url NOT LIKE '%elementor-preview%' AND pv.url NOT LIKE '%elementor=%'
      AND pv.url NOT LIKE '%preview=true%'
      AND (p_path IS NULL OR regexp_replace(pv.url, '^https?://[^/]+', '') LIKE public.path_like_prefix(p_path))
      AND (p_segment IS NULL OR EXISTS (
        SELECT 1 FROM public.tracking_sessions ts
        WHERE ts.id = pv.session_id AND public.session_matches_filters(ts, NULL, p_segment)))
  ),
  grouped AS (
    SELECT url, max(title) FILTER (WHERE title IS NOT NULL AND title <> '') AS title, count(*) AS views
    FROM pv
    GROUP BY url
    ORDER BY views DESC, url
    LIMIT greatest(1, least(coalesce(p_limit, 10), 500))
  )
  SELECT jsonb_build_object(
    'total_views', (SELECT count(*) FROM pv),
    'pages', coalesce((SELECT jsonb_agg(jsonb_build_object('url', url, 'title', title, 'views', views)
                                        ORDER BY views DESC, url) FROM grouped), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_top_pages(uuid, date, date, int, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_top_pages(uuid, date, date, int, text, jsonb) TO authenticated;

-- ── Content tab: get_content_pages + path + segment ──────────────────────────────────
-- A segment keeps whole visits that match it. The path filter limits which pages are
-- listed and counted, while entry/exit/time still come from the full visit (so a filtered
-- page that was the second view is not reported as an entry). Scroll rows carry no session:
-- with a segment active the scroll columns are left out (has_scroll = false).
DROP FUNCTION IF EXISTS public.get_content_pages(uuid, date, date, int);

CREATE OR REPLACE FUNCTION public.get_content_pages(
  p_site_id uuid, p_from date, p_to date, p_limit int DEFAULT 100,
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
  v_like   text := CASE WHEN p_path IS NULL THEN NULL ELSE public.path_like_prefix(p_path) END;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sites WHERE id = p_site_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from + 1 > 366 THEN
    RAISE EXCEPTION 'invalid range' USING ERRCODE = '22023';
  END IF;

  WITH pv AS (
    SELECT v.session_id, v.viewed_at, v.title,
           COALESCE(NULLIF(regexp_replace(regexp_replace(v.url, '^https?://[^/]+', ''), '[?#].*$', ''), ''), '/') AS path,
           (v_like IS NULL OR regexp_replace(v.url, '^https?://[^/]+', '') LIKE v_like) AS in_path
    FROM public.page_views v
    WHERE v.site_id = p_site_id
      AND v.session_id IS NOT NULL
      AND v.viewed_at >= p_from AND v.viewed_at < p_to + 1
      AND v.url NOT LIKE '%wp-admin%' AND v.url NOT LIKE '%wp-login%'
      AND v.url NOT LIKE '%elementor-preview%' AND v.url NOT LIKE '%elementor=%'
      AND v.url NOT LIKE '%preview=true%'
      AND (p_segment IS NULL OR EXISTS (
        SELECT 1 FROM public.tracking_sessions ts
        WHERE ts.id = v.session_id AND public.session_matches_filters(ts, NULL, p_segment)))
  ),
  seq AS (
    SELECT pv.*,
           row_number() OVER w AS n,
           count(*)     OVER (PARTITION BY pv.session_id) AS total,
           extract(epoch FROM lead(pv.viewed_at) OVER w - pv.viewed_at) AS gap
    FROM pv
    WINDOW w AS (PARTITION BY pv.session_id ORDER BY pv.viewed_at)
  ),
  pages AS (
    SELECT s.path,
           count(*)                            AS views,
           count(DISTINCT s.session_id)        AS visits,
           count(*) FILTER (WHERE s.n = 1)     AS entries,
           count(*) FILTER (WHERE s.n = s.total) AS exits,
           (array_agg(s.title ORDER BY s.viewed_at DESC) FILTER (WHERE coalesce(s.title, '') <> ''))[1] AS title,
           count(*) FILTER (WHERE s.gap > 0 AND s.gap <= 1800) AS time_samples,
           round(avg(s.gap) FILTER (WHERE s.gap > 0 AND s.gap <= 1800))::int AS avg_time_seconds
    FROM seq s
    WHERE s.in_path
    GROUP BY s.path
    ORDER BY views DESC, s.path
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500)
  ),
  scroll AS (
    SELECT COALESCE(NULLIF(regexp_replace(regexp_replace(h.url, '^https?://[^/]+', ''), '[?#].*$', ''), ''), '/') AS path,
           count(*) FILTER (WHERE h.y_coordinate = 25)  AS s25,
           count(*) FILTER (WHERE h.y_coordinate = 50)  AS s50,
           count(*) FILTER (WHERE h.y_coordinate = 75)  AS s75,
           count(*) FILTER (WHERE h.y_coordinate = 100) AS s100
    FROM public.heatmap_data h
    WHERE p_segment IS NULL
      AND h.site_id = p_site_id
      AND h.interaction_type = 'scroll'
      AND h.created_at >= p_from AND h.created_at < p_to + 1
      AND (v_like IS NULL OR regexp_replace(h.url, '^https?://[^/]+', '') LIKE v_like)
    GROUP BY 1
  )
  SELECT jsonb_build_object(
    'visits',      (SELECT count(DISTINCT session_id) FROM pv WHERE in_path),
    'page_views',  (SELECT count(*) FROM pv WHERE in_path),
    'has_scroll',  EXISTS (SELECT 1 FROM scroll),
    'pages', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'path', p.path, 'title', p.title, 'views', p.views, 'visits', p.visits,
               'entries', p.entries, 'exits', p.exits,
               'time_samples', p.time_samples, 'avg_time_seconds', p.avg_time_seconds,
               'scroll_25', coalesce(sc.s25, 0), 'scroll_50', coalesce(sc.s50, 0),
               'scroll_75', coalesce(sc.s75, 0), 'scroll_100', coalesce(sc.s100, 0))
             ORDER BY p.views DESC, p.path)
      FROM pages p LEFT JOIN scroll sc ON sc.path = p.path), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_content_pages(uuid, date, date, int, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_content_pages(uuid, date, date, int, text, jsonb) TO authenticated;

-- ── Heatmap tab page list: get_heatmap_pages + path ──────────────────────────────────
-- heatmap_data has no session, so there is no segment parameter.
DROP FUNCTION IF EXISTS public.get_heatmap_pages(uuid, date, date, int);

CREATE OR REPLACE FUNCTION public.get_heatmap_pages(
  p_site_id uuid, p_from date, p_to date, p_limit int DEFAULT 50,
  p_path    text DEFAULT NULL
)
RETURNS TABLE (url text, clicks bigint, scrolls bigint)
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
  SELECT h.url,
         count(*) FILTER (WHERE h.interaction_type = 'click' OR h.interaction_type LIKE 'click\_%')::bigint AS clicks,
         count(*) FILTER (WHERE h.interaction_type = 'scroll')::bigint AS scrolls
  FROM public.heatmap_data h
  WHERE h.site_id = p_site_id
    AND h.created_at >= p_from AND h.created_at < p_to + 1
    -- Member-only and editor pages: the heatmap screenshot is taken logged out.
    AND regexp_replace(h.url, '^https?://[^/]+', '') !~* '^/(wp-admin|wp-login|admin|login|logga-in|signin|sign-in|auth|account|my-account|mitt-konto|konto|min-sida|profile|profil|members|medlem)(/|\?|$)'
    AND h.url NOT LIKE '%elementor-preview%' AND h.url NOT LIKE '%preview=true%'
    AND (p_path IS NULL OR regexp_replace(h.url, '^https?://[^/]+', '') LIKE public.path_like_prefix(p_path))
  GROUP BY h.url
  ORDER BY clicks DESC, scrolls DESC, h.url
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_heatmap_pages(uuid, date, date, int, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_heatmap_pages(uuid, date, date, int, text) TO authenticated;

-- ── AI bots tab: get_ai_bot_tracking + path ──────────────────────────────────────────
-- Bot hits carry no UTM or visitor attributes, so segments do not apply (same as the
-- overview's AI numbers). The path filters bot hits by url and citations by cited_url.
-- The legacy (uuid, int) overload from 20260706160000 is left untouched.
DROP FUNCTION IF EXISTS public.get_ai_bot_tracking(uuid, date, date);

CREATE OR REPLACE FUNCTION public.get_ai_bot_tracking(p_site_id uuid, p_from date, p_to date, p_path text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_start           timestamptz;
  v_end             timestamptz;
  v_like            text := CASE WHEN p_path IS NULL THEN NULL ELSE public.path_like_prefix(p_path) END;
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

  SELECT count(*), count(*) FILTER (WHERE t.request_type = 'training') INTO total, training
    FROM public.ai_bot_traffic t
    WHERE t.site_id = p_site_id AND t.detected_at >= v_start AND t.detected_at < v_end
      AND (v_like IS NULL OR regexp_replace(coalesce(t.url, ''), '^https?://[^/]+', '') LIKE v_like);

  SELECT count(*), count(*) FILTER (WHERE c.clicked) INTO citation_requests, citation_clicks
    FROM public.ai_citations c
    WHERE c.site_id = p_site_id AND c.created_at >= v_start AND c.created_at < v_end
      AND (v_like IS NULL OR regexp_replace(coalesce(c.cited_url, ''), '^https?://[^/]+', '') LIKE v_like);

  SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY b.count DESC), '[]'::jsonb) INTO bot_breakdown
  FROM (
    SELECT
      coalesce(t.bot_name, t.bot_type) AS name,
      count(*)                         AS count,
      (array_agg(t.request_type ORDER BY t.detected_at DESC))[1] AS category,
      CASE WHEN total > 0 THEN count(*)::float * 100 / total ELSE 0 END AS percentage
    FROM public.ai_bot_traffic t
    WHERE t.site_id = p_site_id AND t.detected_at >= v_start AND t.detected_at < v_end
      AND (v_like IS NULL OR regexp_replace(coalesce(t.url, ''), '^https?://[^/]+', '') LIKE v_like)
    GROUP BY coalesce(t.bot_name, t.bot_type)
  ) b;

  SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.date), '[]'::jsonb) INTO daily
  FROM (
    SELECT to_char(t.detected_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date, count(*) AS traffic
    FROM public.ai_bot_traffic t
    WHERE t.site_id = p_site_id AND t.detected_at >= v_start AND t.detected_at < v_end
      AND (v_like IS NULL OR regexp_replace(coalesce(t.url, ''), '^https?://[^/]+', '') LIKE v_like)
    GROUP BY 1
  ) d;

  SELECT coalesce(jsonb_agg(to_jsonb(u) ORDER BY u.visits DESC), '[]'::jsonb) INTO top_urls
  FROM (
    SELECT t.url, count(*) AS visits
    FROM public.ai_bot_traffic t
    WHERE t.site_id = p_site_id AND t.detected_at >= v_start AND t.detected_at < v_end
      AND t.url IS NOT NULL AND t.url !~ asset_re
      AND (v_like IS NULL OR regexp_replace(t.url, '^https?://[^/]+', '') LIKE v_like)
    GROUP BY t.url
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

REVOKE EXECUTE ON FUNCTION public.get_ai_bot_tracking(uuid, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ai_bot_tracking(uuid, date, date, text) TO authenticated;

-- ── Attribution gap: date range + path + segment ─────────────────────────────────────
-- New overload next to the (uuid, int) one, which stays for clients that have not
-- reloaded after deploy. A conversion counts when its visit matches the filters, as on
-- the overview: path = the visit viewed a page under the prefix.
CREATE OR REPLACE FUNCTION public.get_attribution_gap(
  p_site_id uuid, p_from date, p_to date,
  p_path    text DEFAULT NULL,
  p_segment jsonb DEFAULT NULL
)
RETURNS TABLE (
  cortiq_conversions bigint,
  hubspot_mqls       bigint,
  pending_upload     bigint,
  uploaded           bigint,
  classified_count   bigint,
  unclassified_count bigint
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
    count(*)::bigint,
    count(*) FILTER (WHERE ce.lead_quality IN ('Priority', 'Qualified'))::bigint,
    count(*) FILTER (WHERE ce.upload_status = 'pending')::bigint,
    count(*) FILTER (WHERE ce.upload_status = 'uploaded')::bigint,
    count(*) FILTER (WHERE ce.lead_quality IS NOT NULL)::bigint,
    count(*) FILTER (WHERE ce.lead_quality IS NULL)::bigint
  FROM public.conversion_events ce
  WHERE ce.site_id = p_site_id
    AND ce.created_at >= p_from AND ce.created_at < p_to + 1
    AND ((p_path IS NULL AND p_segment IS NULL) OR EXISTS (
      SELECT 1 FROM public.tracking_sessions ts
      WHERE ts.id = ce.session_id AND public.session_matches_filters(ts, p_path, p_segment)));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_attribution_gap(uuid, date, date, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_attribution_gap(uuid, date, date, text, jsonb) TO authenticated;

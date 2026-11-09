-- supabase/migrations/20261114000001_report_rpcs.sql
-- Move the last client-side reports into the database. Top pages, traffic sources (non-GA
-- fallback), segments and the page funnel used to fetch raw rows and count them in the
-- browser, which PostgREST caps at 1,000 rows. These RPCs count every row for the period.
-- Same contract as the tab RPCs: caller must own the site, range at most 366 days.

-- ── Top pages ────────────────────────────────────────────────────────────────────
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

-- ── Traffic sources (first-party fallback when GA4 is not connected or fails) ─────
-- Source and medium come from the referrer host, with the same rules the dashboard used.
CREATE OR REPLACE FUNCTION public.referrer_source_medium(p_referrer text, OUT source text, OUT medium text)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_host text;
BEGIN
  IF p_referrer IS NULL OR p_referrer = '' OR p_referrer = '(direct)' THEN
    source := '(direct)'; medium := '(none)'; RETURN;
  END IF;
  v_host := lower(substring(p_referrer FROM '^[a-zA-Z][a-zA-Z0-9+.-]*://([^/:?#]+)'));
  IF v_host IS NULL OR v_host = '' THEN
    source := 'unknown'; medium := 'referral';
  ELSIF v_host LIKE '%google%' THEN
    source := 'google'; medium := 'organic';
  ELSIF v_host LIKE '%facebook%' THEN
    source := 'facebook'; medium := 'social';
  ELSIF v_host LIKE '%instagram%' THEN
    source := 'instagram'; medium := 'social';
  ELSIF v_host LIKE '%youtube%' THEN
    source := 'youtube'; medium := 'social';
  ELSIF v_host LIKE '%twitter%' OR v_host IN ('x.com', 't.co') THEN
    source := 'twitter'; medium := 'social';
  ELSIF v_host LIKE '%linkedin%' THEN
    source := 'linkedin'; medium := 'social';
  ELSE
    source := regexp_replace(v_host, '^www\.', ''); medium := 'referral';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_source_breakdown(
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

  WITH sess AS (
    SELECT ts.id, rs.source, rs.medium,
           coalesce(ts.page_views, 0) AS pv, coalesce(ts.duration_seconds, 0) AS dur
    FROM public.tracking_sessions ts
    CROSS JOIN LATERAL public.referrer_source_medium(ts.referrer) rs
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
    SELECT s.source, s.medium,
           count(*)                          AS sessions,
           sum(s.pv)                         AS page_views,
           count(*) FILTER (WHERE s.pv <= 1) AS bounces,
           sum(s.dur)                        AS duration_seconds,
           count(c.session_id)               AS conversions
    FROM sess s
    LEFT JOIN conv c ON c.session_id = s.id
    GROUP BY s.source, s.medium
  )
  SELECT jsonb_build_object(
    'total_sessions', (SELECT count(*) FROM sess),
    'sources', coalesce((SELECT jsonb_agg(jsonb_build_object(
                 'source', source, 'medium', medium, 'sessions', sessions, 'page_views', page_views,
                 'bounces', bounces, 'duration_seconds', duration_seconds, 'conversions', conversions
               ) ORDER BY sessions DESC, source, medium) FROM agg), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.referrer_source_medium(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_source_breakdown(uuid, date, date, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_source_breakdown(uuid, date, date, text, jsonb) TO authenticated;

-- ── Segments: sessions, conversions and value per device and per direct/referred ──
CREATE OR REPLACE FUNCTION public.get_segment_stats(
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

  WITH sess AS (
    SELECT ts.id, coalesce(ts.device_type, 'unknown') AS device,
           CASE WHEN ts.referrer IS NULL OR ts.referrer IN ('', '(direct)') THEN 'direct' ELSE 'referred' END AS arrival,
           coalesce(ts.duration_seconds, 0) AS dur
    FROM public.tracking_sessions ts
    WHERE ts.site_id = p_site_id
      AND ts.started_at >= p_from AND ts.started_at < p_to + 1
      AND ((p_path IS NULL AND p_segment IS NULL) OR public.session_matches_filters(ts, p_path, p_segment))
  ),
  conv AS (
    SELECT ce.session_id, sum(coalesce(ce.event_value, 0)) AS value
    FROM public.conversion_events ce
    WHERE ce.site_id = p_site_id
      AND ce.created_at >= p_from AND ce.created_at < p_to + 1
      AND ce.session_id IS NOT NULL
    GROUP BY ce.session_id
  ),
  joined AS (
    SELECT s.*, c.session_id IS NOT NULL AS converted, coalesce(c.value, 0) AS value
    FROM sess s LEFT JOIN conv c ON c.session_id = s.id
  )
  SELECT jsonb_build_object(
    'total_sessions', (SELECT count(*) FROM joined),
    'devices', coalesce((SELECT jsonb_agg(row_to_json(d)::jsonb ORDER BY d.sessions DESC, d.key) FROM (
                 SELECT device AS key, count(*) AS sessions, count(*) FILTER (WHERE converted) AS converting_sessions,
                        sum(dur) AS duration_seconds, sum(value) AS conversion_value
                 FROM joined GROUP BY device) d), '[]'::jsonb),
    'arrivals', coalesce((SELECT jsonb_agg(row_to_json(a)::jsonb ORDER BY a.sessions DESC, a.key) FROM (
                 SELECT arrival AS key, count(*) AS sessions, count(*) FILTER (WHERE converted) AS converting_sessions,
                        sum(dur) AS duration_seconds, sum(value) AS conversion_value
                 FROM joined GROUP BY arrival) a), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_segment_stats(uuid, date, date, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_segment_stats(uuid, date, date, text, jsonb) TO authenticated;

-- ── Page funnel: visits and click types on one page ───────────────────────────────
-- Click types use the same text heuristics the dashboard used.
CREATE OR REPLACE FUNCTION public.get_page_funnel(p_site_id uuid, p_url text, p_from date, p_to date)
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

  WITH clicks AS (
    SELECT lower(coalesce(h.interaction_type, '')) AS it, lower(coalesce(h.element_text, '')) AS txt
    FROM public.heatmap_data h
    WHERE h.site_id = p_site_id AND h.url = p_url
      AND h.created_at >= p_from AND h.created_at < p_to + 1
  )
  SELECT jsonb_build_object(
    'page_visits', (SELECT count(*) FROM public.page_views pv
                    WHERE pv.site_id = p_site_id AND pv.url = p_url
                      AND pv.viewed_at >= p_from AND pv.viewed_at < p_to + 1),
    'total_clicks',     count(*),
    'form_starts',      count(*) FILTER (WHERE it LIKE '%form%' OR it LIKE '%input%'
                                            OR txt LIKE '%input%' OR txt LIKE '%textarea%'),
    'form_submissions', count(*) FILTER (WHERE it LIKE '%submit%' OR txt LIKE '%skicka%'
                                            OR txt LIKE '%send%' OR txt LIKE '%submit%'),
    'phone_clicks',     count(*) FILTER (WHERE it LIKE '%phone%' OR txt LIKE '%ring%'
                                            OR txt LIKE '%telefon%' OR txt LIKE '%call%'),
    'email_clicks',     count(*) FILTER (WHERE txt LIKE '%email%' OR txt LIKE '%mejl%' OR txt LIKE '%@%')
  ) INTO v_result
  FROM clicks;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_page_funnel(uuid, text, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_page_funnel(uuid, text, date, date) TO authenticated;

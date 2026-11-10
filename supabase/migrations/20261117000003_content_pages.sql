-- supabase/migrations/20261117000003_content_pages.sql
-- Content tab fallback: per-page engagement from data every site already collects.
-- get_content_performance reads content_performance, which is only written for elements
-- marked data-cortiq-content, so the tab was empty for almost every site.
--
-- get_content_pages: per path (no query string or fragment) in the range —
--   views, visits (distinct sessions), entries (first page of a visit), exits (last page of a
--   multi-page or single-page visit), time on page derived from the next view in the same
--   session (capped at 30 min; the last view of a visit gives no sample), and scroll
--   milestones 25/50/75/100 from heatmap_data. Scroll rows carry no session (one row per page
--   view and milestone), so reach is milestone rows / page views, capped at 100 in the client.
-- The engagement score is computed in src/lib/contentPages.ts.
-- Same contract as the other tab RPCs: caller must own the site, range at most 366 days.

CREATE INDEX IF NOT EXISTS idx_heatmap_data_site_created
  ON public.heatmap_data (site_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.get_content_pages(p_site_id uuid, p_from date, p_to date, p_limit int DEFAULT 100)
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
    SELECT v.session_id, v.viewed_at, v.title,
           COALESCE(NULLIF(regexp_replace(regexp_replace(v.url, '^https?://[^/]+', ''), '[?#].*$', ''), ''), '/') AS path
    FROM public.page_views v
    WHERE v.site_id = p_site_id
      AND v.session_id IS NOT NULL
      AND v.viewed_at >= p_from AND v.viewed_at < p_to + 1
      AND v.url NOT LIKE '%wp-admin%' AND v.url NOT LIKE '%wp-login%'
      AND v.url NOT LIKE '%elementor-preview%' AND v.url NOT LIKE '%preview=true%'
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
    WHERE h.site_id = p_site_id
      AND h.interaction_type = 'scroll'
      AND h.created_at >= p_from AND h.created_at < p_to + 1
    GROUP BY 1
  )
  SELECT jsonb_build_object(
    'visits',      (SELECT count(DISTINCT session_id) FROM pv),
    'page_views',  (SELECT count(*) FROM pv),
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

REVOKE EXECUTE ON FUNCTION public.get_content_pages(uuid, date, date, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_content_pages(uuid, date, date, int) TO authenticated;

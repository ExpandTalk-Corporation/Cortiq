-- supabase/migrations/20261109000002_top_paths.sql
-- Most viewed paths in a date range, for the dashboard's Website URL suggestions.
-- Same page_views exclusions as get_overview_metrics; query string and fragment dropped.
CREATE OR REPLACE FUNCTION public.get_top_paths(
  p_site_id uuid, p_from date, p_to date, p_limit int DEFAULT 30
)
RETURNS TABLE (path text, views bigint)
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
  SELECT p.path, count(*) AS views
  FROM (
    SELECT COALESCE(NULLIF(regexp_replace(regexp_replace(pv.url, '^https?://[^/]+', ''), '[?#].*$', ''), ''), '/') AS path
    FROM public.page_views pv
    WHERE pv.site_id = p_site_id
      AND pv.viewed_at >= p_from AND pv.viewed_at < p_to + 1
      AND pv.url NOT LIKE '%wp-admin%' AND pv.url NOT LIKE '%wp-login%'
      AND pv.url NOT LIKE '%elementor-preview%' AND pv.url NOT LIKE '%elementor=%'
      AND pv.url NOT LIKE '%preview=true%'
  ) p
  GROUP BY p.path
  ORDER BY views DESC, p.path
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_top_paths(uuid, date, date, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_top_paths(uuid, date, date, int) TO authenticated;

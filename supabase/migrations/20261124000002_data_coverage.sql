-- supabase/migrations/20261124000002_data_coverage.sql
-- Data coverage for the selected range: first and last day with page views, how many days
-- have data, and gaps. A gap is a run of at least p_min_gap days (UTC) without page views,
-- either between two days with data, or at the edge of the range when the site has page views
-- on the far side of it. expandtalk.se had no page views from June to 2026-11-05 while the
-- dashboard showed the period as if it were complete; the Overview now says so.
-- A run of empty days up to the end of the range with nothing after it is not a gap here:
-- the pipeline-freshness alerts report a site that has gone silent.
-- Same contract as the other report RPCs: the caller must own the site, range at most 366 days.

CREATE OR REPLACE FUNCTION public.get_data_coverage(p_site_id uuid, p_from date, p_to date, p_min_gap int DEFAULT 3)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_min_gap int := LEAST(GREATEST(COALESCE(p_min_gap, 3), 1), 366);
  v_before  boolean;
  v_after   boolean;
  v_result  jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sites WHERE id = p_site_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from + 1 > 366 THEN
    RAISE EXCEPTION 'invalid range' USING ERRCODE = '22023';
  END IF;

  v_before := EXISTS (SELECT 1 FROM public.page_views v
                      WHERE v.site_id = p_site_id AND v.viewed_at < p_from::timestamp AT TIME ZONE 'UTC');
  v_after  := EXISTS (SELECT 1 FROM public.page_views v
                      WHERE v.site_id = p_site_id AND v.viewed_at >= (p_to + 1)::timestamp AT TIME ZONE 'UTC');

  WITH days AS (
    SELECT d::date AS day FROM generate_series(p_from, p_to, interval '1 day') AS d
  ),
  counts AS (
    SELECT (v.viewed_at AT TIME ZONE 'UTC')::date AS day, count(*)::bigint AS n
    FROM public.page_views v
    WHERE v.site_id = p_site_id
      AND v.viewed_at >= p_from::timestamp AT TIME ZONE 'UTC'
      AND v.viewed_at <  (p_to + 1)::timestamp AT TIME ZONE 'UTC'
    GROUP BY 1
  ),
  series AS (
    SELECT d.day, COALESCE(c.n, 0) AS n FROM days d LEFT JOIN counts c USING (day)
  ),
  bounds AS (
    SELECT min(day) FILTER (WHERE n > 0) AS first_day,
           max(day) FILTER (WHERE n > 0) AS last_day,
           count(*) FILTER (WHERE n > 0) AS days_with_data
    FROM series
  ),
  -- Islands of empty days: consecutive dates share day - row_number.
  empty_runs AS (
    SELECT min(day) AS gap_from, max(day) AS gap_to, count(*)::int AS days
    FROM (SELECT day, day - (row_number() OVER (ORDER BY day))::int AS grp FROM series WHERE n = 0) e
    GROUP BY grp
  ),
  gaps AS (
    SELECT r.* FROM empty_runs r, bounds b
    WHERE r.days >= v_min_gap
      AND (
        -- Between two days with data inside the range.
        (r.gap_from > b.first_day AND r.gap_to < b.last_day)
        -- At the start of the range, with page views before it.
        OR (r.gap_from = p_from AND v_before AND (b.last_day IS NOT NULL OR v_after))
        -- At the end of the range, with page views after it.
        OR (r.gap_to = p_to AND v_after AND (b.first_day IS NOT NULL OR v_before))
      )
  )
  SELECT jsonb_build_object(
    'first_day',      b.first_day,
    'last_day',       b.last_day,
    'days_with_data', b.days_with_data,
    'days_in_range',  p_to - p_from + 1,
    'data_before',    v_before,
    'data_after',     v_after,
    'gaps', COALESCE((SELECT jsonb_agg(jsonb_build_object('from', g.gap_from, 'to', g.gap_to, 'days', g.days)
                                       ORDER BY g.gap_from) FROM gaps g), '[]'::jsonb)
  ) INTO v_result
  FROM bounds b;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_data_coverage(uuid, date, date, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_data_coverage(uuid, date, date, int) TO authenticated;

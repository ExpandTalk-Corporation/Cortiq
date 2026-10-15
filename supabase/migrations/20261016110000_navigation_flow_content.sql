-- supabase/migrations/20261016110000_navigation_flow_content.sql
-- Navigation flow and Content: both tabs were always empty. navigation_analytics was only
-- written by an edge function nothing calls; content_performance had no live writer and the
-- tracker never read data-cortiq-content. Navigation flow is now derived from page_views
-- (already collected per session); content metrics come from the tracker (5.5.6+) via
-- track-event → record_content_metrics. Reads go through owner-checked RPCs.

-- Page-to-page transitions, entry and exit pages for a site and date range. Paths are the URL
-- path without query/fragment; a reload of the same path is not a transition.
CREATE OR REPLACE FUNCTION public.get_navigation_flow(p_site_id uuid, p_from date, p_to date)
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

REVOKE EXECUTE ON FUNCTION public.get_navigation_flow(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_navigation_flow(uuid, date, date) TO authenticated;

-- Increments today's content_performance counters. p_items: [{id, name?, type?, action}]
-- with action 'impression' | 'click'. Service role only (called by track-event).
CREATE OR REPLACE FUNCTION public.record_content_metrics(p_site_id uuid, p_items jsonb)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_item jsonb;
  v_id   text;
  v_n    int := 0;
BEGIN
  IF p_site_id IS NULL OR jsonb_typeof(p_items) <> 'array' THEN RETURN 0; END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LIMIT 50 LOOP
    v_id := left(nullif(trim(v_item->>'id'), ''), 100);
    CONTINUE WHEN v_id IS NULL OR (v_item->>'action') NOT IN ('impression', 'click');
    INSERT INTO public.content_performance AS cp (site_id, content_id, content_name, content_type, date, impressions, clicks, ctr)
    VALUES (p_site_id, v_id, left(nullif(trim(v_item->>'name'), ''), 200), left(nullif(trim(v_item->>'type'), ''), 50),
            current_date,
            CASE WHEN v_item->>'action' = 'impression' THEN 1 ELSE 0 END,
            CASE WHEN v_item->>'action' = 'click' THEN 1 ELSE 0 END,
            0)
    ON CONFLICT (site_id, content_id, date) DO UPDATE SET
      impressions  = coalesce(cp.impressions, 0) + EXCLUDED.impressions,
      clicks       = coalesce(cp.clicks, 0) + EXCLUDED.clicks,
      content_name = coalesce(EXCLUDED.content_name, cp.content_name),
      content_type = coalesce(EXCLUDED.content_type, cp.content_type),
      updated_at   = now();
    UPDATE public.content_performance
      SET ctr = CASE WHEN impressions > 0 THEN round(100.0 * clicks / impressions, 2) ELSE 0 END
      WHERE site_id = p_site_id AND content_id = v_id AND date = current_date;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_content_metrics(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.record_content_metrics(uuid, jsonb) TO service_role;

-- Content metrics per element for a site and date range (owner-checked; the table's RLS
-- policy is organisation-based and does not match the dashboard's site ownership model).
CREATE OR REPLACE FUNCTION public.get_content_performance(p_site_id uuid, p_from date, p_to date)
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

  SELECT coalesce(jsonb_agg(row_to_json(r) ORDER BY r.impressions DESC, r.content_id), '[]'::jsonb) INTO v_result
  FROM (
    SELECT content_id,
           max(content_name) AS content_name,
           max(content_type) AS content_type,
           sum(coalesce(impressions, 0))::int AS impressions,
           sum(coalesce(clicks, 0))::int AS clicks,
           CASE WHEN sum(coalesce(impressions, 0)) > 0
                THEN round(100.0 * sum(coalesce(clicks, 0)) / sum(coalesce(impressions, 0)), 2) ELSE 0 END AS ctr
    FROM public.content_performance
    WHERE site_id = p_site_id AND date BETWEEN p_from AND p_to
    GROUP BY content_id
  ) r;
  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_content_performance(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_content_performance(uuid, date, date) TO authenticated;

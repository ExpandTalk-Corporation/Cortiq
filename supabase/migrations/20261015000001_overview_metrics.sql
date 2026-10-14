-- supabase/migrations/20261015000001_overview_metrics.sql
-- Overview v2: current + previous period and a gap-free daily series in one call.
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
  IF p_to < p_from OR v_days > 366 THEN
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
      AND (p_segment IS NULL OR NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_segment) f
        WHERE NOT COALESCE((
          WITH c AS (SELECT CASE f->>'field'
                       WHEN 'utm_source'   THEN ts.utm_source
                       WHEN 'utm_medium'   THEN ts.utm_medium
                       WHEN 'utm_campaign' THEN ts.utm_campaign
                       WHEN 'utm_content'  THEN ts.utm_content
                       WHEN 'utm_term'     THEN ts.utm_term END AS col,
                     replace(replace(replace(f->>'value', '\', '\\'), '%', '\%'), '_', '\_') AS v)
          SELECT CASE f->>'op'
                   WHEN 'eq'          THEN lower(c.col) = lower(f->>'value')
                   WHEN 'contains'    THEN c.col ILIKE '%' || c.v || '%'
                   WHEN 'starts_with' THEN c.col ILIKE c.v || '%'
                   ELSE false END
          FROM c), false)))
      AND (v_like IS NULL OR EXISTS (
        SELECT 1 FROM public.page_views pv
        WHERE pv.session_id = ts.id
          AND regexp_replace(pv.url, '^https?://[^/]+', '') LIKE v_like))
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
           CASE WHEN a.request_type IN ('training', 'agentic') THEN a.request_type ELSE 'citation' END AS cat
    FROM public.ai_bot_traffic a
    WHERE a.site_id = p_site_id
      AND a.detected_at >= v_prev AND a.detected_at < p_to + 1
      AND (v_like IS NULL OR regexp_replace(a.url, '^https?://[^/]+', '') LIKE v_like)
  ),
  totals AS (
    SELECT period,
      jsonb_build_object(
        'visits',      (SELECT count(*) FROM sess  WHERE d BETWEEN lo AND hi),
        'pageViews',   (SELECT count(*) FROM pvs   WHERE d BETWEEN lo AND hi),
        'conversions', (SELECT count(*) FROM conv  WHERE d BETWEEN lo AND hi),
        'ai', jsonb_build_object(
          'total',    (SELECT count(*) FROM ai WHERE d BETWEEN lo AND hi),
          'training', (SELECT count(*) FROM ai WHERE d BETWEEN lo AND hi AND cat = 'training'),
          'agentic',  (SELECT count(*) FROM ai WHERE d BETWEEN lo AND hi AND cat = 'agentic'),
          'citation', (SELECT count(*) FROM ai WHERE d BETWEEN lo AND hi AND cat = 'citation'))
      ) AS obj
    FROM (VALUES ('current', p_from, p_to), ('previous', v_prev, p_from - 1)) AS p(period, lo, hi)
  ),
  days AS (SELECT g::date AS d FROM generate_series(p_from, p_to, interval '1 day') g)
  SELECT jsonb_build_object(
    'current',  (SELECT obj FROM totals WHERE period = 'current'),
    'previous', (SELECT obj FROM totals WHERE period = 'previous'),
    'daily', (SELECT jsonb_agg(jsonb_build_object(
                'date', to_char(days.d, 'YYYY-MM-DD'),
                'visits',      (SELECT count(*) FROM sess WHERE sess.d = days.d),
                'pageViews',   (SELECT count(*) FROM pvs  WHERE pvs.d  = days.d),
                'conversions', (SELECT count(*) FROM conv WHERE conv.d = days.d),
                'ai',          (SELECT count(*) FROM ai   WHERE ai.d   = days.d)) ORDER BY days.d)
              FROM days),
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

REVOKE EXECUTE ON FUNCTION public.get_overview_metrics(uuid, date, date, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_overview_metrics(uuid, date, date, text, jsonb) TO authenticated;

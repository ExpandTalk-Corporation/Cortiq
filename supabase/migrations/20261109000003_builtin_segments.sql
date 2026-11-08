-- supabase/migrations/20261109000003_builtin_segments.sql
-- Built-in segments for the dashboard filter: named rules over a tracking_sessions row,
-- passed to get_overview_metrics as p_segment = [{"field":"builtin","op":"eq","value":"<key>"}].
-- One function holds the rules so other tab RPCs can apply the same segments later.
--   mobile / desktop / tablet  device_type
--   paid     utm_medium in PAID_MEDIUMS (src/lib/paidMediums.ts, same as Ads)
--   social   same platform match as get_social_daily (Social media tab), paid social included
--   organic  referrer is a search engine, not an AI assistant, and utm_medium is not paid
--   ai       referrer or utm_source is an AI assistant (src/ontology/traffic.ts ai_search_referral):
--            humans who clicked a link in an AI answer. AI bots are not sessions and never match.
--   direct   no referrer and no utm_source / utm_medium
-- Unknown keys match nothing.
CREATE OR REPLACE FUNCTION public.builtin_segment_match(
  p_key text, p_device text, p_referrer text, p_utm_source text, p_utm_medium text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  WITH v AS (
    SELECT lower(split_part(regexp_replace(coalesce(p_referrer, ''), '^[a-zA-Z-]+://', ''), '/', 1)) AS host,
           coalesce(p_referrer, '')                       AS ref,
           lower(coalesce(p_utm_source, ''))              AS src,
           lower(coalesce(p_utm_medium, ''))              AS med
  ), c AS (
    SELECT v.*,
      v.med IN ('cpc', 'ppc', 'paid-social', 'display', 'paid') AS is_paid,
      (v.host ~ '(^|\.)(chat\.openai\.com|chatgpt\.com|perplexity\.ai|claude\.ai|gemini\.google\.com|bard\.google\.com)$'
        OR v.src ~ '^(chatgpt|perplexity|claude|gemini|bard)') AS is_ai
    FROM v
  )
  SELECT CASE p_key
    WHEN 'mobile'  THEN p_device = 'mobile'
    WHEN 'desktop' THEN p_device = 'desktop'
    WHEN 'tablet'  THEN p_device = 'tablet'
    WHEN 'paid'    THEN c.is_paid
    WHEN 'ai'      THEN c.is_ai
    WHEN 'social'  THEN (
      c.ref ILIKE '%facebook%'  OR c.ref ILIKE '%instagram%' OR
      c.ref ILIKE '%linkedin%'  OR c.ref ILIKE '%twitter%'   OR
      c.ref ILIKE '%tiktok%'    OR c.ref ILIKE '%youtube%'   OR
      c.ref ILIKE '%pinterest%' OR c.ref ILIKE '%reddit%'    OR
      c.ref ILIKE '%lnkd.in%'   OR c.ref ILIKE '%t.co/%'     OR
      c.ref ILIKE '%x.com%'     OR c.ref ILIKE '%youtu.be%'  OR
      c.ref ILIKE '%fb.com%'    OR c.ref ILIKE '%redd.it%'   OR
      c.ref ILIKE '%pin.it%'    OR
      c.src ILIKE '%facebook%'  OR c.src ILIKE '%instagram%' OR
      c.src ILIKE '%linkedin%'  OR c.src ILIKE '%twitter%'   OR
      c.src ILIKE '%tiktok%'    OR c.src ILIKE '%youtube%'   OR
      c.src ILIKE '%pinterest%' OR c.src ILIKE '%reddit%'    OR
      c.src ILIKE '%fb'         OR c.src ILIKE '%ig'         OR
      c.src = 'x')
    WHEN 'organic' THEN NOT c.is_paid AND NOT c.is_ai AND c.host NOT LIKE 'mail.%'
      AND c.host ~ '(^|\.)(google|bing|duckduckgo|ecosia|yandex|baidu|qwant|startpage|brave)\.|(^|\.)search\.yahoo\.'
    WHEN 'direct'  THEN c.ref = '' AND c.src = '' AND c.med = ''
    ELSE false END
  FROM c
$$;

GRANT EXECUTE ON FUNCTION public.builtin_segment_match(text, text, text, text, text) TO authenticated;

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
      AND (p_segment IS NULL OR NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_segment) f
        WHERE NOT COALESCE(CASE WHEN f->>'field' = 'builtin'
          THEN public.builtin_segment_match(f->>'value', ts.device_type, ts.referrer, ts.utm_source, ts.utm_medium)
          ELSE (
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
          FROM c) END, false)))
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

REVOKE EXECUTE ON FUNCTION public.get_overview_metrics(uuid, date, date, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_overview_metrics(uuid, date, date, text, jsonb) TO authenticated;

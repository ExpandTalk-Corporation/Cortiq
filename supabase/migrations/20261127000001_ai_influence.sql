-- Attribution layer 2: AI influence and brand signals (docs/superpowers/specs/2026-11-12-attribution-models-and-ai-influence.md).
-- Read-only aggregation of data CortIQ already stores. Shown as signals, never as credit.

-- Path key for joining full URLs from different tables: no scheme, host, query, fragment or trailing slash.
-- STRICT: a conversion without a page view has no path and must not match the root page.
CREATE OR REPLACE FUNCTION public.url_path_key(p_url text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
  SELECT CASE WHEN k = '' THEN '/' ELSE k END
  FROM (SELECT rtrim(split_part(split_part(regexp_replace(coalesce(p_url, ''), '^[a-z]+://[^/]+', '', 'i'), '?', 1), '#', 1), '/') AS k) s;
$$;

-- AI assistant referrals: keep in sync with the ai_search_referral children in src/ontology/traffic.ts
-- (tests/foundation/ai-influence.test.mjs fails if they drift).
CREATE OR REPLACE FUNCTION public.is_ai_assistant_referral(p_host text, p_utm_source text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT coalesce(lower(p_host) ~ '(^|\.)(chat\.openai\.com|chatgpt\.com|perplexity\.ai|claude\.ai|gemini\.google\.com|bard\.google\.com)$', false)
      OR coalesce(lower(p_utm_source) IN ('chatgpt', 'chatgpt.com', 'perplexity', 'claude', 'gemini', 'bard'), false);
$$;

CREATE OR REPLACE FUNCTION public.get_ai_influence(
  p_site_id uuid, p_from date, p_to date,
  p_window_days integer DEFAULT 14
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_aggregate boolean;
  v_brand     text[];
  v_result    jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sites WHERE id = p_site_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from + 1 > 366 THEN
    RAISE EXCEPTION 'invalid range' USING ERRCODE = '22023';
  END IF;
  IF p_window_days IS NULL OR p_window_days < 1 OR p_window_days > 90 THEN
    RAISE EXCEPTION 'invalid window' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(s.aggregate_measurement, false) INTO v_aggregate FROM public.sites s WHERE s.id = p_site_id;

  -- Same brand terms as GSCVisibilitySection: the active Search Console credential's brand_keywords.
  SELECT array_remove(array_agg(DISTINCT lower(btrim(t))), '') INTO v_brand
  FROM public.site_google_credentials c, unnest(string_to_array(c.brand_keywords, ',')) t
  WHERE c.site_id = p_site_id AND c.is_active AND c.brand_keywords IS NOT NULL;
  IF v_brand = '{}' THEN v_brand := NULL; END IF;

  WITH fetches AS (
    -- Training crawlers are left out: they have no referral value.
    SELECT b.detected_at, (b.detected_at AT TIME ZONE 'UTC')::date AS day, b.request_type, coalesce(b.bot_type, 'other') AS bot_type,
           public.url_path_key(b.url) AS path
    FROM public.ai_bot_traffic b
    WHERE b.site_id = p_site_id AND b.request_type IN ('agentic', 'citation')
      AND b.detected_at >= p_from - p_window_days AND b.detected_at < p_to + 1
  ),
  in_range AS (SELECT * FROM fetches WHERE day BETWEEN p_from AND p_to),
  referrals AS (
    -- aggregate_sources_daily counts every visit when aggregate measurement is on; never add sessions on top of it.
    SELECT a.day, sum(a.visits)::bigint AS visits
    FROM public.aggregate_sources_daily a
    WHERE v_aggregate AND a.site_id = p_site_id AND a.day BETWEEN p_from AND p_to
      AND public.is_ai_assistant_referral(a.referrer_domain, a.utm_source)
    GROUP BY a.day
    UNION ALL
    SELECT (t.started_at AT TIME ZONE 'UTC')::date, count(*)::bigint
    FROM public.tracking_sessions t
    WHERE NOT v_aggregate AND t.site_id = p_site_id AND t.started_at >= p_from AND t.started_at < p_to + 1
      AND public.is_ai_assistant_referral(substring(t.referrer from '^[a-z]+://([^/:?#]+)'), t.utm_source)
    GROUP BY 1
  ),
  conversions AS (
    SELECT ce.created_at, public.url_path_key(pv.url) AS path
    FROM public.conversion_events ce
    LEFT JOIN public.page_views pv ON pv.id = ce.page_view_id
    WHERE ce.site_id = p_site_id AND ce.created_at >= p_from AND ce.created_at < p_to + 1
  ),
  days AS (SELECT d::date AS day FROM generate_series(p_from, p_to, interval '1 day') d)
  SELECT jsonb_build_object(
    'aggregate', v_aggregate,
    'windowDays', p_window_days,
    'daily', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'day', d.day,
        'agentic', (SELECT count(*) FROM in_range f WHERE f.day = d.day AND f.request_type = 'agentic'),
        'citation', (SELECT count(*) FROM in_range f WHERE f.day = d.day AND f.request_type = 'citation'),
        'referrals', coalesce((SELECT sum(r.visits) FROM referrals r WHERE r.day = d.day), 0)
      ) ORDER BY d.day), '[]'::jsonb)
      FROM days d),
    'assistants', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('botType', x.bot_type, 'agentic', x.agentic, 'citation', x.citation)
        ORDER BY x.agentic + x.citation DESC, x.bot_type), '[]'::jsonb)
      FROM (SELECT bot_type, count(*) FILTER (WHERE request_type = 'agentic') AS agentic,
                   count(*) FILTER (WHERE request_type = 'citation') AS citation
            FROM in_range GROUP BY bot_type) x),
    'pages', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('path', x.path, 'agentic', x.agentic, 'citation', x.citation,
        'conversions', (SELECT count(*) FROM conversions c WHERE c.path = x.path))
        ORDER BY x.agentic + x.citation DESC, x.path), '[]'::jsonb)
      FROM (SELECT path, count(*) FILTER (WHERE request_type = 'agentic') AS agentic,
                   count(*) FILTER (WHERE request_type = 'citation') AS citation
            FROM in_range GROUP BY path ORDER BY count(*) DESC, path LIMIT 20) x),
    'conversions', jsonb_build_object(
      'total', (SELECT count(*) FROM conversions),
      'onAiReadPages', (SELECT count(*) FROM conversions c WHERE EXISTS (
        SELECT 1 FROM fetches f WHERE f.path = c.path
          AND f.detected_at <= c.created_at AND f.detected_at > c.created_at - make_interval(days => p_window_days)))),
    'brand', CASE WHEN v_brand IS NULL THEN NULL ELSE (
      SELECT coalesce(jsonb_agg(jsonb_build_object('periodStart', x.period_start, 'periodEnd', x.period_end,
        'brandClicks', x.brand_clicks, 'brandImpressions', x.brand_impr,
        'otherClicks', x.other_clicks, 'otherImpressions', x.other_impr) ORDER BY x.period_start), '[]'::jsonb)
      FROM (
        SELECT g.period_start, g.period_end,
          coalesce(sum(g.clicks) FILTER (WHERE m.is_brand), 0) AS brand_clicks, coalesce(sum(g.impressions) FILTER (WHERE m.is_brand), 0) AS brand_impr,
          coalesce(sum(g.clicks) FILTER (WHERE NOT m.is_brand), 0) AS other_clicks, coalesce(sum(g.impressions) FILTER (WHERE NOT m.is_brand), 0) AS other_impr
        FROM public.gsc_data g
        CROSS JOIN LATERAL (SELECT EXISTS (SELECT 1 FROM unnest(v_brand) t WHERE strpos(lower(g.value), t) > 0) AS is_brand) m
        WHERE g.site_id = p_site_id AND g.dimension = 'query' AND g.period_end >= p_from AND g.period_start <= p_to
        GROUP BY g.period_start, g.period_end) x)
    END
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_ai_influence(uuid, date, date, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ai_influence(uuid, date, date, integer) TO authenticated;

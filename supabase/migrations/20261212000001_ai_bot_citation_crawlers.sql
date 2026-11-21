-- "Citation requests" on the AI bots tab counted rows in ai_citations. Those rows were
-- written by the tracker's trackAICitation(): a human visitor arriving from an AI service,
-- logged as an "Unknown Bot" in ai_bot_traffic with request_type 'citation'. Since
-- tracker 5.5.23 that path is gone; AI-referred human visits are measured only by
-- ai-search-tracker → ai_search_traffic (same analytics-consent gate).
--
-- The card now counts citation crawler requests: bot rows whose registry category is
-- 'citation' (PerplexityBot, OAI-SearchBot, …). Rows with request_type 'citation' but
-- another stored category are legacy misclassifications (old human citation rows,
-- AhrefsBot/Baiduspider before the registry) and are not counted. They stay in the table;
-- cleanup is a separate step (docs/runbooks/ai-citations-retirement.md).
--
-- ai_citations is no longer read or written. It is dropped in a later migration, after
-- the cleanup has been verified.

DROP FUNCTION IF EXISTS public.get_ai_bot_tracking(uuid, integer);

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

  SELECT count(*),
         count(*) FILTER (WHERE t.request_type = 'training'),
         count(*) FILTER (WHERE t.request_type = 'citation' AND t.bot_category = 'citation')
    INTO total, training, citation_requests
    FROM public.ai_bot_traffic t
    WHERE t.site_id = p_site_id AND t.detected_at >= v_start AND t.detected_at < v_end
      AND (v_like IS NULL OR regexp_replace(coalesce(t.url, ''), '^https?://[^/]+', '') LIKE v_like);

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
    'botBreakdown',     bot_breakdown,
    'dailyTrend',       daily,
    'topUrls',          top_urls
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_ai_bot_tracking(uuid, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ai_bot_tracking(uuid, date, date, text) TO authenticated;

COMMENT ON TABLE public.ai_citations IS
  'Retired by migration 20261212000001: no longer written (tracker 5.5.23 / ai-bot-tracker) or read. Rows were human AI-referral visits, not citations. Drop after cleanup per docs/runbooks/ai-citations-retirement.md.';

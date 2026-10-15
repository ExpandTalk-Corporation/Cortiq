-- supabase/migrations/20261015110000_session_utm.sql
-- Campaigns tab: tracking_sessions.utm_* existed but nothing wrote them (the page-view bridge
-- only stored the URL), and campaign_performance was never populated. The landing URL already
-- reaches ingest_pageview with its query string, so the session's first-touch UTM tags are
-- parsed from it. Also makes the Overview UTM segments, which filter on these columns, work.

-- One query-string parameter, percent/plus-decoded; NULL when absent or empty. A malformed
-- escape falls back to the raw value rather than failing the page view.
CREATE OR REPLACE FUNCTION public._url_param(p_url text, p_key text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = ''
AS $$
DECLARE
  v_query text := split_part(split_part(coalesce(p_url, ''), '#', 1), '?', 2);
  v_raw   text;
  v_out   text;
BEGIN
  v_raw := (regexp_match('&' || v_query, '&' || p_key || '=([^&]*)'))[1];
  IF v_raw IS NULL OR v_raw = '' THEN RETURN NULL; END IF;
  v_raw := replace(v_raw, '+', ' ');
  BEGIN
    SELECT convert_from(string_agg(
             CASE WHEN m[1] IS NOT NULL THEN decode(m[1], 'hex') ELSE convert_to(m[2], 'UTF8') END,
             ''::bytea ORDER BY ord), 'UTF8')
      INTO v_out
      FROM regexp_matches(v_raw, '%([0-9A-Fa-f]{2})|([^%]+|%)', 'g') WITH ORDINALITY AS t(m, ord);
  EXCEPTION WHEN others THEN
    v_out := v_raw;
  END;
  RETURN nullif(left(trim(v_out), 200), '');
END;
$$;

-- Same signature as 20261015100000; adds first-touch UTM tags on session creation.
CREATE OR REPLACE FUNCTION public.ingest_pageview(
  p_url       text,
  p_session   text,
  p_device    text,
  p_referrer  text,
  p_viewed_at timestamptz,
  p_country   text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_host    text;
  v_site    uuid;
  v_sess    uuid;
  v_ts      timestamptz := coalesce(p_viewed_at, now());
  v_country text := upper(trim(p_country));
BEGIN
  IF p_url IS NULL OR p_session IS NULL THEN RETURN; END IF;

  -- Cloudflare sends XX for unknown and T1 for Tor; anything not alpha-2 is dropped.
  IF v_country IS NULL OR v_country !~ '^[A-Z]{2}$' OR v_country IN ('XX', 'T1') THEN
    v_country := NULL;
  END IF;

  v_host := public._norm_host(p_url);
  IF v_host = '' THEN RETURN; END IF;

  SELECT id INTO v_site FROM sites WHERE public._norm_host(domain) = v_host LIMIT 1;
  IF v_site IS NULL THEN RETURN; END IF;

  SELECT id INTO v_sess FROM tracking_sessions
    WHERE site_id = v_site AND session_id = p_session
    ORDER BY started_at DESC LIMIT 1;

  IF v_sess IS NULL THEN
    INSERT INTO tracking_sessions (site_id, session_id, device_type, referrer, started_at, last_activity, page_views,
                                   country_code, utm_source, utm_medium, utm_campaign, utm_term, utm_content)
    VALUES (v_site, p_session, p_device, p_referrer, v_ts, v_ts, 1, v_country,
            public._url_param(p_url, 'utm_source'), public._url_param(p_url, 'utm_medium'),
            public._url_param(p_url, 'utm_campaign'), public._url_param(p_url, 'utm_term'),
            public._url_param(p_url, 'utm_content'))
    RETURNING id INTO v_sess;
  ELSE
    -- A session keeps the country and UTM tags of its first page view.
    UPDATE tracking_sessions
      SET page_views    = coalesce(page_views, 0) + 1,
          last_activity = greatest(last_activity, v_ts),
          duration_seconds = greatest(0, extract(epoch FROM (greatest(last_activity, v_ts) - started_at))::int),
          country_code  = coalesce(country_code, v_country)
    WHERE id = v_sess;
  END IF;

  INSERT INTO page_views (site_id, session_id, url, viewed_at, referrer)
  VALUES (v_site, v_sess, p_url, v_ts, p_referrer);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ingest_pageview(text, text, text, text, timestamptz, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.ingest_pageview(text, text, text, text, timestamptz, text) TO service_role;

-- Backfill: tag existing sessions from their first page view's URL.
WITH first_pv AS (
  SELECT DISTINCT ON (pv.session_id) pv.session_id, pv.url
  FROM public.page_views pv
  WHERE pv.session_id IS NOT NULL
  ORDER BY pv.session_id, pv.viewed_at
)
UPDATE public.tracking_sessions ts
SET utm_source   = public._url_param(f.url, 'utm_source'),
    utm_medium   = public._url_param(f.url, 'utm_medium'),
    utm_campaign = public._url_param(f.url, 'utm_campaign'),
    utm_term     = public._url_param(f.url, 'utm_term'),
    utm_content  = public._url_param(f.url, 'utm_content')
FROM first_pv f
WHERE f.session_id = ts.id
  AND f.url ILIKE '%utm\_%'
  AND ts.utm_source IS NULL AND ts.utm_medium IS NULL AND ts.utm_campaign IS NULL;

-- Sessions per source / medium / campaign for a site and date range, plus how many sessions in
-- the period were tagged at all (so the tab can say why it is empty).
CREATE OR REPLACE FUNCTION public.get_campaign_breakdown(p_site_id uuid, p_from date, p_to date)
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
    SELECT ts.id, lower(ts.utm_source) AS src, lower(ts.utm_medium) AS med, ts.utm_campaign AS camp,
           coalesce(ts.page_views, 0) AS pv
    FROM public.tracking_sessions ts
    WHERE ts.site_id = p_site_id
      AND ts.started_at >= p_from AND ts.started_at < p_to + 1
  ),
  conv AS (
    SELECT DISTINCT ce.session_id
    FROM public.conversion_events ce
    WHERE ce.site_id = p_site_id
      AND ce.created_at >= p_from AND ce.created_at < p_to + 1
  ),
  agg AS (
    SELECT s.src, s.med, s.camp, count(*) AS sessions, sum(s.pv) AS page_views, count(c.session_id) AS conversions
    FROM sess s
    LEFT JOIN conv c ON c.session_id = s.id
    WHERE s.src IS NOT NULL OR s.med IS NOT NULL OR s.camp IS NOT NULL
    GROUP BY s.src, s.med, s.camp
  )
  SELECT jsonb_build_object(
    'total_sessions',  (SELECT count(*) FROM sess),
    'tagged_sessions', (SELECT coalesce(sum(sessions), 0) FROM agg),
    'campaigns', coalesce((SELECT jsonb_agg(jsonb_build_object(
                   'utm_source',   src,
                   'utm_medium',   med,
                   'utm_campaign', camp,
                   'sessions',     sessions,
                   'page_views',   page_views,
                   'conversions',  conversions
                 ) ORDER BY sessions DESC, src, med, camp) FROM agg), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_campaign_breakdown(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_campaign_breakdown(uuid, date, date) TO authenticated;

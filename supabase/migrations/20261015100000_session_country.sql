-- supabase/migrations/20261015100000_session_country.sql
-- Locations tab: record the visitor's country on each session and serve a per-country
-- breakdown. Country comes from Cloudflare's CF-IPCountry header in track-event; only the
-- ISO 3166-1 alpha-2 code is stored (no IP, region or city).
--
-- Replaces the 2026-02 geolocation_* aggregate design, which read columns tracking_sessions
-- never had and was never scheduled, so its tables stayed empty.

ALTER TABLE public.tracking_sessions
  ADD COLUMN IF NOT EXISTS country_code text
  CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$');

CREATE INDEX IF NOT EXISTS idx_tracking_sessions_site_started_country
  ON public.tracking_sessions (site_id, started_at, country_code);

-- New trailing p_country (DEFAULT NULL) so the currently deployed 5-argument call keeps
-- resolving while track-event is redeployed.
DROP FUNCTION IF EXISTS public.ingest_pageview(text, text, text, text, timestamptz);

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
    INSERT INTO tracking_sessions (site_id, session_id, device_type, referrer, started_at, last_activity, page_views, country_code)
    VALUES (v_site, p_session, p_device, p_referrer, v_ts, v_ts, 1, v_country)
    RETURNING id INTO v_sess;
  ELSE
    -- A session keeps the country of its first page view.
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

-- Per-country sessions for a site and date range. Sessions without a country (before this
-- migration, or XX/T1) are returned as one row with country_code null so totals match the
-- Overview.
CREATE OR REPLACE FUNCTION public.get_geo_breakdown(p_site_id uuid, p_from date, p_to date)
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
    SELECT ts.id, ts.country_code, coalesce(ts.page_views, 0) AS pv, coalesce(ts.duration_seconds, 0) AS dur
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
    SELECT s.country_code,
           count(*)                                                  AS sessions,
           sum(s.pv)                                                 AS page_views,
           round(100.0 * count(*) FILTER (WHERE s.pv <= 1) / count(*), 1) AS bounce_rate,
           round(avg(s.dur))                                         AS avg_duration,
           count(c.session_id)                                       AS conversions
    FROM sess s
    LEFT JOIN conv c ON c.session_id = s.id
    GROUP BY s.country_code
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'country_code', country_code,
           'sessions',     sessions,
           'page_views',   page_views,
           'bounce_rate',  bounce_rate,
           'avg_duration', avg_duration,
           'conversions',  conversions
         ) ORDER BY country_code IS NULL, sessions DESC, country_code), '[]'::jsonb)
  INTO v_result
  FROM agg;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_geo_breakdown(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_geo_breakdown(uuid, date, date) TO authenticated;

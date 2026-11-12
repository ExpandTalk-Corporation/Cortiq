-- supabase/migrations/20261124000001_session_browser_os.sql
-- Browser and OS per visit. tracking_sessions.browser and .os have existed since 2025, and the
-- cookie-free summary groups by them, but ingest_pageview never received them, so every visit
-- showed as "unknown". track-event now derives the families (Chrome, Safari, iOS, Windows ...)
-- from the request's User-Agent and passes them here. Same body as 20261120000001 otherwise.
-- Existing rows are untouched.

DROP FUNCTION IF EXISTS public.ingest_pageview(text, text, text, text, timestamptz, text);

CREATE OR REPLACE FUNCTION public.ingest_pageview(
  p_url       text,
  p_session   text,
  p_device    text,
  p_referrer  text,
  p_viewed_at timestamptz,
  p_country   text DEFAULT NULL,
  p_browser   text DEFAULT NULL,
  p_os        text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_host    text;
  v_site    uuid;
  v_timeout integer;
  v_sess    uuid;
  v_ts      timestamptz := coalesce(p_viewed_at, now());
  v_country text := upper(trim(p_country));
  v_browser text := nullif(left(trim(p_browser), 40), '');
  v_os      text := nullif(left(trim(p_os), 40), '');
BEGIN
  IF p_url IS NULL OR p_session IS NULL THEN RETURN; END IF;

  -- Cloudflare sends XX for unknown and T1 for Tor; anything not alpha-2 is dropped.
  IF v_country IS NULL OR v_country !~ '^[A-Z]{2}$' OR v_country IN ('XX', 'T1') THEN
    v_country := NULL;
  END IF;

  v_host := public._norm_host(p_url);
  IF v_host = '' THEN RETURN; END IF;

  SELECT id, coalesce(session_timeout_minutes, 30) INTO v_site, v_timeout
    FROM sites WHERE public._norm_host(domain) = v_host LIMIT 1;
  IF v_site IS NULL THEN RETURN; END IF;

  -- A visit ends after the site's session timeout without activity (page views, plus events
  -- via touch_tracking_session). See 20261120000001_session_timeout.sql.
  SELECT id INTO v_sess FROM tracking_sessions
    WHERE site_id = v_site AND session_id = p_session
      AND coalesce(last_activity, started_at) > v_ts - make_interval(mins => v_timeout)
    ORDER BY started_at DESC LIMIT 1;

  IF v_sess IS NULL THEN
    INSERT INTO tracking_sessions (site_id, session_id, device_type, browser, os, referrer, started_at,
                                   last_activity, page_views, country_code,
                                   utm_source, utm_medium, utm_campaign, utm_term, utm_content)
    VALUES (v_site, p_session, p_device, v_browser, v_os, p_referrer, v_ts, v_ts, 1, v_country,
            public._url_param(p_url, 'utm_source'), public._url_param(p_url, 'utm_medium'),
            public._url_param(p_url, 'utm_campaign'), public._url_param(p_url, 'utm_term'),
            public._url_param(p_url, 'utm_content'))
    RETURNING id INTO v_sess;
  ELSE
    -- A session keeps the country, browser, OS and UTM tags of its first page view.
    UPDATE tracking_sessions
      SET page_views    = coalesce(page_views, 0) + 1,
          last_activity = greatest(last_activity, v_ts),
          duration_seconds = greatest(0, extract(epoch FROM (greatest(last_activity, v_ts) - started_at))::int),
          country_code  = coalesce(country_code, v_country),
          browser       = coalesce(browser, v_browser),
          os            = coalesce(os, v_os)
    WHERE id = v_sess;
  END IF;

  INSERT INTO page_views (site_id, session_id, url, viewed_at, referrer)
  VALUES (v_site, v_sess, p_url, v_ts, p_referrer);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ingest_pageview(text, text, text, text, timestamptz, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.ingest_pageview(text, text, text, text, timestamptz, text, text, text) TO service_role;

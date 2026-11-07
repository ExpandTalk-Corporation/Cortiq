-- supabase/migrations/20261108000001_visit_inactivity_timeout.sql
-- Visits end after 30 minutes of inactivity, as in GA4 and in aggregate measurement.
-- Until now a Full-mode session lasted as long as the browser tab, so a tab left open overnight
-- turned into one visit spanning days, with an inflated duration and no new traffic source.
-- Only new page views are affected; existing sessions are not split retroactively.

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

  -- A visit ends after 30 minutes without a page view (GA4's default session timeout). The
  -- tracker's session id lives as long as the tab (Full mode) or the page (Cookieless), so a
  -- page view after a longer gap starts a new tracking_sessions row with the same session_id.
  -- Lookups by session_id elsewhere take the newest row (ORDER BY started_at DESC).
  SELECT id INTO v_sess FROM tracking_sessions
    WHERE site_id = v_site AND session_id = p_session
      AND coalesce(last_activity, started_at) > v_ts - interval '30 minutes'
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

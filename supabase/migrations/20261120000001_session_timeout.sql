-- supabase/migrations/20261120000001_session_timeout.sql
-- Configurable session timeout per site (GA4 style). A visit ends after N minutes without
-- tracked activity; default 30, 5-240 allowed (GA4 allows 5 min to 7 h 55 min).
--
-- The tracker (5.5.12+) rotates its session id after the timeout and gets the value with each
-- page view response from track-event. Server side:
--   * ingest_pageview uses the site's timeout instead of the hardcoded 30 minutes, so a page
--     view from an old tracker (same id kept for the whole tab) is still split the same way.
--   * touch_tracking_session lets non-page-view events (clicks, scrolls, content, completed
--     forms, conversions) extend last_activity, so a visit the tracker keeps alive through
--     interaction is not split on the server between two distant page views.
-- Inactivity only: no split at midnight or on a campaign change. Existing rows are untouched.

ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS session_timeout_minutes integer NOT NULL DEFAULT 30
  CONSTRAINT sites_session_timeout_minutes_range CHECK (session_timeout_minutes BETWEEN 5 AND 240);

COMMENT ON COLUMN public.sites.session_timeout_minutes IS
  'Minutes without tracked activity after which a new session starts (GA4 session timeout). 5-240, default 30.';

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
  v_timeout integer;
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

  SELECT id, coalesce(session_timeout_minutes, 30) INTO v_site, v_timeout
    FROM sites WHERE public._norm_host(domain) = v_host LIMIT 1;
  IF v_site IS NULL THEN RETURN; END IF;

  -- A visit ends after the site's session timeout without activity (page views, plus events
  -- via touch_tracking_session). The tracker rotates its id after the same timeout; an older
  -- tracker keeps the id for the whole tab, so a page view after a longer gap starts a new
  -- tracking_sessions row with the same session_id. Lookups by session_id elsewhere take the
  -- newest row (ORDER BY started_at DESC).
  SELECT id INTO v_sess FROM tracking_sessions
    WHERE site_id = v_site AND session_id = p_session
      AND coalesce(last_activity, started_at) > v_ts - make_interval(mins => v_timeout)
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
    -- A session keeps the country and UTM tags of its first page view (no split on a
    -- campaign change, as in GA4 when the timeout is the only rule).
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

-- Activity other than a page view. Extends the newest open visit for this session id; does
-- nothing when there is none (no page view yet, or the visit already timed out: the next
-- page view starts a new one). duration_seconds stays page-view based, as before.
CREATE OR REPLACE FUNCTION public.touch_tracking_session(
  p_site_id uuid,
  p_session text,
  p_at      timestamptz
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_ts      timestamptz := least(coalesce(p_at, now()), now() + interval '5 minutes');
  v_timeout integer;
BEGIN
  IF p_site_id IS NULL OR coalesce(p_session, '') = '' THEN RETURN; END IF;

  SELECT coalesce(session_timeout_minutes, 30) INTO v_timeout FROM public.sites WHERE id = p_site_id;
  IF v_timeout IS NULL THEN RETURN; END IF;

  UPDATE public.tracking_sessions
    SET last_activity = greatest(last_activity, v_ts)
  WHERE id = (
    SELECT id FROM public.tracking_sessions
    WHERE site_id = p_site_id AND session_id = p_session
      AND coalesce(last_activity, started_at) > v_ts - make_interval(mins => v_timeout)
      AND started_at <= v_ts
    ORDER BY started_at DESC LIMIT 1
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.touch_tracking_session(uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.touch_tracking_session(uuid, text, timestamptz) TO service_role;

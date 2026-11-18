-- supabase/migrations/20261203000001_geo_columns.sql
-- Spec 2026-11-18 phase 2 AC4: signed edge geo (source 'ip') and the time zone fallback land on
-- sessions, consents and AI bot rows. Region is kept for US and CA only (state/province rules).
-- No IP is stored. ingest_pageview: same body as 20261124000001 plus p_region/p_geo_source.

ALTER TABLE public.tracking_sessions
  ADD COLUMN IF NOT EXISTS region_code text CHECK (region_code IS NULL OR region_code ~ '^[A-Z0-9]{1,3}$'),
  ADD COLUMN IF NOT EXISTS geo_source  text CHECK (geo_source IS NULL OR geo_source IN ('ip', 'timezone', 'unknown'));

ALTER TABLE public.cookie_consents
  ADD COLUMN IF NOT EXISTS geo_region text CHECK (geo_region IS NULL OR geo_region ~ '^[A-Z0-9]{1,3}$');

ALTER TABLE public.ai_bot_traffic
  ADD COLUMN IF NOT EXISTS country_code text CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
  ADD COLUMN IF NOT EXISTS region_code  text CHECK (region_code IS NULL OR region_code ~ '^[A-Z0-9]{1,3}$');

DROP FUNCTION IF EXISTS public.ingest_pageview(text, text, text, text, timestamptz, text, text, text);

CREATE OR REPLACE FUNCTION public.ingest_pageview(
  p_url        text,
  p_session    text,
  p_device     text,
  p_referrer   text,
  p_viewed_at  timestamptz,
  p_country    text DEFAULT NULL,
  p_browser    text DEFAULT NULL,
  p_os         text DEFAULT NULL,
  p_region     text DEFAULT NULL,
  p_geo_source text DEFAULT NULL
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
  v_region  text := upper(trim(p_region));
  v_source  text := lower(trim(p_geo_source));
  v_browser text := nullif(left(trim(p_browser), 40), '');
  v_os      text := nullif(left(trim(p_os), 40), '');
BEGIN
  IF p_url IS NULL OR p_session IS NULL THEN RETURN; END IF;

  -- Cloudflare sends XX for unknown and T1 for Tor; anything not alpha-2 is dropped.
  IF v_country IS NULL OR v_country !~ '^[A-Z]{2}$' OR v_country IN ('XX', 'T1') THEN
    v_country := NULL;
  END IF;
  IF v_country NOT IN ('US', 'CA') OR v_country IS NULL OR v_region !~ '^[A-Z0-9]{1,3}$' THEN
    v_region := NULL;
  END IF;
  IF v_source IS NULL OR v_source NOT IN ('ip', 'timezone', 'unknown') THEN
    v_source := 'unknown';
  END IF;
  IF v_country IS NULL THEN v_source := 'unknown'; END IF;

  v_host := public._norm_host(p_url);
  IF v_host = '' THEN RETURN; END IF;

  SELECT id, coalesce(session_timeout_minutes, 30) INTO v_site, v_timeout
    FROM sites WHERE public._norm_host(domain) = v_host LIMIT 1;
  IF v_site IS NULL THEN RETURN; END IF;

  SELECT id INTO v_sess FROM tracking_sessions
    WHERE site_id = v_site AND session_id = p_session
      AND coalesce(last_activity, started_at) > v_ts - make_interval(mins => v_timeout)
    ORDER BY started_at DESC LIMIT 1;

  IF v_sess IS NULL THEN
    INSERT INTO tracking_sessions (site_id, session_id, device_type, browser, os, referrer, started_at,
                                   last_activity, page_views, country_code, region_code, geo_source,
                                   utm_source, utm_medium, utm_campaign, utm_term, utm_content)
    VALUES (v_site, p_session, p_device, v_browser, v_os, p_referrer, v_ts, v_ts, 1, v_country, v_region, v_source,
            public._url_param(p_url, 'utm_source'), public._url_param(p_url, 'utm_medium'),
            public._url_param(p_url, 'utm_campaign'), public._url_param(p_url, 'utm_term'),
            public._url_param(p_url, 'utm_content'))
    RETURNING id INTO v_sess;
  ELSE
    -- A session keeps the geo, browser, OS and UTM tags of its first page view; a later view
    -- fills geo only if the first had none.
    UPDATE tracking_sessions
      SET page_views    = coalesce(page_views, 0) + 1,
          last_activity = greatest(last_activity, v_ts),
          duration_seconds = greatest(0, extract(epoch FROM (greatest(last_activity, v_ts) - started_at))::int),
          region_code   = CASE WHEN country_code IS NULL THEN v_region ELSE region_code END,
          geo_source    = CASE WHEN country_code IS NULL THEN v_source ELSE geo_source END,
          country_code  = coalesce(country_code, v_country),
          browser       = coalesce(browser, v_browser),
          os            = coalesce(os, v_os)
    WHERE id = v_sess;
  END IF;

  INSERT INTO page_views (site_id, session_id, url, viewed_at, referrer)
  VALUES (v_site, v_sess, p_url, v_ts, p_referrer);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ingest_pageview(text, text, text, text, timestamptz, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.ingest_pageview(text, text, text, text, timestamptz, text, text, text, text, text) TO service_role;

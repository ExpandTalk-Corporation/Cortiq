-- supabase/migrations/20261117000005_click_fraud_signals.sql
-- Click-fraud signals for paid traffic, computed from CortIQ's own data so the Click fraud tab
-- works without a Google Ads connection. The click-fraud-analysis Edge Function scores these
-- (supabase/functions/_shared/click-fraud-score.ts) and adds Google Ads clicks, invalid clicks,
-- placements and location targets when the site is connected.
--
-- A session is paid when utm_medium is a paid medium OR its landing URL carries a Google/Microsoft
-- click id (gclid, gbraid, wbraid, msclkid). Signals per session:
--   bot          - an ai_bot_traffic row for the session (known bot/agent UA, or the JS probe saw
--                  webdriver/headless automation)
--   reused click - the same click id landed in more than one browser session. A real ad click
--                  creates one click id; reloads stay in the same session.
--   burst        - the session started in a 10-minute window holding an unusual number of paid
--                  sessions for its campaign: >= 5, and >= 4x the campaign's average active window
--                  or >= 25% of the campaign's paid sessions that day
--   zero engage  - one page view, no recorded interaction (content/form/click events) and no
--                  conversion
-- Click id values, session tokens and IP addresses are never returned; only counts leave the
-- function. No IP is read (tracking sessions do not store one); datacenter detection is therefore
-- not available.
--
-- Contract (same as the tab RPCs): caller must own the site, range at most 366 days, UTC dates.

CREATE INDEX IF NOT EXISTS idx_ai_bot_traffic_site_session ON public.ai_bot_traffic(site_id, session_id);

CREATE OR REPLACE FUNCTION public.get_click_fraud_signals(p_site_id uuid, p_from date, p_to date)
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
    SELECT ts.id, ts.session_id, ts.started_at, ts.page_views, ts.device_type,
           NULLIF(upper(ts.country_code), '') AS country,
           lower(coalesce(ts.utm_medium, '')) AS medium,
           coalesce(NULLIF(ts.utm_source, ''), '(not set)') AS source,
           coalesce(NULLIF(ts.utm_campaign, ''), '(not set)') AS campaign,
           NULLIF(coalesce(NULLIF(ts.utm_content, ''), ts.utm_term), '') AS placement,
           lp.url AS landing_url
    FROM public.tracking_sessions ts
    LEFT JOIN LATERAL (
      SELECT pv.url FROM public.page_views pv WHERE pv.session_id = ts.id ORDER BY pv.viewed_at LIMIT 1
    ) lp ON true
    WHERE ts.site_id = p_site_id
      AND ts.started_at >= p_from AND ts.started_at < p_to + 1
  ),
  paid AS (
    SELECT s.*,
           coalesce(public._url_param(s.landing_url, 'gclid'), public._url_param(s.landing_url, 'gbraid'),
                    public._url_param(s.landing_url, 'wbraid'), public._url_param(s.landing_url, 'msclkid')) AS click_id,
           (s.started_at AT TIME ZONE 'UTC')::date AS day,
           date_trunc('hour', s.started_at) + floor(extract(minute FROM s.started_at) / 10) * interval '10 minutes' AS bucket
    FROM sess s
    WHERE s.medium IN ('cpc', 'ppc', 'paid', 'paid-social', 'paid_social', 'display', 'paid_search', 'paidsearch')
       OR s.landing_url ~* '[?&](gclid|gbraid|wbraid|msclkid)='
  ),
  reuse AS (
    SELECT click_id, count(DISTINCT session_id) AS n
    FROM paid WHERE click_id IS NOT NULL
    GROUP BY click_id
  ),
  buckets AS (
    SELECT campaign, bucket, count(*) AS n FROM paid GROUP BY campaign, bucket
  ),
  bucket_norm AS (
    SELECT campaign, avg(n) AS avg_n FROM buckets GROUP BY campaign
  ),
  campaign_day AS (
    SELECT campaign, day, count(*) AS n FROM paid GROUP BY campaign, day
  ),
  flagged AS (
    SELECT p.day, p.campaign, p.source, p.placement, p.country, p.device_type, p.started_at,
           (p.click_id IS NOT NULL) AS has_click_id,
           (p.source ILIKE '%google%' OR p.landing_url ~* '[?&](gclid|gbraid|wbraid)=') AS is_google,
           coalesce(r.n, 0) > 1 AS reused_click,
           (b.n >= 5 AND (b.n >= 4 * bn.avg_n OR b.n >= 0.25 * cd.n)) AS burst,
           EXISTS (SELECT 1 FROM public.ai_bot_traffic bt WHERE bt.site_id = p_site_id AND bt.session_id = p.session_id) AS bot,
           EXISTS (SELECT 1 FROM public.conversion_events ce WHERE ce.session_id = p.id) AS converted,
           (coalesce(p.page_views, 1) <= 1
             AND NOT EXISTS (SELECT 1 FROM public.tracking_events te
                             WHERE te.session_id = p.session_id
                               AND te.event_type IN ('content', 'click', 'form_session', 'conversion', 'submission'))) AS single_view_no_action
    FROM paid p
    LEFT JOIN reuse r ON r.click_id = p.click_id
    JOIN buckets b ON b.campaign = p.campaign AND b.bucket = p.bucket
    JOIN bucket_norm bn ON bn.campaign = p.campaign
    JOIN campaign_day cd ON cd.campaign = p.campaign AND cd.day = p.day
  ),
  f AS (
    SELECT *, (single_view_no_action AND NOT converted) AS zero_engagement FROM flagged
  )
  SELECT jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'paid_sessions', (SELECT count(*) FROM f),
    'totals', (SELECT jsonb_build_object(
        'paid_sessions', count(*),
        'google_sessions', count(*) FILTER (WHERE is_google),
        'with_click_id', count(*) FILTER (WHERE has_click_id),
        'bot_sessions', count(*) FILTER (WHERE bot),
        'reused_click_sessions', count(*) FILTER (WHERE reused_click),
        'burst_sessions', count(*) FILTER (WHERE burst),
        'zero_engagement_sessions', count(*) FILTER (WHERE zero_engagement),
        'conversions', count(*) FILTER (WHERE converted)) FROM f),
    'days', coalesce((SELECT jsonb_agg(d ORDER BY d->>'date') FROM (
        SELECT jsonb_build_object(
          'date', day,
          'paid_sessions', count(*),
          'google_sessions', count(*) FILTER (WHERE is_google),
          'bot_sessions', count(*) FILTER (WHERE bot),
          'reused_click_sessions', count(*) FILTER (WHERE reused_click),
          'burst_sessions', count(*) FILTER (WHERE burst),
          'zero_engagement_sessions', count(*) FILTER (WHERE zero_engagement),
          'conversions', count(*) FILTER (WHERE converted)) AS d
        FROM f GROUP BY day) x), '[]'::jsonb),
    'campaigns', coalesce((SELECT jsonb_agg(c ORDER BY (c->>'paid_sessions')::int DESC) FROM (
        SELECT jsonb_build_object(
          'campaign', campaign,
          'sources', (SELECT jsonb_agg(DISTINCT f2.source) FROM f f2 WHERE f2.campaign = f.campaign),
          'paid_sessions', count(*),
          'google_sessions', count(*) FILTER (WHERE is_google),
          'bot_sessions', count(*) FILTER (WHERE bot),
          'reused_click_sessions', count(*) FILTER (WHERE reused_click),
          'burst_sessions', count(*) FILTER (WHERE burst),
          'zero_engagement_sessions', count(*) FILTER (WHERE zero_engagement),
          'conversions', count(*) FILTER (WHERE converted),
          'countries', (SELECT coalesce(jsonb_object_agg(cc.country, cc.n), '{}'::jsonb) FROM (
              SELECT f3.country, count(*) AS n FROM f f3
              WHERE f3.campaign = f.campaign AND f3.country IS NOT NULL
              GROUP BY f3.country) cc)) AS c
        FROM f GROUP BY campaign
        ORDER BY count(*) DESC LIMIT 100) y), '[]'::jsonb),
    'placements', coalesce((SELECT jsonb_agg(pl ORDER BY (pl->>'paid_sessions')::int DESC) FROM (
        SELECT jsonb_build_object(
          'campaign', campaign,
          'placement', placement,
          'paid_sessions', count(*),
          'bot_sessions', count(*) FILTER (WHERE bot),
          'reused_click_sessions', count(*) FILTER (WHERE reused_click),
          'burst_sessions', count(*) FILTER (WHERE burst),
          'zero_engagement_sessions', count(*) FILTER (WHERE zero_engagement),
          'conversions', count(*) FILTER (WHERE converted)) AS pl
        FROM f WHERE placement IS NOT NULL
        GROUP BY campaign, placement
        ORDER BY count(*) DESC LIMIT 100) z), '[]'::jsonb),
    'hours_utc', coalesce((SELECT jsonb_agg(jsonb_build_object('hour', h, 'sessions', n) ORDER BY h) FROM (
        SELECT extract(hour FROM started_at AT TIME ZONE 'UTC')::int AS h, count(*) AS n FROM f GROUP BY 1) hh), '[]'::jsonb),
    'devices', (SELECT coalesce(jsonb_object_agg(dv.device, dv.n), '{}'::jsonb) FROM (
        SELECT coalesce(device_type, 'unknown') AS device, count(*) AS n FROM f GROUP BY 1) dv)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_click_fraud_signals(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_click_fraud_signals(uuid, date, date) TO authenticated;

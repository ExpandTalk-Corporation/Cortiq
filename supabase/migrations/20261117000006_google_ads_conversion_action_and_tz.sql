-- supabase/migrations/20261117000006_google_ads_conversion_action_and_tz.sql
-- Google Ads setup follow-ups (PR #119):
--
-- 1. Conversion action for lead-quality uploads. google-ads-quality-upload sends
--    UploadClickConversions to the "Import from clicks" (UPLOAD_CLICKS) action the site owner picks
--    in Settings -> Integrations -> Google Ads. Never to a tag id ("AW-..."). The eligible actions
--    and the tracking check (does the account/campaign final URL suffix set utm_campaign?) are
--    cached on the connection by google-ads-oauth (action refresh_setup). Only the service role
--    writes these columns; owners read them through the existing SELECT policy. No token here.
--
-- 2. get_click_fraud_signals gains two optional arguments:
--    p_tz              the Google Ads account time zone (customer.time_zone). The range, the day of
--                      each session and the hour-of-day chart use this zone, so CortIQ days line up
--                      with Ads dates. Default 'UTC' (previous behaviour).
--    p_click_campaigns {gclid: Ads campaign id} from click_view (read by the Edge Function, one day
--                      per query, last 90 days only). A session whose gclid is in the map is
--                      attributed to that campaign id; utm_campaign is the fallback. Input only:
--                      click ids are never returned.
--    The 3-argument version is dropped so PostgREST has one unambiguous signature.

ALTER TABLE public.google_ads_connections
  ADD COLUMN IF NOT EXISTS conversion_action_id   text CHECK (conversion_action_id IS NULL OR conversion_action_id ~ '^[0-9]{1,20}$'),
  ADD COLUMN IF NOT EXISTS conversion_action_name text,
  ADD COLUMN IF NOT EXISTS conversion_actions     jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS tracking_check         jsonb,
  ADD COLUMN IF NOT EXISTS setup_checked_at       timestamptz;

COMMENT ON COLUMN public.google_ads_connections.conversion_action_id IS
  'UPLOAD_CLICKS conversion action that receives lead-quality uploads. NULL = uploads wait (status no_conversion_action).';
COMMENT ON COLUMN public.google_ads_connections.conversion_actions IS
  'Enabled UPLOAD_CLICKS actions of the account at setup_checked_at: [{id,name,type,status,category}].';
COMMENT ON COLUMN public.google_ads_connections.tracking_check IS
  'Final URL suffix check: does utm_campaign reach CortIQ for each enabled campaign (account/campaign level only).';

DROP FUNCTION IF EXISTS public.get_click_fraud_signals(uuid, date, date);

CREATE OR REPLACE FUNCTION public.get_click_fraud_signals(
  p_site_id uuid, p_from date, p_to date, p_tz text DEFAULT 'UTC', p_click_campaigns jsonb DEFAULT NULL)
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
  p_tz := coalesce(NULLIF(p_tz, ''), 'UTC');
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = p_tz) THEN
    RAISE EXCEPTION 'invalid time zone' USING ERRCODE = '22023';
  END IF;
  IF p_click_campaigns IS NOT NULL AND (
       jsonb_typeof(p_click_campaigns) <> 'object'
       OR (SELECT count(*) FROM jsonb_object_keys(p_click_campaigns)) > 50000) THEN
    RAISE EXCEPTION 'invalid click campaign map' USING ERRCODE = '22023';
  END IF;
  p_click_campaigns := coalesce(p_click_campaigns, '{}'::jsonb);

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
      AND ts.started_at >= (p_from::timestamp AT TIME ZONE p_tz)
      AND ts.started_at <  ((p_to + 1)::timestamp AT TIME ZONE p_tz)
  ),
  paid0 AS (
    SELECT s.*,
           public._url_param(s.landing_url, 'gclid') AS gclid,
           coalesce(public._url_param(s.landing_url, 'gclid'), public._url_param(s.landing_url, 'gbraid'),
                    public._url_param(s.landing_url, 'wbraid'), public._url_param(s.landing_url, 'msclkid')) AS click_id,
           (s.started_at AT TIME ZONE p_tz)::date AS day,
           date_trunc('hour', s.started_at) + floor(extract(minute FROM s.started_at) / 10) * interval '10 minutes' AS bucket
    FROM sess s
    WHERE s.medium IN ('cpc', 'ppc', 'paid', 'paid-social', 'paid_social', 'display', 'paid_search', 'paidsearch')
       OR s.landing_url ~* '[?&](gclid|gbraid|wbraid|msclkid)='
  ),
  -- gclid -> Ads campaign id (click_view, passed in by the Edge Function) wins over utm_campaign,
  -- so sessions match their campaign without utm tags. gbraid/wbraid are not in click_view.
  paid AS (
    SELECT p0.id, p0.session_id, p0.started_at, p0.page_views, p0.device_type, p0.country, p0.medium,
           p0.source, p0.placement, p0.landing_url, p0.click_id, p0.day, p0.bucket,
           coalesce(p_click_campaigns ->> p0.gclid, p0.campaign) AS campaign,
           (p0.gclid IS NOT NULL AND p_click_campaigns ? p0.gclid) AS matched_by_click
    FROM paid0 p0
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
    SELECT p.day, p.campaign, p.matched_by_click, p.source, p.placement, p.country, p.device_type, p.started_at,
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
        'conversions', count(*) FILTER (WHERE converted),
        'matched_by_click', count(*) FILTER (WHERE matched_by_click)) FROM f),
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
    'timezone', p_tz,
    'hours', coalesce((SELECT jsonb_agg(jsonb_build_object('hour', h, 'sessions', n) ORDER BY h) FROM (
        SELECT extract(hour FROM started_at AT TIME ZONE p_tz)::int AS h, count(*) AS n FROM f GROUP BY 1) hh), '[]'::jsonb),
    'devices', (SELECT coalesce(jsonb_object_agg(dv.device, dv.n), '{}'::jsonb) FROM (
        SELECT coalesce(device_type, 'unknown') AS device, count(*) AS n FROM f GROUP BY 1) dv)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_click_fraud_signals(uuid, date, date, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_click_fraud_signals(uuid, date, date, text, jsonb) TO authenticated;

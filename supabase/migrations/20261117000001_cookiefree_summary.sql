-- supabase/migrations/20261117000001_cookiefree_summary.sql
-- Cookie-free tab: aggregate in SQL instead of in the cookiefree-analytics Edge Function.
-- The function paged through tracking_sessions, page_views and cookie_consents with
-- select('*') in 1000-row blocks and counted in Deno, so a busy site needed dozens of
-- sequential round trips. It also used the service role without checking who asked.
--
-- get_cookiefree_summary returns raw counts only; rates, rounding and the consent-loss
-- estimate are computed in src/lib/cookiefreeSummary.ts. Same contract as the other tab
-- RPCs: caller must own the site, range at most 366 days.

-- Range scans per site. page_views (site_id, viewed_at) and tracking_sessions
-- (site_id, started_at) already exist; cookie_consents only had (created_at).
CREATE INDEX IF NOT EXISTS idx_cookie_consents_site_created
  ON public.cookie_consents (site_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.get_cookiefree_summary(p_site_id uuid, p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sessions jsonb;
  v_pages    jsonb;
  v_banner   jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sites WHERE id = p_site_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from + 1 > 366 THEN
    RAISE EXCEPTION 'invalid range' USING ERRCODE = '22023';
  END IF;

  -- Sessions: totals, duration (capped at 2 h like get_analytics_summary), bounce,
  -- device/browser/OS and referral source buckets.
  WITH s AS (
    SELECT ts.session_id, ts.duration_seconds, ts.page_views,
           coalesce(nullif(ts.device_type, ''), 'unknown') AS device,
           coalesce(nullif(ts.browser, ''), 'unknown')     AS browser,
           coalesce(nullif(ts.os, ''), 'unknown')          AS os,
           CASE
             WHEN coalesce(ts.referrer, '') = ''       THEN 'Direct'
             WHEN ts.referrer LIKE '%google%'          THEN 'Google'
             WHEN ts.referrer LIKE '%bing%'            THEN 'Bing'
             WHEN ts.referrer LIKE '%facebook%'        THEN 'Facebook'
             WHEN ts.referrer LIKE '%linkedin%'        THEN 'LinkedIn'
             WHEN ts.referrer LIKE '%twitter%' OR ts.referrer LIKE '%x.com%' THEN 'Twitter/X'
             ELSE 'Other'
           END AS source
    FROM public.tracking_sessions ts
    WHERE ts.site_id = p_site_id
      AND ts.started_at >= p_from AND ts.started_at < p_to + 1
  )
  SELECT jsonb_build_object(
    'sessions',           (SELECT count(*) FROM s),
    'unique_visitors',    (SELECT count(DISTINCT session_id) FROM s),
    'bounces',            (SELECT count(*) FROM s WHERE page_views = 1),
    'duration_sessions',  (SELECT count(*) FROM s WHERE duration_seconds > 0),
    'duration_sum',       (SELECT coalesce(sum(least(duration_seconds, 7200)), 0) FROM s WHERE duration_seconds > 0),
    'devices',  coalesce((SELECT jsonb_object_agg(device, n)  FROM (SELECT device,  count(*) AS n FROM s GROUP BY device)  d), '{}'::jsonb),
    'browsers', coalesce((SELECT jsonb_object_agg(browser, n) FROM (SELECT browser, count(*) AS n FROM s GROUP BY browser) b), '{}'::jsonb),
    'os',       coalesce((SELECT jsonb_object_agg(os, n)      FROM (SELECT os,      count(*) AS n FROM s GROUP BY os)      o), '{}'::jsonb),
    'sources',  coalesce((SELECT jsonb_object_agg(source, n)  FROM (SELECT source,  count(*) AS n FROM s GROUP BY source)  r), '{}'::jsonb)
  ) INTO v_sessions;

  -- Page views: total and top 10 pages. URLs are grouped without query string or fragment
  -- (utm variants are one page). Time on page is derived from the next view in the same
  -- session (page_views.time_on_page is not written by the current ingest), capped at 30 min;
  -- the last view of a session has no successor and gives no sample.
  WITH pv AS (
    SELECT v.session_id, v.viewed_at, v.title,
           regexp_replace(v.url, '[?#].*$', '') AS url
    FROM public.page_views v
    WHERE v.site_id = p_site_id
      AND v.viewed_at >= p_from AND v.viewed_at < p_to + 1
  ),
  timed AS (
    SELECT pv.*,
           extract(epoch FROM lead(pv.viewed_at) OVER (PARTITION BY pv.session_id ORDER BY pv.viewed_at) - pv.viewed_at) AS gap
    FROM pv
  ),
  pages AS (
    SELECT t.url,
           count(*) AS views,
           (array_agg(t.title ORDER BY t.viewed_at) FILTER (WHERE coalesce(t.title, '') <> ''))[1] AS title,
           round(avg(t.gap) FILTER (WHERE t.gap > 0 AND t.gap <= 1800))::int AS avg_time
    FROM timed t
    GROUP BY t.url
    ORDER BY views DESC, t.url
    LIMIT 10
  )
  SELECT jsonb_build_object(
    'page_views', (SELECT count(*) FROM pv),
    'top_pages',  coalesce((SELECT jsonb_agg(jsonb_build_object('url', url, 'views', views, 'title', title, 'avgTime', coalesce(avg_time, 0))
                                             ORDER BY views DESC, url) FROM pages), '[]'::jsonb)
  ) INTO v_pages;

  -- Banner answers. "Accepted all" / "rejected all" follow the JS truthiness the Edge
  -- Function used; analytics_granted is strictly analytics = true (src/lib/consentAcceptance.ts).
  WITH c AS (
    SELECT coalesce(cc.consent_types->'analytics'   NOT IN ('false'::jsonb, '0'::jsonb, '""'::jsonb, 'null'::jsonb), false) AS a,
           coalesce(cc.consent_types->'marketing'   NOT IN ('false'::jsonb, '0'::jsonb, '""'::jsonb, 'null'::jsonb), false) AS m,
           coalesce(cc.consent_types->'preferences' NOT IN ('false'::jsonb, '0'::jsonb, '""'::jsonb, 'null'::jsonb), false) AS p,
           coalesce(cc.consent_types->'analytics' = 'true'::jsonb, false) AS analytics_true
    FROM public.cookie_consents cc
    WHERE cc.site_id = p_site_id
      AND cc.created_at >= p_from AND cc.created_at < p_to + 1
  )
  SELECT jsonb_build_object(
    'banner_views',      count(*),
    'accepted_all',      count(*) FILTER (WHERE a AND m AND p),
    'rejected_all',      count(*) FILTER (WHERE NOT a AND NOT m AND NOT p),
    'selective',         count(*) FILTER (WHERE (a OR m OR p) AND NOT (a AND m AND p)),
    'analytics_granted', count(*) FILTER (WHERE analytics_true)
  ) INTO v_banner
  FROM c;

  RETURN v_sessions || v_pages || v_banner;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_cookiefree_summary(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cookiefree_summary(uuid, date, date) TO authenticated;

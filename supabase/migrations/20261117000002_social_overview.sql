-- supabase/migrations/20261117000002_social_overview.sql
-- Social Media tab, one read RPC. Same contract as the other tab RPCs: caller must own the
-- site, range at most 366 days, URL/segment filters through session_matches_filters.
--
-- social_network(host, utm_source): which social network a visit came from. utm_source wins
--   over the referrer host because in-app browsers (Instagram, TikTok, Facebook) often send
--   no referrer at all. Mirrored in src/lib/socialNetworks.ts (parity test in
--   tests/foundation/social-overview.test.mjs).
-- get_social_overview: per-network visits, page views, engaged visits (GA4: >=10 s, >=2 page
--   views or a conversion), conversions, key-page visits, paid vs organic, landing pages,
--   campaigns, daily trend, and the consent-free aggregate counts when the site has
--   aggregate measurement on.
--
-- Paid: a paid utm_medium (cpc, paid-social ...) or a Meta/TikTok/LinkedIn click ID on the
-- visitor. Click IDs are only stored with marketing consent, and Facebook also appends fbclid
-- to organic outbound links, so the click-ID share is a signal, not a precise paid count.

CREATE OR REPLACE FUNCTION public.social_network(p_host text, p_utm_source text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  WITH n AS (
    SELECT lower(btrim(coalesce(p_utm_source, ''))) AS src,
           regexp_replace(split_part(split_part(split_part(regexp_replace(lower(btrim(coalesce(p_host, ''))), '^[a-z]+://', ''), '/', 1), '?', 1), ':', 1), '^(www|m|mobile|l|lm)\.', '') AS host
  )
  SELECT CASE
    WHEN src IN ('facebook', 'facebook.com', 'fb', 'meta') THEN 'facebook'
    WHEN src IN ('instagram', 'instagram.com', 'ig') THEN 'instagram'
    WHEN src IN ('linkedin', 'linkedin.com', 'lnkd', 'lnkd.in', 'li') THEN 'linkedin'
    WHEN src IN ('twitter', 'twitter.com', 'x', 'x.com', 't.co', 'tw') THEN 'x'
    WHEN src IN ('tiktok', 'tiktok.com', 'tt') THEN 'tiktok'
    WHEN src IN ('youtube', 'youtube.com', 'yt') THEN 'youtube'
    WHEN src IN ('pinterest', 'pinterest.com', 'pin') THEN 'pinterest'
    WHEN src IN ('reddit', 'reddit.com') THEN 'reddit'
    WHEN src IN ('threads', 'threads.net', 'threads.com') THEN 'threads'
    WHEN src IN ('bluesky', 'bsky', 'bsky.app') THEN 'bluesky'
    WHEN src IN ('mastodon') THEN 'mastodon'
    WHEN src IN ('snapchat', 'snapchat.com', 'snap') THEN 'snapchat'
    WHEN host ~ '(^|\.)(facebook\.com|fb\.com|fb\.me)$' THEN 'facebook'
    WHEN host ~ '(^|\.)instagram\.com$' THEN 'instagram'
    WHEN host ~ '(^|\.)(linkedin\.com|lnkd\.in)$' THEN 'linkedin'
    WHEN host ~ '(^|\.)(twitter\.com|x\.com|t\.co)$' THEN 'x'
    WHEN host ~ '(^|\.)tiktok\.com$' THEN 'tiktok'
    WHEN host ~ '(^|\.)(youtube\.com|youtu\.be)$' THEN 'youtube'
    WHEN host ~ '(^|\.)(pinterest\.[a-z.]+|pin\.it)$' THEN 'pinterest'
    WHEN host ~ '(^|\.)(reddit\.com|redd\.it)$' THEN 'reddit'
    WHEN host ~ '(^|\.)(threads\.net|threads\.com)$' THEN 'threads'
    WHEN host ~ '(^|\.)(bsky\.app|bsky\.social)$' THEN 'bluesky'
    WHEN host ~ '(^|\.)(mastodon\.[a-z.]+|mstdn\.[a-z.]+|mas\.to)$' THEN 'mastodon'
    WHEN host ~ '(^|\.)snapchat\.com$' THEN 'snapchat'
  END
  FROM n
$$;

-- utm_medium values that mean "social". Visits tagged this way with an unknown source count as 'other'.
CREATE OR REPLACE FUNCTION public.is_social_medium(p_medium text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT lower(btrim(coalesce(p_medium, ''))) IN
    ('social', 'social-network', 'social_network', 'social-media', 'social_media', 'socialmedia', 'sm', 'sm-organic',
     'organic-social', 'organic_social', 'paid-social', 'paid_social', 'paidsocial', 'social-paid', 'social_paid')
$$;

-- Paid utm_medium values: src/lib/paidMediums.ts plus the social-specific spellings.
CREATE OR REPLACE FUNCTION public.is_paid_social_medium(p_medium text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT lower(btrim(coalesce(p_medium, ''))) IN
    ('cpc', 'ppc', 'paid-social', 'display', 'paid', 'paid_social', 'paidsocial', 'social-paid', 'social_paid', 'cpm', 'cpv')
$$;

CREATE OR REPLACE FUNCTION public.get_social_overview(
  p_site_id uuid,
  p_from    date,
  p_to      date,
  p_path    text DEFAULT NULL,
  p_segment jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
  v_aggregate boolean;
  v_agg jsonb := NULL;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sites WHERE id = p_site_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from + 1 > 366 THEN
    RAISE EXCEPTION 'invalid range' USING ERRCODE = '22023';
  END IF;

  WITH s AS (
    SELECT ts.id, ts.session_id, ts.started_at,
           COALESCE(ts.page_views, 0) AS page_views,
           COALESCE(ts.duration_seconds, 0) AS duration_seconds,
           lower(nullif(btrim(ts.utm_source), '')) AS src,
           lower(nullif(btrim(ts.utm_medium), '')) AS medium,
           nullif(btrim(ts.utm_campaign), '') AS campaign,
           COALESCE(public.social_network(COALESCE(nullif(ts.referrer, ''), ts.referrer_url), ts.utm_source),
                    CASE WHEN public.is_social_medium(ts.utm_medium) THEN 'other' END) AS network
    FROM public.tracking_sessions ts
    WHERE ts.site_id = p_site_id
      AND ts.started_at >= p_from AND ts.started_at < p_to + 1
      AND ((p_path IS NULL AND p_segment IS NULL) OR public.session_matches_filters(ts, p_path, p_segment))
  ),
  social AS (
    SELECT * FROM s WHERE s.network IS NOT NULL
  ),
  conv AS (
    SELECT DISTINCT ce.session_id
    FROM public.conversion_events ce
    WHERE ce.site_id = p_site_id
      AND ce.created_at >= p_from AND ce.created_at < p_to + 2
      AND ce.session_id IN (SELECT id FROM social)
  ),
  pv AS (
    SELECT v.session_id, v.viewed_at,
           COALESCE(NULLIF(regexp_replace(regexp_replace(v.url, '^https?://[^/]+', ''), '[?#].*$', ''), ''), '/') AS path
    FROM public.page_views v
    WHERE v.site_id = p_site_id
      AND v.viewed_at >= p_from AND v.viewed_at < p_to + 2
      AND v.session_id IN (SELECT id FROM social)
  ),
  keyp AS (
    SELECT DISTINCT pv.session_id FROM pv WHERE public.key_page_category(pv.path) IS NOT NULL
  ),
  landing AS (
    SELECT DISTINCT ON (pv.session_id) pv.session_id, pv.path
    FROM pv
    ORDER BY pv.session_id, pv.viewed_at
  ),
  clickid AS (
    SELECT DISTINCT so.id
    FROM social so
    WHERE EXISTS (
      SELECT 1 FROM public.unified_visitors uv
      WHERE uv.site_id = p_site_id AND uv.first_session_id = so.session_id
        AND (uv.fbclid IS NOT NULL OR uv.ttclid IS NOT NULL OR uv.li_fat_id IS NOT NULL)
    ) OR EXISTS (
      SELECT 1 FROM public.visitor_session_links l
      JOIN public.unified_visitors uv ON uv.id = l.visitor_id
      WHERE l.site_id = p_site_id AND l.human_session_id = so.id
        AND (uv.fbclid IS NOT NULL OR uv.ttclid IS NOT NULL OR uv.li_fat_id IS NOT NULL)
    )
  ),
  enriched AS (
    SELECT so.*,
           (c.session_id IS NOT NULL) AS converted,
           (k.session_id IS NOT NULL) AS key_page,
           (ci.id IS NOT NULL) AS click_id,
           (so.duration_seconds >= 10 OR so.page_views >= 2 OR c.session_id IS NOT NULL) AS engaged,
           (public.is_paid_social_medium(so.medium) OR ci.id IS NOT NULL) AS paid,
           lp.path AS landing_path
    FROM social so
    LEFT JOIN conv c ON c.session_id = so.id
    LEFT JOIN keyp k ON k.session_id = so.id
    LEFT JOIN clickid ci ON ci.id = so.id
    LEFT JOIN landing lp ON lp.session_id = so.id
  ),
  net AS (
    SELECT e.network,
           count(*)::int AS sessions,
           sum(e.page_views)::int AS page_views,
           count(*) FILTER (WHERE e.engaged)::int AS engaged,
           count(*) FILTER (WHERE e.converted)::int AS conversions,
           count(*) FILTER (WHERE e.key_page)::int AS key_page_visits,
           count(*) FILTER (WHERE e.page_views <= 1)::int AS bounces,
           sum(e.duration_seconds)::bigint AS duration_sum,
           count(*) FILTER (WHERE e.paid)::int AS paid_sessions,
           count(*) FILTER (WHERE e.click_id)::int AS click_id_sessions,
           count(*) FILTER (WHERE e.src IS NOT NULL OR e.medium IS NOT NULL)::int AS tagged_sessions
    FROM enriched e
    GROUP BY e.network
  ),
  daily AS (
    SELECT (e.started_at AT TIME ZONE 'UTC')::date AS day, e.network, count(*)::int AS sessions
    FROM enriched e
    GROUP BY 1, 2
  ),
  lp_ranked AS (
    SELECT x.network, x.path, x.sessions, x.engaged, x.conversions,
           row_number() OVER (PARTITION BY x.network ORDER BY x.sessions DESC, x.path) AS rn
    FROM (
      SELECT e.network, e.landing_path AS path, count(*)::int AS sessions,
             count(*) FILTER (WHERE e.engaged)::int AS engaged,
             count(*) FILTER (WHERE e.converted)::int AS conversions
      FROM enriched e
      WHERE e.landing_path IS NOT NULL
      GROUP BY e.network, e.landing_path
    ) x
  ),
  camp AS (
    SELECT e.network, e.src, e.medium, e.campaign,
           count(*)::int AS sessions,
           count(*) FILTER (WHERE e.engaged)::int AS engaged,
           count(*) FILTER (WHERE e.converted)::int AS conversions,
           bool_or(public.is_paid_social_medium(e.medium)) AS paid
    FROM enriched e
    WHERE e.campaign IS NOT NULL OR public.is_social_medium(e.medium) OR public.is_paid_social_medium(e.medium)
    GROUP BY e.network, e.src, e.medium, e.campaign
    ORDER BY sessions DESC, e.campaign NULLS LAST
    LIMIT 50
  )
  SELECT jsonb_build_object(
    'total_sessions', (SELECT count(*) FROM s),
    'social_sessions', (SELECT count(*) FROM social),
    'networks', COALESCE((SELECT jsonb_agg(to_jsonb(n) ORDER BY n.sessions DESC, n.network) FROM net n), '[]'::jsonb),
    'daily', COALESCE((SELECT jsonb_agg(jsonb_build_object('day', d.day, 'network', d.network, 'sessions', d.sessions) ORDER BY d.day, d.network) FROM daily d), '[]'::jsonb),
    'landing_pages', COALESCE((SELECT jsonb_agg(jsonb_build_object('network', l.network, 'path', l.path, 'sessions', l.sessions, 'engaged', l.engaged, 'conversions', l.conversions) ORDER BY l.network, l.rn) FROM lp_ranked l WHERE l.rn <= 5), '[]'::jsonb),
    'campaigns', COALESCE((SELECT jsonb_agg(jsonb_build_object('network', c.network, 'utm_source', c.src, 'utm_medium', c.medium, 'utm_campaign', c.campaign, 'sessions', c.sessions, 'engaged', c.engaged, 'conversions', c.conversions, 'paid', c.paid) ORDER BY c.sessions DESC) FROM camp c), '[]'::jsonb)
  ) INTO v_result;

  -- Consent-free aggregate counts (no per-visitor data). Not filterable by URL/segment.
  SELECT COALESCE(st.aggregate_measurement, false) INTO v_aggregate FROM public.sites st WHERE st.id = p_site_id;
  IF v_aggregate THEN
    WITH a AS (
      SELECT public.social_network(asd.referrer_domain, asd.utm_source) AS network,
             asd.utm_medium, asd.visits, asd.visitors, asd.engaged_visits
      FROM public.aggregate_sources_daily asd
      WHERE asd.site_id = p_site_id AND asd.day BETWEEN p_from AND p_to
    ),
    an AS (
      SELECT COALESCE(a.network, 'other') AS network,
             sum(a.visits)::bigint AS visits, sum(a.visitors)::bigint AS visitors,
             sum(a.engaged_visits)::bigint AS engaged_visits
      FROM a
      WHERE a.network IS NOT NULL OR public.is_social_medium(a.utm_medium)
      GROUP BY 1
    ),
    ac AS (
      SELECT COALESCE(public.social_network(acd.referrer_domain, acd.utm_source), 'other') AS network,
             sum(acd.conversions)::bigint AS conversions
      FROM public.aggregate_conversions_daily acd
      WHERE acd.site_id = p_site_id AND acd.day BETWEEN p_from AND p_to
        AND (public.social_network(acd.referrer_domain, acd.utm_source) IS NOT NULL OR public.is_social_medium(acd.utm_medium))
      GROUP BY 1
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'network', COALESCE(an.network, ac.network),
             'visits', COALESCE(an.visits, 0), 'visitors', COALESCE(an.visitors, 0),
             'engaged_visits', COALESCE(an.engaged_visits, 0), 'conversions', COALESCE(ac.conversions, 0))
           ORDER BY COALESCE(an.visits, 0) DESC, COALESCE(an.network, ac.network)), '[]'::jsonb)
      INTO v_agg
    FROM an FULL JOIN ac ON ac.network = an.network;
  END IF;

  RETURN v_result || jsonb_build_object('aggregate', jsonb_build_object('enabled', COALESCE(v_aggregate, false), 'networks', COALESCE(v_agg, '[]'::jsonb)));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_social_overview(uuid, date, date, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_social_overview(uuid, date, date, text, jsonb) TO authenticated;

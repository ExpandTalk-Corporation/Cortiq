-- supabase/migrations/20261202000001_source_self_referral_utm.sql
-- Traffic sources (phase 1, spec 2026-11-18 AC2/AC3).
-- 1. A referrer on the site's own domain (www or any subdomain) is navigation, not a source:
--    it counts as (direct)/(none). Before this, ekonom.biz's own /admin pages were its top "referral".
-- 2. A session's first-touch UTM tags win over its referrer, as in GA4. utm_source without
--    utm_medium gets medium '(not set)'; utm_medium alone is ignored.
-- Same JSON contract for get_source_breakdown as 20261114000001.

DROP FUNCTION IF EXISTS public.referrer_source_medium(text);

CREATE OR REPLACE FUNCTION public.session_source_medium(
  p_referrer text, p_utm_source text, p_utm_medium text, p_site_host text,
  OUT source text, OUT medium text)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_host text;
  v_site text := regexp_replace(lower(coalesce(p_site_host, '')), '^www\.', '');
BEGIN
  IF nullif(trim(p_utm_source), '') IS NOT NULL THEN
    source := lower(left(trim(p_utm_source), 100));
    medium := coalesce(lower(left(nullif(trim(p_utm_medium), ''), 100)), '(not set)');
    RETURN;
  END IF;
  IF p_referrer IS NULL OR p_referrer = '' OR p_referrer = '(direct)' THEN
    source := '(direct)'; medium := '(none)'; RETURN;
  END IF;
  v_host := regexp_replace(lower(substring(p_referrer FROM '^[a-zA-Z][a-zA-Z0-9+.-]*://([^/:?#]+)')), '^www\.', '');
  IF v_host IS NULL OR v_host = '' THEN
    source := 'unknown'; medium := 'referral';
  ELSIF v_site <> '' AND (v_host = v_site OR v_host LIKE '%.' || v_site) THEN
    source := '(direct)'; medium := '(none)';
  ELSIF v_host LIKE '%google%' THEN
    source := 'google'; medium := 'organic';
  ELSIF v_host LIKE '%facebook%' THEN
    source := 'facebook'; medium := 'social';
  ELSIF v_host LIKE '%instagram%' THEN
    source := 'instagram'; medium := 'social';
  ELSIF v_host LIKE '%youtube%' THEN
    source := 'youtube'; medium := 'social';
  ELSIF v_host LIKE '%twitter%' OR v_host IN ('x.com', 't.co') THEN
    source := 'twitter'; medium := 'social';
  ELSIF v_host LIKE '%linkedin%' THEN
    source := 'linkedin'; medium := 'social';
  ELSE
    source := v_host; medium := 'referral';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_source_breakdown(
  p_site_id uuid, p_from date, p_to date,
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
  v_host   text;
BEGIN
  SELECT public._norm_host(s.domain) INTO v_host FROM public.sites s
   WHERE s.id = p_site_id AND s.user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from + 1 > 366 THEN
    RAISE EXCEPTION 'invalid range' USING ERRCODE = '22023';
  END IF;

  WITH sess AS (
    SELECT ts.id, rs.source, rs.medium,
           coalesce(ts.page_views, 0) AS pv, coalesce(ts.duration_seconds, 0) AS dur
    FROM public.tracking_sessions ts
    CROSS JOIN LATERAL public.session_source_medium(ts.referrer, ts.utm_source, ts.utm_medium, v_host) rs
    WHERE ts.site_id = p_site_id
      AND ts.started_at >= p_from AND ts.started_at < p_to + 1
      AND ((p_path IS NULL AND p_segment IS NULL) OR public.session_matches_filters(ts, p_path, p_segment))
  ),
  conv AS (
    SELECT DISTINCT ce.session_id
    FROM public.conversion_events ce
    WHERE ce.site_id = p_site_id
      AND ce.created_at >= p_from AND ce.created_at < p_to + 1
  ),
  agg AS (
    SELECT s.source, s.medium,
           count(*)                          AS sessions,
           sum(s.pv)                         AS page_views,
           count(*) FILTER (WHERE s.pv <= 1) AS bounces,
           sum(s.dur)                        AS duration_seconds,
           count(c.session_id)               AS conversions
    FROM sess s
    LEFT JOIN conv c ON c.session_id = s.id
    GROUP BY s.source, s.medium
  )
  SELECT jsonb_build_object(
    'total_sessions', (SELECT count(*) FROM sess),
    'sources', coalesce((SELECT jsonb_agg(jsonb_build_object(
                 'source', source, 'medium', medium, 'sessions', sessions, 'page_views', page_views,
                 'bounces', bounces, 'duration_seconds', duration_seconds, 'conversions', conversions
               ) ORDER BY sessions DESC, source, medium) FROM agg), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.session_source_medium(text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_source_breakdown(uuid, date, date, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_source_breakdown(uuid, date, date, text, jsonb) TO authenticated;

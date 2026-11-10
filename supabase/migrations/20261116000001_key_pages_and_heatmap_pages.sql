-- supabase/migrations/20261116000001_key_pages_and_heatmap_pages.sql
-- Two read RPCs for the dashboard. Same contract as the tab RPCs: caller must own the
-- site, range at most 366 days.
--
-- get_key_page_visits: views and visits on contact, cart, checkout and order-confirmation
--   pages, recognised by path. Most sites never set up conversion goals; this shows intent
--   without any setup.
-- get_heatmap_pages: pages that actually have heatmap data in the range. The heatmap page
--   list used to come from the newest page views, so it offered pages without clicks and
--   member-only pages (/admin, /my-account ...) that the anonymous screenshot cannot render.

CREATE OR REPLACE FUNCTION public.key_page_category(p_path text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_path ~* '/(order-received|thank-you|thankyou|thanks|tack|tack-for-din-bestallning|orderbekraftelse)(/|$)' THEN 'confirmation'
    WHEN p_path ~* '/(checkout|kassa|kassan)(/|$)' THEN 'checkout'
    WHEN p_path ~* '/(cart|basket|varukorg|kundvagn)(/|$)' THEN 'cart'
    WHEN p_path ~* '/(contact|contact-us|contacts|kontakt|kontakta|kontakta-oss|kontakt-oss)(/|$)' THEN 'contact'
  END
$$;

CREATE OR REPLACE FUNCTION public.get_key_page_visits(p_site_id uuid, p_from date, p_to date)
RETURNS TABLE (category text, path text, views bigint, visits bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sites WHERE id = p_site_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from + 1 > 366 THEN
    RAISE EXCEPTION 'invalid range' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH pv AS (
    SELECT COALESCE(NULLIF(regexp_replace(regexp_replace(v.url, '^https?://[^/]+', ''), '[?#].*$', ''), ''), '/') AS path,
           v.session_id
    FROM public.page_views v
    WHERE v.site_id = p_site_id
      AND v.viewed_at >= p_from AND v.viewed_at < p_to + 1
  )
  SELECT c.category, c.path, count(*)::bigint AS views, count(DISTINCT c.session_id)::bigint AS visits
  FROM (SELECT public.key_page_category(pv.path) AS category, pv.path, pv.session_id FROM pv) c
  WHERE c.category IS NOT NULL
  GROUP BY c.category, c.path
  ORDER BY views DESC, c.path
  LIMIT 50;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_key_page_visits(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_key_page_visits(uuid, date, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_heatmap_pages(p_site_id uuid, p_from date, p_to date, p_limit int DEFAULT 50)
RETURNS TABLE (url text, clicks bigint, scrolls bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sites WHERE id = p_site_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from + 1 > 366 THEN
    RAISE EXCEPTION 'invalid range' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT h.url,
         count(*) FILTER (WHERE h.interaction_type = 'click' OR h.interaction_type LIKE 'click\_%')::bigint AS clicks,
         count(*) FILTER (WHERE h.interaction_type = 'scroll')::bigint AS scrolls
  FROM public.heatmap_data h
  WHERE h.site_id = p_site_id
    AND h.created_at >= p_from AND h.created_at < p_to + 1
    -- Member-only and editor pages: the heatmap screenshot is taken logged out.
    AND regexp_replace(h.url, '^https?://[^/]+', '') !~* '^/(wp-admin|wp-login|admin|login|logga-in|signin|sign-in|auth|account|my-account|mitt-konto|konto|min-sida|profile|profil|members|medlem)(/|\?|$)'
    AND h.url NOT LIKE '%elementor-preview%' AND h.url NOT LIKE '%preview=true%'
  GROUP BY h.url
  ORDER BY clicks DESC, scrolls DESC, h.url
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_heatmap_pages(uuid, date, date, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_heatmap_pages(uuid, date, date, int) TO authenticated;

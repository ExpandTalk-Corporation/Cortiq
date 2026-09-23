-- Harden get_cloudflare_traffic_summary.
--
-- Why: it is SECURITY DEFINER with no ownership check on p_site_id and was executable
-- by anon (default PUBLIC grant). Anyone with the public anon key could read any site's
-- traffic mix, top bots and top countries. Same fix as 20260821000001: auth.uid()
-- ownership guard + no anon/PUBLIC execute. Revoking from anon alone is not enough —
-- anon inherits the PUBLIC grant — so PUBLIC is revoked too.

CREATE OR REPLACE FUNCTION public.get_cloudflare_traffic_summary(
  p_site_id uuid,
  p_days    integer DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_since  timestamptz;
  v_result jsonb;
BEGIN
  -- Ownership guard: caller must own the site (same check as the sites RLS policies).
  IF NOT EXISTS (
    SELECT 1 FROM public.sites WHERE id = p_site_id AND user_id = auth.uid()
  ) THEN
    RETURN '{}'::jsonb;
  END IF;

  v_since := now() - make_interval(days => LEAST(GREATEST(COALESCE(p_days, 7), 1), 365));

  WITH counts AS (
    SELECT visitor_type, COUNT(*) AS n
    FROM public.cloudflare_traffic
    WHERE site_id = p_site_id AND is_asset = false AND created_at > v_since
    GROUP BY visitor_type
  ),
  top_bots AS (
    SELECT bot_name, COUNT(*) AS n
    FROM public.cloudflare_traffic
    WHERE site_id = p_site_id AND is_asset = false AND bot_name IS NOT NULL AND created_at > v_since
    GROUP BY bot_name
    ORDER BY n DESC
    LIMIT 10
  ),
  top_countries AS (
    SELECT country, COUNT(*) AS n
    FROM public.cloudflare_traffic
    WHERE site_id = p_site_id AND is_asset = false AND country IS NOT NULL AND created_at > v_since
    GROUP BY country
    ORDER BY n DESC
    LIMIT 10
  )
  SELECT jsonb_build_object(
    'total',         (SELECT COALESCE(SUM(n), 0) FROM counts),
    'by_type',       COALESCE((SELECT jsonb_object_agg(visitor_type, n) FROM counts), '{}'::jsonb),
    'top_bots',      COALESCE((SELECT jsonb_agg(jsonb_build_object('name', bot_name, 'count', n)) FROM top_bots), '[]'::jsonb),
    'top_countries', COALESCE((SELECT jsonb_agg(jsonb_build_object('country', country, 'count', n)) FROM top_countries), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_cloudflare_traffic_summary(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cloudflare_traffic_summary(uuid, integer) TO authenticated, service_role;

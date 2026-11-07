-- get_gsc_aggregated weighted position by clicks, so every query or page with zero
-- clicks (most of them on a small site) got position NULL and the Google Search tab
-- crashed on it. Search Console averages position over impressions, so weight by
-- impressions instead; ties on clicks are broken by impressions.
-- CREATE OR REPLACE keeps the grants from 20260923000003.

CREATE OR REPLACE FUNCTION public.get_gsc_aggregated(
  p_site_id uuid, p_dimension text, p_limit integer DEFAULT 200
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'value',       value,
        'clicks',      total_clicks,
        'impressions', total_impressions,
        'ctr',         CASE WHEN total_impressions > 0 THEN total_clicks::float / total_impressions ELSE 0 END,
        'position',    avg_position
      )
      ORDER BY total_clicks DESC, total_impressions DESC
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT
      value,
      SUM(clicks)::int                                                            AS total_clicks,
      SUM(impressions)::int                                                       AS total_impressions,
      ROUND((SUM(position * impressions) / NULLIF(SUM(impressions), 0))::numeric, 1)::float AS avg_position
    FROM public.gsc_data
    WHERE site_id = p_site_id
      AND dimension = p_dimension
      AND EXISTS (SELECT 1 FROM public.sites o WHERE o.id = p_site_id AND o.user_id = auth.uid())
    GROUP BY value
    ORDER BY SUM(clicks) DESC, SUM(impressions) DESC
    LIMIT p_limit
  ) sub;
$$;

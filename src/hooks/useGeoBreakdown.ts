// src/hooks/useGeoBreakdown.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDashboardFilters } from '@/contexts/DashboardFiltersContext';

/** One row per country; country_code null = sessions with no recorded country. */
export type GeoRow = {
  country_code: string | null;
  sessions: number;
  page_views: number;
  bounce_rate: number;
  avg_duration: number;
  conversions: number;
};

export function useGeoBreakdown(siteId: string) {
  const { filters } = useDashboardFilters();
  return useQuery({
    queryKey: ['geo-breakdown', siteId, filters.from, filters.to],
    enabled: !!siteId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_geo_breakdown', {
        p_site_id: siteId, p_from: filters.from, p_to: filters.to,
      });
      if (error) throw error;
      return (data ?? []) as GeoRow[];
    },
  });
}

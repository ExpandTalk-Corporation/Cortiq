// src/hooks/useContentPerformance.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDashboardFilters } from '@/contexts/DashboardFiltersContext';

export type ContentRow = {
  content_id: string;
  content_name: string | null;
  content_type: string | null;
  impressions: number;
  clicks: number;
  ctr: number;
};

export function useContentPerformance(siteId: string) {
  const { filters } = useDashboardFilters();
  return useQuery({
    queryKey: ['content-performance', siteId, filters.from, filters.to],
    enabled: !!siteId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_content_performance', {
        p_site_id: siteId, p_from: filters.from, p_to: filters.to,
      });
      if (error) throw error;
      return ((data ?? []) as ContentRow[]).map((r) => ({ ...r, ctr: Number(r.ctr) }));
    },
  });
}

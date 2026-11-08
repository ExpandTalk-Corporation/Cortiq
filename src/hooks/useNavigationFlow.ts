// src/hooks/useNavigationFlow.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDashboardFilters } from '@/contexts/DashboardFiltersContext';
import { useFilterParams } from '@/hooks/useFilterParams';

export type NavigationFlow = {
  sessions: number;
  multi_page_sessions: number;
  transitions: { from: string; to: string; count: number }[];
  entries: { path: string; sessions: number }[];
  exits: { path: string; sessions: number }[];
};

export function useNavigationFlow(siteId: string) {
  const { filters } = useDashboardFilters();
  const fp = useFilterParams();
  return useQuery({
    queryKey: ['navigation-flow', siteId, filters.from, filters.to, fp],
    enabled: !!siteId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_navigation_flow', {
        p_site_id: siteId, p_from: filters.from, p_to: filters.to, ...fp,
      });
      if (error) throw error;
      return data as NavigationFlow;
    },
  });
}

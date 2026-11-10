// Cookie-free tab data: one owner-checked RPC that aggregates in SQL (get_cookiefree_summary),
// shaped for the tab by buildCookiefreeAnalytics. Date range comes from the dashboard filters.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDashboardFilters } from '@/contexts/DashboardFiltersContext';
import { buildCookiefreeAnalytics, type CookiefreeAnalytics, type CookiefreeRaw } from '@/lib/cookiefreeSummary';

export type { CookiefreeAnalytics } from '@/lib/cookiefreeSummary';

export const useCookiefreeAnalytics = (siteId: string | null | undefined) => {
  const { filters } = useDashboardFilters();
  return useQuery({
    queryKey: ['cookiefree-summary', siteId, filters.from, filters.to],
    enabled: !!siteId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    queryFn: async (): Promise<CookiefreeAnalytics | null> => {
      if (!siteId) return null;
      // RPC is newer than the generated types; cast at the boundary.
      const { data, error } = await (supabase as any).rpc('get_cookiefree_summary', {
        p_site_id: siteId, p_from: filters.from, p_to: filters.to,
      });
      if (error) throw error;
      return buildCookiefreeAnalytics(data as CookiefreeRaw, filters.from, filters.to);
    },
  });
};

// src/hooks/useCampaignBreakdown.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDashboardFilters } from '@/contexts/DashboardFiltersContext';

export type CampaignRow = {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  sessions: number;
  page_views: number;
  conversions: number;
};
export type CampaignBreakdown = { total_sessions: number; tagged_sessions: number; campaigns: CampaignRow[] };

export function useCampaignBreakdown(siteId: string) {
  const { filters } = useDashboardFilters();
  return useQuery({
    queryKey: ['campaign-breakdown', siteId, filters.from, filters.to],
    enabled: !!siteId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_campaign_breakdown', {
        p_site_id: siteId, p_from: filters.from, p_to: filters.to,
      });
      if (error) throw error;
      return data as CampaignBreakdown;
    },
  });
}

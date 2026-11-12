// src/hooks/useOverviewMetrics.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDashboardFilters } from '@/contexts/DashboardFiltersContext';
import { useFilterParams } from '@/hooks/useFilterParams';

export type PeriodTotals = { visits: number; pageViews: number; conversions: number;
  // unclassified: headless automation and hits no rule placed; not part of total (20261122000001).
  ai: { total: number; training: number; agentic: number; citation: number; unclassified?: number } };
export type OverviewMetrics = { current: PeriodTotals; previous: PeriodTotals;
  daily: { date: string; visits: number; pageViews: number; conversions: number; ai: number }[];
  lastPageViewAt: string | null; lastServerHitAt: string | null; serverHits: number };

export function useOverviewMetrics(siteId: string) {
  const { filters } = useDashboardFilters();
  const fp = useFilterParams();
  return useQuery({
    queryKey: ['overview-metrics', siteId, filters.from, filters.to, fp],
    enabled: !!siteId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_overview_metrics', {
        p_site_id: siteId, p_from: filters.from, p_to: filters.to,
        ...fp,
      });
      if (error) throw error;
      return data as OverviewMetrics;
    },
  });
}

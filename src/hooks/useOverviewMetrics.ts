// src/hooks/useOverviewMetrics.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDashboardFilters } from '@/contexts/DashboardFiltersContext';
import { useUTMSegments, resolveTokens } from '@/contexts/UTMSegmentContext';

export type PeriodTotals = { visits: number; pageViews: number; conversions: number;
  ai: { total: number; training: number; agentic: number; citation: number } };
export type OverviewMetrics = { current: PeriodTotals; previous: PeriodTotals;
  daily: { date: string; visits: number; pageViews: number; conversions: number; ai: number }[];
  lastPageViewAt: string | null; lastServerHitAt: string | null; serverHits: number };

export function useOverviewMetrics(siteId: string) {
  const { filters } = useDashboardFilters();
  const { segments } = useUTMSegments();
  const segment = segments.find((s) => s.id === filters.segmentId);
  const segmentFilters = segment
    ? segment.filters.filter((f) => f.value.trim()).map((f) => ({ ...f, value: resolveTokens(f.value) }))
    : null;
  return useQuery({
    queryKey: ['overview-metrics', siteId, filters.from, filters.to, filters.path, segmentFilters],
    enabled: !!siteId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_overview_metrics', {
        p_site_id: siteId, p_from: filters.from, p_to: filters.to,
        p_path: filters.path, p_segment: segmentFilters,
      });
      if (error) throw error;
      return data as OverviewMetrics;
    },
  });
}

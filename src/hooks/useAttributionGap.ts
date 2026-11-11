import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDashboardFilters } from '@/contexts/DashboardFiltersContext';
import { useFilterParams } from '@/hooks/useFilterParams';

export interface AttributionBySource {
  source: string;
  cortiq: number;
  quality: number;
}

export interface AttributionGapData {
  cortiqConversions: number;
  hubspotMQLs: number;
  gapPercent: number;
  pendingUpload: number;
  uploaded: number;
  bySource: AttributionBySource[];
  /** The global date filter the numbers cover (inclusive YYYY-MM-DD). */
  period: { from: string; to: string };
}

/** Uses the global dashboard filters: date range, URL (the visit viewed it) and segment. */
export function useAttributionGap(siteId: string) {
  const { filters } = useDashboardFilters();
  const { p_path, p_segment } = useFilterParams();
  const p_from = filters.from;
  const p_to = filters.to;
  return useQuery({
    queryKey: ['attribution-gap', siteId, p_from, p_to, p_path, p_segment],
    queryFn: async (): Promise<AttributionGapData> => {
      // Aggregated server-side (get_attribution_gap date-range overload) instead of pulling raw rows.
      // The overload is newer than the generated types; cast at the boundary.
      const { data, error } = await (supabase as any).rpc('get_attribution_gap', {
        p_site_id: siteId, p_from, p_to, p_path, p_segment,
      });
      if (error) throw error;

      const r = (Array.isArray(data) ? data[0] : data) ?? {};
      const cortiqConversions = Number(r.cortiq_conversions ?? 0);
      const hubspotMQLs = Number(r.hubspot_mqls ?? 0);
      const classified = Number(r.classified_count ?? 0);
      const unclassified = Number(r.unclassified_count ?? 0);

      const gapPercent = cortiqConversions > 0
        ? Math.round(((cortiqConversions - hubspotMQLs) / cortiqConversions) * 100)
        : 0;

      const bySource: AttributionBySource[] = [
        { source: 'Classified (HubSpot)', cortiq: classified, quality: hubspotMQLs },
        { source: 'Unclassified', cortiq: unclassified, quality: 0 },
      ];

      return {
        cortiqConversions,
        hubspotMQLs,
        gapPercent,
        pendingUpload: Number(r.pending_upload ?? 0),
        uploaded: Number(r.uploaded ?? 0),
        bySource,
        period: { from: p_from, to: p_to },
      };
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!siteId,
  });
}

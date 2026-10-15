import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { pickLowCTRPages, type GSCPageRow, type LowCTRPage } from '@/lib/dashboard/gscSnapshots';

export type { LowCTRPage };

/** `range` is the global dashboard date filter; GSC snapshots overlapping it are used. */
export function useHighImpressionLowCTR(
  siteId: string | null,
  range: { from: string; to: string },
  minImpressions = 500,
  maxCtr = 0.005,        // 0.5% — catches both 0.05% and realistic low-CTR pages
) {
  return useQuery({
    queryKey: ['high-impression-low-ctr', siteId, range.from, range.to, minImpressions, maxCtr],
    enabled: !!siteId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<LowCTRPage[]> => {
      // gsc_data is not in the generated Supabase types yet.
      const { data, error } = await (supabase as any)
        .from('gsc_data')
        .select('value, impressions, clicks, ctr, position, period_end')
        .eq('site_id', siteId!)
        .eq('dimension', 'page')
        .gte('period_end', range.from)
        .lte('period_start', range.to)
        .order('period_end', { ascending: false })
        .limit(1000);

      if (error) throw error;

      // Latest snapshot per URL, then thresholds — no duplicates across syncs.
      return pickLowCTRPages((data ?? []) as GSCPageRow[], minImpressions, maxCtr);
    },
  });
}

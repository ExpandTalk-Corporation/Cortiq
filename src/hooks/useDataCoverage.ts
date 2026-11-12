// src/hooks/useDataCoverage.ts
// Days with page views in the selected range, and the gaps between them (get_data_coverage).
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toDataCoverage } from '@/lib/dataCoverage';

export function useDataCoverage(siteId: string, from: string, to: string) {
  return useQuery({
    queryKey: ['data-coverage', siteId, from, to],
    enabled: !!siteId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // RPC is newer than the generated types; cast at the boundary.
      const { data, error } = await (supabase as any).rpc('get_data_coverage', { p_site_id: siteId, p_from: from, p_to: to });
      if (error) throw error;
      return toDataCoverage(data);
    },
  });
}

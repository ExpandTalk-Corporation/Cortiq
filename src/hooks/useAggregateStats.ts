import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toAggregateSummary, type AggregateSummary } from '@/lib/aggregateStats';

// get_aggregate_summary is newer than the generated Supabase types.
const rpc = supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;

/** Consent-free aggregate totals for an inclusive 'YYYY-MM-DD' range. */
export function useAggregateStats(siteId: string, from: string, to: string, enabled: boolean) {
  return useQuery({
    queryKey: ['aggregate-stats', siteId, from, to],
    enabled: enabled && !!siteId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<AggregateSummary> => {
      const { data, error } = await rpc.call(supabase, 'get_aggregate_summary', { p_site_id: siteId, p_from: from, p_to: to });
      if (error) throw new Error(error.message);
      return toAggregateSummary(data);
    },
  });
}

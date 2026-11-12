import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDashboardFilters } from '@/contexts/DashboardFiltersContext';
import { parseAiInfluence, type AiInfluence } from '@/lib/aiInfluence';

/** Uses the global date range only: AI fetches carry no visit, so URL and segment filters do not apply. */
export function useAiInfluence(siteId: string, windowDays = 14) {
  const { filters } = useDashboardFilters();
  const p_from = filters.from;
  const p_to = filters.to;
  return useQuery({
    queryKey: ['ai-influence', siteId, p_from, p_to, windowDays],
    queryFn: async (): Promise<AiInfluence> => {
      // Newer than the generated types; cast at the boundary.
      const { data, error } = await (supabase as any).rpc('get_ai_influence', {
        p_site_id: siteId, p_from, p_to, p_window_days: windowDays,
      });
      if (error) throw error;
      return parseAiInfluence(data);
    },
    enabled: !!siteId,
  });
}

// src/hooks/useTopPaths.ts
// Most viewed paths in the selected range, offered as Website URL suggestions.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type TopPath = { path: string; views: number };

export function useTopPaths(siteId: string, from: string, to: string) {
  return useQuery({
    queryKey: ['dashboard-top-paths', siteId, from, to],
    enabled: !!siteId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // RPC is newer than the generated types; cast at the boundary.
      const { data, error } = await (supabase as any).rpc('get_top_paths', {
        p_site_id: siteId, p_from: from, p_to: to, p_limit: 30,
      });
      if (error) throw error;
      return ((data ?? []) as { path: string; views: number | string }[])
        .map((r) => ({ path: r.path, views: Number(r.views) })) as TopPath[];
    },
  });
}

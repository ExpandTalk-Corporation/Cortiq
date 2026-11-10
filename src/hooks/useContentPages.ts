// src/hooks/useContentPages.ts
// First-party per-page engagement for the Content tab (get_content_pages), used when no
// element is tagged with data-cortiq-content.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDashboardFilters } from '@/contexts/DashboardFiltersContext';
import { summariseContentPages, type ContentPagesRaw } from '@/lib/contentPages';

export function useContentPages(siteId: string) {
  const { filters } = useDashboardFilters();
  return useQuery({
    queryKey: ['content-pages', siteId, filters.from, filters.to],
    enabled: !!siteId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // RPC is newer than the generated types; cast at the boundary.
      const { data, error } = await (supabase as any).rpc('get_content_pages', {
        p_site_id: siteId, p_from: filters.from, p_to: filters.to,
      });
      if (error) throw error;
      return summariseContentPages(data as ContentPagesRaw);
    },
  });
}

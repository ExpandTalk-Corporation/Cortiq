// src/hooks/useContentPages.ts
// First-party per-page engagement for the Content tab (get_content_pages), used when no
// element is tagged with data-cortiq-content.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDashboardFilters } from '@/contexts/DashboardFiltersContext';
import { useFilterParams } from '@/hooks/useFilterParams';
import { summariseContentPages, type ContentPagesRaw } from '@/lib/contentPages';

export function useContentPages(siteId: string) {
  const { filters } = useDashboardFilters();
  const { p_path, p_segment } = useFilterParams();
  return useQuery({
    queryKey: ['content-pages', siteId, filters.from, filters.to, p_path, p_segment],
    enabled: !!siteId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // RPC is newer than the generated types; cast at the boundary. URL and segment
      // filters are applied in the database (scroll data is left out under a segment).
      const { data, error } = await (supabase as any).rpc('get_content_pages', {
        p_site_id: siteId, p_from: filters.from, p_to: filters.to, p_path, p_segment,
      });
      if (error) throw error;
      return summariseContentPages(data as ContentPagesRaw);
    },
  });
}

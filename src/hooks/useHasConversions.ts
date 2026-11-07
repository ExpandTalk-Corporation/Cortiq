// src/hooks/useHasConversions.ts
// Whether the site has recorded any conversion. Decides if the Attribution gap menu item is shown.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useHasConversions(siteId: string | undefined) {
  return useQuery({
    queryKey: ['has-conversions', siteId],
    enabled: !!siteId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('conversion_events').select('id').eq('site_id', siteId!).limit(1);
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },
  });
}

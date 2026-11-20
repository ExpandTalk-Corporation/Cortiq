import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { MeasurementHealth } from '../../supabase/functions/_shared/measurement-health.ts';

/** get_measurement_health for one site (checks + signal inventory). Keyed on the site id, so a
 *  site switch never shows the previous site's result. */
export function useMeasurementHealth(siteId?: string) {
  return useQuery({
    queryKey: ['measurement-health', siteId],
    enabled: !!siteId,
    queryFn: async (): Promise<MeasurementHealth> => {
      // get_measurement_health is newer than the generated types.
      const { data, error } = await (supabase as unknown as { rpc: (n: string, a: object) => any })
        .rpc('get_measurement_health', { p_site_id: siteId });
      if (error) throw error;
      return data as MeasurementHealth;
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}

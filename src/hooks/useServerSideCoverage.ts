import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ServerSideCoverage {
  jsTag: number;
  serverLog: number;
  robotsTxt: number;
  llmsTxt: number;
  honeypot: number;
  lastServerHit: string | null;
}

// Browser-tag vs server-side AI-bot rows for a site (get_ai_bot_source_breakdown RPC).
export function useServerSideCoverage(siteId: string | undefined, days = 30) {
  return useQuery({
    queryKey: ['server-side-coverage', siteId, days],
    enabled: !!siteId,
    queryFn: async (): Promise<ServerSideCoverage> => {
      const { data, error } = await supabase.rpc('get_ai_bot_source_breakdown', { p_site_id: siteId, p_days: days });
      if (error) throw error;
      const j = (data ?? {}) as Record<string, number | string | null>;
      return {
        jsTag: Number(j.js_tag ?? 0),
        serverLog: Number(j.server_log ?? 0),
        robotsTxt: Number(j.robots_txt ?? 0),
        llmsTxt: Number(j.llms_txt ?? 0),
        honeypot: Number(j.honeypot ?? 0),
        lastServerHit: (j.last_server_hit as string | null) ?? null,
      };
    },
  });
}

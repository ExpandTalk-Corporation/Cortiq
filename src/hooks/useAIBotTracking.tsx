import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface AIBotTrafficData {
  totalTraffic: number;
  citationRequests: number;
  trainingCrawlers: number;
  citationCtr: number;
  botBreakdown: { name: string; count: number; percentage: number; category: string }[];
  dailyTrend: { date: string; traffic: number }[];
  topUrls: { url: string; visits: number }[];
}

/** `range` is the global dashboard date filter (inclusive YYYY-MM-DD). */
export const useAIBotTracking = (siteId: string | null, range: { from: string; to: string }) => {
  return useQuery({
    queryKey: ['ai-bot-tracking', siteId, range.from, range.to],
    queryFn: async (): Promise<AIBotTrafficData> => {
      if (!siteId) {
        throw new Error('No site ID provided');
      }

      // Aggregated server-side (get_ai_bot_tracking date-range overload): breakdown by
      // category stored at ingest, daily trend, and top non-asset URLs.
      const { data, error } = await (supabase as any).rpc('get_ai_bot_tracking', {
        p_site_id: siteId, p_from: range.from, p_to: range.to,
      });
      if (error) throw error;

      const j = (data ?? {}) as {
        totalTraffic?: number; citationRequests?: number; trainingCrawlers?: number; citationCtr?: number;
        botBreakdown?: { name: string; count: number; percentage: number; category: string }[];
        dailyTrend?: { date: string; traffic: number }[];
        topUrls?: { url: string; visits: number }[];
      };

      return {
        totalTraffic: Number(j.totalTraffic ?? 0),
        citationRequests: Number(j.citationRequests ?? 0),
        trainingCrawlers: Number(j.trainingCrawlers ?? 0),
        citationCtr: Number(j.citationCtr ?? 0),
        botBreakdown: (j.botBreakdown ?? []).map(b => ({
          name: b.name, count: Number(b.count), percentage: Number(b.percentage), category: b.category,
        })),
        dailyTrend: (j.dailyTrend ?? []).map(d => ({ date: d.date, traffic: Number(d.traffic) })),
        topUrls: (j.topUrls ?? []).map(u => ({ url: u.url, visits: Number(u.visits) })),
      };
    },
    enabled: !!siteId,
  });
};
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Analytics } from '@/types/dashboard';
import type { FilterParams } from '@/hooks/useFilterParams';

// Server-side shape returned by public.get_analytics_summary(p_site_id, p_from, p_to, p_path, p_segment).
interface AnalyticsSummary {
  total_page_views: number;
  total_sessions: number;
  engaged_sessions: number;
  avg_session_duration: number;
  avg_engagement_time: number;
  top_pages: { url: string; views: number }[] | null;
  device_breakdown: Record<string, number> | null;
}

// React Query keys the result by site, range and filters, so a slow answer for the site you just left can
// never overwrite the one you switched to (the old useEffect + setState version could).
export function useAnalytics(siteId: string | null, dateRange?: { from: Date; to: Date }, filterParams?: FilterParams) {
  const fromMs = dateRange?.from?.getTime() ?? null;
  const toMs = dateRange?.to?.getTime() ?? null;
  const { data } = useQuery({
    queryKey: ['analytics-summary', siteId, fromMs, toMs, filterParams?.p_path ?? null, filterParams?.p_segment ?? null],
    enabled: !!siteId,
    queryFn: async (): Promise<Analytics> => {
      // Clamp dates to avoid future dates
      const today = new Date();
      const defaultFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const fromDate = fromMs !== null ? new Date(Math.min(fromMs, today.getTime())) : defaultFrom;
      const toDate = new Date(Math.min(toMs ?? today.getTime(), today.getTime()));

      // All counting/aggregation happens server-side in one call — no row fetching,
      // no client-side truncation at Supabase's 1000-row default. Ownership is enforced
      // inside the RPC (site must belong to auth.uid()).
      const { data, error } = await supabase.rpc('get_analytics_summary', {
        p_site_id: siteId!,
        p_from: fromDate.toISOString(),
        p_to: toDate.toISOString(),
        p_path: filterParams?.p_path ?? null,
        p_segment: filterParams?.p_segment ?? null,
      });
      if (error) {
        console.error('Error loading analytics:', error);
        throw error;
      }

      const s = (data as AnalyticsSummary) ?? ({} as AnalyticsSummary);
      const totalSessions = s.total_sessions ?? 0;
      const totalPageViews = s.total_page_views ?? 0;
      const avgSessionDuration = s.avg_session_duration ?? 0;

      const engagementRate = totalSessions > 0 ? (s.engaged_sessions ?? 0) / totalSessions * 100 : 0;
      // Total time across all sessions ÷ pageviews (mirrors the previous derivation).
      const averageTimeOnSite = totalPageViews > 0
        ? (avgSessionDuration * totalSessions) / totalPageViews
        : 0;

      const deviceEntries = Object.entries(s.device_breakdown ?? {});
      const deviceBreakdown = deviceEntries.map(([device, count]) => ({
        device,
        count,
        percentage: totalSessions > 0 ? (count / totalSessions) * 100 : 0,
      }));

      return {
        totalSessions,
        totalPageViews,
        averageSessionDuration: Math.round(avgSessionDuration),
        averageEngagementTime: Math.round(s.avg_engagement_time ?? 0),
        engagementRate: Math.round(engagementRate * 10) / 10, // One decimal
        averageTimeOnSite: Math.round(averageTimeOnSite),
        topPages: s.top_pages ?? [],
        deviceBreakdown,
      };
    },
  });

  return { analytics: data ?? null };
}

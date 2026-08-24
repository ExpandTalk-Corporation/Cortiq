import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Analytics } from '@/types/dashboard';

// Server-side shape returned by public.get_analytics_summary(p_site_id, p_from, p_to).
interface AnalyticsSummary {
  total_page_views: number;
  total_sessions: number;
  engaged_sessions: number;
  avg_session_duration: number;
  avg_engagement_time: number;
  top_pages: { url: string; views: number }[] | null;
  device_breakdown: Record<string, number> | null;
}

export function useAnalytics(siteId: string | null, dateRange?: { from: Date; to: Date }) {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);

  const loadAnalytics = async (siteId: string, range?: { from: Date; to: Date }) => {
    try {
      // Clamp dates to avoid future dates
      const today = new Date();
      const defaultFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const fromDate = range?.from ? new Date(Math.min(range.from.getTime(), today.getTime())) : defaultFrom;
      const toDateBase = range?.to ?? today;
      const toDate = new Date(Math.min(toDateBase.getTime(), today.getTime()));

      // All counting/aggregation happens server-side in one call — no row fetching,
      // no client-side truncation at Supabase's 1000-row default. Ownership is enforced
      // inside the RPC (site must belong to auth.uid()).
      const { data, error } = await supabase.rpc('get_analytics_summary', {
        p_site_id: siteId,
        p_from: fromDate.toISOString(),
        p_to: toDate.toISOString(),
      });

      if (error) throw error;

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

      setAnalytics({
        totalSessions,
        totalPageViews,
        averageSessionDuration: Math.round(avgSessionDuration),
        averageEngagementTime: Math.round(s.avg_engagement_time ?? 0),
        engagementRate: Math.round(engagementRate * 10) / 10, // One decimal
        averageTimeOnSite: Math.round(averageTimeOnSite),
        topPages: s.top_pages ?? [],
        deviceBreakdown,
      });
    } catch (error) {
      console.error('Error loading analytics:', error);
    }
  };

  useEffect(() => {
    if (siteId) {
      setAnalytics(null); // Clear old data immediately
      loadAnalytics(siteId, dateRange);
    } else {
      setAnalytics(null);
    }
  }, [siteId, dateRange?.from?.getTime(), dateRange?.to?.getTime()]);

  return { analytics };
}

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface RealTimeStats {
  activeVisitors: number;
  pageViewsToday: number;
  topPage: { url: string; views: number } | null;
  deviceBreakdown: { desktop: number; mobile: number; tablet: number };
  lastUpdated: Date;
}

// Server-side shape returned by public.get_realtime_stats(p_site_id).
interface RealtimeStatsRow {
  active_visitors: number;
  page_views_today: number;
  top_page: { url: string; views: number } | null;
  device_breakdown: Record<string, number> | null;
}

export function useRealTimeAnalytics(siteId: string | null) {
  const [stats, setStats] = useState<RealTimeStats>({
    activeVisitors: 0,
    pageViewsToday: 0,
    topPage: null,
    deviceBreakdown: { desktop: 0, mobile: 0, tablet: 0 },
    lastUpdated: new Date()
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRealTimeData = async () => {
    if (!siteId) return;

    try {
      // Active visitors, page views today, top page and device split are all computed
      // server-side in one call (no unbounded row fetch, no 1000-row truncation).
      const { data, error } = await supabase.rpc('get_realtime_stats', { p_site_id: siteId });
      if (error) throw error;

      const row = (data as RealtimeStatsRow) ?? ({} as RealtimeStatsRow);

      // Fold arbitrary device_type values into the desktop/mobile/tablet buckets.
      const deviceBreakdown = Object.entries(row.device_breakdown ?? {}).reduce(
        (acc, [device, count]) => {
          const d = device.toLowerCase();
          if (d.includes('mobile')) acc.mobile += count;
          else if (d.includes('tablet')) acc.tablet += count;
          else acc.desktop += count;
          return acc;
        },
        { desktop: 0, mobile: 0, tablet: 0 }
      );

      setStats({
        activeVisitors: row.active_visitors ?? 0,
        pageViewsToday: row.page_views_today ?? 0,
        topPage: row.top_page ?? null,
        deviceBreakdown,
        lastUpdated: new Date()
      });

      setError(null);
    } catch (err) {
      console.error('Error fetching real-time data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch real-time data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (siteId) {
      fetchRealTimeData();

      // Update every 30 seconds
      const interval = setInterval(fetchRealTimeData, 30000);
      return () => clearInterval(interval);
    }
  }, [siteId]);

  return {
    stats,
    loading,
    error,
    refresh: fetchRealTimeData
  };
}

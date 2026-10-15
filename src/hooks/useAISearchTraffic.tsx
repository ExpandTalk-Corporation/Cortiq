import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { rangeBounds } from "@/lib/dashboard/filters";

interface AISearchTrafficData {
  totalSessions: number;
  totalUsers: number;
  totalPageviews: number;
  avgSessionDuration: number;
  bounceRate: number;
  conversionRate: number;
  platforms: {
    name: string;
    sessions: number;
    users: number;
    pageviews: number;
    avgDuration: number;
    bounceRate: number;
    percentage: number;
  }[];
  dailyTrend: {
    date: string;
    sessions: number;
    users: number;
  }[];
  topLandingPages: {
    url: string;
    sessions: number;
    bounceRate: number;
  }[];
}

/** `range` is the global dashboard date filter (inclusive YYYY-MM-DD). */
export const useAISearchTraffic = (siteId: string | null, range: { from: string; to: string }) => {
  return useQuery({
    queryKey: ['ai-search-traffic', siteId, range.from, range.to],
    queryFn: async (): Promise<AISearchTrafficData> => {
      if (!siteId) {
        throw new Error('No site ID provided');
      }

      const { start, end } = rangeBounds(range.from, range.to);

      // Fetch AI search traffic
      const { data: traffic, error: trafficError } = await supabase
        .from('ai_search_traffic')
        .select('*')
        .eq('site_id', siteId)
        .gte('landed_at', start)
        .lt('landed_at', end)
        .order('landed_at', { ascending: false });

      if (trafficError) throw trafficError;

      // Calculate metrics
      const totalSessions = traffic?.length || 0;
      const uniqueUsers = new Set(traffic?.map(t => t.user_hash).filter(Boolean)).size;
      const totalPageviews = traffic?.reduce((sum, t) => sum + (t.pages_viewed || 0), 0) || 0;
      const avgSessionDuration = traffic?.length 
        ? Math.round(traffic.reduce((sum, t) => sum + (t.session_duration || 0), 0) / traffic.length)
        : 0;
      const bounces = traffic?.filter(t => t.bounce).length || 0;
      const bounceRate = totalSessions > 0 ? (bounces / totalSessions) * 100 : 0;
      const conversions = traffic?.reduce((sum, t) => sum + (t.conversions || 0), 0) || 0;
      const conversionRate = totalSessions > 0 ? (conversions / totalSessions) * 100 : 0;

      // Platform breakdown
      const platformCounts: Record<string, {
        sessions: number;
        users: Set<string>;
        pageviews: number;
        duration: number[];
        bounces: number;
      }> = {};

      traffic?.forEach(t => {
        const platform = t.ai_platform || 'other';
        if (!platformCounts[platform]) {
          platformCounts[platform] = {
            sessions: 0,
            users: new Set(),
            pageviews: 0,
            duration: [],
            bounces: 0
          };
        }
        platformCounts[platform].sessions++;
        if (t.user_hash) platformCounts[platform].users.add(t.user_hash);
        platformCounts[platform].pageviews += t.pages_viewed || 0;
        if (t.session_duration) platformCounts[platform].duration.push(t.session_duration);
        if (t.bounce) platformCounts[platform].bounces++;
      });

      const platforms = Object.entries(platformCounts)
        .map(([name, data]) => ({
          name: name.charAt(0).toUpperCase() + name.slice(1),
          sessions: data.sessions,
          users: data.users.size,
          pageviews: data.pageviews,
          avgDuration: data.duration.length 
            ? Math.round(data.duration.reduce((a, b) => a + b, 0) / data.duration.length)
            : 0,
          bounceRate: data.sessions > 0 ? (data.bounces / data.sessions) * 100 : 0,
          percentage: totalSessions > 0 ? (data.sessions / totalSessions) * 100 : 0,
        }))
        .sort((a, b) => b.sessions - a.sessions);

      // Daily trend
      const dailyData: Record<string, { sessions: Set<string>; users: Set<string> }> = {};
      traffic?.forEach(t => {
        const date = new Date(t.landed_at).toISOString().split('T')[0];
        if (!dailyData[date]) {
          dailyData[date] = { sessions: new Set(), users: new Set() };
        }
        dailyData[date].sessions.add(t.session_id);
        if (t.user_hash) dailyData[date].users.add(t.user_hash);
      });

      const dailyTrend = Object.entries(dailyData)
        .map(([date, data]) => ({
          date,
          sessions: data.sessions.size,
          users: data.users.size,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // Top landing pages
      const urlCounts: Record<string, { sessions: number; bounces: number }> = {};
      traffic?.forEach(t => {
        if (!urlCounts[t.url]) {
          urlCounts[t.url] = { sessions: 0, bounces: 0 };
        }
        urlCounts[t.url].sessions++;
        if (t.bounce) urlCounts[t.url].bounces++;
      });

      const topLandingPages = Object.entries(urlCounts)
        .map(([url, data]) => ({
          url,
          sessions: data.sessions,
          bounceRate: data.sessions > 0 ? (data.bounces / data.sessions) * 100 : 0,
        }))
        .sort((a, b) => b.sessions - a.sessions)
        .slice(0, 10);

      return {
        totalSessions,
        totalUsers: uniqueUsers,
        totalPageviews,
        avgSessionDuration,
        bounceRate,
        conversionRate,
        platforms,
        dailyTrend,
        topLandingPages,
      };
    },
    enabled: !!siteId,
  });
};

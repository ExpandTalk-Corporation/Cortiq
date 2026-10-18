import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface AITrafficData {
  totalSessions: number;
  totalUsers: number;
  platforms: Array<{
    platform: string;
    medium: string;
    sessions: number;
    users: number;
    newUsers: number;
    conversions: number;
    revenue: number;
    avgDuration: number;
    bounceRate: number;
    engagementRate: number;
    pageViews: number;
    conversionRate: number;
  }>;
  dailyTrend: Array<{
    date: string;
    sessions: number;
    users: number;
    conversions: number;
  }>;
  topLandingPages: Array<{
    page: string;
    sessions: number;
    users: number;
  }>;
  summary: {
    totalSessions: number;
    totalUsers: number;
    totalConversions: number;
    totalRevenue: number;
    averageEngagementRate: number;
    averageSessionDuration: number;
    bounceRate: number;
  };
}

/**
 * `period` is either an inclusive YYYY-MM-DD range (the global dashboard date filter) or,
 * for widgets outside the date-aware tabs, a number of days back from today.
 */
export function useAITraffic(siteId: string, period: number | { from: string; to: string } = 30) {
  const [data, setData] = useState<AITrafficData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatDate = (date: Date) => date.toISOString().split('T')[0];
  const { startDate, endDate } = typeof period === 'number'
    ? { startDate: formatDate(new Date(Date.now() - period * 86_400_000)), endDate: formatDate(new Date()) }
    : { startDate: period.from, endDate: period.to };

  const fetchAITraffic = async () => {
    if (!siteId) return;

    console.log('🤖 Fetching AI traffic data for site:', siteId);
    setLoading(true);
    setError(null);

    try {
      const { data: aiData, error: functionError } = await supabase.functions.invoke('ga4-ai-traffic', {
        body: {
          siteId,
          startDate,
          endDate
        }
      });

      if (functionError) {
        console.error('AI Traffic function error:', functionError);
        throw new Error(functionError.message || 'Failed to fetch AI traffic data');
      }

      console.log('AI traffic data received:', aiData);
      setData(aiData);

    } catch (err) {
      console.error('Error fetching AI traffic data:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAITraffic();
  }, [siteId, startDate, endDate]);

  // Helper functions for data analysis
  const getTopAIPlatform = () => {
    if (!data?.platforms || data.platforms.length === 0) return null;
    return data.platforms[0];
  };

  const getGrowthTrend = () => {
    if (!data?.dailyTrend || data.dailyTrend.length < 2) return 0;
    
    const recent = data.dailyTrend.slice(-7).reduce((sum, day) => sum + day.sessions, 0);
    const previous = data.dailyTrend.slice(-14, -7).reduce((sum, day) => sum + day.sessions, 0);
    
    if (previous === 0) return recent > 0 ? 100 : 0;
    return ((recent - previous) / previous) * 100;
  };

  const getConversionRate = () => {
    if (!data?.summary || data.summary.totalSessions === 0) return 0;
    return (data.summary.totalConversions / data.summary.totalSessions) * 100;
  };

  const getEngagementInsights = () => {
    if (!data?.platforms) return [];
    
    return data.platforms.map(platform => ({
      platform: platform.platform,
      quality: platform.engagementRate > 0.6 ? 'High' : platform.engagementRate > 0.3 ? 'Medium' : 'Low',
      avgDuration: platform.avgDuration,
      bounceRate: platform.bounceRate,
      sessions: platform.sessions
    }));
  };

  return {
    data,
    loading,
    error,
    refetch: fetchAITraffic,
    topPlatform: getTopAIPlatform(),
    growthTrend: getGrowthTrend(),
    conversionRate: getConversionRate(),
    engagementInsights: getEngagementInsights()
  };
}
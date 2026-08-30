import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface KPIRequest {
  siteId: string;
  startDate: string;
  endDate: string;
  comparisonStartDate: string;
  comparisonEndDate: string;
}

interface KPIData {
  overgripande: any;
  digitala_kanaler: any;
  betald_annonsering: any;
  social_media: any;
  artificiell_intelligens: any;
  nyhetsbrev: any;
  nyhetsbrev_events: any;
  generatedAt: string;
}

export function useKPIDashboard(siteId: string, year: number = 2025) {
  const [data, setData] = useState<KPIData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallbackMonthly, setFallbackMonthly] = useState<any[]>([]);

  const fetchKPIData = async () => {
    if (!siteId) return;

    setLoading(true);
    setError(null);

    // Calculate date ranges for full year vs previous year. Declared outside the
    // try so the catch/fallback paths can reuse them.
    const currentYear = year;
    const previousYear = year - 1;
    const startDate = `${currentYear}-01-01`;
    // For the current year, cap the end date at today to avoid GA4 errors for future months.
    const today = new Date();
    const isCurrentYear = currentYear === today.getFullYear();
    const endDate = isCurrentYear
      ? today.toISOString().split('T')[0]
      : `${currentYear}-12-31`;
    const comparisonStartDate = `${previousYear}-01-01`;
    const comparisonEndDate = `${previousYear}-12-31`;

    try {
      const { data: kpiData, error: functionError } = await supabase.functions.invoke('ga4-kpi-dashboard', {
        body: {
          siteId,
          startDate,
          endDate,
          comparisonStartDate,
          comparisonEndDate
        }
      });

      if (functionError) {
        throw new Error(functionError.message || 'Failed to fetch KPI data');
      }

      // GA4 returned usable monthly data — use it and drop any stale fallback.
      if (kpiData?.overgripande?.data?.length > 0) {
        setData(kpiData);
        setFallbackMonthly([]);
        return;
      }

      // GA4 responded but has nothing (typically: no ga_measurement_id on the site).
      // Fall back to CortIQ's own first-party tables so the KPI tab still shows numbers.
      console.warn('KPI: no GA4 data returned, computing fallback from internal tables');
      setData(null);
      await computeFallbackMonthly(startDate, endDate);
    } catch (err) {
      // GA4 call failed entirely — try the first-party fallback before giving up.
      console.error('Error fetching KPI data, using internal fallback:', err);
      setData(null);
      setError(err instanceof Error ? err.message : 'Failed to fetch GA4 KPI data');
      await computeFallbackMonthly(startDate, endDate);
    } finally {
      setLoading(false);
    }
  };

  // Fallback computation from internal tables when GA4 fails
  const computeFallbackMonthly = async (startDate: string, endDate: string) => {
    try {
      // Fetch sessions in range
      const { data: sessions, error: sessionError } = await supabase
        .from('tracking_sessions')
        .select('session_id, started_at, duration_seconds, page_views')
        .eq('site_id', siteId)
        .gte('started_at', `${startDate}T00:00:00.000Z`)
        .lte('started_at', `${endDate}T23:59:59.999Z`);
      if (sessionError) throw sessionError;

      // Fetch page views in range
      const { data: pageViews, error: pageError } = await supabase
        .from('page_views')
        .select('viewed_at')
        .eq('site_id', siteId)
        .gte('viewed_at', `${startDate}T00:00:00.000Z`)
        .lte('viewed_at', `${endDate}T23:59:59.999Z`);
      if (pageError) throw pageError;

      // Initialize months
      const months = Array.from({ length: 12 }, (_, idx) => ({
        month: (idx + 1).toString().padStart(2, '0'),
        monthName: ['January','February','March','April','May','June','July','August','September','October','November','December'][idx],
        uniqueUsers: 0,
        totalUsers: 0,
        newUsers: 0,
        sessions: 0,
        pageViews: 0,
        pageViewsPerSession: 0,
        avgDuration: 0,
        bounceRate: 0,
        conversionRate: 0,
        conversions: 0,
        transactions: 0,
        revenue: 0,
        purchaseRevenue: 0,
        eventCount: 0,
        eventCountPerUser: 0,
        growth: { users: 0, sessions: 0, revenue: 0 }
      }));

      // Group sessions by month
      const monthSessionMap: Record<string, { sessions: number; engagedSessions: number; duration: number; pageViews: number; uniqueSessionIds: Set<string> }> = {};
      months.forEach(m => monthSessionMap[m.month] = { sessions: 0, engagedSessions: 0, duration: 0, pageViews: 0, uniqueSessionIds: new Set() });

      sessions?.forEach(s => {
        const d = new Date(s.started_at as string);
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const map = monthSessionMap[month];
        map.sessions += 1;
        map.duration += (s.duration_seconds || 0);
        map.pageViews += (s.page_views || 0);
        map.uniqueSessionIds.add(s.session_id as string);
        const engaged = (s.duration_seconds && s.duration_seconds > 10) || (s.page_views && s.page_views > 1);
        if (engaged) map.engagedSessions += 1;
      });

      months.forEach(m => {
        const map = monthSessionMap[m.month];
        m.sessions = map.sessions;
        m.pageViews = map.pageViews;
        m.avgDuration = map.sessions > 0 ? map.duration / map.sessions : 0;
        m.uniqueUsers = map.uniqueSessionIds.size; // approximation
        m.totalUsers = m.uniqueUsers;
        m.pageViewsPerSession = map.sessions > 0 ? m.pageViews / m.sessions : 0;
        m.eventCount = 0;
        m.eventCountPerUser = m.uniqueUsers > 0 ? m.eventCount / m.uniqueUsers : 0;
        m.conversionRate = 0;
      });

      setFallbackMonthly(months);
    } catch (e) {
      console.error('computeFallbackMonthly error:', e);
      setFallbackMonthly([]);
    }
  };

  // Fetch data for the full year
  useEffect(() => {
    fetchKPIData();
  }, [siteId, year]);

  // Helper function to get monthly overview
  const getMonthlyOverview = () => {
    if (fallbackMonthly.length > 0) return fallbackMonthly;

    // Initialize all 12 months with zero values
    const allMonths = Array.from({ length: 12 }, (_, index) => ({
      month: (index + 1).toString().padStart(2, '0'),
      monthName: ['January', 'February', 'March', 'April', 'May', 'June',
                 'July', 'August', 'September', 'October', 'November', 'December'][index],
      uniqueUsers: 0,
      totalUsers: 0,
      newUsers: 0,
      sessions: 0,
      pageViews: 0,
      pageViewsPerSession: 0,
      avgDuration: 0,
      bounceRate: 0,
      conversionRate: 0,
      conversions: 0,
      transactions: 0,
      revenue: 0,
      purchaseRevenue: 0,
      eventCount: 0,
      eventCountPerUser: 0,
      growth: {
        users: 0,
        sessions: 0,
        revenue: 0
      }
    }));

    if (!data?.overgripande?.data) return allMonths;

    // Process data by month and device
    const processedData: Record<string, any> = {};
    
    // Initialize all months in processedData
    allMonths.forEach(month => {
      processedData[month.month] = { ...month };
    });
    
    data.overgripande.data.forEach((row: any) => {
      const month = row.dimensions.month;
      const device = row.dimensions.deviceCategory;
      
      if (processedData[month]) {
        // Aggregate metrics across devices
        processedData[month].uniqueUsers += row.metrics.activeUsers?.current || 0;
        processedData[month].totalUsers += row.metrics.activeUsers?.current || 0; // GA4 uses activeUsers as totalUsers
        processedData[month].newUsers += row.metrics.newUsers?.current || 0;
        processedData[month].sessions += row.metrics.sessions?.current || 0;
        processedData[month].pageViews += row.metrics.screenPageViews?.current || 0;
        processedData[month].avgDuration += row.metrics.averageSessionDuration?.current || 0;
        processedData[month].bounceRate += row.metrics.bounceRate?.current || 0;
        processedData[month].conversions += row.metrics.conversions?.current || 0;
        processedData[month].transactions += row.metrics.transactions?.current || 0;
        processedData[month].revenue += row.metrics.totalRevenue?.current || 0;
        processedData[month].purchaseRevenue += row.metrics.purchaseRevenue?.current || 0;
        processedData[month].eventCount += row.metrics.eventCount?.current || 0;
        
        // Calculate derived metrics
        if (processedData[month].uniqueUsers > 0) {
          processedData[month].eventCountPerUser = processedData[month].eventCount / processedData[month].uniqueUsers;
        }
        if (processedData[month].sessions > 0) {
          processedData[month].pageViewsPerSession = processedData[month].pageViews / processedData[month].sessions;
        }
        
        // Calculate growth
        if (row.metrics.activeUsers?.growth !== undefined) {
          processedData[month].growth.users = row.metrics.activeUsers.growth;
        }
        if (row.metrics.sessions?.growth !== undefined) {
          processedData[month].growth.sessions = row.metrics.sessions.growth;
        }
        if (row.metrics.totalRevenue?.growth !== undefined) {
          processedData[month].growth.revenue = row.metrics.totalRevenue.growth;
        }
        
        console.log(`Month ${month} - Growth data:`, {
          usersGrowth: row.metrics.activeUsers?.growth,
          sessionsGrowth: row.metrics.sessions?.growth,
          revenueGrowth: row.metrics.totalRevenue?.growth,
          fullMetrics: row.metrics
        });
      }
    });

    // Convert to array and calculate conversion rates, keep all 12 months
    return allMonths.map(month => {
      const monthData = processedData[month.month];
      if (monthData.sessions > 0) {
        monthData.conversionRate = ((monthData.conversions || 0) / monthData.sessions * 100);
      }
      return monthData;
    });
  };

  // Helper function to get channel breakdown
  const getChannelBreakdown = () => {
    if (!data?.digitala_kanaler?.data) return [];

    const channels: Record<string, any> = {};
    
    data.digitala_kanaler.data.forEach((row: any) => {
      const source = row.dimensions.sessionSource;
      const medium = row.dimensions.sessionMedium;
      const channelKey = `${source}/${medium}`;
      
      if (!channels[channelKey]) {
        channels[channelKey] = {
          name: channelKey,
          sessions: 0,
          users: 0,
          conversions: 0,
          revenue: 0,
          conversionRate: 0
        };
      }
      
      channels[channelKey].sessions += row.metrics.sessions?.current || 0;
      channels[channelKey].users += row.metrics.activeUsers?.current || 0;
      channels[channelKey].conversions += row.metrics.conversions?.current || 0;
      channels[channelKey].revenue += row.metrics.totalRevenue?.current || 0;
    });

    // Calculate conversion rates and sort by sessions
    return Object.values(channels)
      .map((channel: any) => ({
        ...channel,
        conversionRate: channel.sessions > 0 ? (channel.conversions / channel.sessions * 100) : 0
      }))
      .sort((a: any, b: any) => b.sessions - a.sessions);
  };

  // Helper function to get AI traffic insights
  const getAITrafficInsights = () => {
    if (!data?.artificiell_intelligens?.data) return [];

    const aiPlatforms: Record<string, any> = {};
    
    data.artificiell_intelligens.data.forEach((row: any) => {
      const source = row.dimensions.sessionSource;
      
      if (!aiPlatforms[source]) {
        aiPlatforms[source] = {
          platform: source,
          sessions: 0,
          users: 0,
          conversions: 0,
          revenue: 0,
          avgDuration: 0,
          bounceRate: 0
        };
      }
      
      aiPlatforms[source].sessions += row.metrics.sessions?.current || 0;
      aiPlatforms[source].users += row.metrics.activeUsers?.current || 0;
      aiPlatforms[source].conversions += row.metrics.conversions?.current || 0;
      aiPlatforms[source].revenue += row.metrics.totalRevenue?.current || 0;
      aiPlatforms[source].avgDuration += row.metrics.averageSessionDuration?.current || 0;
      aiPlatforms[source].bounceRate += row.metrics.bounceRate?.current || 0;
    });

    return Object.values(aiPlatforms).sort((a: any, b: any) => b.sessions - a.sessions);
  };

  // The tab has real data to render when GA4 returned something OR the first-party
  // fallback produced months. usingFallback lets the UI label the data source.
  const usingFallback = !data && fallbackMonthly.length > 0;
  const hasData = !!data || fallbackMonthly.length > 0;

  return {
    data,
    loading,
    error,
    hasData,
    usingFallback,
    refetch: fetchKPIData,
    monthlyOverview: getMonthlyOverview(),
    channelBreakdown: getChannelBreakdown(),
    aiTrafficInsights: getAITrafficInsights()
  };
}
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { monthColumns, percentChange, sameRangeLastYear } from '@/lib/dashboard/filters';

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

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

export interface MonthlyKPI {
  month: string;      // 'MM'
  monthName: string;
  uniqueUsers: number;
  totalUsers: number;
  newUsers: number;
  sessions: number;
  pageViews: number;
  pageViewsPerSession: number;
  avgDuration: number;
  bounceRate: number;
  conversionRate: number;
  conversions: number;
  transactions: number;
  revenue: number;
  purchaseRevenue: number;
  eventCount: number;
  eventCountPerUser: number;
  /** Percent change against the same month one year earlier; null when that month had no data. */
  growth: { users: number | null; sessions: number | null; revenue: number | null };
}

type PeriodTotals = { users: number; sessions: number; revenue: number; conversions: number };

function emptyMonth(month: string): MonthlyKPI {
  return {
    month,
    monthName: MONTH_NAMES[Number(month) - 1] ?? month,
    uniqueUsers: 0, totalUsers: 0, newUsers: 0, sessions: 0, pageViews: 0, pageViewsPerSession: 0,
    avgDuration: 0, bounceRate: 0, conversionRate: 0, conversions: 0, transactions: 0, revenue: 0,
    purchaseRevenue: 0, eventCount: 0, eventCountPerUser: 0,
    growth: { users: null, sessions: null, revenue: null },
  };
}

/**
 * KPI dashboard data for the global date range (inclusive YYYY-MM-DD), compared with the
 * same period one year earlier. GA4 first; CortIQ's own sessions when GA4 has nothing.
 */
export function useKPIDashboard(siteId: string, range: { from: string; to: string }) {
  const [data, setData] = useState<KPIData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallbackMonthly, setFallbackMonthly] = useState<MonthlyKPI[]>([]);
  const [fallbackTotals, setFallbackTotals] = useState<{ current: PeriodTotals; previous: PeriodTotals } | null>(null);

  const comparison = sameRangeLastYear(range.from, range.to);
  const { months, foldedMonths } = monthColumns(range.from, range.to);

  const fetchKPIData = async () => {
    if (!siteId) return;

    setLoading(true);
    setError(null);

    try {
      const { data: kpiData, error: functionError } = await supabase.functions.invoke('ga4-kpi-dashboard', {
        body: {
          siteId,
          startDate: range.from,
          endDate: range.to,
          comparisonStartDate: comparison.from,
          comparisonEndDate: comparison.to,
        }
      });

      if (functionError) {
        throw new Error(functionError.message || 'Failed to fetch KPI data');
      }

      // GA4 returned usable monthly data — use it and drop any stale fallback.
      if (kpiData?.overgripande?.data?.length > 0) {
        setData(kpiData);
        setFallbackMonthly([]);
        setFallbackTotals(null);
        return;
      }

      // GA4 responded but has nothing (typically: no ga_measurement_id on the site).
      // Fall back to CortIQ's own first-party tables so the KPI tab still shows numbers.
      console.warn('KPI: no GA4 data returned, computing fallback from internal tables');
      setData(null);
      await computeFallbackMonthly();
    } catch (err) {
      // GA4 call failed entirely — try the first-party fallback before giving up.
      console.error('Error fetching KPI data, using internal fallback:', err);
      setData(null);
      setError(err instanceof Error ? err.message : 'Failed to fetch GA4 KPI data');
      await computeFallbackMonthly();
    } finally {
      setLoading(false);
    }
  };

  // Fallback from first-party sessions (get_kpi_monthly date-range overload), current
  // period and the same period last year.
  const computeFallbackMonthly = async () => {
    try {
      const rpc = (from: string, to: string) =>
        (supabase as any).rpc('get_kpi_monthly', { p_site_id: siteId, p_from: from, p_to: to });
      const [cur, prev] = await Promise.all([rpc(range.from, range.to), rpc(comparison.from, comparison.to)]);
      if (cur.error) throw cur.error;
      if (prev.error) throw prev.error;

      type Row = { month: string; sessions: number; unique_users: number; page_views: number; avg_duration: number };
      const byMonth = (rows: Row[] | null) => {
        const out: Record<string, { sessions: number; users: number; pageViews: number; duration: number }> = {};
        for (const r of rows ?? []) {
          const m = String(r.month).slice(5, 7);
          const o = (out[m] ??= { sessions: 0, users: 0, pageViews: 0, duration: 0 });
          o.sessions += Number(r.sessions);
          o.users += Number(r.unique_users);
          o.pageViews += Number(r.page_views);
          o.duration += Number(r.avg_duration) * Number(r.sessions);
        }
        return out;
      };
      const current = byMonth(cur.data);
      const previous = byMonth(prev.data);

      const monthly = months.map((m) => {
        const row = emptyMonth(m);
        const c = current[m];
        const p = previous[m];
        if (c) {
          row.sessions = c.sessions;
          row.pageViews = c.pageViews;
          row.avgDuration = c.sessions > 0 ? c.duration / c.sessions : 0;
          row.uniqueUsers = c.users; // approximation: distinct session ids
          row.totalUsers = c.users;
          row.pageViewsPerSession = c.sessions > 0 ? c.pageViews / c.sessions : 0;
        }
        row.growth = {
          users: percentChange(c?.users ?? 0, p?.users ?? 0),
          sessions: percentChange(c?.sessions ?? 0, p?.sessions ?? 0),
          revenue: null,
        };
        return row;
      });

      const sum = (o: typeof current, k: 'users' | 'sessions') => Object.values(o).reduce((s, v) => s + v[k], 0);
      setFallbackMonthly(monthly);
      setFallbackTotals({
        current: { users: sum(current, 'users'), sessions: sum(current, 'sessions'), revenue: 0, conversions: 0 },
        previous: { users: sum(previous, 'users'), sessions: sum(previous, 'sessions'), revenue: 0, conversions: 0 },
      });
    } catch (e) {
      console.error('computeFallbackMonthly error:', e);
      setFallbackMonthly([]);
      setFallbackTotals(null);
    }
  };

  useEffect(() => {
    fetchKPIData();
  }, [siteId, range.from, range.to]);

  // Monthly overview: one column per month of the range, devices folded together.
  const getMonthlyOverview = (): MonthlyKPI[] => {
    if (fallbackMonthly.length > 0) return fallbackMonthly;

    const rows: Record<string, MonthlyKPI> = {};
    const weights: Record<string, { duration: number; bounce: number }> = {};
    const prev: Record<string, { users: number; sessions: number; revenue: number }> = {};
    months.forEach((m) => {
      rows[m] = emptyMonth(m);
      weights[m] = { duration: 0, bounce: 0 };
      prev[m] = { users: 0, sessions: 0, revenue: 0 };
    });

    if (!data?.overgripande?.data) return months.map((m) => rows[m]);

    data.overgripande.data.forEach((row: any) => {
      const m = row.dimensions.month;
      const r = rows[m];
      if (!r) return;
      const met = row.metrics;
      const sessions = met.sessions?.current || 0;
      r.uniqueUsers += met.activeUsers?.current || 0;
      r.totalUsers += met.activeUsers?.current || 0; // GA4 uses activeUsers as totalUsers
      r.newUsers += met.newUsers?.current || 0;
      r.sessions += sessions;
      r.pageViews += met.screenPageViews?.current || 0;
      r.conversions += met.conversions?.current || 0;
      r.transactions += met.transactions?.current || 0;
      r.revenue += met.totalRevenue?.current || 0;
      r.purchaseRevenue += met.purchaseRevenue?.current || 0;
      r.eventCount += met.eventCount?.current || 0;
      // Per-device averages are weighted by sessions, not summed.
      weights[m].duration += (met.averageSessionDuration?.current || 0) * sessions;
      weights[m].bounce += (met.bounceRate?.current || 0) * sessions;
      prev[m].users += met.activeUsers?.comparison || 0;
      prev[m].sessions += met.sessions?.comparison || 0;
      prev[m].revenue += met.totalRevenue?.comparison || 0;
    });

    return months.map((m) => {
      const r = rows[m];
      if (r.sessions > 0) {
        r.avgDuration = weights[m].duration / r.sessions;
        r.bounceRate = weights[m].bounce / r.sessions;
        r.pageViewsPerSession = r.pageViews / r.sessions;
        r.conversionRate = (r.conversions / r.sessions) * 100;
      }
      if (r.uniqueUsers > 0) r.eventCountPerUser = r.eventCount / r.uniqueUsers;
      r.growth = {
        users: percentChange(r.uniqueUsers, prev[m].users),
        sessions: percentChange(r.sessions, prev[m].sessions),
        revenue: percentChange(r.revenue, prev[m].revenue),
      };
      return r;
    });
  };

  // Totals for the whole range and the same period last year.
  const getTotals = (): { current: PeriodTotals; previous: PeriodTotals } => {
    if (fallbackTotals) return fallbackTotals;
    const t = { current: { users: 0, sessions: 0, revenue: 0, conversions: 0 }, previous: { users: 0, sessions: 0, revenue: 0, conversions: 0 } };
    (data?.overgripande?.data ?? []).forEach((row: any) => {
      const met = row.metrics;
      t.current.users += met.activeUsers?.current || 0;
      t.current.sessions += met.sessions?.current || 0;
      t.current.revenue += met.totalRevenue?.current || 0;
      t.current.conversions += met.conversions?.current || 0;
      t.previous.users += met.activeUsers?.comparison || 0;
      t.previous.sessions += met.sessions?.comparison || 0;
      t.previous.revenue += met.totalRevenue?.comparison || 0;
      t.previous.conversions += met.conversions?.comparison || 0;
    });
    return t;
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
      .filter((channel: any) => channel.sessions > 0)
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

    return Object.values(aiPlatforms)
      .filter((p: any) => p.sessions > 0)
      .sort((a: any, b: any) => b.sessions - a.sessions);
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
    comparisonRange: comparison,
    foldedMonths,
    totals: getTotals(),
    monthlyOverview: getMonthlyOverview(),
    channelBreakdown: getChannelBreakdown(),
    aiTrafficInsights: getAITrafficInsights()
  };
}

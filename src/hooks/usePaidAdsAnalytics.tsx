import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDashboardFilters } from '@/contexts/DashboardFiltersContext';
import { useFilterParams } from '@/hooks/useFilterParams';

interface PaidAdsSummary {
  totalSessions: number;
  totalPageViews: number;
  totalConversions: number;
  totalRevenue: number;
  avgDuration: number;
  conversionRate: number;
}

interface CampaignMetrics {
  campaign: string;
  source: string;
  medium: string;
  sessions: number;
  pageViews: number;
  conversions: number;
  revenue: number;
  avgDuration: number;
  conversionRate: number;
  revenuePerSession: number;
  devices: {
    desktop: number;
    mobile: number;
    tablet: number;
  };
}

interface SourceMetrics {
  source: string;
  sessions: number;
  conversions: number;
  revenue: number;
}

interface MonthlyMetrics {
  month: string;
  sessions: number;
  conversions: number;
  revenue: number;
}

interface PaidAdsData {
  summary: PaidAdsSummary;
  campaigns: CampaignMetrics[];
  sources: SourceMetrics[];
  monthly: MonthlyMetrics[];
  rawSessions: number;
}

/**
 * CortIQ visits with a paid utm_medium for the global dashboard filters: date range, URL (the
 * visit viewed a page under it) and segment. Counted in the database (get_paid_ads_summary), so
 * there is no row cap. The paid-ads-analytics Edge Function is kept for older bundles.
 */
export function usePaidAdsAnalytics(siteId: string) {
  const { filters } = useDashboardFilters();
  const { p_path, p_segment } = useFilterParams();
  const p_from = filters.from;
  const p_to = filters.to;
  const query = useQuery({
    queryKey: ['paid-ads-summary', siteId, p_from, p_to, p_path, p_segment],
    queryFn: async (): Promise<PaidAdsData> => {
      // Newer than the generated types; cast at the boundary.
      const { data, error } = await (supabase as any).rpc('get_paid_ads_summary', {
        p_site_id: siteId, p_from, p_to, p_path, p_segment,
      });
      if (error) throw error;
      return data as PaidAdsData;
    },
    enabled: !!siteId && !!p_from && !!p_to,
  });

  return {
    data: query.data ?? null,
    loading: query.isLoading,
    error: query.error ? (query.error instanceof Error ? query.error.message : 'Failed to fetch paid ads analytics') : null,
    refetch: query.refetch,
  };
}

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface GSCQuery {
  value: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GSCPage {
  value: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GSCSummary {
  totalClicks: number;
  totalImpressions: number;
  avgCtr: number;
  avgPosition: number;
}

function useGSCCredential(siteId: string | null) {
  return useQuery({
    queryKey: ['gsc-credential', siteId],
    enabled: !!siteId,
    queryFn: async () => {
      const { data } = await supabase
        .from('site_google_credentials')
        .select('id, property_url, last_sync_at, is_active, brand_keywords')
        .eq('site_id', siteId!)
        .eq('is_active', true)
        .maybeSingle();
      return data as (typeof data & { brand_keywords?: string | null }) | null;
    },
    staleTime: 0,
  });
}

export function useGSCMonthly(siteId: string | null) {
  return useQuery({
    queryKey: ['gsc-monthly', siteId],
    enabled: !!siteId,
    queryFn: async () => {
      // Up to 16 months × 1,000 queries; PostgREST returns at most 1,000 rows per request.
      const PAGE = 1000;
      const rows: { period_start: string; value: string; clicks: number; impressions: number; ctr: number; position: number }[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('gsc_data')
          .select('period_start, value, clicks, impressions, ctr, position')
          .eq('site_id', siteId!)
          .eq('dimension', 'query')
          .order('period_start', { ascending: true })
          .order('value', { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        rows.push(...(data ?? []));
        if (!data || data.length < PAGE) break;
      }
      return rows;
    },
    staleTime: 5 * 60_000,
  });
}

// Aggregated by RPC — each keyword/page appears exactly once (no per-period duplicates)
function useGSCRows(siteId: string | null, dimension: 'query' | 'page', limit = 200) {
  return useQuery({
    queryKey: ['gsc-data', siteId, dimension, limit],
    enabled: !!siteId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_gsc_aggregated', {
        p_site_id: siteId!,
        p_dimension: dimension,
        p_limit: limit,
      });
      if (error) throw error;
      return (data as GSCQuery[]) ?? [];
    },
    staleTime: 5 * 60_000,
  });
}

export function useGSCData(siteId: string | null) {
  const credential = useGSCCredential(siteId);
  const queries    = useGSCRows(siteId, 'query', 200);
  const pages      = useGSCRows(siteId, 'page',  200);

  const isConnected   = !!credential.data;
  const lastSync      = credential.data?.last_sync_at ?? null;
  const brandKeywords = credential.data?.brand_keywords ?? null;

  const summary: GSCSummary = {
    totalClicks:      queries.data?.reduce((s, r) => s + r.clicks, 0) ?? 0,
    totalImpressions: queries.data?.reduce((s, r) => s + r.impressions, 0) ?? 0,
    avgCtr:           queries.data?.length
      ? queries.data.reduce((s, r) => s + r.ctr, 0) / queries.data.length
      : 0,
    avgPosition: queries.data?.length
      ? queries.data.reduce((s, r) => s + r.position, 0) / queries.data.length
      : 0,
  };

  return {
    isConnected,
    lastSync,
    brandKeywords,
    queries:  queries.data ?? [],
    pages:    pages.data   ?? [],
    summary,
    loading:  credential.isLoading || queries.isLoading || pages.isLoading,
  };
}

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface GSCQuery {
  value: string;
  clicks: number;
  impressions: number;
  ctr: number;
  /** Impression-weighted; null only if the row has no impressions. */
  position: number | null;
}

export interface GSCPage {
  value: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number | null;
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
      // All rows for the site: a connected Google account with no chosen property is
      // a different state from no connection at all.
      const { data, error } = await supabase
        .from('site_google_credentials')
        .select('id, property_url, last_sync_at, is_active, brand_keywords')
        .eq('site_id', siteId!);
      if (error) throw error;
      const rows = (data ?? []) as { id: string; property_url: string; last_sync_at: string | null; is_active: boolean; brand_keywords?: string | null }[];
      return { active: rows.find((r) => r.is_active) ?? null, properties: rows.length };
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

  const active        = credential.data?.active ?? null;
  const isConnected   = !!active;
  // Google account connected, but no property chosen for this site yet.
  const needsProperty = !active && (credential.data?.properties ?? 0) > 0;
  const lastSync      = active?.last_sync_at ?? null;
  const brandKeywords = active?.brand_keywords ?? null;

  const summary: GSCSummary = {
    totalClicks:      queries.data?.reduce((s, r) => s + r.clicks, 0) ?? 0,
    totalImpressions: queries.data?.reduce((s, r) => s + r.impressions, 0) ?? 0,
    avgCtr:           queries.data?.length
      ? queries.data.reduce((s, r) => s + r.ctr, 0) / queries.data.length
      : 0,
    // Weighted by impressions, like Search Console's own average position.
    avgPosition: (() => {
      const rows = (queries.data ?? []).filter((r) => r.position != null && r.impressions > 0);
      const imps = rows.reduce((s, r) => s + r.impressions, 0);
      return imps > 0 ? rows.reduce((s, r) => s + r.position! * r.impressions, 0) / imps : 0;
    })(),
  };

  return {
    isConnected,
    needsProperty,
    lastSync,
    brandKeywords,
    queries:  queries.data ?? [],
    pages:    pages.data   ?? [],
    summary,
    loading:  credential.isLoading || queries.isLoading || pages.isLoading,
  };
}

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface GSCAIDataResult {
  available: boolean;
  totalImpressions: number;
  bySearchType: { searchType: string; impressions: number }[];
  topPages: { url: string; impressions: number }[];
  topCountries: { country: string; impressions: number }[];
  trend: { date: string; impressions: number }[];
}

const SEARCH_TYPE_LABELS: Record<string, string> = {
  AI_OVERVIEWS: 'AI Overviews',
  AI_MODE:      'AI Mode',
  DISCOVER_AI:  'Discover AI',
};

/**
 * `range` is the global dashboard date filter (inclusive YYYY-MM-DD). gsc_ai_data rows
 * are synced report periods, so a row is included when its period overlaps the range.
 */
export function useGSCAIData(siteId: string | null, range: { from: string; to: string }) {
  return useQuery({
    queryKey: ['gsc-ai-data', siteId, range.from, range.to],
    enabled: !!siteId,
    queryFn: async (): Promise<GSCAIDataResult> => {
      // gsc_ai_data is not in the generated Supabase types yet.
      const { data, error } = await (supabase as any)
        .from('gsc_ai_data')
        .select('search_type, dimension, value, impressions, period_end')
        .eq('site_id', siteId!)
        .gte('period_end', range.from)
        .lte('period_start', range.to)
        .order('period_end', { ascending: false });

      if (error) throw error;
      if (!data || data.length === 0) {
        return { available: false, totalImpressions: 0, bySearchType: [], topPages: [], topCountries: [], trend: [] };
      }

      // Aggregate by search_type
      const typeMap: Record<string, number> = {};
      // Aggregate pages (dimension = 'page')
      const pageMap: Record<string, number> = {};
      // Aggregate countries (dimension = 'country')
      const countryMap: Record<string, number> = {};

      for (const row of data) {
        if (row.dimension === 'page') {
          pageMap[row.value] = (pageMap[row.value] ?? 0) + row.impressions;
          typeMap[row.search_type] = (typeMap[row.search_type] ?? 0) + row.impressions;
        }
        if (row.dimension === 'country') {
          countryMap[row.value] = (countryMap[row.value] ?? 0) + row.impressions;
        }
      }

      const totalImpressions = Object.values(pageMap).reduce((s, v) => s + v, 0);

      const bySearchType = Object.entries(typeMap)
        .map(([searchType, impressions]) => ({ searchType: SEARCH_TYPE_LABELS[searchType] ?? searchType, impressions }))
        .sort((a, b) => b.impressions - a.impressions);

      const topPages = Object.entries(pageMap)
        .map(([url, impressions]) => ({ url, impressions }))
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, 10);

      const topCountries = Object.entries(countryMap)
        .map(([country, impressions]) => ({ country, impressions }))
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, 10);

      // Simple trend: sum page impressions by period_end date
      const trendMap: Record<string, number> = {};
      for (const row of data) {
        if (row.dimension === 'page') {
          trendMap[row.period_end] = (trendMap[row.period_end] ?? 0) + row.impressions;
        }
      }
      const trend = Object.entries(trendMap)
        .map(([date, impressions]) => ({ date, impressions }))
        .sort((a, b) => a.date.localeCompare(b.date));

      return { available: true, totalImpressions, bySearchType, topPages, topCountries, trend };
    },
  });
}

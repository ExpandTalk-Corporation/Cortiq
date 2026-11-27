import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { isA } from '../../supabase/functions/_shared/agent-ontology.ts';

export interface BotOverviewRow {
  bot_name: string;
  /** bot_catalog.category when detected: an agent ontology class ('ai_agent' in rows from before 2026-12). */
  bot_category: string;
  total_requests: number;
  last_seen: string;
  top_countries: { country: string; count: number }[];
  top_pages: { url: string; count: number }[];
  avg_confidence: number;
}

export interface BotHourlyPoint {
  hour: string;
  bot_name: string;
  bot_category: string;
  request_count: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  ai_agent:         'AI Agent',
  search_crawler:   'Search Crawler',
  seo_tool:         'SEO Tool',
  monitoring:       'Monitoring',
  training_crawler: 'Training Crawler',
  generic_bot:      'Generic Bot',
};

export function getBotCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

export function useBotOverview(
  companyId: string | null,
  from?: Date,
  to?: Date,
) {
  return useQuery<BotOverviewRow[]>({
    queryKey: ['bot-overview', companyId, from?.toISOString(), to?.toISOString()],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_bot_overview', {
        p_company_id: companyId,
        p_from: from?.toISOString() ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        p_to:   to?.toISOString()   ?? new Date().toISOString(),
      });

      if (error) throw new Error(error.message);
      return (data ?? []) as BotOverviewRow[];
    },
  });
}

export function useBotHourlyTrend(
  companyId: string | null,
  from?: Date,
  to?: Date,
) {
  return useQuery<BotHourlyPoint[]>({
    queryKey: ['bot-hourly', companyId, from?.toISOString(), to?.toISOString()],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async () => {
      const fromTs = from?.toISOString() ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const toTs   = to?.toISOString()   ?? new Date().toISOString();

      const { data, error } = await supabase
        .from('bot_hourly_stats')
        .select('hour, bot_name, bot_category, request_count')
        .eq('company_id', companyId!)
        .gte('hour', fromTs)
        .lte('hour', toTs)
        .order('hour', { ascending: true });

      if (error) throw new Error(error.message);
      return (data ?? []) as BotHourlyPoint[];
    },
  });
}

/** Summary stats computed from the bot overview rows. */
export function computeBotSummary(rows: BotOverviewRow[]) {
  const total = rows.reduce((s, r) => s + r.total_requests, 0);
  const aiAgentCount = rows
    .filter(r => isA(r.bot_category, 'ai_agent'))
    .reduce((s, r) => s + r.total_requests, 0);
  const crawlerCount = rows
    .filter(r => r.bot_category.endsWith('_crawler'))
    .reduce((s, r) => s + r.total_requests, 0);
  const topBot = rows[0] ?? null;

  return { total, aiAgentCount, crawlerCount, topBot };
}

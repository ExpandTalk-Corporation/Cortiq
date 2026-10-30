import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useConversionGoalHealth } from '@/hooks/useConversionGoalHealth';
import { fetchAnalyticsAcceptance } from '@/lib/consentAcceptance';
import { toAggregateSummary } from '@/lib/aggregateStats';
import { matchesGoal } from '@/lib/goalMatching';
import { assessPixelReadiness, type PrimaryGoalStatus, type ReadinessResult } from '@/lib/pixelReadiness';
import type { Site } from '@/types/dashboard';

type ReadinessSite = Site & {
  aggregate_measurement?: boolean;
  conversion_goals?: unknown;
  google_ads_customer_id?: string | null;
  google_ads_enabled?: boolean | null;
};

type ReadinessGoal = { id?: string; name?: string; selector?: string; is_primary?: boolean };

export interface PixelReadiness extends ReadinessResult {
  primaryGoalName: string | null;
  conversions: number;
  acceptanceRate: number | null;
  source: 'aggregate' | 'consented';
}

const DAY = 24 * 60 * 60 * 1000;
const rpc = supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;

export function usePixelReadiness(selectedSite: Site) {
  const site = selectedSite as ReadinessSite;
  const health = useConversionGoalHealth(site.id);
  const goals = Array.isArray(site.conversion_goals) ? (site.conversion_goals as ReadinessGoal[]) : [];
  const primary = goals.find((g) => g?.is_primary && typeof g.id === 'string' && typeof g.name === 'string') ?? null;
  const aggregate = site.aggregate_measurement === true;
  const primaryStatus = (health.data ?? []).find((h) => h.goalId === primary?.id)?.status ?? null;

  const query = useQuery({
    queryKey: ['pixel-readiness', site.id, primary?.id ?? null, aggregate, primaryStatus],
    enabled: !!site.id && !health.isLoading,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<PixelReadiness> => {
      const now = Date.now();
      const sinceIso = new Date(now - 30 * DAY).toISOString();
      const acceptance = await fetchAnalyticsAcceptance(supabase, site.id, sinceIso);

      let conversions = 0;
      let daysOfData = Math.min(30, Math.floor((now - new Date(site.created_at).getTime()) / DAY));
      if (primary && aggregate) {
        const { data, error } = await rpc.call(supabase, 'get_aggregate_summary', {
          p_site_id: site.id, p_from: sinceIso.slice(0, 10), p_to: new Date(now).toISOString().slice(0, 10),
        });
        if (error) throw new Error(error.message);
        const summary = toAggregateSummary(data);
        conversions = summary.conversionsByGoal.find((g) => g.goalId === primary.id)?.conversions ?? 0;
        daysOfData = summary.daysWithData;
      } else if (primary) {
        const { data, error } = await supabase
          .from('conversion_events')
          .select('event_name, element_selector')
          .eq('site_id', site.id)
          .gte('created_at', sinceIso);
        if (error) throw new Error(error.message);
        const primaryGoal = { name: primary.name as string, selector: primary.selector };
        conversions = (data ?? []).filter((e) => matchesGoal(e, primaryGoal)).length;
      }

      const result = assessPixelReadiness({
        hasPrimaryGoal: !!primary,
        primaryGoalStatus: primaryStatus as PrimaryGoalStatus,
        primaryConversions30d: conversions,
        acceptanceRate: acceptance,
        adsConnected: !!site.google_ads_customer_id || site.google_ads_enabled === true,
        daysOfData: Number.isFinite(daysOfData) ? daysOfData : 0,
      });
      return { ...result, primaryGoalName: primary?.name ?? null, conversions, acceptanceRate: acceptance, source: aggregate ? 'aggregate' : 'consented' };
    },
  });

  return { data: query.data, isLoading: query.isLoading || health.isLoading, error: query.error };
}

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { decide, marketOf } from '@/lib/jurisdiction';
import { assessPixelReadinessByCountry, type CountryAcceptance, type CountryReadinessResult } from '@/lib/pixelReadiness';
import { useSiteJurisdiction } from '@/hooks/useSiteJurisdiction';
import type { Site } from '@/types/dashboard';

const DAY = 24 * 60 * 60 * 1000;
type Goal = { id?: string; name?: string; type?: string; is_primary?: boolean };

export interface CoverageRow { country: string; purpose: string; decisions: number; permitted: number; refused: number; missing: number; gpc: number; blocked: number; enforcedDrops: number }
export interface CoverageByCountry {
  coverage: CoverageRow[];
  acceptanceByLang: { country: string; bannerLang: string; answers: number; analyticsAccepted: number; marketingAccepted: number }[];
  readiness: CountryReadinessResult | null;   // null without a primary page-visit/form goal and aggregate measurement
  primaryGoalName: string | null;
  from: string; to: string;
}

export function useCoverageByCountry(selectedSite: Site | null, category: 'analytics' | 'marketing' = 'analytics') {
  const site = selectedSite as (Site & { aggregate_measurement?: boolean; conversion_goals?: unknown }) | null;
  const siteId = site?.id;
  const j = useSiteJurisdiction(siteId);
  const goals = Array.isArray(site?.conversion_goals) ? (site.conversion_goals as Goal[]) : [];
  const primary = goals.find((g) => g?.is_primary && typeof g.id === 'string') ?? null;
  const perCountry = site?.aggregate_measurement === true && (primary?.type === 'page_visit' || primary?.type === 'form_submission');

  return useQuery({
    queryKey: ['coverage-by-country', siteId ?? null, primary?.id ?? null, perCountry, category, j.data?.tighten ?? null, j.data?.customer ?? null],
    enabled: !!siteId && !j.isLoading,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<CoverageByCountry> => {
      const now = Date.now();
      const from = new Date(now - 29 * DAY).toISOString().slice(0, 10);
      const to = new Date(now).toISOString().slice(0, 10);
      const args = { p_site_id: siteId!, p_from: from, p_to: to };
      const [cov, acc] = await Promise.all([
        supabase.rpc('coverage_by_country', args),
        supabase.rpc('consent_acceptance_by_country_lang', args),
      ]);
      if (cov.error) throw new Error(cov.error.message);
      if (acc.error) throw new Error(acc.error.message);
      const coverage = (cov.data ?? []).map((r) => ({ country: r.country, purpose: r.purpose, decisions: Number(r.decisions), permitted: Number(r.permitted),
        refused: Number(r.refused), missing: Number(r.missing), gpc: Number(r.gpc), blocked: Number(r.blocked), enforcedDrops: Number(r.enforced_drops) }));
      const acceptanceByLang = (acc.data ?? []).map((r) => ({ country: r.country, bannerLang: r.banner_lang, answers: Number(r.answers),
        analyticsAccepted: Number(r.analytics_accepted), marketingAccepted: Number(r.marketing_accepted) }));

      let readiness: CountryReadinessResult | null = null;
      if (perCountry && primary?.id) {
        const { data, error } = await supabase.from('aggregate_goal_countries_daily')
          .select('country, conversions').eq('site_id', siteId!).eq('goal_id', primary.id).gte('day', from).lte('day', to);
        if (error) throw new Error(error.message);
        const sums = new Map<string, number>();
        for (const r of data ?? []) sums.set(r.country, (sums.get(r.country) ?? 0) + Number(r.conversions));
        const acceptance = new Map<string, CountryAcceptance>();
        for (const a of acceptanceByLang) {
          const cur = acceptance.get(a.country) ?? { country: a.country, answers: 0, analyticsAccepted: 0, marketingAccepted: 0 };
          acceptance.set(a.country, { country: a.country, answers: cur.answers + a.answers,
            analyticsAccepted: cur.analyticsAccepted + a.analyticsAccepted, marketingAccepted: cur.marketingAccepted + a.marketingAccepted });
        }
        // A country is blocked for ad sharing when CortIQ's rules or the customer's own setting
        // block it even with marketing consent (the most an ad platform could ever get).
        const blockedCountries = [...sums.keys()].filter((c) => c && marketOf(c, null) && decide({
          visitor: { country: c, region: null, geoSource: 'ip' }, purpose: 'ad_platform_sharing',
          signals: { consent: { analytics: true, marketing: true }, evidence: 'ledger', gpc: false },
          technique: { storage: 'persistent', identifiers: 'cross_site' },
          customer: j.data?.customer ?? null, exceptions: [], tighten: j.data?.tighten ?? {}, testSite: false,
        }).outcome === 'blocked');
        readiness = assessPixelReadinessByCountry({
          goalCountries: [...sums].map(([country, conversions]) => ({ country, conversions })),
          acceptance: [...acceptance.values()], blockedCountries, category,
        });
      }
      return { coverage, acceptanceByLang, readiness, primaryGoalName: primary?.name ?? null, from, to };
    },
  });
}

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { sameRangeLastYear, trendBuckets } from '@/lib/dashboard/filters';
import { useFilterParams, type FilterParams } from '@/hooks/useFilterParams';
import { socialNetworkMeta } from '@/lib/socialNetworks';

// ── RPC shape (get_social_overview, 20261117000002_social_overview.sql) ────
interface RpcNetwork {
  network: string; sessions: number; page_views: number; engaged: number; conversions: number;
  key_page_visits: number; bounces: number; duration_sum: number; paid_sessions: number;
  click_id_sessions: number; tagged_sessions: number;
}
interface RpcOverview {
  total_sessions: number;
  social_sessions: number;
  networks: RpcNetwork[];
  daily: Array<{ day: string; network: string; sessions: number }>;
  landing_pages: Array<{ network: string; path: string; sessions: number; engaged: number; conversions: number }>;
  campaigns: Array<{ network: string; utm_source: string | null; utm_medium: string | null; utm_campaign: string | null;
    sessions: number; engaged: number; conversions: number; paid: boolean }>;
  aggregate: { enabled: boolean; networks: Array<{ network: string; visits: number; visitors: number; engaged_visits: number; conversions: number }> };
}

// ── Types ──────────────────────────────────────────────────────────────────
export interface NetworkStats {
  key: string;
  label: string;
  color: string;
  sessions: number;
  pageViews: number;
  pagesPerVisit: number;
  engaged: number;
  engagementRate: number; // percent
  conversions: number;
  keyPageVisits: number;
  bounceRate: number;     // percent
  avgDuration: number;    // seconds
  paidSessions: number;
  clickIdSessions: number;
  taggedSessions: number;
  previousSessions: number;
  trend: number[];
}

export interface SocialOverview {
  networks: NetworkStats[];
  totals: {
    sessions: number; previousSessions: number; allSessions: number; pageViews: number;
    engaged: number; conversions: number; keyPageVisits: number;
    paid: number; organic: number; clickIds: number; tagged: number;
  };
  trendKeys: string[];
  granularity: 'day' | 'month';
  landingPages: RpcOverview['landing_pages'];
  campaigns: RpcOverview['campaigns'];
  aggregate: RpcOverview['aggregate'];
}

async function fetchOverview(siteId: string, from: string, to: string, fp: FilterParams): Promise<RpcOverview> {
  const { data, error } = await (supabase as any)
    .rpc('get_social_overview', { p_site_id: siteId, p_from: from, p_to: to, ...fp });
  if (error) throw error;
  return data as RpcOverview;
}

const n = (v: unknown) => Number(v) || 0;

export function buildSocialOverview(cur: RpcOverview, prev: RpcOverview | null, from: string, to: string): SocialOverview {
  const buckets = trendBuckets(from, to);
  const bucketIdx = new Map(buckets.keys.map((k, i) => [k, i]));
  const prevByNet = new Map((prev?.networks ?? []).map((r) => [r.network, n(r.sessions)]));
  const trendByNet = new Map<string, number[]>();
  for (const d of cur.daily ?? []) {
    const t = trendByNet.get(d.network) ?? Array(buckets.keys.length).fill(0);
    const i = bucketIdx.get(buckets.keyOf(String(d.day).slice(0, 10)));
    if (i !== undefined) t[i] += n(d.sessions);
    trendByNet.set(d.network, t);
  }

  const networks: NetworkStats[] = (cur.networks ?? []).map((r) => {
    const meta = socialNetworkMeta(r.network);
    const sessions = n(r.sessions);
    return {
      key: r.network, label: meta.label, color: meta.color, sessions,
      pageViews: n(r.page_views),
      pagesPerVisit: sessions ? n(r.page_views) / sessions : 0,
      engaged: n(r.engaged),
      engagementRate: sessions ? (n(r.engaged) / sessions) * 100 : 0,
      conversions: n(r.conversions),
      keyPageVisits: n(r.key_page_visits),
      bounceRate: sessions ? (n(r.bounces) / sessions) * 100 : 0,
      avgDuration: sessions ? n(r.duration_sum) / sessions : 0,
      paidSessions: n(r.paid_sessions),
      clickIdSessions: n(r.click_id_sessions),
      taggedSessions: n(r.tagged_sessions),
      previousSessions: prevByNet.get(r.network) ?? 0,
      trend: trendByNet.get(r.network) ?? Array(buckets.keys.length).fill(0),
    };
  }).sort((a, b) => b.sessions - a.sessions);

  const sum = (f: (x: NetworkStats) => number) => networks.reduce((s, x) => s + f(x), 0);
  const paid = sum((x) => x.paidSessions);
  return {
    networks,
    totals: {
      sessions: sum((x) => x.sessions),
      previousSessions: (prev?.networks ?? []).reduce((s, r) => s + n(r.sessions), 0),
      allSessions: n(cur.total_sessions),
      pageViews: sum((x) => x.pageViews),
      engaged: sum((x) => x.engaged),
      conversions: sum((x) => x.conversions),
      keyPageVisits: sum((x) => x.keyPageVisits),
      paid,
      organic: sum((x) => x.sessions) - paid,
      clickIds: sum((x) => x.clickIdSessions),
      tagged: sum((x) => x.taggedSessions),
    },
    trendKeys: buckets.keys,
    granularity: buckets.granularity,
    landingPages: cur.landing_pages ?? [],
    campaigns: cur.campaigns ?? [],
    aggregate: cur.aggregate ?? { enabled: false, networks: [] },
  };
}

// ── Hook ───────────────────────────────────────────────────────────────────
/**
 * Social traffic for the global dashboard date range (inclusive YYYY-MM-DD) and the active
 * URL/segment filters, compared with the same period one year earlier. The trend is per day
 * for short ranges and per month for long ones (see trendBuckets).
 */
export function useSocialMedia(siteId: string, range: { from: string; to: string }) {
  const fp = useFilterParams();
  const query = useQuery({
    queryKey: ['social-overview', siteId, range.from, range.to, fp],
    enabled: !!siteId,
    queryFn: async () => {
      const previous = sameRangeLastYear(range.from, range.to);
      const [cur, prev] = await Promise.all([
        fetchOverview(siteId, range.from, range.to, fp),
        fetchOverview(siteId, previous.from, previous.to, fp).catch(() => null),
      ]);
      return buildSocialOverview(cur, prev, range.from, range.to);
    },
  });
  const err = query.error as { message?: string } | null;
  return {
    data: query.data,
    loading: query.isLoading,
    error: err ? err.message ?? 'Could not fetch social media data' : null,
    refetch: query.refetch,
  };
}

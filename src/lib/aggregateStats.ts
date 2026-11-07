// Maps get_aggregate_summary (supabase/migrations/20261107000001_aggregate_bursts_and_engagement.sql)
// to the shape the dashboard renders. Engagement metrics use GA4's definitions: an engaged visit
// has 10 s in the foreground, 2+ page views or a conversion; rate = engaged / visits, per visitor =
// engaged / visitors, average engagement time = engagement time / visitors. No '@/' imports: the foundation tests import this file directly.

export interface AggregateSummary {
  visitors: number;
  visits: number;
  pageviews: number;
  engagedVisits: number;
  engagementRate: number;
  engagedVisitsPerVisitor: number;
  avgEngagementSeconds: number;
  filteredHits: number;
  daysWithData: number;
  topSources: { label: string; visits: number; visitors: number; engagedVisits: number }[];
  topPages: { path: string; pageviews: number; entries: number }[];
  conversions: { goalId: string; goalName: string; source: string; conversions: number; value: number }[];
  conversionsByGoal: { goalId: string; goalName: string; conversions: number }[];
}

type Row = Record<string, unknown>;
const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const s = (v: unknown) => (typeof v === 'string' ? v : '');
const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);
const rows = (v: unknown): Row[] => (Array.isArray(v) ? v.filter((r): r is Row => !!r && typeof r === 'object') : []);

export function sourceLabel(r: { referrer_domain?: string; utm_source?: string; utm_medium?: string }): string {
  if (r.utm_source) return r.utm_medium ? `${r.utm_source} / ${r.utm_medium}` : r.utm_source;
  return r.referrer_domain || 'Direct';
}

export function toAggregateSummary(raw: unknown): AggregateSummary {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Row;
  const label = (x: Row) => sourceLabel({ referrer_domain: s(x.referrer_domain), utm_source: s(x.utm_source), utm_medium: s(x.utm_medium) });
  const visitors = n(r.visitors);
  const visits = n(r.visits);
  const engagedVisits = n(r.engaged_visits);
  return {
    visitors,
    visits,
    pageviews: n(r.pageviews),
    engagedVisits,
    engagementRate: ratio(engagedVisits, visits),
    engagedVisitsPerVisitor: ratio(engagedVisits, visitors),
    avgEngagementSeconds: ratio(n(r.engagement_ms), visitors) / 1000,
    filteredHits: n(r.filtered_hits),
    daysWithData: n(r.days_with_data),
    topSources: rows(r.top_sources).map(x => ({
      label: label(x), visits: n(x.visits), visitors: n(x.visitors), engagedVisits: n(x.engaged_visits),
    })),
    topPages: rows(r.top_pages).map(x => ({ path: s(x.path), pageviews: n(x.pageviews), entries: n(x.entries) })),
    conversions: rows(r.conversions).map(x => ({
      goalId: s(x.goal_id), goalName: s(x.goal_name), source: label(x), conversions: n(x.conversions), value: n(x.value),
    })),
    conversionsByGoal: rows(r.conversions_by_goal).map(x => ({ goalId: s(x.goal_id), goalName: s(x.goal_name), conversions: n(x.conversions) })),
  };
}

// Cookie-free tab: turns the raw counts from get_cookiefree_summary into the figures the tab
// shows. No '@/' imports so the foundation tests can import it directly.

export type CookiefreeRaw = {
  sessions: number;
  unique_visitors: number;
  bounces: number;
  duration_sessions: number;
  duration_sum: number;
  devices: Record<string, number>;
  browsers: Record<string, number>;
  os: Record<string, number>;
  sources: Record<string, number>;
  page_views: number;
  top_pages: Array<{ url: string; views: number; title: string | null; avgTime: number }>;
  banner_views: number;
  accepted_all: number;
  rejected_all: number;
  selective: number;
  analytics_granted: number;
};

export interface CookiefreeAnalytics {
  totalPageViews: number;
  totalSessions: number;
  uniqueVisitors: number;
  avgSessionDuration: number;
  avgPagesPerSession: number;
  bounceRate: number;

  totalBannerViews: number;
  acceptanceRate: number;
  rejectionRate: number;
  selectiveRate: number;
  acceptedAll: number;
  rejectedAll: number;
  selectiveAccept: number;

  deviceBreakdown: Record<string, number>;
  browserBreakdown: Record<string, number>;
  osBreakdown: Record<string, number>;
  mobileMetrics: { mobilePercentage: number; tabletPercentage: number; desktopPercentage: number };

  topPages: Array<{ url: string; views: number; title: string; avgTime: number }>;
  referralSources: Record<string, number>;

  estimatedTotalSessions: number;
  estimatedLostData: number;
  dataLossPercentage: number;
  consentRate: number;

  period: { startDate: string; endDate: string; days: number };
}

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round1 = (v: number) => Math.round(v * 10) / 10;
const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);
const numMap = (m: unknown): Record<string, number> =>
  Object.fromEntries(Object.entries((m ?? {}) as Record<string, unknown>).map(([k, v]) => [k, n(v)]));

/** Days in the period, both ends included (2026-11-01..2026-11-01 is one day). */
export function periodDays(startDate: string, endDate: string): number {
  const ms = Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.max(1, Math.round(ms / 86_400_000) + 1) : 1;
}

export function buildCookiefreeAnalytics(raw: Partial<CookiefreeRaw> | null | undefined, startDate: string, endDate: string): CookiefreeAnalytics {
  const r = raw ?? {};
  const totalSessions = n(r.sessions);
  const totalPageViews = n(r.page_views);
  const totalBannerViews = n(r.banner_views);
  const acceptedAll = n(r.accepted_all);
  const rejectedAll = n(r.rejected_all);
  const selectiveAccept = n(r.selective);
  const devices = numMap(r.devices);

  // Sessions are tracked after analytics consent, so the estimate scales by the share of banner
  // answers that granted analytics (src/lib/consentAcceptance.ts). acceptanceRate is the stricter
  // "accept all" figure.
  const consentRate = totalBannerViews > 0 ? n(r.analytics_granted) / totalBannerViews : 0;
  const estimatedTotalSessions = consentRate > 0 ? Math.round(totalSessions / consentRate) : totalSessions;
  const estimatedLostData = estimatedTotalSessions - totalSessions;

  return {
    totalPageViews,
    totalSessions,
    uniqueVisitors: n(r.unique_visitors),
    avgSessionDuration: n(r.duration_sessions) > 0 ? Math.round(n(r.duration_sum) / n(r.duration_sessions)) : 0,
    avgPagesPerSession: totalSessions > 0 ? round1(totalPageViews / totalSessions) : 0,
    bounceRate: round1(pct(n(r.bounces), totalSessions)),

    totalBannerViews,
    acceptanceRate: round1(pct(acceptedAll, totalBannerViews)),
    rejectionRate: round1(pct(rejectedAll, totalBannerViews)),
    selectiveRate: round1(pct(selectiveAccept, totalBannerViews)),
    acceptedAll,
    rejectedAll,
    selectiveAccept,

    deviceBreakdown: devices,
    browserBreakdown: numMap(r.browsers),
    osBreakdown: numMap(r.os),
    mobileMetrics: {
      mobilePercentage: pct(devices.mobile ?? 0, totalSessions),
      tabletPercentage: pct(devices.tablet ?? 0, totalSessions),
      desktopPercentage: pct(devices.desktop ?? 0, totalSessions),
    },

    topPages: (r.top_pages ?? []).map((p) => ({ url: p.url, views: n(p.views), title: p.title ?? '', avgTime: n(p.avgTime) })),
    referralSources: numMap(r.sources),

    estimatedTotalSessions,
    estimatedLostData,
    dataLossPercentage: round1(pct(estimatedLostData, estimatedTotalSessions)),
    consentRate: Math.round(consentRate * 1000) / 10,

    period: { startDate, endDate, days: periodDays(startDate, endDate) },
  };
}

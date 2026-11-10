// Content tab, first-party view: per-page rows from get_content_pages plus derived rates and a
// simple engagement score. No '@/' imports so the foundation tests can import it directly.

export type ContentPageRaw = {
  path: string;
  title: string | null;
  views: number;
  visits: number;
  entries: number;
  exits: number;
  time_samples: number;
  avg_time_seconds: number | null;
  scroll_25: number;
  scroll_50: number;
  scroll_75: number;
  scroll_100: number;
};

export type ContentPagesRaw = {
  visits: number;
  page_views: number;
  has_scroll: boolean;
  pages: ContentPageRaw[];
};

export type ContentPage = {
  path: string;
  title: string | null;
  views: number;
  visits: number;
  entries: number;
  /** Share of all visits in the range that started on this page, 0–100. */
  entryShare: number;
  /** Share of this page's views that ended the visit, 0–100. */
  exitRate: number;
  /** Seconds, from the gap to the next view in the same visit; null without samples. */
  avgTimeSeconds: number | null;
  /** Share of page views reaching 50/75/100 % scroll, 0–100; null when the page has no scroll data. */
  reach50: number | null;
  reach75: number | null;
  reach100: number | null;
  /** 0–100; null when the page has too few views to rank. */
  engagement: number | null;
};

export type ContentPagesSummary = { visits: number; pageViews: number; hasScroll: boolean; pages: ContentPage[] };

/** Pages with fewer views than this are listed but not given an engagement score. */
export const MIN_VIEWS_FOR_SCORE = 5;
/** Average time on page that counts as full marks in the score. */
export const TIME_TARGET_SECONDS = 120;

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const share = (part: number, whole: number) => (whole > 0 ? Math.min(100, Math.round((part / whole) * 1000) / 10) : 0);

/**
 * Engagement score, 0–100: the mean of the signals the page has —
 * time on page (relative to TIME_TARGET_SECONDS, capped), share reaching 75 % scroll, and the
 * share of views that continued to another page (100 − exit rate).
 */
export function engagementScore(p: Pick<ContentPage, 'views' | 'avgTimeSeconds' | 'reach75' | 'exitRate'>): number | null {
  if (p.views < MIN_VIEWS_FOR_SCORE) return null;
  const parts: number[] = [100 - p.exitRate];
  if (p.avgTimeSeconds != null) parts.push(Math.min(1, p.avgTimeSeconds / TIME_TARGET_SECONDS) * 100);
  if (p.reach75 != null) parts.push(p.reach75);
  return Math.round(parts.reduce((s, v) => s + v, 0) / parts.length);
}

export function summariseContentPages(raw: Partial<ContentPagesRaw> | null | undefined): ContentPagesSummary {
  const totalVisits = n(raw?.visits);
  const pages = (raw?.pages ?? []).map((r): ContentPage => {
    const views = n(r.views);
    const hasScroll = n(r.scroll_25) + n(r.scroll_50) + n(r.scroll_75) + n(r.scroll_100) > 0;
    const page: ContentPage = {
      path: r.path,
      title: r.title ?? null,
      views,
      visits: n(r.visits),
      entries: n(r.entries),
      entryShare: share(n(r.entries), totalVisits),
      exitRate: share(n(r.exits), views),
      avgTimeSeconds: n(r.time_samples) > 0 && r.avg_time_seconds != null ? n(r.avg_time_seconds) : null,
      reach50: hasScroll ? share(n(r.scroll_50), views) : null,
      reach75: hasScroll ? share(n(r.scroll_75), views) : null,
      reach100: hasScroll ? share(n(r.scroll_100), views) : null,
      engagement: null,
    };
    page.engagement = engagementScore(page);
    return page;
  });
  return { visits: totalVisits, pageViews: n(raw?.page_views), hasScroll: raw?.has_scroll === true, pages };
}

export function formatSeconds(s: number | null): string {
  if (s == null) return '—';
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`;
}

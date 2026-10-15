import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { sameRangeLastYear, trendBuckets } from '@/lib/dashboard/filters';

// ── Platform definitions ───────────────────────────────────────────────────
export interface SocialPlatformDef {
  key: string;
  label: string;
  color: string;
  domains: string[];
  utmSources: string[];
}

export const SOCIAL_PLATFORMS: SocialPlatformDef[] = [
  { key: 'facebook',  label: 'Facebook',   color: '#1877F2', domains: ['facebook.com','fb.com','l.facebook.com','m.facebook.com'], utmSources: ['facebook','fb'] },
  { key: 'instagram', label: 'Instagram',  color: '#E4405F', domains: ['instagram.com','l.instagram.com'],                         utmSources: ['instagram','ig'] },
  { key: 'linkedin',  label: 'LinkedIn',   color: '#0A66C2', domains: ['linkedin.com','lnkd.in'],                                   utmSources: ['linkedin','li'] },
  { key: 'twitter',   label: 'X / Twitter',color: '#14171A', domains: ['twitter.com','x.com','t.co'],                              utmSources: ['twitter','x','tweet','x.com'] },
  { key: 'tiktok',    label: 'TikTok',     color: '#FE2C55', domains: ['tiktok.com'],                                               utmSources: ['tiktok','tt'] },
  { key: 'youtube',   label: 'YouTube',    color: '#FF0000', domains: ['youtube.com','youtu.be'],                                   utmSources: ['youtube','yt'] },
  { key: 'pinterest', label: 'Pinterest',  color: '#E60023', domains: ['pinterest.com','pin.it'],                                   utmSources: ['pinterest','pin'] },
  { key: 'reddit',    label: 'Reddit',     color: '#FF4500', domains: ['reddit.com','redd.it'],                                     utmSources: ['reddit'] },
];

function detectPlatform(referrer: string | null, utmSource: string | null): string | null {
  const src = (utmSource ?? '').toLowerCase().trim();
  const ref = (referrer  ?? '').toLowerCase().trim();

  for (const p of SOCIAL_PLATFORMS) {
    if (p.utmSources.some(u => src === u || src.startsWith(u + '.'))) return p.key;
    if (p.domains.some(d => ref.includes(d))) return p.key;
    // Loose utm_source match (e.g. utm_source=Facebook matches facebook)
    if (src && p.key.startsWith(src.slice(0, 4))) return p.key;
  }
  return null;
}

// ── Types ──────────────────────────────────────────────────────────────────
export interface PlatformStats {
  platformKey: string;
  label: string;
  color: string;
  sessions: number;
  uniqueUsers: number;
  pageViews: number;
  avgDuration: number;   // seconds
  bounceRate: number;    // percent
  // UTM campaigns from this platform
  campaigns: Array<{ name: string; sessions: number }>;
  // Sessions per trend bucket (see SocialMediaResult.trendKeys)
  trend: number[];
  // Sessions in the same period one year earlier
  previousSessions: number;
}

export interface SocialSummary {
  totalSessions: number;
  totalUniqueUsers: number;
  topPlatform: string | null;
  hasDarkSocial: boolean; // if many sessions have no referrer at all
  // Same period one year earlier
  previousSessions: number;
  previousUniqueUsers: number;
}

type SocialRow = {
  day: string; referrer: string; utm_source: string; utm_campaign: string;
  sessions: number; unique_users: number; page_views: number; avg_duration: number; bounces: number;
};

async function fetchSocialRows(siteId: string, from: string, to: string): Promise<SocialRow[]> {
  const { data, error } = await (supabase as any)
    .rpc('get_social_daily', { p_site_id: siteId, p_from: from, p_to: to });
  if (error) throw error;
  return (data ?? []) as SocialRow[];
}

// ── Hook ───────────────────────────────────────────────────────────────────
/**
 * Social traffic for the global dashboard date range (inclusive YYYY-MM-DD), compared with
 * the same period one year earlier. The trend is per day for short ranges and per month
 * for long ones (see trendBuckets).
 */
export function useSocialMedia(siteId: string, range: { from: string; to: string }) {
  const [platforms, setPlatforms] = useState<PlatformStats[]>([]);
  const [summary, setSummary] = useState<SocialSummary>({
    totalSessions: 0, totalUniqueUsers: 0, topPlatform: null, hasDarkSocial: false,
    previousSessions: 0, previousUniqueUsers: 0,
  });
  const [trendKeys, setTrendKeys] = useState<string[]>([]);
  const [granularity, setGranularity] = useState<'day' | 'month'>('day');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    setError(null);

    try {
      const previous = sameRangeLastYear(range.from, range.to);
      const [rows, previousRows] = await Promise.all([
        fetchSocialRows(siteId, range.from, range.to),
        fetchSocialRows(siteId, previous.from, previous.to),
      ]);
      const buckets = trendBuckets(range.from, range.to);
      const bucketIdx = new Map(buckets.keys.map((k, i) => [k, i]));

      // Per-platform accumulators
      type Acc = {
        sessions: number;
        users: number;
        pageViews: number;
        totalDuration: number;
        bounces: number;
        campaigns: Record<string, number>;
        trend: number[];
        previousSessions: number;
        previousUsers: number;
      };
      const acc: Record<string, Acc> = {};
      for (const p of SOCIAL_PLATFORMS) {
        acc[p.key] = {
          sessions: 0, users: 0, pageViews: 0, totalDuration: 0, bounces: 0, campaigns: {},
          trend: Array(buckets.keys.length).fill(0), previousSessions: 0, previousUsers: 0,
        };
      }

      let directCount = 0;

      rows.forEach((row) => {
        const key = detectPlatform(row.referrer || null, row.utm_source || null);
        if (!key) {
          if (!row.referrer && !row.utm_source) directCount += Number(row.sessions);
          return;
        }
        const a = acc[key];
        if (!a) return;

        const s = Number(row.sessions);
        a.sessions    += s;
        a.users       += Number(row.unique_users);
        a.pageViews   += Number(row.page_views);
        a.totalDuration += Number(row.avg_duration) * s;
        a.bounces     += Number(row.bounces);
        const idx = bucketIdx.get(buckets.keyOf(row.day));
        if (idx !== undefined) a.trend[idx] += s;

        const campaign = (row.utm_campaign as string) || '(no campaign)';
        a.campaigns[campaign] = (a.campaigns[campaign] ?? 0) + s;
      });

      previousRows.forEach((row) => {
        const key = detectPlatform(row.referrer || null, row.utm_source || null);
        const a = key ? acc[key] : undefined;
        if (!a) return;
        a.previousSessions += Number(row.sessions);
        a.previousUsers    += Number(row.unique_users);
      });

      const result: PlatformStats[] = SOCIAL_PLATFORMS
        .map(p => {
          const a = acc[p.key];
          return {
            platformKey: p.key,
            label: p.label,
            color: p.color,
            sessions: a.sessions,
            uniqueUsers: a.users,
            pageViews: a.pageViews,
            avgDuration: a.sessions > 0 ? a.totalDuration / a.sessions : 0,
            bounceRate: a.sessions > 0 ? (a.bounces / a.sessions) * 100 : 0,
            campaigns: Object.entries(a.campaigns)
              .sort((x, y) => y[1] - x[1])
              .slice(0, 5)
              .map(([name, sessions]) => ({ name, sessions })),
            trend: a.trend,
            previousSessions: a.previousSessions,
          };
        })
        .filter(p => p.sessions > 0)
        .sort((a, b) => b.sessions - a.sessions);

      const totalSessions = result.reduce((s, p) => s + p.sessions, 0);
      const totalUsers    = result.reduce((s, p) => s + p.uniqueUsers, 0);

      setPlatforms(result);
      setTrendKeys(buckets.keys);
      setGranularity(buckets.granularity);
      setSummary({
        totalSessions,
        totalUniqueUsers: totalUsers,
        topPlatform: result[0]?.platformKey ?? null,
        hasDarkSocial: directCount > totalSessions * 0.3,
        previousSessions: Object.values(acc).reduce((s, a) => s + a.previousSessions, 0),
        previousUniqueUsers: Object.values(acc).reduce((s, a) => s + a.previousUsers, 0),
      });
    } catch (err: any) {
      setError(err?.message ?? err?.error_description ?? 'Could not fetch social media data');
    } finally {
      setLoading(false);
    }
  }, [siteId, range.from, range.to]);

  useEffect(() => { fetch(); }, [fetch]);

  return { platforms, summary, trendKeys, granularity, loading, error, refetch: fetch };
}

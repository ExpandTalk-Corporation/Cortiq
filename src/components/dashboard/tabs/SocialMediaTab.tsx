import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useDashboardFilters } from '@/contexts/DashboardFiltersContext';
import { percentChange } from '@/lib/dashboard/filters';
import {
  Users, MousePointer, Clock, TrendingUp, TrendingDown,
  AlertCircle, RefreshCw, ChevronDown, ChevronUp, ExternalLink,
  Loader2, Share2, BarChart3, Tag, Lightbulb
} from 'lucide-react';
import type { Site } from '@/types/dashboard';
import { useSocialMedia, SOCIAL_PLATFORMS, type PlatformStats } from '@/hooks/useSocialMedia';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Legend
} from 'recharts';

// ── Helpers ────────────────────────────────────────────────────────────────
function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return n.toFixed(0);
}

function fmtDur(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** 'YYYY-MM-DD' → 'Sep 3', 'YYYY-MM' → 'Sep 26'. */
function fmtBucket(key: string): string {
  const month = MONTH_SHORT[Number(key.slice(5, 7)) - 1] ?? key;
  return key.length > 7 ? `${month} ${Number(key.slice(8, 10))}` : `${month} ${key.slice(2, 4)}`;
}

/** Year-over-year change badge; nothing when last year had no traffic. */
function YoY({ current, previous }: { current: number; previous: number }) {
  const pct = percentChange(current, previous);
  if (pct === null) return <span className="text-[11px] text-muted-foreground">No data same period last year</span>;
  return (
    <span className={`text-[11px] font-medium ${pct >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
      {pct > 0 ? '+' : ''}{pct}% vs same period last year
    </span>
  );
}

// ── Platform icon initials ─────────────────────────────────────────────────
function PlatformBadge({ platform, size = 'md' }: { platform: PlatformStats; size?: 'sm' | 'md' }) {
  const sz = size === 'sm' ? 'w-6 h-6 text-[10px]' : 'w-9 h-9 text-sm';
  return (
    <div
      className={`${sz} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0`}
      style={{ backgroundColor: platform.color }}
    >
      {platform.label.slice(0, 2).toUpperCase()}
    </div>
  );
}

// ── Sparkline ─────────────────────────────────────────────────────────────
function Sparkline({ data, labels, color }: { data: number[]; labels: string[]; color: string }) {
  const chartData = data.map((v, i) => ({ m: fmtBucket(labels[i] ?? ''), v }));
  return (
    <ResponsiveContainer width="100%" height={48}>
      <LineChart data={chartData} margin={{ top: 2, right: 2, left: 0, bottom: 0 }}>
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Platform card ─────────────────────────────────────────────────────────
function PlatformCard({ p, rank, totalSessions, trendKeys }: { p: PlatformStats; rank: number; totalSessions: number; trendKeys: string[] }) {
  const [open, setOpen] = useState(false);
  const share = totalSessions > 0 ? (p.sessions / totalSessions * 100) : 0;

  return (
    <Card className="overflow-hidden">
      <div
        className="h-1 w-full"
        style={{ background: `linear-gradient(90deg, ${p.color} ${share}%, transparent ${share}%)` }}
      />
      <CardHeader className="pb-2 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <PlatformBadge platform={p} />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{p.label}</span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">#{rank}</Badge>
                <span className="text-xs text-muted-foreground">{share.toFixed(1)}% of social traffic</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {fmt(p.sessions)} sessions · {fmt(p.uniqueUsers)} visitors
              </p>
              <YoY current={p.sessions} previous={p.previousSessions} />
            </div>
          </div>
          <button
            onClick={() => setOpen(v => !v)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Expand"
          >
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </CardHeader>

      <CardContent className="pb-3">
        {/* Quick metrics row */}
        <div className="grid grid-cols-3 gap-3 text-center mb-3">
          <div>
            <p className="text-lg font-bold">{fmt(p.pageViews)}</p>
            <p className="text-[11px] text-muted-foreground">Page views</p>
          </div>
          <div>
            <p className="text-lg font-bold">{fmtDur(p.avgDuration)}</p>
            <p className="text-[11px] text-muted-foreground">Avg. time</p>
          </div>
          <div>
            <p className={`text-lg font-bold ${p.bounceRate > 70 ? 'text-red-500' : p.bounceRate < 40 ? 'text-emerald-600' : ''}`}>
              {p.bounceRate.toFixed(0)}%
            </p>
            <p className="text-[11px] text-muted-foreground">Bounced</p>
          </div>
        </div>

        {/* Trend sparkline */}
        <Sparkline data={p.trend} labels={trendKeys} color={p.color} />

        {/* Expandable detail */}
        {open && (
          <div className="mt-3 pt-3 border-t space-y-3">
            {/* Campaigns */}
            {p.campaigns.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
                  <Tag className="h-3 w-3" /> UTM campaigns
                </p>
                <div className="space-y-1">
                  {p.campaigns.map(c => {
                    const maxC = p.campaigns[0]?.sessions ?? 1;
                    const cpct = (c.sessions / maxC) * 100;
                    return (
                      <div key={c.name} className="flex items-center gap-2 text-xs">
                        <span className="truncate flex-1 max-w-[180px]" title={c.name}>{c.name}</span>
                        <div className="flex-1 bg-muted rounded-full h-1.5 min-w-[60px]">
                          <div className="h-1.5 rounded-full" style={{ width: `${cpct}%`, backgroundColor: p.color }} />
                        </div>
                        <span className="text-muted-foreground w-10 text-right">{c.sessions}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Traffic over the selected period */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
                <BarChart3 className="h-3 w-3" /> Traffic over time
              </p>
              <ResponsiveContainer width="100%" height={100}>
                <BarChart data={p.trend.map((v, i) => ({ m: fmtBucket(trendKeys[i] ?? ''), v }))}
                  margin={{ top: 2, right: 2, left: -20, bottom: 0 }}>
                  <XAxis dataKey="m" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 9 }} width={30} />
                  <Tooltip formatter={(v: number) => [v, 'Sessions']} />
                  <Bar dataKey="v" fill={p.color} fillOpacity={0.85} radius={[2,2,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
interface SocialMediaTabProps {
  selectedSite: Site;
}

export function SocialMediaTab({ selectedSite }: SocialMediaTabProps) {
  const { filters } = useDashboardFilters();
  const { platforms, summary, trendKeys, granularity, loading, error, refetch } =
    useSocialMedia(selectedSite.id, { from: filters.from, to: filters.to });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertCircle className="h-8 w-8 mx-auto mb-3 opacity-40" />
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button onClick={refetch} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Cross-platform comparison chart data
  const compareData = platforms.map(p => ({
    name: p.label,
    Sessions: p.sessions,
    Visitors: p.uniqueUsers,
    fill: p.color,
  }));

  // Stacked trend data, one row per day or month of the selected range
  const stackedTrend = trendKeys.map((key, i) => {
    const row: Record<string, unknown> = { bucket: fmtBucket(key) };
    platforms.forEach(p => { row[p.label] = p.trend[i]; });
    return row;
  });

  const hasPlatformData = platforms.length > 0;

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-pink-500/10 to-transparent px-6 py-5 rounded-lg border">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Share2 className="h-6 w-6 text-pink-600" />
            Social Media Analytics
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            UTM-based tracking · Referral traffic · {selectedSite.site_name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refetch}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Social sessions', value: fmt(summary.totalSessions), icon: MousePointer, color: 'pink',
            yoy: { current: summary.totalSessions, previous: summary.previousSessions } },
          { label: 'Unique visitors', value: fmt(summary.totalUniqueUsers), icon: Users, color: 'purple',
            yoy: { current: summary.totalUniqueUsers, previous: summary.previousUniqueUsers } },
          { label: 'Active platforms', value: String(platforms.length), icon: Share2, color: 'blue' },
          {
            label: 'Top channel',
            value: platforms[0]?.label ?? '—',
            icon: TrendingUp,
            color: 'emerald'
          },
        ].map(({ label, value, icon: Icon, color, yoy }) => (
          <Card key={label} className={`border-l-4 border-l-${color}-400`}>
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                <Icon className="h-3.5 w-3.5" />{label}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-2xl font-bold">{value}</div>
              {yoy && <YoY current={yoy.current} previous={yoy.previous} />}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── No data state ── */}
      {!hasPlatformData && (
        <Card>
          <CardContent className="py-14 text-center">
            <Share2 className="h-10 w-10 mx-auto mb-4 opacity-30" />
            <h3 className="font-semibold mb-1">No social traffic in the selected period</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
              Social traffic is identified via referrer (the visitor's previous page) or UTM parameters. Make sure to tag your social links with UTM tags for best tracking results.
            </p>
            <div className="inline-block text-left bg-muted/60 rounded-lg p-4 text-xs font-mono">
              ?utm_source=facebook&utm_medium=social&utm_campaign=kampanjnamn
            </div>
          </CardContent>
        </Card>
      )}

      {hasPlatformData && (
        <>
          {/* ── Cross-platform comparison ── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                Platform comparison — sessions & visitors
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={compareData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={v => fmt(Number(v))} tick={{ fontSize: 11 }} width={40} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Sessions" fill="#ec4899" fillOpacity={0.85} radius={[3,3,0,0]} />
                  <Bar dataKey="Visitors"  fill="#8b5cf6" fillOpacity={0.7}  radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* ── Stacked trend ── */}
          {platforms.length > 1 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  {granularity === 'day' ? 'Daily' : 'Monthly'} traffic by platform — {filters.from} to {filters.to}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={stackedTrend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={v => fmt(Number(v))} tick={{ fontSize: 11 }} width={40} />
                    <Tooltip formatter={(v: number) => fmt(v)} />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                    {platforms.map(p => (
                      <Bar key={p.platformKey} dataKey={p.label} stackId="a"
                        fill={p.color} fillOpacity={0.85} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* ── Per-platform cards ── */}
          <div>
            <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
              <Share2 className="h-4 w-4 text-muted-foreground" />
              Per platform
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {platforms.map((p, i) => (
                <PlatformCard key={p.platformKey} p={p} rank={i + 1} totalSessions={summary.totalSessions} trendKeys={trendKeys} />
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Dark social note ── */}
      <Card className="border-amber-200/60 dark:border-amber-700/40 bg-amber-50/30 dark:bg-amber-950/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-amber-800 dark:text-amber-300">
            <Lightbulb className="h-4 w-4" />
            About "dark social" and measurement limitations
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-amber-900/80 dark:text-amber-300/80 space-y-2">
          <p>
            <strong>Dark social</strong> — shares via direct messages (WhatsApp, Messenger, SMS) and email
            typically show as <em>direct traffic</em> and are not captured here. Social may actually be driving more traffic than shown.
          </p>
          <p>
            <strong>Tag your links</strong> with UTM parameters for all published posts to maximize
            tracking accuracy. Example:
          </p>
          <code className="block bg-amber-100 rounded px-2 py-1 font-mono">
            ?utm_source=instagram&utm_medium=social&utm_campaign=product-launch-2025
          </code>
          <p className="flex items-start gap-1">
            <span className="mt-0.5">Phase 2 (roadmap):</span>
            <span>Meta Business Suite API integration for reach, impressions, and engagement rate directly from the platform — regardless of whether the visitor clicks through to your site.</span>
          </p>
        </CardContent>
      </Card>

      {/* ── Roadmap teaser ── */}
      <Card className="border-dashed border-2 border-muted-foreground/20 bg-transparent">
        <CardContent className="py-5 px-6">
          <div className="flex items-center gap-3">
            <ExternalLink className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            <div>
              <p className="text-sm font-medium">Roadmap: Phase 2 & 3 — Native platform integrations</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                <strong>Phase 2:</strong> Meta Business Suite (Facebook + Instagram) — reach, impressions, engagement rate, follower growth.&ensp;
                <strong>Phase 3:</strong> LinkedIn Marketing API + TikTok for Business API.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}

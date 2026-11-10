import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useDashboardFilters } from '@/contexts/DashboardFiltersContext';
import { percentChange } from '@/lib/dashboard/filters';
import {
  MousePointer, TrendingUp, AlertCircle, RefreshCw, ExternalLink, Loader2, Share2,
  Tag, Lightbulb, Target, FileText, Megaphone, ShieldCheck, Sparkles,
} from 'lucide-react';
import type { Site } from '@/types/dashboard';
import { useSocialMedia, type NetworkStats, type SocialOverview } from '@/hooks/useSocialMedia';
import { socialNetworkMeta } from '@/lib/socialNetworks';
import { useAcquisitionReadiness } from '@/hooks/useAcquisitionReadiness';
import { SetupChecklist } from '../setup/SetupChecklist';
import { socialSourceStep, trackingStep } from '../setup/acquisitionSteps';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

// ── Helpers ────────────────────────────────────────────────────────────────
function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toFixed(0);
}
const pct = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toFixed(0)}%` : '—');

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'YYYY-MM-DD' → 'Sep 3', 'YYYY-MM' → 'Sep 26'. */
function fmtBucket(key: string): string {
  const month = MONTH_SHORT[Number(key.slice(5, 7)) - 1] ?? key;
  return key.length > 7 ? `${month} ${Number(key.slice(8, 10))}` : `${month} ${key.slice(2, 4)}`;
}

/** Year-over-year change; says so when last year had no traffic. */
function YoY({ current, previous }: { current: number; previous: number }) {
  const p = percentChange(current, previous);
  if (p === null) return <span className="text-[11px] text-muted-foreground">No data same period last year</span>;
  return (
    <span className={`text-[11px] font-medium ${p >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
      {p > 0 ? '+' : ''}{p}% vs same period last year
    </span>
  );
}

function NetworkDot({ color }: { color: string }) {
  return <span className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />;
}

const UTM_EXAMPLE = '?utm_source=instagram&utm_medium=social&utm_campaign=product-launch';

function UtmHint() {
  return (
    <div className="text-xs text-muted-foreground space-y-1.5">
      <p>Tag every link you post with UTM parameters. In-app browsers (Instagram, TikTok, Facebook) often send no referrer, so the tag is the only way to see where the visit came from.</p>
      <code className="block bg-muted rounded px-2 py-1 font-mono break-all">{UTM_EXAMPLE}</code>
      <p>Use <code>utm_medium=paid-social</code> on ad links so they are counted as paid.</p>
    </div>
  );
}

// ── Sections ──────────────────────────────────────────────────────────────
function NetworkTable({ networks, total }: { networks: NetworkStats[]; total: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Share2 className="h-4 w-4 text-muted-foreground" /> Networks
        </CardTitle>
        <CardDescription>
          Classified by referring site and utm_source. Engaged visit: at least 10 seconds, 2 page views or a conversion.
          Key pages: contact, cart, checkout and order confirmation.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground border-b">
              <th className="text-left font-medium py-2 pr-3">Network</th>
              <th className="text-right font-medium py-2 px-2">Visits</th>
              <th className="text-right font-medium py-2 px-2">Share</th>
              <th className="text-right font-medium py-2 px-2">Page views</th>
              <th className="text-right font-medium py-2 px-2">Pages / visit</th>
              <th className="text-right font-medium py-2 px-2">Engaged</th>
              <th className="text-right font-medium py-2 px-2">Conversions</th>
              <th className="text-right font-medium py-2 px-2">Key-page visits</th>
              <th className="text-right font-medium py-2 pl-2">vs last year</th>
            </tr>
          </thead>
          <tbody>
            {networks.map((n) => (
              <tr key={n.key} className="border-b last:border-0">
                <td className="py-2 pr-3"><span className="flex items-center gap-2"><NetworkDot color={n.color} />{n.label}</span></td>
                <td className="text-right py-2 px-2 font-medium">{fmt(n.sessions)}</td>
                <td className="text-right py-2 px-2 text-muted-foreground">{pct(n.sessions, total)}</td>
                <td className="text-right py-2 px-2">{fmt(n.pageViews)}</td>
                <td className="text-right py-2 px-2">{n.pagesPerVisit.toFixed(1)}</td>
                <td className="text-right py-2 px-2">{fmt(n.engaged)} <span className="text-muted-foreground text-xs">({n.engagementRate.toFixed(0)}%)</span></td>
                <td className="text-right py-2 px-2">{fmt(n.conversions)}</td>
                <td className="text-right py-2 px-2">{fmt(n.keyPageVisits)}</td>
                <td className="text-right py-2 pl-2"><YoY current={n.sessions} previous={n.previousSessions} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function TrendChart({ data, from, to }: { data: SocialOverview; from: string; to: string }) {
  const rows = data.trendKeys.map((key, i) => {
    const row: Record<string, unknown> = { bucket: fmtBucket(key) };
    data.networks.forEach((n) => { row[n.label] = n.trend[i]; });
    return row;
  });
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          {data.granularity === 'day' ? 'Daily' : 'Monthly'} social visits by network, {from} to {to}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={(v) => fmt(Number(v))} tick={{ fontSize: 11 }} width={40} allowDecimals={false} />
            <Tooltip formatter={(v: number) => fmt(v)} />
            <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
            {data.networks.map((n) => (
              <Bar key={n.key} dataKey={n.label} stackId="a" fill={n.color} fillOpacity={0.85} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function PaidOrganic({ data }: { data: SocialOverview }) {
  const { totals, networks } = data;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-muted-foreground" /> Paid vs organic
        </CardTitle>
        <CardDescription>
          Paid = a paid utm_medium (cpc, paid-social, display ...) or a Meta, TikTok or LinkedIn click ID (fbclid, ttclid, li_fat_id).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div><p className="text-xl font-bold">{fmt(totals.paid)}</p><p className="text-[11px] text-muted-foreground">Paid visits</p></div>
          <div><p className="text-xl font-bold">{fmt(totals.organic)}</p><p className="text-[11px] text-muted-foreground">Organic visits</p></div>
          <div><p className="text-xl font-bold">{fmt(totals.clickIds)}</p><p className="text-[11px] text-muted-foreground">With a click ID</p></div>
        </div>
        <div className="space-y-1.5">
          {networks.filter((n) => n.sessions > 0).map((n) => {
            const paidShare = n.sessions ? (n.paidSessions / n.sessions) * 100 : 0;
            return (
              <div key={n.key} className="flex items-center gap-2 text-xs">
                <span className="w-24 truncate flex items-center gap-1.5"><NetworkDot color={n.color} />{n.label}</span>
                <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden flex">
                  <div className="h-2" style={{ width: `${paidShare}%`, backgroundColor: n.color }} />
                </div>
                <span className="w-28 text-right text-muted-foreground">{fmt(n.paidSessions)} paid / {fmt(n.sessions - n.paidSessions)} organic</span>
              </div>
            );
          })}
        </div>
        <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <p>
            Click IDs are only stored when the visitor gave marketing consent, so paid traffic without consent and without a
            paid utm_medium shows as organic. Facebook also adds fbclid to ordinary (unpaid) outbound links, so the Facebook
            paid count is an upper bound. A paid utm_medium on your ad links is the reliable signal.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function LandingPages({ data }: { data: SocialOverview }) {
  const byNet = data.networks
    .map((n) => ({ n, pages: data.landingPages.filter((l) => l.network === n.key) }))
    .filter((x) => x.pages.length > 0);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" /> Top landing pages per network
        </CardTitle>
        <CardDescription>The first page of each social visit, query string removed.</CardDescription>
      </CardHeader>
      <CardContent>
        {byNet.length === 0 ? (
          <p className="text-sm text-muted-foreground">No page views recorded for these visits.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {byNet.map(({ n, pages }) => (
              <div key={n.key}>
                <p className="text-xs font-semibold mb-1.5 flex items-center gap-1.5"><NetworkDot color={n.color} />{n.label}</p>
                <div className="space-y-1">
                  {pages.map((p) => (
                    <div key={p.path} className="flex items-center gap-2 text-xs">
                      <span className="truncate flex-1 font-mono" title={p.path}>{p.path}</span>
                      <span className="text-muted-foreground w-12 text-right">{fmt(p.sessions)}</span>
                      <span className="text-muted-foreground w-20 text-right">{pct(p.engaged, p.sessions)} engaged</span>
                      <span className="text-muted-foreground w-14 text-right">{fmt(p.conversions)} conv.</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Campaigns({ data }: { data: SocialOverview }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Tag className="h-4 w-4 text-muted-foreground" /> UTM campaigns
        </CardTitle>
        <CardDescription>Social visits with a utm_campaign or a social utm_medium (social, paid-social, cpc ...).</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {data.campaigns.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">No tagged social campaigns in this period.</p>
            <UtmHint />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b">
                <th className="text-left font-medium py-2 pr-3">Campaign</th>
                <th className="text-left font-medium py-2 px-2">Network</th>
                <th className="text-left font-medium py-2 px-2">Source / medium</th>
                <th className="text-right font-medium py-2 px-2">Visits</th>
                <th className="text-right font-medium py-2 px-2">Engaged</th>
                <th className="text-right font-medium py-2 pl-2">Conversions</th>
              </tr>
            </thead>
            <tbody>
              {data.campaigns.map((c, i) => {
                const meta = socialNetworkMeta(c.network);
                return (
                  <tr key={`${c.network}|${c.utm_source}|${c.utm_medium}|${c.utm_campaign}|${i}`} className="border-b last:border-0">
                    <td className="py-2 pr-3">
                      <span className="font-medium">{c.utm_campaign ?? '(no campaign)'}</span>
                      {c.paid && <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0">Paid</Badge>}
                    </td>
                    <td className="py-2 px-2"><span className="flex items-center gap-1.5"><NetworkDot color={meta.color} />{meta.label}</span></td>
                    <td className="py-2 px-2 text-muted-foreground">{c.utm_source ?? '(none)'} / {c.utm_medium ?? '(none)'}</td>
                    <td className="text-right py-2 px-2">{fmt(c.sessions)}</td>
                    <td className="text-right py-2 px-2">{pct(c.engaged, c.sessions)}</td>
                    <td className="text-right py-2 pl-2">{fmt(c.conversions)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function AggregateCounts({ data }: { data: SocialOverview }) {
  const rows = data.aggregate.networks;
  return (
    <Card className="border-dashed">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-muted-foreground" /> Aggregate (consent-free) counts
          <Badge variant="outline" className="text-[10px]">Aggregate</Badge>
        </CardTitle>
        <CardDescription>
          From aggregate measurement, which is designed to not require consent: daily totals without cookies or visitor IDs,
          so they also include visits that the consent-based numbers above miss. Not comparable one-to-one with the visits above, and not affected by the URL or segment filter.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No social visits in the aggregate counts for this period.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b">
                <th className="text-left font-medium py-2 pr-3">Network</th>
                <th className="text-right font-medium py-2 px-2">Visits</th>
                <th className="text-right font-medium py-2 px-2">Daily visitors (sum)</th>
                <th className="text-right font-medium py-2 px-2">Engaged visits</th>
                <th className="text-right font-medium py-2 pl-2">Goal conversions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const meta = socialNetworkMeta(r.network);
                return (
                  <tr key={r.network} className="border-b last:border-0">
                    <td className="py-2 pr-3"><span className="flex items-center gap-2"><NetworkDot color={meta.color} />{meta.label}</span></td>
                    <td className="text-right py-2 px-2">{fmt(Number(r.visits))}</td>
                    <td className="text-right py-2 px-2">{fmt(Number(r.visitors))}</td>
                    <td className="text-right py-2 px-2">{fmt(Number(r.engaged_visits))} <span className="text-xs text-muted-foreground">({pct(Number(r.engaged_visits), Number(r.visits))})</span></td>
                    <td className="text-right py-2 pl-2">{fmt(Number(r.conversions))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
interface SocialMediaTabProps {
  selectedSite: Site;
  onNavigate?: (tab: string) => void;
}

export function SocialMediaTab({ selectedSite, onNavigate }: SocialMediaTabProps) {
  const { filters } = useDashboardFilters();
  const { data, loading, error, refetch } = useSocialMedia(selectedSite.id, { from: filters.from, to: filters.to });
  const { data: readiness } = useAcquisitionReadiness(selectedSite.id);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertCircle className="h-8 w-8 mx-auto mb-3 opacity-40" />
          <p className="text-muted-foreground mb-4">{error ?? 'Could not fetch social media data'}</p>
          <Button onClick={() => refetch()} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { totals, networks } = data;
  const hasData = networks.length > 0;
  const hasAggregate = data.aggregate.enabled;

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
            Referrer and UTM based · {filters.from} to {filters.to} · {selectedSite.site_name}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} aria-label="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Social visits', value: fmt(totals.sessions), icon: MousePointer,
            sub: <YoY current={totals.sessions} previous={totals.previousSessions} /> },
          { label: 'Share of all visits', value: pct(totals.sessions, totals.allSessions), icon: Share2,
            sub: <span className="text-[11px] text-muted-foreground">{fmt(totals.allSessions)} visits in total</span> },
          { label: 'Engaged visits', value: fmt(totals.engaged), icon: TrendingUp,
            sub: <span className="text-[11px] text-muted-foreground">{pct(totals.engaged, totals.sessions)} engagement rate</span> },
          { label: 'Conversions', value: fmt(totals.conversions), icon: Target,
            sub: <span className="text-[11px] text-muted-foreground">{fmt(totals.keyPageVisits)} key-page visits</span> },
        ].map(({ label, value, icon: Icon, sub }) => (
          <Card key={label}>
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                <Icon className="h-3.5 w-3.5" />{label}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-2xl font-bold">{value}</div>
              {sub}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── No data state ── */}
      {!hasData && (
        <Card>
          <CardContent className="py-10">
            <div className="text-center mb-5">
              <Share2 className="h-10 w-10 mx-auto mb-4 opacity-30" />
              <h3 className="font-semibold mb-1">No social traffic in the selected period</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Social visits are recognised by the referring site (facebook.com, linkedin.com, t.co ...) or by the utm_source
                tag on the link. Visits from in-app browsers usually arrive without a referrer and only show up when the link is tagged.
              </p>
            </div>
            <div className="max-w-xl mx-auto"><UtmHint /></div>
          </CardContent>
        </Card>
      )}
      {!hasData && readiness && (
        <SetupChecklist
          title="How to get social media data"
          steps={[trackingStep(readiness), socialSourceStep(readiness)]}
          onNavigate={onNavigate}
        />
      )}

      {hasData && (
        <>
          <NetworkTable networks={networks} total={totals.sessions} />
          <TrendChart data={data} from={filters.from} to={filters.to} />
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <PaidOrganic data={data} />
            <LandingPages data={data} />
          </div>
          <Campaigns data={data} />
          {totals.tagged < totals.sessions && (
            <Card>
              <CardContent className="py-4">
                <p className="text-sm font-medium mb-2">
                  {fmt(totals.sessions - totals.tagged)} of {fmt(totals.sessions)} social visits had no UTM tags
                </p>
                <UtmHint />
              </CardContent>
            </Card>
          )}
        </>
      )}

      {hasAggregate && <AggregateCounts data={data} />}

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
            <strong>Dark social</strong>: shares via direct messages (WhatsApp, Messenger, SMS) and email usually show as
            direct traffic and are not counted here. Social may drive more traffic than shown.
          </p>
          <p>
            Visits without analytics consent are only included in the aggregate counts
            {hasAggregate ? ' above' : ', which are off for this site (Settings → GDPR → Tracking mode)'}.
          </p>
        </CardContent>
      </Card>

      {/* ── Roadmap teaser ── */}
      <Card className="border-dashed border-2 border-muted-foreground/20 bg-transparent">
        <CardContent className="py-5 px-6">
          <div className="flex items-center gap-3">
            <ExternalLink className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            <div>
              <p className="text-sm font-medium">Roadmap: native platform integrations</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Meta Business Suite (Facebook + Instagram), LinkedIn Marketing API and TikTok for Business: reach,
                impressions and follower growth, also for posts nobody clicked.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

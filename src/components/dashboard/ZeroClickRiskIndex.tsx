import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, TrendingUp, TrendingDown, Minus, Bot, Info, ExternalLink } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, Tooltip } from "recharts";
import { useZeroClickRisk, type ZeroClickRiskPage } from "@/hooks/useZeroClickRisk";
import { useGSCData } from "@/hooks/useGSCData";
import { useDashboardFilters } from "@/contexts/DashboardFiltersContext";

interface ZeroClickRiskIndexProps {
  siteId: string;
}

const RISK_CONFIG = {
  critical: { label: 'Critical', className: 'bg-red-500/10 text-red-500 border-red-500/20' },
  high:     { label: 'High',     className: 'bg-orange-500/10 text-orange-500 border-orange-500/20' },
  medium:   { label: 'Medium',   className: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20' },
  low:      { label: 'Low',      className: 'bg-green-500/10 text-green-500 border-green-500/20' },
};

function TrendIcon({ trend }: { trend: ZeroClickRiskPage['trend'] }) {
  if (trend === 'rising')  return <TrendingUp  className="h-4 w-4 text-red-500" />;
  if (trend === 'falling') return <TrendingDown className="h-4 w-4 text-green-500" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}

function Sparkline({ data }: { data: { week: string; visits: number }[] }) {
  if (data.length < 2) return null;
  return (
    <ResponsiveContainer width={80} height={32}>
      <LineChart data={data} margin={{ top: 4, right: 0, bottom: 4, left: 0 }}>
        <Line type="monotone" dataKey="visits" stroke="hsl(var(--primary))" strokeWidth={1.5} dot={false} />
        <Tooltip
          contentStyle={{ fontSize: 11, padding: '2px 6px' }}
          formatter={(v: number) => [v, 'visits']}
          labelFormatter={(l: string) => l}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function truncateUrl(url: string, max = 55): string {
  try {
    const path = new URL(url).pathname;
    return path.length > max ? path.slice(0, max) + '…' : path || '/';
  } catch {
    return url.length > max ? url.slice(0, max) + '…' : url;
  }
}

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 75 ? 'bg-red-500' :
    score >= 50 ? 'bg-orange-500' :
    score >= 25 ? 'bg-yellow-500' : 'bg-green-500';

  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs tabular-nums w-7 text-right">{score}</span>
    </div>
  );
}

export function ZeroClickRiskIndex({ siteId }: ZeroClickRiskIndexProps) {
  const { filters } = useDashboardFilters();
  const { data, isLoading, error } = useZeroClickRisk(siteId, { from: filters.from, to: filters.to });
  const { isConnected: gscConnected } = useGSCData(siteId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Could not load risk data. Verify that the tracking script is installed.</AlertDescription>
      </Alert>
    );
  }

  const { pages, summary } = data;
  const isEmpty = pages.length === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold">Zero-Click Risk Index</h2>
        <p className="text-muted-foreground mt-1">
          Pages where AI crawlers are ingesting your content — and may be answering queries without sending you the click.
        </p>
      </div>

      {/* Methodology note */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          <span className="font-medium">How this works: </span>
          Risk score is weighted by crawler intent — training crawlers score 3×, citation crawlers 2×, general crawlers 1×.
          A rising trend means AI exposure is accelerating.{" "}
          {gscConnected
            ? <span className="text-green-600 font-medium">GSC connected — CTR correlation active.</span>
            : <span className="text-muted-foreground">Connect Google Search Console under Settings → Integrations to enable CTR correlation.</span>
          }
        </AlertDescription>
      </Alert>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Critical pages</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{summary.criticalPages}</div>
            <p className="text-xs text-muted-foreground mt-1">Risk score ≥ 75</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">High risk pages</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.highRiskPages}</div>
            <p className="text-xs text-muted-foreground mt-1">Risk score ≥ 50</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Total crawler visits</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalCrawlerVisits.toLocaleString('sv-SE')}</div>
            <p className="text-xs text-muted-foreground mt-1">{filters.from} to {filters.to}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Overall trend</CardTitle>
            <TrendIcon trend={summary.overallTrend} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold capitalize">{summary.overallTrend}</div>
            <p className="text-xs text-muted-foreground mt-1">Top bot: {summary.mostActiveBot}</p>
          </CardContent>
        </Card>
      </div>

      {/* Page risk table */}
      <Card>
        <CardHeader>
          <CardTitle>Pages at risk</CardTitle>
        </CardHeader>
        <CardContent>
          {isEmpty ? (
            <div className="text-center py-12">
              <Bot className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No AI crawler activity in the selected period.</p>
              <p className="text-xs text-muted-foreground mt-2">
                Go to <span className="font-medium">Settings → Setup</span> to install the tracking script.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 pr-4 font-medium">Page</th>
                    <th className="text-left py-2 pr-4 font-medium">Risk</th>
                    <th className="text-left py-2 pr-4 font-medium w-28">Score</th>
                    <th className="text-right py-2 pr-4 font-medium">Training</th>
                    <th className="text-right py-2 pr-4 font-medium">Citation</th>
                    <th className="text-right py-2 pr-4 font-medium">Total</th>
                    <th className="text-left py-2 pr-4 font-medium">Trend</th>
                    <th className="text-left py-2 font-medium">Weekly</th>
                  </tr>
                </thead>
                <tbody>
                  {pages.map((page, i) => {
                    const cfg = RISK_CONFIG[page.riskLevel];
                    return (
                      <tr key={i} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="py-3 pr-4 max-w-[220px]">
                          <span className="font-mono text-xs" title={page.url}>
                            {truncateUrl(page.url)}
                          </span>
                          <div className="text-xs text-muted-foreground mt-0.5">{page.topBot}</div>
                        </td>
                        <td className="py-3 pr-4">
                          <Badge variant="outline" className={`text-xs ${cfg.className}`}>
                            {cfg.label}
                          </Badge>
                        </td>
                        <td className="py-3 pr-4">
                          <ScoreBar score={page.riskScore} />
                        </td>
                        <td className="py-3 pr-4 text-right tabular-nums">
                          {page.trainingCrawls > 0 ? (
                            <span className="text-red-500 font-medium">{page.trainingCrawls}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-right tabular-nums">
                          {page.citationCrawls > 0 ? (
                            <span className="text-orange-500">{page.citationCrawls}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-right tabular-nums font-medium">
                          {page.totalVisits}
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-1.5">
                            <TrendIcon trend={page.trend} />
                            <span className="text-xs capitalize text-muted-foreground">{page.trend}</span>
                          </div>
                        </td>
                        <td className="py-3">
                          <Sparkline data={page.weeklyTrend} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* GSC upsell — only when not yet connected */}
      {!gscConnected && (
        <Card className="border-dashed">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <ExternalLink className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold">Add CTR correlation via Google Search Console</p>
                <p className="text-sm text-muted-foreground mt-1">
                  When GSC is connected, CortIQ matches AI-crawled pages against falling click rates —
                  revealing which pages are losing traffic to AI answers, not just being crawled.
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Settings → Integrations → Google Search Console
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

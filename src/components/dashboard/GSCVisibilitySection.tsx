import React, { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, TrendingUp, TrendingDown, ExternalLink } from 'lucide-react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { useGSCData, useGSCMonthly } from '@/hooks/useGSCData';

interface GSCVisibilitySectionProps {
  siteId: string;
  onNavigateToIntegrations?: () => void;
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return n.toFixed(0);
}

const PAGE_SIZE = 25;

export function GSCVisibilitySection({ siteId, onNavigateToIntegrations }: GSCVisibilitySectionProps) {
  const { isConnected, needsProperty, brandKeywords, queries, pages, summary, loading, lastSync } = useGSCData(siteId);
  const monthly = useGSCMonthly(siteId);

  const [activeTab,      setActiveTab]      = useState<'keywords' | 'pages'>('keywords');
  const [kwPage,         setKwPage]         = useState(0);
  const [pgPage,         setPgPage]         = useState(0);
  const [kwFilter,       setKwFilter]       = useState('');
  const [pgFilter,       setPgFilter]       = useState('');

  // Monthly trend chart
  const monthlyChart = useMemo(() => {
    if (!monthly.data?.length) return [];

    const map = new Map<string, {
      branded: number; organic: number; impressions: number;
      posWeightedSum: number; posWeightTotal: number;
    }>();
    const brandTerms = brandKeywords
      ? brandKeywords.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
      : [];

    for (const row of monthly.data) {
      const month = row.period_start.slice(0, 7);
      const entry = map.get(month) ?? { branded: 0, organic: 0, impressions: 0, posWeightedSum: 0, posWeightTotal: 0 };
      const isBranded = brandTerms.length > 0 && brandTerms.some((t) => row.value.toLowerCase().includes(t));
      if (isBranded) entry.branded += row.clicks;
      else           entry.organic += row.clicks;
      entry.impressions += row.impressions;
      if (row.clicks > 0) {
        entry.posWeightedSum  += row.position * row.clicks;
        entry.posWeightTotal  += row.clicks;
      }
      map.set(month, entry);
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, d]) => ({
        name: new Date(month + '-01').toLocaleDateString('sv-SE', { month: 'short', year: '2-digit' }),
        Organic:    d.organic,
        Brand:      d.branded,
        Impressions: d.impressions,
        Position: d.posWeightTotal > 0 ? +(d.posWeightedSum / d.posWeightTotal).toFixed(1) : null,
      }));
  }, [monthly.data, brandKeywords]);

  const brandTerms       = brandKeywords
    ? brandKeywords.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
    : [];
  const brandedQueries    = queries.filter((q) => brandTerms.some((t) => q.value.toLowerCase().includes(t)));
  const nonBrandedQueries = queries.filter((q) => !brandTerms.some((t) => q.value.toLowerCase().includes(t)));
  const brandedClicks     = brandedQueries.reduce((s, q) => s + q.clicks, 0);
  const nonBrandedClicks  = nonBrandedQueries.reduce((s, q) => s + q.clicks, 0);

  // Filtered + paginated keywords
  const filteredKw      = queries.filter(q => q.value.toLowerCase().includes(kwFilter.toLowerCase()));
  const kwTotalPages    = Math.ceil(filteredKw.length / PAGE_SIZE);
  const kwSlice         = filteredKw.slice(kwPage * PAGE_SIZE, (kwPage + 1) * PAGE_SIZE);

  // Filtered + paginated pages
  const filteredPg      = pages.filter(p => p.value.toLowerCase().includes(pgFilter.toLowerCase()));
  const pgTotalPages    = Math.ceil(filteredPg.length / PAGE_SIZE);
  const pgSlice         = filteredPg.slice(pgPage * PAGE_SIZE, (pgPage + 1) * PAGE_SIZE);

  if (loading) return <div className="h-48 bg-muted rounded animate-pulse" />;

  if (!isConnected) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Search className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">
                {needsProperty ? 'Google Search Console connected: choose a property' : 'Google Search Console is not connected to this site'}
              </p>
              <p className="text-xs text-muted-foreground">
                {needsProperty
                  ? 'Your Google account is connected, but no Search Console property is chosen for this site, so nothing is synced yet.'
                  : 'Connect a Google account to see monthly search visibility here. The connection is made per site.'}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onNavigateToIntegrations}>{needsProperty ? 'Choose property' : 'Connect'}</Button>
        </CardContent>
      </Card>
    );
  }

  if (monthlyChart.length === 0) {
    return (
      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Search className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Search Console connected — no data yet</p>
              <p className="text-xs text-muted-foreground">The first sync loads up to 16 months. If nothing appears, run "Load 16 months" in Settings → Integrations → Google Search Console.</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onNavigateToIntegrations}>Settings</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">Total clicks</p>
          <p className="text-xl font-bold">{fmt(summary.totalClicks)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">Impressions</p>
          <p className="text-xl font-bold">{fmt(summary.totalImpressions)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">Avg CTR</p>
          <p className="text-xl font-bold">{(summary.avgCtr * 100).toFixed(1)}%</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">Avg position</p>
          <p className="text-xl font-bold">{summary.avgPosition.toFixed(1)}</p>
        </CardContent></Card>
      </div>

      <p className="text-xs text-muted-foreground">
        Top 200 queries across all synced months (up to 16). Google leaves out rare queries for privacy,
        so these totals are lower than the property total in Search Console. Synced automatically every day.
      </p>

      {/* Visibility curve */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">Search visibility & position trend</p>
              {lastSync && (
                <span className="text-xs text-muted-foreground">
                  (synced {new Date(lastSync).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })}{' '}
                  — <button className="underline hover:text-foreground" onClick={onNavigateToIntegrations}>update</button>)
                </span>
              )}
            </div>
            {brandTerms.length > 0 && (
              <div className="flex gap-3 text-xs text-muted-foreground">
                <span>Brand: <strong className="text-emerald-600">{fmt(brandedClicks)}</strong></span>
                <span>Organic: <strong className="text-blue-600">{fmt(nonBrandedClicks)}</strong></span>
              </div>
            )}
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={monthlyChart} margin={{ top: 4, right: 40, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis yAxisId="clicks" tickFormatter={fmt} tick={{ fontSize: 10 }} width={36} />
              <YAxis
                yAxisId="pos"
                orientation="right"
                reversed
                domain={([min, max]) => [Math.max(1, Math.floor(min - 1)), Math.ceil(max + 1)]}
                tick={{ fontSize: 10, fill: '#f59e0b' }}
                width={28}
                tickFormatter={v => `#${v}`}
              />
              <Tooltip
                formatter={(value: number, name: string) =>
                  name === 'Position' ? [`#${value}`, 'Avg. position'] : [fmt(value), name]
                }
              />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              {brandTerms.length > 0 ? (
                <>
                  <Bar yAxisId="clicks" dataKey="Organic"  stackId="a" fill="#3b82f6" fillOpacity={0.8} radius={[0,0,0,0]} />
                  <Bar yAxisId="clicks" dataKey="Brand"    stackId="a" fill="#10b981" fillOpacity={0.8} radius={[2,2,0,0]} />
                </>
              ) : (
                <Bar yAxisId="clicks" dataKey="Organic" fill="#3b82f6" fillOpacity={0.8} radius={[2,2,0,0]} name="Clicks" />
              )}
              <Line
                yAxisId="pos"
                type="monotone"
                dataKey="Position"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={{ r: 3, fill: '#f59e0b' }}
                activeDot={{ r: 5 }}
                name="Position"
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted-foreground mt-2">
            Yellow line = average search position (lower = better, i.e. higher in the chart).
          </p>
        </CardContent>
      </Card>

      {/* Tabs: Sökord | Sidor */}
      <Card>
        <CardContent className="p-4">
          {/* Tab header */}
          <div className="flex items-center gap-1 mb-4 border-b pb-2">
            <button
              onClick={() => { setActiveTab('keywords'); setKwPage(0); setKwFilter(''); }}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'keywords'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              Keywords <Badge variant="secondary" className="ml-1 text-xs">{queries.length}</Badge>
            </button>
            <button
              onClick={() => { setActiveTab('pages'); setPgPage(0); setPgFilter(''); }}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'pages'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              Pages <Badge variant="secondary" className="ml-1 text-xs">{pages.length}</Badge>
            </button>
          </div>

          {activeTab === 'keywords' && (
            <>
              <div className="flex items-center gap-2 mb-3">
                <Input
                  placeholder="Filter keywords…"
                  value={kwFilter}
                  onChange={e => { setKwFilter(e.target.value); setKwPage(0); }}
                  className="h-7 text-xs max-w-xs"
                />
                {brandTerms.length > 0 && (
                  <div className="flex gap-2 text-xs text-muted-foreground ml-auto">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                      Brand ({brandedQueries.length})
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                      Organic ({nonBrandedQueries.length})
                    </span>
                  </div>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-1.5 pr-2 font-medium w-6">#</th>
                      <th className="text-left py-1.5 pr-3 font-medium">Keyword</th>
                      <th className="text-right py-1.5 pr-3 font-medium">Clicks</th>
                      <th className="text-right py-1.5 pr-3 font-medium">Impr.</th>
                      <th className="text-right py-1.5 pr-3 font-medium">CTR</th>
                      <th className="text-right py-1.5 font-medium">Pos.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kwSlice.map((q, i) => {
                      const globalIdx = kwPage * PAGE_SIZE + i;
                      const isBranded = brandTerms.some(t => q.value.toLowerCase().includes(t));
                      return (
                        <tr key={q.value} className="border-b last:border-0 hover:bg-muted/20">
                          <td className="py-1.5 pr-2 text-muted-foreground">{globalIdx + 1}</td>
                          <td className="py-1.5 pr-3 max-w-[260px]">
                            <span className={`truncate block ${isBranded ? 'text-emerald-700 dark:text-emerald-400' : ''}`}>
                              {q.value}
                            </span>
                          </td>
                          <td className="py-1.5 pr-3 text-right tabular-nums font-medium">{fmt(q.clicks)}</td>
                          <td className="py-1.5 pr-3 text-right tabular-nums">{fmt(q.impressions)}</td>
                          <td className="py-1.5 pr-3 text-right tabular-nums">{(q.ctr * 100).toFixed(1)}%</td>
                          <td className="py-1.5 text-right tabular-nums">
                            <span className={`inline-flex items-center gap-0.5 ${q.position <= 10 ? 'text-green-600' : 'text-muted-foreground'}`}>
                              {q.position <= 10
                                ? <TrendingUp className="h-3 w-3" />
                                : <TrendingDown className="h-3 w-3" />}
                              #{q.position.toFixed(0)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {kwTotalPages > 1 && (
                <div className="flex items-center justify-between mt-3 pt-2 border-t">
                  <span className="text-xs text-muted-foreground">
                    {kwPage * PAGE_SIZE + 1}–{Math.min((kwPage + 1) * PAGE_SIZE, filteredKw.length)} of {filteredKw.length}
                  </span>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={kwPage === 0} onClick={() => setKwPage(p => p - 1)}>
                      ←
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={kwPage >= kwTotalPages - 1} onClick={() => setKwPage(p => p + 1)}>
                      →
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === 'pages' && (
            <>
              <div className="mb-3">
                <Input
                  placeholder="Filter pages…"
                  value={pgFilter}
                  onChange={e => { setPgFilter(e.target.value); setPgPage(0); }}
                  className="h-7 text-xs max-w-xs"
                />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-1.5 pr-2 font-medium w-6">#</th>
                      <th className="text-left py-1.5 pr-3 font-medium">Page</th>
                      <th className="text-right py-1.5 pr-3 font-medium">Clicks</th>
                      <th className="text-right py-1.5 pr-3 font-medium">Impr.</th>
                      <th className="text-right py-1.5 pr-3 font-medium">CTR</th>
                      <th className="text-right py-1.5 font-medium">Pos.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pgSlice.map((p, i) => {
                      const globalIdx = pgPage * PAGE_SIZE + i;
                      let path = p.value;
                      try { path = new URL(p.value).pathname || '/'; } catch {}
                      return (
                        <tr key={p.value} className="border-b last:border-0 hover:bg-muted/20">
                          <td className="py-1.5 pr-2 text-muted-foreground">{globalIdx + 1}</td>
                          <td className="py-1.5 pr-3 font-mono max-w-[280px]" title={p.value}>
                            <span className="truncate block">{path}</span>
                          </td>
                          <td className="py-1.5 pr-3 text-right tabular-nums font-medium">{fmt(p.clicks)}</td>
                          <td className="py-1.5 pr-3 text-right tabular-nums">{fmt(p.impressions)}</td>
                          <td className="py-1.5 pr-3 text-right tabular-nums">{(p.ctr * 100).toFixed(1)}%</td>
                          <td className="py-1.5 text-right tabular-nums">
                            <span className={p.position <= 10 ? 'text-green-600' : 'text-muted-foreground'}>
                              #{p.position.toFixed(0)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {pgTotalPages > 1 && (
                <div className="flex items-center justify-between mt-3 pt-2 border-t">
                  <span className="text-xs text-muted-foreground">
                    {pgPage * PAGE_SIZE + 1}–{Math.min((pgPage + 1) * PAGE_SIZE, filteredPg.length)} of {filteredPg.length}
                  </span>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={pgPage === 0} onClick={() => setPgPage(p => p - 1)}>
                      ←
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={pgPage >= pgTotalPages - 1} onClick={() => setPgPage(p => p + 1)}>
                      →
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

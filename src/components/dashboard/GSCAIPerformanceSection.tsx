import { useGSCAIData } from '@/hooks/useGSCAIData';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Sparkles, Globe, FileText, TrendingUp, Info, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDashboardFilters } from '@/contexts/DashboardFiltersContext';

interface Props {
  siteId: string;
  onNavigateToIntegrations?: () => void;
}

export function GSCAIPerformanceSection({ siteId, onNavigateToIntegrations }: Props) {
  const { filters } = useDashboardFilters();
  const { data, isLoading } = useGSCAIData(siteId, { from: filters.from, to: filters.to });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (!data?.available) {
    return (
      <Card className="border-dashed border-purple-500/30 bg-purple-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-purple-400">
            <Sparkles className="h-5 w-5" />
            Google AI Search Performance
            <Badge variant="outline" className="ml-auto text-xs border-purple-500/40 text-purple-400">
              Rolling out globally
            </Badge>
          </CardTitle>
          <CardDescription>
            Impressions from AI Overviews, AI Mode, and Discover AI — fetched automatically via your GSC connection.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">
            <Info className="h-4 w-4 mt-0.5 shrink-0 text-purple-400" />
            <div>
              Google lanserade sina Generative AI Performance Reports den 3 juni 2026.
              The rollout begins with a selection of site owners in the UK — Sweden is expected to gain access
              in H2 2026. As soon as your GSC property gets access, CortIQ fetches data automatically on the next sync.
            </div>
          </div>
          {onNavigateToIntegrations && (
            <Button
              variant="outline"
              size="sm"
              onClick={onNavigateToIntegrations}
              className="w-full sm:w-auto border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
            >
              <Settings className="h-4 w-4 mr-2" />
              Configure GSC integration
            </Button>
          )}

          {/* Preview of what will be shown */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 opacity-40 pointer-events-none select-none">
            {[
              { label: 'Total AI Impressions', icon: Sparkles },
              { label: 'Pages in AI answers', icon: FileText },
              { label: 'Countries with visibility', icon: Globe },
            ].map(({ label, icon: Icon }) => (
              <div key={label} className="rounded-lg border border-border p-4 text-center space-y-2">
                <Icon className="h-5 w-5 mx-auto text-muted-foreground" />
                <div className="text-2xl font-bold">—</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-400" />
              Total AI Impressions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data.totalImpressions.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-400" />
              Pages in AI answers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data.topPages.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Globe className="h-4 w-4 text-green-400" />
              Countries
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data.topCountries.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Trend chart */}
      {data.trend.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <TrendingUp className="h-4 w-4" />
              AI Impressions over time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data.trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v: number) => [v.toLocaleString(), 'Impressions']}
                  labelFormatter={l => `Period: ${l}`}
                />
                <Bar dataKey="impressions" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Search type breakdown + top pages side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Search type breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Per AI feature</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.bySearchType.map(({ searchType, impressions }) => {
              const pct = data.totalImpressions > 0 ? Math.round((impressions / data.totalImpressions) * 100) : 0;
              return (
                <div key={searchType}>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{searchType}</span>
                    <span className="text-muted-foreground">{impressions.toLocaleString()} ({pct}%)</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-purple-500 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Top pages */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Sidor i AI-svar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.topPages.slice(0, 8).map(({ url, impressions }, i) => (
              <div key={url} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground w-4 shrink-0">{i + 1}</span>
                <span className="truncate flex-1 text-xs" title={url}>{url}</span>
                <Badge variant="outline" className="shrink-0 text-xs">{impressions.toLocaleString()}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Countries */}
      {data.topCountries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Globe className="h-4 w-4" />
              AI visibility by country
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {data.topCountries.map(({ country, impressions }) => (
                <div key={country} className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm">
                  <span className="font-medium">{country}</span>
                  <span className="text-muted-foreground text-xs">{impressions.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, TrendingUp, TrendingDown, ExternalLink } from 'lucide-react';
import { useGSCData } from '@/hooks/useGSCData';

interface GoogleSearchConsoleWidgetProps {
  siteId: string;
  onNavigateToSetup?: () => void;
}

export function GoogleSearchConsoleWidget({ siteId, onNavigateToSetup }: GoogleSearchConsoleWidgetProps) {
  const { isConnected, needsProperty, queries, summary, loading, lastSync } = useGSCData(siteId);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4 space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-10 bg-muted rounded animate-pulse" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!isConnected) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Search className="h-4 w-4" />
            Google Search Console
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <p className="text-sm text-muted-foreground mb-3">
            {needsProperty
              ? 'Your Google account is connected, but no Search Console property is chosen for this site yet.'
              : 'Connect GSC to see which queries drive organic traffic to your site.'}
          </p>
          <Button variant="outline" size="sm" className="w-full" onClick={onNavigateToSetup}>
            {needsProperty ? 'Choose property' : 'Connect Search Console'}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (queries.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Search className="h-4 w-4" />
            Google Search Console
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <p className="text-sm text-muted-foreground mb-3">
            Connected — run a sync in Settings → Integrations to load data.
          </p>
          <Button variant="outline" size="sm" className="w-full" onClick={onNavigateToSetup}>
            Open settings
          </Button>
        </CardContent>
      </Card>
    );
  }

  const topQueries = queries.slice(0, 8);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Search className="h-4 w-4" />
            Top Search Queries
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {summary.totalClicks.toLocaleString('sv-SE')} clicks
          </Badge>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-2">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Impressions</p>
            <p className="text-sm font-semibold">{summary.totalImpressions.toLocaleString('sv-SE')}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Avg CTR</p>
            <p className="text-sm font-semibold">{(summary.avgCtr * 100).toFixed(1)}%</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Avg Position</p>
            <p className="text-sm font-semibold">{summary.avgPosition.toFixed(1)}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-1">
        {topQueries.map((q, i) => (
          <div key={i} className="flex items-center justify-between py-1.5 border-b last:border-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs text-muted-foreground w-4 flex-shrink-0">{i + 1}</span>
              <span className="text-xs truncate">{q.value}</span>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0 ml-2 text-xs text-muted-foreground">
              <span>{q.clicks} clk</span>
              <span className="flex items-center gap-0.5">
                {q.position != null && q.position <= 10 ? (
                  <TrendingUp className="h-3 w-3 text-green-500" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-orange-400" />
                )}
                {q.position != null ? q.position.toFixed(0) : '–'}
              </span>
            </div>
          </div>
        ))}
        {lastSync && (
          <p className="text-xs text-muted-foreground pt-1">
            Last sync: {new Date(lastSync).toLocaleDateString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink, FileText, Eye, Percent } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useFilterParams } from '@/hooks/useFilterParams';

interface TopPage {
  url: string;
  views: number;
  title?: string;
  percentage: number;
}

interface TopPagesDataProps {
  siteId: string;
  startDate?: string;
  endDate?: string;
}

export function TopPagesData({ siteId, startDate, endDate }: TopPagesDataProps) {
  const { p_path, p_segment } = useFilterParams();
  const today = new Date().toISOString().slice(0, 10);
  const defaultFrom = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const from = startDate ? startDate.slice(0, 10) : defaultFrom;
  const to = endDate ? endDate.slice(0, 10) : today;

  const { data, isFetching: isLoading, isError, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['top-pages', siteId, from, to, p_path, p_segment],
    enabled: !!siteId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // Counted in the database (get_top_pages), so long ranges are not cut at the API row limit.
      // The global URL and segment filters are applied there too.
      const { data, error } = await (supabase as any).rpc('get_top_pages', {
        p_site_id: siteId, p_from: from, p_to: to, p_limit: 10, p_path, p_segment,
      });
      if (error) throw error;
      const total = Number(data?.total_views ?? 0);
      const pages: TopPage[] = (data?.pages ?? []).map((p: { url: string; title: string | null; views: number }) => ({
        url: p.url,
        title: p.title ?? undefined,
        views: Number(p.views),
        percentage: total > 0 ? (Number(p.views) / total) * 100 : 0,
      }));
      return { pages, total };
    },
  });
  const topPages = data?.pages ?? [];
  const totalViews = data?.total ?? 0;
  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

  const formatUrl = (url: string) => {
    try {
      const urlObj = new URL(url);
      return urlObj.pathname + (urlObj.search ? urlObj.search.substring(0, 20) + '...' : '');
    } catch {
      return url.length > 40 ? url.substring(0, 40) + '...' : url;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Top pages
        </CardTitle>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {startDate && endDate ? `${startDate.slice(0, 10)} – ${endDate.slice(0, 10)}` : 'Last 30 days'} • Total {totalViews.toLocaleString()} views
          </p>
          {lastUpdated && (
            <Badge variant="secondary" className="text-xs">
              Updated: {lastUpdated.toLocaleTimeString()}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({length: 5}).map((_, i) => (
              <div key={i} className="h-16 bg-muted rounded animate-pulse" />
            ))}
          </div>
        ) : isError ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="mb-4">Could not load top pages</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>Try again</Button>
          </div>
        ) : topPages.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="mb-4">No page views found</p>
            <p className="text-sm">Install the tracking script to start collecting data</p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {topPages.map((page, index) => (
                <div key={page.url} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="flex-shrink-0 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-medium">
                      {index + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <a 
                          href={page.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-sm font-medium hover:text-primary transition-colors truncate"
                        >
                          {formatUrl(page.url)}
                        </a>
                        <ExternalLink className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      </div>
                      {page.title && (
                        <p className="text-xs text-muted-foreground truncate">
                          {page.title}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="flex items-center gap-2">
                      <Eye className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{page.views.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Percent className="h-3 w-3" />
                      {page.percentage.toFixed(1)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center pt-4 border-t">
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
                {isLoading ? 'Loading...' : 'Refresh data'}
              </Button>
              <div className="text-sm text-muted-foreground">
                Top {topPages.length} pages · share of all views
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
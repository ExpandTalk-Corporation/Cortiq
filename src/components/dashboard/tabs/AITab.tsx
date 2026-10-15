import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useDashboardFilters } from '@/contexts/DashboardFiltersContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Bot, Brain, Lightbulb, TrendingUp, TrendingDown, BarChart3, Users, MousePointer, DollarSign, Clock, Zap } from 'lucide-react';
import { useAITraffic } from '@/hooks/useAITraffic';
import { useAISearchTraffic } from '@/hooks/useAISearchTraffic';
import type { Site } from '@/types/dashboard';

interface AITabProps {
  selectedSite: Site;
}

export function AITab({ selectedSite }: AITabProps) {
  const { filters } = useDashboardFilters();
  const range = { from: filters.from, to: filters.to };

  // Try native AI search tracking first (cookiefree, independent)
  const nativeResult = useAISearchTraffic(selectedSite?.id, range);

  // Fallback to GA4 if native has no data (requires GA4 integration)
  const ga4Result = useAITraffic(selectedSite.id, range);
  
  // Use native data if it loaded without error; fall back to GA4 only if native also failed
  const hasNativeData = nativeResult.data && nativeResult.data.totalSessions > 0;
  const nativeLoaded = !nativeResult.isLoading && !nativeResult.error;
  const useNative = hasNativeData || nativeLoaded;

  const loading = nativeResult.isLoading || (!nativeLoaded && ga4Result.loading);
  const ga4NotConfigured = !useNative && ga4Result.error &&
    (ga4Result.error.includes('non-2xx') || ga4Result.error.includes('not found') || ga4Result.error.includes('GA4'));
  const error = useNative ? (nativeResult.error?.message || null) : (ga4NotConfigured ? null : ga4Result.error);
  
  // Normalize data structure
  const data = useNative && nativeResult.data ? {
    totalSessions: nativeResult.data.totalSessions,
    totalUsers: nativeResult.data.totalUsers,
    totalPageviews: nativeResult.data.totalPageviews,
    bounceRate: nativeResult.data.bounceRate,
    avgSessionDuration: nativeResult.data.avgSessionDuration,
    conversionRate: nativeResult.data.conversionRate,
    platforms: nativeResult.data.platforms,
    topLandingPages: nativeResult.data.topLandingPages,
    dailyTrend: nativeResult.data.dailyTrend
  } : ga4Result.data;
  
  // Calculate metrics
  const topPlatform = data?.platforms?.[0] ? {
    platform: (data.platforms[0] as any).name || (data.platforms[0] as any).platform || 'Unknown',
    sessions: data.platforms[0].sessions
  } : null;
  
  const growthTrend = 0; // Could calculate from dailyTrend if needed
  const conversionRate = (data as any)?.conversionRate || 0;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-2">
          <Bot className="h-6 w-6 text-primary animate-pulse" />
          <h2 className="text-2xl font-bold">AI Traffic Analysis</h2>
          {useNative && (
            <Badge variant="secondary" className="text-xs">Cookie-free tracking</Badge>
          )}
        </div>
        <div className="text-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p>{useNative ? 'Fetching cookie-free AI traffic data...' : 'Fetching AI traffic data from Google Analytics...'}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-2">
          <Bot className="h-6 w-6 text-destructive" />
          <h2 className="text-2xl font-bold">AI Traffic Analysis</h2>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <p className="text-destructive mb-4">{error}</p>
              <p className="text-muted-foreground text-sm">
                An unexpected error occurred. Try refreshing or check the browser console.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // GA4 not configured — show setup prompt inline instead of error state
  const showGA4Prompt = ga4NotConfigured && !useNative;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Bot className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-bold">AI Traffic Analysis</h2>
          {useNative && (
            <Badge variant="default" className="text-xs">
              🔒 Cookie-free tracking
            </Badge>
          )}
          {!useNative && (
            <Badge variant="outline" className="text-xs">
              GA4 integration
            </Badge>
          )}
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sessions</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.totalSessions || 0}</div>
            <div className="flex items-center text-xs text-muted-foreground">
              {useNative ? (
                <span>Cookiefri spårning</span>
              ) : growthTrend >= 0 ? (
                <>
                  <TrendingUp className="h-3 w-3 mr-1 text-green-500" />
                  {Math.abs(growthTrend).toFixed(1)}% from previous period
                </>
              ) : (
                <>
                  <TrendingDown className="h-3 w-3 mr-1 text-red-500" />
                  {Math.abs(growthTrend).toFixed(1)}% from previous period
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unique Users</CardTitle>
            <MousePointer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.totalUsers || 0}</div>
            <p className="text-xs text-muted-foreground">
              From AI platforms
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{conversionRate.toFixed(2)}%</div>
            <p className="text-xs text-muted-foreground">
              From AI traffic
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Top Platform</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">{topPlatform?.platform || 'No data'}</div>
            <p className="text-xs text-muted-foreground">
              {topPlatform?.sessions || 0} sessions
            </p>
          </CardContent>
        </Card>
      </div>

      {/* AI Platforms Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            AI Platforms
          </CardTitle>
          <CardDescription>
            Traffic from various AI tools and chatbots
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data?.platforms && data.platforms.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Platform</TableHead>
                  <TableHead className="text-right">Sessions</TableHead>
                  <TableHead className="text-right">Users</TableHead>
                  <TableHead className="text-right">Conversions</TableHead>
                  <TableHead className="text-right">Engagement</TableHead>
                  <TableHead className="text-right">Avg. duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.platforms.map((platform, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {(platform as any).name || (platform as any).platform}
                        {index === 0 && (
                          <Badge variant="secondary" className="text-xs">
                            Top
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{platform.sessions}</TableCell>
                    <TableCell className="text-right">{platform.users}</TableCell>
                    <TableCell className="text-right">{useNative ? 'N/A' : (platform as any).conversions || 0}</TableCell>
                    <TableCell className="text-right">
                      <Badge 
                        variant={
                          useNative 
                            ? ((platform as any).bounceRate < 40 ? "default" : (platform as any).bounceRate < 60 ? "secondary" : "outline")
                            : ((platform as any).engagementRate > 0.6 ? "default" : (platform as any).engagementRate > 0.3 ? "secondary" : "outline")
                        }
                        className="text-xs"
                      >
                        {useNative ? `${((platform as any).bounceRate).toFixed(1)}% bounce` : `${((platform as any).engagementRate * 100).toFixed(1)}%`}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {Math.round(platform.avgDuration)}s
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8">
              <Bot className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-lg font-medium mb-2">No AI traffic detected</p>
              <p className="text-muted-foreground text-sm mb-4">
                No traffic from known AI platforms found for the selected period.
              </p>
              {showGA4Prompt && (
                <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg text-left max-w-md mx-auto">
                  <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-1">Add Google Analytics for a second measurement source</p>
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    Google Analytics tracks AI referral traffic via UTM parameters. Connect it under{' '}
                    <strong>Settings → External Integrations</strong> to combine GA4 data with CortIQ's native cookie-free tracking.
                  </p>
                </div>
              )}
              <div className="text-xs text-muted-foreground">
                <p>Tracked platforms: ChatGPT, Perplexity, Claude, Gemini, Copilot, Meta AI</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top Landing Pages */}
      {data?.topLandingPages && data.topLandingPages.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Top landing pages from AI
            </CardTitle>
            <CardDescription>
              Pages AI users visit first
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Page</TableHead>
                  <TableHead className="text-right">Sessions</TableHead>
                  <TableHead className="text-right">Users</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topLandingPages.slice(0, 5).map((page, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-mono text-sm max-w-md truncate">
                      {page.page}
                    </TableCell>
                    <TableCell className="text-right">{page.sessions}</TableCell>
                    <TableCell className="text-right">{page.users}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* AI Insights */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5" />
            AI Traffic Insights
          </CardTitle>
          <CardDescription>
            Automated analysis of your AI traffic
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-muted rounded-lg">
              <h4 className="font-medium mb-2">Traffic patterns</h4>
              {data?.totalSessions && data.totalSessions > 0 ? (
                <p className="text-sm text-muted-foreground">
                  {useNative ?
                    `${topPlatform?.platform || 'ChatGPT'} is your top AI source with ${((topPlatform?.sessions || 0) / data.totalSessions * 100).toFixed(1)}% of all AI traffic. Data is tracked cookie-free and GDPR-compliant.` :
                    `${topPlatform?.platform || 'ChatGPT'} is your top AI source with ${((topPlatform?.sessions || 0) / data.totalSessions * 100).toFixed(1)}% of all AI traffic.${growthTrend > 0 ? ` AI traffic is growing by ${growthTrend.toFixed(1)}% compared to the previous period.` : ''}`
                  }
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No AI traffic detected yet. {useNative ? 'Install the tracking script to start tracking AI traffic cookie-free.' : 'AI users often find websites by asking chatbots for recommendations.'}
                </p>
              )}
            </div>
            
            <div className="p-4 bg-muted rounded-lg">
              <h4 className="font-medium mb-2">Engagement</h4>
              {data?.totalSessions && data.totalSessions > 0 ? (
                <p className="text-sm text-muted-foreground">
                  {useNative ?
                    `AI users have a ${((data as any).bounceRate || 0).toFixed(1)}% bounce rate and spend an average of ${Math.round((data as any).avgSessionDuration || 0)} seconds on the site.${(data as any).bounceRate < 50 ? ' That is good engagement!' : ''}` :
                    (data as any).summary && (data as any).summary.averageEngagementRate > 0 ?
                      `AI users have ${((data as any).summary.averageEngagementRate * 100).toFixed(1)}% engagement and spend an average of ${Math.round((data as any).summary.averageSessionDuration)} seconds on the site.${(data as any).summary.averageEngagementRate > 0.5 ? ' That is high engagement!' : ''}` :
                      'AI users are typically highly goal-oriented and seek specific information.'
                  }
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  AI users are typically highly goal-oriented and seek specific information. Optimize for quick answers to common questions.
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
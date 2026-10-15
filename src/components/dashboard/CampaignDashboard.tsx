/**
 * Campaigns tab: sessions per UTM source / medium / campaign.
 *
 * UTM tags are parsed from the landing URL onto the session by ingest_pageview (first touch).
 */

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ExportButton } from './ExportButton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrendingUp, Target } from 'lucide-react';
import { useCampaignBreakdown } from '@/hooks/useCampaignBreakdown';
import { useDashboardFilters } from '@/contexts/DashboardFiltersContext';

interface CampaignMetrics {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  sessions: number;
  pageviews: number;
  conversions: number;
  conversion_rate: number;
}

interface CampaignDashboardProps {
  siteId: string;
  domain?: string;
}

function siteOrigin(domain?: string): string {
  const host = (domain ?? '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return host ? `https://${host}` : 'https://example.com';
}

export function CampaignDashboard({ siteId, domain }: CampaignDashboardProps) {
  const { filters } = useDashboardFilters();
  const dateRange = { from: filters.from, to: filters.to };
  const { data, isLoading: loading, error } = useCampaignBreakdown(siteId);

  const campaigns = useMemo<CampaignMetrics[]>(
    () =>
      (data?.campaigns ?? []).map((c) => ({
        utm_source: c.utm_source ?? '(not set)',
        utm_medium: c.utm_medium ?? '(not set)',
        utm_campaign: c.utm_campaign ?? '(not set)',
        sessions: c.sessions,
        pageviews: c.page_views,
        conversions: c.conversions,
        conversion_rate: c.sessions > 0 ? (c.conversions / c.sessions) * 100 : 0,
      })),
    [data],
  );

  const topSources = useMemo(() => {
    const bySource = new Map<string, { source: string; sessions: number; conversions: number }>();
    for (const c of campaigns) {
      const row = bySource.get(c.utm_source) ?? { source: c.utm_source, sessions: 0, conversions: 0 };
      row.sessions += c.sessions;
      row.conversions += c.conversions;
      bySource.set(c.utm_source, row);
    }
    return [...bySource.values()].sort((a, b) => b.sessions - a.sessions).slice(0, 5);
  }, [campaigns]);

  const totalSessions = campaigns.reduce((sum, c) => sum + c.sessions, 0);
  const totalConversions = campaigns.reduce((sum, c) => sum + c.conversions, 0);
  const avgConversionRate = totalSessions > 0 ? (totalConversions / totalSessions) * 100 : 0;

  const exampleLink = `${siteOrigin(domain)}/?utm_source=newsletter&utm_medium=email&utm_campaign=october-launch`;
  const emptyState = (
    <div className="py-8 text-muted-foreground max-w-2xl mx-auto">
      <div className="text-center">
        <Target className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p className="font-medium text-foreground">
          {error ? 'Failed to load campaign data' : 'No campaign traffic in this period'}
        </p>
        {!error && data && (
          <p className="text-sm mt-1">
            0 of {data.total_sessions.toLocaleString()} sessions in this period arrived through a UTM-tagged link.
          </p>
        )}
      </div>
      {!error && (
        <div className="mt-6 text-sm space-y-3">
          <p>Campaigns are read from the UTM tags on the link a visitor arrives through. To see data here:</p>
          <ol className="list-decimal pl-5 space-y-2">
            <li>
              Add UTM parameters to the links in your ads, newsletters and social posts. At minimum{' '}
              <code>utm_source</code>, <code>utm_medium</code> and <code>utm_campaign</code>, for example:
              <code className="block mt-1 p-2 rounded bg-muted text-xs break-all">{exampleLink}</code>
            </li>
            <li>
              Make sure the CortIQ tracking script runs on the landing page (Setup tab). Visits are recorded only
              for visitors who accept analytics cookies.
            </li>
            <li>
              Tagged visits appear here shortly after they happen. Untagged traffic (search, direct, referrals) is
              in the Overview and Analytics tabs.
            </li>
          </ol>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Target className="h-4 w-4" />
              Active Campaigns
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {new Set(campaigns.filter((c) => c.utm_campaign !== '(not set)').map((c) => c.utm_campaign)).size}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Campaign Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalSessions.toLocaleString()}</div>
            {data && data.total_sessions > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {((totalSessions / data.total_sessions) * 100).toFixed(1)}% of all sessions
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg. Conversion Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{avgConversionRate.toFixed(2)}%</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="campaigns">
        <TabsList>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="sources">Traffic Sources</TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Campaign Performance</CardTitle>
                <ExportButton
                  config={{
                    reportType: 'campaigns',
                    data: campaigns,
                    siteId,
                    dateRange,
                    filename: 'campaign-performance'
                  }}
                  size="sm"
                  variant="outline"
                />
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Loading campaigns...
                </div>
              ) : campaigns.length === 0 ? (
                emptyState
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campaign</TableHead>
                      <TableHead>Source / Medium</TableHead>
                      <TableHead className="text-right">Sessions</TableHead>
                      <TableHead className="text-right">Pageviews</TableHead>
                      <TableHead className="text-right">Conversions</TableHead>
                      <TableHead className="text-right">Conv. Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaigns.map((campaign) => (
                      <TableRow key={`${campaign.utm_source}|${campaign.utm_medium}|${campaign.utm_campaign}`}>
                        <TableCell>
                          <Badge variant="outline">{campaign.utm_campaign}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div className="font-medium">{campaign.utm_source}</div>
                            <div className="text-muted-foreground">{campaign.utm_medium}</div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{campaign.sessions.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{campaign.pageviews.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-medium">{campaign.conversions}</TableCell>
                        <TableCell className="text-right">
                          <span className={campaign.conversion_rate >= 5 ? 'text-green-600' : ''}>
                            {campaign.conversion_rate.toFixed(2)}%
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sources" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Top Traffic Sources</CardTitle>
            </CardHeader>
            <CardContent>
              {topSources.length === 0 ? (
                <p className="text-center py-8 text-sm text-muted-foreground">
                  No UTM-tagged sessions in this period. See the Campaigns tab for how to tag links.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Source</TableHead>
                      <TableHead className="text-right">Sessions</TableHead>
                      <TableHead className="text-right">Conversions</TableHead>
                      <TableHead className="text-right">Conv. Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topSources.map((source) => (
                      <TableRow key={source.source}>
                        <TableCell className="font-medium">{source.source}</TableCell>
                        <TableCell className="text-right">{source.sessions.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{source.conversions}</TableCell>
                        <TableCell className="text-right">
                          {((source.conversions / source.sessions) * 100).toFixed(2)}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

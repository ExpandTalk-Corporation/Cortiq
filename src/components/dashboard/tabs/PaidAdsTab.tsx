import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  MousePointerClick, 
  Eye, 
  Target,
  BarChart3,
  AlertCircle
} from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useKPIDashboard } from '@/hooks/useKPIDashboard';
import { useDashboardFilters } from '@/contexts/DashboardFiltersContext';
import { monthColumns, percentChange } from '@/lib/dashboard/filters';

interface PaidAdsTabProps {
  selectedSite: string;
  kpiData?: any;
}

/** "+12.3% vs same period last year", or nothing when last year had no data. */
function YoYBadge({ current, previous }: { current: number; previous: number }) {
  const pct = percentChange(current, previous);
  if (pct === null) return null;
  return (
    <p className={`text-xs ${pct >= 0 ? 'text-green-600' : 'text-orange-600'}`}>
      {pct > 0 ? '+' : ''}{pct}% vs same period last year
    </p>
  );
}

export function PaidAdsTab({ selectedSite }: PaidAdsTabProps) {
  // Follows the global date range; comparison is the same period one year earlier.
  const { filters } = useDashboardFilters();
  const { data: kpiData, loading } = useKPIDashboard(selectedSite, { from: filters.from, to: filters.to });
  const monthOrder = monthColumns(filters.from, filters.to).months;

  if (!selectedSite) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Select a website to view advertising data
        </AlertDescription>
      </Alert>
    );
  }

  if (loading && !kpiData) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">Loading advertising data...</div>
    );
  }

  // Extract paid advertising data
  const paidData = kpiData?.betald_annonsering?.data || [];

  if (paidData.length === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          No advertising data available. Make sure the GA4 integration is enabled and that ads are running with UTM parameters.
        </AlertDescription>
      </Alert>
    );
  }

  // Aggregate metrics by campaign
  const campaignMetrics: Record<string, any> = {};
  const sourceMetrics: Record<string, any> = {};
  const monthlyMetrics: Record<string, any> = {};
  const previous = { adCost: 0, revenue: 0, clicks: 0, conversions: 0, sessions: 0 };

  paidData.forEach((row: any) => {
    previous.adCost += row.metrics.advertiserAdCost?.comparison || 0;
    previous.revenue += row.metrics.totalRevenue?.comparison || 0;
    previous.clicks += row.metrics.advertiserAdClicks?.comparison || 0;
    previous.conversions += row.metrics.conversions?.comparison || 0;
    previous.sessions += row.metrics.sessions?.comparison || 0;

    const campaign = row.dimensions.sessionCampaignName || 'Unknown';
    const source = row.dimensions.sessionSource || 'Unknown';
    const medium = row.dimensions.sessionMedium || 'Unknown';
    const month = row.dimensions.month || '';

    // Campaign-level aggregation
    if (!campaignMetrics[campaign]) {
      campaignMetrics[campaign] = {
        campaign,
        source,
        medium,
        sessions: 0,
        users: 0,
        conversions: 0,
        revenue: 0,
        adCost: 0,
        clicks: 0,
        impressions: 0
      };
    }

    campaignMetrics[campaign].sessions += row.metrics.sessions?.current || 0;
    campaignMetrics[campaign].users += row.metrics.activeUsers?.current || 0;
    campaignMetrics[campaign].conversions += row.metrics.conversions?.current || 0;
    campaignMetrics[campaign].revenue += row.metrics.totalRevenue?.current || 0;
    campaignMetrics[campaign].adCost += row.metrics.advertiserAdCost?.current || 0;
    campaignMetrics[campaign].clicks += row.metrics.advertiserAdClicks?.current || 0;
    campaignMetrics[campaign].impressions += row.metrics.advertiserAdImpressions?.current || 0;

    // Source-level aggregation
    const sourceKey = `${source}/${medium}`;
    if (!sourceMetrics[sourceKey]) {
      sourceMetrics[sourceKey] = {
        source: sourceKey,
        adCost: 0,
        revenue: 0,
        sessions: 0,
        conversions: 0
      };
    }

    sourceMetrics[sourceKey].adCost += row.metrics.advertiserAdCost?.current || 0;
    sourceMetrics[sourceKey].revenue += row.metrics.totalRevenue?.current || 0;
    sourceMetrics[sourceKey].sessions += row.metrics.sessions?.current || 0;
    sourceMetrics[sourceKey].conversions += row.metrics.conversions?.current || 0;

    // Monthly aggregation
    if (month && !monthlyMetrics[month]) {
      monthlyMetrics[month] = {
        month,
        adCost: 0,
        revenue: 0,
        conversions: 0,
        roas: 0
      };
    }

    if (month) {
      monthlyMetrics[month].adCost += row.metrics.advertiserAdCost?.current || 0;
      monthlyMetrics[month].revenue += row.metrics.totalRevenue?.current || 0;
      monthlyMetrics[month].conversions += row.metrics.conversions?.current || 0;
    }
  });

  // Calculate derived metrics for campaigns
  const campaigns = Object.values(campaignMetrics).map((campaign: any) => ({
    ...campaign,
    ctr: campaign.impressions > 0 ? (campaign.clicks / campaign.impressions * 100) : 0,
    cpc: campaign.clicks > 0 ? (campaign.adCost / campaign.clicks) : 0,
    cpm: campaign.impressions > 0 ? (campaign.adCost / campaign.impressions * 1000) : 0,
    conversionRate: campaign.sessions > 0 ? (campaign.conversions / campaign.sessions * 100) : 0,
    roas: campaign.adCost > 0 ? (campaign.revenue / campaign.adCost) : 0,
    cpa: campaign.conversions > 0 ? (campaign.adCost / campaign.conversions) : 0
  }))
    // Campaigns that only ran in the comparison period have nothing to show here.
    .filter((c: any) => c.sessions > 0 || c.adCost > 0 || c.clicks > 0 || c.impressions > 0)
    .sort((a, b) => b.adCost - a.adCost);

  // Calculate source metrics
  const sources = Object.values(sourceMetrics).map((source: any) => ({
    ...source,
    roas: source.adCost > 0 ? (source.revenue / source.adCost) : 0,
    conversionRate: source.sessions > 0 ? (source.conversions / source.sessions * 100) : 0
  })).sort((a, b) => b.adCost - a.adCost);

  // Calculate monthly metrics
  const monthlyData = Object.values(monthlyMetrics).map((month: any) => ({
    ...month,
    roas: month.adCost > 0 ? (month.revenue / month.adCost) : 0
  })).sort((a: any, b: any) => monthOrder.indexOf(a.month) - monthOrder.indexOf(b.month));

  // Calculate overall totals
  const totalAdCost = campaigns.reduce((sum, c) => sum + c.adCost, 0);
  const totalRevenue = campaigns.reduce((sum, c) => sum + c.revenue, 0);
  const totalClicks = campaigns.reduce((sum, c) => sum + c.clicks, 0);
  const totalImpressions = campaigns.reduce((sum, c) => sum + c.impressions, 0);
  const totalConversions = campaigns.reduce((sum, c) => sum + c.conversions, 0);
  const totalSessions = campaigns.reduce((sum, c) => sum + c.sessions, 0);

  const overallCTR = totalImpressions > 0 ? (totalClicks / totalImpressions * 100) : 0;
  const overallCPC = totalClicks > 0 ? (totalAdCost / totalClicks) : 0;
  const overallROAS = totalAdCost > 0 ? (totalRevenue / totalAdCost) : 0;
  const overallConversionRate = totalSessions > 0 ? (totalConversions / totalSessions * 100) : 0;

  const monthNames: Record<string, string> = {
    '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr',
    '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Aug',
    '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec'
  };

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid gap-6 md:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col items-center text-center gap-4">
              <DollarSign className="h-10 w-10 text-primary" />
              <div>
                <p className="text-2xl font-bold">${totalAdCost.toLocaleString('sv-SE', { maximumFractionDigits: 0 })}</p>
                <p className="text-sm text-muted-foreground">Total ad spend</p>
                <YoYBadge current={totalAdCost} previous={previous.adCost} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col items-center text-center gap-4">
              <Target className="h-10 w-10 text-primary" />
              <div>
                <p className="text-2xl font-bold">{overallConversionRate.toFixed(2)}%</p>
                <p className="text-sm text-muted-foreground">Conversion rate</p>
                <YoYBadge
                  current={overallConversionRate}
                  previous={previous.sessions > 0 ? (previous.conversions / previous.sessions * 100) : 0}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col items-center text-center gap-4">
              <MousePointerClick className="h-10 w-10 text-primary" />
              <div>
                <p className="text-2xl font-bold">{totalClicks.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">Clicks</p>
                <YoYBadge current={totalClicks} previous={previous.clicks} />
                <Badge variant="outline" className="text-xs w-fit mx-auto">
                  CTR: {overallCTR.toFixed(2)}%
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col items-center text-center gap-4">
              {overallROAS >= 1 ? (
                <TrendingUp className="h-10 w-10 text-green-600" />
              ) : (
                <TrendingDown className="h-10 w-10 text-orange-600" />
              )}
              <div>
                <p className="text-2xl font-bold">{overallROAS.toFixed(2)}x</p>
                <p className="text-sm text-muted-foreground">ROAS</p>
                <YoYBadge
                  current={overallROAS}
                  previous={previous.adCost > 0 ? previous.revenue / previous.adCost : 0}
                />
                <Badge 
                  variant={overallROAS >= 1 ? "default" : "secondary"} 
                  className="text-xs w-fit mx-auto"
                >
                  ${totalRevenue.toLocaleString('en-US', { maximumFractionDigits: 0 })} revenue
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cost Over Time Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Ad spend and ROAS over time</CardTitle>
          <CardDescription>Monthly ad spend and return on ad spend, {filters.from} to {filters.to}</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="month" 
                tickFormatter={(value) => monthNames[value] || value}
              />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip 
                labelFormatter={(value) => monthNames[value as string] || value}
                formatter={(value: any) => value.toLocaleString('sv-SE', { maximumFractionDigits: 2 })}
              />
              <Legend />
              <Line 
                yAxisId="left"
                type="monotone" 
                dataKey="adCost" 
                stroke="hsl(var(--primary))" 
                name="Ad spend ($)"
                strokeWidth={2}
              />
              <Line 
                yAxisId="right"
                type="monotone" 
                dataKey="roas" 
                stroke="hsl(var(--chart-2))" 
                name="ROAS"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Cost per Traffic Source */}
      <Card>
        <CardHeader>
          <CardTitle>Ad spend by traffic source</CardTitle>
          <CardDescription>Ad cost broken down by source and medium</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={sources}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="source" angle={-45} textAnchor="end" height={100} />
              <YAxis />
              <Tooltip formatter={(value: any) => `$${value.toLocaleString('sv-SE', { maximumFractionDigits: 2 })}`} />
              <Legend />
              <Bar dataKey="adCost" fill="hsl(var(--primary))" name="Ad spend ($)" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Campaign Performance Table */}
      <Card>
        <CardHeader>
          <CardTitle>Campaign performance</CardTitle>
          <CardDescription>Detailed metrics per campaign</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-medium">Campaign</th>
                  <th className="text-right p-3 font-medium">Source</th>
                  <th className="text-right p-3 font-medium">Cost</th>
                  <th className="text-right p-3 font-medium">Clicks</th>
                  <th className="text-right p-3 font-medium">Impressions</th>
                  <th className="text-right p-3 font-medium">CTR</th>
                  <th className="text-right p-3 font-medium">CPC</th>
                  <th className="text-right p-3 font-medium">Conv. Rate</th>
                  <th className="text-right p-3 font-medium">ROAS</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign, idx) => (
                  <tr key={idx} className="border-b hover:bg-muted/50">
                    <td className="p-3">
                      <div className="font-medium">{campaign.campaign}</div>
                      <div className="text-xs text-muted-foreground">{campaign.medium}</div>
                    </td>
                    <td className="text-right p-3 text-sm">{campaign.source}</td>
                    <td className="text-right p-3 font-medium">
                      ${campaign.adCost.toLocaleString('sv-SE', { maximumFractionDigits: 2 })}
                    </td>
                    <td className="text-right p-3">{campaign.clicks.toLocaleString()}</td>
                    <td className="text-right p-3">{campaign.impressions.toLocaleString()}</td>
                    <td className="text-right p-3">
                      <Badge variant={campaign.ctr >= 2 ? "default" : "secondary"}>
                        {campaign.ctr.toFixed(2)}%
                      </Badge>
                    </td>
                    <td className="text-right p-3">
                      ${campaign.cpc.toLocaleString('sv-SE', { maximumFractionDigits: 2 })}
                    </td>
                    <td className="text-right p-3">
                      <Badge variant={campaign.conversionRate >= 3 ? "default" : "secondary"}>
                        {campaign.conversionRate.toFixed(2)}%
                      </Badge>
                    </td>
                    <td className="text-right p-3">
                      <div className="flex items-center justify-end gap-2">
                        {campaign.roas >= 1 ? (
                          <TrendingUp className="h-4 w-4 text-green-600" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-orange-600" />
                        )}
                        <span className={campaign.roas >= 1 ? "text-green-600 font-bold" : "text-orange-600"}>
                          {campaign.roas.toFixed(2)}x
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

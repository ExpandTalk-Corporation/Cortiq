import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  TrendingUp, 
  TrendingDown, 
  MousePointerClick, 
  Target,
  BarChart3,
  AlertCircle,
  Clock,
  Users
} from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { usePaidAdsAnalytics } from '@/hooks/usePaidAdsAnalytics';
import { Skeleton } from "@/components/ui/skeleton";

interface ServerSidePaidAdsTabProps {
  selectedSite: string;
  startDate?: string;
  endDate?: string;
}

export function ServerSidePaidAdsTab({ selectedSite, startDate, endDate }: ServerSidePaidAdsTabProps) {
  const { data, loading, error } = usePaidAdsAnalytics(selectedSite, startDate, endDate);

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

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-6 md:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          {error || 'No advertising data available. Make sure the tracking script is installed and that ads are running with UTM parameters (utm_medium: cpc, ppc, or paid-social).'}
        </AlertDescription>
      </Alert>
    );
  }

  const { summary, campaigns, sources, monthly } = data;

  const monthNames: Record<string, string> = {
    '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr',
    '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Aug',
    '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec'
  };

  const COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

  return (
    <div className="space-y-6">
      {/* Info Alert */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>GDPR-compliant server-side tracking</strong> — Data collected without cookies via your own tracking infrastructure.
          Only sessions with paid UTM parameters (utm_medium: cpc, ppc, paid-social, display, paid) are shown here.
        </AlertDescription>
      </Alert>

      {/* Overview Cards */}
      <div className="grid gap-6 md:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col items-center text-center gap-4">
              <Users className="h-10 w-10 text-primary" />
              <div>
                <p className="text-2xl font-bold">{summary.totalSessions.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">Ad sessions</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col items-center text-center gap-4">
              <Target className="h-10 w-10 text-primary" />
              <div>
                <p className="text-2xl font-bold">{summary.conversionRate.toFixed(2)}%</p>
                <p className="text-sm text-muted-foreground">Conversion rate</p>
                <Badge variant="outline" className="text-xs w-fit mx-auto">
                  {summary.totalConversions} conversions
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col items-center text-center gap-4">
              <MousePointerClick className="h-10 w-10 text-primary" />
              <div>
                <p className="text-2xl font-bold">{summary.totalPageViews.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">Page views</p>
                <Badge variant="outline" className="text-xs w-fit mx-auto">
                  {(summary.totalPageViews / Math.max(summary.totalSessions, 1)).toFixed(1)} per session
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col items-center text-center gap-4">
              <Clock className="h-10 w-10 text-primary" />
              <div>
                <p className="text-2xl font-bold">{Math.round(summary.avgDuration)}s</p>
                <p className="text-sm text-muted-foreground">Avg. session duration</p>
                {summary.totalRevenue > 0 && (
                  <Badge variant="default" className="text-xs w-fit mx-auto">
                    {summary.totalRevenue.toLocaleString('en-US', { maximumFractionDigits: 0 })} revenue
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sessions Over Time */}
      <Card>
        <CardHeader>
          <CardTitle>Sessions and conversions over time</CardTitle>
          <CardDescription>Monthly breakdown of paid traffic</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="month" 
                tickFormatter={(value) => {
                  const parts = value.split('-');
                  return monthNames[parts[1]] || value;
                }}
              />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip 
                labelFormatter={(value) => {
                  const parts = value.split('-');
                  return `${monthNames[parts[1]]} ${parts[0]}`;
                }}
              />
              <Legend />
              <Line 
                yAxisId="left"
                type="monotone" 
                dataKey="sessions" 
                stroke="hsl(var(--primary))" 
                name="Sessions"
                strokeWidth={2}
              />
              <Line 
                yAxisId="right"
                type="monotone" 
                dataKey="conversions" 
                stroke="hsl(var(--chart-2))" 
                name="Conversions"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Sessions by Source */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Sessions by traffic source</CardTitle>
            <CardDescription>Distribution of paid traffic by source</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={sources}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="source" angle={-45} textAnchor="end" height={100} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="sessions" fill="hsl(var(--primary))" name="Sessions" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top campaigns</CardTitle>
            <CardDescription>Campaigns with the most sessions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {campaigns.slice(0, 5).map((campaign, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="font-medium">{campaign.campaign}</div>
                    <div className="text-xs text-muted-foreground">{campaign.source} / {campaign.medium}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{campaign.sessions}</div>
                    <Badge variant={campaign.conversionRate >= 3 ? "default" : "secondary"} className="text-xs">
                      {campaign.conversionRate.toFixed(1)}% conv
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Campaign Performance Table */}
      <Card>
        <CardHeader>
          <CardTitle>Campaign performance (server-side)</CardTitle>
          <CardDescription>Detailed metrics per campaign — tracked server-side, without cookies</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-medium">Campaign</th>
                  <th className="text-right p-3 font-medium">Source</th>
                  <th className="text-right p-3 font-medium">Sessions</th>
                  <th className="text-right p-3 font-medium">Page views</th>
                  <th className="text-right p-3 font-medium">Avg. duration</th>
                  <th className="text-right p-3 font-medium">Conv. rate</th>
                  <th className="text-right p-3 font-medium">Device</th>
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
                    <td className="text-right p-3 font-medium">{campaign.sessions.toLocaleString()}</td>
                    <td className="text-right p-3">{campaign.pageViews.toLocaleString()}</td>
                    <td className="text-right p-3">{Math.round(campaign.avgDuration)}s</td>
                    <td className="text-right p-3">
                      <Badge variant={campaign.conversionRate >= 3 ? "default" : "secondary"}>
                        {campaign.conversionRate.toFixed(2)}%
                      </Badge>
                    </td>
                    <td className="text-right p-3">
                      <div className="text-xs">
                        <div>📱 {campaign.devices.mobile}</div>
                        <div>💻 {campaign.devices.desktop}</div>
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

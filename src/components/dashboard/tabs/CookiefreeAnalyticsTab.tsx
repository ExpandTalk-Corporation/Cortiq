import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DateRangePicker } from '@/components/dashboard/DateRangePicker';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Users, 
  Eye, 
  Clock, 
  MousePointer, 
  Smartphone, 
  Globe, 
  TrendingUp, 
  Shield,
  Info,
  BarChart3,
  PieChart,
  Activity,
  Target,
  FileText
} from 'lucide-react';
import { useCookiefreeAnalytics } from '@/hooks/useCookiefreeAnalytics';
import { ServerLogImporter } from '@/components/dashboard/ServerLogImporter';
import { ServerLogAnalytics } from '@/components/dashboard/ServerLogAnalytics';
import type { Site } from '@/types/dashboard';
import { subDays } from 'date-fns';
import type { DateRange } from 'react-day-picker';

interface CookiefreeAnalyticsTabProps {
  selectedSite: Site;
  dateRange?: DateRange;
}

export function CookiefreeAnalyticsTab({ selectedSite, dateRange }: CookiefreeAnalyticsTabProps) {
  const [localRange, setLocalRange] = useState({
    from: subDays(new Date(), 30),
    to: new Date()
  });

  // Use global dateRange if provided, else local
  const activeRange = dateRange && dateRange.from && dateRange.to ? { from: dateRange.from, to: dateRange.to } : localRange;
  const today = new Date();
  const clampedRange = {
    from: new Date(Math.min(activeRange.from.getTime(), today.getTime())),
    to: new Date(Math.min(activeRange.to.getTime(), today.getTime()))
  };

  const { data: analytics, isLoading, error } = useCookiefreeAnalytics(selectedSite?.id, clampedRange);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Analyzing cookie-free data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          An error occurred while fetching cookie-free analytics: {error.message}
        </AlertDescription>
      </Alert>
    );
  }

  if (!analytics) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          No data available for the selected time period.
        </AlertDescription>
      </Alert>
    );
  }

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('sv-SE').format(num);
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Shield className="h-6 w-6 text-green-600" />
              Cookie-Free Analytics
            </h2>
            <p className="text-muted-foreground">
              GDPR-friendly statistics for all visitors — no cookie banner impact
            </p>
          </div>
          {(!dateRange) && (
            <DateRangePicker
              dateRange={localRange}
              onDateRangeChange={(range) => {
                if (range?.from && range?.to) {
                  setLocalRange({ from: range.from, to: range.to });
                }
              }}
            />
          )}
        </div>

        {/* Period Info */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>What is measured:</strong> Server-side tracking based on anonymized IP hashes and user agent fingerprints.
            No personal data is stored and no consent is required under GDPR.
            <br />
            <strong>Period:</strong> {analytics.period.days} days ({analytics.period.startDate} to {analytics.period.endDate})
          </AlertDescription>
        </Alert>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="banner">Cookie Banner</TabsTrigger>
          <TabsTrigger value="audience">Audience</TabsTrigger>
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="serverlogs">
            <FileText className="h-4 w-4 mr-1" />
            Server Logs
          </TabsTrigger>
          <TabsTrigger value="impact">GDPR Impact</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Page Views</CardTitle>
                <Eye className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(analytics.totalPageViews)}</div>
                <p className="text-xs text-muted-foreground">
                  {Math.round(analytics.totalPageViews / analytics.period.days)} per day
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Unique Visitors</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(analytics.uniqueVisitors)}</div>
                <p className="text-xs text-muted-foreground">
                  {Math.round(analytics.uniqueVisitors / analytics.period.days)} per day
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Sessions</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(analytics.totalSessions)}</div>
                <p className="text-xs text-muted-foreground">
                  {analytics.avgPagesPerSession} pages/session
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Session Duration</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatDuration(analytics.avgSessionDuration)}</div>
                <p className="text-xs text-muted-foreground">
                  {analytics.bounceRate}% bounce rate
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Traffic Sources */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Traffic sources
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(analytics.referralSources)
                  .sort(([,a], [,b]) => b - a)
                  .map(([source, count]) => {
                    const percentage = (count / analytics.totalSessions * 100);
                    return (
                      <div key={source} className="flex items-center justify-between">
                        <span className="text-sm font-medium">{source}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-24 bg-muted rounded-full h-2">
                            <div 
                              className="bg-primary h-2 rounded-full" 
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                          <span className="text-sm text-muted-foreground w-12 text-right">
                            {percentage.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Cookie Banner Tab */}
        <TabsContent value="banner" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Banner Views</CardTitle>
                <MousePointer className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(analytics.totalBannerViews)}</div>
                <p className="text-xs text-muted-foreground">
                  {((analytics.totalBannerViews / analytics.totalSessions) * 100).toFixed(1)}% of sessions
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Accept All</CardTitle>
                <Badge variant="default" className="bg-green-100 text-green-800">
                  {analytics.acceptanceRate}%
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(analytics.acceptedAll)}</div>
                <Progress value={analytics.acceptanceRate} className="mt-2" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Reject All</CardTitle>
                <Badge variant="destructive">
                  {analytics.rejectionRate}%
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(analytics.rejectedAll)}</div>
                <Progress value={analytics.rejectionRate} className="mt-2" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Custom Choices</CardTitle>
                <Badge variant="outline">
                  {analytics.selectiveRate}%
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(analytics.selectiveAccept)}</div>
                <Progress value={analytics.selectiveRate} className="mt-2" />
              </CardContent>
            </Card>
          </div>

          <Alert>
            <Target className="h-4 w-4" />
            <AlertDescription>
              <strong>Cookie Banner Insights:</strong> {analytics.acceptanceRate}% of users accept all cookies,
              while {analytics.rejectionRate}% reject. {analytics.selectiveRate}% make custom choices.
              This affects the quality of traditional analytics data.
            </AlertDescription>
          </Alert>
        </TabsContent>

        {/* Audience Tab */}
        <TabsContent value="audience" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Device Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Smartphone className="h-5 w-5" />
                  Device breakdown
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(analytics.deviceBreakdown).map(([device, count]) => {
                  const percentage = (count / analytics.totalSessions * 100);
                  return (
                    <div key={device} className="flex items-center justify-between">
                      <span className="capitalize">{device}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-muted rounded-full h-2">
                          <div 
                            className="bg-primary h-2 rounded-full" 
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <span className="text-sm w-12 text-right">{percentage.toFixed(1)}%</span>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Browser Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  Browsers
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(analytics.browserBreakdown)
                  .sort(([,a], [,b]) => b - a)
                  .slice(0, 5)
                  .map(([browser, count]) => {
                    const percentage = (count / analytics.totalSessions * 100);
                    return (
                      <div key={browser} className="flex items-center justify-between">
                        <span className="text-sm">{browser}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-muted rounded-full h-2">
                            <div 
                              className="bg-primary h-2 rounded-full" 
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                          <span className="text-sm w-12 text-right">{percentage.toFixed(1)}%</span>
                        </div>
                      </div>
                    );
                  })}
              </CardContent>
            </Card>

            {/* OS Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Operating systems</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(analytics.osBreakdown)
                  .sort(([,a], [,b]) => b - a)
                  .slice(0, 5)
                  .map(([os, count]) => {
                    const percentage = (count / analytics.totalSessions * 100);
                    return (
                      <div key={os} className="flex items-center justify-between">
                        <span className="text-sm">{os}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-muted rounded-full h-2">
                            <div 
                              className="bg-primary h-2 rounded-full" 
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                          <span className="text-sm w-12 text-right">{percentage.toFixed(1)}%</span>
                        </div>
                      </div>
                    );
                  })}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Content Tab */}
        <TabsContent value="content" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Top Pages
              </CardTitle>
              <CardDescription>
                Most visited pages based on cookie-free data
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {analytics.topPages.map((page, index) => (
                  <div key={page.url} className="flex items-center gap-4 p-3 border rounded-lg">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{page.title || page.url}</p>
                      <p className="text-sm text-muted-foreground truncate">{page.url}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{formatNumber(page.views)} views</p>
                      <p className="text-sm text-muted-foreground">
                        ⌀ {formatDuration(page.avgTime)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Server Logs Tab */}
        <TabsContent value="serverlogs" className="space-y-6">
          <Alert>
            <FileText className="h-4 w-4" />
            <AlertDescription>
              <strong>Server log files for cookie-free analytics:</strong> Import your server logs (Apache/Nginx)
              to analyze traffic without cookies. IP addresses are anonymized immediately on import.
            </AlertDescription>
          </Alert>

          {/* Server Log Importer */}
          <ServerLogImporter siteId={selectedSite.id} />

          {/* Server Log Analytics */}
          <ServerLogAnalytics 
            siteId={selectedSite.id} 
            dateRange={clampedRange}
          />
        </TabsContent>

        {/* GDPR Impact Tab */}
        <TabsContent value="impact" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Estimated Total Traffic</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(analytics.estimatedTotalSessions)}</div>
                <p className="text-xs text-muted-foreground">
                  Includes non-consented users
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Lost Data</CardTitle>
                <Badge variant="destructive">
                  {analytics.dataLossPercentage}%
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(analytics.estimatedLostData)}</div>
                <p className="text-xs text-muted-foreground">
                  Sessions without detailed tracking
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Consent Rate</CardTitle>
                <Badge variant="default" className="bg-green-100 text-green-800">
                  {analytics.consentRate}%
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analytics.consentRate}%</div>
                <Progress value={analytics.consentRate} className="mt-2" />
              </CardContent>
            </Card>
          </div>

          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription>
              <strong>GDPR impact on data:</strong> Of the estimated total traffic of {formatNumber(analytics.estimatedTotalSessions)} sessions
              we are missing detailed tracking data for {formatNumber(analytics.estimatedLostData)} sessions ({analytics.dataLossPercentage}%)
              due to GDPR rules. Cookie-free analytics still provides valuable baseline statistics for all users.
            </AlertDescription>
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle>Recommendations for Improvement</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="p-3 border rounded-lg">
                <h4 className="font-medium text-sm">Improve Cookie Banner Acceptance</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  With {analytics.acceptanceRate}% acceptance rate there is potential to increase to 70–80% through better UX and a clearer value proposition.
                </p>
              </div>
              <div className="p-3 border rounded-lg">
                <h4 className="font-medium text-sm">Supplement with Privacy-First Analytics</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Consider Plausible, Umami, or similar tools for detailed analytics without cookies.
                </p>
              </div>
              <div className="p-3 border rounded-lg">
                <h4 className="font-medium text-sm">Server-Side Tracking</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Implement server-side Google Analytics for better data coverage with GDPR compliance.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
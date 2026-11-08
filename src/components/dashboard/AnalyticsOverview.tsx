import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, Eye, Clock, TrendingUp, TrendingDown } from 'lucide-react';
import type { Analytics } from '@/types/dashboard';

interface AnalyticsOverviewProps {
  analytics: Analytics;
}

export function AnalyticsOverview({ analytics }: AnalyticsOverviewProps) {
  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  return (
    <div className="grid gap-6 md:grid-cols-4">
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col items-center text-center gap-4">
            <Users className="h-10 w-10 text-primary" />
            <div>
              <p className="text-2xl font-bold">{analytics.totalSessions.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground">Sessions</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col items-center text-center gap-4">
            <Eye className="h-10 w-10 text-primary" />
            <div>
              <p className="text-2xl font-bold">{analytics.totalPageViews.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground">Page views</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col items-center text-center gap-4">
            <Clock className="h-10 w-10 text-primary" />
            <div className="flex flex-col gap-1">
              <p className="text-xl font-bold">{formatTime(analytics.averageEngagementTime)}</p>
              <p className="text-sm text-muted-foreground">Average engagement time</p>
              <Badge variant="outline" className="text-xs w-fit mx-auto">
                GA4-standard
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col items-center text-center gap-4">
            {analytics.engagementRate >= 60 ? (
              <TrendingUp className="h-10 w-10 text-green-600" />
            ) : (
              <TrendingDown className="h-10 w-10 text-orange-600" />
            )}
            <div className="flex flex-col gap-1">
              <p className="text-2xl font-bold">{analytics.engagementRate}%</p>
              <p className="text-sm text-muted-foreground">Engagement rate</p>
              <Badge 
                variant={analytics.engagementRate >= 60 ? "default" : "secondary"} 
                className="text-xs w-fit mx-auto"
              >
                Replaces bounce rate
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Additional info card */}
      <Card className="md:col-span-4">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="text-center">
              <p className="font-medium text-muted-foreground">Session time (all)</p>
              <p className="text-lg font-semibold">{formatTime(analytics.averageSessionDuration)}</p>
            </div>
            <div className="text-center">
              <p className="font-medium text-muted-foreground">Engagement time (active)</p>
              <p className="text-lg font-semibold">{formatTime(analytics.averageEngagementTime)}</p>
            </div>
            <div className="text-center">
              <p className="font-medium text-muted-foreground">Engagement rate</p>
              <p className="text-lg font-semibold">{analytics.engagementRate}%</p>
            </div>
            <div className="text-center">
              <p className="font-medium text-muted-foreground">Time per page view</p>
              <p className="text-lg font-semibold">{formatTime(analytics.averageTimeOnSite)}</p>
            </div>
          </div>
          <div className="mt-4 p-3 bg-muted rounded-lg">
            <p className="text-xs text-muted-foreground">
              <strong>GA4 Update:</strong> We now use Engagement Rate and Average Engagement Time
              instead of Bounce Rate, in line with Google Analytics 4 standards.
              Engaged visit = visit longer than 10 s OR more than 1 page view. Unlike GA4, conversions do not count.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
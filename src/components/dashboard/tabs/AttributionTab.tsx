import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { BarChart2, TrendingDown, TrendingUp, Upload, Shield } from 'lucide-react';
import { useAttributionGap } from '@/hooks/useAttributionGap';
import { PixelReadinessCard } from '@/components/dashboard/PixelReadinessCard';
import type { Site } from '@/types/dashboard';

interface AttributionTabProps {
  selectedSite: Site;
}

function GapMeter({ gapPercent }: { gapPercent: number }) {
  const color = gapPercent > 50 ? 'text-red-500' : gapPercent > 20 ? 'text-yellow-500' : 'text-green-500';
  const Icon = gapPercent > 20 ? TrendingDown : TrendingUp;
  return (
    <div className={`flex items-center gap-2 text-4xl font-bold ${color}`}>
      <Icon className="h-8 w-8" />
      {gapPercent}%
    </div>
  );
}

export function AttributionTab({ selectedSite }: AttributionTabProps) {
  const { data, isLoading } = useAttributionGap(selectedSite.id);

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Loading attribution data...</div>;
  }

  if (!data) return <PixelReadinessCard selectedSite={selectedSite} />;

  const { cortiqConversions, hubspotMQLs, gapPercent, pendingUpload, uploaded, bySource, periodDays } = data;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Attribution Gap</h2>
        <p className="text-sm text-muted-foreground">
          Last {periodDays} days — comparing what CortIQ tracks vs. what reaches qualified pipeline
        </p>
      </div>

      <PixelReadinessCard selectedSite={selectedSite} />

      {/* Three-column comparison */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <BarChart2 className="h-4 w-4" />
              CortIQ Conversions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{cortiqConversions}</div>
            <p className="text-xs text-muted-foreground mt-1">All form submissions tracked by CortIQ</p>
          </CardContent>
        </Card>

        <Card className={gapPercent > 50 ? 'border-red-200' : gapPercent > 20 ? 'border-yellow-200' : 'border-green-200'}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Attribution Gap
            </CardTitle>
          </CardHeader>
          <CardContent>
            <GapMeter gapPercent={gapPercent} />
            <p className="text-xs text-muted-foreground mt-2">
              {gapPercent > 50
                ? 'Large gap — check tracking tag coverage and Google Ads conversion setup'
                : gapPercent > 20
                ? 'Moderate gap — some conversions missing from quality pipeline'
                : 'Healthy — attribution is well aligned'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Quality Pipeline (HubSpot MQLs)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{hubspotMQLs}</div>
            <p className="text-xs text-muted-foreground mt-1">Priority + Qualified leads received from CRM</p>
          </CardContent>
        </Card>
      </div>

      {/* Google Ads upload status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Upload className="h-4 w-4 text-blue-500" />
            Enhanced Conversions Upload
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-2xl font-bold text-blue-500">{uploaded}</div>
              <div className="text-muted-foreground">Uploaded to Google Ads</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-yellow-500">{pendingUpload}</div>
              <div className="text-muted-foreground">Pending next daily batch</div>
            </div>
          </div>
          {pendingUpload === 0 && uploaded === 0 && (
            <p className="text-xs text-muted-foreground mt-3">
              No uploads yet. Set up the HubSpot lead quality loop in Settings → Integrations to enable Enhanced Conversions.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Source breakdown */}
      {bySource.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Conversion Quality Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {bySource.map(row => (
                <div key={row.source} className="flex items-center gap-4 text-sm">
                  <div className="w-40 truncate text-muted-foreground">{row.source}</div>
                  <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${cortiqConversions > 0 ? (row.cortiq / cortiqConversions) * 100 : 0}%` }}
                    />
                  </div>
                  <div className="w-8 text-right">{row.cortiq}</div>
                  <Badge variant={row.quality > 0 ? 'default' : 'outline'} className="text-xs w-20 justify-center">
                    {row.quality} quality
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Alert>
        <Shield className="h-4 w-4" />
        <AlertDescription className="text-xs">
          All data is aggregated — no personally identifiable information is shown here. Email hashing and consent checks are enforced at the point of collection.
        </AlertDescription>
      </Alert>
    </div>
  );
}

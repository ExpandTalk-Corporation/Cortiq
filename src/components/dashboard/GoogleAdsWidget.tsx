import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  TrendingUp, TrendingDown, DollarSign, MousePointerClick, Eye, Target, RefreshCw
} from 'lucide-react';
import { useGoogleAdsData, type GoogleAdsDateRange } from '@/hooks/useGoogleAdsData';
import { GoogleAdsConnectHint } from './GoogleAdsConnectCard';

interface GoogleAdsWidgetProps {
  siteId: string;
  /** Dashboard tab navigation; lets the empty state open Settings → Integrations. */
  onNavigate?: (tab: string) => void;
}

export function GoogleAdsWidget({ siteId, onNavigate }: GoogleAdsWidgetProps) {
  const [dateRange, setDateRange] = useState<GoogleAdsDateRange>('last_30_days');
  const { campaigns, totals, isConfigured, loading, error, refetch } = useGoogleAdsData(siteId, dateRange);

  if (isConfigured === false) {
    return (
      <div className="space-y-4">
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Google Ads — Direct API
            </CardTitle>
            <CardDescription>
              Connect Google Ads directly to see campaign performance without GA4 dependency.
            </CardDescription>
          </CardHeader>
        </Card>
        <GoogleAdsConnectHint onNavigate={onNavigate}>
          Connect Google Ads under Settings → Integrations → Google Ads and pick the account for this site.
        </GoogleAdsConnectHint>
      </div>
    );
  }

  if (isConfigured === null) return null;

  const overallCTR = totals && totals.impressions > 0
    ? (totals.clicks / totals.impressions) * 100
    : 0;
  const overallCPC = totals && totals.clicks > 0
    ? totals.cost / totals.clicks
    : 0;
  const overallROAS = totals && totals.cost > 0
    ? totals.conversions_value / totals.cost
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-primary" />
          Google Ads — Direct API
          <Badge variant="default" className="bg-green-600 text-xs">Connected</Badge>
        </h3>
        <div className="flex items-center gap-2">
          <Select value={dateRange} onValueChange={(v) => setDateRange(v as GoogleAdsDateRange)}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="last_7_days">Last 7 days</SelectItem>
              <SelectItem value="last_30_days">Last 30 days</SelectItem>
              <SelectItem value="last_90_days">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={refetch} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription className="text-sm">{error}</AlertDescription>
        </Alert>
      )}

      {loading && !totals ? (
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="h-16 bg-muted animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : totals ? (
        <>
          {/* Summary cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <DollarSign className="h-8 w-8 text-primary shrink-0" />
                  <div>
                    <p className="text-xl font-bold">
                      {totals.cost.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}
                    </p>
                    <p className="text-xs text-muted-foreground">Ad spend</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <MousePointerClick className="h-8 w-8 text-primary shrink-0" />
                  <div>
                    <p className="text-xl font-bold">{totals.clicks.toLocaleString('sv-SE')}</p>
                    <p className="text-xs text-muted-foreground">
                      Clicks
                      <span className="ml-1 text-muted-foreground">· CTR {overallCTR.toFixed(2)}%</span>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Eye className="h-8 w-8 text-primary shrink-0" />
                  <div>
                    <p className="text-xl font-bold">{totals.impressions.toLocaleString('sv-SE')}</p>
                    <p className="text-xs text-muted-foreground">
                      Impressions
                      <span className="ml-1">· CPC ${overallCPC.toFixed(2)}</span>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  {overallROAS >= 1
                    ? <TrendingUp className="h-8 w-8 text-green-600 shrink-0" />
                    : <TrendingDown className="h-8 w-8 text-orange-500 shrink-0" />
                  }
                  <div>
                    <p className="text-xl font-bold">{overallROAS.toFixed(2)}x</p>
                    <p className="text-xs text-muted-foreground">
                      ROAS · {totals.conversions.toFixed(0)} conv.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Campaign table */}
          {campaigns.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Campaigns</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground text-xs">
                        <th className="text-left py-2 pr-4 font-medium">Campaign</th>
                        <th className="text-right py-2 px-2 font-medium">Spend</th>
                        <th className="text-right py-2 px-2 font-medium">Clicks</th>
                        <th className="text-right py-2 px-2 font-medium">Impr.</th>
                        <th className="text-right py-2 px-2 font-medium">CTR</th>
                        <th className="text-right py-2 px-2 font-medium">CPC</th>
                        <th className="text-right py-2 px-2 font-medium">Conv.</th>
                        <th className="text-right py-2 pl-2 font-medium">ROAS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaigns.map((c) => (
                        <tr key={c.campaign_id} className="border-b last:border-0 hover:bg-muted/40">
                          <td className="py-2 pr-4">
                            <div className="font-medium truncate max-w-[200px]" title={c.campaign_name}>
                              {c.campaign_name}
                            </div>
                            <div className="text-xs text-muted-foreground">{c.channel_type}</div>
                          </td>
                          <td className="text-right py-2 px-2 font-medium">
                            ${c.cost.toFixed(2)}
                          </td>
                          <td className="text-right py-2 px-2">
                            {c.clicks.toLocaleString('sv-SE')}
                          </td>
                          <td className="text-right py-2 px-2">
                            {c.impressions.toLocaleString('sv-SE')}
                          </td>
                          <td className="text-right py-2 px-2">
                            <Badge variant={c.ctr >= 2 ? 'default' : 'secondary'} className="text-xs">
                              {c.ctr.toFixed(2)}%
                            </Badge>
                          </td>
                          <td className="text-right py-2 px-2">${c.cpc.toFixed(2)}</td>
                          <td className="text-right py-2 px-2">{c.conversions.toFixed(1)}</td>
                          <td className="text-right py-2 pl-2">
                            <span className={c.roas >= 1 ? 'text-green-600 font-medium' : 'text-orange-500'}>
                              {c.roas.toFixed(2)}x
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {campaigns.length === 0 && !loading && (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground text-sm">
                <Target className="h-8 w-8 mx-auto mb-2 opacity-40" />
                No active campaigns found for this period.
              </CardContent>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useKPIMetrics } from "@/hooks/useKPIMetrics";
import { KPIMetricCard } from "../KPIMetricCard";
import { Target, TrendingUp, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAIBotTracking } from "@/hooks/useAIBotTracking";
import { useAITraffic } from "@/hooks/useAITraffic";
import type { Site } from "@/types/dashboard";

interface KPICatalogTabProps {
  selectedSite: Site;
}

export const KPICatalogTab = ({ selectedSite }: KPICatalogTabProps) => {
  const {
    criticalMetrics,
    liveDataMetrics,
    toggleMetric,
  } = useKPIMetrics();

  // Fetch real AI data
  const { data: aiBotData, isLoading: aiBotLoading } = useAIBotTracking(selectedSite.id, 30);
  const { data: aiTrafficData, loading: aiTrafficLoading } = useAITraffic(selectedSite.id, 30);

  // Map real data to KPI metrics
  const getKPIValue = (metricId: string): number | string => {
    switch (metricId) {
      case 'ai-bot-traffic':
        return aiBotData?.totalTraffic || 0;
      case 'ai-citations':
        return aiBotData?.citationRequests || 0;
      case 'ai-traffic-sources':
        return aiTrafficData?.totalSessions || 0;
      case 'ai-bot-detection':
        return aiBotData?.botBreakdown?.length || 0;
      default:
        return 'N/A';
    }
  };

  const activatedCount = [...criticalMetrics, ...liveDataMetrics]
    .filter(m => m.enabled).length;
  const totalCount = criticalMetrics.length + liveDataMetrics.length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
        <div>
            <h2 className="text-3xl font-bold tracking-tight">KPI Catalog - AI Bot Analytics</h2>
            <p className="text-muted-foreground mt-2">
              Realistic metrics based on actual data from your website. All KPIs are GDPR-compatible.
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold">{activatedCount}/{totalCount}</div>
            <div className="text-sm text-muted-foreground">Activated KPIs</div>
          </div>
        </div>

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            KPIs marked as "Partial" require integration with external tools (Google Search Console or Bing Webmaster Tools).
          </AlertDescription>
        </Alert>
      </div>

      {/* Critical KPIs */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
            <AlertCircle className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <h3 className="text-xl font-semibold">Critical KPIs</h3>
            <p className="text-sm text-muted-foreground">
              Core metrics for your AI visibility
            </p>
          </div>
          <Badge variant="destructive" className="ml-auto">
            {criticalMetrics.length} KPIs
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {criticalMetrics.map((metric) => (
            <KPIMetricCard
              key={metric.id}
              metric={metric}
              onToggle={toggleMetric}
              orderNumber={metric.order}
              value={getKPIValue(metric.id)}
              loading={aiBotLoading || aiTrafficLoading}
            />
          ))}
        </div>
      </div>

      {/* Live Data KPIs */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <TrendingUp className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-xl font-semibold">Live Data KPIs</h3>
            <p className="text-sm text-muted-foreground">
              Real-time data about your AI traffic and external integrations
            </p>
          </div>
          <Badge variant="secondary" className="ml-auto">
            {liveDataMetrics.length} KPIs
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {liveDataMetrics.map((metric) => (
            <KPIMetricCard
              key={metric.id}
              metric={metric}
              onToggle={toggleMetric}
              orderNumber={metric.order}
              value={getKPIValue(metric.id)}
              loading={aiBotLoading || aiTrafficLoading}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

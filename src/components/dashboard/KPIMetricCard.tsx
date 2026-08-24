import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { KPIMetric } from "@/types/kpi";
import { Activity, AlertCircle, TrendingUp, Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface KPIMetricCardProps {
  metric: KPIMetric;
  onToggle: (metricId: string) => void;
  orderNumber: number;
  value?: number | string;
  loading?: boolean;
}

const statusColors = {
  activated: "bg-success text-success-foreground",
  partial: "bg-warning text-warning-foreground",
  planned: "bg-muted text-muted-foreground",
};

const statusLabels = {
  activated: "Active",
  partial: "Partial",
  planned: "Planned",
};

const priorityColors = {
  critical: "bg-destructive/10 text-destructive border-destructive/20",
  high: "bg-warning/10 text-warning border-warning/20",
  medium: "bg-primary/10 text-primary border-primary/20",
  low: "bg-muted text-muted-foreground border-border",
};

export const KPIMetricCard = ({ metric, onToggle, orderNumber, value, loading }: KPIMetricCardProps) => {
  const formatValue = (val: number | string | undefined): string => {
    if (val === undefined || val === 'N/A') return 'N/A';
    if (typeof val === 'number') {
      if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
      if (val >= 1000) return `${(val / 1000).toFixed(1)}k`;
      return val.toLocaleString();
    }
    return String(val);
  };

  return (
    <Card className="p-6 hover:shadow-lg transition-shadow">
      <div className="space-y-4">
        <div>
          <div className="flex items-start justify-between gap-3 mb-2">
            <h3 className="text-lg font-semibold min-w-0">{metric.title}</h3>
            <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
              <Badge className={statusColors[metric.status]}>
                {statusLabels[metric.status]}
              </Badge>
              {metric.priority === 'critical' && (
                <Badge variant="destructive" className="gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Critical
                </Badge>
              )}
              {metric.hasLiveData && (
                <Badge variant="outline" className="gap-1">
                  <Activity className="h-3 w-3 text-success animate-pulse" />
                  Live Data
                </Badge>
              )}
            </div>
          </div>
          {value !== undefined && (
            <div className="mb-3">
              {loading ? (
                <div className="h-8 w-24 bg-muted animate-pulse rounded" />
              ) : (
                <div className="text-3xl font-bold text-primary">{formatValue(value)}</div>
              )}
            </div>
          )}
          <p className="text-sm text-muted-foreground line-clamp-3">
            {metric.description}
          </p>
        </div>

        <div className={`p-4 rounded-lg border ${priorityColors[metric.priority]}`}>
          <div className="flex items-start gap-2">
            <TrendingUp className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium mb-1">Business value</p>
              <p className="text-sm">{metric.businessValue}</p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">Data sources:</span>
            <div className="flex flex-wrap gap-1">
              {metric.dataSources.map((source, idx) => (
                <Badge key={idx} variant="secondary" className="text-xs">
                  {source}
                </Badge>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">Integrations:</span>
            <div className="flex flex-wrap gap-1">
              {metric.integrations.slice(0, 2).map((integration, idx) => (
                <Badge key={idx} variant="outline" className="text-xs">
                  {integration}
                </Badge>
              ))}
              {metric.integrations.length > 2 && (
                <Badge variant="outline" className="text-xs">
                  +{metric.integrations.length - 2}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t">
          <div className="flex items-center gap-2">
            <Switch
              checked={metric.enabled}
              onCheckedChange={() => onToggle(metric.id)}
              disabled={metric.status === 'planned'}
            />
            <span className="text-sm font-medium">
              {metric.enabled ? 'Disable' : 'Enable KPI'}
            </span>
          </div>

          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                <Info className="h-4 w-4" />
                More info
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {metric.title}
                  <Badge className={statusColors[metric.status]}>
                    {statusLabels[metric.status]}
                  </Badge>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-2">Description</h4>
                  <p className="text-sm text-muted-foreground">
                    {metric.description}
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Business value
                  </h4>
                  <p className="text-sm">{metric.businessValue}</p>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Data sources</h4>
                  <div className="flex flex-wrap gap-2">
                    {metric.dataSources.map((source, idx) => (
                      <Badge key={idx} variant="secondary">
                        {source}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Integrations</h4>
                  <div className="flex flex-wrap gap-2">
                    {metric.integrations.map((integration, idx) => (
                      <Badge key={idx} variant="outline">
                        {integration}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="text-xs text-muted-foreground">
          #{orderNumber}
        </div>
      </div>
    </Card>
  );
};

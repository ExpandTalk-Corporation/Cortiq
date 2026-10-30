// src/components/dashboard/tabs/OverviewTab.tsx
import { AIInsightsWidget } from '@/components/dashboard/AIInsightsWidget';
import { TopPagesData } from '@/components/dashboard/TopPagesData';
import { StatusStrip } from '@/components/dashboard/overview/StatusStrip';
import { KpiRow } from '@/components/dashboard/overview/KpiRow';
import { ModuleCards } from '@/components/dashboard/overview/ModuleCards';
import { AggregateOverview } from '@/components/dashboard/overview/AggregateOverview';
import { useOverviewMetrics } from '@/hooks/useOverviewMetrics';
import { useConversionGoalHealth } from '@/hooks/useConversionGoalHealth';
import { useDashboardFilters } from '@/contexts/DashboardFiltersContext';
import type { Site } from '@/types/dashboard';

export function OverviewTab({ selectedSite, onNavigate }: { selectedSite: Site; onNavigate: (tab: string) => void }) {
  const { filters } = useDashboardFilters();
  const metrics = useOverviewMetrics(selectedSite.id);
  const health = useConversionGoalHealth(selectedSite.id);
  const goals = health.data ?? [];
  const goalIssues = goals.filter((g) => g.status !== 'healthy').map((g) => ({ goalName: g.goalName, issue: g.status }));
  const trackingMode = ((selectedSite as Site & { tracking_mode?: string }).tracking_mode === 'cookieless') ? 'cookieless' : 'full';
  const aggregateOn = (selectedSite as Site & { aggregate_measurement?: boolean }).aggregate_measurement === true;

  if (metrics.isLoading) return <div className="h-64 animate-pulse rounded-lg bg-muted" aria-busy="true" />;
  if (metrics.error || !metrics.data) {
    return <p className="rounded-lg border p-6 text-sm">Could not load the overview. Try again, or narrow the date range.</p>;
  }
  const m = metrics.data;
  return (
    <div className="space-y-6">
      <StatusStrip domain={selectedSite.domain} trackingMode={trackingMode}
        lastPageViewAt={m.lastPageViewAt} lastServerHitAt={m.lastServerHitAt} onNavigate={onNavigate} />
      <KpiRow m={m} from={filters.from} to={filters.to} segmented={!!filters.segmentId} />
      {aggregateOn && <AggregateOverview siteId={selectedSite.id} from={filters.from} to={filters.to} />}
      <ModuleCards m={m} goalCount={goals.length} goalIssues={goalIssues} onNavigate={onNavigate} />
      <div className="grid gap-6 lg:grid-cols-2">
        <TopPagesData siteId={selectedSite.id} startDate={`${filters.from}T00:00:00Z`} endDate={`${filters.to}T23:59:59Z`} />
        <AIInsightsWidget siteId={selectedSite.id} />
      </div>
    </div>
  );
}

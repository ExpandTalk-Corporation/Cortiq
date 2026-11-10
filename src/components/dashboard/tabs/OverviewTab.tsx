// src/components/dashboard/tabs/OverviewTab.tsx
import { AIInsightsWidget } from '@/components/dashboard/AIInsightsWidget';
import { TopPagesData } from '@/components/dashboard/TopPagesData';
import { StatusStrip } from '@/components/dashboard/overview/StatusStrip';
import { KpiRow } from '@/components/dashboard/overview/KpiRow';
import { ModuleCards } from '@/components/dashboard/overview/ModuleCards';
import { AggregateOverview } from '@/components/dashboard/overview/AggregateOverview';
import { PipelineAlerts } from '@/components/dashboard/overview/PipelineAlerts';
import { useOverviewMetrics } from '@/hooks/useOverviewMetrics';
import { useConversionGoalHealth } from '@/hooks/useConversionGoalHealth';
import { useKeyPageVisits } from '@/hooks/useKeyPageVisits';
import { useDashboardFilters } from '@/contexts/DashboardFiltersContext';
import type { Site } from '@/types/dashboard';

export function OverviewTab({ selectedSite, onNavigate }: { selectedSite: Site; onNavigate: (tab: string) => void }) {
  const { filters } = useDashboardFilters();
  const metrics = useOverviewMetrics(selectedSite.id);
  const health = useConversionGoalHealth(selectedSite.id);
  const keyPages = useKeyPageVisits(selectedSite.id, filters.from, filters.to);
  const goals = health.data ?? [];
  const goalIssues = goals.filter((g) => g.status !== 'healthy').map((g) => ({ goalName: g.goalName, issue: g.status }));
  const trackingMode = ((selectedSite as Site & { tracking_mode?: string }).tracking_mode === 'cookieless') ? 'cookieless' : 'full';
  const aggregateOn = (selectedSite as Site & { aggregate_measurement?: boolean }).aggregate_measurement === true;

  if (metrics.isLoading) return <div className="h-64 animate-pulse rounded-lg bg-muted" aria-busy="true" />;
  if (metrics.error || !metrics.data) {
    return <p className="rounded-lg border p-6 text-sm">Could not load the overview. Try again, or narrow the date range.</p>;
  }
  const m = metrics.data;
  // Only the consent-free beacon reports: sessions and page views need consent, so their zeros are
  // not a tracking fault. Show the aggregate figures first and leave out the consent-based lists.
  const aggregateOnly = aggregateOn && m.current.visits === 0 && m.current.pageViews === 0;
  return (
    <div className="space-y-6">
      <StatusStrip domain={selectedSite.domain} trackingMode={trackingMode}
        lastPageViewAt={m.lastPageViewAt} lastServerHitAt={m.lastServerHitAt} aggregateOnly={aggregateOnly} onNavigate={onNavigate} />
      <PipelineAlerts siteId={selectedSite.id} />
      {aggregateOnly && <AggregateOverview siteId={selectedSite.id} from={filters.from} to={filters.to} />}
      <KpiRow m={m} from={filters.from} to={filters.to} segmented={!!filters.segmentId} aggregateOnly={aggregateOnly} />
      {aggregateOn && !aggregateOnly && <AggregateOverview siteId={selectedSite.id} from={filters.from} to={filters.to} />}
      <ModuleCards m={m} goalCount={goals.length} goalIssues={goalIssues} keyPages={keyPages.data ?? []} onNavigate={onNavigate} />
      <div className="grid gap-6 lg:grid-cols-2">
        {!aggregateOnly && <TopPagesData siteId={selectedSite.id} startDate={`${filters.from}T00:00:00Z`} endDate={`${filters.to}T23:59:59Z`} />}
        <AIInsightsWidget siteId={selectedSite.id} />
      </div>
    </div>
  );
}

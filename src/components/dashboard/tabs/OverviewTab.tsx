// src/components/dashboard/tabs/OverviewTab.tsx
import { TopPagesData } from '@/components/dashboard/TopPagesData';
import { StatusStrip } from '@/components/dashboard/overview/StatusStrip';
import { KpiRow } from '@/components/dashboard/overview/KpiRow';
import { ModuleCards } from '@/components/dashboard/overview/ModuleCards';
import { AggregateOverview } from '@/components/dashboard/overview/AggregateOverview';
import { PipelineAlerts } from '@/components/dashboard/overview/PipelineAlerts';
import { DataCoverage } from '@/components/dashboard/overview/DataCoverage';
import { TrackingCheckAlerts } from '@/components/tracking-check/TrackingCheckAlerts';
import { useOverviewMetrics } from '@/hooks/useOverviewMetrics';
import { useConversionGoalHealth } from '@/hooks/useConversionGoalHealth';
import { useKeyPageVisits } from '@/hooks/useKeyPageVisits';
import { useDashboardFilters } from '@/contexts/DashboardFiltersContext';
import { useAIAssistantPanel } from '@/contexts/AIAssistantContext';
import { Button } from '@/components/ui/button';
import { Lightbulb } from 'lucide-react';
import type { Site } from '@/types/dashboard';

export function OverviewTab({ selectedSite, onNavigate }: { selectedSite: Site; onNavigate: (tab: string) => void }) {
  const { filters } = useDashboardFilters();
  const aiPanel = useAIAssistantPanel();
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
      <TrackingCheckAlerts />
      {aggregateOnly && <AggregateOverview siteId={selectedSite.id} from={filters.from} to={filters.to} />}
      <KpiRow m={m} from={filters.from} to={filters.to} segmented={!!filters.segmentId} aggregateOnly={aggregateOnly} />
      {!aggregateOnly && <DataCoverage siteId={selectedSite.id} from={filters.from} to={filters.to} />}
      {aggregateOn && !aggregateOnly && <AggregateOverview siteId={selectedSite.id} from={filters.from} to={filters.to} />}
      <ModuleCards m={m} goalCount={goals.length} goalIssues={goalIssues} keyPages={keyPages.data ?? []} onNavigate={onNavigate} />
      {/* AI suggestions live in the header AI panel; this line opens it and runs them for the period. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <p className="text-sm text-muted-foreground">AI suggestions for {filters.from} to {filters.to}, with the data behind each one.</p>
        <Button size="sm" variant="outline" className="gap-2" onClick={() => aiPanel.openPanel('insights')}>
          <Lightbulb className="h-4 w-4" />
          Generate insights for this period
        </Button>
      </div>
      {!aggregateOnly && <TopPagesData siteId={selectedSite.id} startDate={`${filters.from}T00:00:00Z`} endDate={`${filters.to}T23:59:59Z`} />}
    </div>
  );
}

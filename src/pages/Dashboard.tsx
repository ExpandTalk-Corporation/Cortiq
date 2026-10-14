import React from 'react';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { DashboardTabs } from '@/components/dashboard/DashboardTabs';
import { OnboardingWizard } from '@/components/dashboard/OnboardingWizard';
import { FilterPanel } from '@/components/dashboard/filters/FilterPanel';
import { useSites } from '@/hooks/useSites';
import { useAnalytics } from '@/hooks/useAnalytics';
import { DashboardFiltersProvider, useDashboardFilters } from '@/contexts/DashboardFiltersContext';
import { UTMSegmentProvider } from '@/contexts/UTMSegmentContext';

export default function Dashboard() {
  return (
    <DashboardFiltersProvider>
      <DashboardBody />
    </DashboardFiltersProvider>
  );
}

function DashboardBody() {
  const { sites, selectedSite, setSelectedSite, loadSites, loading } = useSites();
  const { dateRange } = useDashboardFilters();
  const { analytics } = useAnalytics(selectedSite?.id || null, dateRange);

  // First-run: no sites yet → guided onboarding (add site + install snippet).
  // Wait for the initial load so the wizard doesn't flash before sites arrive.
  if (!loading && sites.length === 0) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-7xl mx-auto">
          <OnboardingWizard onComplete={loadSites} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header with site selector; the date range lives in the filter panel */}
        <DashboardHeader
          selectedSite={selectedSite}
          sites={sites}
          onSiteSelect={setSelectedSite}
        />

        {/* Show tabs only when site is selected */}
        {selectedSite ? (
          <UTMSegmentProvider siteId={selectedSite.id}>
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
              <DashboardTabs
                selectedSite={selectedSite}
                analytics={analytics}
                dateRange={dateRange}
                onSiteDeleted={() => { setSelectedSite(null); loadSites(); }}
              />
              <FilterPanel siteId={selectedSite.id} />
            </div>
          </UTMSegmentProvider>
        ) : (
          <div className="text-center py-12">
            <h2 className="text-xl font-semibold mb-4">Select a website to view analytics</h2>
            <p className="text-muted-foreground">
              Choose a website from the selector above to start analyzing data.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { DashboardTabs } from '@/components/dashboard/DashboardTabs';
import { OnboardingWizard } from '@/components/dashboard/OnboardingWizard';
import { FilterPanel } from '@/components/dashboard/filters/FilterPanel';
import { DashboardSidebar } from '@/components/dashboard/nav/DashboardSidebar';
import { TAB_ALIASES } from '@/components/dashboard/nav/navSections';
import { useHasConversions } from '@/hooks/useHasConversions';
import { useSites } from '@/hooks/useSites';
import { DashboardFiltersProvider, useDashboardFilters } from '@/contexts/DashboardFiltersContext';
import { UTMSegmentProvider } from '@/contexts/UTMSegmentContext';
import { AIAssistantProvider } from '@/contexts/AIAssistantContext';

export default function Dashboard() {
  return (
    <DashboardFiltersProvider>
      <AIAssistantProvider>
        <DashboardBody />
      </AIAssistantProvider>
    </DashboardFiltersProvider>
  );
}

function DashboardBody() {
  const { sites, selectedSite, setSelectedSite, loadSites, patchSite, loading } = useSites();
  const { dateRange } = useDashboardFilters();
  // Active tab lives in the URL (?tab=) so it deep-links, survives refresh and works with Back.
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab') || 'overview';
  const activeTab = TAB_ALIASES[requestedTab] ?? requestedTab;
  const { data: hasConversions } = useHasConversions(selectedSite?.id);
  const setActiveTab = (value: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('tab', value);
      // ?source= belongs to the Ads tab; do not carry it to other tabs.
      if (value !== 'paid-ads') next.delete('source');
      return next;
    });
  };

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
    <div className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto max-w-[1600px] space-y-6">
        {/* Header with site selector; the date range lives in the filter panel */}
        <DashboardHeader
          selectedSite={selectedSite}
          sites={sites}
          onSiteSelect={setSelectedSite}
        />

        {/* Show tabs only when site is selected */}
        {selectedSite ? (
          <UTMSegmentProvider siteId={selectedSite.id}>
            <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_280px]">
              <aside className="lg:sticky lg:top-4 lg:self-start">
                <DashboardSidebar activeTab={activeTab} onSelect={setActiveTab} hasConversions={hasConversions === true} />
              </aside>
              <main className="min-w-0">
                <DashboardTabs
                  selectedSite={selectedSite}
                  dateRange={dateRange}
                  activeTab={activeTab}
                  onTabChange={setActiveTab}
                  onSiteDeleted={() => { setSelectedSite(null); loadSites(); }}
                  onSiteUpdated={(patch) => patchSite(selectedSite.id, patch)}
                />
              </main>
              <div className="lg:col-span-2 xl:col-span-1 xl:sticky xl:top-4 xl:self-start">
                <FilterPanel siteId={selectedSite.id} />
              </div>
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

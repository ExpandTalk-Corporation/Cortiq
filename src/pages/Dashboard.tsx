import React, { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { DashboardTabs } from '@/components/dashboard/DashboardTabs';
import { OnboardingWizard } from '@/components/dashboard/OnboardingWizard';
import { FilterPanel } from '@/components/dashboard/filters/FilterPanel';
import { SidebarPanel } from '@/components/dashboard/nav/SidebarPanel';
import { NavSearch } from '@/components/dashboard/nav/NavSearch';
import { TAB_ALIASES } from '@/components/dashboard/nav/navSections';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { useHasConversions } from '@/hooks/useHasConversions';
import { useSites } from '@/hooks/useSites';
import { cn } from '@/lib/utils';
import { DashboardFiltersProvider, useDashboardFilters } from '@/contexts/DashboardFiltersContext';
import { UTMSegmentProvider } from '@/contexts/UTMSegmentContext';
import { AIAssistantProvider } from '@/contexts/AIAssistantContext';

// Per-viewer convenience only; the menu works without storage.
const COLLAPSED_KEY = 'cortiq.sidebar.collapsed';
function readCollapsed(): boolean {
  try { return localStorage.getItem(COLLAPSED_KEY) === '1'; } catch { return false; }
}

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
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const setActiveTab = (value: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('tab', value);
      // ?source= belongs to the Ads tab; do not carry it to other tabs.
      if (value !== 'paid-ads') next.delete('source');
      return next;
    });
  };
  const toggleCollapsed = () => setCollapsed((prev) => {
    try { localStorage.setItem(COLLAPSED_KEY, prev ? '0' : '1'); } catch { /* storage blocked */ }
    return !prev;
  });
  const onSearchOpenChange = useCallback((open: boolean) => setSearchOpen(open), []);

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

  // `closeMenu` is set for the mobile slide-out: picking anything closes it.
  const panel = (isCollapsed: boolean, closeMenu?: () => void) => (
    <SidebarPanel
      sites={sites}
      selectedSite={selectedSite}
      onSiteSelect={(site) => { setSelectedSite(site); closeMenu?.(); }}
      activeTab={activeTab}
      onSelect={(value) => { setActiveTab(value); closeMenu?.(); }}
      hasConversions={hasConversions === true}
      collapsed={isCollapsed}
      onToggleCollapsed={closeMenu ? undefined : toggleCollapsed}
      onOpenSearch={() => { closeMenu?.(); setSearchOpen(true); }}
    />
  );

  return (
    <div className="min-h-screen bg-background lg:flex">
      {/* App shell: on large screens the menu is a full-height column that starts at the top. */}
      <aside className={cn(
        'hidden lg:sticky lg:top-0 lg:block lg:h-screen lg:shrink-0 lg:border-r lg:border-border lg:bg-card/40',
        collapsed ? 'lg:w-16' : 'lg:w-60',
      )}>
        {panel(collapsed)}
      </aside>
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          {panel(false, () => setMenuOpen(false))}
        </SheetContent>
      </Sheet>
      <NavSearch
        open={searchOpen}
        onOpenChange={onSearchOpenChange}
        onSelect={setActiveTab}
        hasConversions={hasConversions === true}
        enabled={!!selectedSite}
      />

      <div className="min-w-0 flex-1 px-4 pb-6 lg:px-6">
      <div className="mx-auto max-w-[1600px] space-y-3">
        <DashboardHeader
          selectedSite={selectedSite}
          activeTab={activeTab}
          onOpenMenu={() => setMenuOpen(true)}
        />

        {/* Show tabs only when site is selected */}
        {selectedSite ? (
          <UTMSegmentProvider siteId={selectedSite.id}>
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
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
              <div className="xl:sticky xl:top-4 xl:self-start">
                <FilterPanel siteId={selectedSite.id} />
              </div>
            </div>
          </UTMSegmentProvider>
        ) : (
          <div className="text-center py-12">
            <h2 className="text-xl font-semibold mb-4">Select a website to view analytics</h2>
            <p className="text-muted-foreground">
              Choose a website from the site menu to start analyzing data.
            </p>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

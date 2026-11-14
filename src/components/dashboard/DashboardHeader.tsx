import React from 'react';
import { Button } from '@/components/ui/button';
import { ChevronRight, Menu, Sparkles, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AIAssistantPanel } from '@/components/dashboard/AIAssistantPanel';
import { DashboardBrand } from '@/components/dashboard/nav/DashboardBrand';
import { navLocation } from '@/components/dashboard/nav/navSections';
import { useTrackingCheckAccess } from '@/hooks/useTrackingCheck';
import { useAIAssistantPanel } from '@/contexts/AIAssistantContext';

interface Site {
  id: string;
  site_name: string;
  domain: string;
  tracking_id: string;
  is_active: boolean;
  created_at: string;
}

interface DashboardHeaderProps {
  selectedSite: Site | null;
  activeTab: string;
  /** Opens the slide-out menu on small screens. */
  onOpenMenu: () => void;
}

// Site, account and theme live in the sidebar; the header keeps the page location and actions.
export function DashboardHeader({ selectedSite, activeTab, onOpenMenu }: DashboardHeaderProps) {
  const navigate = useNavigate();
  const aiPanel = useAIAssistantPanel();
  const trackingCheckAccess = useTrackingCheckAccess();
  const location = selectedSite ? navLocation(activeTab) : null;

  return (
    <>
    {/* min-h-14 matches the sidebar brand row so both start on one line */}
    <div className="flex min-h-14 items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <Button variant="ghost" size="icon" className="h-9 w-9 lg:hidden" onClick={onOpenMenu} aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </Button>
        <DashboardBrand className="lg:hidden" />
        {location && (
          <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-sm sm:flex">
            <span className="text-muted-foreground">{location.section}</span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate font-medium">{location.item}</span>
          </nav>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {selectedSite && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => aiPanel.openPanel()}
            className="font-mono text-sm gap-2 border-primary/40 hover:border-primary hover:bg-primary/10"
          >
            <Sparkles className="w-4 h-4 text-primary" />
            Ask AI
          </Button>
        )}
        {trackingCheckAccess.data?.allowed && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/tracking-check/new')}
            className="font-mono text-sm gap-2"
          >
            <ShieldCheck className="w-4 h-4" />
            <span className="hidden sm:inline">Tracking Check</span>
          </Button>
        )}
      </div>
    </div>
    {selectedSite && (
      <AIAssistantPanel
        selectedSite={selectedSite}
        open={aiPanel.open}
        onClose={aiPanel.closePanel}
      />
    )}
    </>
  );
}

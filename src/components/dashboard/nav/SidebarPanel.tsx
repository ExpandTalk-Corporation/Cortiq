// src/components/dashboard/nav/SidebarPanel.tsx
// Contents of the dashboard sidebar: brand, site, search, menu, account. Used by the desktop
// column (which can collapse to icons) and by the mobile slide-out menu.
import { PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DashboardBrand } from './DashboardBrand';
import { DashboardSidebar } from './DashboardSidebar';
import { SiteSwitcher, type SiteSummary } from './SiteSwitcher';
import { AccountMenu } from './AccountMenu';
import { SEARCH_SHORTCUT } from './NavSearch';

export function SidebarPanel<S extends SiteSummary>({
  sites, selectedSite, onSiteSelect, activeTab, onSelect, hasConversions, collapsed = false, onToggleCollapsed, onOpenSearch,
}: {
  sites: S[];
  selectedSite: S | null;
  onSiteSelect: (site: S) => void;
  activeTab: string;
  onSelect: (value: string) => void;
  hasConversions: boolean;
  collapsed?: boolean;
  /** Left out in the mobile menu, which never collapses. */
  onToggleCollapsed?: () => void;
  onOpenSearch: () => void;
}) {
  const CollapseIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <div className="flex h-full flex-col">
      <DashboardBrand compact={collapsed} className={cn('h-14 shrink-0', collapsed ? 'justify-center' : 'px-5')} />

      <div className={cn('space-y-2 pb-3', collapsed ? 'flex flex-col items-center' : 'px-3')}>
        <SiteSwitcher sites={sites} selectedSite={selectedSite} onSiteSelect={onSiteSelect} collapsed={collapsed} />
        {selectedSite && (collapsed ? (
          <button type="button" title={`Search (${SEARCH_SHORTCUT})`} aria-label="Search" onClick={onOpenSearch}
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted">
            <Search className="h-4 w-4" />
          </button>
        ) : (
          <button type="button" onClick={onOpenSearch}
            className="flex w-full items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted">
            <Search className="h-4 w-4" /> Search
            <kbd className="ml-auto rounded border border-border px-1.5 font-mono text-[10px]">{SEARCH_SHORTCUT}</kbd>
          </button>
        ))}
      </div>

      <div className={cn('min-h-0 flex-1 overflow-y-auto pb-3', collapsed ? 'px-2' : 'px-3')}>
        {selectedSite && (
          <DashboardSidebar activeTab={activeTab} onSelect={onSelect} hasConversions={hasConversions} collapsed={collapsed} />
        )}
      </div>

      <div className={cn('flex shrink-0 gap-1 border-t border-border p-2', collapsed ? 'flex-col items-center' : 'items-center')}>
        <AccountMenu collapsed={collapsed} />
        {onToggleCollapsed && (
          <button type="button" onClick={onToggleCollapsed}
            title={collapsed ? 'Expand menu' : 'Collapse menu'} aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
            className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted',
              collapsed && 'order-first')}>
            <CollapseIcon className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

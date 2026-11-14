// src/components/dashboard/nav/SiteSwitcher.tsx
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface SiteSummary {
  id: string;
  site_name: string;
  domain: string;
  is_active: boolean;
}

const Dot = ({ active }: { active: boolean }) => (
  <span className={cn('h-2 w-2 shrink-0 rounded-full', active ? 'bg-green-500' : 'bg-muted-foreground/40')} />
);

export function SiteSwitcher<S extends SiteSummary>({ sites, selectedSite, onSiteSelect, collapsed = false }: {
  sites: S[];
  selectedSite: S | null;
  onSiteSelect: (site: S) => void;
  collapsed?: boolean;
}) {
  const label = selectedSite ? selectedSite.site_name : 'Select site';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {collapsed ? (
          <button type="button" title={label} aria-label={`Site: ${label}`}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-sm font-semibold uppercase transition-colors hover:bg-muted">
            {label.charAt(0)}
          </button>
        ) : (
          <button type="button" aria-label={`Site: ${label}`}
            className="flex w-full items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-muted">
            <Dot active={!!selectedSite?.is_active} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{label}</span>
              {selectedSite && <span className="block truncate text-xs text-muted-foreground">{selectedSite.domain}</span>}
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent side={collapsed ? 'right' : 'bottom'} align="start" className="max-h-[400px] min-w-[240px] overflow-y-auto">
        {sites.map((site) => (
          <DropdownMenuItem key={site.id} onSelect={() => onSiteSelect(site)} className="cursor-pointer gap-2">
            <Dot active={site.is_active} />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{site.site_name}</span>
              <span className="block truncate text-xs text-muted-foreground">{site.domain}</span>
            </span>
            {selectedSite?.id === site.id && <Check className="h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

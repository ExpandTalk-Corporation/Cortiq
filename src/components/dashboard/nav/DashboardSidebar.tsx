// src/components/dashboard/nav/DashboardSidebar.tsx
import { useEffect, useState } from 'react';
import { BarChart3, Bot, ChevronDown, Megaphone, MousePointerClick, Settings, Target, Users, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { NAV_SECTIONS, NEEDS_CONVERSIONS, SETTINGS_ITEMS, type NavItem } from './navSections';

const SECTION_ICONS: Record<string, LucideIcon> = {
  visitors: Users,
  acquisition: Megaphone,
  behavior: MousePointerClick,
  'ai-agents': Bot,
  conversions: Target,
  reports: BarChart3,
};

type Group = { id: string; label: string; icon: LucideIcon; items: NavItem[] };

const SETTINGS_GROUP: Group = { id: 'settings', label: 'Settings', icon: Settings, items: SETTINGS_ITEMS };
const GROUPS: Group[] = NAV_SECTIONS.map((s) => ({ ...s, icon: SECTION_ICONS[s.id] }));

export function DashboardSidebar({ activeTab, onSelect, hasConversions = false, collapsed = false }: {
  activeTab: string;
  onSelect: (v: string) => void;
  /** Items in NEEDS_CONVERSIONS stay out of the menu until true (unless they are open). */
  hasConversions?: boolean;
  /** Icon rail: each section opens its items in a flyout. */
  collapsed?: boolean;
}) {
  const visible = (value: string) => hasConversions || value === activeTab || !NEEDS_CONVERSIONS.has(value);
  const owning = [...GROUPS, SETTINGS_GROUP].find((g) => g.items.some((i) => i.value === activeTab))?.id;
  // One section open at a time keeps the menu short.
  const [open, setOpen] = useState<string | null>(owning ?? NAV_SECTIONS[0].id);
  // Navigation from elsewhere (module cards, status strip, Back) must reveal the active item.
  useEffect(() => {
    if (owning) setOpen(owning);
  }, [owning]);
  const toggle = (id: string) => setOpen((prev) => (prev === id ? null : id));

  // Sub-items hang off a guide line; the active one marks it with the primary colour.
  const itemClass = (value: string) => cn(
    '-ml-px block w-full border-l-2 py-1.5 pl-3 pr-2 text-left text-sm transition-colors',
    value === activeTab
      ? 'border-primary bg-primary/10 font-medium text-primary'
      : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
  );

  const renderGroup = (g: Group) => {
    const Icon = g.icon;
    const current = owning === g.id;
    const items = g.items.filter((item) => visible(item.value));

    if (collapsed) {
      return (
        <DropdownMenu key={g.id}>
          <DropdownMenuTrigger asChild>
            <button type="button" title={g.label} aria-label={g.label}
              className={cn('mx-auto flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:bg-muted',
                current ? 'bg-primary/10 text-primary' : 'text-muted-foreground')}>
              <Icon className="h-4 w-4" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start" className="min-w-[200px]">
            <DropdownMenuLabel>{g.label}</DropdownMenuLabel>
            {items.map((item) => (
              <DropdownMenuItem key={item.value} onSelect={() => onSelect(item.value)}
                className={cn('cursor-pointer', item.value === activeTab && 'font-medium text-primary')}>
                {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }

    return (
      <div key={g.id}>
        <button type="button" aria-expanded={open === g.id} onClick={() => toggle(g.id)}
          className={cn('flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm font-medium transition-colors hover:bg-muted',
            current ? 'text-foreground' : 'text-foreground/80')}>
          <span className="flex items-center gap-2.5">
            <Icon className={cn('h-4 w-4', current ? 'text-primary' : 'text-muted-foreground')} aria-hidden="true" />
            {g.label}
          </span>
          <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', open === g.id && 'rotate-180')} />
        </button>
        {open === g.id && (
          <ul className="mb-2 ml-4 mt-0.5 border-l border-border">
            {items.map((item) => (
              <li key={item.value}>
                <button type="button" aria-current={item.value === activeTab ? 'page' : undefined}
                  className={itemClass(item.value)} onClick={() => onSelect(item.value)}>
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  return (
    <nav aria-label="Dashboard sections" className="flex min-h-full flex-col gap-1">
      {GROUPS.map(renderGroup)}
      <div className="mt-auto border-t border-border pt-3">{renderGroup(SETTINGS_GROUP)}</div>
    </nav>
  );
}

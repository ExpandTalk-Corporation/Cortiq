// src/components/dashboard/nav/DashboardSidebar.tsx
import { useEffect, useState } from 'react';
import { BarChart3, Bot, ChevronDown, Megaphone, MousePointerClick, Settings, Target, Users, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAV_SECTIONS, NEEDS_CONVERSIONS, SETTINGS_ITEMS } from './navSections';

const SECTION_ICONS: Record<string, LucideIcon> = {
  visitors: Users,
  acquisition: Megaphone,
  behavior: MousePointerClick,
  'ai-agents': Bot,
  conversions: Target,
  reports: BarChart3,
};

export function DashboardSidebar({ activeTab, onSelect, hasConversions = false }: {
  activeTab: string;
  onSelect: (v: string) => void;
  /** Items in NEEDS_CONVERSIONS stay out of the menu until true (unless they are open). */
  hasConversions?: boolean;
}) {
  const visible = (value: string) => hasConversions || value === activeTab || !NEEDS_CONVERSIONS.has(value);
  const owning = NAV_SECTIONS.find((s) => s.items.some((i) => i.value === activeTab))?.id;
  const [open, setOpen] = useState<Set<string>>(new Set([owning ?? NAV_SECTIONS[0].id]));
  // Navigation from elsewhere (module cards, status strip, Back) must reveal the active item.
  useEffect(() => {
    if (owning) setOpen((prev) => (prev.has(owning) ? prev : new Set(prev).add(owning)));
  }, [owning]);
  const toggle = (n: string) => setOpen((prev) => {
    const next = new Set(prev);
    next.has(n) ? next.delete(n) : next.add(n);
    return next;
  });
  const itemClass = (value: string) => cn(
    'block w-full rounded-md px-3 py-2 text-left text-sm transition-colors',
    value === activeTab ? 'bg-primary/10 font-medium text-primary' : 'text-foreground/80 hover:bg-muted',
  );

  return (
    <nav aria-label="Dashboard sections" className="space-y-1">
      {NAV_SECTIONS.map((s) => {
        const Icon = SECTION_ICONS[s.id];
        return (
        <div key={s.id}>
          <button type="button" aria-expanded={open.has(s.id)} onClick={() => toggle(s.id)}
            className={cn('flex w-full items-center justify-between rounded-md px-3 py-2 text-left font-medium',
              owning === s.id ? 'text-primary' : 'text-foreground')}>
            <span className="flex items-center gap-2">
              {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
              {s.label}
            </span>
            <ChevronDown className={cn('h-4 w-4 transition-transform', open.has(s.id) && 'rotate-180')} />
          </button>
          {open.has(s.id) && (
            <ul className="ml-6 space-y-0.5">
              {s.items.filter((item) => visible(item.value)).map((item) => (
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
      })}
      <details className="pt-4" open={SETTINGS_ITEMS.some((i) => i.value === activeTab)}>
        <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 font-medium">
          <Settings className="h-4 w-4" /> Settings
        </summary>
        <ul className="ml-2 space-y-0.5">
          {SETTINGS_ITEMS.map((item) => (
            <li key={item.value}>
              <button type="button" className={itemClass(item.value)} onClick={() => onSelect(item.value)}>{item.label}</button>
            </li>
          ))}
        </ul>
      </details>
    </nav>
  );
}

// src/components/dashboard/nav/DashboardSidebar.tsx
import { useEffect, useState } from 'react';
import { ChevronDown, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAV_SECTIONS, SETTINGS_ITEMS, numberedLabel } from './navSections';

export function DashboardSidebar({ activeTab, onSelect }: { activeTab: string; onSelect: (v: string) => void }) {
  const owning = NAV_SECTIONS.find((s) => s.items.some((i) => i.value === activeTab))?.number;
  const [open, setOpen] = useState<Set<number>>(new Set([owning ?? 1]));
  // Navigation from elsewhere (module cards, status strip, Back) must reveal the active item.
  useEffect(() => {
    if (owning) setOpen((prev) => (prev.has(owning) ? prev : new Set(prev).add(owning)));
  }, [owning]);
  const toggle = (n: number) => setOpen((prev) => {
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
      {NAV_SECTIONS.map((s) => (
        <div key={s.number}>
          <button type="button" aria-expanded={open.has(s.number)} onClick={() => toggle(s.number)}
            className={cn('flex w-full items-center justify-between rounded-md px-3 py-2 text-left font-medium',
              owning === s.number ? 'text-primary' : 'text-foreground')}>
            <span>{s.number} {s.label}</span>
            <ChevronDown className={cn('h-4 w-4 transition-transform', open.has(s.number) && 'rotate-180')} />
          </button>
          {open.has(s.number) && (
            <ul className="ml-2 space-y-0.5">
              {s.items.map((item, idx) => (
                <li key={item.value}>
                  <button type="button" aria-current={item.value === activeTab ? 'page' : undefined}
                    className={itemClass(item.value)} onClick={() => onSelect(item.value)}>
                    {numberedLabel(s.number, idx)} {item.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
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

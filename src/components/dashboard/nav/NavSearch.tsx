// src/components/dashboard/nav/NavSearch.tsx
// Jump to any dashboard tab: Ctrl/⌘ K or the search button in the sidebar.
import { useEffect } from 'react';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { NAV_SECTIONS, NEEDS_CONVERSIONS, SETTINGS_ITEMS } from './navSections';

const GROUPS = [...NAV_SECTIONS, { id: 'settings', label: 'Settings', items: SETTINGS_ITEMS }];

export const SEARCH_SHORTCUT =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform) ? '⌘K' : 'Ctrl K';

export function NavSearch({ open, onOpenChange, onSelect, hasConversions = false, enabled = true }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (value: string) => void;
  hasConversions?: boolean;
  enabled?: boolean;
}) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, open, onOpenChange]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Go to…" />
      <CommandList className="max-h-[400px]">
        <CommandEmpty>No matching page.</CommandEmpty>
        {GROUPS.map((g) => (
          <CommandGroup key={g.id} heading={g.label}>
            {g.items.filter((i) => hasConversions || !NEEDS_CONVERSIONS.has(i.value)).map((i) => (
              <CommandItem key={i.value} value={`${g.label} ${i.label}`}
                onSelect={() => { onSelect(i.value); onOpenChange(false); }}>
                {i.label}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}

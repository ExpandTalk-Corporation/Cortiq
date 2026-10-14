// src/components/dashboard/FilterScopeNotice.tsx
import { Info } from 'lucide-react';
import { useDashboardFilters } from '@/contexts/DashboardFiltersContext';

export function FilterScopeNotice({ supports }: { supports: { date: boolean } }) {
  const { filters } = useDashboardFilters();
  const ignored = [
    filters.path && 'URL',
    filters.segmentId && 'segment',
    !supports.date && 'date range',
  ].filter(Boolean) as string[];
  if (!ignored.length) return null;
  return (
    <p role="note" className="mb-4 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
      <Info className="h-4 w-4" /> This view does not apply the {ignored.join(' and ')} filter yet.
    </p>
  );
}

// src/components/dashboard/FilterScopeNotice.tsx
import { Info } from 'lucide-react';
import { useDashboardFilters } from '@/contexts/DashboardFiltersContext';

export interface FilterSupport {
  date: boolean;
  /** The URL (path prefix) filter is applied. */
  path?: boolean;
  /** The segment filter is applied. */
  segment?: boolean;
}

export interface FilterScopeNotes {
  /** Why the segment filter cannot apply to this tab (shown when a segment is selected). */
  segment?: string;
  /** Parts of the tab that ignore the URL or segment filter (shown when either is set). */
  partial?: string;
}

export function FilterScopeNotice({ supports, notes }: { supports: FilterSupport; notes?: FilterScopeNotes }) {
  const { filters } = useDashboardFilters();
  const segmentIgnored = !supports.segment && !!filters.segmentId;
  const ignored = [
    !supports.path && filters.path && 'URL',
    segmentIgnored && 'segment',
    !supports.date && 'date range',
  ].filter(Boolean) as string[];
  const lines: string[] = [];
  if (ignored.length) {
    const reason = segmentIgnored && notes?.segment ? ` ${notes.segment}` : '';
    lines.push(`This view does not apply the ${ignored.join(' and ')} filter${reason ? '.' + reason : ' yet.'}`);
  }
  const filterActive = (supports.path && !!filters.path) || (supports.segment && !!filters.segmentId);
  if (filterActive && notes?.partial) lines.push(notes.partial);
  if (!lines.length) return null;
  return (
    <p role="note" className="mb-4 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
      <Info className="mt-0.5 h-4 w-4 shrink-0" /> <span>{lines.join(' ')}</span>
    </p>
  );
}

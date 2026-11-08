// src/hooks/useFilterParams.ts
// The dashboard's URL and segment filters as RPC parameters (p_path, p_segment), shared by
// every view whose RPC applies them through public.session_matches_filters.
import { useDashboardFilters } from '@/contexts/DashboardFiltersContext';
import { useUTMSegments, resolveTokens } from '@/contexts/UTMSegmentContext';
import { builtinSegment } from '@/lib/dashboard/builtinSegments';

export type FilterParams = {
  p_path: string | null;
  p_segment: { field: string; op: string; value: string }[] | null;
};

export function useFilterParams(): FilterParams {
  const { filters } = useDashboardFilters();
  const { segments } = useUTMSegments();
  const builtin = builtinSegment(filters.segmentId);
  const segment = segments.find((s) => s.id === filters.segmentId);
  const p_segment = builtin
    ? [{ field: 'builtin', op: 'eq', value: builtin.key }]
    : segment
      ? segment.filters.filter((f) => f.value.trim()).map((f) => ({ ...f, value: resolveTokens(f.value) }))
      : null;
  return { p_path: filters.path, p_segment };
}

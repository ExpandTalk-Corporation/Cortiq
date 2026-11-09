// src/hooks/useCustomDimensions.ts
// Custom dimensions: metadata keys sent with CortIQ.track() that a site registers for reporting.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDashboardFilters } from '@/contexts/DashboardFiltersContext';

export type CustomDimension = { id: string; key: string; label: string };
export type EventPropertyKey = { key: string; events: number; registered: boolean };
export type DimensionValueRow = { value: string; events: number; sessions: number; is_other: boolean };

export const MAX_CUSTOM_DIMENSIONS = 25;

export function useCustomDimensionList(siteId: string) {
  return useQuery({
    queryKey: ['custom-dimensions', siteId],
    enabled: !!siteId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('custom_dimensions')
        .select('id, key, label')
        .eq('site_id', siteId)
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as CustomDimension[];
    },
  });
}

export function useEventPropertyKeys(siteId: string) {
  const { filters } = useDashboardFilters();
  return useQuery({
    queryKey: ['event-property-keys', siteId, filters.from, filters.to],
    enabled: !!siteId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_event_property_keys', {
        p_site_id: siteId, p_from: filters.from, p_to: filters.to,
      });
      if (error) throw error;
      return (data ?? []) as EventPropertyKey[];
    },
  });
}

export function useCustomDimensionBreakdown(siteId: string, key: string | null) {
  const { filters } = useDashboardFilters();
  return useQuery({
    queryKey: ['custom-dimension-breakdown', siteId, key, filters.from, filters.to],
    enabled: !!siteId && !!key,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_custom_dimension_breakdown', {
        p_site_id: siteId, p_key: key, p_from: filters.from, p_to: filters.to, p_limit: 25,
      });
      if (error) throw error;
      return (data ?? []) as DimensionValueRow[];
    },
  });
}

export function useCustomDimensionMutations(siteId: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['custom-dimensions', siteId] });
    qc.invalidateQueries({ queryKey: ['event-property-keys', siteId] });
  };
  const register = useMutation({
    mutationFn: async ({ key, label }: { key: string; label: string }) => {
      const { error } = await (supabase as any)
        .from('custom_dimensions')
        .insert({ site_id: siteId, key, label: label.trim() || key });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('custom_dimensions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  return { register, remove };
}

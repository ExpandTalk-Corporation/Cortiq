// src/hooks/useSavedFilters.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { DashboardFilters } from '@/lib/dashboard/filters';

export type SavedFilter = {
  id: string;
  name: string;
  filters: { path: string | null; segmentId: string | null; rangeDays: number | null };
};

const DAY_MS = 86_400_000;

export function useSavedFilters(siteId: string) {
  const qc = useQueryClient();
  const key = ['dashboard-saved-filters', siteId];
  const { data } = useQuery({
    queryKey: key,
    enabled: !!siteId,
    queryFn: async () => {
      // Table is newer than the generated types; cast at the boundary.
      const { data, error } = await (supabase as any)
        .from('dashboard_saved_filters').select('id, name, filters').eq('site_id', siteId).order('name');
      if (error) throw error;
      return (data ?? []) as SavedFilter[];
    },
  });
  const save = useMutation({
    mutationFn: async ({ name, f }: { name: string; f: DashboardFilters }) => {
      const rangeDays = Math.round((Date.parse(f.to) - Date.parse(f.from)) / DAY_MS) + 1;
      const { error } = await (supabase as any).from('dashboard_saved_filters').insert({
        site_id: siteId, name: name.trim(), filters: { path: f.path, segmentId: f.segmentId, rangeDays },
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('dashboard_saved_filters').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
  return {
    saved: data ?? [],
    save: (name: string, f: DashboardFilters) => save.mutateAsync({ name, f }),
    remove: (id: string) => remove.mutateAsync(id),
  };
}

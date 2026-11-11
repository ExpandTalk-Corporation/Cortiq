import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDashboardFilters } from '@/contexts/DashboardFiltersContext';
import { useFilterParams } from '@/hooks/useFilterParams';

export type FormAnalytics = {
  id: string;
  site_id: string;
  form_id: string;
  form_name: string | null;
  form_type: 'contact_form_7' | 'gravity_forms' | 'woocommerce_checkout' | 'custom';
  total_starts: number;
  total_completions: number;
  total_abandons: number;
  avg_completion_time: number;
  conversion_rate: number;
  created_at: string;
  updated_at: string;
};

export type FormFieldAnalytics = {
  id: string;
  site_id: string;
  form_id: string;
  field_name: string;
  field_type: string | null;
  field_label: string | null;
  field_position: number | null;
  total_interactions: number;
  total_errors: number;
  total_skips: number;
  avg_focus_time: number;
  error_rate: number;
  skip_rate: number;
  created_at: string;
  updated_at: string;
};

export type FormSession = {
  id: string;
  site_id: string;
  session_id: string;
  form_id: string;
  form_type: string;
  started_at: string;
  completed_at: string | null;
  abandoned_at: string | null;
  completion_time: number | null;
  fields_completed: number;
  total_fields: number;
  error_count: number;
  device_type: string | null;
  user_agent: string | null;
  ip_address: string | null;
  created_at: string;
};

export function useFormAnalytics(siteId: string) {
  return useQuery({
    queryKey: ['form-analytics', siteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('form_analytics')
        .select('*')
        .eq('site_id', siteId)
        .order('total_starts', { ascending: false });

      if (error) throw error;
      return data as FormAnalytics[];
    },
    enabled: !!siteId,
  });
}

export function useFormFieldAnalytics(siteId: string, formId?: string) {
  return useQuery({
    queryKey: ['form-field-analytics', siteId, formId],
    queryFn: async () => {
      let query = supabase
        .from('form_field_analytics')
        .select('*')
        .eq('site_id', siteId);

      if (formId) {
        query = query.eq('form_id', formId);
      }

      const { data, error } = await query
        .order('field_position', { ascending: true });

      if (error) throw error;
      return data as FormFieldAnalytics[];
    },
    enabled: !!siteId,
  });
}

export function useFormSessions(siteId: string, formId?: string, limit = 100) {
  return useQuery({
    queryKey: ['form-sessions', siteId, formId, limit],
    queryFn: async () => {
      let query = supabase
        .from('form_sessions')
        .select('*')
        .eq('site_id', siteId);

      if (formId) {
        query = query.eq('form_id', formId);
      }

      const { data, error } = await query
        .order('started_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data as FormSession[];
    },
    enabled: !!siteId,
  });
}

export function useFormFunnelAnalysis(siteId: string, formId: string) {
  return useQuery({
    queryKey: ['form-funnel', siteId, formId],
    queryFn: async () => {
      // Get field analytics for funnel visualization
      const { data: fieldData, error: fieldError } = await supabase
        .from('form_field_analytics')
        .select('*')
        .eq('site_id', siteId)
        .eq('form_id', formId)
        .order('field_position', { ascending: true });

      if (fieldError) throw fieldError;

      // Get form completion rates
      const { data: formData, error: formError } = await supabase
        .from('form_analytics')
        .select('*')
        .eq('site_id', siteId)
        .eq('form_id', formId)
        .single();

      if (formError) throw formError;

      // Calculate funnel steps
      const funnelSteps = fieldData.map((field, index) => {
        const previousField = fieldData[index - 1];
        const completionRate = previousField 
          ? ((previousField.total_interactions - field.total_skips) / previousField.total_interactions) * 100
          : 100; // First field starts at 100%

        return {
          ...field,
          completionRate,
          dropOffRate: 100 - completionRate,
          users: Math.round((formData.total_starts * completionRate) / 100),
        };
      });

      return {
        form: formData,
        steps: funnelSteps,
        overallConversionRate: formData.conversion_rate,
      };
    },
    enabled: !!siteId && !!formId,
  });
}

export type FormStatsRow = {
  form_id: string;
  form_name: string | null;
  form_type: string;
  starts: number;
  completions: number;
  abandons: number;
  avg_completion_time: number;
  conversion_rate: number;
};

export type FormStats = {
  totalStarts: number;
  totalCompletions: number;
  totalAbandons: number;
  /** Completions / starts over all forms, in percent. */
  conversionRate: number;
  avgCompletionTime: number;
  forms: FormStatsRow[];
  /** The global date filter the numbers cover (inclusive YYYY-MM-DD). */
  period: { from: string; to: string };
};

/**
 * Form sessions for the global dashboard filters, counted in the database (get_form_stats):
 * date range, URL (the visit viewed a page under it) and segment. Form sessions that cannot be
 * linked to a visit are left out while a URL or segment filter is set.
 */
export function useFormStats(siteId: string) {
  const { filters } = useDashboardFilters();
  const { p_path, p_segment } = useFilterParams();
  const p_from = filters.from;
  const p_to = filters.to;
  return useQuery({
    queryKey: ['form-stats', siteId, p_from, p_to, p_path, p_segment],
    queryFn: async (): Promise<FormStats> => {
      // Newer than the generated types; cast at the boundary.
      const { data, error } = await (supabase as any).rpc('get_form_stats', {
        p_site_id: siteId, p_from, p_to, p_path, p_segment,
      });
      if (error) throw error;
      const r = data ?? {};
      const totalStarts = Number(r.total_starts ?? 0);
      const totalCompletions = Number(r.total_completions ?? 0);
      return {
        totalStarts,
        totalCompletions,
        totalAbandons: Number(r.total_abandons ?? 0),
        conversionRate: totalStarts > 0 ? (totalCompletions / totalStarts) * 100 : 0,
        avgCompletionTime: Number(r.avg_completion_time ?? 0),
        forms: (r.forms ?? []).map((f: any) => ({
          form_id: String(f.form_id),
          form_name: f.form_name ?? null,
          form_type: String(f.form_type ?? 'custom'),
          starts: Number(f.starts ?? 0),
          completions: Number(f.completions ?? 0),
          abandons: Number(f.abandons ?? 0),
          avg_completion_time: Number(f.avg_completion_time ?? 0),
          conversion_rate: Number(f.conversion_rate ?? 0),
        })),
        period: { from: p_from, to: p_to },
      };
    },
    enabled: !!siteId && !!p_from && !!p_to,
  });
}

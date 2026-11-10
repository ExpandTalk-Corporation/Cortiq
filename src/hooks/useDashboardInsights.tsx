import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface DashboardInsight {
  id: string;
  insight_type: string;
  title: string;
  description: string;
  action_items: any;
  priority: string;
  confidence_score: number | null;
  created_at: string;
  expires_at: string;
  run_id?: string | null;
}

/**
 * Saved, non-expired AI suggestions for a site (dashboard_insights). New ones are generated from
 * the AI panel (useAIAssistant.generateInsights); this hook lists and dismisses them.
 */
export function useDashboardInsights(siteId: string | null) {
  const [insights, setInsights] = useState<DashboardInsight[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInsights = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('dashboard_insights')
        .select('*')
        .eq('site_id', siteId)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });
      if (fetchError) throw fetchError;
      setInsights(data || []);
    } catch (err) {
      console.error('Error fetching insights:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch insights');
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  const dismissInsight = useCallback(async (insightId: string) => {
    try {
      const { error } = await supabase
        .from('dashboard_insights')
        .update({ expires_at: new Date().toISOString() })
        .eq('id', insightId);
      if (error) throw error;
      setInsights(prev => prev.filter(insight => insight.id !== insightId));
    } catch (err) {
      console.error('Error dismissing insight:', err);
    }
  }, []);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  return { insights, loading, error, fetchInsights, dismissInsight };
}

import { useState, useEffect } from 'react';
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

export function useDashboardInsights(siteId: string | null) {
  const [insights, setInsights] = useState<DashboardInsight[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const fetchInsights = async () => {
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
  };

  const generateInsights = async () => {
    if (!siteId || generating) return;

    setGenerating(true);
    setError(null);

    try {
      const { data, error: generateError } = await supabase.functions.invoke(
        'generate-dashboard-insights',
        {
          body: { siteId }
        }
      );

      if (generateError) throw generateError;
      
      if (data?.success) {
        await fetchInsights(); // Refresh insights after generation
        return data;
      } else {
        throw new Error(data?.error || 'Failed to generate insights');
      }
    } catch (err) {
      console.error('Error generating insights:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate insights');
      throw err;
    } finally {
      setGenerating(false);
    }
  };

  const dismissInsight = async (insightId: string) => {
    try {
      const { error } = await supabase
        .from('dashboard_insights')
        .update({ expires_at: new Date().toISOString() })
        .eq('id', insightId);

      if (error) throw error;
      
      // Remove from local state
      setInsights(prev => prev.filter(insight => insight.id !== insightId));
    } catch (err) {
      console.error('Error dismissing insight:', err);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'destructive';
      case 'medium': return 'default';
      case 'low': return 'secondary';
      default: return 'default';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'traffic': return '📊';
      case 'conversion': return '🎯';
      case 'usability': return '🔧';
      case 'performance': return '⚡';
      default: return '💡';
    }
  };

  useEffect(() => {
    fetchInsights();
  }, [siteId]);

  return {
    insights,
    loading,
    error,
    generating,
    fetchInsights,
    generateInsights,
    dismissInsight,
    getPriorityColor,
    getTypeIcon,
    hasInsights: insights.length > 0,
    highPriorityCount: insights.filter(i => i.priority === 'high').length
  };
}

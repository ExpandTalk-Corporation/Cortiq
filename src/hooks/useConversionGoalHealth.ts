import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { matchesGoal } from '@/lib/goalMatching';

export type GoalHealthStatus = 'healthy' | 'fires_too_often' | 'silent' | 'duplicate_primary';

export interface GoalHealth {
  goalId: string;
  goalName: string;
  firingRate: number;
  lastFiredAt: string | null;
  status: GoalHealthStatus;
  warning: string | null;
}

interface ConversionGoal {
  id: string;
  name: string;
  selector: string;
  is_primary?: boolean;
}

export function useConversionGoalHealth(siteId: string) {
  return useQuery({
    queryKey: ['conversion-goal-health', siteId],
    queryFn: async (): Promise<GoalHealth[]> => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      // Load goals from sites.conversion_goals JSONB
      const { data: siteData, error: siteError } = await supabase
        .from('sites')
        .select('conversion_goals')
        .eq('id', siteId)
        .single();

      if (siteError || !siteData?.conversion_goals) return [];

      const goals = (siteData.conversion_goals as unknown as ConversionGoal[]) || [];
      if (goals.length === 0) return [];

      // Count total sessions in last 30 days as denominator.
      // tracking_sessions has no created_at column — it uses started_at.
      const { count: sessionCount } = await supabase
        .from('tracking_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('site_id', siteId)
        .gte('started_at', thirtyDaysAgo);

      const totalSessions = sessionCount || 1;

      // Count conversion events per goal in last 30 days (see matchesGoal for the matching rule).
      const { data: convEvents } = await supabase
        .from('conversion_events')
        .select('event_name, element_selector, created_at')
        .eq('site_id', siteId)
        .gte('created_at', thirtyDaysAgo);

      // Detect duplicate primaries
      const primaryGoals = goals.filter(g => g.is_primary);
      const hasDuplicatePrimary = primaryGoals.length > 1;

      return goals.map((goal): GoalHealth => {
        const matching = (convEvents || []).filter(e => matchesGoal(e, goal));

        const count = matching.length;
        const firingRate = count / totalSessions;

        const recentEvents = matching.filter(e => e.created_at >= sevenDaysAgo);
        const lastFiredAt = matching.length > 0
          ? matching.sort((a, b) => b.created_at.localeCompare(a.created_at))[0].created_at
          : null;

        let status: GoalHealthStatus = 'healthy';
        let warning: string | null = null;

        if (hasDuplicatePrimary && goal.is_primary) {
          status = 'duplicate_primary';
          warning = `${primaryGoals.length} Primary goals active — Smart Bidding splits signal across all of them. Keep only one Primary goal.`;
        } else if (firingRate > 0.30) {
          status = 'fires_too_often';
          warning = `Fires on ${Math.round(firingRate * 100)}% of sessions — not a commercial signal. Change to Observation or deactivate.`;
        } else if (recentEvents.length === 0 && count === 0) {
          status = 'silent';
          warning = 'No conversions in the last 7 days. Verify the tracking tag is firing.';
        }

        return {
          goalId: goal.id,
          goalName: goal.name,
          firingRate,
          lastFiredAt,
          status,
          warning,
        };
      });
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!siteId,
  });
}

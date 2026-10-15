import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { rangeBounds } from "@/lib/dashboard/filters";

interface AgentSession {
  id: string;
  session_id: string;
  bot_type: string;
  bot_name: string;
  browser_type: string;
  is_visual_browser: boolean;
  cookies_accepted: boolean;
  started_at: string;
  last_activity_at: string;
  total_requests: number;
  total_pages_viewed: number;
  total_assets_loaded: number;
  reached_conversion: boolean;
  conversion_page: string | null;
  exit_page: string | null;
}

interface JourneyStep {
  id: string;
  step_number: number;
  url: string;
  page_type: string;
  request_type: string;
  asset_type: string | null;
  created_at: string;
}

interface FunnelStep {
  page_type: string;
  sessions_count: number;
  drop_off_rate: number;
}

interface AgentJourneyData {
  sessions: AgentSession[];
  totalSessions: number;
  visualBrowserSessions: number;
  headlessSessions: number;
  textBasedSessions: number;
  conversions: number;
  conversionRate: number;
  avgPagesPerSession: number;
  avgAssetsPerSession: number;
  funnel: FunnelStep[];
  browserTypeBreakdown: { type: string; count: number; percentage: number }[];
  botTypeBreakdown: { type: string; count: number; percentage: number }[];
}

/** `range` is the global dashboard date filter (inclusive YYYY-MM-DD). */
export const useAIAgentJourney = (siteId: string | null, range: { from: string; to: string }) => {
  return useQuery({
    queryKey: ['ai-agent-journey', siteId, range.from, range.to],
    queryFn: async (): Promise<AgentJourneyData> => {
      if (!siteId) {
        throw new Error('No site ID provided');
      }

      const { start, end } = rangeBounds(range.from, range.to);

      // Fetch agent sessions
      const { data: sessions, error: sessionsError } = await supabase
        .from('ai_agent_sessions')
        .select('*')
        .eq('site_id', siteId)
        .gte('started_at', start)
        .lt('started_at', end)
        .order('started_at', { ascending: false });

      if (sessionsError) throw sessionsError;

      // Fetch funnel data using RPC (its end bound is inclusive)
      const { data: funnel, error: funnelError } = await supabase
        .rpc('get_ai_agent_funnel', {
          p_site_id: siteId,
          p_start_date: start,
          p_end_date: `${range.to}T23:59:59.999Z`
        });

      if (funnelError) {
        console.error('Funnel error:', funnelError);
      }

      const totalSessions = sessions?.length || 0;
      const visualBrowserSessions = sessions?.filter(s => s.browser_type === 'visual').length || 0;
      const headlessSessions = sessions?.filter(s => s.browser_type === 'headless').length || 0;
      const textBasedSessions = sessions?.filter(s => s.browser_type === 'text-based').length || 0;
      const conversions = sessions?.filter(s => s.reached_conversion).length || 0;
      const conversionRate = totalSessions > 0 ? (conversions / totalSessions) * 100 : 0;
      
      const avgPagesPerSession = totalSessions > 0 
        ? (sessions?.reduce((acc, s) => acc + s.total_pages_viewed, 0) || 0) / totalSessions 
        : 0;
      
      const avgAssetsPerSession = totalSessions > 0
        ? (sessions?.reduce((acc, s) => acc + s.total_assets_loaded, 0) || 0) / totalSessions
        : 0;

      // Browser type breakdown
      const browserTypes: Record<string, number> = {};
      sessions?.forEach(s => {
        browserTypes[s.browser_type || 'unknown'] = (browserTypes[s.browser_type || 'unknown'] || 0) + 1;
      });
      const browserTypeBreakdown = Object.entries(browserTypes).map(([type, count]) => ({
        type,
        count,
        percentage: totalSessions > 0 ? (count / totalSessions) * 100 : 0
      }));

      // Bot type breakdown
      const botTypes: Record<string, number> = {};
      sessions?.forEach(s => {
        botTypes[s.bot_type] = (botTypes[s.bot_type] || 0) + 1;
      });
      const botTypeBreakdown = Object.entries(botTypes).map(([type, count]) => ({
        type,
        count,
        percentage: totalSessions > 0 ? (count / totalSessions) * 100 : 0
      }));

      return {
        sessions: sessions || [],
        totalSessions,
        visualBrowserSessions,
        headlessSessions,
        textBasedSessions,
        conversions,
        conversionRate,
        avgPagesPerSession,
        avgAssetsPerSession,
        funnel: funnel || [],
        browserTypeBreakdown,
        botTypeBreakdown
      };
    },
    enabled: !!siteId,
  });
};

export const useAgentSessionJourney = (sessionId: string | null) => {
  return useQuery({
    queryKey: ['agent-session-journey', sessionId],
    queryFn: async (): Promise<JourneyStep[]> => {
      if (!sessionId) {
        throw new Error('No session ID provided');
      }

      const { data, error } = await supabase
        .from('ai_agent_journey_steps')
        .select('*')
        .eq('session_id', sessionId)
        .order('step_number', { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: !!sessionId,
  });
};

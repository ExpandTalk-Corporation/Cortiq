import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { InsightView } from '@/components/dashboard/ai/InsightCard';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolsUsed?: string[];
  isLoading?: boolean;
  isError?: boolean;
  /** Set on "Generate insights for this period" results (generate-dashboard-insights). */
  insights?: InsightView[];
  runId?: string | null;
}

interface InsightsResponse {
  success?: boolean;
  error?: string;
  runId?: string | null;
  stored?: InsightView[];
  insights?: Array<{ title: string; description: string; actionItems: string[]; priority: string; type: string }>;
}

/** Text the chat history carries for an insights result, so follow-up questions can refer to it. */
export function insightsSummary(from: string, to: string, items: InsightView[]): string {
  if (items.length === 0) {
    return `No supported suggestions for ${from} to ${to}: the data for this period was not enough to back any.`;
  }
  const lines = items.map((i, n) => `${n + 1}. ${i.title} (${i.priority}): ${i.description}`);
  return `${items.length} suggestion${items.length === 1 ? '' : 's'} for ${from} to ${to}:\n${lines.join('\n')}`;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export function useAIAssistant(siteId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text.trim(),
    };

    const loadingMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      isLoading: true,
    };

    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setIsLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      // Build history from existing messages (exclude loading placeholder)
      const history = messages
        .filter(m => !m.isLoading && !m.isError)
        .map(m => ({ role: m.role, content: m.content }));

      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-assistant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ message: text.trim(), siteId, history }),
      });

      const data = await res.json() as { response?: string; toolsUsed?: string[]; error?: string };

      if (!res.ok || data.error) {
        throw new Error(data.error ?? 'Request failed');
      }

      setMessages(prev =>
        prev.map(m =>
          m.isLoading
            ? { ...m, content: data.response ?? '', toolsUsed: data.toolsUsed, isLoading: false }
            : m,
        ),
      );
    } catch (err) {
      const errorText = err instanceof Error ? err.message : 'Something went wrong';
      setMessages(prev =>
        prev.map(m =>
          m.isLoading
            ? { ...m, content: errorText, isLoading: false, isError: true }
            : m,
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, messages, siteId]);

  /** Runs generate-dashboard-insights for the dashboard period and shows the result in the chat. */
  const generateInsights = useCallback(async (range: { from: string; to: string }) => {
    if (isLoading) return;
    setMessages(prev => [
      ...prev,
      { id: crypto.randomUUID(), role: 'user', content: `Generate insights for this period (${range.from} to ${range.to})` },
      { id: crypto.randomUUID(), role: 'assistant', content: '', isLoading: true },
    ]);
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-dashboard-insights', {
        body: { siteId, from: range.from, to: range.to },
      });
      const body = data as InsightsResponse | null;
      if (error || !body?.success) throw new Error(body?.error ?? error?.message ?? 'Could not generate insights');
      const items: InsightView[] = body.stored && body.stored.length > 0
        ? body.stored
        : (body.insights ?? []).map(i => ({
            insight_type: i.type, title: i.title, description: i.description,
            action_items: i.actionItems, priority: i.priority, run_id: body.runId ?? null,
          }));
      setMessages(prev => prev.map(m => m.isLoading
        ? { ...m, isLoading: false, content: insightsSummary(range.from, range.to, items), insights: items, runId: body.runId ?? null }
        : m));
    } catch (err) {
      const errorText = err instanceof Error ? err.message : 'Could not generate insights';
      setMessages(prev => prev.map(m => m.isLoading ? { ...m, content: errorText, isLoading: false, isError: true } : m));
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, siteId]);

  const clearMessages = useCallback(() => setMessages([]), []);

  return { messages, isLoading, sendMessage, generateInsights, clearMessages };
}

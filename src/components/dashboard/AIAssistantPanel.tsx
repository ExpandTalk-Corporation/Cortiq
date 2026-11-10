import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Sparkles, X, Send, RotateCcw, Loader2, AlertCircle, Lightbulb } from 'lucide-react';
import { useAIAssistant } from '@/hooks/useAIAssistant';
import { useDashboardInsights } from '@/hooks/useDashboardInsights';
import { useDashboardFilters } from '@/contexts/DashboardFiltersContext';
import { useAIAssistantPanel } from '@/contexts/AIAssistantContext';
import { InsightCard } from '@/components/dashboard/ai/InsightCard';
import type { Site } from '@/types/dashboard';
import { cn } from '@/lib/utils';

const SUGGESTED_QUESTIONS = [
  'How is my site performing this week?',
  'Which AI bots are crawling my site?',
  'What are my top pages by traffic?',
  'Where are visitors coming from?',
  'Which pages have the worst bounce rate?',
];

const TOOL_LABELS: Record<string, string> = {
  cortiq_sessions_summary: 'traffic summary',
  cortiq_daily_visitors: 'daily visitors',
  cortiq_bounce_rate: 'bounce rate',
  cortiq_top_pages: 'top pages',
  cortiq_top_sources: 'traffic sources',
  cortiq_top_entry_pages: 'entry pages',
  cortiq_top_exit_pages: 'exit pages',
  cortiq_pageviews_by_device: 'device breakdown',
  cortiq_avg_engagement_time: 'engagement time',
  cortiq_top_rage_clicks: 'rage clicks',
  cortiq_web_vitals: 'web vitals',
  cortiq_form_analytics: 'form analytics',
  cortiq_ai_agent_traffic: 'AI agent traffic',
  cortiq_ai_bot_analysis: 'bot analysis',
  cortiq_ai_agent_journey: 'AI agent journey',
  cortiq_ai_vs_human: 'AI vs human comparison',
};

interface AIAssistantPanelProps {
  selectedSite: Site;
  open: boolean;
  onClose: () => void;
}

export function AIAssistantPanel({ selectedSite, open, onClose }: AIAssistantPanelProps) {
  const { messages, isLoading, sendMessage, generateInsights, clearMessages } = useAIAssistant(selectedSite.id);
  const saved = useDashboardInsights(open ? selectedSite.id : null);
  const { filters } = useDashboardFilters();
  const { pendingAction, consumeAction } = useAIAssistantPanel();
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const period = { from: filters.from, to: filters.to };
  const runInsights = () => generateInsights(period);

  // "Generate insights for this period" from elsewhere (the Overview prompt) opens the panel with
  // a pending action; run it once.
  useEffect(() => {
    if (open && pendingAction === 'insights') {
      consumeAction();
      generateInsights({ from: filters.from, to: filters.to });
    }
  }, [open, pendingAction, consumeAction, generateInsights, filters.from, filters.to]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    await sendMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Overlay backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      {/* Slide-in panel */}
      <div
        className={cn(
          'fixed right-0 top-0 h-full w-[420px] z-50 flex flex-col',
          'bg-background border-l border-border shadow-2xl',
          'transition-transform duration-300 ease-in-out',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground font-mono">CortIQ AI</p>
              <p className="text-xs text-muted-foreground font-mono">{selectedSite.domain}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { clearMessages(); saved.fetchInsights(); }}
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                title="Clear conversation"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 px-4 py-3">
          {messages.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground font-mono text-center pt-4">
                Ask anything about your analytics data.
              </p>
              <Button onClick={runInsights} disabled={isLoading} className="w-full gap-2">
                <Lightbulb className="w-4 h-4" />
                Generate insights for this period
              </Button>
              <p className="text-[11px] text-muted-foreground font-mono text-center">
                {period.from} to {period.to} · suggestions are kept for 24 hours
              </p>
              <div className="space-y-2 pt-2">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    className="w-full text-left text-xs px-3 py-2 rounded-lg border border-border bg-card hover:bg-card-elevated transition-colors font-mono text-muted-foreground hover:text-foreground"
                  >
                    {q}
                  </button>
                ))}
              </div>
              {saved.insights.length > 0 && (
                <div className="space-y-2 pt-3">
                  <p className="text-xs font-medium text-foreground font-mono">Saved suggestions</p>
                  {saved.insights.map((i) => (
                    <InsightCard key={i.id} insight={i} onDismiss={() => saved.dismissInsight(i.id)} />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    'flex flex-col gap-1',
                    msg.role === 'user' ? 'items-end' : 'items-start',
                  )}
                >
                  {msg.role === 'user' ? (
                    <div className="max-w-[85%] px-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-mono">
                      {msg.content}
                    </div>
                  ) : (
                    <div className="max-w-[95%] space-y-1.5">
                      {msg.isLoading ? (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-card-elevated border border-border text-sm font-mono text-muted-foreground">
                          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                          <span>Analysing data...</span>
                        </div>
                      ) : (
                        <>
                          {msg.isError ? (
                            <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-destructive/10 border border-destructive/20 text-sm font-mono text-destructive">
                              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                              <span>{msg.content}</span>
                            </div>
                          ) : msg.insights ? (
                            msg.insights.length > 0 ? (
                              <div className="space-y-2">
                                {msg.insights.map((i, n) => <InsightCard key={i.id ?? n} insight={i} />)}
                              </div>
                            ) : (
                              <div className="px-3 py-2 rounded-xl bg-card-elevated border border-border text-sm font-mono text-muted-foreground">
                                {msg.content}
                              </div>
                            )
                          ) : (
                            <div className="px-3 py-2 rounded-xl bg-card-elevated border border-border text-sm font-mono text-foreground whitespace-pre-wrap leading-relaxed">
                              {msg.content}
                            </div>
                          )}
                          {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                            <div className="flex flex-wrap gap-1 px-1">
                              {msg.toolsUsed.map((tool) => (
                                <Badge
                                  key={tool}
                                  variant="secondary"
                                  className="text-[10px] font-mono py-0 h-4"
                                >
                                  {TOOL_LABELS[tool] ?? tool}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </ScrollArea>

        {/* Input */}
        <div className="px-4 py-3 border-t border-border shrink-0">
          {messages.length > 0 && (
            <button
              onClick={runInsights}
              disabled={isLoading}
              className="mb-2 flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <Lightbulb className="w-3.5 h-3.5" />
              Generate insights for this period ({period.from} to {period.to})
            </button>
          )}
          <div className="flex gap-2 items-end">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your data..."
              className="resize-none text-sm font-mono min-h-[40px] max-h-[120px]"
              rows={1}
              disabled={isLoading}
            />
            <Button
              size="sm"
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="h-10 w-10 p-0 shrink-0"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground font-mono mt-1.5 text-center">
            Enter to send · Shift+Enter for new line
          </p>
        </div>
      </div>
    </>
  );
}

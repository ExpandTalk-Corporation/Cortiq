// One AI insight with its verify path: priority, actions, the "verify against the sources"
// note and a Sources toggle that shows the agent_runs record (tables, row counts, model).
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Database, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export interface InsightView {
  id?: string;
  insight_type: string;
  title: string;
  description: string;
  action_items: unknown;
  priority: string;
  created_at?: string;
  run_id?: string | null;
}

interface AgentRun {
  id: string;
  model: string | null;
  queries_run: Array<{ table?: string; source?: string; row_count?: number; since?: string; until?: string }> | null;
  input_tokens: number | null;
  output_tokens: number | null;
  duration_ms: number | null;
}

const PRIORITY_VARIANT: Record<string, 'destructive' | 'default' | 'secondary'> = {
  high: 'destructive', medium: 'default', low: 'secondary',
};

// agent_runs rows are shared by every insight of one run; fetch each once per page load.
const runCache = new Map<string, Promise<AgentRun | null>>();
function loadRun(runId: string) {
  if (!runCache.has(runId)) {
    runCache.set(runId, (async () => {
      const { data } = await (supabase as any).from('agent_runs')
        .select('id, model, queries_run, input_tokens, output_tokens, duration_ms').eq('id', runId).maybeSingle();
      return (data as AgentRun | null) ?? null;
    })());
  }
  return runCache.get(runId)!;
}

export function InsightCard({ insight, onDismiss }: { insight: InsightView; onDismiss?: () => void }) {
  const [showSources, setShowSources] = useState(false);
  const [run, setRun] = useState<AgentRun | null | undefined>(undefined);
  const actions = Array.isArray(insight.action_items) ? (insight.action_items as unknown[]).filter((a): a is string => typeof a === 'string') : [];

  const toggleSources = async () => {
    if (!insight.run_id) return;
    setShowSources((v) => !v);
    if (run === undefined) setRun(await loadRun(insight.run_id));
  };

  return (
    <div className="rounded-lg border border-border bg-card p-3 text-sm">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="font-semibold text-sm">{insight.title}</h4>
          <Badge variant={PRIORITY_VARIANT[insight.priority] ?? 'default'} className="text-[10px] py-0 h-4">{insight.priority}</Badge>
          <Badge variant="outline" className="text-[10px] py-0 h-4">{insight.insight_type}</Badge>
        </div>
        {onDismiss && (
          <Button variant="ghost" size="sm" onClick={onDismiss} className="h-6 w-6 p-0" title="Dismiss">
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-2 whitespace-pre-wrap">{insight.description}</p>
      {actions.length > 0 && (
        <div>
          <p className="text-xs font-medium mb-1">Recommended actions:</p>
          <ul className="text-xs text-muted-foreground space-y-0.5 list-disc pl-4">
            {actions.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </div>
      )}
      <div className="flex justify-between items-center mt-2 pt-2 border-t border-border gap-2">
        <span className="text-[11px] text-muted-foreground">AI suggestion — verify against the sources</span>
        <div className="flex items-center gap-3 shrink-0">
          {insight.run_id && (
            <button onClick={toggleSources} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
              <Database className="h-3 w-3" />
              {showSources ? 'Hide sources' : 'Sources'}
            </button>
          )}
          {insight.created_at && (
            <span className="text-[11px] text-muted-foreground">{new Date(insight.created_at).toLocaleDateString('sv-SE')}</span>
          )}
        </div>
      </div>
      {showSources && insight.run_id && (
        <div className="mt-2 rounded bg-muted/40 px-2 py-1.5 text-[11px] space-y-1">
          {run === undefined && <span className="text-muted-foreground">Loading...</span>}
          {run === null && <span className="text-muted-foreground">Source record not available.</span>}
          {run && (
            <>
              {run.queries_run && run.queries_run.length > 0 && (
                <div>
                  <span className="font-medium text-foreground">Data: </span>
                  <span className="text-muted-foreground">
                    {run.queries_run.map((q) => `${q.table ?? q.source}${q.row_count !== undefined ? ` (${q.row_count})` : ''}`).join(', ')}
                  </span>
                </div>
              )}
              {run.queries_run?.[0]?.since && (
                <div className="text-muted-foreground">
                  Period: {run.queries_run[0].since?.slice(0, 10)} to {run.queries_run[0].until?.slice(0, 10)}
                </div>
              )}
              <div className="text-muted-foreground">
                {run.model && <span>{run.model}</span>}
                {((run.input_tokens ?? 0) + (run.output_tokens ?? 0)) > 0 && <span> · {((run.input_tokens ?? 0) + (run.output_tokens ?? 0)).toLocaleString()} tokens</span>}
                {run.duration_ms ? <span> · {run.duration_ms}ms</span> : null}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

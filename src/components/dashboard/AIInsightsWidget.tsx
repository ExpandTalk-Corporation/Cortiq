import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useDashboardInsights } from '@/hooks/useDashboardInsights';
import { Brain, Sparkles, X, RefreshCw, Database } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface AgentRun {
  id: string;
  function_name: string;
  model: string | null;
  queries_run: Array<{ table?: string; source?: string; row_count?: number; time_range_days?: number }> | null;
  data_snapshot: Record<string, unknown> | null;
  input_tokens: number | null;
  output_tokens: number | null;
  duration_ms: number | null;
  completed_at: string | null;
}

interface AIInsightsWidgetProps {
  siteId: string;
}

export function AIInsightsWidget({ siteId }: AIInsightsWidgetProps) {
  const {
    insights,
    loading,
    error,
    generating,
    generateInsights,
    dismissInsight,
    getPriorityColor,
    getTypeIcon,
    hasInsights,
    highPriorityCount
  } = useDashboardInsights(siteId);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [fetchedRuns, setFetchedRuns] = useState<Record<string, AgentRun | null>>({});

  const toggleSources = async (insightId: string, runId: string | null | undefined) => {
    if (!runId) return;
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(insightId) ? next.delete(insightId) : next.add(insightId);
      return next;
    });
    if (!(runId in fetchedRuns)) {
      const { data } = await (supabase as any).from('agent_runs').select('*').eq('id', runId).single();
      setFetchedRuns(prev => ({ ...prev, [runId]: data }));
    }
  };

  const handleGenerateInsights = async () => {
    try {
      const result = await generateInsights();
      toast.success(`Generated ${result.insights?.length || 0} new insights!`);
    } catch (err) {
      toast.error('Could not generate insights. Please try again later.');
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Brain className="h-5 w-5" />
            <CardTitle>AI Insights</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Brain className="h-5 w-5" />
            <CardTitle>AI Insights</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertDescription>
              Could not load insights: {error}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Brain className="h-5 w-5" />
            <CardTitle>AI Insights</CardTitle>
            {highPriorityCount > 0 && (
              <Badge variant="destructive">{highPriorityCount} high priority</Badge>
            )}
          </div>
          <Button 
            onClick={handleGenerateInsights}
            disabled={generating}
            size="sm"
            variant="outline"
          >
            {generating ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {generating ? 'Generating...' : 'Generate new'}
          </Button>
        </div>
        <CardDescription>
          Automatically generated recommendations based on your data
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!hasInsights ? (
          <div className="text-center py-8">
            <Brain className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground mb-4">
              No insights available yet
            </p>
            <Button onClick={handleGenerateInsights} disabled={generating}>
              {generating ? (
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              Generate insights
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {insights.slice(0, 3).map((insight) => (
              <div key={insight.id} className="border rounded-lg p-4 relative">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <span className="text-lg">{getTypeIcon(insight.insight_type)}</span>
                    <h4 className="font-semibold text-sm">{insight.title}</h4>
                    <Badge variant={getPriorityColor(insight.priority) as any}>
                      {insight.priority}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => dismissInsight(insight.id)}
                    className="h-6 w-6 p-0"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
                
                <p className="text-sm text-muted-foreground mb-3">
                  {insight.description}
                </p>
                
                {insight.action_items && insight.action_items.length > 0 && (
                  <div>
                    <p className="text-xs font-medium mb-1">Recommended actions:</p>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      {insight.action_items.map((action, index) => (
                        <li key={index} className="flex items-start space-x-1">
                          <span>•</span>
                          <span>{action}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                <div className="flex justify-between items-center mt-3 pt-2 border-t">
                  <span className="text-xs text-muted-foreground">
                    AI suggestion — verify against the sources
                  </span>
                  <div className="flex items-center gap-3">
                    {insight.run_id && (
                      <button
                        onClick={() => toggleSources(insight.id, insight.run_id)}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Database className="h-3 w-3" />
                        {expandedIds.has(insight.id) ? 'Hide sources' : 'Sources'}
                      </button>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {new Date(insight.created_at).toLocaleDateString('sv-SE')}
                    </span>
                  </div>
                </div>

                {expandedIds.has(insight.id) && insight.run_id && (
                  <div className="mt-2 rounded bg-muted/40 px-3 py-2 text-xs space-y-1">
                    {!(insight.run_id in fetchedRuns) && (
                      <span className="text-muted-foreground">Loading...</span>
                    )}
                    {insight.run_id in fetchedRuns && fetchedRuns[insight.run_id] && (() => {
                      const run = fetchedRuns[insight.run_id]!;
                      const totalTokens = (run.input_tokens ?? 0) + (run.output_tokens ?? 0);
                      return (
                        <>
                          {run.queries_run && run.queries_run.length > 0 && (
                            <div>
                              <span className="font-medium text-foreground">Data: </span>
                              <span className="text-muted-foreground">
                                {run.queries_run.map((q, i) => (
                                  `${q.table ?? q.source}${q.row_count !== undefined ? ` (${q.row_count})` : ''}${i < run.queries_run!.length - 1 ? ', ' : ''}`
                                )).join('')}
                              </span>
                            </div>
                          )}
                          <div className="text-muted-foreground">
                            {run.model && <span>{run.model}</span>}
                            {totalTokens > 0 && <span> · {totalTokens.toLocaleString()} tokens</span>}
                            {run.duration_ms && <span> · {run.duration_ms}ms</span>}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            ))}
            
            {insights.length > 3 && (
              <p className="text-center text-sm text-muted-foreground">
                +{insights.length - 3} more insights available
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

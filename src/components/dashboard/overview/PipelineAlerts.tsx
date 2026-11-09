// src/components/dashboard/overview/PipelineAlerts.tsx
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { PIPELINES, alertSentence, type Pipeline, type PipelineAlert } from '../../../../supabase/functions/_shared/pipeline-alerts.ts';

/** Open alerts from the hourly pipeline-freshness check (pipelines that went silent). */
export function PipelineAlerts({ siteId }: { siteId: string }) {
  const { data } = useQuery({
    queryKey: ['pipeline-alerts', siteId],
    queryFn: async (): Promise<PipelineAlert[]> => {
      // pipeline_alerts is newer than the generated types.
      const { data, error } = await (supabase as unknown as { from: (t: string) => any })
        .from('pipeline_alerts')
        .select('id, site_id, pipeline, last_seen_at, expected, opened_at, resolved_at')
        .eq('site_id', siteId)
        .is('resolved_at', null)
        .order('opened_at');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });
  if (!data?.length) return null;
  return (
    <div role="alert" className="space-y-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 text-sm">
      {data.map((a) => (
        <div key={a.id} className="flex gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
          <div>
            <p className="font-medium">{alertSentence(a)}</p>
            <p className="text-muted-foreground">{PIPELINES[a.pipeline as Pipeline]?.check}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

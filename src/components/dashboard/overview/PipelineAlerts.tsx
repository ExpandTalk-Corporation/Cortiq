// src/components/dashboard/overview/PipelineAlerts.tsx
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { PIPELINES, alertSentence, type Pipeline, type PipelineAlert } from '../../../../supabase/functions/_shared/pipeline-alerts.ts';
import { UPTIME_KINDS, hostOf, uptimeSentence, type UptimeAlert, type UptimeKind } from '../../../../supabase/functions/_shared/uptime.ts';

/**
 * Open alerts from the 5-minute uptime check (site down, snippet gone) and the hourly pipeline-freshness
 * check (pipelines that went silent).
 * showAllClear renders a one-line "all clear" instead of nothing (used on the Alerts tab).
 */
export function PipelineAlerts({ siteId, showAllClear = false }: { siteId: string; showAllClear?: boolean }) {
  const { data, isSuccess } = useQuery({
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
  const { data: uptime } = useQuery({
    queryKey: ['uptime-alerts', siteId],
    queryFn: async (): Promise<(UptimeAlert & { sites: { domain: string } | null })[]> => {
      // uptime_alerts is newer than the generated types.
      const { data, error } = await (supabase as unknown as { from: (t: string) => any })
        .from('uptime_alerts')
        .select('id, site_id, kind, detail, opened_at, resolved_at, sites(domain)')
        .eq('site_id', siteId)
        .is('resolved_at', null)
        .order('opened_at');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
  const uptimeBox = uptime?.length ? (
    <div role="alert" className="space-y-2 rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-sm">
      {uptime.map((a) => (
        <div key={a.id} className="flex gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
          <div>
            <p className="font-medium">{uptimeSentence(a, hostOf(a.sites?.domain ?? ''))}</p>
            <p className="text-muted-foreground">{UPTIME_KINDS[a.kind as UptimeKind]?.check}</p>
          </div>
        </div>
      ))}
    </div>
  ) : null;
  if (!data?.length) {
    if (uptimeBox) return uptimeBox;
    if (!showAllClear || !isSuccess) return null;
    return (
      <div className="flex gap-2 rounded-lg border p-4 text-sm text-muted-foreground">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" aria-hidden="true" />
        <p>Site up and data arriving. Uptime is checked every 5 minutes, data pipelines every hour.</p>
      </div>
    );
  }
  return (
    <>
      {uptimeBox}
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
    </>
  );
}

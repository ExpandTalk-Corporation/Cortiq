import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '@/integrations/supabase/client';
import type { Finding, Mode, PolicyTemplate } from '../../supabase/functions/_shared/tracking-check/types.ts';
import type { ReportSummary } from '../../supabase/functions/_shared/tracking-check/report.ts';
import type { SuggestedPage } from '../../supabase/functions/_shared/tracking-check/pages.ts';

// The generated Supabase types do not include the tracking_check_* tables yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (table: string) => any };

export type RunStatus = 'running' | 'assessing' | 'done' | 'failed';
export interface RunRow {
  id: string; mode: Mode; baseline_url: string | null; target_url: string; status: RunStatus; error: string | null;
  summary: ReportSummary | null; pages: { pages: string[]; legacy: string[] }; policy: PolicyTemplate | null;
  share_token: string | null; share_expires_at: string | null; created_at: string; finished_at: string | null;
}
export interface FindingRow extends Finding { id?: string; verifiedAt: string | null }
export interface Progress { total: number; done: number; failed: number; running: number; pending: number }
export interface CreateRunInput {
  mode: Mode; baselineUrl?: string; targetUrl: string; pages: string[]; legacyPaths: string[];
  policy?: PolicyTemplate; basicAuth?: { username: string; password: string } | null;
}
export interface SharedReport {
  run: { mode: Mode; baselineUrl: string | null; targetUrl: string; finishedAt: string; summary: ReportSummary };
  findings: FindingRow[];
}

// Explicit columns: auth_ciphertext is not readable by clients, so select('*') fails.
const RUN_COLUMNS = 'id, mode, baseline_url, target_url, status, error, summary, pages, policy, share_token, share_expires_at, created_at, finished_at';
const FINDING_COLUMNS = 'id, scope, check_key, title, status, priority, explanation, fix, typical_owner, evidence, verified_at, sort_order';

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('tracking-check-start', { body });
  if (error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const detail = await (error as any).context?.json?.().catch(() => null);
    throw new Error(detail?.error ?? error.message);
  }
  return data as T;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toFinding = (r: any): FindingRow => ({
  id: r.id, scope: r.scope, checkKey: r.check_key, title: r.title, status: r.status, priority: r.priority,
  explanation: r.explanation, fix: r.fix, typicalOwner: r.typical_owner, evidence: r.evidence, verifiedAt: r.verified_at,
});

export const useTrackingCheckAccess = () =>
  useQuery({ queryKey: ['tracking-check', 'access'], queryFn: () => call<{ allowed: boolean }>({ action: 'access' }), staleTime: 5 * 60_000 });

export const useSuggestPages = () =>
  useMutation({ mutationFn: (url: string) => call<{ pages: SuggestedPage[] }>({ action: 'suggest', url }) });

export function useCreateRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRunInput) => call<{ runId: string }>({ action: 'create', ...input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tracking-check', 'runs'] }),
  });
}

export const useRuns = () => useQuery({
  queryKey: ['tracking-check', 'runs'],
  queryFn: async (): Promise<RunRow[]> => {
    const { data, error } = await db.from('tracking_check_runs').select(RUN_COLUMNS).order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    return data ?? [];
  },
});

export const useRun = (runId: string) => useQuery({
  queryKey: ['tracking-check', 'run', runId],
  queryFn: async (): Promise<RunRow> => {
    const { data, error } = await db.from('tracking_check_runs').select(RUN_COLUMNS).eq('id', runId).single();
    if (error) throw error;
    return data;
  },
});

export function useRunStatus(runId: string, enabled: boolean) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ['tracking-check', 'status', runId],
    enabled,
    queryFn: async () => {
      const s = await call<{ status: RunStatus; progress: Progress }>({ action: 'status', runId });
      if (s.status === 'done' || s.status === 'failed') await qc.invalidateQueries({ queryKey: ['tracking-check', 'run', runId] });
      return s;
    },
    refetchInterval: (q) => (q.state.data && (q.state.data.status === 'done' || q.state.data.status === 'failed') ? false : 3000),
  });
}

export const useFindings = (runId: string, enabled: boolean) => useQuery({
  queryKey: ['tracking-check', 'findings', runId],
  enabled,
  queryFn: async (): Promise<FindingRow[]> => {
    const { data, error } = await db.from('tracking_check_findings').select(FINDING_COLUMNS).eq('run_id', runId).order('sort_order');
    if (error) throw error;
    return (data ?? []).map(toFinding);
  },
});

export function useShareRun(runId: string) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['tracking-check', 'run', runId] });
  return {
    share: useMutation({ mutationFn: (expiresInDays: number | null) => call<{ token: string }>({ action: 'share', runId, expiresInDays }), onSuccess: refresh }),
    revoke: useMutation({ mutationFn: () => call<{ ok: true }>({ action: 'revoke', runId }), onSuccess: refresh }),
  };
}

export function useVerifyFinding(runId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, verified, email }: { id: string; verified: boolean; email: string | null }) => {
      const { error } = await db.from('tracking_check_findings')
        .update(verified ? { verified_by: email, verified_at: new Date().toISOString() } : { verified_by: null, verified_at: null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tracking-check', 'findings', runId] }),
  });
}

export async function fetchSharedReport(token: string): Promise<SharedReport> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/tracking-check-report?token=${encodeURIComponent(token)}`, { headers: { apikey: SUPABASE_PUBLISHABLE_KEY } });
  if (!res.ok) throw new Error('This report link is invalid or has expired.');
  return res.json();
}

export const shareUrl = (token: string) => `${window.location.origin}/tracking-check/r/${token}`;

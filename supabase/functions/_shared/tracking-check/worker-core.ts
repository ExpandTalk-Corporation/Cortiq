// Queue processing for Tracking Check, independent of Supabase so it can be tested with a fake store.
import { assess } from './assess/index.ts';
import { summarize, type ReportSummary } from './report.ts';
import { vendorMatrix } from './vendor-matrix.ts';
import { diffRuns, hasNewProblems, type DiffFinding } from './diff.ts';
import type { VendorRow } from './report.ts';
import type {
  BasicAuth, BrowserObservation, ConsentState, FetchObservation, Finding, Mode, PageObservation, PolicyTemplate, SiteObservation, SiteRole,
} from './types.ts';

export interface TaskRow {
  id: string; run_id: string; site_role: SiteRole; path: string; kind: 'fetch' | 'browser'; legacy: boolean;
  attempts: number; status: 'pending' | 'running' | 'done' | 'failed'; error: string | null;
}
export interface RunRow {
  id: string; mode: Mode; baseline_url: string | null; target_url: string; policy: PolicyTemplate | null; auth_ciphertext: string | null;
  /** Set on runs that belong to a schedule (the source run and every scheduled rerun). */
  schedule_id?: string | null;
  trigger?: 'manual' | 'scheduled';
}
/** The previous finished run of the same schedule, for summary.diff. */
export interface PreviousRun { id: string; finishedAt: string | null; findings: DiffFinding[]; vendors: VendorRow[] | null }
export interface TaskResult { task: TaskRow; data: FetchObservation | BrowserObservation | null }

export interface TrackingCheckStore {
  recoverStale(olderThanSeconds: number): Promise<void>;
  claimTasks(kind: 'fetch' | 'browser', limit: number): Promise<TaskRow[]>;
  getRun(runId: string): Promise<RunRow>;
  saveObservation(task: TaskRow, data: FetchObservation | BrowserObservation): Promise<void>;
  completeTask(taskId: string): Promise<void>;
  failTask(taskId: string, error: string, retry: boolean): Promise<void>;
  runsToFinalize(): Promise<string[]>;
  beginAssessing(runId: string): Promise<boolean>;
  loadResults(runId: string): Promise<TaskResult[]>;
  saveResults(runId: string, findings: Finding[], summary: ReportSummary): Promise<void>;
  failRun(runId: string, error: string): Promise<void>;
  hasPendingWork(): Promise<boolean>;
  /** Scheduled runs only. Optional so stores without schedules keep working. */
  previousRun?(run: RunRow): Promise<PreviousRun | null>;
  recordScheduleAlert?(scheduleId: string, runId: string): Promise<void>;
}

export interface Probes {
  fetchProbe(url: string, auth: BasicAuth | null): Promise<FetchObservation>;
  browserProbe(url: string, states: ConsentState[], auth: BasicAuth | null): Promise<BrowserObservation>;
  openAuth(ciphertext: string): Promise<BasicAuth>;
}

export const MAX_ATTEMPTS = 3;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function statesFor(mode: Mode): ConsentState[] {
  return mode === 'policy' ? ['none', 'reject', 'accept', 'analytics_only', 'marketing_only'] : ['none', 'reject', 'accept'];
}

export function pageUrl(run: RunRow, task: TaskRow): string {
  return new URL(task.path, task.site_role === 'baseline' ? run.baseline_url! : run.target_url).toString();
}

export async function processBatch(store: TrackingCheckStore, probes: Probes, limits = { fetch: 8, browser: 1 }) {
  await store.recoverStale(300);
  let tasks = await store.claimTasks('fetch', limits.fetch);
  if (!tasks.length) tasks = await store.claimTasks('browser', limits.browser);

  const runs = new Map<string, RunRow>();
  const auths = new Map<string, BasicAuth | null>();
  for (const task of tasks) {
    try {
      let run = runs.get(task.run_id);
      if (!run) { run = await store.getRun(task.run_id); runs.set(run.id, run); }
      if (!auths.has(run.id)) auths.set(run.id, run.auth_ciphertext ? await probes.openAuth(run.auth_ciphertext) : null);
      const auth = auths.get(run.id) ?? null;
      const url = pageUrl(run, task);
      const data = task.kind === 'fetch' ? await probes.fetchProbe(url, auth) : await probes.browserProbe(url, statesFor(run.mode), auth);
      await store.saveObservation(task, data);
      await store.completeTask(task.id);
    } catch (e) {
      await store.failTask(task.id, message(e), task.attempts < MAX_ATTEMPTS);
    }
  }

  const finalized: string[] = [];
  for (const runId of await store.runsToFinalize()) {
    if (!(await store.beginAssessing(runId))) continue;
    try {
      const run = await store.getRun(runId);
      const { target, baseline } = buildSites(run, await store.loadResults(runId));
      const findings = assess({ mode: run.mode, target, baseline, policy: run.policy });
      const summary: ReportSummary = { ...summarize(findings, run.mode, run.policy), vendors: vendorMatrix(target, findings) };
      const diff = await scheduleDiff(store, run, findings, summary.vendors ?? null);
      if (diff) summary.diff = diff;
      await store.saveResults(runId, findings, summary);
      if (diff && run.schedule_id && run.trigger === 'scheduled' && hasNewProblems(diff) && store.recordScheduleAlert) {
        // The report is saved; a failed notice must not fail the run.
        try { await store.recordScheduleAlert(run.schedule_id, runId); } catch (e) { console.error('tracking-check alert', message(e)); }
      }
      finalized.push(runId);
    } catch (e) {
      await store.failRun(runId, message(e));
    }
  }
  return { processed: tasks.length, finalized, more: await store.hasPendingWork() };
}

// Compares a run that belongs to a schedule with the previous finished run of that schedule. A failed
// lookup leaves the diff out instead of failing the run.
async function scheduleDiff(store: TrackingCheckStore, run: RunRow, findings: Finding[], vendors: VendorRow[] | null) {
  if (!run.schedule_id || !store.previousRun) return null;
  try {
    const previous = await store.previousRun(run);
    return previous ? diffRuns({ findings, vendors }, previous) : null;
  } catch (e) {
    console.error('tracking-check diff', message(e));
    return null;
  }
}

export function buildSites(run: RunRow, results: TaskResult[]): { target: SiteObservation; baseline: SiteObservation | null } {
  const byRole = new Map<SiteRole, Map<string, PageObservation>>();
  for (const { task, data } of results) {
    if (!byRole.has(task.site_role)) byRole.set(task.site_role, new Map());
    const pages = byRole.get(task.site_role)!;
    const key = `${task.legacy ? 'legacy:' : ''}${task.path}`;
    const page = pages.get(key) ?? { path: task.path, legacy: task.legacy, fetch: null, browser: null, failed: null };
    if (!data) page.failed = task.error ?? 'No result';
    else if (task.kind === 'fetch') page.fetch = data as FetchObservation;
    else page.browser = data as BrowserObservation;
    pages.set(key, page);
  }
  const site = (role: SiteRole, url: string): SiteObservation => ({ role, origin: new URL(url).origin, pages: [...(byRole.get(role)?.values() ?? [])] });
  return {
    target: site('target', run.target_url),
    baseline: run.mode === 'comparison' && run.baseline_url ? site('baseline', run.baseline_url) : null,
  };
}

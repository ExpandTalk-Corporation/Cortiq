// TrackingCheckStore backed by supabase-js with the service role.
import type { TaskRow, TrackingCheckStore } from '../_shared/tracking-check/worker-core.ts';

// deno-lint-ignore no-explicit-any
type Db = any;
const check = <T>(res: { data: T; error: unknown }): T => { if (res.error) throw res.error; return res.data; };
const TASK_COLUMNS = 'id, run_id, site_role, path, kind, legacy, attempts, status, error';

export function createStore(db: Db): TrackingCheckStore {
  return {
    async recoverStale(seconds) { check(await db.rpc('tracking_check_recover_stale', { p_seconds: seconds })); },
    async claimTasks(kind, limit) { return (check(await db.rpc('tracking_check_claim_tasks', { p_kind: kind, p_limit: limit })) ?? []) as TaskRow[]; },
    async getRun(runId) {
      const run = check(await db.from('tracking_check_runs').select('id, mode, baseline_url, target_url, policy, auth_ciphertext, auth_expires_at').eq('id', runId).single());
      const expired = run.auth_expires_at && Date.parse(run.auth_expires_at) < Date.now();
      return { id: run.id, mode: run.mode, baseline_url: run.baseline_url, target_url: run.target_url, policy: run.policy, auth_ciphertext: expired ? null : run.auth_ciphertext };
    },
    async saveObservation(task, data) {
      check(await db.from('tracking_check_observations').upsert({ run_id: task.run_id, task_id: task.id, data }, { onConflict: 'task_id' }));
    },
    async completeTask(id) { check(await db.from('tracking_check_tasks').update({ status: 'done', error: null }).eq('id', id)); },
    async failTask(id, error, retry) {
      check(await db.from('tracking_check_tasks').update({ status: retry ? 'pending' : 'failed', error: error.slice(0, 500) }).eq('id', id));
    },
    async runsToFinalize() {
      const rows: unknown[] = check(await db.rpc('tracking_check_runs_to_finalize')) ?? [];
      return rows.map((r) => (typeof r === 'string' ? r : (r as Record<string, string>).tracking_check_runs_to_finalize));
    },
    async beginAssessing(runId) {
      const rows = check(await db.from('tracking_check_runs').update({ status: 'assessing' }).eq('id', runId).eq('status', 'running').select('id'));
      return (rows ?? []).length === 1;
    },
    async loadResults(runId) {
      const tasks: TaskRow[] = check(await db.from('tracking_check_tasks').select(TASK_COLUMNS).eq('run_id', runId)) ?? [];
      const obs: { task_id: string; data: unknown }[] = check(await db.from('tracking_check_observations').select('task_id, data').eq('run_id', runId)) ?? [];
      const byTask = new Map(obs.map((o) => [o.task_id, o.data]));
      // deno-lint-ignore no-explicit-any
      return tasks.map((task) => ({ task, data: task.status === 'done' ? (byTask.get(task.id) as any) ?? null : null }));
    },
    async saveResults(runId, findings, summary) {
      if (findings.length) {
        check(await db.from('tracking_check_findings').insert(findings.map((f, i) => ({
          run_id: runId, sort_order: i, scope: f.scope, check_key: f.checkKey, title: f.title, status: f.status, priority: f.priority,
          explanation: f.explanation, fix: f.fix, typical_owner: f.typicalOwner, evidence: f.evidence,
        }))));
      }
      check(await db.from('tracking_check_runs').update({ status: 'done', summary, finished_at: new Date().toISOString(), auth_ciphertext: null, auth_expires_at: null }).eq('id', runId));
    },
    async failRun(runId, error) {
      check(await db.from('tracking_check_runs').update({ status: 'failed', error: error.slice(0, 500), finished_at: new Date().toISOString(), auth_ciphertext: null, auth_expires_at: null }).eq('id', runId));
    },
    async hasPendingWork() {
      const { count, error } = await db.from('tracking_check_tasks').select('id', { count: 'exact', head: true }).in('status', ['pending', 'running']);
      if (error) throw error;
      return (count ?? 0) > 0;
    },
  };
}

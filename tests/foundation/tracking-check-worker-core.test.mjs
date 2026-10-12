import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processBatch, buildSites, statesFor } from '../../supabase/functions/_shared/tracking-check/worker-core.ts';
import { fetchOk, st, req } from './tracking-check-fixtures.mjs';

function fakeStore(run, tasks) {
  const s = { run: { ...run }, tasks: tasks.map((t, i) => ({ id: `t${i}`, run_id: run.id, legacy: false, attempts: 0, status: 'pending', error: null, ...t })),
    observations: new Map(), results: null, failed: null, assessing: false };
  return Object.assign(s, {
    async recoverStale() {},
    async claimTasks(kind, limit) {
      const picked = s.tasks.filter((t) => t.status === 'pending' && t.kind === kind).slice(0, limit);
      for (const t of picked) { t.status = 'running'; t.attempts++; }
      return picked.map((t) => ({ ...t }));
    },
    async getRun() { return { ...s.run }; },
    async saveObservation(task, data) { s.observations.set(task.id, data); },
    async completeTask(id) { s.tasks.find((t) => t.id === id).status = 'done'; },
    async failTask(id, error, retry) { const t = s.tasks.find((x) => x.id === id); t.status = retry ? 'pending' : 'failed'; t.error = error; },
    async runsToFinalize() { return !s.assessing && s.tasks.every((t) => t.status === 'done' || t.status === 'failed') ? [s.run.id] : []; },
    async beginAssessing() { if (s.assessing) return false; s.assessing = true; return true; },
    async loadResults() { return s.tasks.map((t) => ({ task: { ...t }, data: s.observations.get(t.id) ?? null })); },
    async saveResults(id, findings, summary) { s.results = { findings, summary }; s.run.status = 'done'; },
    async failRun(id, error) { s.failed = error; s.run.status = 'failed'; },
    async hasPendingWork() { return s.tasks.some((t) => t.status === 'pending' || t.status === 'running'); },
  });
}
const browserObs = (url) => ({ url, cmp: 'cookieyes', states: [st('none'), st('reject'), st('accept', { requests: [req('https://js.hs-scripts.com/1.js')] })], forms: [] });
async function drain(store, probes) { for (let i = 0; i < 20; i++) { const r = await processBatch(store, probes); if (!r.more) return r; } throw new Error('did not finish'); }

test('drains a comparison run: fetch tasks first, then browser tasks, then assesses once', async () => {
  const run = { id: 'r1', mode: 'comparison', baseline_url: 'https://old.example', target_url: 'https://new.example', policy: null, auth_ciphertext: null };
  const store = fakeStore(run, [
    { site_role: 'baseline', path: '/pricing/', kind: 'fetch' }, { site_role: 'target', path: '/pricing/', kind: 'fetch' },
    { site_role: 'baseline', path: '/pricing/', kind: 'browser' }, { site_role: 'target', path: '/pricing/', kind: 'browser' },
  ]);
  const calls = [];
  const probes = {
    fetchProbe: async (url) => { calls.push(['fetch', url]); return fetchOk('/pricing/'); },
    browserProbe: async (url, states) => { calls.push(['browser', url, states.join(',')]); return browserObs(url); },
    openAuth: async () => { throw new Error('no auth expected'); },
  };
  const first = await processBatch(store, probes);
  assert.equal(first.processed, 2);
  assert.deepEqual(calls.map((c) => c[0]), ['fetch', 'fetch']);
  await drain(store, probes);
  assert.deepEqual(calls.slice(2), [['browser', 'https://old.example/pricing/', 'none,reject,accept'], ['browser', 'https://new.example/pricing/', 'none,reject,accept']]);
  assert.equal(store.run.status, 'done');
  assert.ok(store.results.findings.some((f) => f.checkKey === 'tags.present' && f.status === 'pass'));
  assert.match(store.results.summary.headline, /No blocking problems/);
});

test('retries a failing probe and marks the page untestable after three attempts', async () => {
  const run = { id: 'r2', mode: 'policy', baseline_url: null, target_url: 'https://new.example', policy: null, auth_ciphertext: 'sealed' };
  const store = fakeStore(run, [{ site_role: 'target', path: '/', kind: 'fetch' }, { site_role: 'target', path: '/', kind: 'browser' }]);
  let opened = 0;
  const probes = {
    fetchProbe: async (_url, auth) => { assert.deepEqual(auth, { username: 'u', password: 'p' }); return fetchOk('/'); },
    browserProbe: async () => { throw new Error('Browserless 500'); },
    openAuth: async () => { opened++; return { username: 'u', password: 'p' }; },
  };
  await drain(store, probes);
  assert.equal(store.tasks[1].attempts, 3);
  assert.equal(store.tasks[1].status, 'failed');
  assert.ok(opened >= 1);
  const coverage = store.results.findings.find((f) => f.checkKey === 'coverage.untestable');
  assert.match(coverage.evidence.details[0], /Browserless 500/);
});

test('a finalisation error marks the run failed instead of leaving it running', async () => {
  const run = { id: 'r3', mode: 'policy', baseline_url: null, target_url: 'https://new.example', policy: null, auth_ciphertext: null };
  const store = fakeStore(run, [{ site_role: 'target', path: '/', kind: 'browser' }]);
  const probes = { fetchProbe: async () => fetchOk('/'), browserProbe: async () => ({ url: 'x', cmp: null, states: null, forms: [] }), openAuth: async () => null };
  await drain(store, probes);
  assert.equal(store.run.status, 'failed');
  assert.ok(store.failed);
});

test('buildSites groups tasks by role and path and keeps legacy pages separate', () => {
  const run = { id: 'r', mode: 'comparison', baseline_url: 'https://old.example', target_url: 'https://new.example', policy: null, auth_ciphertext: null };
  const t = (id, site_role, path, kind, extra = {}) => ({ id, run_id: 'r', site_role, path, kind, legacy: false, attempts: 1, status: 'done', error: null, ...extra });
  const { target, baseline } = buildSites(run, [
    { task: t('1', 'target', '/', 'fetch'), data: fetchOk('/') },
    { task: t('2', 'target', '/', 'browser', { status: 'failed', error: 'timeout' }), data: null },
    { task: t('3', 'target', '/', 'fetch', { legacy: true }), data: fetchOk('/') },
    { task: t('4', 'baseline', '/', 'fetch'), data: fetchOk('/') },
  ]);
  assert.equal(target.pages.length, 2);
  const home = target.pages.find((p) => !p.legacy);
  assert.equal(home.failed, 'timeout');
  assert.ok(home.fetch);
  assert.equal(baseline.origin, 'https://old.example');
  assert.deepEqual(statesFor('policy'), ['none', 'reject', 'accept', 'analytics_only', 'marketing_only']);
});

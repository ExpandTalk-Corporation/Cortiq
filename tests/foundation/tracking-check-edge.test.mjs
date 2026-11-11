import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEdge, compileEdgeSource } from './edge-harness.mjs';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ENV = {
  SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service',
  TRACKING_CHECK_ALLOWED_EMAILS: 'Daniel@Expandtalk.se, other@example.com', TRACKING_CHECK_WORKER_SECRET: 's3cret',
  TRACKING_CHECK_AUTH_KEY: Buffer.alloc(32, 7).toString('base64'), BROWSERLESS_API_KEY: 'bl', BROWSERLESS_URL: 'https://bl.example', TRACKING_CHECK_PUBLIC: 'true',
};

function mockClient({ user = { id: A, email: 'daniel@expandtalk.se', email_confirmed_at: '2026-01-01T00:00:00Z' }, runsToday = 0, run = null, tasks = [], findings = [], pendingCount = 0,
  taskInsertError = null, runError = null, findingsError = null, schedule = null, activeSchedules = 0, rpcResult = () => [] } = {}) {
  const calls = { inserts: [], updates: [], deletes: [], rpc: [], counts: [] };
  const client = {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    rpc: async (name, args) => { calls.rpc.push([name, args]); return { data: rpcResult(name, args), error: null }; },
    from(table) {
      const op = { table, type: 'select', head: false, filters: [] };
      const result = () => {
        if (op.head) {
          calls.counts.push({ table, filters: op.filters });
          return { count: table === 'tracking_check_runs' ? runsToday : table === 'tracking_check_tasks' ? pendingCount : table === 'tracking_check_schedules' ? activeSchedules : 0, error: null };
        }
        if (op.type === 'insert' && table === 'tracking_check_tasks' && taskInsertError) return { data: null, error: taskInsertError };
        if (op.type !== 'select') return { data: op.returning ? [{ id: 'x' }] : null, error: null };
        if (table === 'tracking_check_tasks') return { data: tasks, error: null };
        if (table === 'tracking_check_findings') return findingsError ? { data: null, error: findingsError } : { data: findings, error: null };
        return { data: [], error: null };
      };
      const q = {
        select(_cols, opts) { if (opts?.head) op.head = true; if (op.type !== 'select') op.returning = true; return q; },
        insert(payload) { op.type = 'insert'; calls.inserts.push({ table, payload }); return q; },
        update(payload) { op.type = 'update'; calls.updates.push({ table, payload, filters: op.filters }); return q; },
        upsert(payload) { op.type = 'upsert'; calls.inserts.push({ table, payload }); return q; },
        delete() { op.type = 'delete'; calls.deletes.push({ table, filters: op.filters }); return q; },
        eq(k, v) { op.filters.push([k, v]); return q; },
        gte() { return q; }, in() { return q; }, order() { return q; }, limit() { return q; },
        single: async () => ({ data: op.type === 'insert' ? { id: table === 'tracking_check_schedules' ? 'sched-1' : 'run-1' } : run, error: null }),
        maybeSingle: async () => (table === 'tracking_check_schedules' ? { data: schedule, error: null }
          : runError ? { data: null, error: runError } : { data: run, error: null }),
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
      };
      return q;
    },
  };
  return { client, calls };
}

function edge(name, db, { env = ENV } = {}) {
  const fetches = [];
  const fetch = async (url, init = {}) => { fetches.push({ url: String(url), headers: init.headers ?? {} }); return new Response(null, { status: 202 }); };
  return { handler: loadEdge(name, db.client, { env, fetch }), fetches };
}
const post = (handler, body) => handler(new Request('https://x.example/', { method: 'POST', headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
const createBody = (extra = {}) => ({ action: 'create', mode: 'comparison', baselineUrl: 'https://old.example/some/path', targetUrl: 'https://new.example', pages: ['/', 'pricing/'], legacyPaths: ['/product/'], ...extra });

const access = async (db) => (await post(edge('tracking-check-start', db).handler, { action: 'access' })).json();
const confirmedOutsider = () => mockClient({ user: { id: A, email: 'someone@else.com', email_confirmed_at: '2026-01-01T00:00:00Z' } });

test('start: any confirmed user may run; the allowlist gets the full quota', async () => {
  assert.equal((await post(edge('tracking-check-start', mockClient({ user: null })).handler, { action: 'access' })).status, 401);
  assert.deepEqual(await access(mockClient({ runsToday: 4 })), { allowed: true, tier: 'full', preview: false, confirmed: true, limits: { runsPerDay: 10, policyPages: 15, comparisonPages: 25 }, runsToday: 4, schedules: { max: 20, active: 0 } });
  assert.deepEqual(await access(confirmedOutsider()), { allowed: true, tier: 'standard', preview: false, confirmed: true, limits: { runsPerDay: 3, policyPages: 5, comparisonPages: 5 }, runsToday: 0, schedules: { max: 5, active: 0 } });
  assert.equal((await post(edge('tracking-check-start', confirmedOutsider()).handler, createBody())).status, 200);
});

test('start: the standard quota caps pages and runs per day', async () => {
  const sixPages = ['/', '/a/', '/b/', '/c/', '/d/', '/e/'];
  assert.equal((await post(edge('tracking-check-start', confirmedOutsider()).handler, createBody({ pages: sixPages }))).status, 400);
  assert.equal((await post(edge('tracking-check-start', mockClient()).handler, createBody({ pages: sixPages }))).status, 200);
  const capped = mockClient({ user: { id: A, email: 'someone@else.com', email_confirmed_at: '2026-01-01T00:00:00Z' }, runsToday: 3 });
  const res = await post(edge('tracking-check-start', capped).handler, createBody());
  assert.equal(res.status, 429);
  assert.match((await res.json()).error, /info@expandtalk\.se/);
});

test('start: validates URLs, page caps and the daily limit', async () => {
  const { handler } = edge('tracking-check-start', mockClient());
  assert.equal((await post(handler, null)).status, 400);
  const blocked = await post(handler, createBody({ targetUrl: 'http://169.254.169.254' }));
  assert.equal(blocked.status, 400);
  assert.match((await blocked.json()).error, /Blocked host/);
  assert.equal((await post(handler, createBody({ pages: Array.from({ length: 26 }, (_, i) => `/p${i}`) }))).status, 400);
  assert.equal((await post(handler, createBody({ mode: 'policy', baselineUrl: undefined, pages: Array.from({ length: 16 }, (_, i) => `/p${i}`) }))).status, 400);
  assert.equal((await post(handler, createBody({ pages: [] }))).status, 400);
  assert.equal((await post(edge('tracking-check-start', mockClient({ runsToday: 10 })).handler, createBody())).status, 429);
});

test('start: basic auth is refused while the hosted browser has no EU processor agreement', async () => {
  const db = mockClient();
  const { handler } = edge('tracking-check-start', db);
  const res = await post(handler, createBody({ basicAuth: { username: 'stage', password: 'pw-secret' } }));
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /basic auth/);
  assert.equal(db.calls.inserts.length, 0);
});

test('start: create stores the run, one task per page/site/kind plus legacy and kicks the worker', async () => {
  const db = mockClient();
  const { handler, fetches } = edge('tracking-check-start', db);
  const res = await post(handler, createBody());
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { runId: 'run-1' });
  const run = db.calls.inserts.find((i) => i.table === 'tracking_check_runs').payload;
  assert.equal(run.baseline_url, 'https://old.example');
  assert.equal(run.user_id, A);
  assert.equal(run.auth_ciphertext, null);
  assert.deepEqual(run.pages, { pages: ['/', '/pricing/'], legacy: ['/product/'] });
  const tasks = db.calls.inserts.find((i) => i.table === 'tracking_check_tasks').payload;
  assert.equal(tasks.length, 2 * 2 * 2 + 1);
  assert.equal(tasks.filter((t) => t.legacy).length, 1);
  assert.equal(fetches[0].url, 'https://proj.supabase.co/functions/v1/tracking-check-worker');
  assert.equal(fetches[0].headers['x-worker-secret'], 's3cret');
});

test('start: status hides other users runs and re-kicks a stalled worker', async () => {
  const foreign = edge('tracking-check-start', mockClient({ run: { id: 'r', status: 'running', user_id: 'someone-else' } }));
  assert.equal((await post(foreign.handler, { action: 'status', runId: 'r' })).status, 404);
  const stalled = edge('tracking-check-start', mockClient({
    run: { id: 'r', status: 'running', user_id: A, created_at: new Date(Date.now() - 600000).toISOString() },
    tasks: [{ status: 'pending', claimed_at: null }, { status: 'done', claimed_at: new Date(Date.now() - 600000).toISOString() }] }));
  const body = await (await post(stalled.handler, { action: 'status', runId: 'r' })).json();
  assert.deepEqual(body, { status: 'running', progress: { total: 2, done: 1, failed: 0, running: 0, pending: 1 } });
  assert.equal(stalled.fetches.length, 1);
});

test('start: status does not kick a fresh run before its first claim, and ignores unknown task statuses', async () => {
  const fresh = edge('tracking-check-start', mockClient({
    run: { id: 'r', status: 'running', user_id: A, created_at: new Date().toISOString() },
    tasks: [{ status: 'pending', claimed_at: null }, { status: 'pending', claimed_at: null }, { status: 'weird', claimed_at: null }] }));
  const body = await (await post(fresh.handler, { action: 'status', runId: 'r' })).json();
  assert.deepEqual(body, { status: 'running', progress: { total: 3, done: 0, failed: 0, running: 0, pending: 2 } });
  assert.equal(fresh.fetches.length, 0);
});

test('worker: rejects calls without the secret and processes an empty queue', async () => {
  const db = mockClient();
  const { handler } = edge('tracking-check-worker', db);
  assert.equal((await handler(new Request('https://x.example/', { method: 'POST' }))).status, 401);
  assert.equal((await edge('tracking-check-worker', db, { env: { ...ENV, TRACKING_CHECK_WORKER_SECRET: '' } }).handler(
    new Request('https://x.example/', { method: 'POST', headers: { 'x-worker-secret': '' } }))).status, 401);
  const ok = await handler(new Request('https://x.example/', { method: 'POST', headers: { 'x-worker-secret': 's3cret' } }));
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).processed, 0);
  assert.ok(db.calls.rpc.some(([name]) => name === 'tracking_check_claim_tasks'));
  // Confirms processBatch ran to completion (not thrown-and-swallowed partway through,
  // which would also leave processed at 0 but never reach the finalise step).
  assert.ok(db.calls.rpc.some(([name]) => name === 'tracking_check_runs_to_finalize'));
});

test('worker: does not re-kick itself when this invocation claimed nothing, even if other tasks are still running', async () => {
  const db = mockClient({ pendingCount: 1 });
  const { handler, fetches } = edge('tracking-check-worker', db);
  const res = await handler(new Request('https://x.example/', { method: 'POST', headers: { 'x-worker-secret': 's3cret' } }));
  const body = await res.json();
  assert.equal(body.processed, 0);
  assert.equal(body.more, true);
  assert.equal(fetches.length, 0);
});

test('report: 404 for malformed, unknown or expired tokens; shared findings omit who verified them', async () => {
  const token = 'A'.repeat(43);
  const get = (h, t) => h(new Request(`https://x.example/?token=${t}`));
  assert.equal((await get(edge('tracking-check-report', mockClient()).handler, 'short')).status, 404);
  assert.equal((await get(edge('tracking-check-report', mockClient({ run: null })).handler, token)).status, 404);
  const expired = mockClient({ run: { id: 'r', status: 'done', share_expires_at: '2000-01-01T00:00:00Z' } });
  assert.equal((await get(edge('tracking-check-report', expired).handler, token)).status, 404);
  const ok = mockClient({
    run: { id: 'r', mode: 'policy', baseline_url: null, target_url: 'https://new.example', status: 'done', summary: { headline: 'h' }, finished_at: '2026-10-12T10:00:00Z', share_expires_at: null },
    findings: [{ scope: 'Manual', check_key: 'manual.x', title: 'X', status: 'manual', priority: 'medium', explanation: '', fix: '', typical_owner: null, evidence: { pages: [], details: [] }, verified_at: '2026-10-12T11:00:00Z', verified_by: 'daniel@expandtalk.se' }],
  });
  const body = await (await get(edge('tracking-check-report', ok).handler, token)).json();
  assert.equal(body.run.targetUrl, 'https://new.example');
  assert.equal(body.findings[0].verified, true);
  assert.equal(body.findings[0].checkKey, 'manual.x');
  assert.ok(!JSON.stringify(body).includes('daniel@'));
});

test('harness: globalThis.fetch hits the sandboxed stub, not real Node fetch', async () => {
  const { run } = compileEdgeSource('exports.run = () => globalThis.fetch("https://example.com");');
  await assert.rejects(() => run(), /Unexpected outbound request/);
});

test('start: running requires a confirmed email address, even on the allowlist', async () => {
  const unconfirmed = mockClient({ user: { id: A, email: 'daniel@expandtalk.se', email_confirmed_at: null } });
  assert.equal((await access(unconfirmed)).allowed, false);
  assert.equal((await post(edge('tracking-check-start', unconfirmed).handler, createBody())).status, 403);
});

test('start: pages must not carry query strings; legacy URLs may', async () => {
  const { handler } = edge('tracking-check-start', mockClient());
  for (const bad of ['/x?token=1', '/x#section']) {
    const res = await post(handler, createBody({ pages: [bad] }));
    assert.equal(res.status, 400, bad);
    assert.equal((await res.json()).error, 'Pages must not contain query strings');
  }
  const db = mockClient();
  assert.equal((await post(edge('tracking-check-start', db).handler, createBody({ legacyPaths: ['/index.php?page_id=42'] }))).status, 200);
  assert.deepEqual(db.calls.inserts.find((i) => i.table === 'tracking_check_runs').payload.pages.legacy, ['/index.php?page_id=42']);
});

test('start: a failed task insert deletes the run instead of leaving an orphan', async () => {
  const db = mockClient({ taskInsertError: { message: 'insert failed' } });
  const { handler, fetches } = edge('tracking-check-start', db);
  assert.equal((await post(handler, createBody())).status, 500);
  assert.deepEqual(db.calls.deletes, [{ table: 'tracking_check_runs', filters: [['id', 'run-1']] }]);
  assert.equal(fetches.length, 0, 'worker is not kicked');
});

test('report: database errors are a 500, not a missing report or an empty findings list', async () => {
  const token = 'A'.repeat(43);
  const get = (h) => h(new Request(`https://x.example/?token=${token}`));
  assert.equal((await get(edge('tracking-check-report', mockClient({ runError: { message: 'db down' } })).handler)).status, 500);
  const run = { id: 'r', mode: 'policy', baseline_url: null, target_url: 'https://new.example', status: 'done', summary: {}, finished_at: null, share_expires_at: null };
  assert.equal((await get(edge('tracking-check-report', mockClient({ run, findingsError: { message: 'db down' } })).handler)).status, 500);
});

test('start: in private preview only allowlisted accounts may run', async () => {
  const env = { ...ENV, TRACKING_CHECK_PUBLIC: undefined };
  const accessIn = async (db) => (await post(edge('tracking-check-start', db, { env }).handler, { action: 'access' })).json();
  assert.equal((await accessIn(mockClient())).allowed, true);
  const outsider = await accessIn(confirmedOutsider());
  assert.equal(outsider.allowed, false);
  assert.equal(outsider.preview, true);
  const db = confirmedOutsider();
  const res = await post(edge('tracking-check-start', db, { env }).handler, createBody());
  assert.equal(res.status, 403);
  assert.match((await res.json()).error, /private preview/);
  assert.equal(db.calls.inserts.length, 0);
  assert.equal((await post(edge('tracking-check-start', mockClient(), { env }).handler, createBody())).status, 200);
});

// ── Schedules ──────────────────────────────────────────────────────────────────
const doneRun = (extra = {}) => ({
  id: 'r', user_id: A, status: 'done', mode: 'comparison', baseline_url: 'https://old.example', target_url: 'https://new.example',
  policy: null, pages: { pages: ['/'], legacy: [] }, schedule_id: null, requires_auth: false, ...extra,
});
const outsiderUser = { id: A, email: 'someone@else.com', email_confirmed_at: '2026-01-01T00:00:00Z' };

test('start: the daily quota counts only runs started by hand', async () => {
  const db = mockClient();
  await post(edge('tracking-check-start', db).handler, createBody());
  const count = db.calls.counts.find((c) => c.table === 'tracking_check_runs');
  assert.deepEqual(count.filters, [['user_id', A], ['trigger', 'manual']]);
});

test('start: schedule creates a schedule from a finished run and links the run to it', async () => {
  const db = mockClient({ run: doneRun() });
  const res = await post(edge('tracking-check-start', db).handler, { action: 'schedule', runId: 'r', frequency: 'weekly' });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.scheduleId, 'sched-1');
  const days = (Date.parse(body.nextRunAt) - Date.now()) / 86400000;
  assert.ok(days > 6.9 && days < 7.1);
  const insert = db.calls.inserts.find((i) => i.table === 'tracking_check_schedules').payload;
  assert.equal(insert.user_id, A);
  assert.equal(insert.frequency, 'weekly');
  assert.equal(insert.target_url, 'https://new.example');
  assert.deepEqual(insert.pages, { pages: ['/'], legacy: [] });
  const link = db.calls.updates.find((u) => u.table === 'tracking_check_runs');
  assert.deepEqual(link.payload, { schedule_id: 'sched-1' });
  assert.deepEqual(link.filters, [['id', 'r']]);
});

test('start: schedule refuses other users runs, unfinished runs, credentialed runs and bad frequencies', async () => {
  const schedule = (run, frequency = 'monthly') => post(edge('tracking-check-start', mockClient({ run })).handler, { action: 'schedule', runId: 'r', frequency });
  assert.equal((await schedule(doneRun({ user_id: 'someone-else' }))).status, 404);
  assert.equal((await schedule(doneRun({ status: 'running' }))).status, 400);
  const auth = await schedule(doneRun({ requires_auth: true }));
  assert.equal(auth.status, 400);
  assert.match((await auth.json()).error, /login credentials/);
  assert.equal((await schedule(doneRun(), 'daily')).status, 400);
});

test('start: active schedules are capped per tier; updating an active schedule is not capped', async () => {
  const capped = mockClient({ user: outsiderUser, run: doneRun(), activeSchedules: 5 });
  const res = await post(edge('tracking-check-start', capped).handler, { action: 'schedule', runId: 'r', frequency: 'weekly' });
  assert.equal(res.status, 429);
  assert.equal(capped.calls.inserts.length, 0);
  // The allowlisted tier has room for more.
  assert.equal((await post(edge('tracking-check-start', mockClient({ run: doneRun(), activeSchedules: 5 })).handler, { action: 'schedule', runId: 'r', frequency: 'weekly' })).status, 200);
  // Switching an active schedule from weekly to monthly does not need a free slot.
  const lineage = mockClient({ user: outsiderUser, run: doneRun({ schedule_id: 's1' }), schedule: { id: 's1', user_id: A, enabled: true }, activeSchedules: 5 });
  const ok = await post(edge('tracking-check-start', lineage).handler, { action: 'schedule', runId: 'r', frequency: 'monthly' });
  assert.equal(ok.status, 200);
  const update = lineage.calls.updates.find((u) => u.table === 'tracking_check_schedules');
  assert.equal(update.payload.frequency, 'monthly');
  assert.deepEqual(update.filters, [['id', 's1']]);
  assert.equal(lineage.calls.inserts.length, 0);
});

test('start: schedule off disables the lineage; dismiss clears the notice of own schedules only', async () => {
  const db = mockClient({ run: doneRun({ schedule_id: 's1' }), schedule: { id: 's1', user_id: A, enabled: true } });
  const { handler } = edge('tracking-check-start', db);
  assert.equal((await post(handler, { action: 'schedule', runId: 'r', frequency: 'off' })).status, 200);
  assert.equal(db.calls.updates.find((u) => u.table === 'tracking_check_schedules').payload.enabled, false);
  assert.equal((await post(handler, { action: 'dismiss', scheduleId: 's1' })).status, 200);
  assert.equal(db.calls.updates.at(-1).payload.alert_run_id, null);
  const foreign = mockClient({ schedule: { id: 's1', user_id: 'someone-else' } });
  assert.equal((await post(edge('tracking-check-start', foreign).handler, { action: 'dismiss', scheduleId: 's1' })).status, 404);
  assert.equal(foreign.calls.updates.length, 0);
});

test('worker: accepts the cron secret only when the database confirms it', async () => {
  const cron = (db, secret) => edge('tracking-check-worker', db).handler(new Request('https://x.example/', { method: 'POST', headers: { 'x-cron-secret': secret } }));
  const denied = mockClient();
  assert.equal((await cron(denied, 'c'.repeat(64))).status, 401);
  assert.deepEqual(denied.calls.rpc[0], ['tracking_check_cron_secret_matches', { p_secret: 'c'.repeat(64) }]);
  const allowed = mockClient({ rpcResult: (name) => (name === 'tracking_check_cron_secret_matches' ? true : []) });
  assert.equal((await cron(allowed, 'c'.repeat(64))).status, 200);
  assert.ok(allowed.calls.rpc.some(([name]) => name === 'tracking_check_claim_tasks'));
});

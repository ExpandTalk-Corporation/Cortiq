import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEdge, compileEdgeSource } from './edge-harness.mjs';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ENV = {
  SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service',
  TRACKING_CHECK_ALLOWED_EMAILS: 'Daniel@Expandtalk.se, other@example.com', TRACKING_CHECK_WORKER_SECRET: 's3cret',
  TRACKING_CHECK_AUTH_KEY: Buffer.alloc(32, 7).toString('base64'), BROWSERLESS_API_KEY: 'bl', BROWSERLESS_URL: 'https://bl.example',
};

function mockClient({ user = { id: A, email: 'daniel@expandtalk.se' }, runsToday = 0, run = null, tasks = [], findings = [], pendingCount = 0 } = {}) {
  const calls = { inserts: [], updates: [], rpc: [] };
  const client = {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    rpc: async (name, args) => { calls.rpc.push([name, args]); return { data: [], error: null }; },
    from(table) {
      const op = { table, type: 'select', head: false, filters: [] };
      const result = () => {
        if (op.head) return { count: table === 'tracking_check_runs' ? runsToday : table === 'tracking_check_tasks' ? pendingCount : 0, error: null };
        if (op.type !== 'select') return { data: op.returning ? [{ id: 'x' }] : null, error: null };
        if (table === 'tracking_check_tasks') return { data: tasks, error: null };
        if (table === 'tracking_check_findings') return { data: findings, error: null };
        return { data: [], error: null };
      };
      const q = {
        select(_cols, opts) { if (opts?.head) op.head = true; if (op.type !== 'select') op.returning = true; return q; },
        insert(payload) { op.type = 'insert'; calls.inserts.push({ table, payload }); return q; },
        update(payload) { op.type = 'update'; calls.updates.push({ table, payload, filters: op.filters }); return q; },
        upsert(payload) { op.type = 'upsert'; calls.inserts.push({ table, payload }); return q; },
        eq(k, v) { op.filters.push([k, v]); return q; },
        gte() { return q; }, in() { return q; }, order() { return q; }, limit() { return q; },
        single: async () => ({ data: op.type === 'insert' ? { id: 'run-1' } : run, error: null }),
        maybeSingle: async () => ({ data: run, error: null }),
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

test('start: requires a user and the allowlist', async () => {
  assert.equal((await post(edge('tracking-check-start', mockClient({ user: null })).handler, { action: 'access' })).status, 401);
  assert.deepEqual(await (await post(edge('tracking-check-start', mockClient()).handler, { action: 'access' })).json(), { allowed: true });
  const outsider = mockClient({ user: { id: A, email: 'someone@else.com' } });
  assert.deepEqual(await (await post(edge('tracking-check-start', outsider).handler, { action: 'access' })).json(), { allowed: false });
  assert.equal((await post(edge('tracking-check-start', outsider).handler, createBody())).status, 403);
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

test('start: create stores the run, one task per page/site/kind plus legacy, seals credentials and kicks the worker', async () => {
  const db = mockClient();
  const { handler, fetches } = edge('tracking-check-start', db);
  const res = await post(handler, createBody({ basicAuth: { username: 'stage', password: 'pw-secret' } }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { runId: 'run-1' });
  const run = db.calls.inserts.find((i) => i.table === 'tracking_check_runs').payload;
  assert.equal(run.baseline_url, 'https://old.example');
  assert.equal(run.user_id, A);
  assert.ok(run.auth_ciphertext && !run.auth_ciphertext.includes('pw-secret'));
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

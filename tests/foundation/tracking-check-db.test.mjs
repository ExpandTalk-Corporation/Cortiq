import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

// Executes the real migration in PGlite with the Supabase roles and auth.uid() stubbed.
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const migration = readFileSync(new URL('../../supabase/migrations/20261012000001_tracking_check.sql', import.meta.url), 'utf8');

async function setup() {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;`);
  await db.exec(migration);
  return db;
}
async function as(db, role, user, fn) {
  await db.exec(`SET ROLE ${role}; SELECT set_config('request.jwt.claim.sub', '${user ?? ''}', false);`);
  try { return await fn(); } finally { await db.exec('RESET ROLE'); }
}
async function newRun(db, user, status = 'running') {
  const { rows } = await db.query(`INSERT INTO tracking_check_runs (user_id, mode, target_url, status, auth_ciphertext, auth_expires_at)
    VALUES ($1, 'policy', 'https://t.example', $2, 'sealed', now() + interval '1 hour') RETURNING id`, [user, status]);
  return rows[0].id;
}
async function newTask(db, runId, kind = 'fetch', path = '/') {
  const { rows } = await db.query(`INSERT INTO tracking_check_tasks (run_id, site_role, path, kind) VALUES ($1, 'target', $2, $3) RETURNING id`, [runId, path, kind]);
  return rows[0].id;
}

test('users only see their own runs, never the encrypted credentials, and anon sees nothing', async () => {
  const db = await setup();
  const runA = await newRun(db, A);
  await newRun(db, B);
  const own = await as(db, 'authenticated', A, () => db.query('SELECT id FROM tracking_check_runs'));
  assert.deepEqual(own.rows.map((r) => r.id), [runA]);
  await assert.rejects(as(db, 'authenticated', A, () => db.query('SELECT auth_ciphertext FROM tracking_check_runs')), /permission denied/);
  await assert.rejects(as(db, 'anon', null, () => db.query('SELECT id FROM tracking_check_runs')), /permission denied/);
});

test('claiming is atomic and ordered; finished runs are reported for finalising', async () => {
  const db = await setup();
  const run = await newRun(db, A);
  for (const p of ['/a', '/b', '/c']) await newTask(db, run, 'fetch', p);
  await newTask(db, run, 'browser');
  const first = await db.query(`SELECT * FROM tracking_check_claim_tasks('fetch', 2)`);
  assert.deepEqual(first.rows.map((r) => [r.path, r.status, r.attempts]), [['/a', 'running', 1], ['/b', 'running', 1]]);
  assert.equal((await db.query(`SELECT * FROM tracking_check_claim_tasks('fetch', 2)`)).rows.length, 1);
  assert.equal((await db.query('SELECT * FROM tracking_check_runs_to_finalize()')).rows.length, 0);
  await db.exec(`UPDATE tracking_check_tasks SET status = 'done'`);
  assert.deepEqual((await db.query('SELECT tracking_check_runs_to_finalize AS id FROM tracking_check_runs_to_finalize()')).rows.map((r) => r.id), [run]);
});

test('stale running tasks go back to pending, or fail after three attempts', async () => {
  const db = await setup();
  const run = await newRun(db, A);
  const retry = await newTask(db, run, 'browser', '/retry');
  const giveUp = await newTask(db, run, 'browser', '/give-up');
  await db.query(`UPDATE tracking_check_tasks SET status = 'running', claimed_at = now() - interval '10 minutes', attempts = CASE WHEN id = $1 THEN 1 ELSE 3 END`, [retry]);
  await db.query('SELECT tracking_check_recover_stale(300)');
  const { rows } = await db.query('SELECT id, status, error FROM tracking_check_tasks ORDER BY path');
  assert.deepEqual(rows.map((r) => [r.id, r.status]), [[giveUp, 'failed'], [retry, 'pending']]);
  assert.match(rows[0].error, /timed out/);
});

test('retention deletes old observations and clears finished or expired credentials', async () => {
  const db = await setup();
  const done = await newRun(db, A, 'done');
  const running = await newRun(db, A);
  const task = await newTask(db, done);
  await db.query(`INSERT INTO tracking_check_observations (run_id, task_id, data, created_at) VALUES ($1, $2, '{}', now() - interval '91 days')`, [done, task]);
  await db.query('SELECT tracking_check_retention()');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM tracking_check_observations')).rows[0].n, 0);
  const { rows } = await db.query('SELECT id, auth_ciphertext FROM tracking_check_runs');
  assert.equal(rows.find((r) => r.id === done).auth_ciphertext, null);
  assert.equal(rows.find((r) => r.id === running).auth_ciphertext, 'sealed');
});

test('owners can only mark findings as verified; other users cannot touch them', async () => {
  const db = await setup();
  const run = await newRun(db, A);
  const { rows: [f] } = await db.query(`INSERT INTO tracking_check_findings (run_id, sort_order, scope, check_key, title, status) VALUES ($1, 0, 'Manual', 'manual.x', 'X', 'manual') RETURNING id`, [run]);
  await as(db, 'authenticated', A, () => db.query(`UPDATE tracking_check_findings SET verified_by = 'a@example.com', verified_at = now() WHERE id = $1`, [f.id]));
  await assert.rejects(as(db, 'authenticated', A, () => db.query(`UPDATE tracking_check_findings SET status = 'pass' WHERE id = $1`, [f.id])), /permission denied/);
  const other = await as(db, 'authenticated', B, () => db.query(`UPDATE tracking_check_findings SET verified_by = 'b' WHERE id = $1`, [f.id]));
  assert.equal(other.affectedRows, 0);
  assert.equal((await db.query('SELECT verified_by FROM tracking_check_findings')).rows[0].verified_by, 'a@example.com');
});

test('the queue functions are not executable by clients', async () => {
  const db = await setup();
  await assert.rejects(as(db, 'authenticated', A, () => db.query(`SELECT * FROM tracking_check_claim_tasks('fetch', 1)`)), /permission denied/);
});

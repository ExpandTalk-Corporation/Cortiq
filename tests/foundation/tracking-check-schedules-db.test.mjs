import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

// Executes the Tracking Check migrations plus the schedules migration in PGlite, with the Supabase
// roles and auth.uid() stubbed (pg_cron, pg_net and Vault are absent, as in other test databases).
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const read = (f) => readFileSync(new URL(`../../supabase/migrations/${f}`, import.meta.url), 'utf8');
const base = ['20261012000001_tracking_check.sql', '20261013000001_tracking_check_liveness.sql', '20261106000001_tracking_check_account_deletion.sql'].map(read);
const schedules = read('20261118000001_tracking_check_schedules.sql');

async function setup() {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE auth.users (id uuid PRIMARY KEY); INSERT INTO auth.users VALUES ('${A}'), ('${B}');`);
  for (const m of base) await db.exec(m);
  await db.exec(schedules);
  return db;
}
async function as(db, role, user, fn) {
  await db.exec(`SET ROLE ${role}; SELECT set_config('request.jwt.claim.sub', '${user ?? ''}', false);`);
  try { return await fn(); } finally { await db.exec('RESET ROLE'); }
}
async function newSchedule(db, user, { mode = 'comparison', pages = { pages: ['/', '/pricing/'], legacy: ['/old/'] }, frequency = 'weekly', due = "now() - interval '1 minute'" } = {}) {
  const { rows } = await db.query(`INSERT INTO tracking_check_schedules (user_id, mode, baseline_url, target_url, pages, frequency, next_run_at)
    VALUES ($1, $2, $3, 'https://new.example', $4, $5, ${due}) RETURNING id`,
  [user, mode, mode === 'comparison' ? 'https://old.example' : null, JSON.stringify(pages), frequency]);
  return rows[0].id;
}
const enqueue = async (db) => (await db.query('SELECT tracking_check_enqueue_due(20) AS id')).rows.map((r) => r.id);

test('the migration can be applied twice and keeps existing runs unscheduled and manual', async () => {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE auth.users (id uuid PRIMARY KEY); INSERT INTO auth.users VALUES ('${A}');`);
  for (const m of base) await db.exec(m);
  await db.query(`INSERT INTO tracking_check_runs (user_id, mode, target_url, status) VALUES ($1, 'policy', 'https://t.example', 'done')`, [A]);
  await db.query(`INSERT INTO tracking_check_runs (user_id, mode, target_url, auth_ciphertext) VALUES ($1, 'policy', 'https://t.example', 'sealed')`, [A]);
  await db.exec(schedules);
  await db.exec(schedules);
  const { rows } = await db.query('SELECT trigger, schedule_id, requires_auth FROM tracking_check_runs ORDER BY requires_auth');
  assert.deepEqual(rows, [{ trigger: 'manual', schedule_id: null, requires_auth: false }, { trigger: 'manual', schedule_id: null, requires_auth: true }]);
  await assert.rejects(db.query(`UPDATE tracking_check_runs SET trigger = 'cron'`), /tracking_check_runs_trigger_check/);
});

test('users read only their own schedules and cannot write them; anon sees nothing', async () => {
  const db = await setup();
  const own = await newSchedule(db, A);
  await newSchedule(db, B);
  const seen = await as(db, 'authenticated', A, () => db.query('SELECT id FROM tracking_check_schedules'));
  assert.deepEqual(seen.rows.map((r) => r.id), [own]);
  await assert.rejects(as(db, 'authenticated', A, () => db.query(`UPDATE tracking_check_schedules SET enabled = false`)), /permission denied/);
  await assert.rejects(as(db, 'authenticated', A, () => db.query(`INSERT INTO tracking_check_schedules (user_id, mode, target_url, frequency, next_run_at) VALUES ('${A}', 'policy', 'https://x.example', 'weekly', now())`)), /permission denied/);
  await assert.rejects(as(db, 'anon', null, () => db.query('SELECT id FROM tracking_check_schedules')), /permission denied/);
  // The new run columns are readable; the credentials column stays hidden.
  await as(db, 'authenticated', A, () => db.query('SELECT schedule_id, trigger, requires_auth FROM tracking_check_runs'));
  await assert.rejects(as(db, 'authenticated', A, () => db.query('SELECT auth_ciphertext FROM tracking_check_runs')), /permission denied/);
});

test('only the service role may enqueue or check the cron secret', async () => {
  const db = await setup();
  await assert.rejects(as(db, 'authenticated', A, () => db.query('SELECT tracking_check_enqueue_due(20)')), /permission denied/);
  await assert.rejects(as(db, 'anon', null, () => db.query(`SELECT tracking_check_cron_secret_matches('x')`)), /permission denied/);
  // Without Vault (and for short secrets) it is false, never an error.
  const { rows } = await as(db, 'service_role', null, () => db.query(`SELECT tracking_check_cron_secret_matches($1) AS a, tracking_check_cron_secret_matches('short') AS b`, ['x'.repeat(64)]));
  assert.deepEqual(rows[0], { a: false, b: false });
});

test('a due schedule becomes a scheduled run with the same task layout as a manual run', async () => {
  const db = await setup();
  const schedule = await newSchedule(db, A);
  const [run] = await as(db, 'service_role', null, () => enqueue(db));
  assert.ok(run);
  const r = (await db.query('SELECT user_id, mode, baseline_url, target_url, pages, schedule_id, trigger, status, auth_ciphertext FROM tracking_check_runs WHERE id = $1', [run])).rows[0];
  assert.deepEqual(r, { user_id: A, mode: 'comparison', baseline_url: 'https://old.example', target_url: 'https://new.example',
    pages: { pages: ['/', '/pricing/'], legacy: ['/old/'] }, schedule_id: schedule, trigger: 'scheduled', status: 'running', auth_ciphertext: null });
  const tasks = (await db.query('SELECT site_role, path, kind, legacy FROM tracking_check_tasks WHERE run_id = $1 ORDER BY created_at', [run])).rows
    .map((t) => `${t.site_role} ${t.path} ${t.kind}${t.legacy ? ' legacy' : ''}`);
  assert.deepEqual(tasks, [
    'baseline / fetch', 'baseline / browser', 'target / fetch', 'target / browser',
    'baseline /pricing/ fetch', 'baseline /pricing/ browser', 'target /pricing/ fetch', 'target /pricing/ browser',
    'target /old/ fetch legacy',
  ]);
  // Claiming takes fetch tasks in that order.
  const claimed = (await db.query(`SELECT * FROM tracking_check_claim_tasks('fetch', 10)`)).rows.map((t) => `${t.site_role} ${t.path}`);
  assert.deepEqual(claimed, ['baseline /', 'target /', 'baseline /pricing/', 'target /pricing/', 'target /old/']);
  const s = (await db.query('SELECT last_run_id, last_run_at IS NOT NULL AS ran, next_run_at > now() + interval \'6 days\' AS later FROM tracking_check_schedules WHERE id = $1', [schedule])).rows[0];
  assert.deepEqual(s, { last_run_id: run, ran: true, later: true });
});

test('policy schedules get target tasks only and no legacy tasks', async () => {
  const db = await setup();
  await newSchedule(db, A, { mode: 'policy', pages: { pages: ['/'], legacy: [] }, frequency: 'monthly' });
  const [run] = await enqueue(db);
  const tasks = (await db.query('SELECT site_role, kind FROM tracking_check_tasks WHERE run_id = $1 ORDER BY created_at', [run])).rows;
  assert.deepEqual(tasks.map((t) => `${t.site_role} ${t.kind}`), ['target fetch', 'target browser']);
});

test('schedules that are not due, disabled or still running are skipped; the cadence keeps its anchor', async () => {
  const db = await setup();
  await newSchedule(db, A, { due: "now() + interval '1 day'" });
  const off = await newSchedule(db, A);
  await db.query('UPDATE tracking_check_schedules SET enabled = false WHERE id = $1', [off]);
  const busy = await newSchedule(db, A);
  assert.equal((await enqueue(db)).length, 1);           // only `busy`, the first time
  await db.query(`UPDATE tracking_check_schedules SET next_run_at = now() - interval '1 minute' WHERE id = $1`, [busy]);
  assert.equal((await enqueue(db)).length, 0);           // its previous run is still running
  await db.query(`UPDATE tracking_check_runs SET status = 'done' WHERE schedule_id = $1`, [busy]);
  assert.equal((await enqueue(db)).length, 1);

  // Anchored: a schedule due 2 days ago moves to 5 days from now, not 7.
  const anchored = await newSchedule(db, B, { due: "now() - interval '2 days'" });
  await enqueue(db);
  const days = (await db.query(`SELECT extract(epoch FROM next_run_at - now()) / 86400 AS d FROM tracking_check_schedules WHERE id = $1`, [anchored])).rows[0].d;
  assert.ok(days > 4.9 && days < 5.1, String(days));
  // After a long outage it restarts from now instead of catching up run by run.
  const stale = await newSchedule(db, B, { due: "now() - interval '30 days'" });
  await enqueue(db);
  const later = (await db.query(`SELECT extract(epoch FROM next_run_at - now()) / 86400 AS d FROM tracking_check_schedules WHERE id = $1`, [stale])).rows[0].d;
  assert.ok(later > 6.9 && later < 7.1, String(later));
});

test('a schedule without pages is switched off instead of creating an empty run', async () => {
  const db = await setup();
  const empty = await newSchedule(db, A, { pages: { pages: [], legacy: [] } });
  assert.deepEqual(await enqueue(db), []);
  assert.equal((await db.query('SELECT enabled FROM tracking_check_schedules WHERE id = $1', [empty])).rows[0].enabled, false);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM tracking_check_runs')).rows[0].n, 0);
});

test('deleting the account removes schedules; deleting a run keeps its schedule', async () => {
  const db = await setup();
  const keep = await newSchedule(db, B);
  const [run] = await enqueue(db);
  await db.query('UPDATE tracking_check_schedules SET alert_run_id = $1 WHERE id = $2', [run, keep]);
  await db.query('DELETE FROM tracking_check_runs WHERE id = $1', [run]);
  const s = (await db.query('SELECT last_run_id, alert_run_id FROM tracking_check_schedules WHERE id = $1', [keep])).rows[0];
  assert.deepEqual(s, { last_run_id: null, alert_run_id: null });
  await newSchedule(db, A);
  await db.query('DELETE FROM auth.users WHERE id = $1', [A]);
  assert.deepEqual((await db.query('SELECT user_id FROM tracking_check_schedules')).rows, [{ user_id: B }]);
});

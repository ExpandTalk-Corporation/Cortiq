import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { checkSite, classify, hasSnippet, siteUrl, uptimeSentence, USER_AGENT } from '../../supabase/functions/_shared/uptime.ts';
import { loadEdge, mockDatabase } from './edge-harness.mjs';

const migration = readFileSync(new URL('../../supabase/migrations/20261130000001_site_uptime.sql', import.meta.url), 'utf8');

const FIXTURE = `
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE TABLE public.sites (id uuid PRIMARY KEY, user_id uuid NOT NULL, domain text, is_active boolean DEFAULT true);
GRANT SELECT ON public.sites TO authenticated;
INSERT INTO public.sites (id, user_id, domain) VALUES
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'https://ekonom.biz'),
  ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'spa.example');
`;
const S1 = '11111111-1111-4111-8111-111111111111';
const S2 = '22222222-2222-4222-8222-222222222222';

async function db() {
  const pg = new PGlite();
  await pg.exec(FIXTURE);
  await pg.exec(migration);
  return pg;
}
let minute = 0;
const record = (pg, site, problem, snippet, status = problem ? 403 : 200) =>
  pg.query(`SELECT public.record_uptime_check($1, $2, $3, $4, $5, $6)`,
    [site, problem, status, problem === 'down' ? `HTTP ${status}` : null, snippet, new Date(Date.UTC(2026, 10, 16, 12, minute += 5)).toISOString()]);
const open = async (pg) => (await pg.query(`SELECT site_id, kind FROM public.uptime_alerts WHERE resolved_at IS NULL ORDER BY site_id, kind`)).rows.map((r) => [r.site_id, r.kind]);
const toEmail = async (pg) => (await pg.query(`SELECT kind, resolved_at FROM public.uptime_alerts_to_email()`)).rows;

test('PostgreSQL: a site that stays down alerts on the second check and resolves when it answers', async () => {
  const pg = await db();
  try {
    await record(pg, S1, null, true);
    await record(pg, S1, 'down', null);
    assert.deepEqual(await open(pg), [], 'one failed check is a blip');
    await record(pg, S1, null, true);
    await record(pg, S1, 'down', null);
    assert.deepEqual(await open(pg), [], 'the streak restarts after a good check');
    await record(pg, S1, 'down', null);
    await record(pg, S1, 'down', null);
    assert.deepEqual(await open(pg), [[S1, 'down']]);
    assert.equal((await pg.query(`SELECT count(*)::int n FROM public.uptime_alerts`)).rows[0].n, 1, 'never duplicated');
    assert.equal((await toEmail(pg)).length, 1);

    // Inconclusive checks (a bot challenge) neither resolve nor extend anything.
    await record(pg, S1, 'inconclusive', null);
    assert.deepEqual(await open(pg), [[S1, 'down']]);

    await pg.exec(`UPDATE public.uptime_alerts SET opened_notified_at = now()`);
    await record(pg, S1, null, true);
    assert.deepEqual(await open(pg), []);
    const recovered = await toEmail(pg);
    assert.equal(recovered.length, 1);
    assert.ok(recovered[0].resolved_at);
  } finally {
    await pg.close();
  }
});

test('PostgreSQL: a missing snippet alerts only where it was seen before, and survives an outage', async () => {
  const pg = await db();
  try {
    // S2 loads CortIQ from its JS bundle: never in the HTML, never an alert.
    for (let i = 0; i < 3; i++) await record(pg, S2, null, false);
    assert.deepEqual(await open(pg), []);

    await record(pg, S1, null, true);
    await record(pg, S1, null, false);
    await record(pg, S1, null, false);
    assert.deepEqual(await open(pg), [[S1, 'snippet_missing']]);
    // While down nothing is known about the snippet: it stays open next to "down".
    await record(pg, S1, 'down', null);
    await record(pg, S1, 'down', null);
    assert.deepEqual(await open(pg), [[S1, 'down'], [S1, 'snippet_missing']]);
    // Up again without the snippet: "down" resolves, "snippet_missing" stays.
    await record(pg, S1, null, false);
    assert.deepEqual(await open(pg), [[S1, 'snippet_missing']]);
    await record(pg, S1, null, true);
    assert.deepEqual(await open(pg), []);
  } finally {
    await pg.close();
  }
});

test('PostgreSQL: owners read only their own state; the writers are service_role only', async () => {
  const pg = await db();
  try {
    for (const s of [S1, S2]) { await record(pg, s, 'down', null); await record(pg, s, 'down', null); }
    await pg.exec(`SET ROLE authenticated; SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';`);
    assert.deepEqual((await pg.query(`SELECT site_id FROM public.uptime_alerts`)).rows.map((r) => r.site_id), [S1]);
    assert.deepEqual((await pg.query(`SELECT site_id FROM public.site_uptime`)).rows.map((r) => r.site_id), [S1]);
    await pg.exec('RESET ROLE');
    const { rows } = await pg.query(`SELECT
      has_function_privilege('authenticated', 'public.record_uptime_check(uuid,text,integer,text,boolean,timestamptz)', 'EXECUTE') AS auth_record,
      has_function_privilege('anon', 'public.uptime_alerts_to_email()', 'EXECUTE') AS anon_email,
      has_function_privilege('service_role', 'public.record_uptime_check(uuid,text,integer,text,boolean,timestamptz)', 'EXECUTE') AS svc_record,
      has_table_privilege('authenticated', 'public.uptime_alerts', 'UPDATE') AS auth_update,
      public.site_uptime_cron_secret_matches(repeat('a', 64)) AS secret_without_vault`);
    assert.deepEqual(rows[0], { auth_record: false, anon_email: false, svc_record: true, auth_update: false, secret_without_vault: false });
    await assert.rejects(pg.query(`SELECT public.record_uptime_check($1, 'snippet_missing', 200, null, false)`, [S1]), /unknown problem/);
  } finally {
    await pg.close();
  }
});

test('the cron job runs every 5 minutes and never carries a secret in the migration', () => {
  assert.match(migration, /cron\.schedule\(\s*'site-uptime',\s*'\*\/5 \* \* \* \*'/);
  assert.doesNotMatch(migration, /eyJhbGciOi|sb_secret_/);
});

test('siteUrl, snippet detection and classification', () => {
  assert.equal(siteUrl('https://ekonom.biz'), 'https://ekonom.biz/');
  assert.equal(siteUrl('sentrisk.se'), 'https://sentrisk.se/');
  assert.equal(siteUrl('https://xn--btguide-exa.nu/'), 'https://xn--btguide-exa.nu/');
  assert.equal(siteUrl('http://www.x.se/blog/'), 'https://www.x.se/');
  assert.equal(siteUrl(''), null);

  assert.ok(hasSnippet(`<script>window.cortiqConfig = { siteId: 'x' };</script>`));
  assert.ok(hasSnippet(`<script src="/vendor/cortiq/spa-tracking.js?v=5.5.6" defer></script>`));
  assert.ok(hasSnippet(`<script defer src='https://cortiq.se/v/5.5.14/cortiq.js' integrity="sha384-x"></script>`));
  assert.ok(!hasSnippet(`<p>We use CortIQ for analytics.</p><script src="/app.js"></script>`));

  assert.deepEqual(classify(200, '<script>window.cortiqConfig={}</script>'), { problem: null, status: 200, detail: null, snippetFound: true });
  assert.equal(classify(403, 'Webbplatsen har stängts').problem, 'down');
  assert.equal(classify(503, '<title>Just a moment...</title>').problem, 'inconclusive');
  assert.equal(classify(200, 'challenges.cloudflare.com').problem, 'inconclusive');
  assert.equal(classify(401, '').problem, 'inconclusive');
  assert.equal(classify(500, '').detail, 'HTTP 500');
});

test('checkSite follows redirects, guards private hosts and turns failures into "down"', async () => {
  const resolve = async () => ['93.184.216.34'];
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push([url, init.headers['User-Agent'], init.redirect]);
    if (url === 'https://a.test/') return new Response(null, { status: 301, headers: { location: '/sv/' } });
    return new Response('<script>window.cortiqConfig={}</script>', { status: 200 });
  };
  assert.deepEqual(await checkSite('https://a.test/', { fetchImpl, resolve }), { problem: null, status: 200, detail: null, snippetFound: true });
  assert.deepEqual(seen, [['https://a.test/', USER_AGENT, 'manual'], ['https://a.test/sv/', USER_AGENT, 'manual']]);

  const toPrivate = async () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } });
  assert.equal((await checkSite('https://a.test/', { fetchImpl: toPrivate, resolve })).detail, 'Blocked address');

  const timeout = async () => { throw Object.assign(new Error('t'), { name: 'TimeoutError' }); };
  assert.deepEqual(await checkSite('https://a.test/', { fetchImpl: timeout, resolve }), { problem: 'down', status: null, detail: 'No answer within 15 seconds', snippetFound: null });
  const loop = async () => new Response(null, { status: 302, headers: { location: '/again' } });
  assert.equal((await checkSite('https://a.test/', { fetchImpl: loop, resolve })).detail, 'Redirect loop');
});

test('the sentence names the host, the time in Stockholm and the detail', () => {
  assert.equal(uptimeSentence({ kind: 'down', detail: 'HTTP 403', opened_at: '2026-11-16T13:40:00Z' }, 'ekonom.biz'),
    'ekonom.biz is down since 16 Nov 2026, 14:40 (HTTP 403).');
  assert.match(uptimeSentence({ kind: 'snippet_missing', detail: null, opened_at: '2026-11-16T13:40:00Z' }, 'x.se'), /^The CortIQ snippet is gone from x\.se since/);
});

test('function: rejects a wrong cron secret; checks active sites and emails the owner', async () => {
  const rpcCalls = [];
  let secretOk = false;
  const db = mockDatabase(
    (op) => op.table === 'sites' && op.type === 'select'
      ? { data: [{ id: S1, domain: 'https://ekonom.biz', user_id: 'u1', is_active: true }, { id: S2, domain: 'off.test', user_id: 'u2', is_active: false }], error: null }
      : { data: null, error: null },
    async (name, args) => {
      rpcCalls.push([name, args]);
      if (name === 'site_uptime_cron_secret_matches') return { data: secretOk, error: null };
      if (name === 'uptime_alerts_to_email') return { data: [{ id: 'a1', site_id: S1, kind: 'down', detail: 'HTTP 403', opened_at: '2026-11-16T13:40:00Z', resolved_at: null }], error: null };
      return { data: null, error: null };
    },
  );
  db.client.auth = { admin: { getUserById: async () => ({ data: { user: { email: 'owner@ekonom.test' } } }) } };
  const sent = [];
  const fetch = async (url, init) => {
    if (String(url).startsWith('https://api.resend.com/')) { sent.push(JSON.parse(init.body)); return new Response('{}', { status: 200 }); }
    return new Response('Webbplatsen har stängts', { status: 403 });
  };
  const handler = loadEdge('site-uptime', db.client, { env: { RESEND_API_KEY: 're_test' }, fetch });
  const req = () => new Request('https://fn.test/site-uptime', { method: 'POST', headers: { 'x-cron-secret': 'x'.repeat(64) } });

  assert.equal((await handler(req())).status, 401);
  secretOk = true;
  const body = await (await handler(req())).json();
  assert.deepEqual(body, { checked: 1, pending: 1, emailed: 1 });
  const records = rpcCalls.filter(([n]) => n === 'record_uptime_check').map(([, a]) => a);
  assert.deepEqual(records, [{ p_site_id: S1, p_problem: 'down', p_status: 403, p_detail: 'HTTP 403', p_snippet_found: null }]);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].to, ['owner@ekonom.test']);
  assert.equal(sent[0].subject, 'ekonom.biz is down');
  assert.match(sent[0].html, /Hosts suspend a site when they find malware/);
  assert.ok(db.calls.some((c) => c.table === 'uptime_alerts' && c.type === 'update' && c.payload.opened_notified_at));
  assert.deepEqual(rpcCalls.filter(([n]) => n === 'record_alert_email_status').at(-1), ['record_alert_email_status', { p_configured: true }]);

  const noKey = loadEdge('site-uptime', db.client, { env: { RESEND_API_KEY: '' }, fetch });
  assert.equal((await (await noKey(req())).json()).emailed, 0);
  assert.deepEqual(rpcCalls.filter(([n]) => n === 'record_alert_email_status').at(-1), ['record_alert_email_status', { p_configured: false }], 'the dashboard learns that emails are off');
});

test('PostgreSQL: alert email status is one row, readable when signed in, written by service_role only', async () => {
  const pg = await db();
  try {
    await pg.query(`SELECT public.record_alert_email_status(false)`);
    await pg.query(`SELECT public.record_alert_email_status(true)`);
    assert.deepEqual((await pg.query(`SELECT id, configured FROM public.alert_email_status`)).rows, [{ id: 1, configured: true }]);
    const priv = (await pg.query(`SELECT has_function_privilege('authenticated', 'public.record_alert_email_status(boolean)', 'EXECUTE') a,
      has_function_privilege('service_role', 'public.record_alert_email_status(boolean)', 'EXECUTE') s,
      has_table_privilege('authenticated', 'public.alert_email_status', 'SELECT') r,
      has_table_privilege('authenticated', 'public.alert_email_status', 'UPDATE') w`)).rows[0];
    assert.deepEqual(priv, { a: false, s: true, r: true, w: false });
  } finally {
    await pg.close();
  }
});

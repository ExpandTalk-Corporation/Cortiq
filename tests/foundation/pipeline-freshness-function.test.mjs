// pipeline-freshness runs both hourly checks and emails each kind of alert through _shared/resend.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEdge, mockDatabase } from './edge-harness.mjs';

const S1 = '11111111-1111-4111-8111-111111111111';

function setup({ conversionError = null } = {}) {
  const rpcCalls = [];
  const db = mockDatabase(
    (op) => op.table === 'sites' ? { data: [{ id: S1, domain: 'https://one.example.test/', user_id: 'u1' }], error: null } : { data: null, error: null },
    async (name) => {
      rpcCalls.push(name);
      if (name === 'pipeline_freshness_cron_secret_matches') return { data: true, error: null };
      if (name === 'check_pipeline_freshness') return { data: [{ id: 'p1', site_id: S1, pipeline: 'page_views', last_seen_at: '2026-11-17T10:00:00Z', expected: 40, opened_at: '2026-11-19T10:00:00Z', resolved_at: null }], error: null };
      if (name === 'check_conversion_alerts') return conversionError ? { data: null, error: conversionError } : { data: [{ id: 'c1', site_id: S1, kind: 'form_zero_completions', subject: 'contact', detail: { starts_7d: 6, completions_7d: 0, completions_prior_28d: 3 }, opened_at: '2026-11-19T10:00:00Z', resolved_at: null }], error: null };
      return { data: null, error: null };
    },
  );
  db.client.auth = { admin: { getUserById: async () => ({ data: { user: { email: 'owner@example.test' } } }) } };
  const sent = [];
  const fetch = async (url, init) => { sent.push({ url: String(url), body: JSON.parse(init.body), auth: init.headers.Authorization }); return new Response('{}', { status: 200 }); };
  const handler = loadEdge('pipeline-freshness', db.client, { env: { RESEND_API_KEY: 're_test', ALERT_EMAIL_FROM: '' }, fetch });
  const req = new Request('https://fn.test/pipeline-freshness', { method: 'POST', headers: { 'x-cron-secret': 'x'.repeat(64) } });
  return { handler, req, db, sent, rpcCalls };
}

test('runs both checks and sends one pipeline email and one conversion email', async () => {
  const { handler, req, db, sent, rpcCalls } = setup();
  const body = await (await handler(req)).json();
  assert.deepEqual(rpcCalls.filter((n) => n.startsWith('check_')), ['check_pipeline_freshness', 'check_conversion_alerts']);
  assert.deepEqual(body, { pending: 1, emailed: 1, conversions: { pending: 1, emailed: 1 } });
  assert.equal(sent.length, 2);
  assert.ok(sent.every((s) => s.url === 'https://api.resend.com/emails' && s.auth === 'Bearer re_test'));
  assert.equal(sent[1].body.subject, 'one.example.test: a form gets no completions');
  assert.equal(sent[1].body.from, 'CortIQ <alerts@cortiq.se>', 'empty ALERT_EMAIL_FROM falls back');
  assert.ok(db.calls.some((c) => c.table === 'conversion_alerts' && c.type === 'update' && c.payload.opened_notified_at));
});

test('a failing conversion check does not stop pipeline emails', async () => {
  const { handler, req, sent } = setup({ conversionError: { message: 'boom' } });
  const res = await handler(req);
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).conversions, { pending: 0, emailed: 0, error: 'check failed' });
  assert.equal(sent.length, 1);
});

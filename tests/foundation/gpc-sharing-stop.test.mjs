// California follow-up R1 (jurist review 2026-11-21): the paths that share with an ad platform stop
// on GPC server-side. CPPA Regs §7025(c)(1): the signal covers the browser, the pseudonymous profile
// and the known consumer. §7025(c)(5): a later request without the signal is not consent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { loadEdge, mockDatabase } from './edge-harness.mjs';
import { anyGpc, gpcStop, linkedSessionIds, GPC_MAX_SESSIONS } from '../../supabase/functions/_shared/gpc-stop.ts';
import { sealToken } from '../../supabase/functions/_shared/google-ads-oauth.ts';

const SITE = '11111111-1111-4111-8111-111111111111';
const HASH = 'ab'.repeat(32);
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const upload = read('../../supabase/functions/google-ads-quality-upload/index.ts');
const webhook = read('../../supabase/functions/hubspot-lead-webhook/index.ts');
const storeConsent = read('../../supabase/functions/store-consent/index.ts');

// --- pure helpers ---

test('linkedSessionIds: own session, linked conversions and visitors; deduped, validated, capped', () => {
  assert.deepEqual(
    linkedSessionIds('s1', {
      conversions: [{ form_data: { tracking_session_id: 's2' } }, { form_data: { tracking_session_id: 's1' } }, { form_data: null }, {}],
      visitors: [{ first_session_id: 's3' }, { first_session_id: null }],
    }),
    ['s1', 's2', 's3'],
  );
  assert.deepEqual(linkedSessionIds(undefined, {}), []);
  assert.deepEqual(linkedSessionIds('has space', {}), []);
  assert.deepEqual(linkedSessionIds('x'.repeat(256), {}), []);
  assert.deepEqual(linkedSessionIds(42, {}), []);
  const many = Array.from({ length: 500 }, (_, i) => ({ form_data: { tracking_session_id: `s${i}` } }));
  assert.equal(linkedSessionIds('own', { conversions: many }).length, GPC_MAX_SESSIONS);
});

test('anyGpc: only an explicit true counts', () => {
  assert.equal(anyGpc([{ gpc_signal: false }, { gpc_signal: true }]), true);
  assert.equal(anyGpc({ gpc_signal: true }), true);
  assert.equal(anyGpc([{ gpc_signal: null }, { gpc_signal: 'true' }]), false);
  assert.equal(anyGpc(null), false);
});

// --- gpcStop against a mock client ---

function lookupDb({ gpcSessions = [], fail = null } = {}) {
  return mockDatabase((op) => {
    if (fail === op.table) return { data: null, error: { code: 'x' } };
    if (op.table === 'conversion_events') {
      const byEmail = op.filters.some(([k]) => k === 'hashed_email');
      return { data: [{ form_data: { tracking_session_id: byEmail ? 'sess-email' : 'sess-gclid' } }], error: null };
    }
    if (op.table === 'unified_visitors') return { data: [{ first_session_id: 'sess-visitor' }], error: null };
    if (op.table === 'cookie_consents') {
      // The mock does not apply .in(); the stop must still read gpc_signal itself.
      return { data: gpcSessions.map((s) => ({ session_id: s, gpc_signal: true })), error: null };
    }
    return { data: null, error: null };
  });
}

test('gpcStop: no GPC anywhere → no stop', async () => {
  const db = lookupDb();
  assert.deepEqual(await gpcStop(db.client, SITE, { sessionId: 'sess-own', gclid: 'g-1', hashedEmail: HASH }), { stop: false, reason: null });
  const consent = db.calls.find((c) => c.table === 'cookie_consents');
  assert.ok(consent.filters.some(([k, v]) => k === 'gpc_signal' && v === true));
  assert.ok(consent.filters.some(([k, v]) => k === 'site_id' && v === SITE));
});

test('gpcStop: GPC on the own session, a same-gclid session or a same-email session → stop "gpc"', async () => {
  for (const s of ['sess-own', 'sess-gclid', 'sess-email', 'sess-visitor']) {
    const db = lookupDb({ gpcSessions: [s] });
    assert.deepEqual(await gpcStop(db.client, SITE, { sessionId: 'sess-own', gclid: 'g-1', hashedEmail: HASH }), { stop: true, reason: 'gpc' }, s);
  }
});

test('gpcStop: the consumer-level lookup runs on the hashed email, scoped to the site', async () => {
  const db = lookupDb();
  await gpcStop(db.client, SITE, { sessionId: 'sess-own', gclid: 'g-1', hashedEmail: HASH });
  const byEmail = db.calls.find((c) => c.table === 'conversion_events' && c.filters.some(([k]) => k === 'hashed_email'));
  assert.ok(byEmail, 'same-email lookup');
  assert.deepEqual(byEmail.filters, [['site_id', SITE], ['hashed_email', HASH]]);
  const byGclid = db.calls.find((c) => c.table === 'unified_visitors');
  assert.deepEqual(byGclid.filters, [['site_id', SITE], ['gclid', 'g-1']]);
});

test('gpcStop: fails closed on any lookup error, a throw, or no session to check', async () => {
  for (const table of ['conversion_events', 'unified_visitors', 'cookie_consents']) {
    const db = lookupDb({ fail: table });
    assert.deepEqual(await gpcStop(db.client, SITE, { sessionId: 'sess-own', gclid: 'g-1', hashedEmail: HASH }), { stop: true, reason: 'gpc_unverified' }, table);
  }
  const throwing = { from() { throw new Error('boom'); } };
  assert.deepEqual(await gpcStop(throwing, SITE, { sessionId: 's', gclid: 'g', hashedEmail: HASH }), { stop: true, reason: 'gpc_unverified' });
  assert.deepEqual(await gpcStop(lookupDb().client, SITE, { sessionId: undefined }), { stop: true, reason: 'gpc_unverified' });
});

test('gpcStop: reads every consent row, not only the latest (a later row without GPC does not undo it)', () => {
  const src = read('../../supabase/functions/_shared/gpc-stop.ts');
  const q = src.slice(src.indexOf(".from('cookie_consents')"), src.indexOf('.limit(1)', src.indexOf(".from('cookie_consents')")));
  assert.match(q, /\.eq\('gpc_signal', true\)/);
  assert.doesNotMatch(q, /order\(/);
  assert.doesNotMatch(q, /expires_at/);
});

// --- google-ads-quality-upload wiring ---

const tokenKey = Buffer.alloc(32, 7).toString('base64');
const sealedRefresh = await sealToken('refresh-1', tokenKey);
const env = { GOOGLE_ADS_UPLOAD_SECRET: 's', GOOGLE_ADS_DEVELOPER_TOKEN: 'dev', GOOGLE_ADS_TOKEN_KEY: tokenKey };
const ROW = { id: 'c1', gclid: 'g-1', hashed_email: HASH, quality_value: 300, created_at: '2026-11-01T10:00:00Z', form_data: { tracking_session_id: 'sess-1' } };

function uploadDb({ gpc = false, gpcError = false } = {}) {
  return mockDatabase((op) => {
    if (op.table === 'google_ads_connections') {
      return op.columns?.includes('time_zone')
        ? { data: { customer_id: '4567890123', login_customer_id: null, currency_code: 'SEK', time_zone: 'Europe/Stockholm', conversion_action_id: '987', status: 'connected' } }
        : { data: [{ site_id: SITE, conversion_action_id: '987' }] };
    }
    if (op.table === 'google_ads_tokens') return { data: { refresh_token_sealed: sealedRefresh } };
    if (op.table === 'cookie_consents' && op.filters.some(([k]) => k === 'gpc_signal')) {
      return gpcError ? { data: null, error: { code: 'x' } } : { data: gpc ? [{ session_id: 'sess-1', gpc_signal: true }] : [], error: null };
    }
    if (op.table === 'cookie_consents') return { data: { consent_given: true, consent_types: { analytics: true, marketing: true }, gpc_signal: false, expires_at: '2999-01-01T00:00:00Z' } };
    if (op.table === 'unified_visitors') return { data: [] };
    return { data: [ROW] };
  });
}
async function runUpload(db) {
  let outbound = 0;
  const handler = loadEdge('google-ads-quality-upload', db.client, {
    env, fetch: async (url) => { if (String(url).includes('oauth2')) return Response.json({ access_token: 'a' }); outbound++; return Response.json({}); },
  });
  const res = await handler(new Request('https://example.test/upload', { headers: { 'x-cron-secret': 's' } }));
  return { body: await res.json(), outbound };
}

test('upload: a GPC conversion is never sent, is marked skipped_gpc and counted', async () => {
  const db = uploadDb({ gpc: true });
  const { body, outbound } = await runUpload(db);
  assert.equal(outbound, 0);
  assert.ok(db.calls.some((c) => c.type === 'update' && c.payload?.upload_status === 'skipped_gpc'));
  assert.deepEqual(body.results[0].skipped, { gpc: 1, gpc_unverified: 0 });
});

test('upload: a failed GPC lookup fails closed: nothing sent, row back to pending, counted', async () => {
  const db = uploadDb({ gpcError: true });
  const { body, outbound } = await runUpload(db);
  assert.equal(outbound, 0);
  assert.ok(db.calls.some((c) => c.type === 'update' && c.payload?.upload_status === 'pending' && c.filters.some(([k, v]) => k === 'id' && v === 'c1')));
  assert.ok(!db.calls.some((c) => c.payload?.upload_status === 'uploaded'));
  assert.deepEqual(body.results[0].skipped, { gpc: 0, gpc_unverified: 1 });
});

test('upload: without GPC the conversion is still sent', async () => {
  const { body, outbound } = await runUpload(uploadDb());
  assert.equal(outbound, 1);
  assert.deepEqual(body.results[0].skipped, { gpc: 0, gpc_unverified: 0 });
});

test('upload: the GPC stop runs before the jurisdiction gate and does not depend on JURISDICTION_ENFORCE', () => {
  const i = upload.indexOf('gpcStop(supabase');
  assert.ok(i > 0);
  assert.ok(i < upload.indexOf('gateAdsUpload(supabase'));
  const call = upload.slice(i, upload.indexOf('\n', i));
  assert.doesNotMatch(call, /flag|policy/);
  assert.match(upload, /hashedEmail: conversion\.hashed_email/);
});

// --- hubspot-lead-webhook ---

test('webhook: a GPC lead is classified but never queued for upload', () => {
  assert.match(webhook, /import \{ gpcStop \} from '\.\.\/_shared\/gpc-stop\.ts'/);
  assert.match(webhook, /select\('id, gclid, upload_status, form_data'\)/);
  assert.match(webhook, /gpcStop\(supabase, effectiveSiteId, \{[\s\S]*?hashedEmail,[\s\S]*?\}\)/);
  assert.match(webhook, /if \(gpc\.reason === 'gpc'\) uploadStatus = 'skipped_gpc'/);
});

test('webhook: the reported-channel path stays inside CortIQ and never touches upload_status', () => {
  const start = webhook.indexOf('if (reportedProperty && event.propertyName === reportedProperty');
  const end = webhook.indexOf('continue;\n      }', start);
  const block = webhook.slice(start, end);
  assert.ok(start > 0 && end > start);
  assert.match(block, /apply_reported_channel_hubspot/);
  assert.doesNotMatch(block, /upload_status|gclid|fetch\(/);
});

// --- store-consent keeps GPC ---

test('store-consent: GPC is sticky on update; a later request without it does not clear it', () => {
  assert.match(storeConsent, /\.select\('id, gpc_signal'\)/);
  assert.match(storeConsent, /gpc_signal: consentData\.gpc_signal \|\| existingConsent\.gpc_signal === true/);
});

test('store-consent: update keeps gpc_signal true when the later request has no GPC', async () => {
  const db = mockDatabase((op) => {
    if (op.table === 'sites') return { data: { id: SITE }, error: null };
    if (op.table === 'cookie_consents' && op.type === 'select') return { data: { id: 'row-1', gpc_signal: true }, error: null };
    if (op.table === 'cookie_consents' && op.type === 'update') return { data: { id: 'row-1', ...op.payload }, error: null };
    return { data: null, error: null };
  }, async (name) => ({ data: name === 'check_rate_limit' ? true : null, error: null }));
  const handler = loadEdge('store-consent', db.client);
  const res = await handler(new Request('https://fn.test/store-consent', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ site_id: SITE, session_id: 'c-1', consent_types: { analytics: true, marketing: false, preferences: false } }),
  }));
  assert.equal(res.status, 200);
  const update = db.calls.find((c) => c.table === 'cookie_consents' && c.type === 'update');
  assert.equal(update.payload.gpc_signal, true);
});

// --- migration ---

test('migration: skipped_gpc is allowed and every earlier status still is', async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`CREATE TABLE public.conversion_events (id serial PRIMARY KEY, site_id uuid, gclid text, hashed_email text, upload_status text);
      ALTER TABLE public.conversion_events ADD CONSTRAINT conversion_events_upload_status_check CHECK (upload_status IN (
        'not_applicable','pending','uploading','uploaded','skipped_no_consent','skipped_no_gclid','skipped_jurisdiction','failed'));`);
    await pg.exec(read('../../supabase/migrations/20261211000001_upload_status_skipped_gpc.sql'));
    for (const s of ['not_applicable', 'pending', 'uploading', 'uploaded', 'skipped_no_consent', 'skipped_no_gclid', 'skipped_jurisdiction', 'skipped_gpc', 'failed']) {
      await pg.query('INSERT INTO conversion_events (upload_status) VALUES ($1)', [s]);
    }
    await assert.rejects(pg.query(`INSERT INTO conversion_events (upload_status) VALUES ('bogus')`), /check/i);
  } finally { await pg.close(); }
});

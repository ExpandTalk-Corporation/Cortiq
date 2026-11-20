import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mockDatabase, loadEdge } from './edge-harness.mjs';
import { gateAdsUpload, STRICT_POLICY } from '../../supabase/functions/_shared/jurisdiction-edge.ts';

const SITE = '11111111-1111-4111-8111-111111111111';
const OK = { consent_given: true, consent_types: { analytics: true, marketing: true }, gpc_signal: false, expires_at: '2099-01-01T00:00:00Z' };
function ledgerDb(row) {
  const rpcCalls = [];
  const m = mockDatabase(() => ({ data: row, error: null }), async (name, args) => { rpcCalls.push({ name, args }); return { data: null, error: null }; });
  return { ...m, rpcCalls };
}

test('gateAdsUpload: shadow never drops; enforce drops on GPC (hard floor) and on customer "off"', async () => {
  assert.equal((await gateAdsUpload(ledgerDb(OK).client, SITE, 's-1', STRICT_POLICY, undefined)).drop, false);
  assert.equal((await gateAdsUpload(ledgerDb(OK).client, SITE, 's-1', STRICT_POLICY, 'google-ads-quality-upload')).drop, false, 'marketing consent meets the baseline');
  assert.equal((await gateAdsUpload(ledgerDb({ ...OK, gpc_signal: true }).client, SITE, 's-1', STRICT_POLICY, 'all')).drop, true);
  const off = { ...STRICT_POLICY, tighten: { ad_platform_sharing: 'off' } };
  assert.equal((await gateAdsUpload(ledgerDb(OK).client, SITE, 's-1', off, 'all')).drop, true);
  const d = ledgerDb(OK);
  await gateAdsUpload(d.client, SITE, 's-1', STRICT_POLICY, undefined);
  const [log] = d.rpcCalls.filter((c) => c.name === 'log_jurisdiction_decision').map((c) => c.args);
  assert.deepEqual([log.p_fn, log.p_purpose, log.p_country], ['google-ads-quality-upload', 'ad_platform_sharing', '']);
});

test('upload loop: gate after the consent check, dropped rows marked skipped_jurisdiction', () => {
  const src = readFileSync(new URL('../../supabase/functions/google-ads-quality-upload/index.ts', import.meta.url), 'utf8');
  const loop = src.slice(src.indexOf('for (const conversion of claimed)'), src.indexOf('if (pending.length === 0)'));
  assert.ok(loop.indexOf('current.analytics && current.marketing') < loop.indexOf('gateAdsUpload('));
  assert.match(loop, /upload_status: 'skipped_jurisdiction', upload_claimed_at: null/);
  assert.match(src, /loadSitePolicy\(supabase, site\.id\)/);
});

test('store-consent: logs a statistics decision from the stored choice and still stores a refusal', async () => {
  const rpcCalls = [];
  const db = mockDatabase((op) => {
    if (op.table === 'sites') return { data: { id: SITE }, error: null };
    if (op.table === 'cookie_consents' && op.type === 'select') return { data: null, error: null };
    if (op.table === 'cookie_consents' && op.type === 'insert') return { data: { id: 'row-1', ...op.payload }, error: null };
    return { data: null, error: null };
  }, async (name, args) => { rpcCalls.push({ name, args }); return { data: name === 'check_rate_limit' ? true : null, error: null }; });
  const handler = loadEdge('store-consent', db.client, { env: { JURISDICTION_ENFORCE: 'all' } });
  const res = await handler(new Request('https://fn.test/store-consent', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ site_id: SITE, session_id: 'c-1', consent_types: { analytics: false, marketing: false, preferences: false } }),
  }));
  assert.equal(res.status, 200);
  assert.ok(db.calls.some((c) => c.table === 'cookie_consents' && c.type === 'insert'), 'a refusal is always stored');
  const [log] = rpcCalls.filter((c) => c.name === 'log_jurisdiction_decision').map((c) => c.args);
  assert.deepEqual([log.p_fn, log.p_purpose, log.p_reason, log.p_evidence, log.p_enforced], ['store-consent', 'statistics', 'consent_refused', 'ledger', false]);
});

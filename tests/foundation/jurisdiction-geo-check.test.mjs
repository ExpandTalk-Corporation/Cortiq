import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEdge, mockDatabase } from './edge-harness.mjs';
import { signGeo, GEO_HEADER } from '../../supabase/functions/_shared/geo-token.js';

const KEY = 'k'.repeat(32);
const SITE = '11111111-1111-4111-8111-111111111111';

function setup(policy, rateLimit = { data: true, error: null }) {
  const rpcCalls = [];
  const db = mockDatabase(() => ({ data: null, error: null }), async (name, args) => {
    rpcCalls.push({ name, args });
    if (name === 'check_rate_limit') return rateLimit;
    return name === 'get_site_jurisdiction' ? { data: policy, error: null } : { data: null, error: null };
  });
  return { rpcCalls, handler: loadEdge('geo-check', db.client, { env: { GEO_SIGNING_KEY: KEY } }) };
}

test('geo-check ?site=: outcome per purpose, no profile details, nothing logged', async () => {
  const { handler, rpcCalls } = setup({ profile: null, tighten: { statistics: 'off' }, exceptions: [], testSite: false });
  const token = await signGeo({ country: 'SE', region: null, ip: null }, KEY, Math.floor(Date.now() / 1000));
  const body = await (await handler(new Request(`https://fn.test/geo-check?site=${SITE}`, { headers: { [GEO_HEADER]: token } }))).json();
  assert.deepEqual(Object.keys(body), ['country', 'region', 'in_scope', 'outcomes']);
  assert.deepEqual(body.outcomes, { statistics: 'blocked', conversion: 'needs_opt_in', attribution: 'needs_opt_in', ad_platform_sharing: 'needs_opt_in', security: 'needs_opt_in' });
  assert.equal(rpcCalls.some((c) => c.name === 'log_jurisdiction_decision'), false);
});

test('geo-check: invalid site id = plain response without a DB call', async () => {
  const { handler, rpcCalls } = setup(null);
  const body = await (await handler(new Request('https://fn.test/geo-check?site=not-a-uuid'))).json();
  assert.deepEqual(body, { country: null, region: null, in_scope: true });
  assert.equal(rpcCalls.length, 0);
});

test('geo-check ?site=: rate limited per site before the policy read; limited = plain answer, 200', async () => {
  const token = await signGeo({ country: 'SE', region: null, ip: null }, KEY, Math.floor(Date.now() / 1000));
  const ok = setup({ profile: null, tighten: {}, exceptions: [], testSite: false });
  await ok.handler(new Request(`https://fn.test/geo-check?site=${SITE}`, { headers: { [GEO_HEADER]: token } }));
  assert.deepEqual(ok.rpcCalls.map((c) => c.name), ['check_rate_limit', 'get_site_jurisdiction']);
  assert.equal(ok.rpcCalls[0].args.p_key, `geo-check:${SITE}`);

  for (const rateLimit of [{ data: false, error: null }, { data: null, error: { message: 'down' } }]) {
    const { handler, rpcCalls } = setup({ profile: null, tighten: {}, exceptions: [], testSite: false }, rateLimit);
    const res = await handler(new Request(`https://fn.test/geo-check?site=${SITE}`, { headers: { [GEO_HEADER]: token } }));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { country: 'SE', region: null, in_scope: true });
    assert.deepEqual(rpcCalls.map((c) => c.name), ['check_rate_limit']);
  }
});

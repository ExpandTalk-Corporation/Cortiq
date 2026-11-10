import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadEdge, mockDatabase } from './edge-harness.mjs';
import {
  buildAuthorizeUrl, GOOGLE_ADS_SCOPE, openToken, sealToken, signState, STATE_TTL_SECONDS, verifyState,
} from '../../supabase/functions/_shared/google-ads-oauth.ts';

const key = Buffer.alloc(32, 7).toString('base64');
const otherKey = Buffer.alloc(32, 9).toString('base64');
const site = '11111111-1111-4111-8111-111111111111';
const user = '22222222-2222-4222-8222-222222222222';
const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('sealed refresh tokens round-trip and are not plaintext', async () => {
  const sealed = await sealToken('1//refresh-secret', key);
  assert.match(sealed, /^v1:/);
  assert.ok(!sealed.includes('refresh-secret'));
  assert.equal(await openToken(sealed, key), '1//refresh-secret');
  assert.notEqual(await sealToken('1//refresh-secret', key), sealed, 'fresh IV per seal');
});

test('opening with the wrong key or a tampered token fails', async () => {
  const sealed = await sealToken('tok', key);
  await assert.rejects(openToken(sealed, otherKey));
  const i = 12;
  const tampered = sealed.slice(0, i) + (sealed[i] === 'A' ? 'B' : 'A') + sealed.slice(i + 1);
  await assert.rejects(openToken(tampered, key));
});

test('a key that is not 32 bytes is refused', async () => {
  await assert.rejects(sealToken('tok', Buffer.alloc(16).toString('base64')), /32 bytes/);
});

test('OAuth state verifies for the same user and rejects tampering, expiry, other users and other keys', async () => {
  const now = 1_800_000_000;
  const state = await signState({ siteId: site, userId: user }, key, now);
  const ok = await verifyState(state, user, key, now + 10);
  assert.equal(ok.ok, true);
  assert.equal(ok.state.siteId, site);

  assert.deepEqual(await verifyState(state, user, key, now + STATE_TTL_SECONDS + 1), { ok: false, reason: 'expired' });
  assert.deepEqual(await verifyState(state, '33333333-3333-4333-8333-333333333333', key, now), { ok: false, reason: 'user' });
  assert.deepEqual(await verifyState(state, user, otherKey, now), { ok: false, reason: 'signature' });

  const [payload, sig] = state.split('.');
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), s: '44444444-4444-4444-8444-444444444444' })).toString('base64url');
  assert.deepEqual(await verifyState(`${forged}.${sig}`, user, key, now), { ok: false, reason: 'signature' });
  for (const bad of ['', 'x', 'a.b.c', null, 42]) {
    assert.equal((await verifyState(bad, user, key, now)).ok, false);
  }
});

test('authorize URL asks for offline Google Ads access with forced consent', () => {
  const url = new URL(buildAuthorizeUrl('client-id', 'https://cortiq.se/auth/google-ads-callback', 'st'));
  assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(url.searchParams.get('scope'), GOOGLE_ADS_SCOPE);
  assert.equal(GOOGLE_ADS_SCOPE, 'https://www.googleapis.com/auth/adwords');
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('prompt'), 'consent');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('state'), 'st');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://cortiq.se/auth/google-ads-callback');
});

function oauthClient(resolve = () => ({ data: null }), authedUser = { id: user }) {
  const db = mockDatabase(resolve);
  db.client.auth = { getUser: async () => ({ data: { user: authedUser }, error: null }) };
  return db;
}

const post = (body, auth = 'Bearer jwt') => new Request('https://example.test/google-ads-oauth', {
  method: 'POST', headers: auth ? { Authorization: auth, 'Content-Type': 'application/json' } : {}, body: JSON.stringify(body),
});

const configured = { GOOGLE_ADS_TOKEN_KEY: key, GOOGLE_ADS_DEVELOPER_TOKEN: 'dev', GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'sec', FRONTEND_URL: 'https://cortiq.se' };

test('google-ads-oauth requires a bearer token', async () => {
  const { client, calls } = oauthClient();
  const handler = loadEdge('google-ads-oauth', client, { env: configured });
  assert.equal((await handler(post({ action: 'authorize', site_id: site }, ''))).status, 401);
  assert.deepEqual(calls, []);
});

test('google-ads-oauth fails closed when the instance has no token key', async () => {
  const { client } = oauthClient();
  const handler = loadEdge('google-ads-oauth', client, { env: { ...configured, GOOGLE_ADS_TOKEN_KEY: 'short' } });
  const res = await handler(post({ action: 'authorize', site_id: site }));
  assert.equal(res.status, 503);
  assert.equal((await res.json()).code, 'not_configured');
});

test('google-ads-oauth only authorizes the site owner', async () => {
  const { client } = oauthClient(() => ({ data: null }));
  const handler = loadEdge('google-ads-oauth', client, { env: configured });
  assert.equal((await handler(post({ action: 'authorize', site_id: site }))).status, 403);
});

test('google-ads-oauth authorize returns a consent URL with a verifiable state', async () => {
  const { client, calls } = oauthClient((op) => (op.table === 'sites' ? { data: { id: site } } : { data: null }));
  const handler = loadEdge('google-ads-oauth', client, { env: configured });
  const res = await handler(post({ action: 'authorize', site_id: site }));
  assert.equal(res.status, 200);
  const url = new URL((await res.json()).url);
  assert.equal(url.searchParams.get('redirect_uri'), 'https://cortiq.se/auth/google-ads-callback');
  const check = await verifyState(url.searchParams.get('state'), user, key);
  assert.equal(check.ok, true);
  assert.equal(check.state.siteId, site);
  const owner = calls.find((c) => c.table === 'sites');
  assert.ok(owner.filters.some(([k, v]) => k === 'user_id' && v === user));
});

test('google-ads-oauth callback rejects a forged state before talking to Google', async () => {
  const { client, calls } = oauthClient((op) => (op.table === 'sites' ? { data: { id: site } } : { data: null }));
  let outbound = 0;
  const handler = loadEdge('google-ads-oauth', client, { env: configured, fetch: async () => { outbound++; throw new Error('no'); } });
  const forged = await signState({ siteId: site, userId: user }, otherKey);
  const res = await handler(post({ action: 'callback', code: 'abc', state: forged }));
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, 'state_signature');
  assert.equal(outbound, 0);
  assert.ok(!calls.some((c) => c.table === 'google_ads_tokens'));
});

test('google-ads-oauth callback rejects a state issued to another user', async () => {
  const { client } = oauthClient(() => ({ data: { id: site } }), { id: '33333333-3333-4333-8333-333333333333' });
  const handler = loadEdge('google-ads-oauth', client, { env: configured });
  const state = await signState({ siteId: site, userId: user }, key);
  const res = await handler(post({ action: 'callback', code: 'abc', state }));
  assert.equal((await res.json()).code, 'state_user');
});

test('responses never select the sealed token for the browser', () => {
  const src = read('supabase/functions/google-ads-oauth/index.ts');
  const publicColumns = src.match(/PUBLIC_COLUMNS =\s*'([^']+)'/)[1];
  assert.doesNotMatch(publicColumns, /token/);
  assert.match(src, /UUID\.test\(siteId\)/);
});

test('config.toml makes the OAuth function public and keeps report functions behind JWT', () => {
  const toml = read('supabase/config.toml');
  assert.match(toml, /\[functions\.google-ads-oauth\]\s*\nverify_jwt = false/);
  assert.match(toml, /\[functions\.google-ads-import\]\s*\nverify_jwt = true/);
  assert.match(toml, /\[functions\.click-fraud-analysis\]\s*\nverify_jwt = true/);
});

test('migration 04: token table is service-role only, connections are owner-readable', () => {
  const sql = read('supabase/migrations/20261117000004_google_ads_oauth.sql');
  assert.match(sql, /ALTER TABLE public\.google_ads_tokens ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON public\.google_ads_tokens FROM PUBLIC, anon, authenticated/);
  assert.doesNotMatch(sql, /CREATE POLICY[^;]*ON public\.google_ads_tokens/);
  assert.doesNotMatch(sql, /GRANT [^;]*ON public\.google_ads_tokens TO [^;]*authenticated/);
  assert.match(sql, /refresh_token_sealed text NOT NULL CHECK \(refresh_token_sealed LIKE 'v1:%'\)/);
  assert.match(sql, /ALTER TABLE public\.google_ads_connections ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /FOR SELECT TO authenticated\s+USING \(site_id IN \(SELECT id FROM public\.sites WHERE user_id = auth\.uid\(\)\)\)/);
  assert.match(sql, /GRANT SELECT ON public\.google_ads_connections TO authenticated/);
});

test('migration 05: click-fraud RPC is owner-checked, range-limited and not callable by anon', () => {
  const sql = read('supabase/migrations/20261117000005_click_fraud_signals.sql');
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /SET search_path = ''/);
  assert.match(sql, /WHERE id = p_site_id AND user_id = auth\.uid\(\)/);
  assert.match(sql, /> 366/);
  assert.match(sql, /REVOKE EXECUTE ON FUNCTION public\.get_click_fraud_signals\(uuid, date, date\) FROM PUBLIC, anon/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.get_click_fraud_signals\(uuid, date, date\) TO authenticated/);
  // Only counts leave the function: no click id, session token or IP in the output.
  const output = sql.slice(sql.indexOf('SELECT jsonb_build_object('));
  assert.doesNotMatch(output, /'(click_id|session_id|ip|ip_address)'/);
});

test('no edge function still reads pasted Google Ads credentials', () => {
  for (const fn of ['google-ads-import', 'click-fraud-analysis', 'google-ads-quality-upload']) {
    const src = read(`supabase/functions/${fn}/index.ts`);
    assert.doesNotMatch(src, /integration_config|google_ads_access_token|developer_token\b/, fn);
    assert.match(src, /loadSiteAdsAuth\(/, fn);
  }
});

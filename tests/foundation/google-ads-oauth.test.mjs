import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadEdge, mockDatabase } from './edge-harness.mjs';
import {
  buildAuthorizeUrl, GOOGLE_ADS_SCOPE, openToken, sealToken, signState, STATE_TTL_SECONDS, verifyState,
} from '../../supabase/functions/_shared/google-ads-oauth.ts';
import {
  assessTracking, CLICK_VIEW_MAX_DAYS, clickViewDays, dayInZone, hasUtmCampaign, isValidTimeZone, parseConversionActions,
  SUGGESTED_FINAL_URL_SUFFIX,
} from '../../supabase/functions/_shared/google-ads-setup.ts';

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
  assert.match(publicColumns, /conversion_action_id/);
  assert.match(publicColumns, /tracking_check/);
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

test('migration 06: conversion action columns and a time-zone-aware click-fraud RPC', () => {
  const sql = read('supabase/migrations/20261117000006_google_ads_conversion_action_and_tz.sql');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS conversion_action_id\s+text CHECK \(conversion_action_id IS NULL OR conversion_action_id ~ '\^\[0-9\]\{1,20\}\$'\)/);
  assert.match(sql, /DROP FUNCTION IF EXISTS public\.get_click_fraud_signals\(uuid, date, date\)/);
  assert.match(sql, /p_tz text DEFAULT 'UTC', p_click_campaigns jsonb DEFAULT NULL/);
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /SET search_path = ''/);
  assert.match(sql, /WHERE id = p_site_id AND user_id = auth\.uid\(\)/);
  assert.match(sql, /> 366/);
  assert.match(sql, /pg_catalog\.pg_timezone_names WHERE name = p_tz/);
  assert.match(sql, /> 50000/);
  assert.match(sql, /\(s\.started_at AT TIME ZONE p_tz\)::date AS day/);
  assert.match(sql, /coalesce\(p_click_campaigns ->> p0\.gclid, p0\.campaign\)/);
  assert.match(sql, /REVOKE EXECUTE ON FUNCTION public\.get_click_fraud_signals\(uuid, date, date, text, jsonb\) FROM PUBLIC, anon/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.get_click_fraud_signals\(uuid, date, date, text, jsonb\) TO authenticated/);
  // Input map only: no click id, session token or IP in the output.
  const output = sql.slice(sql.indexOf('SELECT jsonb_build_object('));
  assert.doesNotMatch(output, /'(click_id|gclid|session_id|ip|ip_address)'/);
  assert.doesNotMatch(sql, /GRANT [^;]*google_ads_tokens/);
});

test('conversion actions: only enabled UPLOAD_CLICKS actions with numeric ids', () => {
  const rows = [
    { conversionAction: { id: '11', name: 'Lead quality', type: 'UPLOAD_CLICKS', status: 'ENABLED', category: 'QUALIFIED_LEAD' } },
    { conversionAction: { id: '12', name: 'Website lead', type: 'WEBPAGE', status: 'ENABLED' } },
    { conversionAction: { id: '13', name: 'Old', type: 'UPLOAD_CLICKS', status: 'REMOVED' } },
    { conversionAction: { id: 'x', name: 'Bad', type: 'UPLOAD_CLICKS', status: 'ENABLED' } },
  ];
  assert.deepEqual(parseConversionActions(rows), [{ id: '11', name: 'Lead quality', type: 'UPLOAD_CLICKS', status: 'ENABLED', category: 'QUALIFIED_LEAD' }]);
});

test('tracking check: account suffix with utm_campaign covers campaigns without their own suffix', () => {
  assert.equal(hasUtmCampaign(SUGGESTED_FINAL_URL_SUFFIX), true);
  assert.equal(hasUtmCampaign('utm_source=google&utm_medium=cpc'), false);
  assert.equal(hasUtmCampaign(null), false);
  const ok = assessTracking({ finalUrlSuffix: SUGGESTED_FINAL_URL_SUFFIX, autoTaggingEnabled: true },
    [{ campaign: { id: '1', name: 'A' } }, { campaign: { id: '2', name: 'B', finalUrlSuffix: 'utm_campaign=b' } }]);
  assert.equal(ok.ok, true);
  assert.equal(ok.campaigns_without_utm_count, 0);

  // A campaign's own suffix replaces the account suffix.
  const partial = assessTracking({ finalUrlSuffix: SUGGESTED_FINAL_URL_SUFFIX },
    [{ campaign: { id: '1', name: 'A', finalUrlSuffix: 'utm_source=google' } }, { campaign: { id: '2', name: 'B' } }]);
  assert.equal(partial.ok, false);
  assert.deepEqual(partial.campaigns_without_utm, [{ id: '1', name: 'A' }]);

  const none = assessTracking({}, [{ campaign: { id: '1', name: 'A' } }]);
  assert.equal(none.ok, false);
  assert.equal(none.account_has_utm_campaign, false);
  assert.equal(none.suggested_suffix, SUGGESTED_FINAL_URL_SUFFIX);
});

test('time zones: valid IANA names only, dates computed in the account zone', () => {
  assert.equal(isValidTimeZone('Europe/Stockholm'), true);
  assert.equal(isValidTimeZone('UTC'), true);
  assert.equal(isValidTimeZone("UTC'; DROP"), false);
  assert.equal(isValidTimeZone('Not/AZone'), false);
  assert.equal(isValidTimeZone(null), false);
  // 23:30 UTC on 1 Nov is already 2 Nov in Stockholm (CET, UTC+1) and still 1 Nov in Los Angeles.
  const d = new Date('2026-11-01T23:30:00Z');
  assert.equal(dayInZone(d, 'UTC'), '2026-11-01');
  assert.equal(dayInZone(d, 'Europe/Stockholm'), '2026-11-02');
  assert.equal(dayInZone(d, 'America/Los_Angeles'), '2026-11-01');
});

test('click_view days: only days with clicks, inside the range and the last 90 days, newest first, capped', () => {
  const days = {};
  for (let i = 0; i < 120; i++) {
    const d = new Date(Date.parse('2026-11-10T00:00:00Z') - i * 86_400_000).toISOString().slice(0, 10);
    days[d] = { clicks: i % 10 === 5 ? 0 : 3 };
  }
  const plan = clickViewDays(days, '2026-07-01', '2026-11-10', '2026-11-10');
  assert.equal(plan.days.length, CLICK_VIEW_MAX_DAYS);
  assert.equal(plan.days[0], '2026-11-10');
  assert.ok(plan.days.every((d, i) => i === 0 || d < plan.days[i - 1]));
  assert.ok(!plan.days.includes('2026-11-05'), 'days without clicks are skipped');
  assert.ok(plan.tooOld > 0);
  assert.ok(plan.overLimit > 0);
  const old = clickViewDays({ '2026-01-01': { clicks: 5 } }, '2026-01-01', '2026-01-31', '2026-11-10');
  assert.deepEqual(old.days, []);
  assert.equal(old.tooOld, 1);
});

test('google-ads-oauth only accepts a conversion action from the list read from the account', () => {
  const src = read('supabase/functions/google-ads-oauth/index.ts');
  assert.match(src, /action === 'select_conversion_action'/);
  assert.match(src, /conversion_actions \?\? \[\]\) as ConversionActionOption\[\]\)\.find/);
  assert.match(src, /action === 'refresh_setup'/);
  // Switching account clears the action (it belongs to one account).
  const select = src.slice(src.indexOf("action === 'select_customer'"), src.indexOf("action === 'refresh_setup'"));
  assert.match(select, /conversion_action_id: null/);
});

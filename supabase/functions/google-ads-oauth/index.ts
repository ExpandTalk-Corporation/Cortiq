// google-ads-oauth - connect a site to Google Ads through OAuth.
//
// Actions (POST JSON, all require the caller's Supabase JWT; verify_jwt is off in config.toml
// because the browser callback page posts here, so auth is checked in code):
//   authorize        {site_id}              -> {url}  Google consent URL with a signed state
//   callback         {code, state}          -> {connection}  exchange code, seal refresh token, list accounts
//   accounts         {site_id}              -> {connection}  refresh the account list
//   select_customer  {site_id, customer_id} -> {connection}  pick the account this site reports on
//                                                            (clears the conversion action, reruns setup)
//   refresh_setup    {site_id}              -> {connection}  reread time zone, currency, upload-capable
//                                                            conversion actions and the final URL suffix check
//   select_conversion_action {site_id, conversion_action_id} -> {connection}  pick the UPLOAD_CLICKS action
//                                                            google-ads-quality-upload sends lead quality to
//   disconnect       {site_id}              -> {ok}  revoke at Google (best effort) and delete
//
// Only the site owner (sites.user_id = auth.uid()) may connect or change the connection. The
// refresh token is sealed with GOOGLE_ADS_TOKEN_KEY and written to google_ads_tokens, which the
// browser cannot read. Nothing in a response ever contains a token.
// deno-lint-ignore-file no-explicit-any
import { createClient } from '../_shared/supabase.ts';
import {
  AdsApiError, cleanCustomerId, developerTokenFromEnv, fetchWithTimeout, listAccessibleCustomers,
  isAdsAuth, loadSiteAdsAuth, refreshAccessToken, searchStream,
} from '../_shared/google-ads.ts';
import { type ConversionActionOption, loadAccountSetup } from '../_shared/google-ads-setup.ts';
import {
  buildAuthorizeUrl, GOOGLE_ADS_SCOPE, openToken, sealToken, signState, tokenKeyFromEnv, verifyState,
} from '../_shared/google-ads-oauth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const UUID =/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ACCOUNTS = 200;
const PUBLIC_COLUMNS =
  'site_id, customer_id, login_customer_id, descriptive_name, currency_code, time_zone, accessible_customers, conversion_action_id, conversion_action_name, conversion_actions, tracking_check, setup_checked_at, status, last_error, connected_at, updated_at';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

export interface AdsAccount {
  id: string;
  name: string | null;
  currency: string | null;
  time_zone: string | null;
  manager: boolean;
  /** Manager account to send as login-customer-id when access goes through it. */
  login_customer_id: string | null;
}

function redirectUri(): string {
  const base = (Deno.env.get('FRONTEND_URL') || 'https://cortiq.se').replace(/\/+$/, '');
  return `${base}/auth/google-ads-callback`;
}

/** Every non-manager account the user can report on: direct accounts plus clients of managers (one level down). */
async function discoverAccounts(accessToken: string, developerToken: string): Promise<AdsAccount[]> {
  const direct = await listAccessibleCustomers({ accessToken, developerToken });
  const envManager = cleanCustomerId(Deno.env.get('GOOGLE_ADS_LOGIN_CUSTOMER_ID') ?? '');
  const roots = [...new Set([...direct, ...(envManager && /^\d{10}$/.test(envManager) ? [envManager] : [])])].slice(0, 50);

  const found = new Map<string, AdsAccount>();
  for (const id of roots) {
    try {
      const [row] = await searchStream(
        { accessToken, developerToken, customerId: id, loginCustomerId: direct.includes(id) ? null : id },
        'SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager FROM customer LIMIT 1',
        20_000,
      );
      const c = row?.customer;
      if (!c) continue;
      if (!c.manager) {
        if (direct.includes(id)) {
          found.set(id, { id, name: c.descriptiveName ?? null, currency: c.currencyCode ?? null, time_zone: c.timeZone ?? null, manager: false, login_customer_id: null });
        }
        continue;
      }
      const clients = await searchStream(
        { accessToken, developerToken, customerId: id, loginCustomerId: id },
        `SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code,
                customer_client.time_zone, customer_client.manager, customer_client.level
         FROM customer_client
         WHERE customer_client.level <= 1 AND customer_client.status = 'ENABLED'`,
        30_000,
      );
      for (const r of clients) {
        const cc = r?.customerClient;
        const cid = cleanCustomerId(String(cc?.id ?? ''));
        if (!cid || cc?.manager || found.has(cid)) continue;
        found.set(cid, {
          id: cid, name: cc.descriptiveName ?? null, currency: cc.currencyCode ?? null,
          time_zone: cc.timeZone ?? null, manager: false, login_customer_id: id,
        });
        if (found.size >= MAX_ACCOUNTS) break;
      }
    } catch (e) {
      // An account the user can list but not query (cancelled, no permission) is skipped.
      console.warn('[google-ads-oauth] skipped account', id, e instanceof AdsApiError ? e.status : '');
    }
    if (found.size >= MAX_ACCOUNTS) break;
  }
  return [...found.values()].sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id));
}

async function exchangeCode(code: string): Promise<{ refresh_token?: string; access_token?: string; scope?: string }> {
  const resp = await fetchWithTimeout('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: Deno.env.get('GOOGLE_CLIENT_ID') ?? '',
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '',
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
    }),
  }, 20_000);
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(`Google rejected the authorization code (${body?.error ?? resp.status}). Try connecting again.`);
  }
  return await resp.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const svc = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

  const authorization = req.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
  const { data: { user } = { user: null }, error: authError } = await svc.auth.getUser(authorization.slice(7));
  if (authError || !user) return json({ error: 'Unauthorized' }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  const action = String(body?.action ?? '');

  // Fail closed when the instance is not set up for Google Ads.
  const keyOk = (() => {
    try {
      return atob(tokenKeyFromEnv()).length === 32;
    } catch {
      return false;
    }
  })();
  const developerToken = developerTokenFromEnv();
  if (!keyOk || !developerToken || !Deno.env.get('GOOGLE_CLIENT_ID') || !Deno.env.get('GOOGLE_CLIENT_SECRET')) {
    return json({ error: 'Google Ads is not configured on this CortIQ instance.', code: 'not_configured' }, 503);
  }

  const ownsSite = async (siteId: unknown): Promise<boolean> => {
    if (typeof siteId !== 'string' || !UUID.test(siteId)) return false;
    const { data } = await svc.from('sites').select('id').eq('id', siteId).eq('user_id', user.id).maybeSingle();
    return !!data;
  };
  const publicConnection = async (siteId: string) => {
    const { data } = await svc.from('google_ads_connections').select(PUBLIC_COLUMNS).eq('site_id', siteId).maybeSingle();
    return data as any;
  };
  /**
   * Reads the picked account's time zone, currency, upload-capable conversion actions and final
   * URL suffixes, and caches them on the connection. A picked action that is no longer enabled is
   * cleared so uploads stop instead of failing. Errors are stored in last_error, not thrown.
   */
  const refreshSetup = async (siteId: string): Promise<string[]> => {
    const auth = await loadSiteAdsAuth(svc, siteId);
    if (!isAdsAuth(auth)) return [auth.error];
    const setup = await loadAccountSetup(auth);
    const update: Record<string, unknown> = {
      conversion_actions: setup.conversion_actions,
      setup_checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_error: setup.errors.length ? setup.errors.join('; ').slice(0, 300) : null,
    };
    if (setup.tracking_check) update.tracking_check = setup.tracking_check;
    if (setup.time_zone) update.time_zone = setup.time_zone;
    if (setup.currency_code) update.currency_code = setup.currency_code;
    const actionsRead = !setup.errors.some((e) => e.startsWith('conversion actions'));
    if (actionsRead && auth.conversionActionId && !setup.conversion_actions.some((a) => a.id === auth.conversionActionId)) {
      update.conversion_action_id = null;
      update.conversion_action_name = null;
    }
    await svc.from('google_ads_connections').update(update).eq('site_id', siteId);
    return setup.errors;
  };

  try {
    if (action === 'authorize') {
      if (!(await ownsSite(body.site_id))) return json({ error: 'Site not found or access denied' }, 403);
      const state = await signState({ siteId: body.site_id, userId: user.id });
      return json({ url: buildAuthorizeUrl(Deno.env.get('GOOGLE_CLIENT_ID')!, redirectUri(), state) });
    }

    if (action === 'callback') {
      if (typeof body.code !== 'string' || !body.code || body.code.length > 2048) return json({ error: 'Missing code' }, 400);
      const check = await verifyState(body.state, user.id);
      if (!check.ok) {
        const msg = check.reason === 'expired' ? 'The connection link expired. Start again from Settings → Integrations.'
          : 'Invalid OAuth state. Start again from Settings → Integrations.';
        return json({ error: msg, code: `state_${check.reason}` }, 400);
      }
      const siteId = check.state.siteId;
      if (!(await ownsSite(siteId))) return json({ error: 'Site not found or access denied' }, 403);

      const tokens = await exchangeCode(body.code);
      if (!tokens.refresh_token) {
        return json({ error: 'Google did not return a refresh token. Remove CortIQ under myaccount.google.com/permissions and connect again.' }, 400);
      }
      if (tokens.scope && !tokens.scope.split(' ').includes(GOOGLE_ADS_SCOPE)) {
        return json({ error: 'Google Ads access was not granted. Tick the Google Ads permission when you connect.' }, 400);
      }

      const sealed = await sealToken(tokens.refresh_token);
      const now = new Date().toISOString();
      const { error: tokErr } = await svc.from('google_ads_tokens')
        .upsert({ site_id: siteId, refresh_token_sealed: sealed, scope: tokens.scope ?? GOOGLE_ADS_SCOPE, updated_at: now }, { onConflict: 'site_id' });
      if (tokErr) throw new Error('Could not store the Google Ads connection');

      let accounts: AdsAccount[] = [];
      let lastError: string | null = null;
      try {
        accounts = await discoverAccounts(tokens.access_token ?? await refreshAccessToken(tokens.refresh_token), developerToken);
      } catch (e) {
        lastError = e instanceof Error ? e.message.slice(0, 300) : 'Could not list Google Ads accounts';
      }
      const only = accounts.length === 1 ? accounts[0] : null;
      const { error: connErr } = await svc.from('google_ads_connections').upsert({
        site_id: siteId,
        accessible_customers: accounts,
        customer_id: only?.id ?? null,
        login_customer_id: only?.login_customer_id ?? null,
        descriptive_name: only?.name ?? null,
        currency_code: only?.currency ?? null,
        time_zone: only?.time_zone ?? null,
        status: lastError ? 'error' : 'connected',
        last_error: lastError,
        connected_by: user.id,
        connected_at: now,
        updated_at: now,
      }, { onConflict: 'site_id' });
      if (connErr) throw new Error('Could not store the Google Ads connection');
      await svc.from('sites').update({ google_ads_customer_id: only?.id ?? null }).eq('id', siteId);
      if (only) {
        try { await refreshSetup(siteId); } catch (e) { console.warn('[google-ads-oauth] setup', e instanceof Error ? e.message : e); }
      }
      return json({ site_id: siteId, connection: await publicConnection(siteId) });
    }

    const siteId = body.site_id as string;
    if (!(await ownsSite(siteId))) return json({ error: 'Site not found or access denied' }, 403);

    if (action === 'accounts') {
      const { data: tok } = await svc.from('google_ads_tokens').select('refresh_token_sealed').eq('site_id', siteId).maybeSingle();
      if (!tok) return json({ error: 'Google Ads is not connected.', code: 'not_connected' }, 400);
      try {
        const accessToken = await refreshAccessToken(await openToken(tok.refresh_token_sealed));
        const accounts = await discoverAccounts(accessToken, developerToken);
        await svc.from('google_ads_connections')
          .update({ accessible_customers: accounts, status: 'connected', last_error: null, updated_at: new Date().toISOString() })
          .eq('site_id', siteId);
      } catch (e) {
        await svc.from('google_ads_connections')
          .update({ status: 'error', last_error: e instanceof Error ? e.message.slice(0, 300) : 'error', updated_at: new Date().toISOString() })
          .eq('site_id', siteId);
      }
      return json({ connection: await publicConnection(siteId) });
    }

    if (action === 'select_customer') {
      const wanted = cleanCustomerId(String(body.customer_id ?? ''));
      const conn = await publicConnection(siteId);
      if (!conn) return json({ error: 'Google Ads is not connected.', code: 'not_connected' }, 400);
      const account = (conn.accessible_customers as AdsAccount[] ?? []).find((a) => a.id === wanted);
      if (!account) return json({ error: 'That account is not reachable with this Google login.' }, 400);
      await svc.from('google_ads_connections').update({
        customer_id: account.id,
        login_customer_id: account.login_customer_id,
        descriptive_name: account.name,
        currency_code: account.currency,
        time_zone: account.time_zone,
        // A conversion action belongs to one account: switching accounts clears it.
        conversion_action_id: null,
        conversion_action_name: null,
        conversion_actions: [],
        tracking_check: null,
        setup_checked_at: null,
        updated_at: new Date().toISOString(),
      }).eq('site_id', siteId);
      await svc.from('sites').update({ google_ads_customer_id: account.id }).eq('id', siteId);
      try { await refreshSetup(siteId); } catch (e) { console.warn('[google-ads-oauth] setup', e instanceof Error ? e.message : e); }
      return json({ connection: await publicConnection(siteId) });
    }

    if (action === 'refresh_setup') {
      const conn = await publicConnection(siteId);
      if (!conn?.customer_id) return json({ error: 'Pick a Google Ads account first.', code: 'no_customer' }, 400);
      const errors = await refreshSetup(siteId);
      return json({ connection: await publicConnection(siteId), errors });
    }

    if (action === 'select_conversion_action') {
      const wanted = String(body.conversion_action_id ?? '');
      const conn = await publicConnection(siteId);
      if (!conn?.customer_id) return json({ error: 'Pick a Google Ads account first.', code: 'no_customer' }, 400);
      if (wanted === '') {
        await svc.from('google_ads_connections')
          .update({ conversion_action_id: null, conversion_action_name: null, updated_at: new Date().toISOString() })
          .eq('site_id', siteId);
        return json({ connection: await publicConnection(siteId) });
      }
      // Only an action from the list read from this account (enabled, UPLOAD_CLICKS).
      const pick = ((conn.conversion_actions ?? []) as ConversionActionOption[]).find((a) => a.id === wanted);
      if (!/^\d{1,20}$/.test(wanted) || !pick) {
        return json({ error: 'That conversion action is not an enabled "Import from clicks" action in this account. Recheck and pick again.' }, 400);
      }
      await svc.from('google_ads_connections')
        .update({ conversion_action_id: pick.id, conversion_action_name: pick.name, updated_at: new Date().toISOString() })
        .eq('site_id', siteId);
      return json({ connection: await publicConnection(siteId) });
    }

    if (action === 'disconnect') {
      const { data: tok } = await svc.from('google_ads_tokens').select('refresh_token_sealed').eq('site_id', siteId).maybeSingle();
      if (tok?.refresh_token_sealed) {
        try {
          const refresh = await openToken(tok.refresh_token_sealed);
          await fetchWithTimeout('https://oauth2.googleapis.com/revoke', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ token: refresh }),
          }, 10_000);
        } catch {
          // Best effort: the rows are deleted either way.
        }
      }
      await svc.from('google_ads_tokens').delete().eq('site_id', siteId);
      await svc.from('google_ads_connections').delete().eq('site_id', siteId);
      await svc.from('sites').update({ google_ads_customer_id: null }).eq('id', siteId);
      return json({ ok: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    console.error('[google-ads-oauth]', action, e instanceof Error ? e.message : e);
    return json({ error: e instanceof Error ? e.message : 'Google Ads request failed' }, 502);
  }
});

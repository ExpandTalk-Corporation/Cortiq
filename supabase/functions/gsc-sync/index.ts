import { createClient } from '../_shared/supabase.ts';
import { corsHeaders } from '../_shared/validateRequest.ts';
import { monthPeriods, GSC_HISTORY_MONTHS, type MonthPeriod } from '../_shared/gsc-periods.ts';

// Syncs Search Console data per calendar month (see _shared/gsc-periods.ts). Two callers:
//  - the dashboard (user JWT, one site the caller owns): the previous and current month,
//    or 16 months of history on a site's first sync or when the owner asks ({ history: true });
//  - the daily pg_cron job gsc-daily-sync (x-cron-secret header, checked against a vault
//    secret): the previous and current month for every site with an active property.
// verify_jwt is off in config.toml because the cron job has no user JWT; both paths authenticate here.

const REFRESH_COOLDOWN_MS = 5 * 60 * 1000;

async function refreshAccessToken(credential: any): Promise<string> {
  const clientId     = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('Missing Google OAuth credentials');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: credential.refresh_token,
      grant_type: 'refresh_token',
    }).toString(),
  });

  if (!res.ok) {
    console.error('Token refresh failed:', res.status);
    throw new Error('Failed to refresh Google access token');
  }

  const data = await res.json();
  return data.access_token;
}

async function queryGSC(
  accessToken: string,
  propertyUrl: string,
  startDate: string,
  endDate: string,
  dimension: 'query' | 'page',
  rowLimit = 200
): Promise<{ value: string; clicks: number; impressions: number; ctr: number; position: number }[]> {
  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(propertyUrl)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate, endDate, dimensions: [dimension], searchType: 'web', rowLimit }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`GSC API error ${res.status}: ${JSON.stringify(err)}`);
  }

  const data = await res.json();
  return (data.rows || []).map((row: any) => ({
    value:       row.keys[0],
    clicks:      row.clicks     ?? 0,
    impressions: row.impressions ?? 0,
    ctr:         row.ctr        ?? 0,
    position:    row.position   ?? 0,
  }));
}

// AI search types to attempt — Google is rolling these out gradually.
// If the API returns 400/403 the type is not yet available for this property; we skip silently.
const AI_SEARCH_TYPES = ['AI_OVERVIEWS', 'AI_MODE', 'DISCOVER_AI'] as const;
type AISearchType = typeof AI_SEARCH_TYPES[number];
type AIDimension  = 'page' | 'country' | 'device';

interface AIRow { value: string; impressions: number }

async function queryGSCAI(
  accessToken: string,
  propertyUrl: string,
  startDate: string,
  endDate: string,
  searchType: AISearchType,
  dimension: AIDimension,
  rowLimit = 200
): Promise<AIRow[] | null> {
  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(propertyUrl)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate, endDate, dimensions: [dimension], searchType, rowLimit }),
    }
  );

  // 400 / 403 = search type not yet available for this property — not an error
  if (res.status === 400 || res.status === 403) return null;

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error(`GSC AI query failed (${searchType}/${dimension}):`, err);
    return null;
  }

  const data = await res.json();
  return (data.rows || []).map((row: any) => ({
    value:       row.keys[0],
    impressions: row.impressions ?? 0,
  }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase = any;

interface Credential {
  id: string;
  site_id: string;
  property_url: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
  last_token_refresh_at: string | null;
}

const CREDENTIAL_COLUMNS = 'id, site_id, property_url, access_token, refresh_token, token_expires_at, last_token_refresh_at';
const DAILY_MONTHS = 2;
const QUERY_ROWS = 1000;
const PAGE_ROWS = 200;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// Refresh when the token expires within a minute (with a 5-min cooldown between refreshes).
async function validAccessToken(supabase: Supabase, credential: Credential): Promise<string> {
  const now = new Date();
  if (new Date(credential.token_expires_at).getTime() - now.getTime() > 60_000) return credential.access_token;

  const lastRefresh = credential.last_token_refresh_at ? new Date(credential.last_token_refresh_at) : null;
  if (lastRefresh && now.getTime() - lastRefresh.getTime() < REFRESH_COOLDOWN_MS) return credential.access_token;

  const accessToken = await refreshAccessToken(credential);
  await supabase
    .from('site_google_credentials')
    .update({
      access_token: accessToken,
      token_expires_at: new Date(now.getTime() + 3600 * 1000).toISOString(),
      last_token_refresh_at: now.toISOString(),
    })
    .eq('id', credential.id);
  return accessToken;
}

async function syncMonth(supabase: Supabase, accessToken: string, credential: Credential, period: MonthPeriod) {
  const { site_id, property_url } = credential;
  const { periodStart, periodEnd, queryEnd } = period;

  const [queries, pages] = await Promise.all([
    queryGSC(accessToken, property_url, periodStart, queryEnd, 'query', QUERY_ROWS),
    queryGSC(accessToken, property_url, periodStart, queryEnd, 'page', PAGE_ROWS),
  ]);

  // Replace the whole month, so a query that dropped out of the top rows does not linger.
  const { error: deleteError } = await supabase
    .from('gsc_data')
    .delete()
    .eq('site_id', site_id)
    .eq('period_start', periodStart)
    .eq('period_end', periodEnd);
  if (deleteError) throw deleteError;

  const rows = [
    ...queries.map((r) => ({ site_id, period_start: periodStart, period_end: periodEnd, dimension: 'query', ...r })),
    ...pages.map((r) => ({ site_id, period_start: periodStart, period_end: periodEnd, dimension: 'page', ...r })),
  ];
  if (rows.length > 0) {
    const { error } = await supabase.from('gsc_data').insert(rows);
    if (error) throw error;
  }

  // AI search types: replace only the type/dimension pairs the API answered for,
  // so an unavailable type or a transient failure keeps what was synced before.
  const aiDimensions: AIDimension[] = ['page', 'country', 'device'];
  await Promise.all(
    AI_SEARCH_TYPES.flatMap((searchType) =>
      aiDimensions.map(async (dimension) => {
        const results = await queryGSCAI(accessToken, property_url, periodStart, queryEnd, searchType, dimension);
        if (!results) return;
        await supabase
          .from('gsc_ai_data')
          .delete()
          .eq('site_id', site_id)
          .eq('period_start', periodStart)
          .eq('period_end', periodEnd)
          .eq('search_type', searchType)
          .eq('dimension', dimension);
        if (results.length === 0) return;
        const { error } = await supabase.from('gsc_ai_data').insert(results.map((r) => ({
          site_id, period_start: periodStart, period_end: periodEnd,
          search_type: searchType, dimension, value: r.value, impressions: r.impressions,
        })));
        if (error) console.error(`GSC AI insert failed (${searchType}/${dimension}):`, error);
      })
    )
  );

  return { queries: queries.length, pages: pages.length };
}

async function syncCredential(supabase: Supabase, credential: Credential, history: boolean) {
  // A site's first sync loads the full history, so the monthly chart is not empty.
  if (!history) {
    const { count } = await supabase
      .from('gsc_data')
      .select('id', { count: 'exact', head: true })
      .eq('site_id', credential.site_id);
    history = !count;
  }

  const accessToken = await validAccessToken(supabase, credential);
  const periods = monthPeriods(new Date(), history ? GSC_HISTORY_MONTHS : DAILY_MONTHS);
  let current = { queries: 0, pages: 0 };
  for (const period of periods) current = await syncMonth(supabase, accessToken, credential, period);

  await supabase
    .from('site_google_credentials')
    .update({ last_sync_at: new Date().toISOString() })
    .eq('id', credential.id);

  return { ...current, months: periods.length, from: periods[0].periodStart, to: periods[periods.length - 1].queryEnd };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const siteId: string | undefined = body.site_id;
    const history = body.history === true;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Daily cron job: every site with an active property.
    const cronSecret = req.headers.get('x-cron-secret');
    if (cronSecret) {
      const { data: ok } = await supabase.rpc('gsc_cron_secret_matches', { p_secret: cronSecret });
      if (ok !== true) return json({ error: 'Forbidden' }, 403);

      const { data: credentials, error } = await supabase
        .from('site_google_credentials')
        .select(CREDENTIAL_COLUMNS)
        .eq('is_active', true);
      if (error) throw error;

      const sites: Record<string, unknown>[] = [];
      for (const credential of (credentials ?? []) as Credential[]) {
        try {
          sites.push({ site_id: credential.site_id, ...(await syncCredential(supabase, credential, false)) });
        } catch (err: any) {
          console.error(`GSC daily sync failed for site ${credential.site_id}:`, err);
          sites.push({ site_id: credential.site_id, error: err.message ?? 'sync failed' });
        }
      }
      return json({ success: sites.every((s) => !('error' in s)), sites });
    }

    // Dashboard: one site the caller owns.
    if (!siteId) return json({ error: 'Missing site_id' }, 400);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    const { data: site } = await supabase
      .from('sites')
      .select('id')
      .eq('id', siteId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!site) return json({ error: 'Site not found or access denied' }, 403);

    const { data: credential, error: credError } = await supabase
      .from('site_google_credentials')
      .select(CREDENTIAL_COLUMNS)
      .eq('site_id', siteId)
      .eq('is_active', true)
      .maybeSingle();
    if (credError || !credential) return json({ error: 'No active GSC credential found for this site' }, 404);

    const result = await syncCredential(supabase, credential as Credential, history);
    return json({ success: true, ...result });
  } catch (err: any) {
    console.error('GSC sync error:', err);
    return json({ error: err.message ?? 'GSC sync failed' }, 500);
  }
});

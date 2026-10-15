import { createClient } from '../_shared/supabase.ts';
import { corsHeaders } from '../_shared/validateRequest.ts';

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { site_id, days_back = 28 } = await req.json();

    if (!site_id) {
      return new Response(
        JSON.stringify({ error: 'Missing site_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify caller owns this site
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: site } = await supabase
      .from('sites')
      .select('id')
      .eq('id', site_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!site) {
      return new Response(
        JSON.stringify({ error: 'Site not found or access denied' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch active credential
    const { data: credential, error: credError } = await supabase
      .from('site_google_credentials')
      .select('id, site_id, property_url, access_token, refresh_token, token_expires_at, last_token_refresh_at')
      .eq('site_id', site_id)
      .eq('is_active', true)
      .maybeSingle();

    if (credError || !credential) {
      return new Response(
        JSON.stringify({ error: 'No active GSC credential found for this site' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Refresh token if expired (with 5-min cooldown)
    let accessToken = credential.access_token;
    const expiresAt = new Date(credential.token_expires_at);
    const now = new Date();

    if (expiresAt <= now) {
      const lastRefresh = credential.last_token_refresh_at ? new Date(credential.last_token_refresh_at) : null;
      const cooldownActive = lastRefresh && now.getTime() - lastRefresh.getTime() < REFRESH_COOLDOWN_MS;

      if (!cooldownActive) {
        accessToken = await refreshAccessToken(credential);
        await supabase
          .from('site_google_credentials')
          .update({
            access_token: accessToken,
            token_expires_at: new Date(now.getTime() + 3600 * 1000).toISOString(),
            last_token_refresh_at: now.toISOString(),
          })
          .eq('id', credential.id);
      }
    }

    const endDate   = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days_back);

    const startStr = startDate.toISOString().split('T')[0];
    const endStr   = endDate.toISOString().split('T')[0];

    // Fetch queries and pages in parallel
    const [queries, pages] = await Promise.all([
      queryGSC(accessToken, credential.property_url, startStr, endStr, 'query', 200),
      queryGSC(accessToken, credential.property_url, startStr, endStr, 'page', 100),
    ]);

    // Upsert into gsc_data
    const rows = [
      ...queries.map((r) => ({ site_id, period_start: startStr, period_end: endStr, dimension: 'query', ...r })),
      ...pages.map((r)   => ({ site_id, period_start: startStr, period_end: endStr, dimension: 'page',  ...r })),
    ];

    if (rows.length > 0) {
      const { error: upsertError } = await supabase
        .from('gsc_data')
        .upsert(rows, { onConflict: 'site_id,period_start,period_end,dimension,value', ignoreDuplicates: false });

      if (upsertError) {
        console.error('GSC data upsert failed:', upsertError);
        throw upsertError;
      }
    }

    // Fetch AI performance data for all available search types and dimensions
    const aiDimensions: AIDimension[] = ['page', 'country', 'device'];
    const aiRows: object[] = [];

    await Promise.all(
      AI_SEARCH_TYPES.flatMap(searchType =>
        aiDimensions.map(async dimension => {
          const results = await queryGSCAI(
            accessToken, credential.property_url, startStr, endStr, searchType, dimension
          );
          if (results) {
            results.forEach(r => aiRows.push({
              site_id, period_start: startStr, period_end: endStr,
              search_type: searchType, dimension, value: r.value, impressions: r.impressions,
            }));
          }
        })
      )
    );

    if (aiRows.length > 0) {
      const { error: aiUpsertError } = await supabase
        .from('gsc_ai_data')
        .upsert(aiRows, { onConflict: 'site_id,period_start,period_end,search_type,dimension,value', ignoreDuplicates: false });
      if (aiUpsertError) console.error('GSC AI data upsert failed:', aiUpsertError);
    }

    // Update last_sync_at
    await supabase
      .from('site_google_credentials')
      .update({ last_sync_at: now.toISOString() })
      .eq('id', credential.id);

    return new Response(
      JSON.stringify({
        success: true,
        synced: rows.length,
        queries: queries.length,
        pages: pages.length,
        ai_synced: aiRows.length,
        period: { start: startStr, end: endStr },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('GSC sync error:', err);
    return new Response(
      JSON.stringify({ error: err.message ?? 'GSC sync failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

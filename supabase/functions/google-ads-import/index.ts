import { createClient } from '../_shared/supabase.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ADS_API_VERSION = 'v17';

async function refreshAccessToken(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token refresh failed: ${err}`);
  }

  const data = await res.json();
  return data.access_token as string;
}

async function queryCampaigns(
  accessToken: string,
  developerToken: string,
  customerId: string,
  loginCustomerId: string | null,
  dateRange: string,
): Promise<any[]> {
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value,
      metrics.ctr,
      metrics.average_cpc
    FROM campaign
    WHERE ${dateRange}
      AND campaign.status != 'REMOVED'
    ORDER BY metrics.impressions DESC
    LIMIT 50
  `;

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${accessToken}`,
    'developer-token': developerToken,
    'Content-Type': 'application/json',
  };

  if (loginCustomerId) {
    headers['login-customer-id'] = loginCustomerId;
  }

  const url = `https://googleads.googleapis.com/${ADS_API_VERSION}/customers/${customerId}/googleAds:search`;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google Ads API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return (data.results ?? []) as any[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { site_id, date_range } = await req.json() as { site_id: string; date_range?: string };

    if (!site_id) {
      return new Response(
        JSON.stringify({ error: 'site_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Load credentials from site_integrations
    const { data: integration, error: integError } = await supabase
      .from('site_integrations')
      .select('integration_config')
      .eq('site_id', site_id)
      .eq('integration_type', 'google_ads_api')
      .eq('is_active', true)
      .maybeSingle();

    if (integError || !integration?.integration_config) {
      return new Response(
        JSON.stringify({ error: 'Google Ads not configured for this site' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cfg = integration.integration_config as Record<string, string>;
    const { developer_token, customer_id, client_id, client_secret, refresh_token, login_customer_id } = cfg;

    if (!developer_token || !customer_id || !client_id || !client_secret || !refresh_token) {
      return new Response(
        JSON.stringify({ error: 'Incomplete Google Ads credentials' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Refresh the access token
    const accessToken = await refreshAccessToken(client_id, client_secret, refresh_token);

    // Build date filter
    const gaqlDateRange = date_range === 'last_7_days'
      ? 'segments.date DURING LAST_7_DAYS'
      : date_range === 'last_90_days'
        ? 'segments.date DURING LAST_90_DAYS'
        : 'segments.date DURING LAST_30_DAYS';

    const results = await queryCampaigns(
      accessToken,
      developer_token,
      customer_id,
      login_customer_id || null,
      gaqlDateRange,
    );

    // Transform to a clean shape for the frontend
    const campaigns = results.map((r: any) => {
      const m = r.metrics ?? {};
      const c = r.campaign ?? {};
      const costMicros = Number(m.costMicros ?? 0);
      const clicks = Number(m.clicks ?? 0);
      const impressions = Number(m.impressions ?? 0);
      const conversions = Number(m.conversions ?? 0);
      const conversionsValue = Number(m.conversionsValue ?? 0);

      return {
        campaign_id: c.id ?? '',
        campaign_name: c.name ?? 'Unknown',
        status: c.status ?? '',
        channel_type: c.advertisingChannelType ?? '',
        impressions,
        clicks,
        cost: costMicros / 1_000_000,
        conversions,
        conversions_value: conversionsValue,
        ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
        cpc: clicks > 0 ? (costMicros / 1_000_000) / clicks : 0,
        roas: costMicros > 0 ? (conversionsValue / (costMicros / 1_000_000)) : 0,
        conversion_rate: clicks > 0 ? (conversions / clicks) * 100 : 0,
      };
    });

    // Aggregate totals
    const totals = campaigns.reduce((acc, c) => ({
      impressions: acc.impressions + c.impressions,
      clicks: acc.clicks + c.clicks,
      cost: acc.cost + c.cost,
      conversions: acc.conversions + c.conversions,
      conversions_value: acc.conversions_value + c.conversions_value,
    }), { impressions: 0, clicks: 0, cost: 0, conversions: 0, conversions_value: 0 });

    return new Response(
      JSON.stringify({ campaigns, totals }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('google-ads-import error:', error);
    return new Response(
      JSON.stringify({ error: error.message ?? 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

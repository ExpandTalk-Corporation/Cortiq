// google-ads-import - campaign report for the Google Ads widget.
// Reads the site's OAuth connection (google_ads_connections + sealed refresh token) through the
// shared Google Ads client. The caller must have access to the site (RLS on `sites`).
// deno-lint-ignore-file no-explicit-any
import { createClient } from '../_shared/supabase.ts';
import { requireSiteAccess } from '../_shared/site-access.ts';
import { fromMicros, isAdsAuth, loadSiteAdsAuth, searchStream } from '../_shared/google-ads.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const DURING: Record<string, string> = {
  last_7_days: 'LAST_7_DAYS',
  last_30_days: 'LAST_30_DAYS',
  last_90_days: 'LAST_90_DAYS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authorization = req.headers.get('Authorization');
    const userClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authorization ?? '' } },
    });
    const body = await req.json().catch(() => ({})) as { site_id?: string; date_range?: string };
    const access = await requireSiteAccess(userClient, authorization, body.site_id);
    if (!access.ok) return json({ error: access.error }, access.status);

    const svc = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const auth = await loadSiteAdsAuth(svc, body.site_id as string);
    if (!isAdsAuth(auth)) return json({ error: auth.error, code: auth.code }, auth.status);

    const during = DURING[body.date_range ?? ''] ?? 'LAST_30_DAYS';
    const rows = await searchStream(auth, `
      SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
             metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions,
             metrics.conversions_value
      FROM campaign
      WHERE segments.date DURING ${during} AND campaign.status != 'REMOVED'
      ORDER BY metrics.impressions DESC
      LIMIT 50`);

    const campaigns = rows.map((r: any) => {
      const m = r.metrics ?? {};
      const c = r.campaign ?? {};
      const cost = fromMicros(m.costMicros);
      const clicks = Number(m.clicks ?? 0);
      const impressions = Number(m.impressions ?? 0);
      const conversions = Number(m.conversions ?? 0);
      const conversionsValue = Number(m.conversionsValue ?? 0);
      return {
        campaign_id: String(c.id ?? ''),
        campaign_name: c.name ?? 'Unknown',
        status: c.status ?? '',
        channel_type: c.advertisingChannelType ?? '',
        impressions,
        clicks,
        cost,
        conversions,
        conversions_value: conversionsValue,
        ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
        cpc: clicks > 0 ? cost / clicks : 0,
        roas: cost > 0 ? conversionsValue / cost : 0,
        conversion_rate: clicks > 0 ? (conversions / clicks) * 100 : 0,
      };
    });

    const totals = campaigns.reduce((acc, c) => ({
      impressions: acc.impressions + c.impressions,
      clicks: acc.clicks + c.clicks,
      cost: acc.cost + c.cost,
      conversions: acc.conversions + c.conversions,
      conversions_value: acc.conversions_value + c.conversions_value,
    }), { impressions: 0, clicks: 0, cost: 0, conversions: 0, conversions_value: 0 });

    return json({ campaigns, totals, currency: auth.currencyCode ?? null });
  } catch (error: any) {
    console.error('google-ads-import error:', error?.message ?? error);
    return json({ error: error?.message ?? 'Internal server error' }, 502);
  }
});

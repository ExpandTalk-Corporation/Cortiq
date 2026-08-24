// Cloudflare edge web analytics — pull model.
// Owner-triggered (from the dashboard) or scheduled. Calls the Cloudflare GraphQL
// Analytics API for a site's zone and upserts daily aggregates into cloudflare_analytics.
// Auth: the API token is a project-level Supabase secret (CLOUDFLARE_API_TOKEN) — NOT
// per-site yet (waiting on encrypted secret storage). Zone ID lives on sites.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GQL = `
query ($zoneTag: String!, $since: String!, $until: String!) {
  viewer {
    zones(filter: { zoneTag: $zoneTag }) {
      httpRequests1dGroups(limit: 60, filter: { date_geq: $since, date_leq: $until }, orderBy: [date_ASC]) {
        dimensions { date }
        sum { requests bytes cachedRequests pageViews countryMap { clientCountryName requests } }
        uniq { uniques }
      }
    }
  }
}`;

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const token = Deno.env.get('CLOUDFLARE_API_TOKEN');
    if (!token) {
      return new Response(
        JSON.stringify({ error: 'CLOUDFLARE_API_TOKEN secret is not set on this project.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const siteId: string | undefined = body.site_id;
    const days: number = Math.min(Math.max(parseInt(body.days ?? '7', 10) || 7, 1), 60);
    if (!siteId) {
      return new Response(JSON.stringify({ error: 'site_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // AuthZ: verify_jwt=true only proves *someone* is logged in. Confirm the caller
    // actually owns this site — via an RLS-scoped read — before burning the site's
    // Cloudflare quota or writing into its aggregates. (Fixes cross-tenant write, audit P2-1.)
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Resolved under the caller's RLS — a site they don't own comes back null.
    const { data: site } = await userClient
      .from('sites')
      .select('id, cloudflare_zone_id, cloudflare_enabled')
      .eq('id', siteId)
      .maybeSingle();

    if (!site) {
      return new Response(JSON.stringify({ error: 'Site not found or access denied' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Service-role client for the Cloudflare pull + aggregate upsert (writes bypass RLS).
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    const zoneTag = (site as { cloudflare_zone_id?: string }).cloudflare_zone_id;
    if (!zoneTag) {
      return new Response(JSON.stringify({ error: 'No Cloudflare Zone ID configured for this site.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const until = new Date();
    const since = new Date(until.getTime() - (days - 1) * 24 * 60 * 60 * 1000);

    const cfResp = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: GQL, variables: { zoneTag, since: ymd(since), until: ymd(until) } }),
    });
    const cf = await cfResp.json();

    if (cf.errors?.length) {
      console.error('Cloudflare GraphQL errors:', JSON.stringify(cf.errors));
      return new Response(JSON.stringify({ error: 'Cloudflare API error', details: cf.errors }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const groups = cf?.data?.viewer?.zones?.[0]?.httpRequests1dGroups ?? [];
    let upserted = 0;
    for (const g of groups) {
      const countries: Record<string, number> = {};
      for (const c of (g.sum?.countryMap ?? []).slice(0, 10)) {
        if (c?.clientCountryName) countries[c.clientCountryName] = c.requests ?? 0;
      }
      const row = {
        site_id: siteId,
        day: g.dimensions?.date,
        requests: g.sum?.requests ?? 0,
        page_views: g.sum?.pageViews ?? 0,
        unique_visitors: g.uniq?.uniques ?? 0,
        cached_requests: g.sum?.cachedRequests ?? 0,
        bytes: g.sum?.bytes ?? 0,
        top_countries: countries,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('cloudflare_analytics').upsert(row, { onConflict: 'site_id,day' });
      if (error) { console.error('Upsert error:', error.message); } else { upserted++; }
    }

    return new Response(JSON.stringify({ success: true, days_upserted: upserted }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error in cloudflare-analytics:', error);
    return new Response(JSON.stringify({ error: 'Internal server error', details: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

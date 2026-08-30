import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sanitize } from './sanitize.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'missing bearer' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const apiKey = authHeader.replace('Bearer ', '');

    const body = await req.json();
    const siteId = String(body.siteId ?? '');
    if (!siteId) {
      return new Response(JSON.stringify({ error: 'missing siteId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Authorize the site against the key. Accept either the site's own tracking_id
    // or the owning company's api_key (same model as track-event).
    const { data: siteByKey } = await supabase
      .from('sites').select('id, is_active').eq('id', siteId).eq('tracking_id', apiKey).maybeSingle();

    let authorized = !!(siteByKey && siteByKey.is_active);
    if (!authorized) {
      const { data: company } = await supabase
        .from('companies').select('id').eq('api_key', apiKey).maybeSingle();
      if (company) {
        const { data: ownedSite } = await supabase
          .from('sites').select('id, is_active').eq('id', siteId).eq('user_id', company.id).maybeSingle();
        authorized = !!(ownedSite && ownedSite.is_active);
      }
    }
    if (!authorized) {
      return new Response(JSON.stringify({ error: 'forbidden' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let clean;
    try {
      clean = sanitize(body);
    } catch (e) {
      return new Response(JSON.stringify({ error: 'invalid payload', detail: String(e) }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const day = new Date().toISOString().slice(0, 10); // UTC date
    // Atomic upsert-increment. Requires the unique index from Task 1.
    const { error } = await supabase.rpc('increment_link_click', {
      p_site_id: siteId,
      p_page_path: clean.pagePath,
      p_link_kind: clean.linkKind,
      p_link_key: clean.linkKey,
      p_link_label: clean.linkLabel,
      p_device_type: clean.deviceType,
      p_day: day,
    });
    if (error) {
      console.error('increment_link_click failed:', error);
      return new Response(JSON.stringify({ error: 'write failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ ok: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('link-click-counter error:', e);
    // Never break the host page — always return, never throw to the client.
    return new Response(JSON.stringify({ ok: false }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

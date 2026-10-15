import { createClient } from '../_shared/supabase.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface WebVitalPayload {
  tracking_id: string;
  session_id: string;        // UUID generated per page load in JS
  metric_name: 'LCP' | 'INP' | 'CLS' | 'FCP' | 'TTFB';
  metric_value: number;      // ms for LCP/INP/FCP/TTFB, CLS * 1000 stored as integer
  metric_rating: 'good' | 'needs-improvement' | 'poor';
  page_url: string;
  device_type?: 'desktop' | 'tablet' | 'mobile';
  connection_type?: string;
  timestamp?: string;
}

// Map metric_name to the correct column in web_vitals table
const METRIC_COLUMN: Record<string, string> = {
  LCP:  'lcp',
  INP:  'inp',
  CLS:  'cls',
  FCP:  'fcp',
  TTFB: 'ttfb',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate anon key presence (confirms request targets this Supabase project)
    const apikey = req.headers.get('apikey') ?? req.headers.get('authorization')?.replace('Bearer ', '');
    if (!apikey) {
      return new Response(
        JSON.stringify({ error: 'Missing apikey header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body: WebVitalPayload = await req.json();

    // Basic input validation
    if (!body.tracking_id || !body.session_id || !body.metric_name || body.metric_value === undefined) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: tracking_id, session_id, metric_name, metric_value' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const column = METRIC_COLUMN[body.metric_name];
    if (!column) {
      return new Response(
        JSON.stringify({ error: `Unknown metric_name: ${body.metric_name}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Resolve tracking_id → site_id
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('id')
      .eq('tracking_id', body.tracking_id)
      .single();

    if (siteError || !site) {
      console.error('Unknown tracking_id:', body.tracking_id, siteError);
      return new Response(
        JSON.stringify({ error: 'Unknown tracking_id' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Sanitize page_url — strip query params and fragments to avoid storing personal data
    let pageUrl = body.page_url ?? '/';
    try {
      const u = new URL(pageUrl, 'https://placeholder.invalid');
      pageUrl = u.pathname; // pathname only, no query/hash
    } catch {
      pageUrl = pageUrl.split('?')[0].split('#')[0].substring(0, 500);
    }

    // Upsert: if a row already exists for this session, update only the specific metric column.
    // The partial unique index on session_id (WHERE session_id IS NOT NULL) enables this.
    const { error: upsertError } = await supabase
      .from('web_vitals')
      .upsert(
        {
          site_id:         site.id,
          session_id:      body.session_id,
          [column]:        body.metric_value,
          page_url:        pageUrl,
          device_type:     body.device_type ?? null,
          connection_type: body.connection_type ?? null,
          measured_at:     body.timestamp ?? new Date().toISOString(),
        },
        {
          onConflict:       'session_id',
          ignoreDuplicates: false,   // update the conflicting row
        }
      );

    if (upsertError) {
      console.error('web_vitals upsert failed:', upsertError);
      return new Response(
        JSON.stringify({ error: 'Failed to store metric', details: upsertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[web-vitals] site=${site.id} session=${body.session_id} ${body.metric_name}=${body.metric_value} (${body.metric_rating})`);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('Unexpected error in track-web-vitals:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

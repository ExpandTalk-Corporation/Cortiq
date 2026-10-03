import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TrackingEventRequest {
  company_id: string;
  content_type: 'image' | 'form' | 'event' | 'survey' | 'chatbot' | 'page';
  content_id: string;
  event_type: 'view' | 'click' | 'conversion' | 'submission';
  platform?: string;
  session_id: string;
  metadata?: {
    user_agent?: string;
    referrer?: string;
    country?: string;
    device_type?: string;
    [key: string]: any;
  };
  timestamp?: number;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Extract API key from Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('Missing or invalid Authorization header');
      return new Response(
        JSON.stringify({ error: 'Missing or invalid Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = authHeader.replace('Bearer ', '');

    // Parse request body
    const body: TrackingEventRequest = await req.json();
    console.log('Tracking event request:', {
      company_id: body.company_id,
      content_type: body.content_type,
      event_type: body.event_type
    });

    // Resolve the caller. Two accepted credentials:
    //  1. Account key: a companies.api_key (Bearer) + body.company_id === company.id.
    //  2. Site key: a site's own tk_ tracking_id (Bearer) + body.company_id === that
    //     site's id (or its owner id). This makes the Site ID + Tracking ID shown in
    //     the dashboard work directly in the snippet. The owning company
    //     (companies.id == sites.user_id in this data model) is resolved server-side;
    //     the page view is still attributed to the right site by domain in ingest_pageview.
    let company: { id: string; is_active: boolean; consent_settings: any } | null = null;

    const { data: companyByKey } = await supabase
      .from('companies')
      .select('id, name, is_active, consent_settings')
      .eq('api_key', apiKey)
      .maybeSingle();

    if (companyByKey) {
      if (body.company_id !== companyByKey.id) {
        console.error('Company ID mismatch. Expected:', companyByKey.id, 'Got:', body.company_id);
        return new Response(
          JSON.stringify({ error: 'Company ID does not match API key' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      company = companyByKey;
    } else {
      // Fall back to a site's own tracking_id (any key format — tk_ or legacy base64).
      // Lets the Site ID + Tracking ID shown in the dashboard authenticate directly.
      const { data: site } = await supabase
        .from('sites')
        .select('id, user_id, is_active')
        .eq('tracking_id', apiKey)
        .maybeSingle();

      if (site && site.is_active && (body.company_id === site.id || body.company_id === site.user_id)) {
        const { data: ownerCompany } = await supabase
          .from('companies')
          .select('id, name, is_active, consent_settings')
          .eq('id', site.user_id)
          .maybeSingle();
        if (ownerCompany) {
          company = ownerCompany;
          body.company_id = ownerCompany.id; // normalize to the real company id for storage + rate limit
        }
      }
    }

    if (!company) {
      console.error('Invalid API key');
      return new Response(
        JSON.stringify({ error: 'Invalid API key' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!company.is_active) {
      console.error('Company is inactive:', company.id);
      return new Response(
        JSON.stringify({ error: 'Company account is inactive' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check consent settings
    const consentSettings = company.consent_settings || {};
    const allowedEventTypes = consentSettings.gdpr_settings?.allowed_event_types || ['view', 'click', 'conversion', 'submission', 'heatmap'];
    
    if (!allowedEventTypes.includes(body.event_type)) {
      console.log('Event type not allowed by consent settings:', body.event_type);
      return new Response(
        JSON.stringify({ 
          success: true, 
          event_id: null,
          message: 'Event type blocked by consent settings'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Click/scroll heatmap points go to heatmap_data, which the dashboard, REST API and
    // MCP server read. Until 2026-10 this event type fell through the allow-list above
    // and was silently dropped, so heatmaps stopped receiving data after June 2026.
    // The tracker only sends these after analytics consent. Stored minimally: no IP,
    // no user agent, and the URL without query string or fragment.
    if (body.event_type === 'heatmap') {
      const m = body.metadata || {};
      const siteId = (body as { site_id?: string }).site_id;
      const { data: site } = siteId
        ? await supabase.from('sites').select('id').eq('id', siteId).eq('user_id', company.id).maybeSingle()
        : { data: null };
      const interaction = m.interaction_type === 'scroll' ? 'scroll' : m.interaction_type === 'click' ? 'click' : null;
      let url: string | null = null;
      try { const u = new URL(String(m.url)); url = u.origin + u.pathname; } catch { /* invalid URL */ }
      const int = (v: unknown) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : null);
      if (!site || !interaction || !url || int(m.x_coordinate) === null || int(m.y_coordinate) === null) {
        return new Response(JSON.stringify({ success: false, error: 'Invalid heatmap event' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const { error: heatmapError } = await supabase.from('heatmap_data').insert({
        site_id: site.id,
        url,
        device_type: ['mobile', 'tablet', 'desktop'].includes(m.device_type) ? m.device_type : 'desktop',
        interaction_type: interaction,
        x_coordinate: int(m.x_coordinate),
        y_coordinate: int(m.y_coordinate),
        grid_x: int(m.grid_x),
        grid_y: int(m.grid_y),
        viewport_width: int(m.viewport_width),
        viewport_height: int(m.viewport_height),
        is_touch_device: m.is_touch_device === true,
      });
      if (heatmapError) {
        console.error('Failed to insert heatmap point:', heatmapError);
        return new Response(JSON.stringify({ success: false, error: 'Failed to store heatmap point' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Generate UUID from content_id if it's not already a UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let contentIdUuid = body.content_id;
    
    if (!uuidRegex.test(body.content_id)) {
      // Generate a consistent UUID v5 from the content_id string
      const encoder = new TextEncoder();
      const data = encoder.encode(body.content_id);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      // Format as valid UUID v5 with proper version (5) and variant (8-b) bits
      const p1 = hashHex.slice(0, 8);
      const p2 = hashHex.slice(8, 12);
      const p3 = '5' + hashHex.slice(13, 16); // Version 5
      const p4Char = parseInt(hashHex.slice(16, 17), 16);
      const p4Variant = ((p4Char & 0x3) | 0x8).toString(16); // Variant bits: 10xx
      const p4 = p4Variant + hashHex.slice(17, 20);
      const p5 = hashHex.slice(20, 32);
      
      contentIdUuid = `${p1}-${p2}-${p3}-${p4}-${p5}`;
    }

    // Prepare metadata with anonymization
    let metadata = body.metadata || {};
    
    if (consentSettings.anonymize_ip && metadata.ip_address) {
      delete metadata.ip_address;
    }
    
    if (!consentSettings.gdpr_settings?.store_user_agent) {
      delete metadata.user_agent;
    }
    
    if (!consentSettings.gdpr_settings?.store_referrer) {
      delete metadata.referrer;
    }

    // Rate limiting check (simple version - 10k events per hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from('tracking_events')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', company.id)
      .gte('created_at', oneHourAgo);

    if (count && count >= 10000) {
      console.error('Rate limit exceeded for company:', company.id);
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded (10,000 events/hour)' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert tracking event
    const { data: event, error: insertError } = await supabase
      .from('tracking_events')
      .insert({
        company_id: body.company_id,
        content_type: body.content_type,
        content_id: contentIdUuid, // Use generated UUID
        event_type: body.event_type,
        platform: body.platform || 'unknown',
        session_id: body.session_id,
        metadata: {
          ...metadata,
          original_content_id: body.content_id // Store original for reference
        },
        timestamp: body.timestamp ? new Date(body.timestamp).toISOString() : new Date().toISOString()
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('Failed to insert tracking event:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to insert tracking event', details: insertError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Tracking event inserted successfully:', event.id);

    // Bridge page views into the dashboard's analytics model (page_views /
    // tracking_sessions). The client posts page views here as content_type='page',
    // but the dashboard reads page_views, keyed by the real sites.id — which
    // ingest_pageview resolves from the URL's domain. Best-effort: never fail the
    // event if the bridge errors.
    if (body.content_type === 'page' && body.event_type === 'view') {
      // Normalize IDN/host form to punycode so domain resolution matches sites.domain.
      // Browsers send location.href with the Unicode host (e.g. "båtguide.nu"); the
      // WHATWG URL parser rewrites it to "xn--btguide-exa.nu" as stored.
      let pageUrl: string | null = metadata.url ?? null;
      if (pageUrl) { try { pageUrl = new URL(pageUrl).href; } catch { /* keep raw */ } }
      try {
        // TENANT GUARD: ingest_pageview routes purely by the URL's domain. Without an
        // ownership check, any caller with a valid credential could set metadata.url to
        // another customer's domain and forge page views into that tenant's dashboard.
        // Resolve the domain-matched site and confirm it belongs to the authenticated
        // company (companies.id == sites.user_id) before bridging.
        const { data: resolvedSiteId } = await supabase.rpc('resolve_site_by_domain', { p_url: pageUrl });
        let ownedByCaller = false;
        if (resolvedSiteId) {
          const { data: siteRow } = await supabase
            .from('sites')
            .select('user_id')
            .eq('id', resolvedSiteId)
            .maybeSingle();
          ownedByCaller = !!siteRow && siteRow.user_id === company.id;
        }

        if (ownedByCaller) {
          await supabase.rpc('ingest_pageview', {
            p_url: pageUrl,
            p_session: body.session_id ?? null,
            p_device: metadata.device_type ?? null,
            p_referrer: metadata.referrer ?? null,
            p_viewed_at: body.timestamp ? new Date(body.timestamp).toISOString() : new Date().toISOString(),
          });
        } else if (resolvedSiteId) {
          console.warn('page_view bridge: domain-resolved site not owned by caller; skipping', {
            company_id: company.id, resolved_site: resolvedSiteId,
          });
        }
      } catch (bridgeErr) {
        console.error('page_view bridge failed (non-fatal):', bridgeErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        event_id: event.id
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in track-event function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

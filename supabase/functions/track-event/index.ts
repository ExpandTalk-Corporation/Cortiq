import { createClient } from '../_shared/supabase.ts';
import { anonymizeIP } from '../_shared/jurisdiction.ts';
import { countryFromTimeZone } from '../_shared/tz-country.js';
import { storedReferrer } from '../_shared/referrer.js';
import { normalizeGoals, clientGoals, matchPageVisitGoals } from '../_shared/conversion-goals.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TrackingEventRequest {
  company_id: string;
  content_type: 'image' | 'form' | 'event' | 'survey' | 'chatbot' | 'page';
  content_id: string;
  event_type: 'view' | 'click' | 'conversion' | 'submission' | 'heatmap' | 'form_session' | 'content';
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
    const allowedEventTypes = consentSettings.gdpr_settings?.allowed_event_types || ['view', 'click', 'conversion', 'submission', 'heatmap', 'form_session', 'content'];
    
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

    // Form sessions (field focus / completion / abandonment from the tracker) and SentriSK
    // iframe submits feed form_sessions + form_analytics, which the Forms tab reads. Until
    // 2026-10 form_session was not on the allow-list and was dropped. Only counts and field
    // names are stored, never field values.
    const resolveOwnedSite = async () => {
      const siteId = (body as { site_id?: string }).site_id;
      if (!siteId) return null;
      const { data } = await supabase.from('sites').select('id').eq('id', siteId).eq('user_id', company!.id).maybeSingle();
      return data?.id ?? null;
    };
    const num = (v: unknown) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : null);

    if (body.event_type === 'form_session') {
      const m = body.metadata || {};
      const siteId = await resolveOwnedSite();
      const status = m.status === 'completed' || m.status === 'abandoned' ? m.status : null;
      if (!siteId || !status || typeof m.form_id !== 'string' || !m.form_id) {
        return new Response(JSON.stringify({ success: false, error: 'Invalid form_session event' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const fieldData = Array.isArray(m.field_data) ? m.field_data : [];
      const { error: formError } = await supabase.rpc('record_form_session', {
        p_site_id: siteId,
        p_session_id: body.session_id ?? null,
        p_form_id: m.form_id,
        p_form_name: typeof m.form_name === 'string' ? m.form_name : null,
        p_form_type: typeof m.form_type === 'string' ? m.form_type : 'custom',
        p_status: status,
        p_duration_seconds: num(m.duration_seconds),
        p_fields_completed: num(m.fields_completed),
        p_total_fields: num(m.total_fields),
        p_error_count: fieldData.reduce((sum: number, f: { errors?: unknown }) => sum + (num(f?.errors) ?? 0), 0),
        p_device_type: typeof m.device_type === 'string' ? m.device_type : null,
      });
      if (formError) {
        console.error('Failed to record form session:', formError);
        return new Response(JSON.stringify({ success: false, error: 'Failed to store form session' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Content elements marked data-cortiq-content: batched impressions and clicks from the
    // tracker (5.5.6+) → today's content_performance counters. Aggregates only.
    if (body.event_type === 'content') {
      const siteId = await resolveOwnedSite();
      const items = Array.isArray(body.metadata?.items) ? body.metadata.items.slice(0, 50) : [];
      if (!siteId || items.length === 0) {
        return new Response(JSON.stringify({ success: false, error: 'Invalid content event' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const { error: contentError } = await supabase.rpc('record_content_metrics', { p_site_id: siteId, p_items: items });
      if (contentError) {
        console.error('Failed to record content metrics:', contentError);
        return new Response(JSON.stringify({ success: false, error: 'Failed to store content metrics' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // A SentriSK submit is also kept as a conversion event below; here it is counted as a
    // completed form. Starts are not visible inside the cross-origin iframe.
    if (body.event_type === 'conversion' && body.metadata?.form_provider === 'sentrisk'
        && typeof body.metadata.form_id === 'string') {
      const siteId = await resolveOwnedSite();
      if (siteId) {
        const { error: sentriskError } = await supabase.rpc('record_form_session', {
          p_site_id: siteId, p_session_id: body.session_id ?? null, p_form_id: body.metadata.form_id,
          p_form_name: `SentriSK Form (${body.metadata.form_id.replace(/^sentrisk_/, '').slice(0, 8)}...)`,
          p_form_type: 'sentrisk', p_status: 'completed', p_duration_seconds: 0,
          p_fields_completed: 0, p_total_fields: 0, p_error_count: 0,
          p_device_type: typeof body.metadata.device_type === 'string' ? body.metadata.device_type : null,
        });
        if (sentriskError) console.error('SentriSK form session failed (non-fatal):', sentriskError);
      }
    }

    // Conversions into conversion_events (Attribution, Goals health, conversion counts in
    // Locations/Campaigns, HubSpot → Google Ads). Sources: a goal hit the tracker reports
    // (goal_id), a SentriSK submit, an iframe formSubmit/lead postMessage, or a
    // data-wfa-conversion element in cookieless mode (server_record; in full mode
    // record-conversion already stores it, with the click-ID context).
    if (body.event_type === 'conversion') {
      const m = body.metadata || {};
      const siteId = await resolveOwnedSite();
      if (siteId) {
        let conv: { name: string; type: string; selector: string | null; value: number | null } | null = null;
        if (typeof m.goal_id === 'string') {
          const { data: siteRow } = await supabase.from('sites').select('conversion_goals').eq('id', siteId).maybeSingle();
          const goal = normalizeGoals(siteRow?.conversion_goals).find((g) => g.id === m.goal_id);
          if (goal) conv = { name: goal.name, type: goal.type, selector: goal.selector, value: num(goal.value) };
        } else if (m.form_provider === 'sentrisk') {
          conv = { name: 'SentriSK form', type: 'form_submission', selector: typeof m.form_id === 'string' ? m.form_id : null, value: null };
        } else if (m.conversion_type === 'form_submit' || m.conversion_type === 'lead_created') {
          conv = { name: m.conversion_type === 'form_submit' ? 'Embedded form' : 'Lead', type: 'form_submission', selector: null, value: null };
        } else if (m.server_record === true) {
          conv = { name: String(body.content_id || 'Conversion').slice(0, 200), type: 'conversion',
                   selector: typeof m.form_id === 'string' ? m.form_id : null, value: num(m.value) };
        }
        if (conv) {
          const { error: convError } = await supabase.rpc('record_conversion_event', {
            p_site_id: siteId, p_session: body.session_id ?? null, p_event_name: conv.name,
            p_event_type: conv.type, p_selector: conv.selector, p_value: conv.value,
          });
          if (convError) console.error('record_conversion_event failed (non-fatal):', convError);
        }
      }
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
    
    // Never store a full client IP from event metadata: drop it when the site asks
    // for anonymisation, otherwise keep only the network part.
    if (metadata.ip_address) {
      if (consentSettings.anonymize_ip) delete metadata.ip_address;
      else metadata.ip_address = anonymizeIP(String(metadata.ip_address));
    }
    
    if (!consentSettings.gdpr_settings?.store_user_agent) {
      delete metadata.user_agent;
    }
    
    const referrer = storedReferrer(metadata.referrer, consentSettings.gdpr_settings);
    if (referrer) metadata.referrer = referrer;
    else delete metadata.referrer;

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
    let viewSiteId: string | null = null;
    let goalsForTracker: ReturnType<typeof clientGoals> | undefined;
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
          viewSiteId = resolvedSiteId;
          await supabase.rpc('ingest_pageview', {
            p_url: pageUrl,
            p_session: body.session_id ?? null,
            p_device: metadata.device_type ?? null,
            p_referrer: metadata.referrer ?? null,
            p_viewed_at: body.timestamp ? new Date(body.timestamp).toISOString() : new Date().toISOString(),
            // Country only (ISO alpha-2). Supabase Edge no longer forwards CF-IPCountry
            // (checked 2026-10-15), so the browser time zone the tracker sends is the
            // estimate; the header still wins if it comes back. ingest_pageview drops
            // XX/T1/non-ISO values.
            p_country: req.headers.get('cf-ipcountry') ?? countryFromTimeZone(body.metadata?.timezone),
          });
        } else if (resolvedSiteId) {
          console.warn('page_view bridge: domain-resolved site not owned by caller; skipping', {
            company_id: company.id, resolved_site: resolvedSiteId,
          });
        }
      } catch (bridgeErr) {
        console.error('page_view bridge failed (non-fatal):', bridgeErr);
      }

      // Conversion goals: page_visit goals are matched here; form/click goals go back to
      // the tracker, which needs the DOM to evaluate their selectors.
      if (viewSiteId && pageUrl) {
        try {
          const { data: siteRow } = await supabase.from('sites').select('conversion_goals').eq('id', viewSiteId).maybeSingle();
          const goals = normalizeGoals(siteRow?.conversion_goals);
          for (const goal of matchPageVisitGoals(goals, pageUrl)) {
            const { error: convError } = await supabase.rpc('record_conversion_event', {
              p_site_id: viewSiteId, p_session: body.session_id ?? null, p_event_name: goal.name,
              p_event_type: 'page_visit', p_selector: goal.selector, p_value: num(goal.value),
            });
            if (convError) console.error('page_visit goal failed (non-fatal):', convError);
          }
          goalsForTracker = clientGoals(goals);
        } catch (goalErr) {
          console.error('conversion goals failed (non-fatal):', goalErr);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        event_id: event.id,
        ...(goalsForTracker && { goals: goalsForTracker }),
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

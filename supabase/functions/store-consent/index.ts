import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.3';
import { anonymizeIP } from "../_shared/jurisdiction.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ConsentRequest {
  site_id?: string;
  tracking_id?: string; // Fallback for old implementations
  session_id?: string;
  uuid?: string; // Alternative field name for session_id
  consent_types: {
    necessary: boolean;
    analytics: boolean;
    marketing: boolean;
    preferences: boolean;
  };
  ip_address?: string;
  user_agent?: string;
  source?: string;
  locale?: string;
  gpc_signal?: boolean;
  policy_version?: string;
  page_url?: string; // used to resolve the site by domain (most reliable)
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  const json = (error: string, status: number) => new Response(JSON.stringify({ success: false, error }), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
  if (req.method !== 'POST') return json('Method not allowed', 405);

  try {
    // Service role: this public endpoint must read `sites` (RLS-restricted to owners)
    // to validate the target and write the consent ledger. It does its own validation
    // (domain resolution + site-exists check + per-site rate limit) before writing.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Defense-in-depth: if a browser Origin is present it must resolve to a registered
    // site — blocks cross-site junk POSTed to the consent ledger. A missing Origin
    // (server-to-server) is allowed and still guarded by the site check + rate limit below.
    const origin = req.headers.get('Origin');
    let originSiteId: string | null = null;
    if (origin) {
      let ourl = origin;
      try { ourl = new URL(origin).href; } catch { /* keep raw */ }
      const { data: originSite, error: originError } = await supabase.rpc('resolve_site_by_domain', { p_url: ourl });
      if (originError) return json('Unable to verify origin', 503);
      if (!originSite) {
        return new Response(JSON.stringify({ success: false, error: 'Origin not a registered site' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      originSiteId = originSite as string;
    }

    let requestData: ConsentRequest;
    try { requestData = await req.json(); }
    catch { return json('Invalid JSON', 400); }
    if (!requestData || typeof requestData !== 'object') return json('Invalid request', 400);

    // Normalize session_id from either session_id or uuid field
    const session_id = requestData.session_id || requestData.uuid;
    
    // Validate required fields
    if (typeof session_id !== 'string' || !session_id.trim() || session_id.length > 255 ||
        !requestData.consent_types || typeof requestData.consent_types !== 'object' ||
        (['analytics', 'marketing'] as const).some(key => typeof requestData.consent_types[key] !== 'boolean') ||
        (requestData.consent_types.preferences !== undefined && typeof requestData.consent_types.preferences !== 'boolean')) {
      return json('A session ID and boolean consent choices are required', 400);
    }
    requestData.consent_types = {
      necessary: true, analytics: requestData.consent_types.analytics,
      marketing: requestData.consent_types.marketing, preferences: requestData.consent_types.preferences === true,
    };

    // tracking_id is an OPTIONAL legacy site hint. If it isn't a tk_ key (e.g. an
    // account/API key was pasted into the tracking field), ignore it rather than
    // failing the request — site resolution falls back to page_url domain / site_id.
    if (requestData.tracking_id && !requestData.tracking_id.startsWith('tk_')) {
      requestData.tracking_id = undefined;
    }

    let site_id = requestData.site_id;

    // Prefer resolving the site by the page's domain — the most reliable signal, and
    // consistent with how page views are attributed. Overrides a supplied site_id so a
    // misconfigured tag (e.g. a company id in the site_id field) still logs consent
    // under the correct site.
    if (requestData.page_url) {
      // Normalize the URL through the WHATWG parser first: it converts IDN hosts to
      // punycode (browsers send location.href with the Unicode host, e.g.
      // "båtguide.nu"), so this matches sites.domain, stored as "xn--btguide-exa.nu".
      let purl = requestData.page_url;
      try { purl = new URL(requestData.page_url).href; } catch { /* keep raw */ }
      const { data: domainSite } = await supabase.rpc('resolve_site_by_domain', { p_url: purl });
      if (domainSite) site_id = domainSite as string;
    }

    // If site_id is still not resolved but tracking_id is, try to resolve it
    if (!site_id && requestData.tracking_id) {
      console.log('Resolving site_id from tracking_id:', requestData.tracking_id);
      
      const { data: siteData, error: siteError } = await supabase
        .from('sites')
        .select('id')
        .eq('tracking_id', requestData.tracking_id)
        .maybeSingle();

      if (siteError) {
        console.error('Error finding site by tracking_id:', siteError);
        throw new Error(`Database error while resolving tracking_id: ${requestData.tracking_id}`);
      }

      if (!siteData) {
        console.error('Site not found for tracking_id:', requestData.tracking_id);
        throw new Error(`Site not found for tracking_id: ${requestData.tracking_id}`);
      }

      site_id = siteData.id;
      console.log('Resolved site_id:', site_id);
    }

    if (!site_id) {
      throw new Error('Either site_id or valid tracking_id must be provided');
    }

    // Validate that site_id is a valid UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(site_id)) {
      throw new Error(`Invalid site_id format: ${site_id}. Must be a valid UUID.`);
    }
    if (originSiteId && originSiteId !== site_id) return json('Origin does not match site', 403);

    // SECURITY: the consent ledger is compliance evidence — never write a record for a
    // site that doesn't exist. Rejects fabricated/overwritten consent for arbitrary sites.
    const { data: siteExists } = await supabase.from('sites').select('id').eq('id', site_id).maybeSingle();
    if (!siteExists) {
      return new Response(JSON.stringify({ success: false, error: 'Unknown site' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Per-site rate limit to blunt bulk consent forgery.
    const { data: underLimit, error: rlErr } = await supabase.rpc('check_rate_limit', {
      p_key: `consent:${site_id}`,
      p_max_count: 120,
      p_window_sec: 60,
    });
    if (!rlErr && underLimit === false) {
      return new Response(JSON.stringify({ success: false, error: 'Rate limit exceeded' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '60' } });
    }

    // Prepare consent data with sanitized inputs.
    // consent_given reflects the actual decision (opt-in to analytics/marketing), not a
    // hardcoded true — a reject-all banner must be recorded as consent_given = false.
    const consentData = {
      site_id,
      session_id: session_id.substring(0, 255), // Limit length to prevent overflow
      consent_given: !!(requestData.consent_types.analytics || requestData.consent_types.marketing || requestData.consent_types.preferences),
      consent_types: requestData.consent_types,
      ip_address: anonymizeIP(requestData.ip_address ?? null), // host portion zeroed — matches "IP anonymized" claim
      user_agent: requestData.user_agent ? requestData.user_agent.substring(0, 500) : null, // Reasonable limit
      source: requestData.source ? requestData.source.substring(0, 50) : 'cookie_banner',
      locale: requestData.locale ? requestData.locale.substring(0, 10) : 'sv',
      gpc_signal: requestData.gpc_signal || false,
      policy_version: requestData.policy_version ? requestData.policy_version.substring(0, 20) : '1.0',
      expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year
    };

    // Check for existing consent for this session
    const { data: existingConsent, error: lookupError } = await supabase
      .from('cookie_consents')
      .select('id')
      .eq('session_id', session_id)
      .eq('site_id', site_id)
      .maybeSingle();
    if (lookupError) return json('Unable to read consent state', 503);

    let result;
    if (existingConsent) {
      // Update existing consent
      const { data, error } = await supabase
        .from('cookie_consents')
        .update({
          consent_given: consentData.consent_given,
          consent_types: requestData.consent_types,
          updated_at: new Date().toISOString(),
          policy_version: consentData.policy_version,
          expires_at: consentData.expires_at,
          gpc_signal: consentData.gpc_signal,
          source: consentData.source,
          locale: consentData.locale,
        })
        .eq('id', existingConsent.id)
        .select()
        .single();

      if (error) {
        console.error('Database update error:', JSON.stringify(error, null, 2));
        throw error;
      }

      result = data;
      console.log('Updated existing consent:', result.id);
    } else {
      // Insert new consent
      const { data, error } = await supabase
        .from('cookie_consents')
        .insert(consentData)
        .select()
        .single();

      if (error) {
        console.error('Database insert error:', JSON.stringify(error, null, 2));
        throw error;
      }

      result = data;
      console.log('Created new consent:', result.id);
    }

    // Also validate the consent for compliance tracking
    {
      console.log('Creating consent validation record');
      
        const { error: validationError } = await supabase
        .from('consent_validations')
        .insert({
          site_id,
          session_id: session_id,
          validation_timestamp: new Date().toISOString(),
          consent_status: requestData.consent_types,
          ip_address: consentData.ip_address,
          user_agent: consentData.user_agent,
        });

      if (validationError) {
        console.warn('Could not create consent validation:', validationError);
        // Don't fail the entire request for validation errors
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        consent_id: result.id,
        message: 'Consent stored successfully',
        consent_types: requestData.consent_types,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in store-consent function:', error);

    // Do not leak error.stack / internals to the caller.
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Could not store consent',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

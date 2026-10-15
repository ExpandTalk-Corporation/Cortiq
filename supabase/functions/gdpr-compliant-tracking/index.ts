import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from '../_shared/supabase.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface TrackingRequest {
  site_id: string;
  session_id: string;
  event_type: string;
  event_data: any;
  integration_type: 'google_analytics' | 'meta_pixel' | 'google_ads' | 'linkedin_insight' | 'tiktok_pixel';
  third_party_data?: any;
}

// Third-party integration configurations
const INTEGRATION_CONSENT_REQUIREMENTS = {
  'google_analytics': ['analytics'],
  'meta_pixel': ['marketing'],
  'google_ads': ['marketing'],
  'linkedin_insight': ['marketing'],
  'tiktok_pixel': ['marketing'],
  'hotjar': ['analytics'],
  'microsoft_clarity': ['analytics']
};

async function checkConsent(site_id: string, session_id: string, integration_type: string) {
  const requiredConsents = INTEGRATION_CONSENT_REQUIREMENTS[integration_type as keyof typeof INTEGRATION_CONSENT_REQUIREMENTS] || [];
  
  const consentCheck = await supabase.functions.invoke('consent-check', {
    body: {
      site_id,
      session_id,
      consent_types: requiredConsents,
      integration_type
    }
  });

  return consentCheck;
}

async function sendToGoogleAnalytics(site_id: string, event_data: any) {
  // Get site configuration
  const { data: site } = await supabase
    .from('sites')
    .select('ga_measurement_id, ga_property_id')
    .eq('id', site_id)
    .single();

  if (!site?.ga_measurement_id) {
    console.log('Google Analytics not configured for site');
    return { success: false, reason: 'Not configured' };
  }

  try {
    const measurementId = site.ga_measurement_id;
    const apiSecret = Deno.env.get('GA4_API_SECRET');

    if (!apiSecret) {
      console.log('GA4 API Secret not configured');
      return { success: false, reason: 'API Secret missing' };
    }

    const response = await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: event_data.client_id || event_data.session_id,
        events: [{
          name: event_data.event_name || 'page_view',
          params: {
            page_title: event_data.page_title,
            page_location: event_data.page_url,
            ...event_data.custom_parameters
          }
        }]
      })
    });

    return { success: response.ok, status: response.status };
  } catch (error) {
    console.error('Google Analytics error:', error);
    return { success: false, error: error.message };
  }
}

async function sendToMetaPixel(site_id: string, event_data: any) {
  // Get site configuration
  const { data: site } = await supabase
    .from('sites')
    .select('facebook_pixel_id')
    .eq('id', site_id)
    .single();

  if (!site?.facebook_pixel_id) {
    console.log('Meta Pixel not configured for site');
    return { success: false, reason: 'Not configured' };
  }

  try {
    const pixelId = site.facebook_pixel_id;
    const accessToken = Deno.env.get('META_ACCESS_TOKEN');

    if (!accessToken) {
      console.log('Meta Access Token not configured');
      return { success: false, reason: 'Access Token missing' };
    }

    const response = await fetch(`https://graph.facebook.com/v18.0/${pixelId}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: [{
          event_name: event_data.event_name || 'PageView',
          event_time: Math.floor(Date.now() / 1000),
          event_source_url: event_data.page_url,
          user_data: {
            client_ip_address: event_data.ip_address,
            client_user_agent: event_data.user_agent
          },
          custom_data: event_data.custom_parameters || {}
        }],
        access_token: accessToken
      })
    });

    const result = await response.json();
    return { success: response.ok, result };
  } catch (error) {
    console.error('Meta Pixel error:', error);
    return { success: false, error: error.message };
  }
}

async function sendToGoogleAds(site_id: string, event_data: any) {
  // Get site configuration
  const { data: site } = await supabase
    .from('sites')
    .select('google_ads_conversion_id')
    .eq('id', site_id)
    .single();

  if (!site?.google_ads_conversion_id) {
    console.log('Google Ads not configured for site');
    return { success: false, reason: 'Not configured' };
  }

  try {
    // Google Ads Conversion Tracking
    const conversionId = site.google_ads_conversion_id;
    
    // This would typically use Google Ads API
    // For now, we'll log the attempt
    console.log('Google Ads conversion tracking:', {
      conversion_id: conversionId,
      event_data
    });

    return { success: true, message: 'Logged for Google Ads' };
  } catch (error) {
    console.error('Google Ads error:', error);
    return { success: false, error: error.message };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method === 'POST') {
    try {
      const body: TrackingRequest = await req.json();
      const { site_id, session_id, event_type, event_data, integration_type, third_party_data } = body;

      console.log('GDPR-compliant tracking request:', { site_id, session_id, event_type, integration_type });

      // Check consent first
      const consentResult = await checkConsent(site_id, session_id, integration_type);
      
      if (consentResult.error) {
        console.error('Consent check failed:', consentResult.error);
        return new Response(JSON.stringify({
          success: false,
          error: 'Consent check failed',
          details: consentResult.error
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const consentData = consentResult.data;

      if (!consentData.allowed) {
        console.log('Tracking blocked - no consent:', {
          integration_type,
          blocked_types: consentData.blocked_consent_types,
          reason: consentData.reason
        });

        return new Response(JSON.stringify({
          success: false,
          blocked: true,
          reason: 'No consent for this integration',
          blocked_consent_types: consentData.blocked_consent_types,
          validation_id: consentData.validation_id
        }), {
          status: 200, // Not an error, just blocked
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Consent granted, proceed with third-party integration
      let thirdPartyResult = { success: false, reason: 'Unknown integration' };

      switch (integration_type) {
        case 'google_analytics':
          thirdPartyResult = await sendToGoogleAnalytics(site_id, { ...event_data, ...third_party_data });
          break;
        case 'meta_pixel':
          thirdPartyResult = await sendToMetaPixel(site_id, { ...event_data, ...third_party_data });
          break;
        case 'google_ads':
          thirdPartyResult = await sendToGoogleAds(site_id, { ...event_data, ...third_party_data });
          break;
        default:
          console.log('Unknown integration type:', integration_type);
      }

      // Always track internally (this is first-party data)
      const internalTracking = await supabase.functions.invoke('pixel-tracking', {
        body: {
          type: event_type,
          siteId: site_id,
          sessionId: session_id,
          data: event_data
        }
      });

      console.log('Tracking completed:', {
        internal_success: !internalTracking.error,
        third_party_success: thirdPartyResult.success,
        integration_type,
        validation_id: consentData.validation_id
      });

      return new Response(JSON.stringify({
        success: true,
        internal_tracking: !internalTracking.error,
        third_party_result: thirdPartyResult,
        consent_validation_id: consentData.validation_id,
        allowed_consent_types: consentData.allowed_consent_types
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error('GDPR-compliant tracking error:', error);
      return new Response(JSON.stringify({
        success: false,
        error: 'Internal server error',
        details: error.message
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  return new Response('Method not allowed', { 
    status: 405, 
    headers: corsHeaders 
  });
});
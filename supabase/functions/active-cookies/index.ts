import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "../_shared/supabase.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ActiveCookiesRequest {
  site_id: string;
}

// Standard WordPress cookies that are always present
const WORDPRESS_STANDARD_COOKIES = [
  {
    cookie_name: 'gdpr_consent',
    provider_name: 'CortIQ',
    category_key: 'nödvändig',
    purpose: 'Lagrar användarens cookie-samtycke för GDPR-efterlevnad',
    description: 'Nödvändig cookie som kommer ihåg dina cookie-inställningar och samtycke',
    expiry: '1 år'
  }
];

// Integration-to-cookie mapping
const INTEGRATION_COOKIES = {
  // Analytics
  ga_integration_enabled: [
    { name: '_ga', category: 'analytics', provider: 'Google Analytics', purpose: 'Spårar unika besökare', expiry: '2 år' },
    { name: '_gid', category: 'analytics', provider: 'Google Analytics', purpose: 'Spårar sessioner', expiry: '24 timmar' },
    { name: '_gat', category: 'analytics', provider: 'Google Analytics', purpose: 'Begränsar förfrågningar', expiry: '1 minut' }
  ],
  hotjar_enabled: [
    { name: '_hjSessionUser_*', category: 'analytics', provider: 'Hotjar', purpose: 'Identifierar användare för heatmaps', expiry: '1 år' },
    { name: '_hjSession_*', category: 'analytics', provider: 'Hotjar', purpose: 'Spårar session för heatmaps', expiry: '30 minuter' }
  ],
  microsoft_clarity_enabled: [
    { name: '_clck', category: 'analytics', provider: 'Microsoft Clarity', purpose: 'Spårar användarinteraktioner', expiry: '1 år' },
    { name: '_clsk', category: 'analytics', provider: 'Microsoft Clarity', purpose: 'Spårar session', expiry: '1 dag' }
  ],
  mixpanel_enabled: [
    { name: 'mp_*', category: 'analytics', provider: 'Mixpanel', purpose: 'Spårar events och användaregenskaper', expiry: '1 år' }
  ],
  
  // Marketing
  facebook_pixel_enabled: [
    { name: '_fbp', category: 'marketing', provider: 'Facebook', purpose: 'Facebook Pixel spårning', expiry: '3 månader' },
    { name: '_fbc', category: 'marketing', provider: 'Facebook', purpose: 'Facebook konverteringsspårning', expiry: '7 dagar' }
  ],
  google_ads_enabled: [
    { name: '_gcl_au', category: 'marketing', provider: 'Google Ads', purpose: 'Google Ads konverteringsspårning', expiry: '90 dagar' },
    { name: '_gac_*', category: 'marketing', provider: 'Google Ads', purpose: 'Google Ads kampanjdata', expiry: '90 dagar' }
  ],
  tiktok_pixel_enabled: [
    { name: '_ttp', category: 'marketing', provider: 'TikTok', purpose: 'TikTok Pixel spårning', expiry: '1 år' }
  ],
  linkedin_insight_enabled: [
    { name: '_li_ss', category: 'marketing', provider: 'LinkedIn', purpose: 'LinkedIn Insight Tag', expiry: '30 dagar' },
    { name: '_li_fat_id', category: 'marketing', provider: 'LinkedIn', purpose: 'LinkedIn konverteringsspårning', expiry: '30 dagar' }
  ],
  hubspot_enabled: [
    { name: '__hssc', category: 'marketing', provider: 'HubSpot', purpose: 'HubSpot session spårning', expiry: '30 minuter' },
    { name: '__hssrc', category: 'marketing', provider: 'HubSpot', purpose: 'HubSpot session restart', expiry: 'Session' },
    { name: '__hstc', category: 'marketing', provider: 'HubSpot', purpose: 'HubSpot besökarspårning', expiry: '13 månader' }
  ],
  
  // Tag Managers
  gtm_enabled: [
    { name: '_gtm_*', category: 'nödvändig', provider: 'Google Tag Manager', purpose: 'Google Tag Manager konfiguration', expiry: 'Session' }
  ],
  adobe_tag_manager_enabled: [
    { name: 's_cc', category: 'analytics', provider: 'Adobe Analytics', purpose: 'Adobe Analytics konfiguration', expiry: 'Session' }
  ]
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { site_id }: ActiveCookiesRequest = await req.json();

    if (!site_id) {
      return new Response(
        JSON.stringify({ error: 'site_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching active cookies for site:', site_id);

    // Get site with all integration settings
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('*')
      .eq('id', site_id)
      .single();

    if (siteError || !site) {
      console.error('Site not found:', siteError);
      return new Response(
        JSON.stringify({ error: 'Site not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Site found, checking active integrations...');

    // Generate active cookies based on enabled integrations
    const activeCookies: any[] = [...WORDPRESS_STANDARD_COOKIES];

    // Check each integration and add its cookies if enabled
    Object.entries(INTEGRATION_COOKIES).forEach(([integrationField, cookies]) => {
      if (site[integrationField] === true) {
        console.log(`Integration ${integrationField} is enabled, adding cookies`);
        cookies.forEach(cookie => {
          activeCookies.push({
            cookie_name: cookie.name,
            cookie_category: cookie.category,
            cookie_provider: cookie.provider,
            cookie_purpose: cookie.purpose,
            cookie_expiry: cookie.expiry,
            source: 'integration_active'
          });
        });
      }
    });

    // Also get manually detected cookies for this site (as backup/additional)
    const { data: detectedCookies } = await supabase
      .from('detected_cookies')
      .select('*')
      .eq('site_id', site_id);

    if (detectedCookies) {
      detectedCookies.forEach(cookie => {
        // Only add if not already included from integrations
        const exists = activeCookies.some(ac => ac.cookie_name === cookie.cookie_name);
        if (!exists) {
          activeCookies.push({
            ...cookie,
            source: 'detected'
          });
        }
      });
    }

    // Categorize and count cookies
    const categorizedCookies = {
      necessary: activeCookies.filter(c => 
        c.cookie_category === 'necessary' || c.cookie_category === 'nödvändig'
      ),
      analytics: activeCookies.filter(c => 
        c.cookie_category === 'analytics' || c.cookie_category === 'analys'
      ),
      marketing: activeCookies.filter(c => 
        c.cookie_category === 'marketing' || c.cookie_category === 'marknadsföring'
      ),
      preferences: activeCookies.filter(c => 
        c.cookie_category === 'preferences' || c.cookie_category === 'funktionell'
      )
    };

    const counts = {
      necessary: categorizedCookies.necessary.length,
      analytics: categorizedCookies.analytics.length,
      marketing: categorizedCookies.marketing.length,
      preferences: categorizedCookies.preferences.length
    };

    console.log(`Found ${activeCookies.length} active cookies for site ${site_id}`);
    console.log('Cookie counts:', counts);

    return new Response(
      JSON.stringify({
        site_id,
        cookies: categorizedCookies,
        counts,
        total: activeCookies.length,
        active_integrations: Object.keys(INTEGRATION_COOKIES).filter(key => site[key] === true)
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in active-cookies function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
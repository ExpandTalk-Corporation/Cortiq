import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from '../_shared/supabase.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CookieImportRequest {
  site_id: string;
  banner_type: 'cookiebot' | 'onetrust';
  external_id: string;
  domain: string;
}

interface ImportedCookie {
  name: string;
  category: string;
  purpose: string;
  provider: string;
  expiry?: string;
  domain: string;
}

// Cookiebot API integration
async function importFromCookiebot(domainGroupId: string, domain: string): Promise<ImportedCookie[]> {
  try {
    // In a real implementation, you would use Cookiebot's API
    // For now, we'll simulate some common cookies they would categorize
    console.log(`Importing cookies from Cookiebot for domain group: ${domainGroupId}`);
    
    // Simulated Cookiebot response
    const cookiebotCookies: ImportedCookie[] = [
      {
        name: '_ga',
        category: 'analytics',
        purpose: 'Google Analytics - distinguishes users',
        provider: 'Google Analytics',
        expiry: '2 years',
        domain: domain
      },
      {
        name: '_ga_*',
        category: 'analytics', 
        purpose: 'Google Analytics 4 - session tracking',
        provider: 'Google Analytics 4',
        expiry: '2 years',
        domain: domain
      },
      {
        name: '_fbp',
        category: 'marketing',
        purpose: 'Facebook Pixel - tracks visitors',
        provider: 'Facebook',
        expiry: '3 months',
        domain: domain
      },
      {
        name: 'cookiebot-consent',
        category: 'necessary',
        purpose: 'Cookiebot consent storage',
        provider: 'Cookiebot',
        expiry: '1 year',
        domain: domain
      }
    ];
    
    return cookiebotCookies;
  } catch (error) {
    console.error('Error importing from Cookiebot:', error);
    throw new Error(`Failed to import from Cookiebot: ${error.message}`);
  }
}

// OneTrust API integration
async function importFromOneTrust(applicationId: string, domain: string): Promise<ImportedCookie[]> {
  try {
    console.log(`Importing cookies from OneTrust for application: ${applicationId}`);
    
    // Simulated OneTrust response
    const onetrustCookies: ImportedCookie[] = [
      {
        name: '_ga',
        category: 'analytics',
        purpose: 'Google Analytics Universal - user tracking',
        provider: 'Google LLC',
        expiry: '2 years',
        domain: domain
      },
      {
        name: '_gid',
        category: 'analytics',
        purpose: 'Google Analytics - session identification',
        provider: 'Google LLC', 
        expiry: '24 hours',
        domain: domain
      },
      {
        name: 'OptanonConsent',
        category: 'necessary',
        purpose: 'OneTrust consent management',
        provider: 'OneTrust',
        expiry: '1 year',
        domain: domain
      },
      {
        name: 'OptanonAlertBoxClosed',
        category: 'necessary',
        purpose: 'OneTrust banner dismissal tracking',
        provider: 'OneTrust',
        expiry: '1 year',
        domain: domain
      }
    ];
    
    return onetrustCookies;
  } catch (error) {
    console.error('Error importing from OneTrust:', error);
    throw new Error(`Failed to import from OneTrust: ${error.message}`);
  }
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { site_id, banner_type, external_id, domain }: CookieImportRequest = await req.json();
    
    if (!site_id || !banner_type || !external_id || !domain) {
      return new Response(
        JSON.stringify({ error: "Missing required parameters" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Starting cookie import for site ${site_id} from ${banner_type}`);

    let importedCookies: ImportedCookie[] = [];

    // Import cookies based on banner type
    switch (banner_type) {
      case 'cookiebot':
        importedCookies = await importFromCookiebot(external_id, domain);
        break;
      case 'onetrust':
        importedCookies = await importFromOneTrust(external_id, domain);
        break;
      default:
        throw new Error(`Unsupported banner type: ${banner_type}`);
    }

    // Save imported cookies to database
    if (importedCookies.length > 0) {
      const { error: cookiesError } = await supabase
        .from('detected_cookies')
        .upsert(
          importedCookies.map(cookie => ({
            site_id,
            cookie_name: cookie.name,
            cookie_domain: cookie.domain,
            cookie_category: cookie.category,
            cookie_purpose: cookie.purpose,
            cookie_provider: cookie.provider,
            cookie_expiry: cookie.expiry,
            is_third_party: !cookie.domain.includes(new URL(domain).hostname),
            detection_method: `${banner_type}_import`,
            script_source: `${banner_type} Import`
          })),
          { onConflict: 'site_id,cookie_name,cookie_domain' }
        );

      if (cookiesError) {
        console.error('Error saving imported cookies:', cookiesError);
        throw new Error('Failed to save imported cookies');
      }
    }

    // Update site's integration settings
    await supabase
      .from('sites')
      .update({ 
        last_cookie_scan: new Date().toISOString(),
        // Could store external integration settings here
      })
      .eq('id', site_id);

    console.log(`Cookie import completed for site ${site_id}. Imported ${importedCookies.length} cookies from ${banner_type}`);

    return new Response(
      JSON.stringify({
        success: true,
        imported_count: importedCookies.length,
        banner_type,
        cookies: importedCookies
      }),
      { 
        status: 200, 
        headers: { "Content-Type": "application/json", ...corsHeaders } 
      }
    );

  } catch (error: any) {
    console.error("Error in cookie-importer function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { "Content-Type": "application/json", ...corsHeaders } 
      }
    );
  }
};

serve(handler);
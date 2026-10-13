
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.3";
import { requireSiteAccess } from "../_shared/site-access.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🔍 GA4 Search Terms function started');
    
    const requestData = await req.json();
    console.log('Request data:', requestData);
    
    const { siteId, measurementId, startDate, endDate } = requestData;

    if (!siteId) {
      console.error('❌ Missing required parameter: siteId');
      return new Response(
        JSON.stringify({ error: 'Missing required parameter: siteId' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Caller must be signed in and have access to the site (RLS on sites).
    const authorization = req.headers.get('Authorization');
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authorization ?? '' } } },
    );
    const access = await requireSiteAccess(userClient, authorization, siteId);
    if (!access.ok) {
      return new Response(JSON.stringify({ error: access.error }), {
        status: access.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get site configuration - using same approach as ga4-traffic-sources
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('ga_property_id, ga_integration_enabled, site_name')
      .eq('id', siteId)
      .single();

    if (siteError || !site) {
      console.error('Site query error:', siteError);
      return new Response(
        JSON.stringify({ error: 'Site not found' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`Found site: ${site.site_name} (ID: ${siteId}) GA Property ID: ${site.ga_property_id}`);

    if (!site.ga_integration_enabled || !site.ga_property_id) {
      return new Response(
        JSON.stringify({ error: 'Google Analytics integration not enabled for this site' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Get GA4 service account credentials
    const serviceAccountKey = Deno.env.get('GA4_SERVICE_ACCOUNT_KEY');
    console.log('GA4 Service Account Key available:', !!serviceAccountKey);
    
    if (!serviceAccountKey) {
      console.error('❌ GA4 service account key not configured');
      return new Response(
        JSON.stringify({ error: 'GA4 service account key not configured' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Generate access token using same method as working functions
    const accessToken = await getGoogleAccessToken(serviceAccountKey);
    console.log('Access token generated:', !!accessToken);

    // Format dates with fallback to last 30 days
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const formattedStartDate = startDate || thirtyDaysAgo.toISOString().split('T')[0];
    const formattedEndDate = endDate || today.toISOString().split('T')[0];
    
    console.log('Formatted dates - Start:', formattedStartDate, 'End:', formattedEndDate);

    const requestBody = {
      property: `properties/${site.ga_property_id}`,
      dateRanges: [{
        startDate: formattedStartDate,
        endDate: formattedEndDate
      }],
      dimensions: [
        { name: 'searchTerm' },
        { name: 'date' }
      ],
      metrics: [
        { name: 'eventCount' }
      ],
      dimensionFilter: {
        filter: {
          fieldName: 'eventName',
          stringFilter: {
            matchType: 'EXACT',
            value: 'view_search_results'
          }
        }
      },
      orderBys: [
        {
          metric: {
            metricName: 'eventCount'
          },
          desc: true
        }
      ],
      limit: 50
    };

    console.log('Making GA4 API request for property:', site.ga_property_id);
    console.log('Request payload:', JSON.stringify(requestBody, null, 2));

    const gaResponse = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${site.ga_property_id}:runReport`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(requestBody)
      }
    );

    if (!gaResponse.ok) {
      const errorText = await gaResponse.text();
      console.error('GA4 API error:', gaResponse.status, errorText);
      
      // Return structured error response
      return new Response(
        JSON.stringify({ 
          error: 'Failed to fetch GA4 data',
          details: errorText,
          status: gaResponse.status 
        }),
        { 
          status: gaResponse.status, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const gaData = await gaResponse.json();
    console.log('GA4 API response received:', gaData.rowCount || 0, 'rows');

    // Process the response - same format as before but with better error handling
    const searchTerms = gaData.rows?.map((row: any) => ({
      searchTerm: row.dimensionValues[0]?.value || 'Unknown',
      eventCount: row.metricValues[0]?.value || '0',
      lastSearched: row.dimensionValues[1]?.value || new Date().toISOString().split('T')[0]
    })) || [];

    // Filter out empty or invalid search terms
    const validSearchTerms = searchTerms.filter((term: any) => 
      term.searchTerm && 
      term.searchTerm !== 'Unknown' && 
      term.searchTerm !== '(not set)' &&
      term.searchTerm.length > 1
    );

    console.log('Processed search terms:', validSearchTerms.length, 'valid terms');

    return new Response(
      JSON.stringify({ 
        searchTerms: validSearchTerms,
        totalResults: validSearchTerms.length 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in ga4-search-terms function:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

// Use same auth helper as ga4-kpi-dashboard
async function getGoogleAccessToken(serviceAccountKey: string): Promise<string> {
  const key = JSON.parse(serviceAccountKey);
  
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const header = { alg: 'RS256', typ: 'JWT' };
  const jwt = await createJWT(header, payload, key.private_key);

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  const data = await response.json();
  return data.access_token;
}

async function createJWT(header: any, payload: any, privateKey: string): Promise<string> {
  const encoder = new TextEncoder();
  
  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  
  const data = `${headerB64}.${payloadB64}`;
  const signature = await signWithRSA(data, privateKey);
  
  return `${data}.${signature}`;
}

async function signWithRSA(data: string, privateKey: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    str2ab(atob(privateKey.replace(/-----BEGIN PRIVATE KEY-----/g, '').replace(/-----END PRIVATE KEY-----/g, '').replace(/\s/g, ''))),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(data)
  );

  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function str2ab(str: string): ArrayBuffer {
  const buf = new ArrayBuffer(str.length);
  const bufView = new Uint8Array(buf);
  for (let i = 0, strLen = str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf;
}

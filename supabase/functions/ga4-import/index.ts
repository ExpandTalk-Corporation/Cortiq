import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from '../_shared/supabase.ts';

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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const serviceAccountKey = Deno.env.get('GA4_SERVICE_ACCOUNT_KEY');

    const { siteId, startDate, endDate } = await req.json();

    console.log('Fetching GA4 data for site:', { siteId, startDate, endDate });

    // 1. Hämta site configuration
    const { data: siteData, error: siteError } = await supabase
      .from('sites')
      .select('ga_measurement_id, ga_property_id, domain')
      .eq('id', siteId)
      .maybeSingle();

    if (siteError) {
      console.error('Database error:', siteError);
      throw new Error(`Database error: ${siteError.message}`);
    }
    
    if (!siteData) {
      throw new Error('Site not found');
    }
    
    if (!siteData.ga_property_id) {
      throw new Error('GA4 Property ID not configured for this site');
    }

    // 2. Hämta GA4 data via Google Analytics Data API  
    // Use the numeric Property ID directly
    const propertyId = siteData.ga_property_id;
    console.log('Using GA4 property ID:', propertyId, 'from measurement ID:', siteData.ga_measurement_id);
    
    const ga4Data = await fetchGA4Analytics({
      propertyId,
      startDate,
      endDate,
      domain: siteData.domain
    });

    // 3. Processera och spara data i vår databas
    const processedData = await processGA4Data(supabase, siteId, ga4Data);

    console.log('GA4 data import completed:', {
      sessions_imported: processedData.sessions,
      events_imported: processedData.events,
      conversions_imported: processedData.conversions
    });

    return new Response(JSON.stringify({
      success: true,
      data: processedData,
      message: 'GA4 data successfully imported'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in ga4-import:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false,
      errorType: error.name || 'UnknownError'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Funktion för att hämta GA4 analytics data
async function fetchGA4Analytics({
  propertyId,
  startDate,
  endDate,
  domain
}: {
  propertyId: string;
  startDate: string;
  endDate: string;
  domain: string;
}) {
  const accessToken = await getGA4AccessToken();
  
  const apiUrl = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  
  const requestBody = {
    dateRanges: [
      {
        startDate,
        endDate
      }
    ],
    dimensions: [
      { name: 'pagePath' },
      { name: 'eventName' },
      { name: 'sessionSourceMedium' },
      { name: 'deviceCategory' }
    ],
    metrics: [
      { name: 'sessions' },
      { name: 'pageviews' },
      { name: 'eventCount' },
      { name: 'conversions' },
      { name: 'engagementRate' }
    ],
    dimensionFilter: {
      filter: {
        fieldName: 'hostName',
        stringFilter: {
          matchType: 'CONTAINS',
          value: domain
        }
      }
    }
  };

  console.log('Fetching GA4 data:', { apiUrl, requestBody });

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('GA4 API Error Response:', errorText);
    throw new Error(`GA4 API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  return await response.json();
}

// Funktion för att få access token för GA4 API
async function getGA4AccessToken(): Promise<string> {
  const serviceAccountKey = Deno.env.get('GA4_SERVICE_ACCOUNT_KEY');
  
  if (!serviceAccountKey) {
    throw new Error('GA4_SERVICE_ACCOUNT_KEY not configured');
  }

  try {
    console.log('Service account key first 50 chars:', serviceAccountKey.substring(0, 50));
    console.log('Service account key length:', serviceAccountKey.length);
    
    const serviceAccount = JSON.parse(serviceAccountKey);
    console.log('Service account parsed successfully:', {
      type: serviceAccount.type,
      project_id: serviceAccount.project_id,
      client_email: serviceAccount.client_email
    });
    
    const now = Math.floor(Date.now() / 1000);
    
    // Create JWT payload
    const jwtPayload = {
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/analytics.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now
    };

    // Create JWT header
    const jwtHeader = {
      alg: 'RS256',
      typ: 'JWT'
    };

    // Encode header and payload using base64url
    const encoder = new TextEncoder();
    const encodedHeader = btoa(JSON.stringify(jwtHeader))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    
    const encodedPayload = btoa(JSON.stringify(jwtPayload))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    const textToSign = `${encodedHeader}.${encodedPayload}`;
    
    // Clean and format the private key
    let privateKeyPem = serviceAccount.private_key;
    if (!privateKeyPem.includes('-----BEGIN')) {
      privateKeyPem = `-----BEGIN PRIVATE KEY-----\n${privateKeyPem}\n-----END PRIVATE KEY-----`;
    }
    
    // Convert PEM to binary
    const pemContents = privateKeyPem
      .replace(/-----BEGIN PRIVATE KEY-----/, '')
      .replace(/-----END PRIVATE KEY-----/, '')
      .replace(/\s/g, '');
    
    const keyData = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

    // Import private key
    const privateKey = await crypto.subtle.importKey(
      'pkcs8',
      keyData,
      {
        name: 'RSASSA-PKCS1-v1_5',
        hash: 'SHA-256',
      },
      false,
      ['sign']
    );

    // Sign the JWT
    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      privateKey,
      encoder.encode(textToSign)
    );

    const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    const jwt = `${textToSign}.${encodedSignature}`;

    console.log('Created JWT for service account:', serviceAccount.client_email);

    // Exchange JWT for access token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token request failed:', errorText);
      throw new Error(`Token request failed: ${tokenResponse.status} ${errorText}`);
    }

    const tokenData = await tokenResponse.json();
    console.log('Successfully obtained access token');
    return tokenData.access_token;
    
  } catch (error) {
    console.error('Error getting GA4 access token:', error);
    throw new Error(`Failed to get GA4 access token: ${error.message}`);
  }
}

// Funktion för att processera GA4 data och spara i vår databas
async function processGA4Data(supabase: any, siteId: string, ga4Data: any) {
  let sessionsImported = 0;
  let eventsImported = 0;
  let conversionsImported = 0;

  // Processera varje rad från GA4
  for (const row of ga4Data.rows || []) {
    const dimensions = row.dimensionValues;
    const metrics = row.metricValues;

    const pagePath = dimensions[0].value;
    const eventName = dimensions[1].value;
    const sourceMedium = dimensions[2].value;
    const deviceCategory = dimensions[3].value;

    const sessions = parseInt(metrics[0].value) || 0;
    const pageviews = parseInt(metrics[1].value) || 0;
    const eventCount = parseInt(metrics[2].value) || 0;
    const conversions = parseInt(metrics[3].value) || 0;

    // Spara som page views i vår databas
    if (pageviews > 0) {
      try {
        await supabase
          .from('page_views')
          .insert({
            site_id: siteId,
            url: `https://example.com${pagePath}`, // Konstruera full URL
            session_id: `ga4_${Date.now()}_${Math.random()}`,
            title: `GA4 Import: ${pagePath}`,
            time_on_page: 0, // GA4 ger inte denna data direkt
            scroll_depth: 0,
            exit_page: false
          });
        sessionsImported++;
      } catch (error) {
        console.warn('Error importing page view:', error);
      }
    }

    // Spara conversions
    if (conversions > 0 && eventName !== '(not set)') {
      try {
        await supabase
          .from('conversion_events')
          .insert({
            site_id: siteId,
            event_type: 'ga4_import',
            event_name: eventName,
            event_value: conversions,
            session_id: `ga4_${Date.now()}_${Math.random()}`
          });
        conversionsImported++;
      } catch (error) {
        console.warn('Error importing conversion:', error);
      }
    }

    eventsImported += eventCount;
  }

  return {
    sessions: sessionsImported,
    events: eventsImported,
    conversions: conversionsImported
  };
}
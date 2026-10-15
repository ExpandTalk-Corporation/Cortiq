import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from '../_shared/supabase.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('🚀 GA4 Traffic Sources function started');
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: user } = await supabaseClient.auth.getUser(token);
    
    if (!user.user) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    const { siteId, startDate, endDate }: { siteId: string; startDate: string; endDate: string } = await req.json();

    console.log('Fetching traffic sources for site:', siteId, 'from', startDate, 'to', endDate);

    // Get site with GA Property ID
    const { data: site, error: siteError } = await supabaseClient
      .from('sites')
      .select('ga_property_id, site_name, user_id')
      .eq('id', siteId)
      .single();

    if (siteError || !site) {
      console.error('Site lookup error:', siteError);
      return new Response(JSON.stringify({ error: 'Site not found', siteId, userId: user.user.id }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Found site:', site.site_name, 'GA Property ID:', site.ga_property_id);

    if (site.user_id !== user.user.id) {
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!site.ga_property_id) {
      return new Response(JSON.stringify({ 
        error: 'GA Property ID not configured for this site',
        needsConfiguration: true 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Hämta Google service account key
    const serviceAccountKey = Deno.env.get('GA4_SERVICE_ACCOUNT_KEY');
    if (!serviceAccountKey) {
      console.error('GA4 service account key not found');
      return new Response(
        JSON.stringify({ error: 'GA4 service account key not configured' }), 
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Få access token
    const accessToken = await getGoogleAccessToken(serviceAccountKey);
    
    
    // Format dates correctly for GA4 API (YYYY-MM-DD)
    const formattedStartDate = new Date(startDate).toISOString().split('T')[0];
    const formattedEndDate = new Date(endDate).toISOString().split('T')[0];
    
    console.log('Formatted dates - Start:', formattedStartDate, 'End:', formattedEndDate);

    // GA4 API request med sessionDefaultChannelGroup för bättre kategorisering
    const reportRequest = {
      dateRanges: [{ startDate: formattedStartDate, endDate: formattedEndDate }],
      dimensions: [
        { name: "sessionSource" },
        { name: "sessionMedium" },
        { name: "sessionDefaultChannelGroup" },
        { name: "firstUserSource" },
        { name: "firstUserMedium" }
      ],
      metrics: [
        { name: "sessions" },
        { name: "activeUsers" },
        { name: "newUsers" },
        { name: "screenPageViews" }
      ],
      orderBys: [
        {
          metric: { metricName: "sessions" },
          desc: true
        }
      ],
      limit: 1000
    };

    console.log('Making GA4 API request for property:', site.ga_property_id);
    console.log('Request payload:', JSON.stringify(reportRequest, null, 2));

    const ga4Response = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${site.ga_property_id}:runReport`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(reportRequest),
      }
    );

    if (!ga4Response.ok) {
      const errorText = await ga4Response.text();
      console.error('GA4 API error:', ga4Response.status, errorText);
      return new Response(JSON.stringify({ 
        error: 'Failed to fetch data from Google Analytics',
        details: errorText
      }), {
        status: ga4Response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const ga4Data = await ga4Response.json();
    console.log('GA4 API response received');
    console.log('Total rows:', ga4Data.rows?.length || 0);
    console.log('Row count:', ga4Data.rowCount || 'not specified');
    
    // Logga alla rader för debugging
    if (ga4Data.rows && ga4Data.rows.length > 0) {
      console.log('All GA4 rows:', JSON.stringify(ga4Data.rows, null, 2));
    }

    // Bearbetning av svaret med nya dimensioner
    const trafficSources = Array.isArray(ga4Data.rows) ? ga4Data.rows.map((row: any) => {
      const sessionSource = row.dimensionValues?.[0]?.value ?? '(not set)';
      const sessionMedium = row.dimensionValues?.[1]?.value ?? '(not set)';
      const defaultChannelGroup = row.dimensionValues?.[2]?.value ?? '(not set)';
      const firstUserSource = row.dimensionValues?.[3]?.value ?? sessionSource;
      const firstUserMedium = row.dimensionValues?.[4]?.value ?? sessionMedium;
      
      return {
        source: sessionSource,
        medium: sessionMedium,
        sourceMedium: `${sessionSource} / ${sessionMedium}`,
        defaultChannelGroup: defaultChannelGroup,
        firstUserSource: firstUserSource,
        firstUserMedium: firstUserMedium,
        sessions: parseInt(row.metricValues?.[0]?.value ?? '0'),
        users: parseInt(row.metricValues?.[1]?.value ?? '0'),
        newUsers: parseInt(row.metricValues?.[2]?.value ?? '0'),
        pageViews: parseInt(row.metricValues?.[3]?.value ?? '0')
      };
    }) : [];

    // Logga traffic sources för debugging
    console.log('Processed traffic sources:');
    console.table(trafficSources);

    // Använd GA4's defaultChannelGroup för bättre kategorisering
    const categorizedSources = trafficSources.map((source: any) => {
      let category = 'Övrigt';
      
      // Använd först GA4's egen kategorisering
      if (source.defaultChannelGroup && source.defaultChannelGroup !== '(not set)') {
        switch (source.defaultChannelGroup.toLowerCase()) {
          case 'direct':
            category = 'Direkt trafik';
            break;
          case 'organic search':
            category = 'Organisk sökning';
            break;
          case 'organic social':
            category = 'Organiska sociala medier';
            break;
          case 'paid search':
            category = 'Betald sökning';
            break;
          case 'paid social':
            category = 'Betalda sociala medier';
            break;
          case 'referral':
            category = 'Hänvisningar';
            break;
          case 'email':
            category = 'E-post';
            break;
          case 'display':
            category = 'Display-annonsering';
            break;
          case 'affiliates':
            category = 'Affiliate';
            break;
          case 'video':
            category = 'Video';
            break;
          default:
            category = source.defaultChannelGroup;
        }
      } else {
        // Fallback till manuell kategorisering
        const medium = source.medium.toLowerCase();
        const sourceLower = source.source.toLowerCase();
        
        if (medium === 'organic') {
          category = 'Organisk sökning';
        } else if (medium === 'cpc' || medium === 'ppc' || medium.includes('paid')) {
          category = 'Betald sökning';
        } else if (medium === 'referral') {
          category = 'Hänvisningar';
        } else if (medium === 'social' || ['facebook', 'instagram', 'twitter', 'linkedin', 'youtube'].some(social => sourceLower.includes(social))) {
          category = 'Sociala medier';
        } else if (medium === 'email' || sourceLower.includes('mail')) {
          category = 'E-post';
        } else if (medium === 'direct' || medium === '(none)' || sourceLower === '(direct)') {
          category = 'Direkt trafik';
        } else if (medium.includes('display') || medium.includes('banner')) {
          category = 'Display-annonsering';
        } else if (medium.includes('affiliate')) {
          category = 'Affiliate';
        }
      }
      
      return { ...source, category };
    });

    // Logga kategorisering för debugging
    console.log('Categorized sources summary:');
    const categoryCount = categorizedSources.reduce((acc: any, source: any) => {
      acc[source.category] = (acc[source.category] || 0) + source.sessions;
      return acc;
    }, {});
    console.log(categoryCount);

    // Beräkna kategoristatistik
    const categoryStats = categorizedSources.reduce((acc: any, source: any) => {
      if (!acc[source.category]) {
        acc[source.category] = {
          category: source.category,
          sessions: 0,
          users: 0,
          pageViews: 0
        };
      }
      acc[source.category].sessions += source.sessions;
      acc[source.category].users += source.users;
      acc[source.category].pageViews += source.pageViews;
      return acc;
    }, {});

    const categories = Object.values(categoryStats).sort((a: any, b: any) => b.sessions - a.sessions);

    return new Response(JSON.stringify({
      success: true,
      trafficSources: categorizedSources,
      categories,
      totalSessions: trafficSources.reduce((sum: number, source: any) => sum + source.sessions, 0),
      dateRange: { startDate, endDate },
      debug: {
        totalRows: ga4Data.rows?.length || 0,
        propertyId: site.ga_property_id,
        dateRange: `${startDate} to ${endDate}`,
        originalGA4Data: ga4Data,
        processedSources: trafficSources.length,
        categorizedSourcesCount: categorizedSources.length
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in ga4-traffic-sources function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

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
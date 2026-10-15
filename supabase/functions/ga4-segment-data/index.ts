import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from '../_shared/supabase.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GASegmentRequest {
  siteId: string;
  startDate: string;
  endDate: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🚀 GA4 Segment Data function started');
    
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }), 
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { siteId, startDate, endDate }: GASegmentRequest = await req.json();
    console.log(`Fetching segment data for site: ${siteId} from ${startDate} to ${endDate}`);

    // Hämta site info och GA property ID
    const { data: site, error: siteError } = await supabaseClient
      .from('sites')
      .select('ga_property_id, ga_integration_enabled, site_name')
      .eq('id', siteId)
      .single();

    console.log('Site query result:', { site, siteError });

    if (siteError || !site) {
      console.error('Site not found:', siteError);
      return new Response(
        JSON.stringify({ error: 'Site not found', details: siteError?.message }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!site.ga_property_id || !site.ga_integration_enabled) {
      console.error('GA integration not enabled or property ID missing:', site);
      return new Response(
        JSON.stringify({ error: 'Google Analytics integration not properly configured' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found site: ${site.site_name} GA Property ID: ${site.ga_property_id}`);
    
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
    
    // GA4 Data API request för segment data (inkl. geografisk och användarbeteende)
    const gaRequest = {
      property: `properties/${site.ga_property_id}`,
      dateRanges: [{
        startDate: startDate,
        endDate: endDate
      }],
      dimensions: [
        { name: 'deviceCategory' },
        { name: 'sessionDefaultChannelGrouping' },
        { name: 'country' },
        { name: 'region' },
        { name: 'city' },
        { name: 'newVsReturning' }
      ],
      metrics: [
        { name: 'sessions' },
        { name: 'activeUsers' },
        { name: 'conversions' },
        { name: 'bounceRate' },
        { name: 'averageSessionDuration' },
        { name: 'screenPageViews' }
      ]
    };

    const gaResponse = await fetch(
      'https://analyticsdata.googleapis.com/v1beta/properties/' + site.ga_property_id + ':runReport',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(gaRequest)
      }
    );

    if (!gaResponse.ok) {
      const errorText = await gaResponse.text();
      console.error('GA API error:', gaResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: 'GA API request failed', details: errorText }), 
        { status: gaResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const gaData = await gaResponse.json();
    console.log('GA segment data received:', JSON.stringify(gaData, null, 2));

    // Processera segmentdata
    const deviceSegments = new Map();
    const channelSegments = new Map();
    const geoSegments = new Map();
    const behaviorSegments = new Map();
    let totalSessions = 0;

    if (gaData.rows) {
      gaData.rows.forEach((row: any) => {
        const deviceCategory = row.dimensionValues[0].value;
        const channelGrouping = row.dimensionValues[1].value;
        const country = row.dimensionValues[2].value;
        const region = row.dimensionValues[3].value;
        const city = row.dimensionValues[4].value;
        const newVsReturning = row.dimensionValues[5].value;
        const sessions = parseInt(row.metricValues[0].value);
        const users = parseInt(row.metricValues[1].value);
        const conversions = parseInt(row.metricValues[2].value);
        const bounceRate = parseFloat(row.metricValues[3].value);
        const avgSessionDuration = parseFloat(row.metricValues[4].value);
        const pageViews = parseInt(row.metricValues[5].value);

        totalSessions += sessions;

        // Gruppera per enhet
        if (!deviceSegments.has(deviceCategory)) {
          deviceSegments.set(deviceCategory, {
            deviceCategory,
            sessions: 0,
            users: 0,
            conversions: 0,
            bounceRate: 0,
            avgSessionDuration: 0,
            count: 0
          });
        }
        const deviceSegment = deviceSegments.get(deviceCategory);
        deviceSegment.sessions += sessions;
        deviceSegment.users += users;
        deviceSegment.conversions += conversions;
        deviceSegment.bounceRate += bounceRate;
        deviceSegment.avgSessionDuration += avgSessionDuration;
        deviceSegment.count++;

        // Gruppera per kanal
        if (!channelSegments.has(channelGrouping)) {
          channelSegments.set(channelGrouping, {
            channelGrouping,
            sessions: 0,
            users: 0,
            conversions: 0,
            bounceRate: 0,
            avgSessionDuration: 0,
            count: 0
          });
        }
        const channelSegment = channelSegments.get(channelGrouping);
        channelSegment.sessions += sessions;
        channelSegment.users += users;
        channelSegment.conversions += conversions;
        channelSegment.bounceRate += bounceRate;
        channelSegment.avgSessionDuration += avgSessionDuration;
        channelSegment.count++;

        // Gruppera per geografi (land)
        if (!geoSegments.has(country)) {
          geoSegments.set(country, {
            country,
            sessions: 0,
            users: 0,
            conversions: 0,
            bounceRate: 0,
            avgSessionDuration: 0,
            pageViews: 0,
            count: 0
          });
        }
        const geoSegment = geoSegments.get(country);
        geoSegment.sessions += sessions;
        geoSegment.users += users;
        geoSegment.conversions += conversions;
        geoSegment.bounceRate += bounceRate;
        geoSegment.avgSessionDuration += avgSessionDuration;
        geoSegment.pageViews += pageViews;
        geoSegment.count++;

        // Gruppera per användarbeteende
        if (!behaviorSegments.has(newVsReturning)) {
          behaviorSegments.set(newVsReturning, {
            userType: newVsReturning,
            sessions: 0,
            users: 0,
            conversions: 0,
            bounceRate: 0,
            avgSessionDuration: 0,
            pageViews: 0,
            count: 0
          });
        }
        const behaviorSegment = behaviorSegments.get(newVsReturning);
        behaviorSegment.sessions += sessions;
        behaviorSegment.users += users;
        behaviorSegment.conversions += conversions;
        behaviorSegment.bounceRate += bounceRate;
        behaviorSegment.avgSessionDuration += avgSessionDuration;
        behaviorSegment.pageViews += pageViews;
        behaviorSegment.count++;
      });
    }

    // Beräkna genomsnitt och konverteringsgrad
    const deviceSegmentArray = Array.from(deviceSegments.values()).map(segment => ({
      ...segment,
      conversionRate: segment.sessions > 0 ? (segment.conversions / segment.sessions) * 100 : 0,
      bounceRate: segment.count > 0 ? segment.bounceRate / segment.count : 0,
      avgSessionDuration: segment.count > 0 ? segment.avgSessionDuration / segment.count : 0
    }));

    const channelSegmentArray = Array.from(channelSegments.values()).map(segment => ({
      ...segment,
      conversionRate: segment.sessions > 0 ? (segment.conversions / segment.sessions) * 100 : 0,
      bounceRate: segment.count > 0 ? segment.bounceRate / segment.count : 0,
      avgSessionDuration: segment.count > 0 ? segment.avgSessionDuration / segment.count : 0
    }));

    const geoSegmentArray = Array.from(geoSegments.values())
      .map(segment => ({
        ...segment,
        conversionRate: segment.sessions > 0 ? (segment.conversions / segment.sessions) * 100 : 0,
        bounceRate: segment.count > 0 ? segment.bounceRate / segment.count : 0,
        avgSessionDuration: segment.count > 0 ? segment.avgSessionDuration / segment.count : 0,
        pageViewsPerSession: segment.sessions > 0 ? segment.pageViews / segment.sessions : 0
      }))
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 10); // Top 10 länder

    const behaviorSegmentArray = Array.from(behaviorSegments.values()).map(segment => ({
      ...segment,
      conversionRate: segment.sessions > 0 ? (segment.conversions / segment.sessions) * 100 : 0,
      bounceRate: segment.count > 0 ? segment.bounceRate / segment.count : 0,
      avgSessionDuration: segment.count > 0 ? segment.avgSessionDuration / segment.count : 0,
      pageViewsPerSession: segment.sessions > 0 ? segment.pageViews / segment.sessions : 0
    }));

    return new Response(
      JSON.stringify({
        totalSessions,
        deviceSegments: deviceSegmentArray,
        channelSegments: channelSegmentArray,
        geoSegments: geoSegmentArray,
        behaviorSegments: behaviorSegmentArray,
        period: `${startDate} - ${endDate}`
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in ga4-segment-data function:', error);
    return new Response(
      JSON.stringify({ error: error.message }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
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
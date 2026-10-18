import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from '../_shared/supabase.ts'
import { requireSiteAccess } from '../_shared/site-access.ts'
import { mergeDateRangeRows, resolveRange, sameRangeLastYear, validRange } from '../_shared/report-range.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface KPIRequest {
  siteId: string;
  startDate?: string;
  endDate?: string;
  comparisonStartDate?: string;
  comparisonEndDate?: string;
  /** Legacy: whole calendar year, used only when startDate/endDate are absent. */
  year?: number;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🚀 GA4 KPI Dashboard function started');

    let body: KPIRequest;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }
    const { siteId } = body;

    // Caller must be signed in and have access to the site (RLS on sites).
    const authorization = req.headers.get('Authorization');
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authorization ?? '' } } },
    );
    const access = await requireSiteAccess(userClient, authorization, siteId);
    if (!access.ok) return json({ error: access.error }, access.status);

    // startDate/endDate (or the legacy `year`) pick the period; the comparison period
    // defaults to the same dates one year earlier.
    const range = resolveRange(body, new Date());
    if (!range) return json({ error: 'Provide startDate and endDate (YYYY-MM-DD, max 366 days) or year' }, 400);
    const comparison = validRange(body.comparisonStartDate, body.comparisonEndDate) ?? sameRangeLastYear(range);
    const { startDate, endDate } = range;
    const { startDate: comparisonStartDate, endDate: comparisonEndDate } = comparison;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    console.log(`Fetching KPI data for site: ${siteId} from ${startDate} to ${endDate}, comparing with ${comparisonStartDate} to ${comparisonEndDate}`);

    // Get site configuration
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('ga_property_id, ga_integration_enabled, site_name')
      .eq('id', siteId)
      .single();

    if (siteError || !site) {
      console.error('Site query error:', siteError);
      throw new Error('Site not found');
    }

    console.log(`Found site: ${site.site_name} (ID: ${siteId}) GA Property ID: ${site.ga_property_id}`);

    if (!site.ga_integration_enabled || !site.ga_property_id) {
      throw new Error('Google Analytics integration not enabled for this site');
    }

    // Get GA4 service account key
    const serviceAccountKey = Deno.env.get('GA4_SERVICE_ACCOUNT_KEY');
    if (!serviceAccountKey) {
      console.error('GA4 service account key not found');
      throw new Error('GA4 service account key not configured');
    }

    console.log('GA4 Service Account Key available:', !!serviceAccountKey);

    // Get access token
    const accessToken = await getGoogleAccessToken(serviceAccountKey);
    console.log('Access token generated:', !!accessToken);

    const propertyId = site.ga_property_id;

    // Parallel fetch all KPI sections
    const [
      overallKPIs,
      digitalChannels,
      paidAdvertising,
      socialMedia,
      aiTraffic,
      newsletter,
      newsletterEvents
    ] = await Promise.all([
      getOverallKPIs(accessToken, propertyId, startDate, endDate, comparisonStartDate, comparisonEndDate),
      getDigitalChannels(accessToken, propertyId, startDate, endDate, comparisonStartDate, comparisonEndDate),
      getPaidAdvertising(accessToken, propertyId, startDate, endDate, comparisonStartDate, comparisonEndDate),
      getSocialMedia(accessToken, propertyId, startDate, endDate, comparisonStartDate, comparisonEndDate),
      getAITraffic(accessToken, propertyId, startDate, endDate, comparisonStartDate, comparisonEndDate),
      getNewsletter(accessToken, propertyId, startDate, endDate, comparisonStartDate, comparisonEndDate),
      getNewsletterEvents(accessToken, propertyId, startDate, endDate, comparisonStartDate, comparisonEndDate)
    ]);

    const dashboardData = {
      overgripande: overallKPIs,
      digitala_kanaler: digitalChannels,
      betald_annonsering: paidAdvertising,
      social_media: socialMedia,
      artificiell_intelligens: aiTraffic,
      nyhetsbrev: newsletter,
      nyhetsbrev_events: newsletterEvents,
      generatedAt: new Date().toISOString()
    };

    console.log('KPI Dashboard data compiled successfully');

    return new Response(
      JSON.stringify(dashboardData),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );

  } catch (error) {
    console.error('KPI Dashboard error:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    // Return more specific error information
    const errorResponse = {
      error: error.message,
      type: 'KPI_DASHBOARD_ERROR',
      timestamp: new Date().toISOString()
    };
    
    return new Response(
      JSON.stringify(errorResponse),
      { 
        status: 500,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );
  }
})

// === ÖVERGRIPANDE KPI:ER ===
async function getOverallKPIs(token: string, propertyId: string, startDate: string, endDate: string, comparisonStartDate: string, comparisonEndDate: string) {
  const requestBody = {
    property: `properties/${propertyId}`,
    dateRanges: [
      { startDate, endDate },
      { startDate: comparisonStartDate, endDate: comparisonEndDate }
    ],
    dimensions: [
      { name: 'month' },
      { name: 'deviceCategory' }
    ],
    metrics: [
      { name: 'sessions' },
      { name: 'activeUsers' },
      { name: 'newUsers' },
      { name: 'screenPageViews' },
      { name: 'averageSessionDuration' },
      { name: 'bounceRate' },
      { name: 'screenPageViewsPerSession' },
      { name: 'conversions' },
      { name: 'totalRevenue' },
      { name: 'purchaseRevenue' }
    ]
  };

  return await makeGA4Request(token, requestBody, 'overall');
}

// === DIGITALA KANALER ===
async function getDigitalChannels(token: string, propertyId: string, startDate: string, endDate: string, comparisonStartDate: string, comparisonEndDate: string) {
  const requestBody = {
    property: `properties/${propertyId}`,
    dateRanges: [
      { startDate, endDate },
      { startDate: comparisonStartDate, endDate: comparisonEndDate }
    ],
    dimensions: [
      { name: 'month' },
      { name: 'sessionSource' },
      { name: 'sessionMedium' },
      { name: 'deviceCategory' }
    ],
    metrics: [
      { name: 'sessions' },
      { name: 'activeUsers' },
      { name: 'conversions' },
      { name: 'totalRevenue' },
      { name: 'bounceRate' },
      { name: 'averageSessionDuration' }
    ],
    dimensionFilter: {
      orGroup: {
        expressions: [
          {
            filter: {
              fieldName: 'sessionMedium',
              stringFilter: { matchType: 'EXACT', value: 'organic' }
            }
          },
          {
            filter: {
              fieldName: 'sessionMedium',
              stringFilter: { matchType: 'EXACT', value: '(none)' }
            }
          },
          {
            filter: {
              fieldName: 'sessionMedium',
              stringFilter: { matchType: 'EXACT', value: 'referral' }
            }
          }
        ]
      }
    }
  };

  return await makeGA4Request(token, requestBody, 'channels');
}

// === BETALD ANNONSERING ===
async function getPaidAdvertising(token: string, propertyId: string, startDate: string, endDate: string, comparisonStartDate: string, comparisonEndDate: string) {
  const requestBody = {
    property: `properties/${propertyId}`,
    dateRanges: [
      { startDate, endDate },
      { startDate: comparisonStartDate, endDate: comparisonEndDate }
    ],
    dimensions: [
      { name: 'month' },
      { name: 'sessionSource' },
      { name: 'sessionMedium' },
      { name: 'sessionCampaignName' }
    ],
    metrics: [
      { name: 'sessions' },
      { name: 'activeUsers' },
      { name: 'conversions' },
      { name: 'totalRevenue' },
      { name: 'advertiserAdCost' },
      { name: 'advertiserAdClicks' },
      { name: 'advertiserAdImpressions' }
    ],
    dimensionFilter: {
      orGroup: {
        expressions: [
          {
            filter: {
              fieldName: 'sessionMedium',
              stringFilter: { matchType: 'EXACT', value: 'cpc' }
            }
          },
          {
            filter: {
              fieldName: 'sessionMedium',
              stringFilter: { matchType: 'EXACT', value: 'ppc' }
            }
          },
          {
            filter: {
              fieldName: 'sessionMedium',
              stringFilter: { matchType: 'EXACT', value: 'paid-social' }
            }
          },
          {
            filter: {
              fieldName: 'sessionMedium',
              stringFilter: { matchType: 'EXACT', value: 'display' }
            }
          }
        ]
      }
    }
  };

  return await makeGA4Request(token, requestBody, 'paid');
}

// === SOCIAL MEDIA ===
async function getSocialMedia(token: string, propertyId: string, startDate: string, endDate: string, comparisonStartDate: string, comparisonEndDate: string) {
  const requestBody = {
    property: `properties/${propertyId}`,
    dateRanges: [
      { startDate, endDate },
      { startDate: comparisonStartDate, endDate: comparisonEndDate }
    ],
    dimensions: [
      { name: 'month' },
      { name: 'sessionSource' },
      { name: 'sessionMedium' }
    ],
    metrics: [
      { name: 'sessions' },
      { name: 'activeUsers' },
      { name: 'conversions' },
      { name: 'totalRevenue' },
      { name: 'bounceRate' },
      { name: 'averageSessionDuration' }
    ],
    dimensionFilter: {
      orGroup: {
        expressions: [
          {
            filter: {
              fieldName: 'sessionSource',
              stringFilter: { matchType: 'CONTAINS', value: 'facebook' }
            }
          },
          {
            filter: {
              fieldName: 'sessionSource',
              stringFilter: { matchType: 'CONTAINS', value: 'instagram' }
            }
          },
          {
            filter: {
              fieldName: 'sessionSource',
              stringFilter: { matchType: 'CONTAINS', value: 'linkedin' }
            }
          },
          {
            filter: {
              fieldName: 'sessionSource',
              stringFilter: { matchType: 'CONTAINS', value: 'twitter' }
            }
          },
          {
            filter: {
              fieldName: 'sessionSource',
              stringFilter: { matchType: 'CONTAINS', value: 'youtube' }
            }
          },
          {
            filter: {
              fieldName: 'sessionSource',
              stringFilter: { matchType: 'CONTAINS', value: 'tiktok' }
            }
          }
        ]
      }
    }
  };

  return await makeGA4Request(token, requestBody, 'social');
}

// === ARTIFICIELL INTELLIGENS ===
async function getAITraffic(token: string, propertyId: string, startDate: string, endDate: string, comparisonStartDate: string, comparisonEndDate: string) {
  const requestBody = {
    property: `properties/${propertyId}`,
    dateRanges: [
      { startDate, endDate },
      { startDate: comparisonStartDate, endDate: comparisonEndDate }
    ],
    dimensions: [
      { name: 'month' },
      { name: 'sessionSource' },
      { name: 'landingPage' }
    ],
    metrics: [
      { name: 'sessions' },
      { name: 'activeUsers' },
      { name: 'conversions' },
      { name: 'totalRevenue' },
      { name: 'bounceRate' },
      { name: 'averageSessionDuration' },
      { name: 'screenPageViewsPerSession' }
    ],
    dimensionFilter: {
      orGroup: {
        expressions: [
          {
            filter: {
              fieldName: 'sessionSource',
              stringFilter: { matchType: 'CONTAINS', value: 'chatgpt' }
            }
          },
          {
            filter: {
              fieldName: 'sessionSource',
              stringFilter: { matchType: 'CONTAINS', value: 'perplexity' }
            }
          },
          {
            filter: {
              fieldName: 'sessionSource',
              stringFilter: { matchType: 'CONTAINS', value: 'claude' }
            }
          },
          {
            filter: {
              fieldName: 'sessionSource',
              stringFilter: { matchType: 'CONTAINS', value: 'gemini' }
            }
          },
          {
            filter: {
              fieldName: 'sessionSource',
              stringFilter: { matchType: 'CONTAINS', value: 'copilot' }
            }
          },
          {
            filter: {
              fieldName: 'sessionSource',
              stringFilter: { matchType: 'CONTAINS', value: 'you.com' }
            }
          },
          {
            filter: {
              fieldName: 'sessionSource',
              stringFilter: { matchType: 'CONTAINS', value: 'poe' }
            }
          }
        ]
      }
    }
  };

  return await makeGA4Request(token, requestBody, 'ai');
}

// === NYHETSBREV ===
async function getNewsletter(token: string, propertyId: string, startDate: string, endDate: string, comparisonStartDate: string, comparisonEndDate: string) {
  const requestBody = {
    property: `properties/${propertyId}`,
    dateRanges: [
      { startDate, endDate },
      { startDate: comparisonStartDate, endDate: comparisonEndDate }
    ],
    dimensions: [
      { name: 'month' },
      { name: 'sessionSource' },
      { name: 'sessionCampaignName' }
    ],
    metrics: [
      { name: 'sessions' },
      { name: 'activeUsers' },
      { name: 'conversions' },
      { name: 'totalRevenue' }
    ],
    dimensionFilter: {
      orGroup: {
        expressions: [
          {
            filter: {
              fieldName: 'sessionMedium',
              stringFilter: { matchType: 'EXACT', value: 'email' }
            }
          },
          {
            filter: {
              fieldName: 'sessionSource',
              stringFilter: { matchType: 'CONTAINS', value: 'newsletter' }
            }
          },
          {
            filter: {
              fieldName: 'sessionSource',
              stringFilter: { matchType: 'CONTAINS', value: 'mailchimp' }
            }
          }
        ]
      }
    }
  };

  return await makeGA4Request(token, requestBody, 'newsletter');
}

// === NEWSLETTER EVENTS ===
async function getNewsletterEvents(token: string, propertyId: string, startDate: string, endDate: string, comparisonStartDate: string, comparisonEndDate: string) {
  const requestBody = {
    property: `properties/${propertyId}`,
    dateRanges: [
      { startDate, endDate },
      { startDate: comparisonStartDate, endDate: comparisonEndDate }
    ],
    dimensions: [
      { name: 'month' },
      { name: 'eventName' }
    ],
    metrics: [
      { name: 'eventCount' },
      { name: 'eventCountPerUser' }
    ],
    dimensionFilter: {
      orGroup: {
        expressions: [
          {
            filter: {
              fieldName: 'eventName',
              stringFilter: { matchType: 'EXACT', value: 'newsletter_signup' }
            }
          },
          {
            filter: {
              fieldName: 'eventName',
              stringFilter: { matchType: 'EXACT', value: 'newsletter_confirmation' }
            }
          },
          {
            filter: {
              fieldName: 'eventName',
              stringFilter: { matchType: 'EXACT', value: 'newsletter_unsubscribe' }
            }
          }
        ]
      }
    }
  };

  return await makeGA4Request(token, requestBody, 'newsletter_events');
}

// === HJÄLPFUNKTIONER ===
async function makeGA4Request(token: string, requestBody: any, type: string) {
  // Extract property ID from the request body to build correct URL
  const propertyId = requestBody.property.replace('properties/', '');
  const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`GA4 API error for ${type}:`, {
      status: response.status,
      statusText: response.statusText,
      error: errorText,
      url: response.url,
      requestBody: JSON.stringify(requestBody, null, 2)
    });
    
    // Try to parse error details
    try {
      const errorJson = JSON.parse(errorText);
      console.error('GA4 API detailed error:', errorJson);
    } catch {
      console.error('GA4 API raw error:', errorText);
    }
    
    throw new Error(`GA4 API request failed for ${type}: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log(`${type} data received:`, data.rowCount || 0, 'rows');
  
  return formatResponse(data, type);
}

function formatResponse(response: any, type: string) {
  const formattedData = {
    type,
    periods: ['current', 'comparison'],
    data: [],
    summary: {
      totalRows: response.rowCount || 0,
      metricHeaders: response.metricHeaders || [],
      dimensionHeaders: response.dimensionHeaders || []
    }
  };

  if (!response.rows || response.rows.length === 0) {
    return formattedData;
  }

  // GA4 returns one row per date range (tagged with a "dateRange" dimension); fold them so
  // each row carries current and comparison values for the same dimension tuple.
  const merged = mergeDateRangeRows(response);

  merged.rows.forEach((row) => {
    const rowData: any = {
      dimensions: row.dimensions,
      metrics: {}
    };

    merged.metricNames.forEach((name, index) => {
      const currentValue = row.current[index];
      const comparisonValue = row.comparison ? row.comparison[index] : null;

      rowData.metrics[name] = {
        current: currentValue,
        comparison: comparisonValue,
        growth: comparisonValue ? ((currentValue - comparisonValue) / comparisonValue * 100) : null
      };
    });

    // Calculate derived KPIs
    rowData.calculated = calculateKPIs(rowData.metrics);

    formattedData.data.push(rowData);
  });

  return formattedData;
}

function calculateKPIs(metrics: any) {
  const calculated: any = {};

  // Conversion Rate
  if (metrics.conversions && metrics.sessions) {
    calculated.conversionRate = {
      current: (metrics.conversions.current / metrics.sessions.current * 100) || 0,
      comparison: metrics.conversions.comparison && metrics.sessions.comparison ? 
        (metrics.conversions.comparison / metrics.sessions.comparison * 100) : null
    };
  }

  // Revenue Per Session
  if (metrics.totalRevenue && metrics.sessions) {
    calculated.revenuePerSession = {
      current: (metrics.totalRevenue.current / metrics.sessions.current) || 0,
      comparison: metrics.totalRevenue.comparison && metrics.sessions.comparison ? 
        (metrics.totalRevenue.comparison / metrics.sessions.comparison) : null
    };
  }

  // ROAS (Return on Ad Spend) - for paid advertising
  if (metrics.totalRevenue && metrics.advertiserAdCost) {
    calculated.roas = {
      current: metrics.advertiserAdCost.current > 0 ? 
        (metrics.totalRevenue.current / metrics.advertiserAdCost.current) : 0,
      comparison: metrics.advertiserAdCost.comparison && metrics.advertiserAdCost.comparison > 0 ? 
        (metrics.totalRevenue.comparison / metrics.advertiserAdCost.comparison) : null
    };
  }

  // CPA (Cost Per Acquisition) - for paid advertising
  if (metrics.advertiserAdCost && metrics.conversions) {
    calculated.cpa = {
      current: metrics.conversions.current > 0 ? 
        (metrics.advertiserAdCost.current / metrics.conversions.current) : 0,
      comparison: metrics.conversions.comparison && metrics.conversions.comparison > 0 ? 
        (metrics.advertiserAdCost.comparison / metrics.conversions.comparison) : null
    };
  }

  return calculated;
}

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
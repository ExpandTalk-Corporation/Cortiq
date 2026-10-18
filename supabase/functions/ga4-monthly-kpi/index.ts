import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from '../_shared/supabase.ts';
import { mergeDateRangeRows, resolveRange, validRange } from '../_shared/report-range.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    const { data: user } = await supabase.auth.getUser(token);
    if (!user.user) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    const body: {
      siteId: string;
      startDate?: string; endDate?: string;
      comparisonStartDate?: string; comparisonEndDate?: string;
      /** Legacy: whole calendar year, used only when startDate/endDate are absent. */
      year?: number;
    } = await req.json();
    const { siteId } = body;
    const today = new Date();
    // Explicit dates win, then `year`, then the current year (the original default).
    const range = resolveRange(body, today) ?? resolveRange({ year: today.getUTCFullYear() }, today)!;
    const comparison = validRange(body.comparisonStartDate, body.comparisonEndDate);

    // Fetch site and verify ownership
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('ga_property_id, site_name, user_id')
      .eq('id', siteId)
      .single();

    if (siteError || !site) {
      return new Response(JSON.stringify({ error: 'Site not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (site.user_id !== user.user.id) {
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!site.ga_property_id) {
      return new Response(JSON.stringify({ error: 'GA Property ID not configured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Service account
    const serviceAccountKey = Deno.env.get('GA4_SERVICE_ACCOUNT_KEY');
    if (!serviceAccountKey) {
      return new Response(JSON.stringify({ error: 'GA4 service account key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { startDate, endDate } = range;
    const accessToken = await getGoogleAccessToken(serviceAccountKey);

    const requestBody = {
      property: `properties/${site.ga_property_id}`,
      dateRanges: comparison ? [ range, comparison ] : [ range ],
      dimensions: [ { name: 'month' } ],
      metrics: [ { name: 'activeUsers' }, { name: 'sessions' }, { name: 'screenPageViews' } ],
      orderBys: [ { metric: { metricName: 'activeUsers' }, desc: true } ],
      limit: 1200,
    };

    const gaRes = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${site.ga_property_id}:runReport`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!gaRes.ok) {
      const errText = await gaRes.text();
      return new Response(JSON.stringify({ error: 'GA4 error', details: errText }), {
        status: gaRes.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const gaData = await gaRes.json();

    const monthsMap: Record<string, { month: string; monthName: string; uniqueUsers: number; sessions: number; pageViews: number } > = {};
    for (let i = 1; i <= 12; i++) {
      const m = i.toString().padStart(2, '0');
      monthsMap[m] = {
        month: m,
        monthName: ['Januari','Februari','Mars','April','Maj','Juni','Juli','Augusti','September','Oktober','November','December'][i-1],
        uniqueUsers: 0,
        sessions: 0,
        pageViews: 0,
      };
    }

    // Rows come back per date range when a comparison is requested; months hold the
    // current period, comparisonTotals the comparison period.
    const merged = mergeDateRangeRows(gaData);
    const comparisonTotals = comparison ? { uniqueUsers: 0, sessions: 0, pageViews: 0 } : null;
    merged.rows.forEach((row) => {
      const month = row.dimensions.month || '01';
      const [activeUsers = 0, sessions = 0, pageViews = 0] = row.current;
      if (monthsMap[month]) {
        monthsMap[month].uniqueUsers += activeUsers;
        monthsMap[month].sessions += sessions;
        monthsMap[month].pageViews += pageViews;
      }
      if (comparisonTotals && row.comparison) {
        comparisonTotals.uniqueUsers += row.comparison[0] ?? 0;
        comparisonTotals.sessions += row.comparison[1] ?? 0;
        comparisonTotals.pageViews += row.comparison[2] ?? 0;
      }
    });

    const months = Object.values(monthsMap);

    const totals = months.reduce((acc, m) => {
      acc.uniqueUsers += m.uniqueUsers;
      acc.sessions += m.sessions;
      acc.pageViews += m.pageViews;
      return acc;
    }, { uniqueUsers: 0, sessions: 0, pageViews: 0 });

    return new Response(JSON.stringify({
      success: true,
      site: { id: siteId, name: site.site_name, propertyId: site.ga_property_id },
      year: Number(startDate.slice(0, 4)),
      startDate,
      endDate,
      comparisonStartDate: comparison?.startDate ?? null,
      comparisonEndDate: comparison?.endDate ?? null,
      months,
      totals,
      comparisonTotals,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err: any) {
    console.error('ga4-monthly-kpi error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
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

  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function str2ab(str: string): ArrayBuffer {
  const buf = new ArrayBuffer(str.length);
  const bufView = new Uint8Array(buf);
  for (let i = 0; i < str.length; i++) bufView[i] = str.charCodeAt(i);
  return buf;
}

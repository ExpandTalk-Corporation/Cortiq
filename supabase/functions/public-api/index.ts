import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

interface ApiKeyValidation {
  api_key_id: string;
  company_id: string;
  site_id: string;
  permissions: string[];
  rate_limit: number;
}

/**
 * Validate API key from Authorization header
 */
async function validateApiKey(authHeader: string | null, supabase: any): Promise<ApiKeyValidation | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const apiKey = authHeader.substring(7); // Remove 'Bearer '

  // Hash the API key for database lookup (Web Crypto — no external import needed)
  const keyBytes = new TextEncoder().encode(apiKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", keyBytes);
  const keyHash = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  const { data, error } = await supabase.rpc('validate_api_key', { p_key_hash: keyHash });

  if (error || !data || data.length === 0) {
    return null;
  }

  return data[0];
}

/**
 * Check rate limit for API key (requests logged in api_key_usage during the last hour)
 */
async function checkRateLimit(apiKeyId: string, rateLimit: number, supabase: any): Promise<boolean> {
  const { data } = await supabase.rpc('check_rate_limit', {
    p_api_key_id: apiKeyId,
    p_rate_limit: rateLimit
  });

  return data === true;
}

/**
 * Log API usage
 */
async function logUsage(
  apiKeyId: string,
  endpoint: string,
  method: string,
  statusCode: number,
  responseTimeMs: number,
  requestIp: string,
  userAgent: string,
  supabase: any
) {
  await supabase.rpc('log_api_usage', {
    p_api_key_id: apiKeyId,
    p_endpoint: endpoint,
    p_method: method,
    p_status_code: statusCode,
    p_response_time_ms: responseTimeMs,
    p_request_ip: requestIp,
    p_user_agent: userAgent
  });
}

/**
 * Parse query parameters
 */
function getQueryParams(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  const urlObj = new URL(url);
  urlObj.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  return params;
}

/**
 * Convert data to CSV format
 */
function convertToCSV(data: any[]): string {
  if (!data || data.length === 0) {
    return '';
  }

  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(','),
    ...data.map(row =>
      headers.map(header => {
        const value = row[header];
        // Escape commas and quotes
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',')
    )
  ];

  return csvRows.join('\n');
}

/**
 * Hosted Supabase caps every PostgREST response at 1,000 rows (max_rows), so
 * `limit` is clamped to 1..1000. Use `offset` to page through larger ranges.
 */
const MAX_LIMIT = 1000;

function getWindow(params: Record<string, string>) {
  const dateFrom = params.date_from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const dateTo = params.date_to || new Date().toISOString();
  const rawLimit = parseInt(params.limit || String(MAX_LIMIT), 10);
  const rawOffset = parseInt(params.offset || '0', 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), MAX_LIMIT) : MAX_LIMIT;
  const offset = Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : 0;
  return { dateFrom, dateTo, limit, offset };
}

/**
 * GET /sites - The site this API key is scoped to.
 * API keys are site-scoped (api_keys.site_id); the sites table has no company_id column.
 */
async function handleGetSites(apiKey: ApiKeyValidation, supabase: any) {
  const { data, error } = await supabase
    .from('sites')
    .select('id, domain, name:site_name, created_at, is_active')
    .eq('id', apiKey.site_id);

  if (error) throw error;
  return data;
}

/**
 * GET /sites/{id}/visits - Sessions (tracking_sessions). IP and raw user agent are not exposed.
 */
async function handleGetVisits(siteId: string, params: Record<string, string>, supabase: any) {
  const { dateFrom, dateTo, limit, offset } = getWindow(params);
  const { data, error } = await supabase
    .from('tracking_sessions')
    .select('id, session_id, site_id, started_at, last_activity, duration_seconds, page_views, device_type, browser, os, referrer, referrer_url, utm_source, utm_medium, utm_campaign, utm_term, utm_content, screen_width, screen_height, viewport_width, viewport_height')
    .eq('site_id', siteId)
    .gte('started_at', dateFrom)
    .lte('started_at', dateTo)
    .order('started_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return data;
}

/**
 * GET /sites/{id}/pages - Page views (page_views)
 */
async function handleGetPages(siteId: string, params: Record<string, string>, supabase: any) {
  const { dateFrom, dateTo, limit, offset } = getWindow(params);
  const { data, error } = await supabase
    .from('page_views')
    .select('id, site_id, session_id, url, title, referrer, time_on_page, scroll_depth, exit_page, is_conversion_page, viewed_at')
    .eq('site_id', siteId)
    .gte('viewed_at', dateFrom)
    .lte('viewed_at', dateTo)
    .order('viewed_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return data;
}

/**
 * GET /sites/{id}/referrers - Sessions with a referrer, aggregated by referrer hostname.
 * Aggregates over at most MAX_LIMIT sessions (most recent first) in the window.
 */
async function handleGetReferrers(siteId: string, params: Record<string, string>, supabase: any) {
  const { dateFrom, dateTo } = getWindow(params);
  const { data, error } = await supabase
    .from('tracking_sessions')
    .select('referrer_url')
    .eq('site_id', siteId)
    .gte('started_at', dateFrom)
    .lte('started_at', dateTo)
    .not('referrer_url', 'is', null)
    .order('started_at', { ascending: false })
    .limit(MAX_LIMIT);

  if (error) throw error;

  const referrersMap = new Map<string, number>();
  (data ?? []).forEach((row: any) => {
    let domain = 'unknown';
    try {
      domain = new URL(row.referrer_url).hostname || 'unknown';
    } catch {
      // referrer_url is not a parseable URL
    }
    referrersMap.set(domain, (referrersMap.get(domain) || 0) + 1);
  });

  return Array.from(referrersMap.entries()).map(([domain, count]) => ({
    domain,
    visits: count
  })).sort((a, b) => b.visits - a.visits);
}

/**
 * GET /sites/{id}/agents - AI agent sessions (ai_agent_sessions). Device fingerprint is not exposed.
 */
async function handleGetAgents(siteId: string, params: Record<string, string>, supabase: any) {
  const { dateFrom, dateTo, limit, offset } = getWindow(params);
  const { data, error } = await supabase
    .from('ai_agent_sessions')
    .select('id, site_id, session_id, bot_type, bot_name, browser_type, is_visual_browser, started_at, last_activity_at, total_requests, total_pages_viewed, total_assets_loaded, reached_conversion, conversion_page, conversion_at, exit_page')
    .eq('site_id', siteId)
    .gte('started_at', dateFrom)
    .lte('started_at', dateTo)
    .order('started_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return data;
}

/**
 * GET /sites/{id}/conversions - Conversion events. Form data and hashed email are not exposed.
 */
async function handleGetConversions(siteId: string, params: Record<string, string>, supabase: any) {
  const { dateFrom, dateTo, limit, offset } = getWindow(params);
  const { data, error } = await supabase
    .from('conversion_events')
    .select('id, site_id, session_id, page_view_id, event_type, event_name, event_value, element_selector, lead_quality, quality_value, upload_status, created_at')
    .eq('site_id', siteId)
    .gte('created_at', dateFrom)
    .lte('created_at', dateTo)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return data;
}

/**
 * GET /sites/{id}/heatmaps - Click/scroll heatmap points (heatmap_data). IP is not exposed.
 */
async function handleGetHeatmaps(siteId: string, params: Record<string, string>, supabase: any) {
  const { dateFrom, dateTo, limit, offset } = getWindow(params);

  let query = supabase
    .from('heatmap_data')
    .select('id, site_id, url, interaction_type, device_type, x_coordinate, y_coordinate, grid_x, grid_y, viewport_width, viewport_height, element_selector, created_at')
    .eq('site_id', siteId)
    .gte('created_at', dateFrom)
    .lte('created_at', dateTo);

  if (params.page_url) {
    query = query.eq('url', params.page_url);
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return data;
}

/**
 * Resolve the route segments after the function name.
 * Supabase passes the pathname WITH the function name (e.g. "/public-api/sites"),
 * so strip an optional "functions/v1" prefix, the "public-api" segment, and an
 * optional legacy "api/v1" (or "v1") prefix. "/public-api/sites" and
 * "/public-api/api/v1/sites" both resolve to ["sites"].
 */
function resolveRoute(pathname: string): string[] {
  let parts = pathname.split('/').filter(p => p);
  if (parts[0] === 'functions' && parts[1] === 'v1') parts = parts.slice(2);
  if (parts[0] === 'public-api') parts = parts.slice(1);
  if (parts[0] === 'api' && parts[1] === 'v1') parts = parts.slice(2);
  else if (parts[0] === 'v1') parts = parts.slice(1);
  return parts;
}

function jsonError(status: number, body: Record<string, unknown>, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extraHeaders }
  });
}

/**
 * Main request handler
 */
serve(async (req) => {
  const startTime = Date.now();

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return jsonError(405, { error: 'Method not allowed' }, { 'Allow': 'GET, OPTIONS' });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Validate API key
    const authHeader = req.headers.get('authorization');
    const apiKey = await validateApiKey(authHeader, supabase);

    if (!apiKey) {
      return jsonError(401, { error: 'Invalid or missing API key' });
    }

    // Check rate limit
    const withinLimit = await checkRateLimit(apiKey.api_key_id, apiKey.rate_limit, supabase);
    if (!withinLimit) {
      return jsonError(429, { error: 'Rate limit exceeded', retry_after: 3600 }, {
        'X-RateLimit-Limit': apiKey.rate_limit.toString(),
        'Retry-After': '3600'
      });
    }

    // Parse URL and route
    const url = new URL(req.url);
    const pathParts = resolveRoute(url.pathname);
    const params = getQueryParams(req.url);
    const format = params.format || 'json';

    let data: any;
    const endpoint = url.pathname;

    if (pathParts.length === 1 && pathParts[0] === 'sites') {
      // GET /sites
      data = await handleGetSites(apiKey, supabase);
    } else if (pathParts.length === 3 && pathParts[0] === 'sites') {
      const siteId = pathParts[1];
      const resource = pathParts[2];

      // Keys are scoped to exactly one site
      if (!apiKey.site_id || siteId !== apiKey.site_id) {
        return jsonError(404, { error: 'Site not found or access denied' });
      }

      switch (resource) {
        case 'visits':
          data = await handleGetVisits(siteId, params, supabase);
          break;
        case 'pages':
          data = await handleGetPages(siteId, params, supabase);
          break;
        case 'referrers':
          data = await handleGetReferrers(siteId, params, supabase);
          break;
        case 'agents':
          data = await handleGetAgents(siteId, params, supabase);
          break;
        case 'conversions':
          data = await handleGetConversions(siteId, params, supabase);
          break;
        case 'heatmaps':
          data = await handleGetHeatmaps(siteId, params, supabase);
          break;
        default:
          return jsonError(404, { error: 'Unknown resource: ' + resource });
      }
    } else {
      return jsonError(404, { error: 'Invalid API endpoint' });
    }

    // Log usage (only successful requests are logged and counted toward the rate limit)
    const responseTime = Date.now() - startTime;
    const requestIp = req.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';

    await logUsage(
      apiKey.api_key_id,
      endpoint,
      req.method,
      200,
      responseTime,
      requestIp,
      userAgent,
      supabase
    );

    const commonHeaders = {
      ...corsHeaders,
      'X-RateLimit-Limit': apiKey.rate_limit.toString(),
      'X-Response-Time': responseTime.toString()
    };

    // Format response
    if (format === 'csv') {
      const csv = convertToCSV(data);
      return new Response(csv, {
        headers: {
          ...commonHeaders,
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="cortiq-data-${Date.now()}.csv"`
        }
      });
    }

    return new Response(JSON.stringify(data), {
      headers: { ...commonHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Public API error:', error);

    return jsonError(500, {
      error: 'Internal server error',
      // PostgrestError is a plain object with .message, not an Error instance
      message: (error as { message?: string })?.message ?? String(error)
    });
  }
});

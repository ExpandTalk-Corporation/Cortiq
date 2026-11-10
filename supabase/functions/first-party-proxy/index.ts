import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/**
 * First-Party Proxy för Analytics
 * Proxar anrop till Supabase för att undvika 3rd-party blocking
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-forwarded-for',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0'
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;

// Only allow proxying to these specific Supabase paths
const ALLOWED_PATH_PREFIXES = [
  '/functions/v1/track-event',
  '/functions/v1/visitor-identification',
  '/functions/v1/pixel-tracking',
  '/functions/v1/ai-bot-tracker',
  '/functions/v1/gdpr-compliant-tracking',
  '/functions/v1/behavioral-analysis',
  '/rest/v1/tracking_events',
  '/rest/v1/page_views',
  '/rest/v1/tracking_sessions',
  '/rest/v1/heatmap_data',
];

serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: corsHeaders
      });
    }

    const url = new URL(req.url);
    const targetPath = url.searchParams.get('path');

    if (!targetPath) {
      return new Response(JSON.stringify({ error: 'Missing path parameter' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Validate path against whitelist to prevent path traversal
    const isAllowed = ALLOWED_PATH_PREFIXES.some(prefix => targetPath.startsWith(prefix));
    if (!isAllowed || targetPath.includes('..') || targetPath.includes('//')) {
      return new Response(JSON.stringify({ error: 'Path not allowed' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Bygg target URL
    const targetUrl = `${supabaseUrl}${targetPath}`;
    console.log('Proxying request to:', targetUrl);

    // Kopiera headers från original request
    const headers = new Headers();
    headers.set('apikey', supabaseKey);
    headers.set('Authorization', `Bearer ${supabaseKey}`);
    headers.set('Content-Type', 'application/json');
    
    // Bevara client IP för tracking
    const clientIP = req.headers.get('x-forwarded-for') || 
                    req.headers.get('x-real-ip') || 
                    'unknown';
    headers.set('x-client-ip', clientIP);

    let body = undefined;
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      body = await req.text();
    }

    // Gör proxy request
    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body
    });

    const responseData = await response.text();
    
    return new Response(responseData, {
      status: response.status,
      headers: {
        ...corsHeaders,
        'Content-Type': response.headers.get('Content-Type') || 'application/json'
      }
    });

  } catch (error) {
    console.error('Proxy error:', error);
    return new Response(JSON.stringify({ error: 'Proxy error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
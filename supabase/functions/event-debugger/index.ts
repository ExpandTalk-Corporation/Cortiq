import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from '../_shared/supabase.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limiting: Max 200 debug events per minute per site
const rateLimits = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(siteId: string): boolean {
  const now = Date.now();
  const limit = rateLimits.get(siteId);
  
  if (!limit || now > limit.resetAt) {
    rateLimits.set(siteId, { count: 1, resetAt: now + 60000 });
    return true;
  }
  
  if (limit.count >= 200) {
    return false;
  }
  
  limit.count++;
  return true;
}

// Input validation
function validateDebugEvent(data: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!data.siteId || typeof data.siteId !== 'string' || data.siteId.length > 100) {
    errors.push('Invalid siteId');
  }
  
  if (!data.eventName || typeof data.eventName !== 'string' || data.eventName.length > 200) {
    errors.push('Invalid eventName');
  }
  
  if (data.sessionId && (typeof data.sessionId !== 'string' || data.sessionId.length > 200)) {
    errors.push('Invalid sessionId');
  }
  
  // Validate eventParams size (max 100KB)
  if (data.eventParams) {
    const paramsSize = JSON.stringify(data.eventParams).length;
    if (paramsSize > 102400) {
      errors.push('Event params too large (max 100KB)');
    }
  }
  
  return { valid: errors.length === 0, errors };
}

function anonymizeIp(ip: string): string {
  if (!ip) return '';
  // IPv4: mask last octet
  if (ip.includes('.')) {
    return ip.split('.').slice(0, 3).join('.') + '.0';
  }
  // IPv6: mask last 80 bits
  if (ip.includes(':')) {
    return ip.split(':').slice(0, 4).join(':') + '::0';
  }
  return ip;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const requestData = await req.json();
    
    // Validate input
    const validation = validateDebugEvent(requestData);
    if (!validation.valid) {
      return new Response(JSON.stringify({ 
        error: 'Validation failed', 
        details: validation.errors 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { 
      siteId, 
      eventName, 
      eventParams, 
      sessionId, 
      deviceType,
      ipAddress,
      userAgent,
      consentStatus
    } = requestData;

    // Rate limiting
    if (!checkRateLimit(siteId)) {
      return new Response(JSON.stringify({ 
        error: 'Rate limit exceeded. Max 200 debug events per minute.' 
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Verify site exists
    const { data: site } = await supabase
      .from('sites')
      .select('id')
      .eq('id', siteId)
      .single();

    if (!site) {
      return new Response(JSON.stringify({ error: 'Site not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Anonymize IP for GDPR
    const anonymizedIp = ipAddress ? anonymizeIp(ipAddress) : null;

    // Sanitize user agent (max 500 chars)
    const sanitizedUserAgent = userAgent ? userAgent.substring(0, 500) : null;

    // Insert debug log
    const { data, error } = await supabase
      .from('event_debug_log')
      .insert({
        site_id: siteId,
        event_name: eventName.substring(0, 200),
        event_params: eventParams,
        session_id: sessionId?.substring(0, 200) || null,
        device_type: deviceType?.substring(0, 50) || null,
        ip_address: anonymizedIp,
        user_agent: sanitizedUserAgent,
        consent_status: consentStatus
      })
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      throw new Error('Failed to insert debug log');
    }

    return new Response(JSON.stringify({ 
      success: true, 
      logId: data.id 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Event debugger error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      message: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

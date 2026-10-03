// =====================================================
// VISITOR IDENTIFICATION EDGE FUNCTION
// =====================================================
// Identifies visitors, creates device fingerprints, and maintains unified profiles
//
// Usage: Called from tracking script on every page view
// =====================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.3";
import { resolveSite } from "../_shared/resolve-site.ts";

// DB-backed rate limiter — works across all function instances (no cold-start reset)
async function checkRateLimit(supabase: ReturnType<typeof createClient>, siteId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('check_rate_limit', {
    p_key: `visitor:${siteId}`,
    p_max_count: 500,
    p_window_sec: 60,
  });
  if (error) {
    console.error('Rate limit check error:', error.message);
    return true; // fail open rather than block legitimate traffic
  }
  return data === true;
}

// =====================================================
// TYPES
// =====================================================

interface VisitorIdentificationRequest {
  siteId: string;
  sessionId: string;

  // Browser/Device data for fingerprinting
  userAgent: string;
  screenResolution: string;
  viewport: string;
  timezone: number;
  language: string;
  platform: string;

  // Behavioral data
  referrer?: string;
  currentUrl: string;

  // UTM parameters
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;

  // Ad click IDs (only present when visitor gave marketing consent)
  gclid?: string;
  fbclid?: string;
  msclkid?: string;
  ttclid?: string;
  li_fat_id?: string;
  clickIdConsentGiven?: boolean;

  // Canvas fingerprint (optional, for enhanced accuracy)
  canvasFingerprint?: string;

  // WebGL fingerprint (optional)
  webglFingerprint?: string;
}

interface VisitorProfile {
  visitorId: string;
  visitorFingerprint: string;
  visitorType: 'human' | 'ai_agent' | 'bot' | 'unknown';
  aiAgentType?: string;
  isNewVisitor: boolean;
  segments: string[];
  engagementScore: number;
}

// =====================================================
// AI AGENT DETECTION
// =====================================================

function detectAIAgent(userAgent: string): {
  isAIAgent: boolean;
  agentType?: string;
  confidence: number;
} {
  const ua = userAgent.toLowerCase();

  // ChatGPT Browser detection
  if (ua.includes('chatgpt') || ua.includes('openai')) {
    return {
      isAIAgent: true,
      agentType: 'chatgpt_browser',
      confidence: 0.95
    };
  }

  // Perplexity detection
  if (ua.includes('perplexity') || ua.includes('comet')) {
    return {
      isAIAgent: true,
      agentType: 'perplexity_comet',
      confidence: 0.95
    };
  }

  // Claude Browser detection
  if (ua.includes('claude') || ua.includes('anthropic')) {
    return {
      isAIAgent: true,
      agentType: 'claude_browser',
      confidence: 0.95
    };
  }

  // Gemini detection
  if (ua.includes('gemini') || ua.includes('bard')) {
    return {
      isAIAgent: true,
      agentType: 'gemini',
      confidence: 0.90
    };
  }

  // Generic headless browser patterns (potential AI agents)
  const headlessPatterns = [
    'headless',
    'phantomjs',
    'selenium',
    'puppeteer',
    'playwright'
  ];

  for (const pattern of headlessPatterns) {
    if (ua.includes(pattern)) {
      return {
        isAIAgent: true,
        agentType: 'unknown_agent',
        confidence: 0.70
      };
    }
  }

  // Common bots (not AI agents)
  const botPatterns = [
    'bot',
    'crawler',
    'spider',
    'scraper',
    'googlebot',
    'bingbot'
  ];

  for (const pattern of botPatterns) {
    if (ua.includes(pattern)) {
      return {
        isAIAgent: false,
        confidence: 0.90
      };
    }
  }

  // Default: likely human
  return {
    isAIAgent: false,
    confidence: 0.60
  };
}

// =====================================================
// INPUT SANITIZATION
// =====================================================

function sanitizeString(str: string | undefined, maxLength: number = 1000): string | null {
  if (!str) return null;
  // Remove any potential XSS vectors
  const sanitized = str
    .replace(/[<>'"]/g, '') // Remove HTML special chars
    .substring(0, maxLength)
    .trim();
  return sanitized || null;
}

// =====================================================
// DEVICE FINGERPRINTING
// =====================================================

async function generateDeviceFingerprint(data: VisitorIdentificationRequest, salt: string): Promise<string> {
  // Combine multiple signals for device fingerprint
  const components = [
    data.userAgent,
    data.screenResolution,
    data.timezone.toString(),
    data.language,
    data.platform,
    data.canvasFingerprint || '',
    data.webglFingerprint || ''
  ];

  // SHA-256 over a per-site-salted input. Replaces the previous 32-bit non-crypto hash,
  // whose small space collided distinct visitors into one profile (and was trivially
  // reversible — weak pseudonymisation under GDPR Art. 32). The salt is server-side only.
  const input = `${salt}|${components.join('|')}`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `fp_${hex.slice(0, 32)}`; // 128 bits — collision-safe, keeps the fp_ prefix
}

// =====================================================
// DEVICE INFO EXTRACTION
// =====================================================

function extractDeviceInfo(userAgent: string): {
  deviceType: string;
  browser: string;
  os: string;
} {
  const ua = userAgent.toLowerCase();

  // Device type detection
  let deviceType = 'desktop';
  if (ua.includes('mobile')) {
    deviceType = 'mobile';
  } else if (ua.includes('tablet') || ua.includes('ipad')) {
    deviceType = 'tablet';
  }

  // Browser detection
  let browser = 'unknown';
  if (ua.includes('chrome') && !ua.includes('edge')) {
    browser = 'chrome';
  } else if (ua.includes('safari') && !ua.includes('chrome')) {
    browser = 'safari';
  } else if (ua.includes('firefox')) {
    browser = 'firefox';
  } else if (ua.includes('edge')) {
    browser = 'edge';
  } else if (ua.includes('opera') || ua.includes('opr')) {
    browser = 'opera';
  }

  // OS detection
  let os = 'unknown';
  if (ua.includes('windows')) {
    os = 'windows';
  } else if (ua.includes('mac')) {
    os = 'macos';
  } else if (ua.includes('linux')) {
    os = 'linux';
  } else if (ua.includes('android')) {
    os = 'android';
  } else if (ua.includes('ios') || ua.includes('iphone') || ua.includes('ipad')) {
    os = 'ios';
  }

  return { deviceType, browser, os };
}

// =====================================================
// MAIN HANDLER
// =====================================================

serve(async (req) => {
  // CORS headers
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  try {
    // SECURITY: Check content length (max 50KB)
    const contentLength = req.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 50000) {
      return new Response(
        JSON.stringify({ error: 'Request too large' }),
        {
          status: 413,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }

    // Parse request
    const requestData: VisitorIdentificationRequest = await req.json();

    // Validate required fields
    if (!requestData.siteId || !requestData.sessionId || !requestData.userAgent) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // SECURITY: Check rate limit (DB-backed, works across all instances)
    if (!await checkRateLimit(supabase, requestData.siteId)) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded' }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Retry-After': '60'
          }
        }
      );
    }

    // SECURITY: Verify site_id exists and is active
    // siteId may be an account id (WordPress plugin); resolveSite maps it via the page domain.
    const site = await resolveSite(supabase, requestData.siteId, requestData.currentUrl,
      'id, is_active, fingerprint_salt, tracking_mode');

    if (!site || !site.is_active) {
      return new Response(
        JSON.stringify({ error: 'Invalid or inactive site' }),
        {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }

    // Cookieless / consent-exempt sites must never be fingerprinted or profiled across
    // visits. The client already skips this call in cookieless mode; enforce it here too
    // so a misconfigured or forged client cannot create a device profile for such a site.
    if ((site as { tracking_mode?: string }).tracking_mode === 'cookieless') {
      return new Response(
        JSON.stringify({
          success: true,
          visitor: null,
          mode: 'cookieless',
          message: 'Cookieless site: visitor identification skipped by design.',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    // Generate device fingerprint (SHA-256, per-site salt)
    const fingerprint = await generateDeviceFingerprint(requestData, (site as { fingerprint_salt?: string }).fingerprint_salt ?? '');

    // Detect AI agent
    const aiDetection = detectAIAgent(requestData.userAgent);

    // Determine visitor type
    let visitorType: 'human' | 'ai_agent' | 'bot' | 'unknown' = 'unknown';
    let aiAgentType: string | null = null;

    if (aiDetection.isAIAgent) {
      visitorType = 'ai_agent';
      aiAgentType = aiDetection.agentType || null;
    } else if (aiDetection.confidence > 0.85) {
      visitorType = 'human';
    }

    // Extract device info
    const deviceInfo = extractDeviceInfo(requestData.userAgent);

    // Upsert visitor profile (with sanitized inputs)
    const { data: visitorId, error: upsertError } = await supabase.rpc('upsert_unified_visitor', {
      p_site_id: site.id,
      p_visitor_fingerprint: fingerprint,
      p_session_id: sanitizeString(requestData.sessionId, 255),
      p_visitor_type: visitorType,
      p_ai_agent_type: aiAgentType,
      p_device_type: sanitizeString(deviceInfo.deviceType, 50),
      p_browser: sanitizeString(deviceInfo.browser, 50),
      p_os: sanitizeString(deviceInfo.os, 50),
      p_referrer: sanitizeString(requestData.referrer, 2000),
      p_utm_source: sanitizeString(requestData.utmSource, 255),
      p_utm_medium: sanitizeString(requestData.utmMedium, 255),
      p_utm_campaign: sanitizeString(requestData.utmCampaign, 255),
      p_country_code: null // TODO: Add IP geolocation
    });

    if (upsertError) {
      console.error('Error upserting visitor:', upsertError);
      throw upsertError;
    }

    // Store click IDs only when marketing consent is verified SERVER-SIDE.
    // The client flag (clickIdConsentGiven) is advisory and forgeable; the
    // authoritative proof is a cookie_consents row with marketing = true for this
    // session (ePrivacy Art. 5(3) / GDPR Art. 6.1.a).
    let serverMarketingConsent = false;
    {
      const { data: consentRow } = await supabase
        .from('cookie_consents')
        .select('consent_types')
        .eq('site_id', site.id)
        .eq('session_id', requestData.sessionId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const ct = consentRow?.consent_types as { marketing?: boolean } | null;
      serverMarketingConsent = ct?.marketing === true;
    }

    const hasClickIds = serverMarketingConsent && requestData.clickIdConsentGiven && (
      requestData.gclid || requestData.fbclid || requestData.msclkid ||
      requestData.ttclid || requestData.li_fat_id
    );
    if (hasClickIds && visitorId) {
      const clickIdUpdate: Record<string, string | boolean | null> = {
        click_id_consent_given: true,
      };
      if (requestData.gclid) clickIdUpdate.gclid = sanitizeString(requestData.gclid, 255) ?? null;
      if (requestData.fbclid) clickIdUpdate.fbclid = sanitizeString(requestData.fbclid, 255) ?? null;
      if (requestData.msclkid) clickIdUpdate.msclkid = sanitizeString(requestData.msclkid, 255) ?? null;
      if (requestData.ttclid) clickIdUpdate.ttclid = sanitizeString(requestData.ttclid, 255) ?? null;
      if (requestData.li_fat_id) clickIdUpdate.li_fat_id = sanitizeString(requestData.li_fat_id, 255) ?? null;

      const { error: clickIdError } = await supabase
        .from('unified_visitors')
        .update(clickIdUpdate)
        .eq('id', visitorId);
      if (clickIdError) {
        console.warn('Failed to store click IDs (non-fatal):', clickIdError.message);
      }
    }

    // Get visitor profile
    const { data: profile, error: profileError } = await supabase.rpc('get_visitor_profile', {
      p_visitor_id: visitorId
    });

    if (profileError) {
      console.error('Error getting visitor profile:', profileError);
      throw profileError;
    }

    // Prepare response
    const visitorProfile: VisitorProfile = {
      visitorId: visitorId,
      visitorFingerprint: fingerprint,
      visitorType: visitorType,
      aiAgentType: aiAgentType || undefined,
      isNewVisitor: profile?.[0]?.total_sessions === 1,
      segments: profile?.[0]?.segments || [],
      engagementScore: profile?.[0]?.engagement_score || 0
    };

    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        visitor: visitorProfile,
        detection: {
          isAIAgent: aiDetection.isAIAgent,
          confidence: aiDetection.confidence
        }
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );

  } catch (error) {
    console.error('Error in visitor identification:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
});

// =====================================================
// EDGE FUNCTION COMPLETE
// =====================================================

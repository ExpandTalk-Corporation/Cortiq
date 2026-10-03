import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.3";
import { anonymizeIP } from "../_shared/jurisdiction.ts";
// Canonical AI-bot classification — shared with cloudflare-ingest so both the JS-tag
// and server-log paths classify identically. See _shared/ai-bot-registry.ts.
import { classifyBot, type BotCategory } from "../_shared/ai-bot-registry.ts";
import { resolveSite } from "../_shared/resolve-site.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// DB-backed rate limiter, shared across function instances.
async function checkRateLimit(supabase: ReturnType<typeof createClient>, key: string, maxCount: number): Promise<boolean> {
  const { data, error } = await supabase.rpc('check_rate_limit', {
    p_key: key,
    p_max_count: maxCount,
    p_window_sec: 60,
  });
  if (error) return true; // fail open rather than drop legitimate traffic
  return data === true;
}

// Best-effort client IP from the edge proxy headers.
function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

// Asset file patterns
const ASSET_PATTERNS = {
  css: /\.css(\?|$)/i,
  js: /\.js(\?|$)/i,
  image: /\.(png|jpg|jpeg|gif|webp|svg|ico)(\?|$)/i,
  font: /\.(woff|woff2|ttf|eot|otf)(\?|$)/i,
  other: /\.(json|xml|txt|pdf)(\?|$)/i
};

// Detect if request is for an asset
function detectAssetType(url: string): { isAsset: boolean; assetType: string | null } {
  for (const [type, pattern] of Object.entries(ASSET_PATTERNS)) {
    if (pattern.test(url)) {
      return { isAsset: true, assetType: type };
    }
  }
  return { isAsset: false, assetType: null };
}

// Detect if browser is visual (renders CSS/JS) vs headless/text-based
function detectBrowserType(probeData: any, assetsLoaded: boolean): { isVisual: boolean; browserType: string } {
  // If probe detected webdriver or headless indicators
  if (probeData?.signals?.webdriver || probeData?.signals?.headless) {
    return { isVisual: false, browserType: 'headless' };
  }
  
  // If JS executed and assets loaded, likely visual browser
  if (probeData?.jsExecuted && assetsLoaded) {
    return { isVisual: true, browserType: 'visual' };
  }
  
  // If no JS execution at all, text-based browser
  if (!probeData?.jsExecuted) {
    return { isVisual: false, browserType: 'text-based' };
  }
  
  return { isVisual: false, browserType: 'unknown' };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { 
      siteId, 
      url, 
      referrer,
      userAgent,
      sessionId,
      probeData,
      citationData,
      assetsLoaded // New: indicates if CSS/JS were loaded
    } = await req.json();

    console.log('AI bot tracker received:', { siteId, url, assetsLoaded });

    // SECURITY: validate site before any service-role write (prevents anonymous
    // cross-tenant injection of fabricated bot traffic into arbitrary dashboards).
    if (!siteId || !UUID_RE.test(siteId)) {
      return new Response(JSON.stringify({ error: 'Valid siteId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    // Two-dimensional throttle: per-site (blunt dashboard pollution) AND per-IP
    // (stop one source rotating siteId to flood many tenants). Either tripping = 429.
    const ip = clientIp(req);
    const [siteOk, ipOk] = await Promise.all([
      checkRateLimit(supabase, `aibot:${siteId}`, 600),
      checkRateLimit(supabase, `aibot-ip:${ip}`, 1200),
    ]);
    if (!siteOk || !ipOk) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '60' } });
    }
    // siteId may be an account id (WordPress plugin); resolveSite maps it via the page domain.
    const site = await resolveSite(supabase, siteId, url);
    if (!site || !site.is_active) {
      return new Response(JSON.stringify({ error: 'Invalid or inactive site' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Detect bot from user agent using the canonical registry (first match wins).
    // Prefer the real request User-Agent header over the client-supplied body value:
    // the body is trivially forgeable (POST {userAgent:"GPTBot"}), the request header
    // is not settable from browser fetch. Fall back to the body only if absent.
    const ua = req.headers.get('user-agent') || userAgent || '';
    const { botType, botName, botCategory }: { botType: string; botName: string; botCategory: BotCategory | null } = classifyBot(ua);

    // Detect asset type
    const { isAsset, assetType } = detectAssetType(url);

    // Detect browser type (visual vs headless vs text-based)
    const { isVisual, browserType } = detectBrowserType(probeData, assetsLoaded);

    // request_type carries the authoritative 3-way category so the dashboard KPIs
    // (which count request_type === 'training') are correct. JS execution does NOT
    // imply "training" — an agentic browser executes JS precisely because it is a
    // real user. Category comes from the registry; only fall back to signals when
    // the UA is unrecognized.
    let requestType: string = botCategory ?? 'unknown';
    if (!botCategory) {
      if (citationData) requestType = 'citation';
      else if (probeData?.jsExecuted && isVisual) requestType = 'agentic';
    }

    // Use the new upsert function for agent session tracking
    const { data: agentSessionId, error: sessionError } = await supabase
      .rpc('upsert_ai_agent_session', {
        p_site_id: site.id,
        p_session_id: sessionId || `bot_${Date.now()}`,
        p_bot_type: botType,
        p_bot_name: botName,
        p_url: url,
        p_is_visual_browser: isVisual,
        p_is_asset: isAsset,
        p_asset_type: assetType
      });

    if (sessionError) {
      console.error('Error upserting agent session:', sessionError);
    } else {
      console.log('Agent session tracked:', agentSessionId);
    }

    // Insert bot traffic record (existing behavior)
    const { data: trafficData, error: trafficError } = await supabase
      .from('ai_bot_traffic')
      .insert({
        site_id: site.id,
        bot_type: botType,
        bot_name: botName,
        user_agent: ua,
        url,
        referrer,
        session_id: sessionId,
        ip_address: anonymizeIP(req.headers.get('x-forwarded-for')) || 'unknown',
        js_executed: probeData?.jsExecuted || false,
        probe_triggered: !!probeData,
        request_type: requestType,
      })
      .select()
      .single();

    if (trafficError) {
      console.error('Error inserting traffic:', trafficError);
      throw trafficError;
    }

    console.log('Bot traffic recorded:', trafficData);

    // If probe data exists, insert probe signal
    if (probeData && trafficData) {
      const { error: probeError } = await supabase
        .from('ai_bot_probe_signals')
        .insert({
          site_id: site.id,
          traffic_id: trafficData.id,
          execution_time_ms: probeData.executionTime,
          webdriver_detected: probeData.signals?.webdriver || false,
          headless_detected: probeData.signals?.headless || false,
          automation_signals: probeData.signals || {},
          browser_signals: probeData.browserSignals || {},
        });

      if (probeError) {
        console.error('Error inserting probe signal:', probeError);
      }
    }

    // If citation data exists, insert citation record
    if (citationData && trafficData) {
      const { error: citationError } = await supabase
        .from('ai_citations')
        .insert({
          site_id: site.id,
          traffic_id: trafficData.id,
          cited_url: citationData.url || url,
          citation_context: citationData.context,
          utm_source: citationData.utmSource,
          utm_medium: citationData.utmMedium,
          utm_campaign: citationData.utmCampaign,
        });

      if (citationError) {
        console.error('Error inserting citation:', citationError);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        botType,
        requestType,
        browserType,
        isVisualBrowser: isVisual,
        trafficId: trafficData.id,
        agentSessionId
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in ai-bot-tracker:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.3";
// Canonical AI-bot classifier — shared with ai-bot-tracker so server-log hits are
// classified identically to JS-tag hits and merge cleanly in the dashboard.
import { classifyBot } from "../_shared/ai-bot-registry.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ingest-key',
};

// ---------------------------------------------------------------------------
// User-agent classification
// ---------------------------------------------------------------------------

type VisitorType = 'human' | 'search_crawler' | 'ai_bot' | 'scraper' | 'monitoring' | 'unknown';

interface Classification {
  visitorType: VisitorType;
  botName: string | null;
}

const SEARCH_CRAWLERS: [RegExp, string][] = [
  [/Googlebot/i,          'Googlebot'],
  [/Bingbot|adidxbot/i,   'Bingbot'],
  [/YandexBot/i,          'YandexBot'],
  [/DuckDuckBot/i,        'DuckDuckBot'],
  [/Baiduspider/i,        'Baiduspider'],
  [/Sogou/i,              'Sogou'],
  [/Exabot/i,             'Exabot'],
  [/facebot|facebookexternalhit/i, 'FacebookBot'],
  [/ia_archiver/i,        'Alexa Crawler'],
  [/AhrefsBot/i,          'AhrefsBot'],
  [/SemrushBot/i,         'SemrushBot'],
  [/MJ12bot/i,            'MJ12bot'],
  [/DotBot/i,             'DotBot'],
  [/seznambot/i,          'SeznamBot'],
];

const AI_BOTS: [RegExp, string][] = [
  [/GPTBot/i,             'GPTBot (OpenAI)'],
  [/ChatGPT-User/i,       'ChatGPT Browser'],
  [/OAI-SearchBot/i,      'OpenAI SearchBot'],
  [/ClaudeBot/i,          'ClaudeBot (Anthropic)'],
  [/anthropic-ai/i,       'Anthropic Crawler'],
  [/Claude-Web/i,         'Claude Browser'],
  [/PerplexityBot/i,      'PerplexityBot'],
  [/comet\/\d/i,          'Perplexity Comet'],
  [/GoogleOther/i,        'GoogleOther (Gemini)'],
  [/Gemini/i,             'Gemini'],
  [/GrokBot/i,            'GrokBot (xAI)'],
  [/CCBot/i,              'Common Crawl Bot'],
  [/Applebot/i,           'Applebot'],
  [/YouBot/i,             'YouBot'],
  [/BrightBot/i,          'BrightBot'],
  [/DataForSeoBot/i,      'DataForSeoBot'],
  [/meta-externalagent/i, 'Meta AI Crawler'],
  [/FacebookBot/i,        'FacebookBot AI'],
  [/Bytespider/i,         'ByteDance Crawler'],
];

const SCRAPERS: [RegExp, string][] = [
  [/python-requests/i,    'python-requests'],
  [/python\/\d/i,         'Python script'],
  [/curl\//i,             'curl'],
  [/wget\//i,             'wget'],
  [/axios\//i,            'axios'],
  [/node-fetch/i,         'node-fetch'],
  [/node\/\d/i,           'Node.js'],
  [/Go-http-client/i,     'Go HTTP client'],
  [/Java\//i,             'Java client'],
  [/okhttp\//i,           'OkHttp (Android/Java)'],
  [/scrapy/i,             'Scrapy'],
  [/PHP\//i,              'PHP script'],
  [/Ruby\/\d/i,           'Ruby script'],
  [/Wget/i,               'Wget'],
  [/libcurl/i,            'libcurl'],
  [/HTTPie/i,             'HTTPie'],
];

const MONITORING: [RegExp, string][] = [
  [/UptimeRobot/i,        'UptimeRobot'],
  [/Pingdom/i,            'Pingdom'],
  [/GTmetrix/i,           'GTmetrix'],
  [/StatusCake/i,         'StatusCake'],
  [/Site24x7/i,           'Site24x7'],
  [/Uptime\.com/i,        'Uptime.com'],
  [/NewRelic/i,           'New Relic'],
  [/Datadog/i,            'Datadog'],
];

// Generic bot catch-all (after specific patterns)
const GENERIC_BOT = /bot|crawler|spider|scraper/i;

function classifyUA(ua: string | null): Classification {
  if (!ua) return { visitorType: 'unknown', botName: null };

  for (const [pattern, name] of MONITORING) {
    if (pattern.test(ua)) return { visitorType: 'monitoring', botName: name };
  }
  for (const [pattern, name] of AI_BOTS) {
    if (pattern.test(ua)) return { visitorType: 'ai_bot', botName: name };
  }
  for (const [pattern, name] of SEARCH_CRAWLERS) {
    if (pattern.test(ua)) return { visitorType: 'search_crawler', botName: name };
  }
  for (const [pattern, name] of SCRAPERS) {
    if (pattern.test(ua)) return { visitorType: 'scraper', botName: name };
  }
  if (GENERIC_BOT.test(ua)) {
    return { visitorType: 'scraper', botName: 'Generic bot' };
  }

  // Looks like a real browser
  if (/Mozilla\/5\.0/i.test(ua) && /Chrome|Firefox|Safari|Edge|Opera/i.test(ua)) {
    return { visitorType: 'human', botName: null };
  }

  return { visitorType: 'unknown', botName: null };
}

// Anonymise to /24 subnet (IPv4) or first 3 groups (IPv6)
function anonymiseIP(ip: string | null): string | null {
  if (!ip) return null;
  const raw = ip.split(',')[0].trim();
  if (raw.includes(':')) {
    return raw.split(':').slice(0, 3).join(':') + '::/48';
  }
  const parts = raw.split('.');
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  return null;
}

// ---------------------------------------------------------------------------
// Asset detection
// ---------------------------------------------------------------------------
const ASSET_PATTERN = /\.(css|js|mjs|map|woff|woff2|ttf|eot|otf|png|jpg|jpeg|gif|webp|svg|ico|avif|mp4|mp3|pdf|zip)(\?|$)/i;

function detectAsset(path: string): { isAsset: boolean; assetType: string | null } {
  const m = path.match(/\.([a-z0-9]+)(\?|$)/i);
  if (m && ASSET_PATTERN.test(path)) {
    const ext = m[1].toLowerCase();
    if (['css'].includes(ext))                         return { isAsset: true, assetType: 'css' };
    if (['js', 'mjs', 'map'].includes(ext))            return { isAsset: true, assetType: 'js' };
    if (['png','jpg','jpeg','gif','webp','svg','ico','avif'].includes(ext)) return { isAsset: true, assetType: 'image' };
    if (['woff','woff2','ttf','eot','otf'].includes(ext)) return { isAsset: true, assetType: 'font' };
    return { isAsset: true, assetType: 'other' };
  }
  return { isAsset: false, assetType: null };
}

// ---------------------------------------------------------------------------
// Domain → site_id lookup cache (simple in-memory, resets per isolate)
// ---------------------------------------------------------------------------
const siteCache = new Map<string, string | null>();

async function resolveSiteId(supabase: ReturnType<typeof createClient>, domain: string): Promise<string | null> {
  if (siteCache.has(domain)) return siteCache.get(domain)!;

  // Resolve by domain using the shared RPC (handles www + IDN normalization), consistent
  // with the rest of the pipeline. (The old `site_url` column does not exist.)
  const url = domain.startsWith('http') ? domain : `https://${domain}`;
  const { data } = await supabase.rpc('resolve_site_by_domain', { p_url: url });
  const id = (data as string) ?? null;
  siteCache.set(domain, id);
  return id;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Fail closed: this push endpoint is DISABLED until a shared secret is configured,
  // and every request must present it (x-ingest-key). Prevents anonymous junk being
  // written to cloudflare_traffic for any registered domain.
  const ingestSecret = Deno.env.get('CLOUDFLARE_INGEST_SECRET');
  const providedKey  = req.headers.get('x-ingest-key') ?? '';
  if (!ingestSecret) {
    return new Response(JSON.stringify({ error: 'ingest disabled: CLOUDFLARE_INGEST_SECRET not set' }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (providedKey !== ingestSecret) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const {
      domain,
      urlPath   = '/',
      method    = 'GET',
      statusCode,
      country,
      userAgent,
      referrer,
      isAsset: assetHint,
      assetType: assetTypeHint,
      rayId,
      ipSubnet,   // pre-anonymised by Worker
    } = body;

    if (!domain) {
      return new Response(JSON.stringify({ error: 'domain required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl  = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase     = createClient(supabaseUrl, supabaseKey);

    const siteId = await resolveSiteId(supabase, domain);
    if (!siteId) {
      // Unknown domain — still return 200 so Worker doesn't retry
      return new Response(JSON.stringify({ ok: true, skipped: 'unknown domain' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { isAsset, assetType } = assetHint != null
      ? { isAsset: assetHint, assetType: assetTypeHint ?? null }
      : detectAsset(urlPath);

    const { visitorType, botName } = classifyUA(userAgent);

    // Skip cdn-cgi internal Cloudflare paths
    if (urlPath.startsWith('/cdn-cgi/')) {
      return new Response(JSON.stringify({ ok: true, skipped: 'cdn-cgi' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Server logs carry no consent signal. Automated traffic (bots, crawlers, scrapers,
    // monitoring) is kept in full — that is the security/bot layer. Requests that look
    // human, or can't be classified, are reduced to an anonymous count: no user agent,
    // referrer, IP subnet, Ray ID or path, only type/country/status/asset flags so the
    // bot-vs-human share in the dashboard still works. Query strings are never stored.
    const ai = classifyBot(userAgent ?? '');
    const automated = ai.registryMatch || (visitorType !== 'human' && visitorType !== 'unknown');
    const path = String(urlPath).split('?')[0].slice(0, 500) || '/';

    await supabase.from('cloudflare_traffic').insert({
      site_id:      siteId,
      url_path:     automated ? path : '/',
      method:       method.toUpperCase(),
      status_code:  statusCode ?? null,
      country:      country ?? null,
      user_agent:   automated ? (userAgent ?? '').slice(0, 500) : null,
      referrer:     automated ? (referrer ?? '').slice(0, 500) : null,
      visitor_type: visitorType,
      bot_name:     botName,
      is_asset:     isAsset,
      asset_type:   assetType,
      ip_subnet:    automated ? (ipSubnet ?? null) : null,
      ray_id:       automated ? (rayId ?? '').slice(0, 50) : null,
    });

    // Fork AI-vendor bot hits into the canonical AI-bot store (ai_bot_traffic) so they
    // surface in the AI Bot Classification dashboard. get_ai_bot_tracking reads that
    // table and is source-agnostic, so no RPC change is needed. This is the entire value
    // of server-side capture: training + citation crawlers (GPTBot, PerplexityBot, ...)
    // never execute the JS tag, so this is the only path that ever sees them.
    // Registry hits only — generic scrapers/monitoring stay in cloudflare_traffic.
    // Best-effort: a failure here must not fail the primary cloudflare_traffic write.
    if (ai.registryMatch) {
      const { error: aiErr } = await supabase.from('ai_bot_traffic').insert({
        site_id:         siteId,
        bot_type:        ai.botType,
        bot_name:        ai.botName,
        user_agent:      (userAgent ?? '').slice(0, 500),
        url:             path,
        referrer:        (referrer ?? '').slice(0, 500),
        request_type:    ai.botCategory,
        js_executed:     false,
        probe_triggered: false,
        ip_address:      ipSubnet ?? null,   // already /24-anonymised by the Worker
        source:          'server_log',
      });
      if (aiErr) console.error('cloudflare-ingest ai_bot_traffic insert error:', aiErr);
    }

    return new Response(JSON.stringify({ ok: true, visitorType, botName }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('cloudflare-ingest error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

/**
 * server-hit — server-side AI agent measurement (no client code, no device access).
 *
 * Called by adapters running on the customer's own server or edge (public/cortiq-server.mjs
 * for Next.js / Vercel / Netlify / Node, public/cloudflare-worker.js, the WordPress plugin,
 * or any backend via plain HTTP). The adapter forwards only:
 *   - requests whose User-Agent looks like a bot/agent,
 *   - fetches of /robots.txt, /llms.txt, /llms-full.txt,
 *   - hits on the hidden honeypot link (/cortiq-trap/…) in the server-rendered HTML,
 * with the client IP already truncated (/24 IPv4, /48 IPv6). Ordinary human requests are
 * never sent. Everything here comes from the HTTP request the customer's server received
 * anyway, so nothing reads or stores anything on the visitor's device (LEK 9:28 / ePrivacy
 * Art. 5.3 not engaged). The rows are still personal data under GDPR (truncated IP, UA):
 * truncated again here, cleared after 30 days by run_data_retention().
 *
 * Auth: the site's tracking key (sites.tracking_id: "tk_…", or the older base64 format) as
 * Bearer token or x-cortiq-key.
 * That key is also present in the browser snippet, so every hit's host must be the site's
 * own domain or a subdomain of it, and writes are rate-limited per site (fail closed).
 *
 * Body: { hits: [{ url, userAgent, method?, status?, referrer?, ip? }] }  (max 25, ≤ 64 KB)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.3";
import { anonymizeIP } from "../_shared/jurisdiction.ts";
import { classifyBot } from "../_shared/ai-bot-registry.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-cortiq-key, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_HITS = 25;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_HOSTS_PER_BATCH = 3;
// Requests per site per minute. Adapters send one hit per request, so this caps forged
// rows at MAX_HITS × this per minute even with the public key.
const REQUESTS_PER_MINUTE = 600;
const TRAP_PREFIX = '/cortiq-trap';

type Signal = 'request' | 'robots_txt' | 'llms_txt' | 'honeypot';

export function signalForPath(pathname: string): Signal {
  const p = pathname.toLowerCase();
  if (p === '/robots.txt') return 'robots_txt';
  if (p === '/llms.txt' || p === '/llms-full.txt') return 'llms_txt';
  if (p === TRAP_PREFIX || p.startsWith(TRAP_PREFIX + '/')) return 'honeypot';
  return 'request';
}

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extra } });
}

function readKey(req: Request): string {
  const auth = req.headers.get('authorization') ?? '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  return bearer || (req.headers.get('x-cortiq-key') ?? '').trim();
}

const clip = (v: unknown, n: number) => (typeof v === 'string' && v ? v.slice(0, n) : null);

/** Hostname as the browser sees it: lowercase, punycode, no www., no port/path/scheme. */
export function normHost(value: string): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase();
    return host.replace(/^www\./, '').replace(/\.$/, '') || null;
  } catch { return null; }
}

/** Origin + path of a referrer; query strings can carry tokens, emails or search terms. */
function cleanReferrer(v: unknown): string | null {
  const r = clip(v, 2048);
  if (!r) return null;
  try { const u = new URL(r); return (u.origin + u.pathname).slice(0, 1024); } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const key = readKey(req);
  // tk_ + 32 hex for new sites; older sites have a 44-char base64 key.
  if (!/^[A-Za-z0-9+/=_-]{20,128}$/.test(key)) return json({ error: 'Missing or malformed site key' }, 401);
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return json({ error: 'Body too large' }, 413);

  let body: { hits?: unknown };
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const hits = Array.isArray(body?.hits) ? body.hits.slice(0, MAX_HITS) : null;
  if (!hits) return json({ error: 'Body must be { hits: [...] }' }, 400);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: site } = await supabase.from('sites').select('id, is_active, domain').eq('tracking_id', key).maybeSingle();
  if (!site || site.is_active === false) return json({ error: 'Unknown or inactive site key' }, 401);
  const siteHost = normHost(site.domain ?? '');
  if (!siteHost) return json({ error: 'Site has no domain configured' }, 422);

  // Fail closed: this endpoint writes on a public key, so an unavailable limiter must not
  // turn into an unlimited one.
  const { data: allowed, error: rlError } = await supabase.rpc('check_rate_limit', {
    p_key: `serverhit:${site.id}`, p_max_count: REQUESTS_PER_MINUTE, p_window_sec: 60,
  });
  if (rlError) return json({ error: 'Rate limiter unavailable' }, 503, { 'Retry-After': '30' });
  if (allowed === false) return json({ error: 'Rate limit exceeded' }, 429, { 'Retry-After': '60' });

  // Ownership is checked against THIS key's site (its domain or a subdomain), not a global
  // domain lookup — duplicate domains on other sites can't steal or block the hits.
  const ownsHost = (host: string) => host === siteHost || host.endsWith('.' + siteHost);
  const hosts = new Set<string>();

  const rows: Record<string, unknown>[] = [];
  let ignored = 0, rejected = 0;
  for (const raw of hits as Record<string, unknown>[]) {
    let url: URL;
    try { url = new URL(String(raw?.url ?? '')); } catch { rejected++; continue; }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') { rejected++; continue; }
    const host = normHost(url.hostname);
    if (!host || !ownsHost(host)) { rejected++; continue; }
    hosts.add(host);
    if (hosts.size > MAX_HOSTS_PER_BATCH) return json({ error: 'Too many hosts in one batch' }, 400);

    const ua = clip(raw.userAgent, 512) ?? '';
    const signal = signalForPath(url.pathname);
    const bot = classifyBot(ua);
    // Store registry-classified AI bots, and anyone following the honeypot link
    // (a hidden, robots.txt-disallowed URL no human navigates to).
    if (!bot.registryMatch && signal !== 'honeypot') { ignored++; continue; }

    rows.push({
      site_id: site.id,
      bot_type: bot.botType,
      bot_name: bot.registryMatch ? bot.botName : (bot.botName === 'Unknown Bot' ? 'Honeypot visitor' : bot.botName),
      user_agent: ua || null,
      url: url.origin + url.pathname,
      referrer: cleanReferrer(raw.referrer),
      ip_address: anonymizeIP(clip(raw.ip, 64)),
      js_executed: false,
      probe_triggered: signal === 'honeypot',
      // Only registry bots get a category; the generic fallback would mislabel an unknown
      // honeypot visitor as a citation crawler.
      request_type: bot.registryMatch ? (bot.botCategory ?? 'unknown') : 'unknown',
      source: 'server_log',
      server_signal: signal,
    });
  }

  if (rows.length > 0) {
    const { error } = await supabase.from('ai_bot_traffic').insert(rows);
    if (error) {
      console.error('server-hit insert failed:', error.message);
      return json({ error: 'Store failed' }, 500);
    }
  }
  return json({ accepted: hits.length, stored: rows.length, ignored, rejected });
});

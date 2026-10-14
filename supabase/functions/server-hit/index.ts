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
 * Auth: the site's tracking key (sites.tracking_id, "tk_…") as Bearer token or x-cortiq-key.
 * That key is also present in the browser snippet, so every hit's URL host must resolve to
 * the same site (resolve_site_by_domain) — same trust level as the JS tag, plus a per-site
 * rate limit.
 *
 * Body: { hits: [{ url, userAgent, method?, status?, referrer?, ip? }] }  (max 100)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.3";
import { anonymizeIP } from "../_shared/jurisdiction.ts";
import { classifyBot } from "../_shared/ai-bot-registry.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-cortiq-key, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_HITS = 100;
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const key = readKey(req);
  if (!/^tk_[A-Za-z0-9]{16,64}$/.test(key)) return json({ error: 'Missing or malformed site key' }, 401);

  let body: { hits?: unknown };
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const hits = Array.isArray(body?.hits) ? body.hits.slice(0, MAX_HITS) : null;
  if (!hits) return json({ error: 'Body must be { hits: [...] }' }, 400);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: site } = await supabase.from('sites').select('id, is_active').eq('tracking_id', key).maybeSingle();
  if (!site || site.is_active === false) return json({ error: 'Unknown or inactive site key' }, 401);

  const { data: allowed, error: rlError } = await supabase.rpc('check_rate_limit', {
    p_key: `serverhit:${site.id}`, p_max_count: 6000, p_window_sec: 60,
  });
  if (!rlError && allowed === false) return json({ error: 'Rate limit exceeded' }, 429, { 'Retry-After': '60' });

  // Each hit's host must belong to this site. Cache per request (adapters batch one host).
  const hostOk = new Map<string, boolean>();
  async function ownsHost(origin: string): Promise<boolean> {
    if (!hostOk.has(origin)) {
      const { data } = await supabase.rpc('resolve_site_by_domain', { p_url: origin });
      hostOk.set(origin, data === site!.id);
    }
    return hostOk.get(origin)!;
  }

  const rows: Record<string, unknown>[] = [];
  let ignored = 0, rejected = 0;
  for (const raw of hits as Record<string, unknown>[]) {
    let url: URL;
    try { url = new URL(String(raw?.url ?? '')); } catch { rejected++; continue; }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') { rejected++; continue; }
    if (!(await ownsHost(url.origin))) { rejected++; continue; }

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
      referrer: clip(raw.referrer, 1024),
      ip_address: anonymizeIP(clip(raw.ip, 64)),
      js_executed: false,
      probe_triggered: signal === 'honeypot',
      request_type: bot.botCategory ?? 'unknown',
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

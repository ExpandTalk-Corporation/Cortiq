/**
 * CortIQ — Cloudflare Worker for server-side AI agent measurement
 *
 * Works for any site behind Cloudflare, whatever builds or hosts it (WordPress, headless,
 * static sites from Lovable / Bolt / v0, …). Paste-ready, no build step.
 *
 * SETUP (~3 min):
 * 1. Cloudflare dashboard → Workers & Pages → Create Worker → paste this file → Deploy.
 * 2. Worker → Settings → Variables → add CORTIQ_SITE_KEY = your site's tracking key (tk_…,
 *    CortIQ → Settings → Installation).
 * 3. Worker → Triggers → Add route: example.com/*  (and www.example.com/* if used).
 *
 * What it does — and doesn't:
 * - Visitors are never delayed: reporting runs in ctx.waitUntil after the response.
 * - Only bot/agent-like requests, /robots.txt, /llms.txt and honeypot hits are sent.
 *   Human requests never leave Cloudflare. IPs are truncated (/24, /48) before sending;
 *   query strings are dropped.
 * - Adds a hidden honeypot link to HTML pages and "Disallow: /cortiq-trap/" to robots.txt,
 *   so bots that ignore robots.txt show up. Nothing runs in the visitor's browser.
 *
 * Older Workers posting to `cloudflare-ingest` with CORTIQ_INGEST_KEY keep working.
 */

const ENDPOINT = 'https://cxmkdtgfocgbfizawlwa.supabase.co/functions/v1/server-hit';
const TRAP_PATH = '/cortiq-trap/';
// Keep in sync with AGENT_UA in public/cortiq-server.mjs (test-enforced).
const AGENT_UA = /bot|crawl|spider|slurp|scrape|GPT|OAI-|ChatGPT|Claude|anthropic|Perplexity|Google-Extended|GoogleOther|Meta-External|facebookexternalhit|Applebot|DuckAssist|Grok|Bytespider|CCBot|Diffbot|cohere|DeepSeek|MistralAI|headless|python-requests|curl\/|wget/i;
const WATCHED_FILES = new Set(['/robots.txt', '/llms.txt', '/llms-full.txt']);
const HONEYPOT_HTML = `<a href="${TRAP_PATH}" rel="nofollow" tabindex="-1" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden">.</a>`;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.toLowerCase();
    const key = env.CORTIQ_SITE_KEY || '';

    if (path === TRAP_PATH || path === TRAP_PATH.slice(0, -1) || path.startsWith(TRAP_PATH)) {
      ctx.waitUntil(report(request, url, 404, key, env));
      return new Response('Not found', { status: 404, headers: { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' } });
    }

    let response = await fetch(request);

    const ua = request.headers.get('User-Agent') || '';
    if (WATCHED_FILES.has(path) || AGENT_UA.test(ua)) {
      ctx.waitUntil(report(request, url, response.status, key, env));
    }

    if (path === '/robots.txt' && response.ok) {
      const text = await response.text();
      const body = text.includes(`Disallow: ${TRAP_PATH}`) ? text : `${text.trimEnd()}\n\nUser-agent: *\nDisallow: ${TRAP_PATH}\n`;
      response = new Response(body, response);
    } else if ((response.headers.get('Content-Type') || '').includes('text/html')) {
      response = new HTMLRewriter().on('body', { element(el) { el.append(HONEYPOT_HTML, { html: true }); } }).transform(response);
    }
    return response;
  },
};

async function report(request, url, status, key, env) {
  if (!key.startsWith('tk_')) return;
  try {
    await fetch(env.CORTIQ_ENDPOINT || ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ hits: [{
        url: url.origin + url.pathname,
        method: request.method,
        status,
        userAgent: (request.headers.get('User-Agent') || '').slice(0, 512),
        referrer: request.headers.get('Referer') || undefined,
        ip: truncateIp(request.headers.get('CF-Connecting-IP')) || undefined,
      }] }),
    });
  } catch (_) { /* never surface measurement errors to visitors */ }
}

function truncateIp(ip) {
  if (!ip) return null;
  if (ip.includes(':')) { const g = ip.split(':'); return g.length >= 3 ? g.slice(0, 3).join(':') + '::' : null; }
  const o = ip.split('.');
  return o.length === 4 ? `${o[0]}.${o[1]}.${o[2]}.0` : null;
}

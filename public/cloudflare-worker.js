/**
 * CortIQ — Cloudflare Worker for server-side AI agent measurement
 *
 * Works for any site behind Cloudflare, whatever builds or hosts it (WordPress, headless,
 * static sites from Lovable / Bolt / v0, …). Paste-ready, no build step.
 *
 * SETUP (~3 min):
 * 1. Cloudflare dashboard → Workers & Pages → Create Worker → paste this file → Deploy.
 * 2. Worker → Settings → Variables → add CORTIQ_SITE_KEY = your site's tracking key (tk_… or older format,
 *    CortIQ → Settings → Installation).
 * 3. Worker → Triggers → Add route: example.com/*  (and www.example.com/* if used), and set
 *    the route's request-limit failure mode to "Fail open (proceed)" so the site keeps
 *    working if the Workers request quota runs out.
 *
 * What it does — and doesn't:
 * - Visitors are never delayed: reporting runs in ctx.waitUntil after the response.
 * - Only bot/agent-like requests, /robots.txt, /llms.txt and honeypot hits are sent.
 *   Human requests never leave Cloudflare. IPs are truncated (/24, /48) before sending;
 *   query strings are dropped.
 * - Adds a hidden honeypot link to HTML pages and "Disallow: /cortiq-trap/" to every group in
 *   robots.txt (serving a minimal robots.txt if the origin has none), so only bots that ignore
 *   robots.txt hit it. Nothing runs in the visitor's browser.
 * - Marks requests to the origin with x-cortiq-edge: 1 so the CortIQ WordPress plugin doesn't
 *   report the same request a second time.
 *
 * Older Workers posting to `cloudflare-ingest` with CORTIQ_INGEST_KEY keep working.
 */

const ENDPOINT = 'https://cxmkdtgfocgbfizawlwa.supabase.co/functions/v1/server-hit';
const TRAP_PATH = '/cortiq-trap/';
// Keep in sync with AGENT_UA in public/cortiq-server.mjs (test-enforced).
const AGENT_UA = /GPTBot|ChatGPT|OAI-SearchBot|Claude-User|Claude-SearchBot|ClaudeBot|anthropic-ai|Perplexity|Google-Extended|GoogleOther|Googlebot|bingbot|BingPreview|Meta-ExternalAgent|FacebookBot|facebookexternalhit|Applebot|YouBot|DuckAssistBot|Grok|Amazonbot|Bytespider|CCBot|Diffbot|cohere-ai|DeepSeek|MistralAI/i;
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

    const headers = new Headers(request.headers);
    headers.set('x-cortiq-edge', '1');
    let response = await fetch(new Request(request, { headers }));

    const ua = request.headers.get('User-Agent') || '';
    if (WATCHED_FILES.has(path) || AGENT_UA.test(ua)) {
      ctx.waitUntil(report(request, url, response.status, key, env));
    }

    const type = response.headers.get('Content-Type') || '';
    if (path === '/robots.txt') {
      if (response.ok && type.includes('text/plain')) {
        response = new Response(addTrapRule(await response.text()), response);
      } else if (response.status === 404 || response.status === 410 || (response.ok && type.includes('text/html'))) {
        // No real robots.txt (missing, or an SPA answering with index.html): serve a minimal
        // one, otherwise compliant crawlers would follow the honeypot link and be counted.
        response = new Response(addTrapRule(''), { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
      }
      // Redirects and 5xx pass through untouched: they carry meaning for crawlers.
    } else if (type.includes('text/html')) {
      response = new HTMLRewriter().on('body', { element(el) { el.append(HONEYPOT_HTML, { html: true }); } }).transform(response);
    }
    return response;
  },
};

function cleanReferrer(r) {
  if (!r) return undefined;
  try { const u = new URL(r); return u.origin + u.pathname; } catch { return undefined; }
}

async function report(request, url, status, key, env) {
  if (key.trim().length < 20) return; // tk_… or an older base64 site key
  try {
    await fetch(env.CORTIQ_ENDPOINT || ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ hits: [{
        url: url.origin + url.pathname,
        method: request.method,
        status,
        userAgent: (request.headers.get('User-Agent') || '').slice(0, 512),
        referrer: cleanReferrer(request.headers.get('Referer')),
        ip: truncateIp(request.headers.get('CF-Connecting-IP')) || undefined,
      }] }),
    });
  } catch (_) { /* never surface measurement errors to visitors */ }
}

function truncateIp(ip) {
  if (!ip) return null;
  const first = String(ip).split(',')[0].trim().replace(/%.*$/, '');
  if (first.includes(':') && !first.includes('.')) {
    // Expand "::" so compressed forms (2001:db8::1) keep exactly the first 48 bits.
    const [head, tail] = first.split('::');
    const h = head ? head.split(':') : [];
    const t = tail ? tail.split(':') : [];
    const groups = first.includes('::') ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t] : first.split(':');
    if (groups.length !== 8 || groups.some(g => !/^[0-9a-f]{1,4}$/i.test(g))) return null;
    return groups.slice(0, 3).map(g => g.toLowerCase().replace(/^0+(?=.)/, '')).join(':') + '::';
  }
  const v4 = first.replace(/^::ffff:/i, '').split(':')[0];
  const o = v4.split('.');
  return o.length === 4 && o.every(x => /^\d{1,3}$/.test(x)) ? `${o[0]}.${o[1]}.${o[2]}.0` : null;
}

/** Add "Disallow: /cortiq-trap/" to every user-agent group (bots obey only their own group). */
function addTrapRule(robots) {
  const text = String(robots || '');
  if (text.includes(`Disallow: ${TRAP_PATH}`)) return text;
  const lines = text.split(/\r?\n/);
  const out = [];
  let groups = 0;
  lines.forEach((line, i) => {
    out.push(line);
    const isUa = /^\s*user-agent\s*:/i.test(line);
    const nextIsUa = /^\s*user-agent\s*:/i.test(lines[i + 1] || '');
    if (isUa && !nextIsUa) { out.push(`Disallow: ${TRAP_PATH}`); groups++; }
  });
  return groups ? out.join('\n') : `${text.trimEnd()}${text.trim() ? '\n\n' : ''}User-agent: *\nDisallow: ${TRAP_PATH}\n`;
}

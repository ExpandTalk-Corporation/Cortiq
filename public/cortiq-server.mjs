/**
 * CortIQ server-side agent measurement — dependency-free adapter (ES module).
 *
 * Runs on YOUR server or edge, never in the visitor's browser. It looks at the HTTP
 * request your server already received and forwards to CortIQ only:
 *   - requests whose User-Agent looks like a bot or AI agent,
 *   - fetches of /robots.txt, /llms.txt, /llms-full.txt,
 *   - hits on the hidden honeypot link (/cortiq-trap/) you put in your HTML.
 * Ordinary human requests are never sent. The client IP is truncated here (/24 IPv4,
 * /48 IPv6) before anything leaves your server, and query strings are dropped.
 * Nothing is read from or stored on the visitor's device, so no consent banner is
 * involved; the data is still personal data under GDPR (mention it in your privacy policy).
 *
 * Works anywhere with the Fetch API: Next.js middleware, Vercel/Netlify edge functions,
 * Cloudflare Workers, Deno, Bun, Node 18+ (Express helper below).
 *
 *   import { createCortiq } from './cortiq-server.mjs';
 *   const cortiq = createCortiq({ siteKey: process.env.CORTIQ_SITE_KEY });
 *   // per request:
 *   if (cortiq.isTrap(request)) return cortiq.trapResponse(request, waitUntil);
 *   cortiq.report(request, { status, waitUntil });
 *
 * Copy this file into your project (https://cortiq.se/cortiq-server.mjs). Setup guide:
 * https://cortiq.se/integrations/server-side/
 */

export const CORTIQ_SERVER_VERSION = '1.0.0';
export const DEFAULT_ENDPOINT = 'https://cxmkdtgfocgbfizawlwa.supabase.co/functions/v1/server-hit';
export const TRAP_PATH = '/cortiq-trap/';

// Broad pre-filter: anything that may be a crawler or AI agent. CortIQ classifies
// precisely server-side; this only keeps human traffic on your server. Must cover every
// bot in CortIQ's registry (tests/foundation/server-adapters.test.mjs enforces it).
export const AGENT_UA = /bot|crawl|spider|slurp|scrape|GPT|OAI-|ChatGPT|Claude|anthropic|Perplexity|Google-Extended|GoogleOther|Meta-External|facebookexternalhit|Applebot|DuckAssist|Grok|Bytespider|CCBot|Diffbot|cohere|DeepSeek|MistralAI|headless|python-requests|curl\/|wget/i;

const WATCHED_FILES = new Set(['/robots.txt', '/llms.txt', '/llms-full.txt']);

/** Truncate an IP to its network: a.b.c.0 (IPv4) or first three groups (IPv6). */
export function truncateIp(ip) {
  if (!ip) return null;
  const first = String(ip).split(',')[0].trim();
  if (first.includes(':') && !first.includes('.')) {
    const groups = first.split(':');
    if (groups.length < 3) return null;
    return groups.slice(0, 3).join(':') + '::';
  }
  const v4 = first.replace(/^::ffff:/i, '').split(':')[0];
  const o = v4.split('.');
  return o.length === 4 ? `${o[0]}.${o[1]}.${o[2]}.0` : null;
}

function header(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === 'function') return headers.get(name);
  const v = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v ?? null;
}

function clientIp(headers) {
  return header(headers, 'cf-connecting-ip') || header(headers, 'x-nf-client-connection-ip')
    || header(headers, 'x-real-ip') || header(headers, 'x-forwarded-for') || null;
}

function pathOf(url) {
  try { return new URL(url).pathname.toLowerCase(); } catch { return ''; }
}

export function createCortiq({ siteKey, endpoint = DEFAULT_ENDPOINT, fetchImpl } = {}) {
  const doFetch = fetchImpl || ((...a) => fetch(...a));
  const enabled = typeof siteKey === 'string' && siteKey.startsWith('tk_');

  function isTrap(request) {
    const p = pathOf(request.url);
    return p === TRAP_PATH || p === TRAP_PATH.slice(0, -1) || p.startsWith(TRAP_PATH);
  }

  function shouldReport(request) {
    if (!enabled) return false;
    if (isTrap(request) || WATCHED_FILES.has(pathOf(request.url))) return true;
    return AGENT_UA.test(header(request.headers, 'user-agent') || '');
  }

  function toHit(request, status) {
    let url = request.url;
    try { const u = new URL(request.url); url = u.origin + u.pathname; } catch { /* keep as is */ }
    return {
      url,
      method: request.method || 'GET',
      status: typeof status === 'number' ? status : undefined,
      userAgent: (header(request.headers, 'user-agent') || '').slice(0, 512),
      referrer: header(request.headers, 'referer') || undefined,
      ip: truncateIp(clientIp(request.headers)) || undefined,
    };
  }

  async function send(hits) {
    try {
      await doFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${siteKey}` },
        body: JSON.stringify({ hits }),
        signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(3000) : undefined,
      });
    } catch { /* measurement must never break the site */ }
  }

  /**
   * Report the request if it is agent-like. Never throws, never blocks the response
   * when `waitUntil` is given (Vercel/Next `event.waitUntil`, Netlify `context.waitUntil`,
   * Cloudflare `ctx.waitUntil`). Returns the pending promise.
   */
  function report(request, { status, waitUntil } = {}) {
    if (!shouldReport(request)) return Promise.resolve();
    const p = send([toHit(request, status)]);
    if (typeof waitUntil === 'function') { try { waitUntil(p); } catch { /* ignore */ } }
    return p;
  }

  /** Response for the honeypot URL: reports the hit, returns 404 + noindex. */
  function trapResponse(request, waitUntil) {
    report(request, { status: 404, waitUntil });
    return new Response('Not found', { status: 404, headers: { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' } });
  }

  return { enabled, isTrap, shouldReport, report, trapResponse, toHit };
}

/** Hidden honeypot link for your server-rendered HTML (put it once, e.g. in the footer). */
export const HONEYPOT_HTML = `<a href="${TRAP_PATH}" rel="nofollow" tabindex="-1" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden">.</a>`;

/** Lines to add to robots.txt so only bots that ignore it reach the honeypot. */
export const ROBOTS_TXT_LINES = `User-agent: *\nDisallow: ${TRAP_PATH}`;

/**
 * Express / Node http middleware. `app.use(cortiqExpress(cortiq))` — registers the trap
 * route and reports agent requests after the response finished.
 */
export function cortiqExpress(cortiq) {
  return function cortiqMiddleware(req, res, next) {
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
    const proto = req.headers['x-forwarded-proto'] || (req.socket && req.socket.encrypted ? 'https' : 'http');
    // Behind a proxy the forwarded headers carry the client; otherwise use the socket.
    const direct = !req.headers['x-forwarded-for'] && !req.headers['x-real-ip'] && req.socket ? req.socket.remoteAddress : undefined;
    const headers = direct ? { ...req.headers, 'x-real-ip': direct } : req.headers;
    const request = { url: `${String(proto).split(',')[0]}://${host}${req.originalUrl || req.url}`, method: req.method, headers };
    if (cortiq.isTrap(request)) {
      cortiq.report(request, { status: 404 });
      res.statusCode = 404;
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      res.end('Not found');
      return;
    }
    if (cortiq.shouldReport(request)) {
      res.on('finish', () => { cortiq.report(request, { status: res.statusCode }); });
    }
    next();
  };
}

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

// Pre-filter: the AI bots CortIQ classifies (its registry). Anything else would be
// discarded server-side, so it never leaves your server. Must cover every registry bot
// (tests/foundation/server-adapters.test.mjs enforces it).
export const AGENT_UA = /GPTBot|ChatGPT|OAI-SearchBot|Claude-User|Claude-SearchBot|ClaudeBot|anthropic-ai|Perplexity|Google-Extended|GoogleOther|Googlebot|bingbot|BingPreview|Meta-ExternalAgent|FacebookBot|facebookexternalhit|Applebot|YouBot|DuckAssistBot|Grok|Amazonbot|Bytespider|CCBot|Diffbot|cohere-ai|DeepSeek|MistralAI/i;

const WATCHED_FILES = new Set(['/robots.txt', '/llms.txt', '/llms-full.txt']);

/** Truncate an IP to its network: a.b.c.0 (IPv4) or first three groups (IPv6). */
export function truncateIp(ip) {
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

function cleanReferrer(r) {
  if (!r) return undefined;
  try { const u = new URL(r); return u.origin + u.pathname; } catch { return undefined; }
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
      referrer: cleanReferrer(header(request.headers, 'referer')),
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

/** Add "Disallow: /cortiq-trap/" to every user-agent group (bots obey only their own group). */
export function addTrapRule(robots) {
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

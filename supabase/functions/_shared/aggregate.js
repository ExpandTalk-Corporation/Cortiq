// Aggregate measurement helpers (aggregate-hit). Plain JS so Deno and the Node foundation tests
// share one implementation. IP and User-Agent are only reduced to a device class or folded into
// the daily visitor hash; nothing here stores them.

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign'];

const EMAIL = /[^\s/@]+@[^\s/@]+\.[a-z]{2,}/i;
const UUID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
const LONG_DIGITS = /\d{6,}/;
const HEX_TOKEN = /^[0-9a-f]{16,}$/i;
// Base64-like: long, letters and digits with no word separators. JWTs start with eyJ.
const OPAQUE_TOKEN = /^[A-Za-z0-9.~+=]{24,}$/;
const JWT = /^eyJ[\w-]+\.[\w-]+/;

/**
 * True for free text that looks like a person or a record rather than a page or a campaign:
 * an email address, a UUID, 6+ digits in a row (phone, personal or order number), or a long token.
 */
export function looksIdentifying(value) {
  const s = String(value ?? '');
  let decoded = s;
  try { decoded = decodeURIComponent(s); } catch { /* keep raw */ }
  if (EMAIL.test(decoded) || UUID.test(decoded) || LONG_DIGITS.test(decoded) || HEX_TOKEN.test(decoded) || JWT.test(decoded)) return true;
  return OPAQUE_TOKEN.test(decoded) && /\d/.test(decoded) && /[A-Za-z]/.test(decoded);
}

/** Free text that is stored in daily totals: trimmed, capped, '' when it looks identifying. */
export function cleanText(value, max) {
  if (typeof value !== 'string') return '';
  const v = value.trim().slice(0, max);
  return v && !looksIdentifying(v) ? v : '';
}

/**
 * Path without query string or fragment (they can carry emails or tokens), no trailing slash.
 * Segments that look like an email, an ID or a token become ':id', so /order/123456/receipt and
 * /u/jane@example.com are counted as /order/:id/receipt and /u/:id.
 */
export function cleanPath(url) {
  return maskPath(url.pathname || '/');
}

function maskPath(p) {
  const trimmed = (p.length > 1 ? p.replace(/\/+$/, '') : p) || '/';
  return trimmed.split('/').map((seg) => (seg && looksIdentifying(seg) ? ':id' : seg)).join('/').slice(0, 512);
}

/** External referrer → bare domain. Own site (incl. subdomains), empty or invalid → '' (direct). */
export function referrerSource(referrer, siteHost) {
  if (typeof referrer !== 'string' || !referrer) return '';
  let host;
  try { host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, ''); } catch { return ''; }
  if (!host || host === siteHost || host.endsWith('.' + siteHost)) return '';
  return host.slice(0, 253);
}

/** The three campaign keys the dashboard groups by, as RPC parameters. Identifying values are dropped. */
export function utmFrom(raw) {
  const out = { p_utm_source: '', p_utm_medium: '', p_utm_campaign: '' };
  if (!raw || typeof raw !== 'object') return out;
  for (const key of UTM_KEYS) out['p_' + key] = cleanText(raw[key], 100);
  return out;
}

/**
 * Goal id and name for a form submit that matched no configured goal (data-wfa-conversion).
 * Both come from the page, so they get the same treatment as paths and UTM values. The beacon
 * falls back to the page path as content id; a path keeps its shape with ':id' segments.
 */
export function fallbackGoal(formId, contentId, path) {
  const id = cleanText(formId, 100);
  const name = typeof contentId === 'string' && contentId.trim().startsWith('/')
    ? maskPath(contentId.trim().split(/[?#]/)[0]).slice(0, 200)
    : cleanText(contentId, 200);
  return { id: `form:${id || path}`, name: name || 'Conversion' };
}

/** Coarse device class from the User-Agent header the request carried anyway. */
export function deviceFromUA(ua) {
  const s = String(ua || '');
  if (/iPad|Tablet|PlayBook|Silk/i.test(s) || (/Android/i.test(s) && !/Mobile/i.test(s))) return 'tablet';
  if (/Mobi|iPhone|iPod|Android/i.test(s)) return 'mobile';
  return 'desktop';
}

/** The visitor's IP as seen by the edge. Used only as hash input. */
export function clientIp(headers) {
  const cf = headers.get('cf-connecting-ip');
  if (cf) return cf.trim();
  const xff = headers.get('x-forwarded-for');
  return xff ? xff.split(',')[0].trim() : '';
}

/**
 * SHA-256 hex of salt|site|ip|ua. The salt changes every UTC day and is deleted afterwards, so a
 * hash cannot be recomputed or linked across days.
 */
export async function visitorHash(salt, siteId, ip, ua) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode([salt, siteId, ip, ua].join('|')));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

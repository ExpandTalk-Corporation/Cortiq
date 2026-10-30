// Aggregate measurement helpers (aggregate-hit). Plain JS so Deno and the Node foundation tests
// share one implementation. IP and User-Agent are only reduced to a device class or folded into
// the daily visitor hash; nothing here stores them.

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign'];

/** Path without query string or fragment (they can carry emails or tokens), no trailing slash. */
export function cleanPath(url) {
  const p = url.pathname || '/';
  return ((p.length > 1 ? p.replace(/\/+$/, '') : p) || '/').slice(0, 512);
}

/** External referrer → bare domain. Own site (incl. subdomains), empty or invalid → '' (direct). */
export function referrerSource(referrer, siteHost) {
  if (typeof referrer !== 'string' || !referrer) return '';
  let host;
  try { host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, ''); } catch { return ''; }
  if (!host || host === siteHost || host.endsWith('.' + siteHost)) return '';
  return host.slice(0, 253);
}

/** The three campaign keys the dashboard groups by, as RPC parameters. */
export function utmFrom(raw) {
  const out = { p_utm_source: '', p_utm_medium: '', p_utm_campaign: '' };
  if (!raw || typeof raw !== 'object') return out;
  for (const key of UTM_KEYS) {
    const v = raw[key];
    if (typeof v === 'string') out['p_' + key] = v.trim().slice(0, 100);
  }
  return out;
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

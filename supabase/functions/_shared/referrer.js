// Referrer storage policy for browser events.
// Default ON: a missing setting must not silently drop traffic sources (every live company
// had gdpr_settings = null, which wiped all referrers from 2026-07-16). Only an explicit
// store_referrer: false opts out. Query string and fragment are always stripped: they can
// carry tokens, emails or search terms. android-app:// keeps the app package (e.g. a
// ChatGPT or Gmail app link), which is the only source signal those visits carry.
const ALLOWED = new Set(['http:', 'https:', 'android-app:']);

export function storedReferrer(raw, gdprSettings) {
  if (gdprSettings?.store_referrer === false) return null;
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const u = new URL(raw.slice(0, 2048));
    if (!ALLOWED.has(u.protocol) || !u.host) return null;
    return `${u.protocol}//${u.host}${u.pathname}`.slice(0, 1024);
  } catch {
    return null;
  }
}

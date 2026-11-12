// Browser and operating system family from a User-Agent header, for tracking_sessions.browser
// and .os. Families only (no versions, no device model), so what is stored cannot single out a
// visitor the way the full string can. Shared by track-event (Deno) and the foundation tests (Node).
//
// Order matters: many browsers also claim Chrome or Safari, so the more specific tokens come first.

const BROWSERS = [
  ['Edge', /\bEdg(?:e|A|iOS)?\//],
  ['Opera', /\bOPR\/|\bOPiOS\/|\bOpera\b/],
  ['Samsung Internet', /\bSamsungBrowser\//],
  ['Firefox', /\bFirefox\/|\bFxiOS\//],
  ['Chrome', /\bChrome\/|\bCriOS\//],
  ['Safari', /\bVersion\/[\d.]+.*\bSafari\/|\b(?:iPhone|iPad|iPod)\b.*AppleWebKit\//],
];

const SYSTEMS = [
  ['iOS', /\b(?:iPhone|iPad|iPod)\b/],
  ['Android', /\bAndroid\b/],
  ['ChromeOS', /\bCrOS\b/],
  ['Windows', /\bWindows\b/],
  ['macOS', /\bMac OS X\b|\bMacintosh\b/],
  ['Linux', /\bLinux\b/],
];

const pick = (list, ua) => list.find(([, re]) => re.test(ua))?.[0] ?? 'Other';

/** { browser, os } families, or nulls when there is no User-Agent to read. */
export function browserAndOs(userAgent) {
  const ua = typeof userAgent === 'string' ? userAgent.slice(0, 512) : '';
  if (!ua.trim()) return { browser: null, os: null };
  return { browser: pick(BROWSERS, ua), os: pick(SYSTEMS, ua) };
}

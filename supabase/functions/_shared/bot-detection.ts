/**
 * Bot detection — shared across all tracking Edge Functions.
 *
 * Usage:
 *   import { deriveUACategory } from '../_shared/bot-detection.ts';
 *
 *   const uaCategory = deriveUACategory(rawUA);
 */

/**
 * Derive a coarse, non-identifying UA category string.
 * Safe to store in all pipeline modes.
 * Examples: "Desktop Chrome", "Mobile Safari", "Headless Chrome"
 */
export function deriveUACategory(ua: string | null): string | null {
  if (!ua) return null;
  const u = ua.toLowerCase();

  if (u.includes('headlesschrome') || u.includes('phantomjs') || u.includes('puppeteer')) {
    return 'Headless Browser';
  }
  const browser =
    u.includes('firefox')       ? 'Firefox'  :
    u.includes('edg/')           ? 'Edge'     :
    u.includes('opr/')           ? 'Opera'    :
    u.includes('chrome/')        ? 'Chrome'   :
    u.includes('safari/')        ? 'Safari'   :
    u.includes('curl/')          ? 'curl'     :
    u.includes('python')         ? 'Python'   :
    u.includes('wget')           ? 'wget'     :
    'Other';

  const device =
    u.includes('mobile') || u.includes('android') || u.includes('iphone') ? 'Mobile' :
    u.includes('tablet') || u.includes('ipad')                             ? 'Tablet' :
    'Desktop';

  return `${device} ${browser}`;
}

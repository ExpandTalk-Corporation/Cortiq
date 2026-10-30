// CortIQ measuring cortiq.se itself. vite.config.ts injects this snippet into index.html at
// build time when VITE_CORTIQ_SITE_ID and VITE_CORTIQ_TRACKING_KEY are set (.env, not committed);
// without them the build ships no tracking at all. It is the same consent-gated loader customers
// get (src/lib/consent-loader.js): /cortiq.js is requested only after analytics consent in the
// site's own banner (site_cookie_consent + siteConsentUpdated).
import { readFileSync } from 'node:fs';

// Logged-in app and tokenised report URLs are not measured.
export const SELF_TRACKING_EXCLUDE = '/dashboard,/auth,/navigation,/tracking-check';

const DEFAULT_API = 'https://cxmkdtgfocgbfizawlwa.supabase.co/functions/v1';

/**
 * @param {Record<string, string | undefined>} env
 * @param {{ loaderSource: string, beaconSource?: string, version: string }} files
 * @returns {string} the <script> block, or '' when self-tracking is not configured
 */
export function buildSelfTrackingSnippet(env, { loaderSource, beaconSource = '', version }) {
  const siteId = (env.VITE_CORTIQ_SITE_ID || '').trim();
  const key = (env.VITE_CORTIQ_TRACKING_KEY || '').trim();
  if (!siteId || !key) return '';
  if (!/^[0-9a-f-]{36}$/i.test(siteId) || !/^[A-Za-z0-9_\-+/=]{8,200}$/.test(key)) {
    throw new Error('VITE_CORTIQ_SITE_ID must be a site UUID and VITE_CORTIQ_TRACKING_KEY a tracking key');
  }
  const config = {
    apiUrl: (env.VITE_CORTIQ_TRACK_URL || DEFAULT_API).trim(),
    siteId,
    apiKey: key,
    cookieless: true,
    excludePaths: SELF_TRACKING_EXCLUDE,
  };
  const aggregate = (env.VITE_CORTIQ_AGGREGATE || '').trim() === 'true';
  if (aggregate) config.aggregate = true;
  const loader = loaderSource
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n')
    .replace('__CORTIQ_SRC__', `/cortiq.js?ver=${version}`)
    .trim();
  const strip = (src) => src.split('\n').filter((line) => !line.trimStart().startsWith('//')).join('\n').trim();
  const beacon = aggregate && beaconSource ? `${strip(beaconSource)}\n` : '';
  const header = beacon
    ? '<!-- CortIQ self-measurement: counts page views without consent (no cookies, no device storage, no IDs); full tracking loads only after analytics consent -->'
    : '<!-- CortIQ self-measurement: loads only after analytics consent -->';
  return `${header}\n<script>\nwindow.cortiqConfig = ${JSON.stringify(config)};\n${beacon}${loader}\n</script>`;
}

export function readSelfTrackingFiles(root) {
  const loaderSource = readFileSync(`${root}/src/lib/consent-loader.js`, 'utf8');
  const beaconSource = readFileSync(`${root}/src/lib/aggregate-beacon.js`, 'utf8');
  const version = readFileSync(`${root}/src/lib/plugin-version.ts`, 'utf8').match(/PLUGIN_VERSION = '([^']+)'/)[1];
  return { loaderSource, beaconSource, version };
}

// Pure renderer for the install snippet. trackingSnippet.ts supplies the sources via Vite ?raw
// imports; the foundation tests read them from disk.

/**
 * How the site collects consent:
 * - `own-cmp`: the site's own banner (Cookiebot, Google Consent Mode, a CMP) — the loader reads it.
 * - `cortiq-banner`: adds the CortIQ banner (public/consent-banner.js) in front of the loader.
 * - `none`: no banner. Only the consent-free aggregate beacon; requires sites.aggregate_measurement.
 */
export type ConsentSetup = 'own-cmp' | 'cortiq-banner' | 'none';

export interface TrackingSnippetOptions {
  apiUrl: string;
  siteId: string;
  trackingKey: string;
  scriptSrc: string;
  /** Inline the consent-free aggregate beacon (sites.aggregate_measurement). */
  aggregate?: boolean;
  consentSetup?: ConsentSetup;
  /** URL of consent-banner.js; required for `cortiq-banner`. */
  bannerSrc?: string;
  /** Controller name for the banner text; the site owner replaces it with the legal name. */
  company?: string;
}

function stripLineComments(source: string): string {
  return source
    .split('\n')
    .filter(line => !line.trimStart().startsWith('//'))
    .join('\n')
    .trim();
}

const escapeAttr = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function renderTrackingSnippet(
  { apiUrl, siteId, trackingKey, scriptSrc, aggregate = false, consentSetup = 'own-cmp', bannerSrc, company }: TrackingSnippetOptions,
  sources: { loader: string; beacon: string },
): string {
  const indent = (code: string) => code.split('\n').map(l => '  ' + l).join('\n');
  const beacon = indent(stripLineComments(sources.beacon));

  if (consentSetup === 'none') {
    return `<!-- CortIQ Analytics: aggregate measurement without a consent banner (no cookies, no device storage, no IDs). Requires Aggregate measurement under Consent → Tracking mode. -->
<script>
  window.cortiqConfig = {
    apiUrl: '${apiUrl}',
    siteId: '${siteId}',
    apiKey: '${trackingKey}',
    aggregate: true
  };
${beacon}
</script>`;
  }

  const loader = stripLineComments(sources.loader).replace('__CORTIQ_SRC__', scriptSrc);
  const header = aggregate
    ? '<!-- CortIQ Analytics: counts page views without consent (no cookies, no device storage, no IDs); full tracking loads only after analytics consent -->'
    : '<!-- CortIQ Analytics: loads only after analytics consent -->';
  const banner = consentSetup === 'cortiq-banner'
    ? `
<!-- CortIQ consent banner. Set data-company to your legal company name and data-policy-url to your
     privacy policy, list only the purposes you use in data-categories (analytics, marketing,
     preferences) and bump data-policy-version when either changes. -->
<script src="${bannerSrc ?? 'https://cortiq.se/consent-banner.js'}"
  data-site-id="${siteId}"
  data-api-url="${apiUrl}"
  data-company="${escapeAttr(company || 'Your Company AB')}"
  data-policy-url="/privacy"
  data-categories="analytics"
  data-policy-version="1"
  defer></script>`
    : '';
  return `${header}
<script>
  window.cortiqConfig = {
    apiUrl: '${apiUrl}',
    siteId: '${siteId}',
    apiKey: '${trackingKey}',
    cookieless: true${aggregate ? ',\n    aggregate: true' : ''}
  };
${aggregate ? beacon + '\n' : ''}${indent(loader)}
</script>${banner}`;
}

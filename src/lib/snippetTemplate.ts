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
  /** Controller's legal name for the banner text; required for `cortiq-banner`. */
  company?: string;
  /** Privacy policy URL (https:// or a root-relative path); required for `cortiq-banner`. */
  policyUrl?: string;
  /** Banner data-policy-version; bump to ask visitors again. */
  policyVersion?: string;
  /** Banner sends Google Consent Mode v2 signals (data-consent-mode="google"). Opt-in. */
  googleConsentMode?: boolean;
}

/** Why the CortIQ banner snippet cannot be rendered yet, or null. No placeholder may reach a live site. */
export function bannerDetailsProblem({ company, policyUrl }: { company?: string; policyUrl?: string }): string | null {
  if (!company?.trim()) return 'Enter your legal company name: the banner names it as responsible for the data.';
  if (!policyUrl?.trim()) return 'Enter the URL of your privacy policy.';
  if (!/^(https:\/\/[^\s"'<>]+|\/(?!\/)[^\s"'<>]*)$/i.test(policyUrl.trim())) {
    return 'The privacy policy URL must start with https:// or / (a path on your site).';
  }
  return null;
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

// For values inside single-quoted JS strings in an inline <script>: no quote, backslash, line break or </script>.
const escapeJs = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/</g, '\\x3c').replace(/[\r\n\u2028\u2029]/g, '');

export function renderTrackingSnippet(
  {
    apiUrl, siteId, trackingKey, scriptSrc, aggregate = false, consentSetup = 'own-cmp',
    bannerSrc, company, policyUrl, policyVersion, googleConsentMode = false,
  }: TrackingSnippetOptions,
  sources: { loader: string; beacon: string },
): string {
  const config = `    apiUrl: '${escapeJs(apiUrl)}',
    siteId: '${escapeJs(siteId)}',
    apiKey: '${escapeJs(trackingKey)}'`;
  const indent = (code: string) => code.split('\n').map(l => '  ' + l).join('\n');
  const beacon = indent(stripLineComments(sources.beacon));

  if (consentSetup === 'none') {
    return `<!-- CortIQ Analytics: aggregate measurement without a consent banner (no cookies, no device storage, no IDs). Requires Aggregate measurement under Consent → Tracking mode. -->
<script>
  window.cortiqConfig = {
${config},
    aggregate: true
  };
${beacon}
</script>`;
  }

  const loader = stripLineComments(sources.loader).replace('__CORTIQ_SRC__', () => escapeJs(scriptSrc));
  const header = aggregate
    ? '<!-- CortIQ Analytics: counts page views without consent (no cookies, no device storage, no IDs); full tracking loads only after analytics consent -->'
    : '<!-- CortIQ Analytics: loads only after analytics consent -->';
  if (consentSetup === 'cortiq-banner') {
    const problem = bannerDetailsProblem({ company, policyUrl });
    if (problem) throw new Error(problem);
  }
  // The banner tag comes first so the loader can read its data-policy-version.
  const banner = consentSetup === 'cortiq-banner'
    ? `<!-- CortIQ consent banner. List only the purposes you use in data-categories (analytics, marketing,
     preferences) and bump data-policy-version when the policy or the categories change.${googleConsentMode ? `
     It sends Google Consent Mode v2 signals: move this tag into <head> above your Google tags (gtag.js,
     GTM) and drop defer, so they wait for the choice.` : ''} -->
<script src="${escapeAttr(bannerSrc ?? 'https://cortiq.se/consent-banner.js')}"
  data-site-id="${escapeAttr(siteId)}"
  data-api-url="${escapeAttr(apiUrl)}"
  data-company="${escapeAttr(company!.trim())}"
  data-policy-url="${escapeAttr(policyUrl!.trim())}"
  data-categories="analytics"
  data-policy-version="${escapeAttr(policyVersion?.trim() || '1')}"${googleConsentMode ? '\n  data-consent-mode="google"' : ''}
  defer></script>
`
    : '';
  return `${banner}${header}
<script>
  window.cortiqConfig = {
${config},
    cookieless: true${aggregate ? ',\n    aggregate: true' : ''}
  };
${aggregate ? beacon + '\n' : ''}${indent(loader)}
</script>`;
}

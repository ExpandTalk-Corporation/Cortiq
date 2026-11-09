// Plain-language fix guidance shared by the consent findings: CMP-specific steps, GTM consent settings,
// a console check and the expected data drop. Kept here so every finding explains the same fix the same way.
import type { PageObservation } from '../types.ts';
import type { Vendor } from '../../tracking-vendors.ts';
import type { ScriptOrigin } from './util.ts';

const CMP_NAMES: Record<string, string> = {
  cookiebot: 'Cookiebot', onetrust: 'OneTrust', cookieyes: 'CookieYes', complianz: 'Complianz',
  dynamicweb: 'Dynamicweb', cortiq: 'the CortIQ consent banner',
};

/** The cookie banner seen on most of these pages, or null. */
export function cmpOf(pages: PageObservation[]): string | null {
  const counts = new Map<string, number>();
  for (const p of pages) {
    const c = p.browser?.cmp;
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export const cmpName = (cmp: string | null): string | null => (cmp ? CMP_NAMES[cmp] ?? cmp : null);

/** How to make the cookie banner set the Consent Mode default and update it. */
export function consentModeSteps(cmp: string | null): string {
  switch (cmp) {
    case 'onetrust':
      return 'In OneTrust, turn on Google Consent Mode in the geolocation rule (or template) used for EU visitors, and map the categories: Performance/Statistics (usually C0002) → analytics_storage; Targeting/Marketing (usually C0004) → ad_storage, ad_user_data and ad_personalization. Publish the script again. OneTrust then sets "denied" as the default and switches to "granted" when the visitor accepts.';
    case 'cookiebot':
      return 'Add the Cookiebot CMP template in GTM on the "Consent Initialization – All Pages" trigger, with Consent Mode turned on and the default set to "denied". Cookiebot then updates the consent state when the visitor answers.';
    case 'cookieyes':
      return 'In CookieYes, turn on Google Consent Mode support in the banner settings (or use the CookieYes template in GTM on the "Consent Initialization – All Pages" trigger). CookieYes then sets "denied" as the default and updates it when the visitor answers.';
    default:
      return 'Most cookie banners have a Google Consent Mode v2 setting or a GTM template that sets "denied" as the default and updates it when the visitor answers. Turn it on, or add the default yourself:';
  }
}

/** GTM settings that make a Google tag wait for consent (Consent Mode basic). */
export function gtmBlockSteps(cmp: string | null, vendor: Vendor): string {
  const marketing = vendor.category === 'marketing';
  const consent = marketing ? 'ad_storage' : 'analytics_storage';
  const trigger = cmp === 'onetrust'
    ? ` With OneTrust you can instead fire the tag on the custom event OneTrustGroupsUpdated, with the condition that the variable OnetrustActiveGroups contains ${marketing ? '",C0004," (Marketing)' : '",C0002," (Statistics)'}; check the group IDs in OneTrust.`
    : cmp === 'cookiebot'
      ? ` With Cookiebot you can instead fire the tag on the custom event ${marketing ? 'cookie_consent_marketing' : 'cookie_consent_statistics'}.`
      : ' Or fire the tag on the cookie banner\'s consent event rather than on All Pages.';
  return [
    `In GTM, open the ${vendor.name} tag${vendor.id === 'google-ads' ? 's (conversion, remarketing and the Conversion Linker)' : ''} → Advanced settings → Consent settings → "Require additional consent for tag to fire" and add ${consent}.${trigger}`,
    'Google\'s built-in consent checks on their own are not enough: they let the tag send cookieless pings to Google before consent (Consent Mode advanced), and this check reports those too.',
  ].join('\n\n');
}

/** How the cookie banner blocks a <script> tag in the page source until consent for a category. */
export function cmpScriptBlocking(cmp: string | null, category: string): string {
  const marketing = category === 'marketing';
  switch (cmp) {
    case 'cookiebot':
      return `with Cookiebot, change the script tag to type="text/plain" and add data-cookieconsent="${marketing ? 'marketing' : 'statistics'}"`;
    case 'onetrust':
      return `with OneTrust, change the script tag to type="text/plain" and add class="optanon-category-${marketing ? 'C0004' : 'C0002'}" (check the group ID in OneTrust)`;
    case 'cookieyes':
      return `with CookieYes, change the script tag to type="text/plain" and add data-cookieyes="cookieyes-${marketing ? 'advertisement' : 'analytics'}"`;
    case 'complianz':
      return `with Complianz, add the script under Integrations → Script Center with the "${marketing ? 'Marketing' : 'Statistics'}" category`;
    default:
      return 'use the cookie banner\'s script blocking (usually type="text/plain" plus a category attribute on the script tag)';
  }
}

/** Fix for a non-Google tool that runs without consent, depending on what loads it. */
export function vendorBlockSteps(cmp: string | null, vendor: Vendor, origin: ScriptOrigin | null): string {
  const banner = cmpName(cmp);
  const consent = vendor.category === 'marketing' ? 'ad_storage' : 'analytics_storage';
  if (origin === 'page') {
    return `The ${vendor.name} script is in the page source (the site's HTML or template), not loaded through Google Tag Manager, so consent settings in GTM do not affect it. Either remove it from the template and add it as a GTM tag that requires ${consent}, or let the cookie banner block it: ${cmpScriptBlocking(cmp, vendor.category)}.`;
  }
  if (origin === 'gtm') {
    return `${vendor.name} is loaded by Google Tag Manager. In GTM, open its tag → Advanced settings → Consent settings → "Require additional consent for tag to fire" and add ${consent}, or fire it on the cookie banner's consent event instead of All Pages.`;
  }
  return `Load ${vendor.name} only after consent for the "${vendor.category}" category: block it in the cookie banner${banner ? ` (${banner})` : ''}, or give its GTM tag a consent requirement.`;
}

/** Fix for the GTM container request before consent, depending on what loads the cookie banner. */
export function gtmContainerFix(cmp: string | null, bannerOrigin: ScriptOrigin | null): string {
  const exception = 'Record the container request as an accepted exception, with the reasoning.';
  if (bannerOrigin === 'page') {
    const banner = cmpName(cmp) ?? 'the cookie banner';
    return [
      `Recommended: load GTM only after consent. ${banner} loads directly in the page source, not through GTM, so the banner keeps working without GTM. Block the GTM snippet until the visitor accepts statistics: ${cmpScriptBlocking(cmp, 'analytics')}.`,
      'Consequences: visitors who never answer the banner are not measured at all, and Consent Mode then has nothing left to do before consent. ' + DATA_DROP,
      `Alternative: ${exception}`,
    ].join('\n\n');
  }
  if (bannerOrigin === 'gtm') {
    return `The cookie banner is loaded by GTM, so GTM cannot wait for the banner's answer. Choose one:\n1) ${exception} This is the most common choice.\n2) Move the cookie banner into the page source, then load GTM only after consent. Visitors who never answer the banner are then not measured at all.`;
  }
  return `Choose one:\n1) ${exception} This is the most common choice.\n2) Load GTM only after consent. The cookie banner must then load directly in the page, not through GTM, and visitors who never answer the banner are not measured at all.`;
}

/** Where a tool was loaded from, as an evidence line. */
export const ORIGIN_LABEL: Record<ScriptOrigin, string> = {
  page: 'loaded from the page source', gtm: 'loaded by Google Tag Manager', cmp: 'loaded by the cookie banner', other: 'loaded by another script',
};

export const VERIFY_IN_CONSOLE = [
  'Check it yourself: open the site in an incognito window, do not answer the cookie banner, and run in DevTools → Console:',
  "  dataLayer.filter(e => e[0] === 'consent')   // a 'default' with 'denied' should be the first entry",
  '  google_tag_data.ics.entries                 // analytics_storage and ad_storage should be denied',
  'Application → Cookies should show no _ga or _gcl_ cookies until you accept.',
].join('\n');

export const ONETRUST_CHECK = '  OnetrustActiveGroups                        // only the necessary group (e.g. ",C0001,") before a choice';

export const DATA_DROP = 'Expect fewer GA4 sessions and Google Ads conversions once this is fixed: visitors who reject or never answer are no longer measured. Tell whoever reads the reports beforehand, so the drop is not mistaken for a campaign problem.';

export const verifyInConsole = (cmp: string | null): string =>
  cmp === 'onetrust' ? VERIFY_IN_CONSOLE.replace('\nApplication', `\n${ONETRUST_CHECK}\nApplication`) : VERIFY_IN_CONSOLE;

/** What a Google endpoint is, for evidence lines on requests that no known tag claimed. */
export function googleHostLabel(host: string): string {
  if (/(^|\.)analytics\.google\.com$|google-analytics\.com$/.test(host)) return 'Google Analytics 4 measurement';
  if (host === 'stats.g.doubleclick.net') return 'Google Analytics 4 with Google signals (advertising features)';
  if (/doubleclick\.net$|googleadservices\.com$|googlesyndication\.com$/.test(host)) return 'Google Ads';
  if (/^www\.google\.(?!com$)/.test(host)) return 'Google Ads or GA4 audiences; the country domain follows the location of the test browser';
  if (/googletagmanager\.com$/.test(host)) return 'Google Tag Manager or the Google tag';
  return '';
}

// Canonical list of tracking vendors Tracking Check recognises. Same principle as
// ai-bot-registry.ts: one list, imported wherever vendors are classified.
import type { ConsentCategory } from './tracking-check/types.ts';

export type CspDirective = 'script-src' | 'connect-src' | 'img-src' | 'frame-src';
export interface VendorMatcher { host: RegExp; path?: RegExp; query?: RegExp }
export interface Vendor {
  id: string;
  name: string;
  category: ConsentCategory;
  /** Google advertising/analytics tag (GTM, GA4, Google Ads). */
  googleTag: boolean;
  requests: VendorMatcher[];
  cookies: RegExp[];
  idFrom?: (url: URL) => string | null;
  csp: Partial<Record<CspDirective, string[]>>;
  impact: string;
}

const param = (name: string, prefix: string) => (u: URL): string | null => {
  const v = u.searchParams.get(name);
  return v && v.startsWith(prefix) ? v : null;
};
const ANY = /./;

export const TRACKING_VENDORS: Vendor[] = [
  {
    id: 'gtm', name: 'Google Tag Manager', category: 'necessary', googleTag: true,
    requests: [{ host: /^www\.googletagmanager\.com$/, path: /^\/gtm\.js/ }],
    cookies: [], idFrom: param('id', 'GTM-'),
    csp: { 'script-src': ['*.googletagmanager.com'], 'img-src': ['*.googletagmanager.com'], 'connect-src': ['*.googletagmanager.com'] },
    impact: 'Tags managed in GTM (for example GA4, Google Ads and Meta) do not run.',
  },
  {
    id: 'ga4', name: 'Google Analytics 4', category: 'analytics', googleTag: true,
    requests: [
      { host: /^www\.googletagmanager\.com$/, path: /^\/gtag\/js/, query: /[?&]id=(G|GT)-/ },
      { host: /^((region\d+|www)\.)?google-analytics\.com$|^analytics\.google\.com$/, path: /^\/(g|j)\/collect/ },
    ],
    cookies: [/^_ga$/, /^_ga_/, /^_gid$/, /^_gat/],
    idFrom: (u) => param('id', 'G-')(u) ?? param('tid', 'G-')(u),
    csp: { 'script-src': ['*.googletagmanager.com'], 'img-src': ['*.google-analytics.com', '*.googletagmanager.com'], 'connect-src': ['*.google-analytics.com', '*.analytics.google.com', '*.googletagmanager.com'] },
    impact: 'Google Analytics records no visits or conversions from these pages.',
  },
  {
    id: 'google-ads', name: 'Google Ads', category: 'marketing', googleTag: true,
    requests: [
      { host: /^www\.googletagmanager\.com$/, path: /^\/gtag\/js/, query: /[?&]id=AW-/ },
      { host: /^(googleads\.g\.doubleclick\.net|www\.googleadservices\.com|ad\.doubleclick\.net)$/ },
      { host: /^www\.google\.com$/, path: /^\/(pagead|ccm|rmkt)\// },
    ],
    cookies: [/^_gcl_/, /^IDE$/, /^test_cookie$/],
    idFrom: (u) => {
      const id = param('id', 'AW-')(u);
      if (id) return id;
      const m = u.pathname.match(/\/(?:pagead\/(?:1p-)?conversion|pagead\/viewthroughconversion)\/(\d+)/);
      return m ? `AW-${m[1]}` : null;
    },
    csp: { 'script-src': ['*.googletagmanager.com', 'www.googleadservices.com', 'googleads.g.doubleclick.net'], 'img-src': ['www.google.com', 'googleads.g.doubleclick.net', 'www.googleadservices.com'], 'connect-src': ['www.google.com', 'googleads.g.doubleclick.net', 'www.googleadservices.com'], 'frame-src': ['td.doubleclick.net', 'bid.g.doubleclick.net'] },
    impact: 'Google Ads cannot attribute conversions to ad clicks, so Smart Bidding optimises on incomplete data.',
  },
  {
    id: 'hubspot', name: 'HubSpot tracking code', category: 'analytics', googleTag: false,
    requests: [{ host: /^(js(-eu1)?\.hs-(scripts|analytics|banner)\.(com|net)|js\.hscollectedforms\.net|js\.hsadspixel\.net|track(-eu1)?\.hubspot\.com|js(-eu1)?\.usemessages\.com)$/ }],
    cookies: [/^__hstc$/, /^hubspotutk$/, /^__hssc$/, /^__hssrc$/],
    idFrom: (u) => (/^js(-eu1)?\.hs-scripts\.com$/.test(u.hostname) ? u.pathname.match(/^\/(\d+)\.js/)?.[1] ?? null : null),
    csp: { 'script-src': ['js.hs-scripts.com', 'js.hs-analytics.net', 'js.hs-banner.com', 'js.hscollectedforms.net', 'js.hsadspixel.net', 'js.usemessages.com'], 'connect-src': ['*.hubspot.com', 'forms.hscollectedforms.net'], 'img-src': ['track.hubspot.com'] },
    impact: 'HubSpot cannot link form submissions to page views or traffic source (Original Source falls back to Direct or Offline), and cannot capture gclid for Google Ads offline conversions.',
  },
  {
    id: 'hubspot-forms', name: 'HubSpot forms', category: 'necessary', googleTag: false,
    requests: [{ host: /^(js(-eu1)?\.hsforms\.net|forms(-eu1)?\.hsforms\.com|forms(-eu1)?\.hubspot\.com)$/ }],
    cookies: [],
    csp: { 'script-src': ['js.hsforms.net'], 'connect-src': ['forms.hsforms.com', 'forms.hubspot.com'], 'frame-src': ['forms.hsforms.com'], 'img-src': ['forms.hsforms.com'] },
    impact: 'HubSpot forms do not render or cannot be submitted.',
  },
  {
    id: 'meta', name: 'Meta Pixel', category: 'marketing', googleTag: false,
    requests: [{ host: /^connect\.facebook\.net$/ }, { host: /^www\.facebook\.com$/, path: /^\/tr/ }],
    cookies: [/^_fbp$/, /^_fbc$/, /^fr$/],
    idFrom: (u) => (u.hostname === 'www.facebook.com' ? u.searchParams.get('id') : null),
    csp: { 'script-src': ['connect.facebook.net'], 'connect-src': ['www.facebook.com', 'connect.facebook.net'], 'img-src': ['www.facebook.com'], 'frame-src': ['www.facebook.com'] },
    impact: 'Meta Ads cannot attribute conversions to ads.',
  },
  {
    id: 'linkedin', name: 'LinkedIn Insight Tag', category: 'marketing', googleTag: false,
    requests: [{ host: /^(snap\.licdn\.com|px\.ads\.linkedin\.com|dc\.ads\.linkedin\.com)$/ }],
    cookies: [/^li_fat_id$/, /^li_sugr$/, /^bcookie$/, /^lidc$/, /^UserMatchHistory$/, /^AnalyticsSyncHistory$/, /^ln_or$/],
    idFrom: (u) => (u.hostname === 'px.ads.linkedin.com' ? u.searchParams.get('pid') : null),
    csp: { 'script-src': ['snap.licdn.com'], 'connect-src': ['px.ads.linkedin.com'], 'img-src': ['px.ads.linkedin.com'] },
    impact: 'LinkedIn Ads cannot attribute conversions or build retargeting audiences.',
  },
  {
    id: 'reddit', name: 'Reddit Pixel', category: 'marketing', googleTag: false,
    requests: [{ host: /^www\.redditstatic\.com$/, path: /^\/ads\// }, { host: /^(alb|pixel-config)\.reddit\.com$/ }],
    cookies: [/^_rdt_uuid$/, /^_rdt_cid$/],
    idFrom: (u) => (u.hostname === 'alb.reddit.com' ? u.searchParams.get('id') : null),
    csp: { 'script-src': ['www.redditstatic.com'], 'connect-src': ['alb.reddit.com', 'pixel-config.reddit.com'], 'img-src': ['alb.reddit.com'] },
    impact: 'Reddit Ads cannot attribute conversions.',
  },
  {
    id: 'microsoft-ads', name: 'Microsoft Advertising (UET)', category: 'marketing', googleTag: false,
    requests: [{ host: /^bat\.bing\.com$/ }],
    cookies: [/^_uetsid$/, /^_uetvid$/, /^MUID$/],
    idFrom: (u) => u.searchParams.get('ti'),
    csp: { 'script-src': ['bat.bing.com'], 'connect-src': ['bat.bing.com'], 'img-src': ['bat.bing.com'] },
    impact: 'Microsoft Advertising cannot attribute conversions.',
  },
  {
    id: 'clarity', name: 'Microsoft Clarity', category: 'analytics', googleTag: false,
    requests: [{ host: /(^|\.)clarity\.ms$/ }],
    cookies: [/^_clck$/, /^_clsk$/, /^CLID$/],
    idFrom: (u) => u.pathname.match(/^\/tag\/(\w+)/)?.[1] ?? null,
    csp: { 'script-src': ['*.clarity.ms'], 'connect-src': ['*.clarity.ms'], 'img-src': ['*.clarity.ms'] },
    impact: 'Clarity records no sessions or heatmaps.',
  },
  {
    // Host and cookie patterns are unverified guesses; confirm against pretec.se with scripts/tracking-check/probe-smoke.mjs (plan Task 10, Step 7).
    id: 'extellio', name: 'Extellio', category: 'analytics', googleTag: false,
    requests: [{ host: /(^|\.)extellio\.com$/ }],
    cookies: [/^_?extellio/i],
    csp: { 'script-src': ['*.extellio.com'], 'connect-src': ['*.extellio.com'] },
    impact: 'Extellio records no visits.',
  },
  {
    id: 'cloudflare-insights', name: 'Cloudflare Web Analytics', category: 'analytics', googleTag: false,
    requests: [{ host: /^static\.cloudflareinsights\.com$/ }, { host: ANY, path: /^\/cdn-cgi\/rum/ }],
    cookies: [],
    csp: { 'script-src': ['static.cloudflareinsights.com'], 'connect-src': ['cloudflareinsights.com'] },
    impact: 'Cloudflare Web Analytics records no visits.',
  },
  {
    id: 'cortiq', name: 'CortIQ', category: 'analytics', googleTag: false,
    requests: [
      { host: /\.supabase\.co$/, path: /^\/functions\/v1\/(track-event|track-navigation|visitor-identification|link-click-counter|track-web-vitals|ai-bot-tracker|record-conversion|pixel-tracking)/ },
      { host: ANY, path: /\/(cortiq|spa-tracking)(\.min)?\.js$/ },
    ],
    cookies: [/^cortiq_/, /^heatmap_/],
    csp: { 'connect-src': ['*.supabase.co'] },
    impact: 'CortIQ records no visits.',
  },
  // Consent management platforms
  {
    id: 'cookieyes', name: 'CookieYes', category: 'necessary', googleTag: false,
    requests: [{ host: /^(cdn-cookieyes\.com|log\.cookieyes\.com|directory\.cookieyes\.com)$/ }],
    cookies: [/^cookieyes-consent$/],
    csp: { 'script-src': ['cdn-cookieyes.com'], 'connect-src': ['log.cookieyes.com', 'directory.cookieyes.com'] },
    impact: 'The cookie banner does not appear, so consent cannot be collected.',
  },
  {
    id: 'cookiebot', name: 'Cookiebot', category: 'necessary', googleTag: false,
    requests: [{ host: /^(consent|consentcdn|imgsct)\.cookiebot\.com$/ }],
    cookies: [/^CookieConsent$/],
    csp: { 'script-src': ['consent.cookiebot.com', 'consentcdn.cookiebot.com'], 'connect-src': ['consentcdn.cookiebot.com'], 'img-src': ['imgsct.cookiebot.com'] },
    impact: 'The cookie banner does not appear, so consent cannot be collected.',
  },
  {
    id: 'onetrust', name: 'OneTrust', category: 'necessary', googleTag: false,
    requests: [{ host: /^(cdn\.cookielaw\.org|geolocation\.onetrust\.com|cdn-ukwest\.onetrust\.com)$/ }],
    cookies: [/^OptanonConsent$/, /^OptanonAlertBoxClosed$/],
    csp: { 'script-src': ['cdn.cookielaw.org'], 'connect-src': ['geolocation.onetrust.com', 'cdn.cookielaw.org'] },
    impact: 'The cookie banner does not appear, so consent cannot be collected.',
  },
  {
    id: 'complianz', name: 'Complianz', category: 'necessary', googleTag: false,
    requests: [{ host: ANY, path: /\/wp-content\/plugins\/complianz/ }],
    cookies: [/^cmplz_/],
    csp: {},
    impact: 'The cookie banner does not appear, so consent cannot be collected.',
  },
  // Infrastructure that is neither a tag nor an unknown third party
  {
    id: 'google-fonts', name: 'Google Fonts', category: 'necessary', googleTag: false,
    requests: [{ host: /^fonts\.(googleapis|gstatic)\.com$/ }], cookies: [], csp: {},
    impact: 'Web fonts fall back to system fonts.',
  },
  {
    id: 'recaptcha', name: 'Google reCAPTCHA', category: 'necessary', googleTag: false,
    requests: [{ host: /^www\.(google|gstatic)\.com$/, path: /^\/recaptcha\// }], cookies: [], csp: {},
    impact: 'Forms protected by reCAPTCHA cannot be submitted.',
  },
];

// Copied from cookie-scanner's database: cookies with no vendor above.
const FALLBACK_COOKIES: [RegExp, ConsentCategory][] = [
  [/^wordpress_/, 'necessary'], [/^wp-settings-/, 'necessary'], [/^PHPSESSID$/, 'necessary'],
  [/^cookieconsent_status$/, 'preferences'], [/^heatmap_consent$/, 'preferences'],
];

const byId = new Map(TRACKING_VENDORS.map((v) => [v.id, v]));
export const vendorById = (id: string): Vendor | undefined => byId.get(id);

export function vendorForUrl(raw: string): Vendor | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  for (const v of TRACKING_VENDORS) {
    if (v.requests.some((m) => m.host.test(u.hostname) && (!m.path || m.path.test(u.pathname)) && (!m.query || m.query.test(u.search)))) return v;
  }
  return null;
}

const GOOGLE_HOST = /(^|\.)(google\.([a-z]{2,3}|com?\.[a-z]{2})|doubleclick\.net|googlesyndication\.com|googleadservices\.com|google-analytics\.com|googletagmanager\.com)$/;
/** Exempt from "nothing is sent to Google": they carry no advertising or analytics data. */
export const GOOGLE_EXEMPT_VENDORS = ['google-fonts', 'recaptcha'];

/** True for requests to Google-owned advertising/analytics endpoints (google.<tld>, doubleclick, GTM, ...). Google Fonts and reCAPTCHA are exempt. */
export function isGoogleHost(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  const v = vendorForUrl(raw);
  if (v && GOOGLE_EXEMPT_VENDORS.includes(v.id)) return false;
  return GOOGLE_HOST.test(u.hostname) || !!v?.googleTag;
}

export function vendorForName(name: string): Vendor | null {
  return TRACKING_VENDORS.find((v) => v.cookies.some((re) => re.test(name))) ?? null;
}

export function cookieCategory(name: string): ConsentCategory | null {
  return vendorForName(name)?.category ?? FALLBACK_COOKIES.find(([re]) => re.test(name))?.[1] ?? null;
}

export function extractVendorIds(urls: string[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const raw of urls) {
    const v = vendorForUrl(raw);
    if (!v?.idFrom) continue;
    const id = v.idFrom(new URL(raw));
    if (!id) continue;
    if (!out.has(v.id)) out.set(v.id, new Set());
    out.get(v.id)!.add(id);
  }
  return out;
}

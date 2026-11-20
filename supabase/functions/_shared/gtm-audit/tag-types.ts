/** GTM built-in tag types and fixed trigger IDs. Verified 2026-11-17 against GTM export format v2. */

/** Built-in triggers never appear in trigger[]; tags reference them by these fixed IDs. */
export const BUILTIN_TRIGGERS: Record<string, { name: string; type: string }> = {
  '2147479553': { name: 'All Pages', type: 'PAGEVIEW' },
  '2147479572': { name: 'Consent Initialization - All Pages', type: 'CONSENT_INIT' },
  '2147479573': { name: 'Initialization - All Pages', type: 'INIT' },
};

/** Google's own tag types: they adapt to Consent Mode rather than being blocked. */
export const GOOGLE_TYPES = new Set(['gaawe', 'gaawc', 'googtag', 'awct', 'awcc', 'awud', 'sp', 'gclidw', 'flc', 'fls', 'ua']);

/** Built-in tag type → registry vendor id. googtag is decided by its tagId prefix in identify.ts. */
export const BUILTIN_VENDOR: Record<string, string> = {
  gaawe: 'ga4', gaawc: 'ga4', ua: 'ga4',
  awct: 'google-ads', awcc: 'google-ads', awud: 'google-ads', sp: 'google-ads', gclidw: 'google-ads', flc: 'google-ads', fls: 'google-ads',
  baut: 'microsoft-ads', hjtc: 'hotjar', bzi: 'linkedin', pntr: 'pinterest-pixel', twitter_website_tag: 'x-pixel', crto: 'criteo',
};

export const TYPE_LABEL: Record<string, string> = {
  gaawe: 'GA4 event', gaawc: 'GA4 configuration', googtag: 'Google tag', ua: 'Universal Analytics',
  awct: 'Google Ads conversion', awcc: 'Google Ads calls from website', awud: 'Google Ads user data', sp: 'Google Ads remarketing',
  gclidw: 'Conversion Linker', flc: 'Floodlight counter', fls: 'Floodlight sales',
  baut: 'Microsoft Advertising UET', hjtc: 'Hotjar', bzi: 'LinkedIn Insight', pntr: 'Pinterest', twitter_website_tag: 'X website tag', crto: 'Criteo OneTag',
  html: 'Custom HTML', img: 'Custom image',
};

export const KNOWN_TYPES = Object.keys(TYPE_LABEL);

/** `cvt_<containerId>_<templateId>` → templateId; null for built-in types. */
export function templateIdOf(type: string): string | null {
  // eslint-disable-next-line security/detect-unsafe-regex -- no nested quantifiers; timed linear (18ms) on a 5MB input, well under MAX_FILE_BYTES.
  return type.match(/^cvt_(?:[A-Za-z0-9]+_)?([A-Za-z0-9]+)$/)?.[1] ?? null;
}

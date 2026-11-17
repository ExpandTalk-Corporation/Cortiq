/**
 * Community Template Gallery repositories → registry vendor. Keys are lowercase `owner/repository`.
 * Verified on GitHub 2026-11-17. `official` = published by the vendor itself. Community authors with
 * many templates are matched on the full repository, never on the owner alone.
 */
export interface GalleryEntry { vendorId: string | null; official: boolean; covers?: 'utm' }

export const GALLERY: Record<string, GalleryEntry> = {
  'linkedin/linkedin-gtm-community-template': { vendorId: 'linkedin', official: true },
  'meta/googletagmanager-webtemplate-for-facebookpixel': { vendorId: 'meta', official: true },
  'facebookarchive/googletagmanager-webtemplate-for-facebookpixel': { vendorId: 'meta', official: true },
  'microsoft/clarity-gtm-template': { vendorId: 'clarity', official: true },
  'reddit/reddit-gtm-template': { vendorId: 'reddit', official: true },
  'tiktok/gtm-template-pixel': { vendorId: 'tiktok-pixel', official: true },
  'pinterest/ws-gtm-template': { vendorId: 'pinterest-pixel', official: true },
  'snapchat/snapchat-google-tag-manager': { vendorId: 'snap-pixel', official: true },
  'twitter/google-tag-manager-base-tag': { vendorId: 'x-pixel', official: true },
  'twitter/google-tag-manager-event-tag': { vendorId: 'x-pixel', official: true },
  'criteo/gtm-criteo-onetag': { vendorId: 'criteo', official: true },
  'criteo/gtm-criteo-loader': { vendorId: 'criteo', official: true },
  'leadfeeder/leadfeeder-google-tag-manager-template': { vendorId: 'leadfeeder', official: true },
  'capterra-public/gtm-gdm-tag': { vendorId: 'g2', official: true },
  'capterra-public/gtm-conversion-tag': { vendorId: 'g2', official: true },
  'capterra-public/gtm-conversion-tracking': { vendorId: 'g2', official: true },
  'openai/ads-measurement-pixel-gtm-template': { vendorId: 'openai-ads', official: true },
  'jude-nwachukwu/gtm-clay-web-intent-tag': { vendorId: 'claydar', official: false },
  'usercentrics/gtm-templates-cookiebot-cmp': { vendorId: 'cookiebot', official: true },
  'cybotcorp/gtm-templates-cookiebot-cmp': { vendorId: 'cookiebot', official: true },
  'cookieyeshq/cookieyes-gtm-template': { vendorId: 'cookieyes', official: true },
  'onetrustcmp/onetrust-gtm-template': { vendorId: 'onetrust', official: true },
  'usercentrics/gtm-templates-usercentrics-cmp': { vendorId: 'usercentrics', official: true },
  'cookie-information/ci-consent-mode-template-v2': { vendorId: 'cookie-information', official: true },
  'cookie-information/ci-consent-mode-template': { vendorId: 'cookie-information', official: true },
  'gtm-templates-simo-ahava/persist-campaign-data': { vendorId: null, official: false, covers: 'utm' },
};

export function galleryEntry(g: { owner: string; repository: string } | null): GalleryEntry | null {
  if (!g) return null;
  const key = `${g.owner}/${g.repository}`.toLowerCase();
  return Object.prototype.hasOwnProperty.call(GALLERY, key) ? GALLERY[key] : null;
}

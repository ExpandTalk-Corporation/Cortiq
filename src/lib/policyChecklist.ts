// What a site's privacy policy must cover for a given install. The install guide shows
// these items and logs the owner's confirmation (policy_confirmations) before it shows
// the snippet. Bump the version whenever the wording changes, so owners confirm again.
// Covers what CortIQ does on the owner's behalf; not a full GDPR art. 13 template.
// Pure module: the foundation tests import it from disk.

export const POLICY_CHECKLIST_VERSION = '2026-11-12';

export type TrackingMode = 'cookieless' | 'full';

export interface PolicyChecklistOptions {
  trackingMode: TrackingMode;
  /** Ad click IDs, hashed email and lead quality to Google Ads. Full mode only. */
  marketing: boolean;
}

export function policyChecklist({ trackingMode, marketing }: PolicyChecklistOptions): string[] {
  const items = [
    'Names your company as controller, with contact details (and your data protection officer, if you have one).',
    'Names CortIQ (Expandtalk Corporation AB) as your processor for website analytics.',
    'States the purpose, statistics on how the site is used, and the legal basis: the visitor\'s consent.',
    'Lists what is collected: pages viewed, referrer and campaign parameters, clicks and scroll depth (heatmaps), form conversions, and the IP address the browser sends with each request.',
  ];
  items.push('A session identifier stored in the browser\'s sessionStorage until the tab is closed (cookieless sites that choose memory only store nothing).');
  if (trackingMode === 'full') {
    items.push('Device details (browser, screen and window size, language, time zone, platform) used to recognise returning visitors across visits.');
  }
  if (trackingMode === 'full' && marketing) {
    items.push(
      'A separate purpose, measuring and optimising your Google Ads, based on the visitor\'s marketing consent.',
      'With marketing consent: ad click IDs from the landing URL (gclid, fbclid, msclkid, ttclid, li_fat_id).',
      'With marketing consent: a SHA-256 hash of the email entered in conversion forms, and the lead\'s quality from your CRM, sent by CortIQ on your behalf to Google Ads. The hash is still personal data. State Google\'s role and the safeguard for transfers outside the EU/EEA under your agreement with Google.',
    );
  }
  items.push(
    'Recipients: CortIQ and its sub-processors, and that some of them may access data from outside the EU/EEA, with the safeguards listed in CortIQ\'s privacy policy and DPA.',
    'States how long the data is kept.',
    'Explains how to withdraw consent at any time (the "Cookie settings" button or your own consent tool), without affecting earlier processing.',
    'Lists the visitor\'s rights (access, rectification, erasure, restriction, objection, portability) and the right to complain to a supervisory authority.',
  );
  return items;
}

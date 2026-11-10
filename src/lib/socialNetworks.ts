// Social network classification. Mirrors public.social_network / is_social_medium /
// is_paid_social_medium in supabase/migrations/20261117000002_social_overview.sql; the parity
// test in tests/foundation/social-overview.test.mjs runs both against the same cases.
// No enums or other non-erasable TS syntax: Node imports this file directly in tests.

export interface SocialNetwork {
  key: string;
  label: string;
  color: string;
  /** Host suffix patterns (regex source, matched as `(^|\.)(...)$`). */
  hosts: string;
  utmSources: string[];
}

export const SOCIAL_NETWORKS: SocialNetwork[] = [
  { key: 'facebook', label: 'Facebook', color: '#1877F2', hosts: 'facebook\\.com|fb\\.com|fb\\.me', utmSources: ['facebook', 'facebook.com', 'fb', 'meta'] },
  { key: 'instagram', label: 'Instagram', color: '#E4405F', hosts: 'instagram\\.com', utmSources: ['instagram', 'instagram.com', 'ig'] },
  { key: 'linkedin', label: 'LinkedIn', color: '#0A66C2', hosts: 'linkedin\\.com|lnkd\\.in', utmSources: ['linkedin', 'linkedin.com', 'lnkd', 'lnkd.in', 'li'] },
  { key: 'x', label: 'X (Twitter)', color: '#71717A', hosts: 'twitter\\.com|x\\.com|t\\.co', utmSources: ['twitter', 'twitter.com', 'x', 'x.com', 't.co', 'tw'] },
  { key: 'tiktok', label: 'TikTok', color: '#25F4EE', hosts: 'tiktok\\.com', utmSources: ['tiktok', 'tiktok.com', 'tt'] },
  { key: 'youtube', label: 'YouTube', color: '#FF0000', hosts: 'youtube\\.com|youtu\\.be', utmSources: ['youtube', 'youtube.com', 'yt'] },
  { key: 'pinterest', label: 'Pinterest', color: '#BD081C', hosts: 'pinterest\\.[a-z.]+|pin\\.it', utmSources: ['pinterest', 'pinterest.com', 'pin'] },
  { key: 'reddit', label: 'Reddit', color: '#FF4500', hosts: 'reddit\\.com|redd\\.it', utmSources: ['reddit', 'reddit.com'] },
  { key: 'threads', label: 'Threads', color: '#A1A1AA', hosts: 'threads\\.net|threads\\.com', utmSources: ['threads', 'threads.net', 'threads.com'] },
  { key: 'bluesky', label: 'Bluesky', color: '#1185FE', hosts: 'bsky\\.app|bsky\\.social', utmSources: ['bluesky', 'bsky', 'bsky.app'] },
  { key: 'mastodon', label: 'Mastodon', color: '#6364FF', hosts: 'mastodon\\.[a-z.]+|mstdn\\.[a-z.]+|mas\\.to', utmSources: ['mastodon'] },
  { key: 'snapchat', label: 'Snapchat', color: '#FFFC00', hosts: 'snapchat\\.com', utmSources: ['snapchat', 'snapchat.com', 'snap'] },
];

export const OTHER_SOCIAL: SocialNetwork = { key: 'other', label: 'Other social', color: '#94A3B8', hosts: '', utmSources: [] };

const HOST_RE = SOCIAL_NETWORKS.map((n) => [n.key, new RegExp(`(^|\\.)(${n.hosts})$`)] as const);

export const SOCIAL_MEDIUMS = [
  'social', 'social-network', 'social_network', 'social-media', 'social_media', 'socialmedia', 'sm', 'sm-organic',
  'organic-social', 'organic_social', 'paid-social', 'paid_social', 'paidsocial', 'social-paid', 'social_paid',
];
export const PAID_SOCIAL_MEDIUMS = ['cpc', 'ppc', 'paid-social', 'display', 'paid', 'paid_social', 'paidsocial', 'social-paid', 'social_paid', 'cpm', 'cpv'];

export function normaliseHost(host: string | null | undefined): string {
  const h = (host ?? '').trim().toLowerCase().replace(/^[a-z]+:\/\//, '');
  return h.split('/')[0].split('?')[0].split(':')[0].replace(/^(www|m|mobile|l|lm)\./, '');
}

/** Network key for a referrer host/URL and utm_source, or null if neither is social. utm_source wins. */
export function classifySocial(host: string | null | undefined, utmSource: string | null | undefined): string | null {
  const src = (utmSource ?? '').trim().toLowerCase();
  if (src) {
    const bySource = SOCIAL_NETWORKS.find((n) => n.utmSources.includes(src));
    if (bySource) return bySource.key;
  }
  const h = normaliseHost(host);
  if (!h) return null;
  for (const [key, re] of HOST_RE) if (re.test(h)) return key;
  return null;
}

export function isSocialMedium(medium: string | null | undefined): boolean {
  return SOCIAL_MEDIUMS.includes((medium ?? '').trim().toLowerCase());
}

export function isPaidSocialMedium(medium: string | null | undefined): boolean {
  return PAID_SOCIAL_MEDIUMS.includes((medium ?? '').trim().toLowerCase());
}

export function socialNetworkMeta(key: string): SocialNetwork {
  return SOCIAL_NETWORKS.find((n) => n.key === key) ?? { ...OTHER_SOCIAL, key, label: key === 'other' ? OTHER_SOCIAL.label : key };
}

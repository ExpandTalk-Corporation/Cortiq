// Self-reported source ("how did you hear about us?"), attribution layer 1.5.
// Spec: docs/superpowers/specs/2026-11-12-attribution-models-and-ai-influence.md.
//
// One fixed category list. The SQL CHECK on conversion_reported_channel.channel
// (is_reported_channel in 20261210000001_reported_channel.sql), the tracker (public/spa-tracking.js) and the
// dashboard (src/lib/reportedChannel.ts) are kept equal by tests/foundation/reported-channel.test.mjs.
// Customers map their answer values to these codes; there are no custom categories.

export const REPORTED_CHANNELS = [
  'organic_search',
  'paid_search',
  'paid_social',
  'social',
  'email',
  'referral',
  'direct',
  'ai_assistant',
  'podcast',
  'community',
  'event',
  'colleague_or_friend',
  'other',
] as const;

export type ReportedChannel = typeof REPORTED_CHANNELS[number];

export const REPORTED_CHANNEL_LABELS: Record<ReportedChannel, string> = {
  organic_search: 'Search engine',
  paid_search: 'Search ad',
  paid_social: 'Social media ad',
  social: 'Social media',
  email: 'Email or newsletter',
  referral: 'Another website',
  direct: 'Already knew the site',
  ai_assistant: 'AI assistant',
  podcast: 'Podcast',
  community: 'Community or forum',
  event: 'Event',
  colleague_or_friend: 'Colleague or friend',
  other: 'Other',
};

export const MAX_MAP_ENTRIES = 50;
export const MAX_ANSWER_LENGTH = 100;

export function isReportedChannel(v: unknown): v is ReportedChannel {
  return typeof v === 'string' && (REPORTED_CHANNELS as readonly string[]).includes(v);
}

/** The key an answer value is matched on: trimmed and lower-cased. */
export function answerKey(v: string): string {
  return v.trim().toLowerCase();
}

/** True when `map` has `key` as its own entry (never an inherited name such as `constructor`). */
export function hasAnswer(map: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(map, key);
}

/**
 * A site's value list, cleaned: keys normalised, only known categories, capped size.
 * Anything malformed yields an empty map (every answer then becomes `other`). The map has no
 * prototype, so an answer such as "__proto__" or "constructor" is an ordinary key.
 */
export function cleanChannelMap(raw: unknown): Record<string, ReportedChannel> {
  const out: Record<string, ReportedChannel> = Object.create(null);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_MAP_ENTRIES) break;
    const key = answerKey(k);
    if (!key || key.length > MAX_ANSWER_LENGTH || !isReportedChannel(v)) continue;
    out[key] = v;
  }
  return out;
}

/**
 * Deterministic mapping: trim + lower-case exact match against the site's value list, else `other`.
 * The raw value is only compared here; callers must never store, log or forward it.
 */
export function mapReportedChannel(value: unknown, map: Record<string, ReportedChannel>): ReportedChannel | null {
  if (typeof value !== 'string') return null;
  const key = answerKey(value);
  if (!key) return null;
  return hasAnswer(map, key) ? map[key] : 'other';
}

// src/lib/dashboard/builtinSegments.ts
// Built-in segments for the dashboard filter. The rules live in SQL
// (public.builtin_segment_match, migration 20261109000003); this file only names them.
// Pure and dependency-free so node --test can import it directly.

export const BUILTIN_PREFIX = 'builtin:';

export type BuiltinSegmentKey = 'mobile' | 'desktop' | 'tablet' | 'paid' | 'social' | 'organic' | 'ai' | 'direct';

export const BUILTIN_SEGMENTS: { key: BuiltinSegmentKey; label: string; description: string }[] = [
  { key: 'mobile', label: 'Mobile visits', description: 'Device type mobile.' },
  { key: 'desktop', label: 'Desktop visits', description: 'Device type desktop.' },
  { key: 'tablet', label: 'Tablet visits', description: 'Device type tablet.' },
  { key: 'organic', label: 'Organic search', description: 'Came from a search engine without a paid utm_medium.' },
  { key: 'paid', label: 'Paid traffic', description: 'Landing link has a paid utm_medium, as in Ads.' },
  { key: 'social', label: 'Social media', description: 'Same platforms as the Social media tab, paid social included.' },
  { key: 'ai', label: 'AI referrals', description: 'People who clicked a link in ChatGPT, Perplexity, Claude, Gemini, Copilot, You.com or Phind. AI bots are not visits and are not included.' },
  { key: 'direct', label: 'Direct', description: 'No referrer and no UTM tags.' },
];

export const builtinSegmentId = (key: BuiltinSegmentKey) => `${BUILTIN_PREFIX}${key}`;

/** The built-in segment for a filter segment id, or null for a UTM segment / no segment. */
export function builtinSegment(segmentId: string | null) {
  if (!segmentId?.startsWith(BUILTIN_PREFIX)) return null;
  const key = segmentId.slice(BUILTIN_PREFIX.length);
  return BUILTIN_SEGMENTS.find((s) => s.key === key) ?? null;
}

/** Quick filters that combine a date range with a built-in segment. */
export const SEGMENT_PRESETS: { id: string; label: string; range: 'last7' | 'last30'; segment: BuiltinSegmentKey }[] = [
  { id: 'organic30', label: 'Organic search, last 30 days', range: 'last30', segment: 'organic' },
  { id: 'paid30', label: 'Paid traffic, last 30 days', range: 'last30', segment: 'paid' },
  { id: 'social30', label: 'Social media, last 30 days', range: 'last30', segment: 'social' },
  { id: 'ai30', label: 'AI referrals, last 30 days', range: 'last30', segment: 'ai' },
  { id: 'mobile7', label: 'Mobile visits, last 7 days', range: 'last7', segment: 'mobile' },
];

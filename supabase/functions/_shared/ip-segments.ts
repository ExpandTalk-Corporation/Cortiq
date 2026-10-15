/**
 * IP Segment matching — shared across tracking Edge Functions.
 *
 * Looks up the first active ip_segment whose CIDR ranges contain the visitor IP.
 * Returns the segment label (name/category) so it can be stored in event metadata
 * WITHOUT storing the raw IP (compliant with eu_strict pipeline rules).
 *
 * Usage:
 *   import { matchIPSegment } from '../_shared/ip-segments.ts';
 *   const segment = await matchIPSegment(supabase, companyId, req);
 *   if (segment) metadata.ip_segment_name = segment.name;
 */

import type { SupabaseClient } from './supabase.ts';

export interface IPSegmentMatch {
  segment_id: string;
  segment_name: string;
  segment_category: 'own_company' | 'competitor' | 'partner' | 'exclude' | 'custom';
  segment_color: string;
  intranet_mode: boolean;
}

/**
 * Extract the best-guess client IP from the request.
 * Cloudflare injects CF-Connecting-IP; falls back to X-Forwarded-For.
 */
export function getClientIP(req: Request): string | null {
  return (
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    null
  );
}

/**
 * Match the visitor IP against the company's named segments.
 * Returns null if no segment matches, IP is missing, or on any error.
 * Never throws — safe to call in every tracking path.
 */
export async function matchIPSegment(
  supabase: SupabaseClient,
  companyId: string,
  req: Request,
): Promise<IPSegmentMatch | null> {
  const ip = getClientIP(req);
  if (!ip) return null;

  try {
    const { data, error } = await supabase.rpc('match_ip_segment', {
      p_company_id: companyId,
      p_ip: ip,
    });

    if (error || !data || data.length === 0) return null;

    const row = data[0];
    return {
      segment_id:       row.segment_id,
      segment_name:     row.segment_name,
      segment_category: row.segment_category,
      segment_color:    row.segment_color,
      intranet_mode:    row.intranet_mode,
    };
  } catch {
    return null;
  }
}

/**
 * Apply segment metadata to the event payload.
 * In intranet_mode the session_id is cleared (aggregate-only — no individual tracking).
 *
 * @returns { metadata, session_id } — updated copies; originals untouched
 */
export function applySegmentToEvent(
  segment: IPSegmentMatch,
  metadata: Record<string, unknown>,
  sessionId: string,
): { metadata: Record<string, unknown>; session_id: string } {
  const out = {
    ...metadata,
    ip_segment_id:       segment.segment_id,
    ip_segment_name:     segment.segment_name,
    ip_segment_category: segment.segment_category,
    ip_segment_color:    segment.segment_color,
  };

  // Intranet mode: drop individual session ID → aggregate-only
  const sid = segment.intranet_mode ? '' : sessionId;

  return { metadata: out, session_id: sid };
}

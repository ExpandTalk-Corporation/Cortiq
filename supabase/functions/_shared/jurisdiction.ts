/**
 * Jurisdiction & pipeline mode utility — shared across all tracking Edge Functions.
 *
 * Usage:
 *   import { getPipelineMode, sanitizeForMode, EU_COUNTRIES } from '../_shared/jurisdiction.ts';
 *
 *   const mode = await getPipelineMode(supabase, companyId, req);
 *   const safePayload = sanitizeForMode(mode, rawPayload);
 */

import type { SupabaseClient } from './supabase.ts';

export type PipelineMode = 'eu_strict' | 'global_standard' | 'permissive';

// EU + EEA + UK + Switzerland (all subject to GDPR-equivalent laws)
export const EU_COUNTRIES = new Set([
  'AT','BE','BG','CY','CZ','DE','DK','EE','ES','FI','FR','GR','HR',
  'HU','IE','IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK',
  'IS','LI','NO',  // EEA
  'GB',            // UK GDPR
  'CH',            // Swiss FADP
]);

/**
 * Resolve the visitor's country from the request.
 * Cloudflare (used by Supabase Edge Functions) injects CF-IPCountry automatically.
 * Falls back to X-Country header for local testing.
 */
export function getVisitorCountry(req: Request): string | null {
  return (
    req.headers.get('cf-ipcountry') ??
    req.headers.get('x-country') ??
    null
  );
}

/**
 * Returns the effective pipeline mode for a company + this specific request.
 * Calls the DB helper function `effective_pipeline_mode` which handles
 * the EU geo-override logic.
 *
 * Falls back to 'eu_strict' on any error — safe by default.
 */
export async function getPipelineMode(
  supabase: SupabaseClient,
  companyId: string,
  req: Request,
): Promise<PipelineMode> {
  const country = getVisitorCountry(req);

  try {
    const { data, error } = await supabase.rpc('effective_pipeline_mode', {
      p_company_id: companyId,
      p_visitor_country: country,
    });

    if (error || !data) {
      console.warn('[jurisdiction] RPC error, defaulting to eu_strict:', error?.message);
      return 'eu_strict';
    }

    return data as PipelineMode;
  } catch (e) {
    console.warn('[jurisdiction] Unexpected error, defaulting to eu_strict:', e);
    return 'eu_strict';
  }
}

/**
 * What each pipeline mode allows storing.
 * Use this as the source of truth in Edge Functions — do not duplicate these rules.
 */
export const PIPELINE_RULES: Record<PipelineMode, {
  storeRawIP: boolean;
  storeUserAgent: boolean;       // full UA string
  storeReferrer: boolean;        // full referrer URL
  storeSessionData: boolean;     // individual session rows
  storePageViews: boolean;       // individual page view rows
  storeHeatmapClicks: boolean;   // individual click coordinates
  maxRetentionDays: number;
  requiresConsentBanner: boolean;
  honorOptOut: boolean;
  legalNote: string;
}> = {
  eu_strict: {
    storeRawIP:          false,
    storeUserAgent:      false,
    storeReferrer:       true,   // referrer is not PII
    storeSessionData:    true,   // anonymised session IDs only
    storePageViews:      true,   // anonymised
    storeHeatmapClicks:  true,   // grid-snapped, no raw coordinates
    maxRetentionDays:    730,
    requiresConsentBanner: true,
    honorOptOut:         true,
    legalNote: 'GDPR (EU/EEA), UK GDPR, Swiss FADP, LGPD (Brazil), PIPL (China). ' +
               'Lawful basis: consent or legitimate interest (analytics). ' +
               'No IP or PII stored. Cookie banner required.',
  },

  global_standard: {
    storeRawIP:          true,   // CCPA allows; still hash before storing
    storeUserAgent:      true,
    storeReferrer:       true,
    storeSessionData:    true,
    storePageViews:      true,
    storeHeatmapClicks:  true,   // full coordinates allowed
    maxRetentionDays:    1095,   // 3 years
    requiresConsentBanner: false, // opt-out model, not opt-in
    honorOptOut:         true,   // CCPA "Do Not Sell" signal must be respected
    legalNote: 'CCPA/CPRA (California), PIPEDA (Canada), Australian Privacy Act. ' +
               'Opt-out model. EU visitors automatically upgrade to eu_strict. ' +
               'IP may be stored but should be hashed before persistence.',
  },

  permissive: {
    storeRawIP:          true,
    storeUserAgent:      true,
    storeReferrer:       true,
    storeSessionData:    true,
    storePageViews:      true,
    storeHeatmapClicks:  true,
    maxRetentionDays:    1825,   // 5 years
    requiresConsentBanner: false,
    honorOptOut:         false,
    legalNote: 'No specific privacy regulation identified. Full logging permitted. ' +
               'WARNING: Customer must confirm no GDPR/CCPA obligation applies. ' +
               'EU visitors are still upgraded to eu_strict via geo-override.',
  },
};

/**
 * Sanitize a raw tracking payload according to pipeline mode rules.
 * Call this before writing anything to the database.
 *
 * @param mode  - effective pipeline mode for this request
 * @param payload - raw incoming data
 * @returns sanitized copy — never mutates the original
 */
export function sanitizeForMode(
  mode: PipelineMode,
  payload: {
    ip?: string | null;
    user_agent?: string | null;
    referrer?: string | null;
    [key: string]: unknown;
  },
): typeof payload {
  const rules = PIPELINE_RULES[mode];
  const out = { ...payload };

  if (!rules.storeRawIP) {
    out.ip = anonymizeIP(payload.ip ?? null);
  }

  if (!rules.storeUserAgent) {
    // Keep only the coarse device category, drop the full UA string
    out.user_agent = null;
  }

  return out;
}

/** Anonymize an IPv4 or IPv6 address by zeroing the host portion. */
export function anonymizeIP(ip: string | null): string | null {
  if (!ip) return null;
  const first = ip.split(',')[0].trim();
  if (first.includes(':')) {
    // IPv6 — keep first 3 groups
    const parts = first.split(':');
    return parts.slice(0, 3).concat(['0', '0', '0', '0', '0']).join(':');
  }
  const octets = first.split('.');
  if (octets.length === 4) return `${octets[0]}.${octets[1]}.${octets[2]}.0`;
  return null;
}

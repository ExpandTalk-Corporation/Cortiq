/**
 * Bot detection — shared across all tracking Edge Functions.
 *
 * Usage:
 *   import { detectAndRecordBot } from '../_shared/bot-detection.ts';
 *
 *   const bot = await detectAndRecordBot(supabase, companyId, req, pipelineMode, pageUrl);
 *   if (bot) {
 *     metadata.is_bot       = true;
 *     metadata.bot_name     = bot.botName;
 *     metadata.bot_category = bot.botCategory;
 *   }
 *
 * GDPR compliance (per pipeline mode):
 *   eu_strict        — anonymized IP (last octet zeroed), NO raw UA stored
 *   global_standard  — anonymized IP, raw UA stored
 *   permissive       — raw IP, raw UA stored
 */

import type { SupabaseClient } from './supabase.ts';
import type { PipelineMode } from './jurisdiction.ts';
import { anonymizeIP } from './jurisdiction.ts';

export interface BotMatch {
  botCatalogId: string | null;
  botName: string;
  botDisplayName: string;
  botCategory: string;
  detectionMethod: 'ua_match' | 'ip_match' | 'behavioral' | 'combined';
  confidence: number;
}

/**
 * Derive a coarse, non-identifying UA category string.
 * Safe to store in all pipeline modes.
 * Examples: "Desktop Chrome", "Mobile Safari", "Headless Chrome"
 */
export function deriveUACategory(ua: string | null): string | null {
  if (!ua) return null;
  const u = ua.toLowerCase();

  if (u.includes('headlesschrome') || u.includes('phantomjs') || u.includes('puppeteer')) {
    return 'Headless Browser';
  }
  const browser =
    u.includes('firefox')       ? 'Firefox'  :
    u.includes('edg/')           ? 'Edge'     :
    u.includes('opr/')           ? 'Opera'    :
    u.includes('chrome/')        ? 'Chrome'   :
    u.includes('safari/')        ? 'Safari'   :
    u.includes('curl/')          ? 'curl'     :
    u.includes('python')         ? 'Python'   :
    u.includes('wget')           ? 'wget'     :
    'Other';

  const device =
    u.includes('mobile') || u.includes('android') || u.includes('iphone') ? 'Mobile' :
    u.includes('tablet') || u.includes('ipad')                             ? 'Tablet' :
    'Desktop';

  return `${device} ${browser}`;
}

/**
 * Extract the client IP from the request.
 * Cloudflare injects CF-Connecting-IP. Falls back to X-Forwarded-For.
 */
function getClientIP(req: Request): string | null {
  return (
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    null
  );
}

/**
 * Detect bot using the bot_catalog DB function (two layers: UA then IP).
 * Returns null if no match.
 */
async function matchBot(
  supabase: SupabaseClient,
  userAgent: string | null,
  ip: string | null,
): Promise<BotMatch | null> {
  try {
    const { data, error } = await supabase.rpc('match_bot', {
      p_user_agent: userAgent ?? null,
      p_ip:         ip ?? null,
    });

    if (error) {
      console.warn('[bot-detection] match_bot RPC error:', error.message);
      return null;
    }

    // match_bot returns a set (array) — take the first row
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;

    return {
      botCatalogId:   row.bot_catalog_id ?? null,
      botName:        row.bot_name,
      botDisplayName: row.bot_display_name,
      botCategory:    row.bot_category,
      detectionMethod: row.detection_method as BotMatch['detectionMethod'],
      confidence:     Number(row.confidence),
    };
  } catch (e) {
    console.warn('[bot-detection] Unexpected error in matchBot:', e);
    return null;
  }
}

/**
 * Layer 3 — Behavioral: detect high-frequency requests from the same anonymized IP.
 * Uses recent bot_detections rows — no separate rate-tracking table needed.
 *
 * Threshold: 30+ detections from same ip_anon within the last 5 minutes.
 * Returns a behavioral BotMatch if threshold exceeded; otherwise null.
 */
async function behavioralCheck(
  supabase: SupabaseClient,
  companyId: string,
  ipAnon: string | null,
): Promise<BotMatch | null> {
  if (!ipAnon) return null;

  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { count, error } = await supabase
      .from('bot_detections')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('ip_anon', ipAnon)
      .gte('detected_at', fiveMinutesAgo);

    if (error) return null;

    if ((count ?? 0) >= 30) {
      return {
        botCatalogId:    null,
        botName:         'unknown-high-frequency',
        botDisplayName:  'High-Frequency Bot (unidentified)',
        botCategory:     'generic_bot',
        detectionMethod: 'behavioral',
        confidence:      0.7,
      };
    }
  } catch (_e) {
    // Non-critical — skip behavioral layer on error
  }

  return null;
}

/**
 * Record a bot detection event into bot_detections and update hourly stats.
 * Applies GDPR field suppression based on pipelineMode:
 *   - eu_strict:        ip_anon = anonymized, raw_user_agent = null
 *   - global_standard:  ip_anon = anonymized, raw_user_agent = stored
 *   - permissive:       ip_anon = raw IP,     raw_user_agent = stored
 */
async function recordBotDetection(
  supabase: SupabaseClient,
  companyId: string,
  match: BotMatch,
  rawIP: string | null,
  rawUA: string | null,
  pipelineMode: PipelineMode,
  country: string | null,
  pageUrl: string | null,
  referrer: string | null,
): Promise<void> {
  const ipAnon =
    pipelineMode === 'permissive'
      ? rawIP   // raw IP allowed in permissive mode (customer confirmed no GDPR obligation)
      : anonymizeIP(rawIP);  // eu_strict and global_standard: anonymize

  const storedUA =
    pipelineMode === 'eu_strict'
      ? null   // no raw UA in eu_strict — fingerprinting risk
      : rawUA; // stored in global_standard / permissive

  const uaCategory = deriveUACategory(rawUA);

  // Fire both inserts concurrently — neither is critical path
  const detectionInsert = supabase.from('bot_detections').insert({
    company_id:       companyId,
    bot_catalog_id:   match.botCatalogId,
    bot_name:         match.botName,
    bot_category:     match.botCategory,
    detection_method: match.detectionMethod,
    confidence:       match.confidence,
    page_url:         pageUrl,
    referrer:         referrer,
    country:          country,
    ip_anon:          ipAnon,
    ua_category:      uaCategory,
    raw_user_agent:   storedUA,
    pipeline_mode:    pipelineMode,
  });

  const statsUpsert = supabase.rpc('upsert_bot_hourly_stats', {
    p_company_id:   companyId,
    p_bot_name:     match.botName,
    p_bot_category: match.botCategory,
  });

  const [detResult, statsResult] = await Promise.all([detectionInsert, statsUpsert]);

  if (detResult.error) {
    console.warn('[bot-detection] Failed to insert bot_detection:', detResult.error.message);
  }
  if (statsResult.error) {
    console.warn('[bot-detection] Failed to upsert bot_hourly_stats:', statsResult.error.message);
  }
}

/**
 * Main entry point.
 *
 * Detects bots using three layers (UA → IP → behavioral) and records the result.
 * Returns the BotMatch if detected, null if the request appears to be human.
 *
 * Non-blocking: catches all internal errors to avoid disrupting the main
 * tracking pipeline.
 */
export async function detectAndRecordBot(
  supabase: SupabaseClient,
  companyId: string,
  req: Request,
  pipelineMode: PipelineMode,
  pageUrl?: string | null,
  referrer?: string | null,
): Promise<BotMatch | null> {
  try {
    const rawUA  = req.headers.get('user-agent');
    const rawIP  = getClientIP(req);
    const country = (
      req.headers.get('cf-ipcountry') ??
      req.headers.get('x-country') ??
      null
    );

    // Layers 1 + 2 via DB function
    let match = await matchBot(supabase, rawUA, rawIP);

    // Layer 3: behavioral (only if layers 1+2 missed)
    if (!match) {
      const ipAnon = anonymizeIP(rawIP);
      match = await behavioralCheck(supabase, companyId, ipAnon);
    }

    if (!match) return null;

    // Record asynchronously — don't await to keep hot path fast
    recordBotDetection(
      supabase, companyId, match,
      rawIP, rawUA, pipelineMode,
      country, pageUrl ?? null, referrer ?? null,
    ).catch(e => console.warn('[bot-detection] recordBotDetection failed:', e));

    console.log(
      `[bot-detection] Detected ${match.botName} (${match.detectionMethod}, ` +
      `confidence=${match.confidence}) for company ${companyId}`,
    );

    return match;
  } catch (e) {
    // Never let bot detection crash the main pipeline
    console.warn('[bot-detection] Unexpected top-level error:', e);
    return null;
  }
}

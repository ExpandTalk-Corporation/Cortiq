/**
 * canary-tracker — receives requests to hidden canary URLs injected by spa-tracking.js.
 *
 * Two canary types:
 *   pixel (?v=px)  — <img> tag fetched automatically by bots that request images server-side.
 *                    A real browser fetches from the visitor's IP; a scraper fetches from its
 *                    own server IP — different source = proof of scraping.
 *   link  (?v=lk)  — <a href> followed by automated link-traversal bots.
 *
 * No auth required — canary URLs are designed to be publicly reachable.
 * Site ID is passed as query param ?s= (already public in the tracking script tag).
 *
 * GDPR:
 *   • Raw IP is never stored — anonymized (IPv4 last octet zeroed, IPv6 /48 prefix).
 *   • Raw User-Agent is never stored — only coarse category.
 *   • Legal basis: legitimate interest (fraud/bot detection).
 */

import { createClient } from '../_shared/supabase.ts';
import { anonymizeIP } from '../_shared/jurisdiction.ts';
import { deriveUACategory } from '../_shared/bot-detection.ts';
import { dispatchNotifications } from '../_shared/notify.ts';

// 1×1 transparent GIF — served for pixel requests.
const TRANSPARENT_GIF = new Uint8Array([
  0x47,0x49,0x46,0x38,0x39,0x61,0x01,0x00,0x01,0x00,0x80,0x00,0x00,
  0xff,0xff,0xff,0x00,0x00,0x00,0x21,0xf9,0x04,0x00,0x00,0x00,0x00,
  0x00,0x2c,0x00,0x00,0x00,0x00,0x01,0x00,0x01,0x00,0x00,0x02,0x02,
  0x44,0x01,0x00,0x3b,
]);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'GET')    return new Response(null, { status: 405 });

  try {
    const url = new URL(req.url);
    const siteId     = url.searchParams.get('s');
    const canaryType = url.searchParams.get('v') === 'lk' ? 'link' : 'pixel';

    // Token is the last path segment: /canary-tracker/<token>
    const token = url.pathname.split('/').pop() ?? '';

    // Always return a valid response — never reveal whether validation passed.
    // Logging is best-effort and happens asynchronously.
    if (!siteId || !token) return respond(canaryType);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Lightweight site existence check. spa-tracking.js sends the site UUID (older
    // versions did too, which this lookup used to miss); tk_ keys are still accepted.
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(siteId);
    const { data: site, error: siteError } = await supabase
      .from('sites')
      .select('id')
      .eq(isUuid ? 'id' : 'tracking_id', siteId)
      .single();

    if (siteError || !site) return respond(canaryType);

    // Extract request context
    const rawIP  = req.headers.get('cf-connecting-ip')
                ?? req.headers.get('x-forwarded-for')?.split(',')[0].trim()
                ?? null;
    const rawUA  = req.headers.get('user-agent') ?? null;
    const country  = req.headers.get('cf-ipcountry') ?? req.headers.get('x-country') ?? null;
    // Origin + path only: referrer query strings can carry tokens, emails, search terms.
    const referrer = (() => {
      const r = req.headers.get('referer');
      if (!r) return null;
      try { const u = new URL(r); return u.origin + u.pathname; } catch { return null; }
    })();

    // GDPR: anonymize before storing
    const ipAnon     = anonymizeIP(rawIP);
    const uaCategory = deriveUACategory(rawUA);

    // Persist hit + create incident — fire-and-forget so pixel response is immediate
    logAndAlert(supabase, site.id, token, canaryType, ipAnon, uaCategory, country, referrer)
      .catch(e => console.warn('[canary-tracker] logAndAlert error:', e));

    return respond(canaryType);

  } catch (e) {
    console.error('[canary-tracker] Unhandled error:', e);
    return respond('pixel');
  }
});

/**
 * Log the canary hit and create an incident if the site has an active canary_hit alert.
 * Runs asynchronously — does not block the pixel/link response.
 */
async function logAndAlert(
  supabase: ReturnType<typeof createClient>,
  siteId: string,
  token: string,
  canaryType: string,
  ipAnon: string | null,
  uaCategory: string | null,
  country: string | null,
  referrer: string | null,
): Promise<void> {
  // 1. Log to canary_hits
  const { error: insertError } = await supabase.from('canary_hits').insert({
    site_id:     siteId,
    token,
    canary_type: canaryType,
    ip_anon:     ipAnon,
    ua_category: uaCategory,
    country,
    referrer,
  });

  if (insertError) {
    console.warn('[canary-tracker] canary_hits insert error:', insertError.message);
    return;
  }

  // 2. Find active canary_hit alert rule for this site
  const { data: alert } = await supabase
    .from('behavioral_alerts')
    .select('id, severity')
    .eq('site_id', siteId)
    .eq('alert_type', 'canary_hit')
    .eq('is_active', true)
    .maybeSingle();

  if (!alert) return; // No rule configured — logged but no incident

  // 3. Create incident immediately (real-time detection)
  const incidentData = {
    type:         'canary_hit',
    canary_type:  canaryType,
    // Only first 8 chars of token — enough for correlation, not enough to guess others
    token_prefix: token.substring(0, 8),
    ip_anon:      ipAnon,
    ua_category:  uaCategory,
    country,
    referrer,
  };

  await supabase.from('behavioral_incidents').insert({
    site_id:       siteId,
    alert_id:      alert.id,
    incident_type: 'canary_hit',
    incident_data: incidentData,
    severity:      alert.severity,
    status:        'open',
  });

  console.log(
    `[canary-tracker] Incident created — site=${siteId} type=${canaryType} ` +
    `ua=${uaCategory} country=${country}`,
  );

  // Best-effort notification — fire-and-forget so pixel response is not delayed
  dispatchNotifications(supabase, siteId, 'canary_hit', alert.severity, incidentData)
    .catch(e => console.warn('[canary-tracker] notify error:', e));
}

function respond(canaryType: string): Response {
  if (canaryType === 'pixel') {
    return new Response(TRANSPARENT_GIF, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type':  'image/gif',
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'Pragma':        'no-cache',
      },
    });
  }
  // Link: 204 No Content — minimal, tells the crawler the endpoint exists
  return new Response(null, { status: 204, headers: corsHeaders });
}

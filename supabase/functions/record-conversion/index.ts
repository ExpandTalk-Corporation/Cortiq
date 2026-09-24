// First-party conversion ingest (P0 #2/#3).
// Creates a conversion_events row for a first-party conversion (e.g. a form
// submit), bridging the visitor's paid-click context so Enhanced Conversions can
// work — WITHOUT ever receiving a raw email.
//
// GDPR:
//  - The email is SHA-256 hashed IN THE BROWSER; only the hash reaches this
//    function. Raw email never touches CortIQ.
//  - gclid + click_id_consent_given are copied from the visitor's unified_visitors
//    row. upload_status is set so the Google Ads upload only ever sends rows where
//    consent was actually given at capture time.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getSessionConsent } from '../_shared/session-consent.ts';
import { resolveSite } from "../_shared/resolve-site.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const HEX64 = /^[a-f0-9]{64}$/i; // SHA-256 hex

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { siteId, sessionId, visitorId, hashedEmail, eventName, eventValue, contentId } = await req.json() as {
      siteId?: string; sessionId?: string; visitorId?: string; hashedEmail?: string;
      eventName?: string; eventValue?: number; contentId?: string;
    };

    if (typeof siteId !== 'string' || typeof sessionId !== 'string' || !siteId || !sessionId || sessionId.length > 255) {
      return json({ error: 'Valid siteId and sessionId are required' }, 400);
    }
    // Reject anything that isn't a bare SHA-256 hash — never accept a raw email.
    if (hashedEmail && !HEX64.test(hashedEmail)) return json({ error: 'hashedEmail must be a SHA-256 hex digest' }, 400);

    // Verify the site exists and is active.
    // siteId may be an account id (WordPress plugin); resolved via the browser Origin.
    const site = await resolveSite(supabase, siteId, req.headers.get('origin'), 'id, is_active, tracking_mode');
    if (!site || !site.is_active) return json({ error: 'Invalid or inactive site' }, 403);

    // Cookieless sites do not enable this identity-bearing conversion endpoint.
    // This technical restriction does not assert a legal exemption for other data.
    if ((site as { tracking_mode?: string }).tracking_mode === 'cookieless') {
      return json({ success: true, skipped: 'cookieless' });
    }

    const currentConsent = await getSessionConsent(supabase, site.id, sessionId);
    if (!currentConsent.analytics) return json({ error: 'Analytics consent required' }, 403);

    // SECURITY: per-site rate limit to blunt anonymous conversion-injection / dashboard pollution.
    const { data: underLimit, error: rlErr } = await supabase.rpc('check_rate_limit', {
      p_key: `conv:${site.id}`,
      p_max_count: 120,
      p_window_sec: 60,
    });
    if (!rlErr && underLimit === false) return json({ error: 'Rate limit exceeded' }, 429);

    // Look up the visitor's paid-click context. unified_visitors is keyed by the
    // unified visitor UUID (visitorId, returned by visitor-identification). There is
    // NO session_id column on unified_visitors — the browser session string is stored
    // as first_session_id, which we fall back to if visitorId is unavailable.
    let visitor: { gclid: string | null; click_id_consent_given: boolean | null } | null = null;
    if (currentConsent.marketing && visitorId) {
      const { data } = await supabase
        .from('unified_visitors')
        .select('gclid, click_id_consent_given')
        .eq('site_id', site.id)
        .eq('id', visitorId)
        .maybeSingle();
      visitor = data;
    }
    if (currentConsent.marketing && !visitor) {
      const { data } = await supabase
        .from('unified_visitors')
        .select('gclid, click_id_consent_given, updated_at')
        .eq('site_id', site.id)
        .eq('first_session_id', sessionId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      visitor = data;
    }

    const consent = currentConsent.marketing && visitor?.click_id_consent_given === true;
    const gclid: string | null = consent ? visitor?.gclid ?? null : null;

    // State machine: only rows with BOTH a gclid AND consent become uploadable.
    let uploadStatus: string;
    if (!gclid) uploadStatus = 'skipped_no_gclid';
    else if (!consent) uploadStatus = 'skipped_no_consent';
    else uploadStatus = 'pending';

    // Resolve the tracking_sessions UUID from the browser session string so campaign
    // attribution (aggregate_campaign_stats joins conversion_events.session_id =
    // tracking_sessions.id) actually finds this conversion. Best-effort: stays null if
    // no session row exists yet, which is no worse than before.
    let trackingSessionUuid: string | null = null;
    const { data: ts } = await supabase
      .from('tracking_sessions')
      .select('id')
      .eq('site_id', site.id)
      .eq('session_id', sessionId)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    trackingSessionUuid = ts?.id ?? null;

    const { data: inserted, error } = await supabase
      .from('conversion_events')
      .insert({
        site_id: site.id,
        session_id: trackingSessionUuid,
        event_type: 'form_submission',
        event_name: eventName || 'Conversion',
        event_value: typeof eventValue === 'number' ? eventValue : null,
        // GDPR: only persist the hashed email (used for Google Ads / HubSpot matching)
        // when marketing consent was given — same gate as gclid. The conversion itself
        // is still recorded without it.
        hashed_email: consent ? (hashedEmail ?? null) : null,
        gclid,
        click_id_consent_given: consent,
        upload_status: uploadStatus,
        form_data: { tracking_session_id: sessionId, ...(contentId ? { content_id: contentId } : {}) },
      })
      .select('id')
      .single();

    if (error) {
      // 23505 = unique_violation on uq_conversion_events_dedup: a duplicate submit in
      // the same session for the same event. Treat as success (idempotent) — the first
      // submit already recorded the conversion; don't double-count.
      if ((error as { code?: string }).code === '23505') {
        return json({ success: true, deduped: true, upload_status: uploadStatus });
      }
      console.error('record-conversion insert failed:', error.message);
      return json({ error: 'Failed to record conversion' }, 500);
    }

    return json({ success: true, conversion_id: inserted.id, upload_status: uploadStatus });
  } catch (_err) {
    return json({ error: 'Internal server error' }, 500);
  }
});

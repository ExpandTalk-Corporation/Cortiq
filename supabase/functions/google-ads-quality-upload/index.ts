// Google Ads Lead Quality Upload
// Uploads classified leads as offline click conversions (ConversionUploadService.UploadClickConversions)
// to the conversion action picked in Settings → Integrations → Google Ads. The value is the HubSpot
// quality value (Priority=300, Qualified=100); Challenge leads (value 0) are not uploaded, because any
// uploaded click conversion counts as a conversion for bidding.
// GDPR: only uploads leads where click_id_consent_given = true on the originating session and the
// session's consent is still current (analytics + marketing).
// Called as a scheduled daily batch (cron or manual trigger), x-cron-secret required.
// Credentials and target: the site's Google Ads OAuth connection (google_ads_connections +
// sealed refresh token, see _shared/google-ads.ts). The conversion action must be an enabled
// UPLOAD_CLICKS action picked by the site owner; a remarketing tag id ("AW-...",
// sites.google_ads_conversion_id) is never used. Without a picked action the site is skipped
// with status 'no_conversion_action' and its rows stay pending until one is picked.

import { createClient } from '../_shared/supabase.ts';
import { getSessionConsent } from '../_shared/session-consent.ts';
import { type AdsAuth, isAdsAuth, loadSiteAdsAuth, toAdsDateTime, uploadClickConversions } from '../_shared/google-ads.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ClickConversion {
  conversionAction: string;
  gclid: string;
  conversionDateTime: string;
  conversionValue: number;
  currencyCode: string;
  /** conversion_events.id: Google drops a second upload with the same order id. */
  orderId: string;
  consent: { adUserData: 'GRANTED' };
  userIdentifiers?: Array<{ hashedEmail: string }>;
}

async function uploadToGoogleAds(
  auth: AdsAuth,
  conversions: ClickConversion[]
): Promise<{ success: boolean; errors: string[] }> {
  try {
    const result = await uploadClickConversions(auth, conversions);
    const errors: string[] = (result?.partialFailureError?.details || []).map((d: any) => JSON.stringify(d).slice(0, 500));
    if (errors.length === 0 && result?.partialFailureError?.message) errors.push(String(result.partialFailureError.message).slice(0, 500));
    return { success: errors.length === 0, errors };
  } catch (e) {
    return { success: false, errors: [e instanceof Error ? e.message : String(e)] };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    // AuthZ: this function pushes conversion adjustments to customers' Google Ads
    // accounts, so it must not be triggerable by an arbitrary caller who merely
    // passed the JWT gateway. Require a shared cron secret. Fail closed if unset.
    const cronSecret = Deno.env.get('GOOGLE_ADS_UPLOAD_SECRET');
    if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // P2-5 recovery: reclaim rows stuck in 'uploading' from a previous run that crashed
    // between claim and the final status write. Anything claimed >30 min ago (or with no
    // claim timestamp, i.e. pre-migration) is stale — return it to 'pending' for retry.
    const staleCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    await supabase
      .from('conversion_events')
      .update({ upload_status: 'pending' })
      .eq('upload_status', 'uploading')
      .or(`upload_claimed_at.lt.${staleCutoff},upload_claimed_at.is.null`);

    // Accept either a site_id param or process all sites with pending uploads
    const url = new URL(req.url);
    const targetSiteId = url.searchParams.get('site_id');

    // Sites with a Google Ads connection (an account is picked). The conversion action is
    // checked per site below so a missing one is reported, not silently ignored.
    let sitesQuery = supabase
      .from('google_ads_connections')
      .select('site_id, conversion_action_id')
      .not('customer_id', 'is', null);

    if (targetSiteId) {
      sitesQuery = sitesQuery.eq('site_id', targetSiteId);
    }

    const { data: sites, error: sitesError } = await sitesQuery;
    if (sitesError) throw sitesError;

    const results: any[] = [];

    for (const row of (sites || [])) {
      const site = { id: (row as any).site_id as string };
      // Fetch pending conversions for this site.
      // GDPR: only rows where the visitor consented to click-ID/marketing at capture.
      const { data: candidates } = await supabase
        .from('conversion_events')
        .select('id')
        .eq('site_id', site.id)
        .eq('upload_status', 'pending')
        .eq('click_id_consent_given', true)
        .not('gclid', 'is', null)
        .not('quality_classified_at', 'is', null)
        .limit(100);

      if (!candidates || candidates.length === 0) continue;

      // Credentials only once there is something to send (no token refresh for idle sites).
      // Loaded before the claim so a missing connection leaves the rows pending.
      const auth = await loadSiteAdsAuth(supabase, site.id);
      if (!isAdsAuth(auth)) {
        results.push({ site_id: site.id, uploaded: 0, success: false, error: auth.code });
        continue;
      }
      // Digits only: it goes into a resource name.
      const conversionActionId = String(auth.conversionActionId ?? '');
      if (!/^\d{1,20}$/.test(conversionActionId)) {
        results.push({
          site_id: site.id, uploaded: 0, success: false, status: 'no_conversion_action', pending: candidates.length,
          error: 'No conversion action picked. Pick an "Import from clicks" conversion action in Settings → Integrations → Google Ads.',
        });
        continue;
      }

      // Atomically claim the rows (pending -> uploading) so a concurrent run (cron
      // + manual) can't upload the same conversions twice. Only rows we actually
      // claim proceed.
      const candidateIds = candidates.map(c => c.id);
      const { data: claimed } = await supabase
        .from('conversion_events')
        .update({ upload_status: 'uploading', upload_claimed_at: new Date().toISOString() })
        .in('id', candidateIds)
        .eq('upload_status', 'pending')
        .select('id, gclid, hashed_email, quality_value, quality_classified_at, created_at, form_data');

      if (!claimed || claimed.length === 0) continue;

      // Capture-time consent is necessary but insufficient: a queued conversion
      // must not be exported after withdrawal or expiry. Legacy rows without a
      // verifiable browser session are deliberately not exported.
      // Consent Mode v2 ad_user_data is not stored as its own field: the tracker
      // only records marketing=true when ad_storage AND ad_user_data are granted
      // (spa-tracking.js readGoogleConsent), so `marketing` is the ad_user_data gate.
      const pending = [];
      const now = new Date().toISOString();
      for (const conversion of claimed) {
        // Challenge leads (value 0) are not uploaded: a click conversion always counts as one.
        if (!(Number(conversion.quality_value) > 0)) {
          await supabase.from('conversion_events')
            .update({ upload_status: 'not_applicable', upload_claimed_at: null })
            .eq('id', conversion.id).eq('upload_status', 'uploading');
          continue;
        }
        const sessionId = conversion.form_data?.tracking_session_id;
        const current = typeof sessionId === 'string'
          ? await getSessionConsent(supabase, site.id, sessionId)
          : { analytics: false, marketing: false };
        if (current.analytics && current.marketing) {
          pending.push(conversion);
        } else {
          await supabase.from('conversion_events')
            .update({ upload_status: 'skipped_no_consent', upload_claimed_at: null })
            .eq('id', conversion.id).eq('upload_status', 'uploading');
        }
      }
      if (pending.length === 0) continue;

      // Build click conversions
      const conversionActionResource = `customers/${auth.customerId}/conversionActions/${conversionActionId}`;
      const conversions: ClickConversion[] = pending.map(ce => {
        const conversion: ClickConversion = {
          conversionAction: conversionActionResource,
          gclid: ce.gclid,
          conversionDateTime: toAdsDateTime(ce.created_at),
          conversionValue: Number(ce.quality_value),
          currencyCode: auth.currencyCode || 'USD',
          orderId: String(ce.id),
          // Uploads only happen with current marketing consent (ad_user_data, see above).
          consent: { adUserData: 'GRANTED' },
        };
        if (ce.hashed_email) {
          conversion.userIdentifiers = [{ hashedEmail: ce.hashed_email }];
        }
        return conversion;
      });

      const uploadResult = await uploadToGoogleAds(auth, conversions);

      const ids = pending.map(p => p.id);

      if (uploadResult.success) {
        await supabase
          .from('conversion_events')
          .update({ upload_status: 'uploaded', uploaded_to_ads_at: now })
          .in('id', ids);
      } else {
        await supabase
          .from('conversion_events')
          .update({ upload_status: 'failed' })
          .in('id', ids);
        console.error('Upload errors for site', site.id, uploadResult.errors);
      }

      // Log to security_audit_log if table exists
      try {
        await supabase.from('security_audit_log').insert({
          site_id: site.id,
          action: 'google_ads_quality_upload',
          details: {
            count: pending.length,
            conversion_action_id: conversionActionId,
            success: uploadResult.success,
            errors: uploadResult.errors,
          },
          created_at: now,
        });
      } catch (_) {}

      results.push({ site_id: site.id, uploaded: pending.length, success: uploadResult.success });
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('google-ads-quality-upload error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error', details: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

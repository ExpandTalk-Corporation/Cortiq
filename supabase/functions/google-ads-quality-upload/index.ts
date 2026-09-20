// Google Ads Lead Quality Upload
// Uploads classified leads to Google Ads Conversion Adjustments API (Enhanced Conversions).
// GDPR: only uploads leads where click_id_consent_given = true on the originating session.
// Called as a scheduled daily batch (cron or manual trigger from dashboard).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getSessionConsent } from '../_shared/session-consent.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ConversionAdjustment {
  conversionAction: string;
  adjustmentType: 'RESTATEMENT';
  adjustmentDateTime: string;
  gclidDateTimePair: {
    gclid: string;
    conversionDateTime: string;
  };
  restatementValue?: {
    adjustedValue: number;
    currencyCode: string;
  };
  userIdentifiers?: Array<{
    hashedEmail: string;
  }>;
}

async function uploadToGoogleAds(
  customerId: string,
  developerToken: string,
  accessToken: string,
  conversionActionId: string,
  adjustments: ConversionAdjustment[]
): Promise<{ success: boolean; errors: string[] }> {
  const url = `https://googleads.googleapis.com/v17/customers/${customerId}/conversionAdjustments:upload`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'developer-token': developerToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      conversionAdjustments: adjustments,
      partialFailure: true,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    return { success: false, errors: [err] };
  }

  const result = await response.json();
  const errors: string[] = (result.partialFailureError?.details || []).map((d: any) => JSON.stringify(d));
  return { success: errors.length === 0, errors };
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

    // Fetch sites with Google Ads config and pending leads
    let sitesQuery = supabase
      .from('sites')
      .select('id, google_ads_conversion_id, google_ads_developer_token, google_ads_customer_id, google_ads_access_token')
      .eq('google_ads_enabled', true);

    if (targetSiteId) {
      sitesQuery = sitesQuery.eq('id', targetSiteId);
    }

    const { data: sites, error: sitesError } = await sitesQuery;
    if (sitesError) throw sitesError;

    const results: any[] = [];

    for (const site of (sites || [])) {
      const { google_ads_conversion_id, google_ads_developer_token, google_ads_customer_id, google_ads_access_token } = site as any;

      if (!google_ads_conversion_id || !google_ads_developer_token || !google_ads_customer_id || !google_ads_access_token) {
        continue;
      }

      // Fetch pending conversions for this site.
      // GDPR: only rows where the visitor consented to click-ID/marketing at capture.
      const { data: candidates } = await supabase
        .from('conversion_events')
        .select('id, gclid, hashed_email, quality_value, quality_classified_at, created_at')
        .eq('site_id', site.id)
        .eq('upload_status', 'pending')
        .eq('click_id_consent_given', true)
        .not('gclid', 'is', null)
        .not('quality_classified_at', 'is', null)
        .limit(100);

      if (!candidates || candidates.length === 0) continue;

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
      const pending = [];
      for (const conversion of claimed) {
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

      // Build adjustments payload
      const conversionActionResource = `customers/${google_ads_customer_id}/conversionActions/${google_ads_conversion_id}`;
      const adjustments: ConversionAdjustment[] = pending.map(ce => {
        const adjustment: ConversionAdjustment = {
          conversionAction: conversionActionResource,
          adjustmentType: 'RESTATEMENT',
          adjustmentDateTime: new Date().toISOString().replace('T', ' ').split('.')[0] + '+00:00',
          gclidDateTimePair: {
            gclid: ce.gclid,
            conversionDateTime: new Date(ce.created_at).toISOString().replace('T', ' ').split('.')[0] + '+00:00',
          },
          restatementValue: {
            adjustedValue: ce.quality_value ?? 0,
            currencyCode: 'USD',
          },
        };
        if (ce.hashed_email) {
          adjustment.userIdentifiers = [{ hashedEmail: ce.hashed_email }];
        }
        return adjustment;
      });

      const uploadResult = await uploadToGoogleAds(
        google_ads_customer_id,
        google_ads_developer_token,
        google_ads_access_token,
        google_ads_conversion_id,
        adjustments
      );

      const now = new Date().toISOString();
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

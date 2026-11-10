// src/hooks/useAcquisitionReadiness.ts
// Live setup status for the Acquisition tabs (Social, Campaigns, Ads, Attribution, Click fraud).
// Every check is a cheap existence probe (limit 1) under RLS, over the last 30 days.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PAID_MEDIUMS } from '@/lib/paidMediums';

export { PAID_MEDIUMS };

export interface AcquisitionReadiness {
  trackingMode: 'cookieless' | 'full';
  aggregateMeasurement: boolean;
  ga4Connected: boolean;
  googleAdsApi: boolean;
  googleAdsCustomerId: boolean;
  hubspotLoop: boolean;
  goals: number;
  /** Seen in the last 30 days. */
  recent: { sessions: boolean; taggedSessions: boolean; paidSessions: boolean; conversions: boolean };
}

const exists = async (query: PromiseLike<{ data: unknown[] | null; error: unknown }>) => {
  const { data, error } = await query;
  if (error) throw error;
  return (data?.length ?? 0) > 0;
};

export function useAcquisitionReadiness(siteId: string | undefined) {
  return useQuery({
    queryKey: ['acquisition-readiness', siteId],
    enabled: !!siteId,
    staleTime: 60_000,
    queryFn: async (): Promise<AcquisitionReadiness> => {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const sessions = () => db.from('tracking_sessions').select('id').eq('site_id', siteId).gte('started_at', since).limit(1);

      const [site, googleAdsApi, anySession, tagged, paid, conversions] = await Promise.all([
        db.from('sites')
          .select('tracking_mode, aggregate_measurement, ga_integration_enabled, ga_property_id, google_ads_customer_id, hubspot_lead_webhook_enabled, conversion_goals')
          .eq('id', siteId)
          .maybeSingle(),
        // OAuth connection with a picked account (google_ads_connections, owner-readable via RLS).
        exists(db.from('google_ads_connections').select('site_id').eq('site_id', siteId)
          .not('customer_id', 'is', null).limit(1)),
        exists(sessions()),
        exists(sessions().not('utm_source', 'is', null)),
        exists(sessions().in('utm_medium', PAID_MEDIUMS)),
        exists(db.from('conversion_events').select('id').eq('site_id', siteId).gte('created_at', since).limit(1)),
      ]);
      if (site.error) throw site.error;
      const s = site.data ?? {};

      return {
        trackingMode: s.tracking_mode === 'cookieless' ? 'cookieless' : 'full',
        aggregateMeasurement: s.aggregate_measurement === true,
        ga4Connected: s.ga_integration_enabled === true && !!s.ga_property_id,
        googleAdsApi,
        googleAdsCustomerId: !!s.google_ads_customer_id,
        hubspotLoop: s.hubspot_lead_webhook_enabled === true,
        goals: Array.isArray(s.conversion_goals) ? s.conversion_goals.length : 0,
        recent: { sessions: anySession, taggedSessions: tagged, paidSessions: paid, conversions },
      };
    },
  });
}

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface GoogleAdsCampaign {
  campaign_id: string;
  campaign_name: string;
  status: string;
  channel_type: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  conversions_value: number;
  ctr: number;
  cpc: number;
  roas: number;
  conversion_rate: number;
}

export interface GoogleAdsTotals {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  conversions_value: number;
}

export type GoogleAdsDateRange = 'last_7_days' | 'last_30_days' | 'last_90_days';

export function useGoogleAdsData(siteId: string, dateRange: GoogleAdsDateRange = 'last_30_days') {
  const [campaigns, setCampaigns] = useState<GoogleAdsCampaign[]>([]);
  const [totals, setTotals] = useState<GoogleAdsTotals | null>(null);
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** google-ads-import error code: not_configured | not_connected | no_customer | token. */
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!siteId) return;

    // Connected through Settings → Integrations → Google Ads (google_ads_connections, owner RLS)
    // and an account picked for this site.
    const { data: connection } = await (supabase as any)
      .from('google_ads_connections')
      .select('customer_id')
      .eq('site_id', siteId)
      .not('customer_id', 'is', null)
      .maybeSingle();

    if (!connection) {
      setIsConfigured(false);
      setCampaigns([]);
      setTotals(null);
      return;
    }

    setIsConfigured(true);
    setLoading(true);
    setError(null);
    setErrorCode(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const supabaseUrl = (supabase as any).supabaseUrl as string;
      const res = await fetch(`${supabaseUrl}/functions/v1/google-ads-import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ site_id: siteId, date_range: dateRange }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        setErrorCode(typeof err.code === 'string' ? err.code : null);
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      const json = await res.json();
      setCampaigns(json.campaigns ?? []);
      setTotals(json.totals ?? null);
    } catch (err: any) {
      setError(err?.message ?? 'Could not fetch Google Ads data');
    } finally {
      setLoading(false);
    }
  }, [siteId, dateRange]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { campaigns, totals, isConfigured, loading, error, errorCode, refetch: fetchData };
}

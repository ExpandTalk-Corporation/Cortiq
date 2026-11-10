import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// A site's Google Ads OAuth connection. The row is owner-readable through RLS
// (google_ads_connections); the refresh token lives in google_ads_tokens, which the
// browser cannot read. All changes go through the google-ads-oauth Edge Function.

export interface GoogleAdsAccount {
  id: string;
  name: string | null;
  currency: string | null;
  time_zone: string | null;
  manager: boolean;
  login_customer_id: string | null;
}

/** An enabled "Import from clicks" (UPLOAD_CLICKS) conversion action of the picked account. */
export interface GoogleAdsConversionAction {
  id: string;
  name: string;
  type: string;
  status: string;
  category: string | null;
}

/** Does utm_campaign reach CortIQ? Account and campaign final URL suffixes (ad group/ad level not read). */
export interface GoogleAdsTrackingCheck {
  checked_at: string;
  auto_tagging: boolean | null;
  account_suffix: string | null;
  account_has_utm_campaign: boolean;
  campaigns_checked: number;
  campaigns_without_utm_count: number;
  campaigns_without_utm: { id: string; name: string }[];
  ok: boolean;
  suggested_suffix: string;
}

export interface GoogleAdsConnection {
  site_id: string;
  customer_id: string | null;
  login_customer_id: string | null;
  descriptive_name: string | null;
  currency_code: string | null;
  time_zone: string | null;
  accessible_customers: GoogleAdsAccount[];
  conversion_action_id: string | null;
  conversion_action_name: string | null;
  conversion_actions: GoogleAdsConversionAction[];
  tracking_check: GoogleAdsTrackingCheck | null;
  setup_checked_at: string | null;
  status: 'connected' | 'error';
  last_error: string | null;
  connected_at: string;
  updated_at: string;
}

type Action = 'authorize' | 'callback' | 'accounts' | 'select_customer' | 'refresh_setup' | 'select_conversion_action' | 'disconnect';

export async function googleAdsOAuth<T = any>(action: Action, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('google-ads-oauth', { body: { action, ...body } });
  if (error) {
    // FunctionsHttpError carries the JSON body in `context`.
    let message = error.message;
    try {
      const payload = await (error as any).context?.json?.();
      if (payload?.error) message = payload.error;
    } catch { /* keep the generic message */ }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

/** "1234567890" -> "123-456-7890", as Google Ads shows customer ids. */
export function formatCustomerId(id: string | null | undefined): string {
  return id ? id.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3') : '';
}

export function useGoogleAdsConnection(siteId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = ['google-ads-connection', siteId];

  const query = useQuery({
    queryKey,
    enabled: !!siteId,
    staleTime: 60_000,
    queryFn: async (): Promise<GoogleAdsConnection | null> => {
      const { data, error } = await (supabase as any)
        .from('google_ads_connections')
        .select('site_id, customer_id, login_customer_id, descriptive_name, currency_code, time_zone, accessible_customers, conversion_action_id, conversion_action_name, conversion_actions, tracking_check, setup_checked_at, status, last_error, connected_at, updated_at')
        .eq('site_id', siteId)
        .maybeSingle();
      if (error) throw error;
      return (data as GoogleAdsConnection | null) ?? null;
    },
  });

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['google-ads-connection', siteId] });
    queryClient.invalidateQueries({ queryKey: ['acquisition-readiness', siteId] });
  }, [queryClient, siteId]);

  return {
    connection: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    /** Connected and an account is picked: reports can run. */
    ready: !!query.data?.customer_id,
    /** Lead-quality uploads have a target conversion action. */
    uploadReady: !!query.data?.customer_id && !!query.data?.conversion_action_id,
    refresh,
  };
}

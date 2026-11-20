import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDashboardFilters } from '@/contexts/DashboardFiltersContext';
import { parseReportedChannel, cleanChannelMap, type ReportedChannelSummary, type ReportedChannel } from '@/lib/reportedChannel';

/** Aggregate self-reported source for the global date range. Never reads conversion rows. */
export function useReportedChannel(siteId: string) {
  const { filters } = useDashboardFilters();
  const p_from = filters.from;
  const p_to = filters.to;
  return useQuery({
    queryKey: ['reported-channel', siteId, p_from, p_to],
    queryFn: async (): Promise<ReportedChannelSummary> => {
      // Newer than the generated types; cast at the boundary.
      const { data, error } = await (supabase as any).rpc('get_reported_channel', { p_site_id: siteId, p_from, p_to });
      if (error) throw error;
      return parseReportedChannel(data);
    },
    enabled: !!siteId,
  });
}

export interface ReportedChannelConfig {
  policyVersion: string | null;
  hubspotProperty: string | null;
  hubspotMap: Record<string, ReportedChannel>;
  formField: string | null;
  formMap: Record<string, ReportedChannel>;
  /** Banner policy version from Consent settings, used to prefill. */
  bannerPolicyVersion: string | null;
  hubspotQualityProperty: string | null;
  trackingMode: string | null;
}

/** The site's self-reported source settings (sites columns) and the banner policy version. */
export function useReportedChannelConfig(siteId: string) {
  return useQuery({
    queryKey: ['reported-channel-config', siteId],
    queryFn: async (): Promise<ReportedChannelConfig> => {
      const [site, gdpr] = await Promise.all([
        (supabase as any).from('sites')
          .select('reported_channel_policy_version, reported_channel_hubspot_property, reported_channel_hubspot_map, reported_channel_form_field, reported_channel_form_map, hubspot_quality_property, tracking_mode')
          .eq('id', siteId).maybeSingle(),
        supabase.from('gdpr_settings').select('policy_version').eq('site_id', siteId).maybeSingle(),
      ]);
      if (site.error) throw site.error;
      const s = site.data ?? {};
      return {
        policyVersion: s.reported_channel_policy_version ?? null,
        hubspotProperty: s.reported_channel_hubspot_property ?? null,
        hubspotMap: cleanChannelMap(s.reported_channel_hubspot_map),
        formField: s.reported_channel_form_field ?? null,
        formMap: cleanChannelMap(s.reported_channel_form_map),
        bannerPolicyVersion: (gdpr.data as any)?.policy_version ?? null,
        hubspotQualityProperty: s.hubspot_quality_property ?? null,
        trackingMode: s.tracking_mode ?? null,
      };
    },
    enabled: !!siteId,
  });
}

export function isReportedChannelConfigured(c: ReportedChannelConfig | undefined): boolean {
  return !!c?.policyVersion && (!!c.hubspotProperty || !!c.formField);
}

export interface ReportedChannelUpdate {
  reported_channel_policy_version: string | null;
  reported_channel_hubspot_property: string | null;
  reported_channel_hubspot_map: Record<string, ReportedChannel>;
  reported_channel_form_field: string | null;
  reported_channel_form_map: Record<string, ReportedChannel>;
}

export function useUpdateReportedChannelConfig(siteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (update: ReportedChannelUpdate) => {
      const { error } = await (supabase as any).from('sites').update(update).eq('id', siteId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reported-channel-config', siteId] });
      qc.invalidateQueries({ queryKey: ['reported-channel', siteId] });
    },
  });
}

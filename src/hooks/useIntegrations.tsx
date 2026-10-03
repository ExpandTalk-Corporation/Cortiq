import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Site } from '@/types/dashboard';

export type IntegrationConfig = {
  // Tracking mode: cookieless (no fingerprint/profile, still consent-gated) vs full (fingerprint + returning-visitor)
  tracking_mode?: 'cookieless' | 'full';

  // Cloudflare edge analytics (pull model)
  cloudflare_enabled?: boolean;
  cloudflare_zone_id?: string;

  // Heatmap Analytics
  heatmap_tracking_enabled?: boolean;
  
  // Existing Google Analytics
  ga_integration_enabled?: boolean;
  ga_measurement_id?: string;
  ga_property_id?: string;
  ga_enhanced_ecommerce?: boolean;
  
  // WordPress & CMS
  sitekit_integration_enabled?: boolean;
  sitekit_auto_sync?: boolean;
  sitekit_sync_interval?: number;
  
  // Analytics
  hotjar_enabled?: boolean;
  hotjar_site_id?: string;
  microsoft_clarity_enabled?: boolean;
  microsoft_clarity_project_id?: string;
  mixpanel_enabled?: boolean;
  mixpanel_token?: string;
  
  // Marketing
  google_ads_enabled?: boolean;
  google_ads_conversion_id?: string;
  google_ads_developer_token?: string;
  facebook_pixel_enabled?: boolean;
  facebook_pixel_id?: string;
  facebook_conversion_api_token?: string;
  tiktok_pixel_enabled?: boolean;
  tiktok_pixel_id?: string;
  tiktok_events_api_token?: string;
  linkedin_insight_enabled?: boolean;
  linkedin_partner_id?: string;
  linkedin_conversion_api_token?: string;
  shopify_enabled?: boolean;
  shopify_store_url?: string;
  shopify_access_token?: string;
  hubspot_enabled?: boolean;
  hubspot_hub_id?: string;
  
  // Tag Managers
  gtm_enabled?: boolean;
  gtm_container_id?: string;
  adobe_tag_manager_enabled?: boolean;
  adobe_container_id?: string;
  
  // Marketing Automation
  salesforce_pardot_enabled?: boolean;
  salesforce_account_id?: string;
  oracle_eloqua_enabled?: boolean;
  oracle_site_id?: string;
  activecampaign_enabled?: boolean;
  activecampaign_account?: string;
  marketo_enabled?: boolean;
  marketo_munchkin_id?: string;
};

export function useIntegrations(siteId: string) {
  return useQuery({
    queryKey: ['integrations', siteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sites')
        .select('*')
        .eq('id', siteId)
        .single();

      if (error) throw error;
      return data as Site;
    },
    enabled: !!siteId,
  });
}

export function useUpdateIntegrations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ siteId, config }: { siteId: string; config: Partial<IntegrationConfig> }) => {
      const { data, error } = await supabase
        .from('sites')
        .update(config)
        .eq('id', siteId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['integrations', data.id] });
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      toast({
        title: "Integration updated",
        description: "Settings have been saved."
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Could not update integration.",
        variant: "destructive"
      });
    }
  });
}

export type IntegrationCategory = 'wordpress' | 'analytics' | 'marketing' | 'automation' | 'tag_manager';

export interface IntegrationItem {
  key: string;
  name: string;
  category: IntegrationCategory;
  enabledField: keyof IntegrationConfig;
  configField?: keyof IntegrationConfig;
  placeholder?: string;
  secondaryConfigField?: keyof IntegrationConfig;
  secondaryPlaceholder?: string;
  description?: string;
  isActive?: boolean;
  isWordPress?: boolean;
  highRisk?: boolean;
  // Compliance risk from out-of-EU transfer, cookie lifetime and data sensitivity.
  riskLevel?: 'low' | 'medium' | 'high';
}
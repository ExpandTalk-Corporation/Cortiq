import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Download, Globe, Settings, Zap, Plus, ChevronDown, Link } from 'lucide-react';
import { InstallationGuide } from '@/components/dashboard/InstallationGuide';
import { AddSiteForm } from '@/components/dashboard/AddSiteForm';
import { SiteSelector } from '@/components/dashboard/SiteSelector';
import { AgentMacroManager } from '@/components/dashboard/AgentMacroManager';
import { DeleteSiteDialog } from '@/components/dashboard/DeleteSiteDialog';
import PluginDownloader from '@/components/PluginDownloader';
import { PLUGIN_VERSION } from '@/lib/plugin-version';
import { useSites } from '@/hooks/useSites';
import { useNavigate } from 'react-router-dom';
import type { Site } from '@/types/dashboard';

interface SetupTabProps {
  selectedSite: Site | null;
  onSiteDeleted?: () => void;
}

export function SetupTab({ selectedSite, onSiteDeleted }: SetupTabProps) {
  const { sites, setSelectedSite, loadSites, deleteSite } = useSites();
  const navigate = useNavigate();

  // Derive from THIS deployment's env/origin — never hardcode cortiq.se / the origin
  // Supabase, or self-hosters ship data into the origin project.
  const apiBase = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
  const scriptSrc = `${window.location.origin}/spa-tracking.js`;

  return (
    <div className="space-y-6">
      {/* Site Management Section */}
      <div className="grid gap-6">
        {/* Add Website Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-green-600" />
              Add website
            </CardTitle>
            <p className="text-muted-foreground">
              Register a new website to start tracking analytics and heatmaps
            </p>
          </CardHeader>
          <CardContent>
            <AddSiteForm onSiteAdded={loadSites} />
          </CardContent>
        </Card>

        {/* Site Selection */}
        {sites.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-blue-600" />
                Select active website
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SiteSelector
                sites={sites}
                selectedSite={selectedSite}
                onSiteSelect={setSelectedSite}
              />
              {selectedSite && (
                <div className="mt-4 pt-4 border-t border-destructive/20">
                  <p className="text-sm text-muted-foreground mb-2">
                    Danger zone — permanently delete{' '}
                    <span className="font-medium text-foreground">{selectedSite.domain}</span>{' '}
                    and all of its data.
                  </p>
                  <DeleteSiteDialog
                    site={selectedSite}
                    deleteSite={deleteSite}
                    onDeleted={() => { loadSites(); onSiteDeleted?.(); }}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* WordPress Plugin Section */}
      <Collapsible>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="hover:bg-muted/50 cursor-pointer">
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Download className="h-5 w-5 text-primary" />
                  WordPress Plugin — CortIQ by Expandtalk Corporation AB
                </div>
                <ChevronDown className="h-4 w-4" />
              </CardTitle>
              <p className="text-muted-foreground">
                Download the WordPress plugin developed by Expandtalk Corporation AB for easy installation on your website.
              </p>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              <PluginDownloader trackingId={selectedSite?.tracking_id} />
              
              <div className="mt-6 space-y-4">
                <h3 className="text-lg font-semibold">Installation & Configuration</h3>
                <div className="bg-muted p-4 rounded-lg space-y-2">
                  <div><strong>Tracking ID:</strong> {selectedSite?.tracking_id || 'Select a website first'}</div>
                  <div><strong>Supabase integration:</strong> <span className="text-green-600">Ready to use</span></div>
                  <div><strong>Google Analytics:</strong> Enter your GA4 Measurement ID in settings</div>
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Headless CMS & Enterprise Installation */}
      <Collapsible>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="hover:bg-muted/50 cursor-pointer">
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-purple-600" />
                  Headless CMS & Enterprise Installation
                </div>
                <ChevronDown className="h-4 w-4" />
              </CardTitle>
              <p className="text-muted-foreground">
                Installation for Headless CMS systems and Adobe Enterprise Manager
              </p>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-6">
              {/* Headless CMS Section */}
              <div className="border-l-4 border-purple-500 pl-4 space-y-3">
                <h3 className="text-lg font-semibold text-purple-700">Headless CMS Installation</h3>
                <p className="text-sm text-muted-foreground">
                  For modern headless CMS solutions such as Strapi, Contentful, or Sanity
                </p>
                
                <div className="bg-purple-50 p-4 rounded-lg space-y-3">
                  <h4 className="font-medium">1. Integrate the tracking script</h4>
                  <div className="bg-gray-900 text-green-400 p-3 rounded text-sm font-mono overflow-x-auto">
                    {`<!-- Add to your template or layout file -->
<script>
  window.cortiqConfig = {
    apiUrl: '${apiBase}',
    siteId: '${selectedSite?.id || 'your-site-id'}',
    apiKey: '${selectedSite?.tracking_id || 'your-tracking-id'}',
    contentType: 'page',
    platform: 'web',
    cookieless: true
  };
</script>
<script src="${scriptSrc}" defer></script>`}
                  </div>

                  <h4 className="font-medium">2. API integration for content management</h4>
                  <div className="bg-gray-900 text-green-400 p-3 rounded text-sm font-mono overflow-x-auto">
                    {`// REST API for cookie-free analytics
GET /wp-json/heatmap/v2/cookiefree-analytics
Headers: X-API-Key: your-api-key

// For GDPR-compliant tracking
POST /wp-json/heatmap/v2/track-gdpr
Content-Type: application/json
{
  "site_id": "${selectedSite?.id || 'site-uuid'}",
  "event_type": "page_view",
  "consent_given": true
}`}
                  </div>
                  
                  <h4 className="font-medium">3. Configuration for popular CMS</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-muted text-foreground p-3 rounded border">
                      <strong className="text-blue-600">Strapi</strong>
                      <p className="text-sm mt-1">Use the plugin system to integrate tracking into all pages automatically</p>
                    </div>
                    <div className="bg-muted text-foreground p-3 rounded border">
                      <strong className="text-green-600">Contentful</strong>
                      <p className="text-sm mt-1">Integrate via webhooks and custom delivery API</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Adobe Enterprise Manager Section */}
              <div className="border-l-4 border-red-500 pl-4 space-y-3">
                <h3 className="text-lg font-semibold text-red-700">Adobe Enterprise Manager (AEM)</h3>
                <p className="text-sm text-muted-foreground">
                  Enterprise solution for Adobe Experience Manager and Adobe Analytics integration
                </p>
                
                <div className="bg-red-50 p-4 rounded-lg space-y-3">
                  <h4 className="font-medium">1. AEM Component Integration</h4>
                  <div className="bg-gray-900 text-green-400 p-3 rounded text-sm font-mono overflow-x-auto">
                    {`<!-- AEM Component Template (HTL) -->
<div data-sly-use.analytics="com.expandtalk.analytics.AnalyticsComponent">
  <script data-sly-unwrap>
    window.cortiqConfig = {
      apiUrl: '${apiBase}',
      siteId: '\${analytics.siteId}',
      apiKey: '\${analytics.trackingId}',
      contentType: 'page', platform: 'web', cookieless: true
    };
  </script>
  <script src="${scriptSrc}" defer></script>
</div>`}
                  </div>
                  
                  <h4 className="font-medium">2. OSGi Service Configuration</h4>
                  <div className="bg-gray-900 text-green-400 p-3 rounded text-sm font-mono overflow-x-auto">
                    {`// AnalyticsService.java
@Component(service = AnalyticsService.class)
public class AnalyticsServiceImpl implements AnalyticsService {
    
    @Reference
    private ConfigurationAdmin configAdmin;
    
    public String getTrackingId() {
        return "${selectedSite?.tracking_id || 'configure-tracking-id'}";
    }

    public void trackEvent(String eventType, Map<String, Object> data) {
        // GDPR-compliant event tracking
        HttpClient client = HttpClient.newBuilder().build();
        // Implementation...
    }
}`}
                  </div>
                  
                  <h4 className="font-medium">3. Adobe Analytics Bridge</h4>
                  <div className="bg-muted text-foreground p-3 rounded border">
                    <p className="text-sm">
                      <strong>Hybrid approach:</strong> Use CortIQ for heatmaps and detailed user interaction,
                      while Adobe Analytics handles higher-level metrics. Data can be synchronized via API.
                    </p>
                  </div>
                  
                  <h4 className="font-medium">4. Enterprise Security Configuration</h4>
                  <div className="bg-yellow-50 p-3 rounded border-l-4 border-yellow-400">
                    <p className="text-sm">
                      <strong>Important:</strong> For enterprise environments, contact support for a dedicated Supabase instance,
                      custom CORS policies, and IP whitelisting for secure data transfer.
                    </p>
                  </div>
                </div>
              </div>

              {/* Support Contact */}
              <div className="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-500">
                <h4 className="font-medium text-blue-800">Enterprise Support</h4>
                <p className="text-sm text-blue-700 mt-1">
                  For advanced integration with Headless CMS or Adobe Enterprise Manager,
                  contact our enterprise team for a tailored implementation and support.
                </p>
                <Button className="mt-2" variant="outline" size="sm">
                  Contact Enterprise Support
                </Button>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Installation Guide */}
      <InstallationGuide selectedSite={selectedSite} />
      
      {/* Agent Browser Macros */}
      {selectedSite && <AgentMacroManager siteId={selectedSite.id} />}

      {/* WordPress plugin — latest release */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-orange-500" />
            🆕 WordPress plugin — v{PLUGIN_VERSION}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3">
            <div className="flex items-start gap-2">
              <span className="text-green-500">✅</span>
              <div>
                <strong>Cookieless mode</strong> — no fingerprint or persistent IDs, still consent-gated (per-site toggle)
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-500">✅</span>
              <div>
                <strong>GA4 Consent Mode v2</strong> — deny-by-default with all six v2 signals
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-500">✅</span>
              <div>
                <strong>Geo-gating</strong> — optionally show the consent banner only in the EEA/UK/CH
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-500">✅</span>
              <div>
                <strong>Internationalized banner</strong> — English, Swedish, German, French, Portuguese
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-500">✅</span>
              <div>
                <strong>GDPR-safe UX</strong> — static reopen pill, banner close (X) saves necessary-only, reject respected for the full cooldown
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Always remove any older CortIQ / Heatmap plugin before activating this one.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
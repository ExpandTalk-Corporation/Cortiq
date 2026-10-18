import React, { lazy, Suspense } from 'react';
import { TabErrorBoundary } from './TabErrorBoundary';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { OverviewTab } from './tabs/OverviewTab';
import { FilterScopeNotice } from './FilterScopeNotice';
import { HIDDEN_TABS } from './nav/navSections';
import type { Site, Analytics } from '@/types/dashboard';

const HeatmapTab               = lazy(() => import('./tabs/HeatmapTab').then(m => ({ default: m.HeatmapTab })));
const AnalyticsTab             = lazy(() => import('./tabs/AnalyticsTab').then(m => ({ default: m.AnalyticsTab })));
const PaidAdsTab               = lazy(() => import('./tabs/PaidAdsTab').then(m => ({ default: m.PaidAdsTab })));
const ServerSidePaidAdsTab     = lazy(() => import('./tabs/ServerSidePaidAdsTab').then(m => ({ default: m.ServerSidePaidAdsTab })));
const FormAnalyticsTab         = lazy(() => import('./tabs/FormAnalyticsTab').then(m => ({ default: m.FormAnalyticsTab })));
const AITab                    = lazy(() => import('./tabs/AITab').then(m => ({ default: m.AITab })));
const AIBotTab                 = lazy(() => import('./tabs/AIBotTab').then(m => ({ default: m.AIBotTab })));
const KPITab                   = lazy(() => import('./tabs/KPITab').then(m => ({ default: m.KPITab })));
const KPICatalogTab            = lazy(() => import('./tabs/KPICatalogTab').then(m => ({ default: m.KPICatalogTab })));
const SegmentsTab              = lazy(() => import('./tabs/SegmentsTab').then(m => ({ default: m.SegmentsTab })));
const SetupTab                 = lazy(() => import('./tabs/SetupTab').then(m => ({ default: m.SetupTab })));
const ExternalIntegrationsTab  = lazy(() => import('./tabs/ExternalIntegrationsTab').then(m => ({ default: m.ExternalIntegrationsTab })));
const CookiefreeAnalyticsTab   = lazy(() => import('./tabs/CookiefreeAnalyticsTab').then(m => ({ default: m.CookiefreeAnalyticsTab })));
const ApiKeysTab               = lazy(() => import('./tabs/ApiKeysTab').then(m => ({ default: m.ApiKeysTab })));
const ApiKeyManager            = lazy(() => import('./ApiKeyManager'));
const MCPServerConfig          = lazy(() => import('./MCPServerConfig').then(m => ({ default: m.MCPServerConfig })));
const GDPRTab                  = lazy(() => import('./tabs/GDPRTab').then(m => ({ default: m.GDPRTab })));
const NavigationTab            = lazy(() => import('./tabs/NavigationTab').then(m => ({ default: m.NavigationTab })));
const BehavioralAlertsTab      = lazy(() => import('./tabs/BehavioralAlertsTab').then(m => ({ default: m.BehavioralAlertsTab })));
const UserLTVTab               = lazy(() => import('./tabs/UserLTVTab').then(m => ({ default: m.UserLTVTab })));
const ClickFraudTab            = lazy(() => import('./tabs/ClickFraudTab').then(m => ({ default: m.ClickFraudTab })));
const TagManager               = lazy(() => import('./TagManager').then(m => ({ default: m.TagManager })));
const GeolocationDashboard     = lazy(() => import('./GeolocationDashboard').then(m => ({ default: m.GeolocationDashboard })));
const WarehouseConnectorManager = lazy(() => import('./WarehouseConnectorManager').then(m => ({ default: m.WarehouseConnectorManager })));
const IPSegmentsTab                = lazy(() => import('./tabs/IPSegmentsTab').then(m => ({ default: m.IPSegmentsTab })));
const AgentOpsTab                  = lazy(() => import('./tabs/AgentOpsTab').then(m => ({ default: m.AgentOpsTab })));
const ZeroClickRiskIndex           = lazy(() => import('./ZeroClickRiskIndex').then(m => ({ default: m.ZeroClickRiskIndex })));
const HighImpressionLowCTR        = lazy(() => import('./HighImpressionLowCTR').then(m => ({ default: m.HighImpressionLowCTR })));
const AIVisibilityTab              = lazy(() => import('./tabs/AIVisibilityTab').then(m => ({ default: m.AIVisibilityTab })));
const NotificationChannelsConfig   = lazy(() => import('./NotificationChannelsConfig').then(m => ({ default: m.NotificationChannelsConfig })));
const SocialMediaTab               = lazy(() => import('./tabs/SocialMediaTab').then(m => ({ default: m.SocialMediaTab })));
const UTMSegmentsTab               = lazy(() => import('./tabs/UTMSegmentsTab').then(m => ({ default: m.UTMSegmentsTab })));
const AgentMacroManager            = lazy(() => import('./AgentMacroManager').then(m => ({ default: m.AgentMacroManager })));
const AgentRegistry                = lazy(() => import('./AgentRegistry').then(m => ({ default: m.AgentRegistry })));
const EcommerceTab                 = lazy(() => import('./tabs/EcommerceTab').then(m => ({ default: m.EcommerceTab })));
const CampaignDashboard            = lazy(() => import('./CampaignDashboard').then(m => ({ default: m.CampaignDashboard })));
const ContentPerformance           = lazy(() => import('./ContentPerformance').then(m => ({ default: m.ContentPerformance })));
const ContentTrackingAdvanced      = lazy(() => import('./ContentTrackingAdvanced').then(m => ({ default: m.ContentTrackingAdvanced })));
const ConversionGoalsConfig        = lazy(() => import('./ConversionGoalsConfig').then(m => ({ default: m.ConversionGoalsConfig })));
const AttributionTab               = lazy(() => import('./tabs/AttributionTab').then(m => ({ default: m.AttributionTab })));
const ReportBuilder                = lazy(() => import('./ReportBuilder').then(m => ({ default: m.ReportBuilder })));
const ServerLogAnalytics           = lazy(() => import('./ServerLogAnalytics').then(m => ({ default: m.ServerLogAnalytics })));
const RealTimeWidget               = lazy(() => import('./RealTimeWidget').then(m => ({ default: m.RealTimeWidget })));

// Tabs that receive the global date range (directly or as derived start/end dates).
const DATE_AWARE = new Set([
  'analytics', 'geolocation', 'campaigns', 'content-performance', 'content-tracking', 'navigation',
  'paid-ads-server', 'click-fraud', 'cookiefree', 'heatmap', 'forms', 'agent-ops', 'ip-segments',
  'server-logs', 'ai-bots', 'ai', 'ai-visibility', 'zero-click-risk', 'kpi-catalog', 'segments',
  'ecommerce', 'social-media', 'kpi', 'paid-ads',
]);

// Tabs where the global filters have no meaning (settings, live view, latest alerts):
// no "does not apply the filter" notice.
const NO_FILTER_NOTICE = new Set([
  'overview', 'realtime', 'alerts',
  'setup', 'integrations', 'cortiq-api', 'api-keys', 'gdpr', 'notifications', 'tag-manager',
  'warehouse', 'utm-segments', 'agent-macros', 'agent-registry', 'conversion-goals', 'report-builder',
]);

interface DashboardTabsProps {
  selectedSite: Site;
  analytics: Analytics | null;
  dateRange?: import('react-day-picker').DateRange;
  onSiteDeleted?: () => void;
  activeTab: string;
  onTabChange: (value: string) => void;
}

function DashboardTabsInner({ selectedSite, analytics, dateRange, onSiteDeleted, activeTab, onTabChange }: DashboardTabsProps) {
  // Active tab lives in the URL (?tab=); Dashboard.tsx owns it so the numbered sidebar
  // (DashboardSidebar) and this content switch share one value.
  const setActiveTab = onTabChange;

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6 w-full">
      {!NO_FILTER_NOTICE.has(activeTab) && !HIDDEN_TABS[activeTab] && <FilterScopeNotice supports={{ date: DATE_AWARE.has(activeTab) }} />}
      {HIDDEN_TABS[activeTab] && (
        <div role="note" className="rounded-md border bg-muted/40 px-4 py-6 text-sm text-muted-foreground">
          {HIDDEN_TABS[activeTab]}
        </div>
      )}
      <TabsContent value="overview" className="space-y-6">
        <TabErrorBoundary tabName="Overview">
          <OverviewTab selectedSite={selectedSite} onNavigate={setActiveTab} />
        </TabErrorBoundary>
      </TabsContent>

      <Suspense fallback={<div className="py-12 text-center text-sm text-muted-foreground">Loading...</div>}>

      <TabsContent value="heatmap" className="space-y-6">
        <TabErrorBoundary tabName="Heatmap">
          <HeatmapTab siteId={selectedSite.id} selectedSite={selectedSite} dateRange={dateRange} />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="forms" className="space-y-6">
        <TabErrorBoundary tabName="Forms">
          <FormAnalyticsTab selectedSite={selectedSite} dateRange={dateRange} />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="ai" className="space-y-6">
        <TabErrorBoundary tabName="AI Traffic">
          <AITab selectedSite={selectedSite} />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="ai-bots" className="space-y-6">
        <TabErrorBoundary tabName="AI Agents">
          <AIBotTab selectedSite={selectedSite} />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="agent-ops" className="space-y-6">
        <TabErrorBoundary tabName="Agent Ops">
          <AgentOpsTab
            companyId={selectedSite.company_id ?? null}
            dateRange={dateRange}
          />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="zero-click-risk" className="space-y-6">
        <TabErrorBoundary tabName="Zero-Click Risk">
          <ZeroClickRiskIndex siteId={selectedSite.id} />
        </TabErrorBoundary>
        <TabErrorBoundary tabName="High Impression Low CTR">
          <HighImpressionLowCTR siteId={selectedSite.id} />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="ai-visibility" className="space-y-6">
        <TabErrorBoundary tabName="AI Visibility">
          <AIVisibilityTab siteId={selectedSite.id} onNavigateToIntegrations={() => setActiveTab('integrations')} />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="kpi" className="space-y-6">
        <TabErrorBoundary tabName="KPI Dashboard">
          <KPITab selectedSite={selectedSite} onNavigateToIntegrations={() => setActiveTab('integrations')} />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="kpi-catalog" className="space-y-6">
        <TabErrorBoundary tabName="AI KPI Overview">
          <KPICatalogTab selectedSite={selectedSite} />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="segments" className="space-y-6">
        <TabErrorBoundary tabName="Segments">
          <SegmentsTab selectedSite={selectedSite} />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="navigation" className="space-y-6">
        <TabErrorBoundary tabName="Navigation">
          <NavigationTab selectedSite={selectedSite} />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="alerts" className="space-y-6">
        <TabErrorBoundary tabName="Alerts">
          <BehavioralAlertsTab selectedSite={selectedSite} />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="analytics" className="space-y-6">
        <TabErrorBoundary tabName="Analytics">
          <AnalyticsTab analytics={analytics} dateRange={dateRange} onNavigateToIntegrations={() => setActiveTab('integrations')} />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="paid-ads" className="space-y-6">
        <TabErrorBoundary tabName="Ads (GA4)">
          <PaidAdsTab selectedSite={selectedSite.id} kpiData={null} />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="attribution" className="space-y-6">
        <TabErrorBoundary tabName="Attribution Gap">
          <AttributionTab selectedSite={selectedSite} />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="paid-ads-server" className="space-y-6">
        <TabErrorBoundary tabName="Ads (Server-Side)">
          <ServerSidePaidAdsTab
            selectedSite={selectedSite.id}
            startDate={dateRange?.from?.toISOString().split('T')[0]}
            endDate={dateRange?.to?.toISOString().split('T')[0]}
          />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="cookiefree" className="space-y-6">
        <TabErrorBoundary tabName="Cookie-Free">
          <CookiefreeAnalyticsTab selectedSite={selectedSite} dateRange={dateRange} />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="integrations" className="space-y-6">
        <TabErrorBoundary tabName="Integrations">
          <ExternalIntegrationsTab selectedSite={selectedSite} />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="cortiq-api" className="space-y-6">
        <TabErrorBoundary tabName="CortIQ API & MCP">
          <ApiKeyManager />
          <MCPServerConfig />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="api-keys" className="space-y-6">
        <TabErrorBoundary tabName="API Keys">
          <ApiKeysTab siteId={selectedSite.id} />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="gdpr" className="space-y-6">
        <TabErrorBoundary tabName="GDPR">
          <GDPRTab selectedSite={selectedSite} />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="setup" className="space-y-6">
        <TabErrorBoundary tabName="Setup">
          <SetupTab selectedSite={selectedSite} onSiteDeleted={onSiteDeleted} />
        </TabErrorBoundary>
      </TabsContent>

      {/* Advanced Features Tabs */}
      <TabsContent value="tag-manager" className="space-y-6">
        <TabErrorBoundary tabName="Tag Manager">
          <TagManager siteId={selectedSite.id} />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="geolocation" className="space-y-6">
        <TabErrorBoundary tabName="Geolocation">
          <GeolocationDashboard siteId={selectedSite.id} />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="warehouse" className="space-y-6">
        <TabErrorBoundary tabName="Data Warehouse">
          <WarehouseConnectorManager siteId={selectedSite.id} />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="user-ltv" className="space-y-6">
        <TabErrorBoundary tabName="User LTV & Cohorts">
          <UserLTVTab selectedSiteId={selectedSite.id} />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="click-fraud" className="space-y-6">
        <TabErrorBoundary tabName="Click Fraud">
          <ClickFraudTab
            selectedSite={selectedSite.id}
            startDate={dateRange?.from?.toISOString().split('T')[0]}
            endDate={dateRange?.to?.toISOString().split('T')[0]}
          />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="notifications" className="space-y-6">
        <TabErrorBoundary tabName="Notifications">
          <NotificationChannelsConfig selectedSite={selectedSite} />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="ip-segments" className="space-y-6">
        <TabErrorBoundary tabName="Network Segments">
          <IPSegmentsTab selectedSite={selectedSite} dateRange={dateRange} />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="social-media" className="space-y-6">
        <TabErrorBoundary tabName="Social Media">
          <SocialMediaTab selectedSite={selectedSite} />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="utm-segments" className="space-y-6">
        <TabErrorBoundary tabName="UTM Segments">
          <UTMSegmentsTab selectedSite={selectedSite} />
        </TabErrorBoundary>
      </TabsContent>

      {/* AI — Agent Macros & Registry */}
      <TabsContent value="agent-macros" className="space-y-6">
        <TabErrorBoundary tabName="Agent Macros">
          <AgentMacroManager siteId={selectedSite.id} />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="agent-registry" className="space-y-6">
        <TabErrorBoundary tabName="Agent Registry">
          <AgentRegistry siteId={selectedSite.id} />
        </TabErrorBoundary>
      </TabsContent>

      {/* Commerce */}
      <TabsContent value="ecommerce" className="space-y-6">
        <TabErrorBoundary tabName="E-commerce">
          <EcommerceTab selectedSiteId={selectedSite.id} />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="campaigns" className="space-y-6">
        <TabErrorBoundary tabName="Campaigns">
          <CampaignDashboard siteId={selectedSite.id} domain={selectedSite.domain} />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="content-performance" className="space-y-6">
        <TabErrorBoundary tabName="Content Performance">
          <ContentPerformance siteId={selectedSite.id} />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="content-tracking" className="space-y-6">
        <TabErrorBoundary tabName="Content Tracking">
          <ContentTrackingAdvanced
            siteId={selectedSite.id}
            dateRange={{
              from: dateRange?.from?.toISOString() ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
              to: dateRange?.to?.toISOString() ?? new Date().toISOString(),
            }}
          />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="conversion-goals" className="space-y-6">
        <TabErrorBoundary tabName="Conversion Goals">
          <ConversionGoalsConfig selectedSite={selectedSite} />
        </TabErrorBoundary>
      </TabsContent>

      {/* More / Settings */}
      <TabsContent value="report-builder" className="space-y-6">
        <TabErrorBoundary tabName="Report Builder">
          <ReportBuilder siteId={selectedSite.id} />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="server-logs" className="space-y-6">
        <TabErrorBoundary tabName="Server Logs">
          <ServerLogAnalytics
            siteId={selectedSite.id}
            dateRange={{
              from: dateRange?.from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
              to: dateRange?.to ?? new Date(),
            }}
          />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="realtime" className="space-y-6">
        <TabErrorBoundary tabName="Real-Time">
          <RealTimeWidget siteId={selectedSite.id} />
        </TabErrorBoundary>
      </TabsContent>

      </Suspense>
    </Tabs>
  );
}

// UTMSegmentProvider now wraps the whole dashboard (Dashboard.tsx) so the filter panel shares it.
export function DashboardTabs(props: DashboardTabsProps) {
  return <DashboardTabsInner {...props} />;
}
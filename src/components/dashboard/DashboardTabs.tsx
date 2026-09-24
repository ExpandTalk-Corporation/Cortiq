import React, { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TabErrorBoundary } from './TabErrorBoundary';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { ChevronDown, Settings, ExternalLink, Key, Zap, Code2, Play, Globe, Database, DollarSign, TrendingUp, ShieldAlert, BarChart2, Bot, Sliders, Target, Shield, Users, Megaphone, FlaskConical, Bell, FileText, Flame, Network, Share2, Filter, AlertTriangle, BookOpen, Sparkles, ShoppingCart, Server, Activity, Cpu, Layers, PieChart } from 'lucide-react';
import { UTMSegmentProvider } from '@/contexts/UTMSegmentContext';
import { UTMSegmentBar } from './UTMSegmentBar';
import { OverviewTab } from './tabs/OverviewTab';
import type { Site, Analytics } from '@/types/dashboard';

const HeatmapTab               = lazy(() => import('./tabs/HeatmapTab').then(m => ({ default: m.HeatmapTab })));
const AnalyticsTab             = lazy(() => import('./tabs/AnalyticsTab').then(m => ({ default: m.AnalyticsTab })));
const PaidAdsTab               = lazy(() => import('./tabs/PaidAdsTab').then(m => ({ default: m.PaidAdsTab })));
const ServerSidePaidAdsTab     = lazy(() => import('./tabs/ServerSidePaidAdsTab').then(m => ({ default: m.ServerSidePaidAdsTab })));
const FormAnalyticsTab         = lazy(() => import('./tabs/FormAnalyticsTab').then(m => ({ default: m.FormAnalyticsTab })));
const ABTestingTab             = lazy(() => import('./tabs/ABTestingTab').then(m => ({ default: m.ABTestingTab })));
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
const SessionRecordingList     = lazy(() => import('./SessionRecordingList').then(m => ({ default: m.SessionRecordingList })));
const GeolocationDashboard     = lazy(() => import('./GeolocationDashboard').then(m => ({ default: m.GeolocationDashboard })));
const WarehouseConnectorManager = lazy(() => import('./WarehouseConnectorManager').then(m => ({ default: m.WarehouseConnectorManager })));
const FinalFas3Features        = lazy(() => import('./FinalFas3Features').then(m => ({ default: m.FinalFas3Features })));
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

interface DashboardTabsProps {
  selectedSite: Site;
  analytics: Analytics | null;
  dateRange?: import('react-day-picker').DateRange;
  onSiteDeleted?: () => void;
}

type NavOption = { value: string; label: string; icon: React.ComponentType<{ className?: string }> };
type NavGroup = { label: string; icon: React.ComponentType<{ className?: string }>; options: NavOption[] };

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Traffic',
    icon: BarChart2,
    options: [
      { value: 'analytics',    label: 'Analytics',       icon: BarChart2 },
      { value: 'cookiefree',   label: 'Cookie-Free',     icon: Shield },
      { value: 'realtime',     label: 'Real-Time',       icon: Activity },
      { value: 'geolocation',  label: 'Geolocation',     icon: Globe },
      { value: 'social-media', label: 'Social Media',    icon: Share2 },
      { value: 'navigation',   label: 'Navigation Flow', icon: Network },
      { value: 'server-logs',  label: 'Server Logs',     icon: Server },
    ],
  },
  {
    label: 'AI',
    icon: Bot,
    options: [
      { value: 'ai',              label: 'AI Traffic',      icon: TrendingUp },
      { value: 'ai-bots',         label: 'AI Agents',       icon: Bot },
      { value: 'ai-visibility',   label: 'GEO / AI Search', icon: Sparkles },
      { value: 'zero-click-risk', label: 'Zero-Click Risk', icon: AlertTriangle },
      { value: 'agent-ops',       label: 'Agent Ops',       icon: Zap },
    ],
  },
  {
    label: 'Optimize',
    icon: Sliders,
    options: [
      { value: 'heatmap',           label: 'Heatmap',           icon: Flame },
      { value: 'forms',             label: 'Forms',             icon: FileText },
      { value: 'abtesting',         label: 'A/B Testing',       icon: FlaskConical },
      { value: 'session-recording', label: 'Session Recording', icon: Play },
      { value: 'conversion-goals',  label: 'Conversion Goals',  icon: Target },
    ],
  },
  {
    label: 'Ads',
    icon: Megaphone,
    options: [
      { value: 'paid-ads',        label: 'Ads (GA4)',        icon: Megaphone },
      { value: 'paid-ads-server', label: 'Ads (Server-Side)', icon: Database },
      { value: 'click-fraud',     label: 'Click Fraud',      icon: ShieldAlert },
      { value: 'attribution',     label: 'Attribution Gap',  icon: Target },
    ],
  },
  {
    label: 'Reports',
    icon: BookOpen,
    options: [
      { value: 'kpi',                 label: 'KPI Dashboard',      icon: Target },
      { value: 'kpi-catalog',         label: 'AI KPI Overview',    icon: DollarSign },
      { value: 'user-ltv',            label: 'User LTV & Cohorts', icon: Users },
      { value: 'alerts',              label: 'Alerts',             icon: Bell },
      { value: 'report-builder',      label: 'Report Builder',     icon: PieChart },
      { value: 'campaigns',           label: 'Campaigns',          icon: Megaphone },
      { value: 'content-performance', label: 'Content',            icon: FileText },
    ],
  },
];

const SETTINGS_OPTIONS: NavOption[] = [
  { value: 'setup',             label: 'Setup & tracking script',  icon: Code2 },
  { value: 'integrations',      label: 'Integrations',             icon: ExternalLink },
  { value: 'cortiq-api',        label: 'CortIQ API & MCP',         icon: Key },
  { value: 'api-keys',          label: 'Third-party Keys',         icon: Key },
  { value: 'gdpr',              label: 'GDPR',                     icon: Shield },
  { value: 'notifications',     label: 'Notifications',            icon: Bell },
  { value: 'tag-manager',       label: 'Tag Manager',              icon: Code2 },
  { value: 'warehouse',         label: 'Data Warehouse',           icon: Database },
  { value: 'advanced-features', label: 'Web Vitals & White Label', icon: TrendingUp },
  { value: 'segments',          label: 'Segments',                 icon: Users },
  { value: 'utm-segments',      label: 'UTM Segments',             icon: Filter },
  { value: 'ip-segments',       label: 'Network Segments',         icon: Network },
  { value: 'ecommerce',         label: 'E-commerce',               icon: ShoppingCart },
  { value: 'content-tracking',  label: 'Content Tracking',         icon: Layers },
  { value: 'agent-macros',      label: 'Agent Macros',             icon: Cpu },
  { value: 'agent-registry',    label: 'Agent Registry',           icon: Server },
];

function DashboardTabsInner({ selectedSite, analytics, dateRange, onSiteDeleted }: DashboardTabsProps) {
  // Active tab lives in the URL (?tab=) so it deep-links, survives refresh, and works
  // with the browser back button. Falls back to 'overview' when absent.
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'overview';
  const setActiveTab = (value: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('tab', value);
      return next;
    });
  };

  function NavGroupDropdown({ group }: { group: NavGroup }) {
    const activeOption = group.options.find(o => o.value === activeTab);
    const GroupIcon = group.icon;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={activeOption ? 'default' : 'ghost'}
            className="flex items-center gap-2 h-10 px-4 py-2 whitespace-nowrap"
          >
            <GroupIcon className="h-4 w-4" />
            {group.label}
            {activeOption && <span className="h-2 w-2 rounded-full bg-current opacity-60 shrink-0" />}
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52 bg-card border shadow-lg z-[100]" sideOffset={5}>
          {group.options.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onClick={() => setActiveTab(option.value)}
              className={`cursor-pointer ${activeTab === option.value ? 'bg-muted' : ''}`}
            >
              <option.icon className="mr-2 h-4 w-4" />
              {option.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const currentSettingsTab = SETTINGS_OPTIONS.find(o => o.value === activeTab);

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6 max-w-screen-2xl mx-auto w-full">
      <div className="flex items-center gap-1 border-b pb-2 overflow-x-auto sticky top-0 z-40 bg-background [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* Overview — always visible */}
        <TabsList aria-label="Dashboard navigation" className="bg-transparent border-0 h-auto p-0 shrink-0">
          <TabsTrigger value="overview" className="data-[state=active]:bg-background data-[state=active]:shadow-sm whitespace-nowrap">
            Overview
          </TabsTrigger>
        </TabsList>

        {/* Grouped dropdowns */}
        {NAV_GROUPS.map(group => (
          <div key={group.label} className="shrink-0">
            <NavGroupDropdown group={group} />
          </div>
        ))}

        {/* Settings / More Dropdown — pushed to right with ml-auto but no shrink */}
        <div className="shrink-0 ml-auto pl-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant={currentSettingsTab ? 'default' : 'ghost'}
                className="flex items-center gap-2 h-10 px-4 py-2 whitespace-nowrap"
              >
                <Settings className="h-4 w-4" />
                {currentSettingsTab ? currentSettingsTab.label : 'Settings'}
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-card border shadow-lg z-[100]" sideOffset={5}>
              {/* Core config — Setup through Notifications */}
              {SETTINGS_OPTIONS.slice(0, 5).map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  onClick={() => setActiveTab(option.value)}
                  className={`cursor-pointer ${activeTab === option.value ? 'bg-muted' : ''}`}
                >
                  <option.icon className="mr-2 h-4 w-4" />
                  {option.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              {/* Advanced tools — Tag Manager through Web Vitals */}
              {SETTINGS_OPTIONS.slice(5, 8).map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  onClick={() => setActiveTab(option.value)}
                  className={`cursor-pointer ${activeTab === option.value ? 'bg-muted' : ''}`}
                >
                  <option.icon className="mr-2 h-4 w-4" />
                  {option.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              {/* Segments & specialised */}
              {SETTINGS_OPTIONS.slice(8).map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  onClick={() => setActiveTab(option.value)}
                  className={`cursor-pointer ${activeTab === option.value ? 'bg-muted' : ''}`}
                >
                  <option.icon className="mr-2 h-4 w-4" />
                  {option.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* UTM Segment chip-bar — below nav, above all tab content */}
      <UTMSegmentBar className="pb-1" />

      <TabsContent value="overview" className="space-y-6">
        <TabErrorBoundary tabName="Overview">
          <OverviewTab
            analytics={analytics}
            siteId={selectedSite.id}
            selectedSite={selectedSite}
            dateRange={dateRange}
            onNavigateToAI={() => setActiveTab('ai-bots')}
            onNavigateToSetup={() => setActiveTab('setup')}
            onNavigateToIntegrations={() => setActiveTab('integrations')}
          />
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

      <TabsContent value="abtesting" className="space-y-6">
        <TabErrorBoundary tabName="A/B Testing">
          <ABTestingTab siteId={selectedSite.id} />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="ai" className="space-y-6">
        <TabErrorBoundary tabName="AI Traffic">
          <AITab selectedSite={selectedSite} />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="ai-bots" className="space-y-6">
        <TabErrorBoundary tabName="AI Agents">
          <AIBotTab selectedSite={selectedSite} dateRange={dateRange} />
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

      <TabsContent value="session-recording" className="space-y-6">
        <TabErrorBoundary tabName="Session Recording">
          <SessionRecordingList siteId={selectedSite.id} />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="geolocation" className="space-y-6">
        <TabErrorBoundary tabName="Geolocation">
          <GeolocationDashboard
            siteId={selectedSite.id}
            dateRange={{
              from: dateRange?.from?.toISOString() ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
              to: dateRange?.to?.toISOString() ?? new Date().toISOString()
            }}
          />
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

      <TabsContent value="advanced-features" className="space-y-6">
        <TabErrorBoundary tabName="Web Vitals & White Label">
          <FinalFas3Features
            siteId={selectedSite.id}
            companyId={selectedSite.company_id || selectedSite.id}
          />
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
          <CampaignDashboard
            siteId={selectedSite.id}
            dateRange={{
              from: dateRange?.from?.toISOString() ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
              to: dateRange?.to?.toISOString() ?? new Date().toISOString(),
            }}
          />
        </TabErrorBoundary>
      </TabsContent>

      <TabsContent value="content-performance" className="space-y-6">
        <TabErrorBoundary tabName="Content Performance">
          <ContentPerformance
            siteId={selectedSite.id}
            dateRange={{
              from: dateRange?.from?.toISOString() ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
              to: dateRange?.to?.toISOString() ?? new Date().toISOString(),
            }}
          />
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

export function DashboardTabs(props: DashboardTabsProps) {
  return (
    <UTMSegmentProvider siteId={props.selectedSite.id}>
      <DashboardTabsInner {...props} />
    </UTMSegmentProvider>
  );
}
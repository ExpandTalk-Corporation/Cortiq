// src/components/dashboard/nav/navSections.ts
// Numbered dashboard menu. Values are the existing ?tab= values — never rename them.
export type NavItem = { value: string; label: string };
export type NavSection = { number: number; label: string; items: NavItem[] };

export const NAV_SECTIONS: NavSection[] = [
  { number: 1, label: 'Visitors', items: [
    { value: 'overview', label: 'Overview' },
    { value: 'analytics', label: 'Analytics' },
    { value: 'realtime', label: 'Real-time' },
    { value: 'geolocation', label: 'Locations' },
    { value: 'cookiefree', label: 'Cookie-free' },
  ] },
  { number: 2, label: 'Acquisition', items: [
    { value: 'social-media', label: 'Social media' },
    { value: 'campaigns', label: 'Campaigns' },
    { value: 'paid-ads', label: 'Ads (GA4)' },
    { value: 'paid-ads-server', label: 'Ads (server-side)' },
    { value: 'attribution', label: 'Attribution gap' },
    { value: 'click-fraud', label: 'Click fraud' },
  ] },
  { number: 3, label: 'Behavior', items: [
    { value: 'navigation', label: 'Navigation flow' },
    { value: 'content-performance', label: 'Content' },
    { value: 'heatmap', label: 'Heatmaps' },
    { value: 'session-recording', label: 'Session recording' },
    { value: 'forms', label: 'Forms' },
  ] },
  { number: 4, label: 'AI agents', items: [
    { value: 'ai', label: 'AI traffic' },
    { value: 'ai-bots', label: 'AI agents & crawlers' },
    { value: 'server-logs', label: 'Server-side measurement' },
    { value: 'ai-visibility', label: 'GEO / AI search' },
    { value: 'zero-click-risk', label: 'Zero-click risk' },
    { value: 'agent-ops', label: 'Agent ops' },
  ] },
  { number: 5, label: 'Conversions', items: [
    { value: 'conversion-goals', label: 'Goals' },
    { value: 'abtesting', label: 'A/B testing' },
    { value: 'user-ltv', label: 'LTV & cohorts' },
  ] },
  { number: 6, label: 'Reports', items: [
    { value: 'kpi', label: 'KPI dashboard' },
    { value: 'kpi-catalog', label: 'AI KPI overview' },
    { value: 'report-builder', label: 'Report builder' },
    { value: 'alerts', label: 'Alerts' },
  ] },
];

export const SETTINGS_ITEMS: NavItem[] = [
  { value: 'setup', label: 'Setup & tracking script' },
  { value: 'integrations', label: 'Integrations' },
  { value: 'cortiq-api', label: 'CortIQ API & MCP' },
  { value: 'api-keys', label: 'Third-party keys' },
  { value: 'gdpr', label: 'GDPR' },
  { value: 'notifications', label: 'Notifications' },
  { value: 'tag-manager', label: 'Tag manager' },
  { value: 'warehouse', label: 'Data warehouse' },
  { value: 'advanced-features', label: 'Web vitals & white label' },
  { value: 'segments', label: 'Segments' },
  { value: 'utm-segments', label: 'UTM segments' },
  { value: 'ip-segments', label: 'Network segments' },
  { value: 'ecommerce', label: 'E-commerce' },
  { value: 'content-tracking', label: 'Content tracking' },
  { value: 'agent-macros', label: 'Agent macros' },
  { value: 'agent-registry', label: 'Agent registry' },
];

export const numberedLabel = (sectionNumber: number, itemIndex: number) => `${sectionNumber}.${itemIndex + 1}`;

import type { OntologyConcept } from './types';

/**
 * Integration provider ontology — external systems that CortIQ connects to
 * in order to import data or deliver AI-powered insights.
 *
 * These concepts drive:
 *   - The BYOK (Bring Your Own Key) credentials vault
 *   - The "Integrations" settings UI
 *   - Edge Functions that import/export data per provider
 *
 * Hierarchy:
 *   integration_provider
 *   ├── ai_provider
 *   │   ├── anthropic
 *   │   └── openai
 *   ├── paid_advertising
 *   │   ├── google_ads_api
 *   │   ├── meta_ads_api
 *   │   └── linkedin_ads_api
 *   ├── seo_tools
 *   │   ├── google_search_console
 *   │   └── dataforseo
 *   └── analytics_platforms
 *       └── google_analytics_4
 */

export type AuthType = 'api_key' | 'oauth2' | 'username_password' | 'service_account';
export type CredentialScope = 'company' | 'site';

export interface IntegrationConcept extends OntologyConcept {
  kind: 'integration-class' | 'integration-instance';
  /** How credentials are obtained and stored */
  authType?: AuthType;
  /** Whether credentials belong to the whole company or a single site */
  credentialScope?: CredentialScope;
  /** OAuth scopes required (for oauth2 integrations) */
  oauthScopes?: string[];
  /** Edge Function that uses this integration's credentials */
  edgeFunction?: string;
  /** Whether this integration is currently implemented */
  status?: 'available' | 'planned';
  /** Ordered list of engineering tasks needed before this integration can go live */
  roadmapTasks?: string[];
}

export const integrations: Record<string, IntegrationConcept> = {

  /* ── Root ────────────────────────────────────────────────────── */

  integration_provider: {
    id: 'integration_provider',
    kind: 'integration-class',
    label: 'Integration Provider',
    description: 'External service that CortIQ can connect to via BYOK credentials.',
    children: ['ai_provider', 'paid_advertising', 'seo_tools', 'analytics_platforms'],
  },

  /* ── AI Providers ────────────────────────────────────────────── */

  ai_provider: {
    id: 'ai_provider',
    kind: 'integration-class',
    label: 'AI Provider',
    description: 'LLM API providers used to generate insights, summaries, and anomaly explanations.',
    parent: 'integration_provider',
    children: ['anthropic', 'openai'],
  },

  anthropic: {
    id: 'anthropic',
    kind: 'integration-instance',
    label: 'Anthropic (Claude)',
    description: 'Anthropic\'s Claude API — used for AI-powered analytics insights and natural language summaries of traffic data.',
    parent: 'ai_provider',
    authType: 'api_key',
    credentialScope: 'company',
    edgeFunction: 'ai-insights',
    status: 'planned',
    roadmapTasks: [
      'Create Edge Function ai-insights that calls Claude API using stored api_key',
      'Design prompt templates for: anomaly explanation, traffic summary, conversion advice',
      'Add "Ask AI" button to Overview, KPI and Click Fraud tabs that calls the function',
      'Stream response into a side panel or inline card',
    ],
  },

  openai: {
    id: 'openai',
    kind: 'integration-instance',
    label: 'OpenAI (GPT)',
    description: 'OpenAI\'s GPT API — alternative AI provider for analytics insights.',
    parent: 'ai_provider',
    authType: 'api_key',
    credentialScope: 'company',
    edgeFunction: 'ai-insights',
    status: 'planned',
    roadmapTasks: [
      'Share ai-insights Edge Function with Anthropic — select model based on which key is configured',
      'Add model selector (claude-sonnet-4-6 vs gpt-4o) in company settings',
    ],
  },

  /* ── Paid Advertising ────────────────────────────────────────── */

  paid_advertising: {
    id: 'paid_advertising',
    kind: 'integration-class',
    label: 'Paid Advertising',
    description: 'Ad platforms that CortIQ connects to for campaign performance and click fraud data.',
    parent: 'integration_provider',
    children: ['google_ads_api', 'meta_ads_api', 'linkedin_ads_api'],
  },

  google_ads_api: {
    id: 'google_ads_api',
    kind: 'integration-instance',
    label: 'Google Ads API',
    description: 'Campaign metrics, invalid clicks, placements and location targets from Google Ads, connected per site with Google sign-in (Settings → Integrations → Google Ads). Optional enrichment for Click fraud; required for Enhanced Conversions uploads.',
    parent: 'paid_advertising',
    authType: 'oauth2',
    credentialScope: 'site',
    oauthScopes: ['https://www.googleapis.com/auth/adwords'],
    edgeFunction: 'google-ads-import',
    status: 'available',
  },

  meta_ads_api: {
    id: 'meta_ads_api',
    kind: 'integration-instance',
    label: 'Meta Ads API',
    description: 'Import campaign metrics from Meta (Facebook + Instagram) Ads Manager. Enables cross-channel paid attribution.',
    parent: 'paid_advertising',
    authType: 'oauth2',
    credentialScope: 'company',
    oauthScopes: ['ads_read', 'ads_management'],
    edgeFunction: 'meta-ads-import',
    status: 'planned',
    roadmapTasks: [
      'Register a Meta App in Meta for Developers with ads_read + ads_management permissions',
      'Create OAuth callback Edge Function: oauth-meta-callback (exchanges code for access_token + refresh_token)',
      'Add redirect URI https://cortiq.se/oauth/meta/callback to the Meta App',
      'Implement token refresh logic (Meta tokens expire after 60 days)',
      'Create Edge Function meta-ads-import: fetch campaign impressions, clicks, spend, CPC per day',
      'Wire imported data into the Ads (Server-Side) tab with Meta as a source',
    ],
  },

  linkedin_ads_api: {
    id: 'linkedin_ads_api',
    kind: 'integration-instance',
    label: 'LinkedIn Campaign Manager',
    description: 'Import B2B campaign data from LinkedIn Ads. Especially valuable for lead generation analysis.',
    parent: 'paid_advertising',
    authType: 'oauth2',
    credentialScope: 'company',
    oauthScopes: ['r_ads', 'r_ads_reporting'],
    edgeFunction: 'linkedin-ads-import',
    status: 'planned',
    roadmapTasks: [
      'Register a LinkedIn App in LinkedIn Developer Portal with r_ads + r_ads_reporting scopes',
      'Create OAuth callback Edge Function: oauth-linkedin-callback (exchanges code for access_token)',
      'Add redirect URI https://cortiq.se/oauth/linkedin/callback to the LinkedIn App',
      'Implement token refresh (LinkedIn tokens expire after 60 days)',
      'Create Edge Function linkedin-ads-import: fetch campaign stats (impressions, clicks, spend, conversions)',
      'Wire imported data into the Ads (Server-Side) tab with LinkedIn as a source',
    ],
  },

  /* ── SEO Tools ───────────────────────────────────────────────── */

  seo_tools: {
    id: 'seo_tools',
    kind: 'integration-class',
    label: 'SEO Tools',
    description: 'Search visibility and keyword data providers.',
    parent: 'integration_provider',
    children: ['google_search_console', 'dataforseo'],
  },

  google_search_console: {
    id: 'google_search_console',
    kind: 'integration-instance',
    label: 'Google Search Console',
    description: 'Import organic search performance data — queries, impressions, CTR, and position per page.',
    parent: 'seo_tools',
    authType: 'oauth2',
    credentialScope: 'site',
    oauthScopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
    edgeFunction: 'search-console-import',
    status: 'available',
  },

  dataforseo: {
    id: 'dataforseo',
    kind: 'integration-instance',
    label: 'DataForSEO',
    description: 'Keyword difficulty, SERP data, and competitor insights via the DataForSEO API.',
    parent: 'seo_tools',
    authType: 'username_password',
    credentialScope: 'company',
    edgeFunction: 'dataforseo-import',
    status: 'planned',
    roadmapTasks: [
      'Create DataForSEO account and generate API credentials',
      'Create Edge Function dataforseo-import: fetch keyword rankings for site domain',
      'Decide which endpoints to use: SERP, Keywords Data, or Backlinks',
      'Add a new SEO tab (or section in Analytics) displaying keyword positions and search volume',
    ],
  },

  /* ── Analytics Platforms ─────────────────────────────────────── */

  analytics_platforms: {
    id: 'analytics_platforms',
    kind: 'integration-class',
    label: 'Analytics Platforms',
    description: 'Third-party analytics tools that CortIQ can sync data with.',
    parent: 'integration_provider',
    children: ['google_analytics_4'],
  },

  google_analytics_4: {
    id: 'google_analytics_4',
    kind: 'integration-instance',
    label: 'Google Analytics 4',
    description: 'Import GA4 data as a supplemental source — paid traffic metrics, audience data, and conversion goals.',
    parent: 'analytics_platforms',
    authType: 'service_account',
    credentialScope: 'site',
    edgeFunction: 'ga4-import',
    status: 'available',
  },
};

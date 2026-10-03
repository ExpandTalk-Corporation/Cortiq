// Single source of truth for public marketing pages. scripts/prerender.mjs reads this
// (via the SSR bundle) to prerender each page, inject its meta tags and write
// sitemap.xml; pages read their title/description from it through seoFor().
//
// Paths end with a slash: the prerenderer writes dist/<path>/index.html and Apache
// serves a directory URL with the slash as 200, so canonical, sitemap and internal
// links must all use that exact form.

export const SITE_ORIGIN = 'https://cortiq.se';

export type FooterGroup = 'product' | 'resources' | 'company';

export interface MarketingRoute {
  path: string;
  title: string;
  description: string;
  changefreq: 'weekly' | 'monthly' | 'yearly';
  priority: number;
  /** Page component file — its last commit date becomes the sitemap lastmod. */
  source: string;
  /** Footer placement and label; omitted routes are not listed in the footer. */
  footer?: { group: FooterGroup; label: string };
}

export const MARKETING_ROUTES: MarketingRoute[] = [
  {
    path: '/',
    title: 'CortIQ — AI Agent Analytics & Cookie-Free Tracking',
    description: 'Analytics for the Agentic Web: classify AI training crawlers, agent fetches and citation crawlers. Consent-first, cookieless visitor analytics, heatmaps, form analytics. EU-hosted. Free during beta.',
    changefreq: 'weekly',
    priority: 1.0,
    source: 'src/pages/Index.tsx',
  },
  {
    path: '/features/',
    title: 'Features — CortIQ Analytics Platform',
    description: 'Full feature overview: AI bot classification, server-side bot ingestion, click and scroll heatmaps, form analytics, conversion attribution, an MCP server and a built-in consent banner (CMP).',
    changefreq: 'monthly',
    priority: 0.9,
    source: 'src/pages/Features.tsx',
    footer: { group: 'product', label: 'All features' },
  },
  {
    path: '/features/ai/',
    title: 'AI Bot & Agent Traffic Analytics — CortIQ',
    description: 'Not all AI traffic is equal. CortIQ classifies training crawlers, agentic fetches and citation crawlers — GPTBot, ClaudeBot, ChatGPT-User, PerplexityBot and more — from the JS tag and a Cloudflare Worker.',
    changefreq: 'monthly',
    priority: 0.9,
    source: 'src/pages/FeaturesAI.tsx',
    footer: { group: 'product', label: 'AI agent analytics' },
  },
  {
    path: '/features/analytics/',
    title: 'Web Analytics — CortIQ',
    description: 'Consent-first web analytics: cookieless mode, click and scroll heatmaps, form analytics, link click counts and conversion attribution. EU-hosted and built for GDPR.',
    changefreq: 'monthly',
    priority: 0.8,
    source: 'src/pages/FeaturesAnalytics.tsx',
    footer: { group: 'product', label: 'Analytics & heatmaps' },
  },
  {
    path: '/features/cyber/',
    title: 'Cyber Security & Bot Detection — CortIQ',
    description: 'Detect click fraud, bot traffic and suspicious sessions in real time. Protect paid ad spend and identify malicious bots alongside genuine AI agent traffic.',
    changefreq: 'monthly',
    priority: 0.7,
    source: 'src/pages/FeaturesCyber.tsx',
    footer: { group: 'product', label: 'Cyber & bot security' },
  },
  {
    path: '/cmp/',
    title: 'Consent Management Platform (CMP) — CortIQ',
    description: 'Built-in consent banner with Google Consent Mode v2. Visitor analytics and GA4 start only after analytics consent, valid for 12 months. EU-hosted, privacy by design.',
    changefreq: 'monthly',
    priority: 0.8,
    source: 'src/pages/CMP.tsx',
    footer: { group: 'product', label: 'Consent banner (CMP)' },
  },
  {
    path: '/pricing/',
    title: 'Pricing — CortIQ Analytics',
    description: 'CortIQ is free during beta: AI agent analytics, cookie-free tracking and a built-in consent banner. Create a free account, or contact us about Enterprise.',
    changefreq: 'monthly',
    priority: 0.9,
    source: 'src/pages/Pricing.tsx',
    footer: { group: 'product', label: 'Pricing' },
  },
  {
    path: '/api/',
    title: 'API Documentation — CortIQ',
    description: 'CortIQ read-only REST API: sessions, page views, referrers, AI agent sessions, conversions and heatmaps as JSON or CSV. OpenAPI spec, API key authentication.',
    changefreq: 'monthly',
    priority: 0.7,
    source: 'src/pages/ApiDocs.tsx',
    footer: { group: 'resources', label: 'API documentation' },
  },
  {
    path: '/docs/',
    title: 'Getting Started — CortIQ Docs',
    description: 'Install the CortIQ tracking script, connect your consent banner (Cookiebot or any CMP), use cookieless mode and check that data arrives. Works with single-page apps.',
    changefreq: 'monthly',
    priority: 0.8,
    source: 'src/content/docs.ts',
    footer: { group: 'resources', label: 'Getting started' },
  },
  {
    path: '/integrations/',
    title: 'Integrations — CortIQ',
    description: 'Connect CortIQ to WordPress, Cloudflare, Google Analytics 4 and MCP clients like Claude Code, or pull data through the REST API. What works today and what is in development.',
    changefreq: 'monthly',
    priority: 0.8,
    source: 'src/content/docs.ts',
    footer: { group: 'resources', label: 'Integrations' },
  },
  {
    path: '/integrations/wordpress/',
    title: 'WordPress Plugin: Analytics & Consent Banner — CortIQ',
    description: 'One WordPress plugin for CortIQ tracking, a consent banner in five languages and Google Consent Mode v2 for GA4. Cookieless mode, geo-gating and admin exclusion.',
    changefreq: 'monthly',
    priority: 0.7,
    source: 'src/content/docs.ts',
  },
  {
    path: '/integrations/cloudflare/',
    title: 'Track AI Crawlers Server-Side with Cloudflare — CortIQ',
    description: 'A Cloudflare Worker that sends AI crawler traffic to CortIQ for classification, including GPTBot, ClaudeBot and other bots that never run JavaScript. No full IPs stored.',
    changefreq: 'monthly',
    priority: 0.7,
    source: 'src/content/docs.ts',
  },
  {
    path: '/integrations/google-analytics/',
    title: 'Google Analytics 4 Integration — CortIQ',
    description: 'Import GA4 reports into CortIQ with read-only access: KPIs by channel, AI assistant referrals and traffic sources, next to server-side AI crawler data.',
    changefreq: 'monthly',
    priority: 0.6,
    source: 'src/content/docs.ts',
  },
  {
    path: '/integrations/mcp/',
    title: 'MCP Server for Web Analytics — CortIQ',
    description: 'Query your web analytics from Claude Code and other MCP clients. 22 read-only tools for traffic, engagement, heatmaps, forms and AI agent traffic. One API key per site.',
    changefreq: 'monthly',
    priority: 0.7,
    source: 'src/content/docs.ts',
  },
  {
    path: '/changelog/',
    title: 'Changelog — CortIQ',
    description: 'What has shipped in CortIQ, month by month: tracking script and WordPress plugin releases, new integrations, AI bot classification, GEO audits and security fixes.',
    changefreq: 'weekly',
    priority: 0.6,
    source: 'src/content/company.ts',
    footer: { group: 'resources', label: 'Changelog' },
  },
  {
    path: '/about/',
    title: 'About CortIQ — Expandtalk Corporation AB',
    description: 'CortIQ is web analytics for the agentic web, built in Gothenburg, Sweden, by Expandtalk Corporation AB. Consent-first, EU-hosted and open source under AGPL-3.0.',
    changefreq: 'yearly',
    priority: 0.5,
    source: 'src/content/company.ts',
    footer: { group: 'company', label: 'About' },
  },
  {
    path: '/security/',
    title: 'Security & Data Protection — CortIQ',
    description: 'Where CortIQ stores data (EU, Stockholm), how customers are isolated with row-level security, API key handling, subprocessors, and how to report a vulnerability.',
    changefreq: 'monthly',
    priority: 0.6,
    source: 'src/content/company.ts',
    footer: { group: 'company', label: 'Security' },
  },
  {
    path: '/cookies/',
    title: 'Cookies & Browser Storage — CortIQ',
    description: 'Everything cortiq.se and the CortIQ tracking script store in the browser: one consent cookie on cortiq.se, and no cookies from the tracking script.',
    changefreq: 'yearly',
    priority: 0.4,
    source: 'src/content/company.ts',
    footer: { group: 'company', label: 'Cookies' },
  },
  {
    path: '/terms/',
    title: 'Terms of Service — CortIQ',
    description: 'Terms of Service for CortIQ: beta and fees, your data and the Data Processing Agreement, acceptable use, liability, termination and Swedish governing law.',
    changefreq: 'yearly',
    priority: 0.4,
    source: 'src/content/legal.ts',
    footer: { group: 'company', label: 'Terms of Service' },
  },
  {
    path: '/contact/',
    title: 'Contact — CortIQ',
    description: 'Get in touch with the CortIQ team. CortIQ is free during beta — ask about AI agent tracking, cookie-free analytics or Enterprise onboarding.',
    changefreq: 'yearly',
    priority: 0.5,
    source: 'src/pages/Contact.tsx',
    footer: { group: 'company', label: 'Contact' },
  },
  {
    path: '/privacy/',
    title: 'Privacy Policy — CortIQ',
    description: 'CortIQ privacy policy: what is processed without consent (security and bot detection), what requires analytics or marketing consent, EU data storage, retention periods and your rights.',
    changefreq: 'yearly',
    priority: 0.4,
    source: 'src/pages/Privacy.tsx',
    footer: { group: 'company', label: 'Privacy policy' },
  },
];

/** Retired paths and where they now live; mirrored as 301s in public/.htaccess. */
export const MARKETING_REDIRECTS: Record<string, string> = {
  '/bot-intelligence': '/features/ai/',
};

export function seoFor(path: string) {
  const route = MARKETING_ROUTES.find((r) => r.path === path);
  if (!route) throw new Error(`No marketing route registered for ${path}`);
  return { title: route.title, description: route.description, canonical: SITE_ORIGIN + route.path };
}

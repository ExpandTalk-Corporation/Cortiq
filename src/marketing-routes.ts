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
    title: 'CortIQ — AI Agent Analytics & Cookieless Web Analytics',
    description: 'Classify AI training crawlers, agent fetches and citation crawlers. Consent-first, cookieless visitor analytics with heatmaps. EU-hosted, free during beta.',
    changefreq: 'weekly',
    priority: 1.0,
    source: 'src/pages/Index.tsx',
  },
  {
    path: '/features/',
    title: 'Features — CortIQ Analytics Platform',
    description: 'AI bot classification, server-side bot ingestion, heatmaps, form analytics, conversion attribution, an MCP server and a built-in consent banner (CMP).',
    changefreq: 'monthly',
    priority: 0.9,
    source: 'src/pages/Features.tsx',
    footer: { group: 'product', label: 'All features' },
  },
  {
    path: '/features/ai/',
    title: 'AI Bot & Agent Traffic Analytics — CortIQ',
    description: 'CortIQ classifies AI training crawlers, agentic fetches and citation crawlers, such as GPTBot, ClaudeBot, ChatGPT-User and PerplexityBot.',
    changefreq: 'monthly',
    priority: 0.9,
    source: 'src/pages/FeaturesAI.tsx',
    footer: { group: 'product', label: 'AI agent analytics' },
  },
  {
    path: '/features/analytics/',
    title: 'Cookieless Web Analytics with Heatmaps — CortIQ',
    description: 'Consent-first web analytics: cookieless mode, heatmaps, form analytics, link clicks and conversion attribution. EU-hosted, designed to support GDPR compliance.',
    changefreq: 'monthly',
    priority: 0.8,
    source: 'src/pages/FeaturesAnalytics.tsx',
    footer: { group: 'product', label: 'Analytics & heatmaps' },
  },
  {
    path: '/features/cyber/',
    title: 'Bot Traffic & Click Fraud Detection — CortIQ',
    description: 'Detect click fraud, bot traffic and suspicious sessions in real time. Protect paid ad spend and identify malicious bots alongside genuine AI agent traffic.',
    changefreq: 'monthly',
    priority: 0.7,
    source: 'src/pages/FeaturesCyber.tsx',
    footer: { group: 'product', label: 'Cyber & bot security' },
  },
  {
    path: '/cmp/',
    title: 'Consent Management Platform (CMP) — CortIQ',
    description: 'Built-in consent banner with Google Consent Mode v2. Visitor analytics and GA4 start only after analytics consent, valid for 12 months. EU-hosted.',
    changefreq: 'monthly',
    priority: 0.8,
    source: 'src/pages/CMP.tsx',
    footer: { group: 'product', label: 'Consent banner (CMP)' },
  },
  {
    path: '/tracking-check/',
    title: 'Free Website Tracking Audit: Consent & Migration — CortIQ',
    description: 'Is your site tracking visitors before consent? See which cookies, pixels and tags load before the banner and after "Reject all", with a fix for each finding.',
    changefreq: 'monthly',
    priority: 0.8,
    source: 'src/pages/TrackingCheckLanding.tsx',
    footer: { group: 'product', label: 'Tracking Check' },
  },
  {
    path: '/cookie-consent-checker/',
    title: 'Cookie Checker: Scan Cookies Before & After Consent — CortIQ',
    description: 'Free cookie checker: a real browser visits your pages before the banner is answered, after "Reject all" and "Accept all", and lists cookies, pixels and tags.',
    changefreq: 'monthly',
    priority: 0.7,
    source: 'src/pages/CookieConsentChecker.tsx',
    footer: { group: 'resources', label: 'Cookie consent checker' },
  },
  {
    path: '/website-migration-check/',
    title: 'Website Migration Check: Redirects, Tags & Click IDs',
    description: 'Compare your current and new site before launch: 301 redirects, UTM and gclid survival, GA4, Ads and Meta tags, forms and cookie banner. Free with an account.',
    changefreq: 'monthly',
    priority: 0.7,
    source: 'src/pages/WebsiteMigrationCheck.tsx',
    footer: { group: 'resources', label: 'Website migration check' },
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
    description: 'Install the CortIQ tracking script, connect your consent banner (Cookiebot or any CMP), use cookieless mode and check that data arrives. Works with SPAs.',
    changefreq: 'monthly',
    priority: 0.8,
    source: 'src/content/docs.ts',
    footer: { group: 'resources', label: 'Getting started' },
  },
  {
    path: '/docs/metrics/',
    title: 'How CortIQ Counts Visits, Conversions & AI Traffic',
    description: 'CortIQ metric definitions: a visit ends after 30 idle minutes, goals count once per visit, AI hits by category, and how aggregate visitors and engagement count.',
    changefreq: 'monthly',
    priority: 0.6,
    source: 'src/content/docs.ts',
  },
  {
    path: '/glossary/',
    title: 'Web Analytics Glossary: Metrics & Formulas — CortIQ',
    description: 'Definitions and formulas for CortIQ metrics: visits, engagement rate, conversions, forms, scroll depth, AI crawler traffic, consent and attribution gap.',
    changefreq: 'monthly',
    priority: 0.6,
    source: 'src/content/glossary.ts',
    footer: { group: 'resources', label: 'Glossary' },
  },
  {
    path: '/guides/',
    title: 'Web Analytics Guides: Consent, Cookies & Bots — CortIQ',
    description: 'Practical guides to measuring a website: traffic without Google Analytics, bot detection, cookieless analytics and finding cookies loaded before consent.',
    changefreq: 'monthly',
    priority: 0.6,
    source: 'src/content/guides.ts',
    footer: { group: 'resources', label: 'Guides' },
  },
  {
    path: '/guides/website-traffic-without-google-analytics/',
    title: 'How to Measure Website Traffic Without Google Analytics',
    description: 'Server logs, cookieless scripts, aggregate counting or full analytics after consent: what each way of measuring traffic without GA4 sees, misses and needs.',
    changefreq: 'monthly',
    priority: 0.6,
    source: 'src/content/guides.ts',
  },
  {
    path: '/guides/detect-bot-traffic/',
    title: 'How to Detect Bot Traffic in Web Analytics — CortIQ',
    description: 'Spot bots in your analytics: the warning signs, User-Agent and IP checks, automation flags, honeypots and burst patterns, and how AI crawlers differ.',
    changefreq: 'monthly',
    priority: 0.6,
    source: 'src/content/guides.ts',
  },
  {
    path: '/guides/cookieless-analytics-alternatives/',
    title: 'Cookieless Analytics Alternatives to Google Analytics',
    description: 'What cookieless analytics means, why it is not the same as consent-free, and how Plausible, Fathom, Matomo, Umami and others differ.',
    changefreq: 'monthly',
    priority: 0.6,
    source: 'src/content/guides.ts',
  },
  {
    path: '/guides/find-cookies-before-consent/',
    title: 'How to Find Cookies Loaded Before Consent — CortIQ',
    description: 'Find cookies and tracking requests that load before the cookie banner is answered: a step-by-step check in Chrome DevTools, common culprits and causes.',
    changefreq: 'monthly',
    priority: 0.6,
    source: 'src/content/guides.ts',
  },
  {
    path: '/integrations/',
    title: 'Integrations — CortIQ',
    description: 'Connect CortIQ to WordPress, Cloudflare, Google Analytics 4 and MCP clients like Claude Code, or use the REST API. What works today and what is coming.',
    changefreq: 'monthly',
    priority: 0.8,
    source: 'src/content/docs.ts',
    footer: { group: 'resources', label: 'Integrations' },
  },
  {
    path: '/integrations/wordpress/',
    title: 'WordPress Plugin: Analytics & Consent Banner — CortIQ',
    description: 'One WordPress plugin for CortIQ tracking, a consent banner in five languages and Google Consent Mode v2 for GA4. Cookieless mode and geo-gating.',
    changefreq: 'monthly',
    priority: 0.7,
    source: 'src/content/docs.ts',
  },
  {
    path: '/integrations/server-side/',
    title: 'Server-Side AI Agent Measurement — CortIQ',
    description: 'Measure GPTBot, ClaudeBot and other AI crawlers that never run JavaScript on your server: adapters for Next.js, Vercel, Netlify, Cloudflare, Node and WordPress.',
    changefreq: 'monthly',
    priority: 0.8,
    source: 'src/content/docs.ts',
  },
  {
    path: '/integrations/cloudflare/',
    title: 'Track AI Crawlers Server-Side with Cloudflare — CortIQ',
    description: 'A paste-ready Cloudflare Worker that reports GPTBot, ClaudeBot and other AI crawlers that never run JavaScript. Human requests never leave Cloudflare.',
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
    description: 'Query your web analytics from Claude Code and other MCP clients: 22 read-only tools for traffic, engagement, heatmaps, forms and AI agents. One key per site.',
    changefreq: 'monthly',
    priority: 0.7,
    source: 'src/content/docs.ts',
  },
  {
    path: '/changelog/',
    title: 'Changelog — CortIQ',
    description: 'What has shipped in CortIQ, month by month: tracking script and WordPress plugin releases, integrations, AI bot classification, GEO audits and security fixes.',
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
    description: 'Where CortIQ stores data (EU, Stockholm), customer isolation with row-level security, API key handling, subprocessors and how to report a vulnerability.',
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
    description: 'CortIQ privacy policy: what server-side agent measurement processes, what needs analytics or marketing consent, EU storage, retention and your rights.',
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

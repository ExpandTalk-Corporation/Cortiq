export interface RouteSEO {
  title: string;
  description: string;
  canonical: string;
}

export const SEO_ROUTES: Record<string, RouteSEO> = {
  '/': {
    title: 'CortIQ — AI Agent Analytics & Cookie-Free Tracking',
    description: 'Analytics for the Agentic Web: classify AI training crawlers, agent fetches and citation crawlers. Consent-first, cookieless visitor analytics, heatmaps, form analytics. EU-hosted. Free during beta.',
    canonical: 'https://cortiq.se/',
  },
  '/features': {
    title: 'Features — CortIQ Analytics Platform',
    description: 'Full feature overview: AI bot classification, server-side bot ingestion, click and scroll heatmaps, form analytics, conversion attribution, an MCP server and a built-in consent banner (CMP).',
    canonical: 'https://cortiq.se/features',
  },
  '/features/ai': {
    title: 'AI Agent Analytics — CortIQ',
    description: 'Classify AI traffic into training crawlers, agentic fetches and citation crawlers — GPTBot, ClaudeBot, ChatGPT-User, PerplexityBot and more. JS tag and server-side log ingestion.',
    canonical: 'https://cortiq.se/features/ai',
  },
  '/features/analytics': {
    title: 'Web Analytics — CortIQ',
    description: 'Consent-first web analytics: cookieless mode, click and scroll heatmaps, form analytics, link click counts and conversion attribution. EU-hosted and built for GDPR.',
    canonical: 'https://cortiq.se/features/analytics',
  },
  '/features/cyber': {
    title: 'Cyber Security & Bot Detection — CortIQ',
    description: 'Detect click fraud, bot traffic and suspicious sessions in real time. Protect paid ad spend and identify malicious bots alongside genuine AI agent traffic.',
    canonical: 'https://cortiq.se/features/cyber',
  },
  '/bot-intelligence': {
    title: 'AI Bot Intelligence — CortIQ',
    description: 'Not all AI traffic is equal. CortIQ classifies training crawlers, agentic fetches, and citation crawlers — so you know which bots are valuable and which are just infrastructure cost.',
    canonical: 'https://cortiq.se/bot-intelligence',
  },
  '/cmp': {
    title: 'Consent Management Platform (CMP) — CortIQ',
    description: 'Built-in consent banner with Google Consent Mode v2. Visitor analytics and GA4 start only after analytics consent, valid for 12 months. EU-hosted, privacy by design.',
    canonical: 'https://cortiq.se/cmp',
  },
  '/pricing': {
    title: 'Pricing — CortIQ Analytics',
    description: 'CortIQ is free during beta: AI agent analytics, cookie-free tracking and a built-in consent banner. Create a free account, or contact us about Enterprise.',
    canonical: 'https://cortiq.se/pricing',
  },
  '/api': {
    title: 'API Documentation — CortIQ',
    description: 'CortIQ read-only REST API: sessions, page views, referrers, AI agent sessions, conversions and heatmaps as JSON or CSV. OpenAPI spec, API key authentication.',
    canonical: 'https://cortiq.se/api',
  },
  '/privacy': {
    title: 'Privacy Policy — CortIQ',
    description: 'CortIQ privacy policy: what is processed without consent (security and bot detection), what requires analytics or marketing consent, EU data storage, retention periods and your rights.',
    canonical: 'https://cortiq.se/privacy',
  },
  '/contact': {
    title: 'Contact — CortIQ',
    description: 'Get in touch with the CortIQ team. CortIQ is free during beta — ask about AI agent tracking, cookie-free analytics or Enterprise onboarding.',
    canonical: 'https://cortiq.se/contact',
  },
};

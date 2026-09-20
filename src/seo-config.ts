export interface RouteSEO {
  title: string;
  description: string;
  canonical: string;
}

export const SEO_ROUTES: Record<string, RouteSEO> = {
  '/': {
    title: 'CortIQ — AI Agent Analytics & Cookie-Free Tracking',
    description: 'First-to-market analytics for the Agentic Web. Track ChatGPT Browser, Perplexity & Claude Browser. Cookie-free, GDPR-compliant. Heatmaps, A/B testing, form analytics.',
    canonical: 'https://cortiq.se/',
  },
  '/features': {
    title: 'Features — CortIQ Analytics Platform',
    description: 'Full feature overview: AI agent tracking, click heatmaps, A/B testing, form analytics, session recording, data warehouse export and GDPR-compliant CMP. All in one platform.',
    canonical: 'https://cortiq.se/features',
  },
  '/features/ai': {
    title: 'AI Agent Analytics — CortIQ',
    description: 'Track and analyse traffic from ChatGPT Browser, Perplexity Comet, Claude Browser and other AI agents. Journey funnels, conversion attribution, citation tracking. First on the market.',
    canonical: 'https://cortiq.se/features/ai',
  },
  '/features/analytics': {
    title: 'Web Analytics — CortIQ',
    description: 'Cookie-free server-side analytics, click heatmaps, form analytics, session recording and A/B testing — all GDPR-compliant and without a cookie banner.',
    canonical: 'https://cortiq.se/features/analytics',
  },
  '/features/cyber': {
    title: 'Cyber Security & Bot Detection — CortIQ',
    description: 'Detect click fraud, bot traffic and suspicious sessions in real time. Protect paid ad spend and identify malicious bots alongside genuine AI agent traffic.',
    canonical: 'https://cortiq.se/features/cyber',
  },
  '/bot-intelligence': {
    title: 'Bot Intelligence — CortIQ',
    description: 'Understand which bots visit your site, what they do, and how they affect your analytics. Training crawlers, citation bots and agentic browsers — all classified and tracked.',
    canonical: 'https://cortiq.se/bot-intelligence',
  },
  '/cmp': {
    title: 'Consent Management Platform (CMP) — CortIQ',
    description: 'Cookie consent with smart nudging to increase opt-in rates. Google Consent Mode v2 built in. Server-side base analytics is designed to run banner-free; advanced tracking is consent-driven.',
    canonical: 'https://cortiq.se/cmp',
  },
  '/pricing': {
    title: 'Pricing — CortIQ Analytics',
    description: 'Simple, transparent pricing for AI agent analytics, cookie-free tracking and GDPR CMP. Invite-only beta — request access today.',
    canonical: 'https://cortiq.se/pricing',
  },
  '/api': {
    title: 'API Documentation — CortIQ',
    description: 'CortIQ REST API reference. Track events, query analytics, heatmaps, A/B tests and more. OpenAPI-compatible with API key authentication.',
    canonical: 'https://cortiq.se/api',
  },
  '/privacy': {
    title: 'Privacy Policy — CortIQ',
    description: 'CortIQ privacy policy. GDPR-compliant data handling, EU data storage, data retention details and your rights as a data subject.',
    canonical: 'https://cortiq.se/privacy',
  },
  '/contact': {
    title: 'Contact — CortIQ',
    description: 'Get in touch with the CortIQ team. Request an invitation to our analytics platform or ask about AI agent tracking and cookie-free analytics.',
    canonical: 'https://cortiq.se/contact',
  },
};

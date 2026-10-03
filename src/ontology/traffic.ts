import type { TrafficConcept } from './types';

/**
 * Traffic source ontology — where visitors come from.
 *
 * Hierarchy:
 *   traffic_source
 *   ├── direct
 *   ├── organic_search
 *   │   ├── google_organic
 *   │   ├── bing_organic
 *   │   └── ai_search_referral       ← unique to CortIQ
 *   │       ├── chatgpt_referral
 *   │       ├── perplexity_referral
 *   │       ├── claude_referral
 *   │       └── gemini_referral
 *   ├── paid_search
 *   │   ├── google_ads
 *   │   └── bing_ads
 *   ├── paid_social
 *   │   ├── meta_ads_paid
 *   │   ├── linkedin_ads_paid
 *   │   └── tiktok_ads_paid
 *   ├── social
 *   │   ├── linkedin, twitter_x, facebook
 *   │   ├── tiktok_organic
 *   │   └── instagram_organic
 *   ├── email
 *   ├── referral
 *   └── ai_agent_traffic             ← agents accessing directly (no human referral)
 */
export const traffic: Record<string, TrafficConcept> = {

  traffic_source: {
    id: 'traffic_source',
    kind: 'traffic-class',
    label: 'Traffic Source',
    description: 'The origin channel that brought a visitor to the site.',
    children: ['direct', 'organic_search', 'paid_search', 'paid_social', 'social', 'email', 'referral', 'ai_agent_traffic'],
  },

  /* ── Direct ──────────────────────────────────────────────────── */

  direct: {
    id: 'direct',
    kind: 'traffic-instance',
    label: 'Direct',
    description: 'Visitor arrived without a referrer — typed URL, bookmark, or no-referrer policy.',
    parent: 'traffic_source',
    utmMedium: '(none)',
  },

  /* ── Organic search ──────────────────────────────────────────── */

  organic_search: {
    id: 'organic_search',
    kind: 'traffic-class',
    label: 'Organic Search',
    description: 'Unpaid clicks from search engine results pages.',
    parent: 'traffic_source',
    utmMedium: 'organic',
    children: ['google_organic', 'bing_organic', 'ai_search_referral'],
  },

  google_organic: {
    id: 'google_organic',
    kind: 'traffic-instance',
    label: 'Google Organic',
    description: 'Unpaid click from Google Search.',
    parent: 'organic_search',
    referrerPatterns: ['google.com', 'google.se', 'google.co.uk'],
  },

  bing_organic: {
    id: 'bing_organic',
    kind: 'traffic-instance',
    label: 'Bing Organic',
    description: 'Unpaid click from Bing Search.',
    parent: 'organic_search',
    referrerPatterns: ['bing.com'],
  },

  /* ── AI search referral (CortIQ unique) ─────────────────────── */

  ai_search_referral: {
    id: 'ai_search_referral',
    kind: 'traffic-class',
    label: 'AI Search Referral',
    description: 'Human user who clicked a link in an AI-generated answer (ChatGPT, Perplexity, etc.). The visit is human but the discovery was AI-mediated.',
    parent: 'organic_search',
    children: ['chatgpt_referral', 'perplexity_referral', 'claude_referral', 'gemini_referral'],
  },

  chatgpt_referral: {
    id: 'chatgpt_referral',
    kind: 'traffic-instance',
    label: 'ChatGPT Referral',
    description: 'Human clicked a link cited by ChatGPT.',
    parent: 'ai_search_referral',
    referrerPatterns: ['chat.openai.com', 'chatgpt.com'],
    utmSources: ['chatgpt'],
  },

  perplexity_referral: {
    id: 'perplexity_referral',
    kind: 'traffic-instance',
    label: 'Perplexity Referral',
    description: 'Human clicked a link cited by Perplexity.',
    parent: 'ai_search_referral',
    referrerPatterns: ['perplexity.ai'],
    utmSources: ['perplexity'],
  },

  claude_referral: {
    id: 'claude_referral',
    kind: 'traffic-instance',
    label: 'Claude Referral',
    description: 'Human clicked a link cited by Claude.',
    parent: 'ai_search_referral',
    referrerPatterns: ['claude.ai'],
    utmSources: ['claude'],
  },

  gemini_referral: {
    id: 'gemini_referral',
    kind: 'traffic-instance',
    label: 'Gemini Referral',
    description: 'Human clicked a link cited by Google Gemini.',
    parent: 'ai_search_referral',
    referrerPatterns: ['gemini.google.com', 'bard.google.com'],
    utmSources: ['gemini', 'bard'],
  },

  /* ── Paid search ─────────────────────────────────────────────── */

  paid_search: {
    id: 'paid_search',
    kind: 'traffic-class',
    label: 'Paid Search',
    description: 'Paid clicks from search engine ads.',
    parent: 'traffic_source',
    utmMedium: 'cpc',
    children: ['google_ads', 'bing_ads'],
  },

  google_ads: {
    id: 'google_ads',
    kind: 'traffic-instance',
    label: 'Google Ads',
    description: 'Paid click from Google Ads.',
    parent: 'paid_search',
    utmSources: ['google'],
    utmMedium: 'cpc',
  },

  bing_ads: {
    id: 'bing_ads',
    kind: 'traffic-instance',
    label: 'Microsoft Ads',
    description: 'Paid click from Microsoft (Bing) Ads.',
    parent: 'paid_search',
    utmSources: ['bing', 'microsoft'],
    utmMedium: 'cpc',
  },

  /* ── Paid social ─────────────────────────────────────────────── */

  paid_social: {
    id: 'paid_social',
    kind: 'traffic-class',
    label: 'Paid Social',
    description: 'Paid clicks from social media ad platforms.',
    parent: 'traffic_source',
    utmMedium: 'paid-social',
    children: ['meta_ads_paid', 'linkedin_ads_paid', 'tiktok_ads_paid'],
  },

  meta_ads_paid: {
    id: 'meta_ads_paid',
    kind: 'traffic-instance',
    label: 'Meta Ads',
    description: 'Paid click from Meta (Facebook / Instagram) Ads.',
    parent: 'paid_social',
    utmSources: ['facebook', 'instagram', 'meta'],
    utmMedium: 'paid-social',
  },

  linkedin_ads_paid: {
    id: 'linkedin_ads_paid',
    kind: 'traffic-instance',
    label: 'LinkedIn Ads',
    description: 'Paid click from LinkedIn Campaign Manager.',
    parent: 'paid_social',
    utmSources: ['linkedin'],
    utmMedium: 'paid-social',
  },

  tiktok_ads_paid: {
    id: 'tiktok_ads_paid',
    kind: 'traffic-instance',
    label: 'TikTok Ads',
    description: 'Paid click from TikTok Ads Manager.',
    parent: 'paid_social',
    utmSources: ['tiktok'],
    utmMedium: 'paid-social',
  },

  /* ── Social ──────────────────────────────────────────────────── */

  social: {
    id: 'social',
    kind: 'traffic-class',
    label: 'Social Media',
    description: 'Organic clicks from social media platforms.',
    parent: 'traffic_source',
    utmMedium: 'social',
    children: ['linkedin', 'twitter_x', 'facebook', 'tiktok_organic', 'instagram_organic'],
  },

  linkedin: {
    id: 'linkedin',
    kind: 'traffic-instance',
    label: 'LinkedIn (Organic)',
    description: 'Organic referral from LinkedIn.',
    parent: 'social',
    referrerPatterns: ['linkedin.com'],
  },

  twitter_x: {
    id: 'twitter_x',
    kind: 'traffic-instance',
    label: 'X / Twitter',
    description: 'Organic referral from X / Twitter.',
    parent: 'social',
    referrerPatterns: ['twitter.com', 'x.com'],
  },

  facebook: {
    id: 'facebook',
    kind: 'traffic-instance',
    label: 'Facebook (Organic)',
    description: 'Organic referral from Facebook.',
    parent: 'social',
    referrerPatterns: ['facebook.com', 'fb.com'],
  },

  tiktok_organic: {
    id: 'tiktok_organic',
    kind: 'traffic-instance',
    label: 'TikTok (Organic)',
    description: 'Organic referral from TikTok.',
    parent: 'social',
    referrerPatterns: ['tiktok.com'],
  },

  instagram_organic: {
    id: 'instagram_organic',
    kind: 'traffic-instance',
    label: 'Instagram (Organic)',
    description: 'Organic referral from Instagram.',
    parent: 'social',
    referrerPatterns: ['instagram.com'],
  },

  /* ── Email ───────────────────────────────────────────────────── */

  email: {
    id: 'email',
    kind: 'traffic-instance',
    label: 'Email',
    description: 'Click from an email campaign.',
    parent: 'traffic_source',
    utmMedium: 'email',
  },

  /* ── Referral ────────────────────────────────────────────────── */

  referral: {
    id: 'referral',
    kind: 'traffic-instance',
    label: 'Referral',
    description: 'Click from another website.',
    parent: 'traffic_source',
    utmMedium: 'referral',
  },

  /* ── AI agent traffic (CortIQ unique) ───────────────────────── */

  ai_agent_traffic: {
    id: 'ai_agent_traffic',
    kind: 'traffic-class',
    label: 'AI Agent Traffic',
    description: 'Autonomous AI agents accessing the site directly — not via a human clicking a link.',
    parent: 'traffic_source',
    children: ['ai_browser_agent_traffic', 'ai_crawler_traffic'],
  },

  ai_browser_agent_traffic: {
    id: 'ai_browser_agent_traffic',
    kind: 'traffic-instance',
    label: 'AI Browser Agent',
    description: 'Visual AI agent rendering and interacting with the site (ChatGPT Browser, Perplexity Comet, etc.).',
    parent: 'ai_agent_traffic',
  },

  ai_crawler_traffic: {
    id: 'ai_crawler_traffic',
    kind: 'traffic-instance',
    label: 'AI Crawler',
    description: 'Text-based AI or training crawler fetching content without rendering.',
    parent: 'ai_agent_traffic',
  },
};

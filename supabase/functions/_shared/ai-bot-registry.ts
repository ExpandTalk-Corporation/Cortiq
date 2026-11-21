/**
 * Canonical AI-bot classification — single source of truth for every ingestion path.
 *
 * Both the JS-tag path (`ai-bot-tracker`) and the server-side path (`cloudflare-ingest`)
 * import this so a bot is classified identically no matter how it was captured. Do NOT
 * fork this list into a per-function copy — that divergence is exactly what this module
 * exists to prevent.
 *
 *   training = crawls to build/refresh a model corpus (infrastructure cost)
 *   agentic  = a real user's AI browser acting on their behalf (treat like a human)
 *   citation = indexes content for AI-powered search results (visibility signal)
 */

export type BotCategory = 'training' | 'agentic' | 'citation';

export interface BotSignature {
  pattern: RegExp;
  type: string;
  name: string;
  category: BotCategory;
}

// Ordered MOST-SPECIFIC-FIRST: the first pattern that matches wins, so agentic
// user-agents (e.g. ChatGPT-User) are matched before the training crawler that
// shares a vendor prefix (GPTBot). `name` is the canonical UA token persisted to
// bot_name; `category` is the single source of truth for classification.
export const AI_BOT_REGISTRY: BotSignature[] = [
  // OpenAI
  { pattern: /ChatGPT-User/i,      type: 'chatgpt',    name: 'ChatGPT-User',       category: 'agentic' },
  { pattern: /ChatGPT Atlas/i,     type: 'chatgpt',    name: 'ChatGPT Atlas',      category: 'agentic' },
  { pattern: /OAI-SearchBot/i,     type: 'chatgpt',    name: 'OAI-SearchBot',      category: 'citation' },
  { pattern: /GPTBot/i,            type: 'chatgpt',    name: 'GPTBot',             category: 'training' },
  // Anthropic
  { pattern: /Claude-User/i,       type: 'claude',     name: 'Claude-User',        category: 'agentic' },
  { pattern: /Claude-SearchBot/i,  type: 'claude',     name: 'Claude-SearchBot',   category: 'citation' },
  { pattern: /ClaudeBot|anthropic-ai/i, type: 'claude', name: 'ClaudeBot',         category: 'training' },
  // Perplexity
  { pattern: /Perplexity-User/i,   type: 'perplexity', name: 'Perplexity-User',    category: 'agentic' },
  { pattern: /PerplexityBot/i,     type: 'perplexity', name: 'PerplexityBot',      category: 'citation' },
  // Google (Google-Extended is a robots.txt token only, see ROBOTS_TXT_ONLY_TOKENS)
  { pattern: /Google-Agent/i,      type: 'gemini',     name: 'Google-Agent',       category: 'agentic' },
  { pattern: /Google-GeminiNotebook/i, type: 'gemini', name: 'Google-GeminiNotebook', category: 'agentic' },
  { pattern: /GoogleOther/i,       type: 'gemini',     name: 'GoogleOther',        category: 'citation' },
  { pattern: /Googlebot/i,         type: 'gemini',     name: 'Googlebot',          category: 'citation' },
  // Microsoft / Bing
  { pattern: /bingbot|BingPreview/i, type: 'bingbot',  name: 'Bingbot',            category: 'citation' },
  // Meta
  { pattern: /Meta-ExternalFetcher/i, type: 'meta',    name: 'Meta-ExternalFetcher', category: 'agentic' },
  { pattern: /Meta-WebIndexer/i,   type: 'meta',       name: 'Meta-WebIndexer',    category: 'citation' },
  { pattern: /Meta-ExternalAgent/i, type: 'meta',      name: 'Meta-ExternalAgent', category: 'training' },
  { pattern: /FacebookBot|facebookexternalhit/i, type: 'meta', name: 'FacebookBot', category: 'citation' },
  // Apple (Applebot-Extended is a robots.txt token only; Applebot does the crawling)
  { pattern: /Applebot/i,          type: 'apple',      name: 'Applebot',           category: 'citation' },
  // Amazon
  { pattern: /Amzn-User/i,         type: 'amazon',     name: 'Amzn-User',          category: 'agentic' },
  { pattern: /Amzn-SearchBot/i,    type: 'amazon',     name: 'Amzn-SearchBot',     category: 'citation' },
  { pattern: /Amazonbot/i,         type: 'amazon',     name: 'Amazonbot',          category: 'citation' },
  // Mistral: -User fetches for a user, -Index feeds Mistral search, -Training collects training data
  { pattern: /MistralAI-User/i,    type: 'mistral',    name: 'MistralAI-User',     category: 'agentic' },
  { pattern: /MistralAI-Index/i,   type: 'mistral',    name: 'MistralAI-Index',    category: 'citation' },
  { pattern: /MistralAI/i,         type: 'mistral',    name: 'MistralAI',          category: 'training' },
  // Moonshot AI (Kimi)
  { pattern: /Kimi-User/i,         type: 'kimi',       name: 'Kimi-User',          category: 'agentic' },
  { pattern: /Kimi-SearchBot/i,    type: 'kimi',       name: 'Kimi-SearchBot',     category: 'citation' },
  { pattern: /KimiBot/i,           type: 'kimi',       name: 'KimiBot',            category: 'training' },
  // ElevenLabs: ElevenlabsBot fetches pages a customer adds to an agent's knowledge base
  { pattern: /ElevenlabsBot/i,     type: 'elevenlabs', name: 'ElevenlabsBot',      category: 'agentic' },
  { pattern: /ElevenlabsCrawler/i, type: 'elevenlabs', name: 'ElevenlabsCrawler',  category: 'training' },
  // SB Intuitions (Sarashina): the search bot fetches for users and links sources; the other one trains
  { pattern: /SBIntuitions-SearchBot/i, type: 'sbintuitions', name: 'SBIntuitions-SearchBot', category: 'citation' },
  { pattern: /SBIntuitionsBot/i,   type: 'sbintuitions', name: 'SBIntuitionsBot',  category: 'training' },
  // You.com / DuckDuckGo / Exa / Naget — AI-answer and AI-search crawlers that cite sources
  { pattern: /YouBot/i,            type: 'youdotcom',  name: 'YouBot',             category: 'citation' },
  { pattern: /DuckAssistBot/i,     type: 'duckduckgo', name: 'DuckAssistBot',      category: 'citation' },
  { pattern: /ExaSearchBot/i,      type: 'exa',        name: 'ExaSearchBot',       category: 'citation' },
  { pattern: /NagetBot/i,          type: 'naget',      name: 'NagetBot',           category: 'citation' },
  // xAI
  { pattern: /Grok/i,              type: 'grok',       name: 'Grok',               category: 'agentic' },
  // Other training crawlers
  { pattern: /Bytespider/i,        type: 'bytedance',  name: 'Bytespider',         category: 'training' },
  { pattern: /CCBot/i,             type: 'commoncrawl',name: 'CCBot',              category: 'training' },
  { pattern: /Diffbot/i,           type: 'diffbot',    name: 'Diffbot',            category: 'training' },
  { pattern: /cohere-training-data-crawler/i, type: 'cohere', name: 'cohere-training-data-crawler', category: 'training' },
  { pattern: /cohere-ai/i,         type: 'cohere',     name: 'cohere-ai',          category: 'training' },
  { pattern: /DeepSeek/i,          type: 'deepseek',   name: 'DeepSeek',           category: 'training' },
  { pattern: /AI2Bot/i,            type: 'ai2',        name: 'AI2Bot',             category: 'training' },
  { pattern: /QwenBot/i,           type: 'qwen',       name: 'QwenBot',            category: 'training' },
  { pattern: /ChatGLM-Spider/i,    type: 'zhipu',      name: 'ChatGLM-Spider',     category: 'training' },
  { pattern: /HySpider/i,          type: 'tencent',    name: 'HySpider',           category: 'training' },
  { pattern: /YiBot/i,             type: '01ai',       name: 'YiBot',              category: 'training' },
  { pattern: /Reflectionbot/i,     type: 'reflection', name: 'Reflectionbot',      category: 'training' },
  { pattern: /Cotoyogi/i,          type: 'cotoyogi',   name: 'Cotoyogi',           category: 'training' },
  { pattern: /ICC-Crawler/i,       type: 'nict',       name: 'ICC-Crawler',        category: 'training' },
  { pattern: /Timpibot/i,          type: 'timpi',      name: 'Timpibot',           category: 'training' },
  { pattern: /VelenPublicWebCrawler/i, type: 'velen',  name: 'VelenPublicWebCrawler', category: 'training' },
  { pattern: /ImagesiftBot/i,      type: 'imagesift',  name: 'ImagesiftBot',       category: 'training' },
  { pattern: /omgili/i,            type: 'webzio',     name: 'omgili',             category: 'training' },
];

// robots.txt product tokens that never arrive as a User-Agent: they only tell an existing crawler what the
// content it already fetches may be used for. Read them in robots.txt (geo/site-checks.ts), never in traffic,
// so they stay out of AI_BOT_REGISTRY and out of copy about observed visits. Value = the crawler that fetches.
export const ROBOTS_TXT_ONLY_TOKENS: Readonly<Record<string, string>> = {
  'Google-Extended': 'Googlebot',   // developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers
  'Applebot-Extended': 'Applebot',  // support.apple.com/en-us/119829
};

// NOTE on agentic browsers (Perplexity Comet, ChatGPT Atlas in browse mode, Claude
// for Chrome): these deliberately send a stock Chrome user-agent and are NOT reliably
// distinguishable by UA — matching e.g. /Comet/ or /Atlas/ would either never fire or
// false-positive on real Chrome users. We catch their *agent fetches* via the vendor
// "-User" tokens above (ChatGPT-User / Claude-User / Perplexity-User); genuine in-browser
// human-like traffic is left to the signal-based 'agentic' classification (jsExecuted &&
// isVisual) in the JS-tag path, never a UA regex. Server logs cannot see those signals,
// so the server-side path captures only the UA-detectable bots — which is precisely the
// training + citation crawlers the JS tag is blind to.

// Generic (non-AI) bot fallback.
export const GENERIC_BOT_PATTERN = /bot|crawler|spider|scraper/i;

export interface BotClassification {
  botType: string;
  botName: string;
  botCategory: BotCategory | null;
  /** true only when a specific AI-vendor signature in AI_BOT_REGISTRY matched.
   *  false for the generic-crawler fallback and for no match. Use this to decide
   *  whether a server-log hit belongs in the AI-bot store (registry hits only) vs.
   *  the generic scraper/monitoring buckets. */
  registryMatch: boolean;
}

/**
 * Classify a user-agent string using the canonical registry.
 *
 * - Registry hit  → the vendor bot's type/name/category, `registryMatch: true`.
 * - Generic bot   → { 'other', 'Other Bot', 'citation' }, `registryMatch: false`
 *                   (unknown crawler treated as a visibility signal, not training).
 * - No match      → { 'other', 'Unknown Bot', null }, `registryMatch: false`.
 *
 * Preserves the exact behavior previously inlined in ai-bot-tracker.
 */
export function classifyBot(ua: string): BotClassification {
  const matched = AI_BOT_REGISTRY.find(sig => sig.pattern.test(ua));
  if (matched) {
    return { botType: matched.type, botName: matched.name, botCategory: matched.category, registryMatch: true };
  }
  if (GENERIC_BOT_PATTERN.test(ua)) {
    return { botType: 'other', botName: 'Other Bot', botCategory: 'citation', registryMatch: false };
  }
  return { botType: 'other', botName: 'Unknown Bot', botCategory: null, registryMatch: false };
}

/** Value for ai_bot_traffic.bot_category: the registry category, or 'other' for anything the
 *  registry does not know (the generic fallback's 'citation' is a guess, not a classification). */
export function storedBotCategory(c: { botCategory: BotCategory | null; registryMatch: boolean }): BotCategory | 'other' {
  return c.registryMatch && c.botCategory ? c.botCategory : 'other';
}

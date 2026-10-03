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
  // Google
  { pattern: /Google-Extended/i,   type: 'gemini',     name: 'Google-Extended',    category: 'training' },
  { pattern: /GoogleOther/i,       type: 'gemini',     name: 'GoogleOther',        category: 'citation' },
  { pattern: /Googlebot/i,         type: 'gemini',     name: 'Googlebot',          category: 'citation' },
  // Microsoft / Bing
  { pattern: /bingbot|BingPreview/i, type: 'bingbot',  name: 'Bingbot',            category: 'citation' },
  // Meta
  { pattern: /Meta-ExternalAgent/i, type: 'meta',      name: 'Meta-ExternalAgent', category: 'training' },
  { pattern: /FacebookBot|facebookexternalhit/i, type: 'meta', name: 'FacebookBot', category: 'citation' },
  // Apple
  { pattern: /Applebot-Extended/i, type: 'apple',      name: 'Applebot-Extended',  category: 'training' },
  { pattern: /Applebot/i,          type: 'apple',      name: 'Applebot',           category: 'citation' },
  // You.com / DuckDuckGo — AI-answer crawlers that fetch in real time and cite sources
  { pattern: /YouBot/i,            type: 'youdotcom',  name: 'YouBot',             category: 'citation' },
  { pattern: /DuckAssistBot/i,     type: 'duckduckgo', name: 'DuckAssistBot',      category: 'citation' },
  // xAI
  { pattern: /Grok/i,              type: 'grok',       name: 'Grok',               category: 'agentic' },
  // Other training crawlers
  { pattern: /Amazonbot/i,         type: 'amazon',     name: 'Amazonbot',          category: 'citation' },
  { pattern: /Bytespider/i,        type: 'bytedance',  name: 'Bytespider',         category: 'training' },
  { pattern: /CCBot/i,             type: 'commoncrawl',name: 'CCBot',              category: 'training' },
  { pattern: /Diffbot/i,           type: 'diffbot',    name: 'Diffbot',            category: 'training' },
  { pattern: /cohere-ai/i,         type: 'cohere',     name: 'cohere-ai',          category: 'training' },
  { pattern: /DeepSeek/i,          type: 'deepseek',   name: 'DeepSeek',           category: 'training' },
  { pattern: /MistralAI/i,         type: 'mistral',    name: 'MistralAI',          category: 'training' },
];

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

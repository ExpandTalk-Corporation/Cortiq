/**
 * Frontend view of the canonical AI-bot registry.
 *
 * The registry itself lives in supabase/functions/_shared/ai-bot-registry.ts and is what
 * the ingest paths (ai-bot-tracker, cloudflare-ingest) classify with. Marketing pages,
 * the ontology and dashboard labels import it from here instead of keeping their own
 * bot lists, so what we claim to detect is exactly what we detect.
 */
import {
  AI_BOT_REGISTRY,
  classifyBot,
  type BotCategory,
  type BotSignature,
} from '../../supabase/functions/_shared/ai-bot-registry.ts';

export { AI_BOT_REGISTRY, classifyBot };
export type { BotCategory, BotSignature };

export const BOT_CATEGORIES: BotCategory[] = ['training', 'agentic', 'citation'];

export const BOT_CATEGORY_META: Record<BotCategory, { label: string; description: string }> = {
  training: {
    label: 'Training Crawlers',
    description: 'Crawl content to build or refresh model corpora. Infrastructure cost, no referral value.',
  },
  agentic: {
    label: 'Agentic Fetches',
    description: 'An AI assistant fetching a page on behalf of a real user. Real intent — treat like a visitor.',
  },
  citation: {
    label: 'Citation & Search Crawlers',
    description: 'Index content for AI-powered and traditional search answers. Visibility signal.',
  },
};

/** Registry `type` → vendor display name. */
export const BOT_VENDORS: Record<string, string> = {
  chatgpt: 'OpenAI',
  claude: 'Anthropic',
  perplexity: 'Perplexity',
  gemini: 'Google',
  bingbot: 'Microsoft',
  meta: 'Meta',
  apple: 'Apple',
  youdotcom: 'You.com',
  duckduckgo: 'DuckDuckGo',
  grok: 'xAI',
  amazon: 'Amazon',
  bytedance: 'ByteDance',
  commoncrawl: 'Common Crawl',
  diffbot: 'Diffbot',
  cohere: 'Cohere',
  deepseek: 'DeepSeek',
  mistral: 'Mistral AI',
};

export const vendorOf = (sig: BotSignature): string => BOT_VENDORS[sig.type] ?? sig.type;

export const botsInCategory = (category: BotCategory): BotSignature[] =>
  AI_BOT_REGISTRY.filter(sig => sig.category === category);

/** Number of named AI/search bot signatures the ingest pipeline classifies. */
export const REGISTRY_BOT_COUNT = AI_BOT_REGISTRY.length;

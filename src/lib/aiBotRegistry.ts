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
import { AGENT_CLASSES, BOT_VENDORS, CATEGORY_CLASS, vendorOf } from '../../supabase/functions/_shared/agent-ontology.ts';

export { AI_BOT_REGISTRY, classifyBot };
export type { BotCategory, BotSignature };

export const BOT_CATEGORIES: BotCategory[] = ['training', 'agentic', 'citation'];

/** Labels and descriptions come from the agent ontology's category classes. */
export const BOT_CATEGORY_META: Record<BotCategory, { label: string; description: string }> = Object.fromEntries(
  BOT_CATEGORIES.map((c) => [c, { label: AGENT_CLASSES[CATEGORY_CLASS[c]].label, description: AGENT_CLASSES[CATEGORY_CLASS[c]].description }]),
) as Record<BotCategory, { label: string; description: string }>;

export { BOT_VENDORS, vendorOf };

export const botsInCategory = (category: BotCategory): BotSignature[] =>
  AI_BOT_REGISTRY.filter(sig => sig.category === category);

/** Number of named AI/search bot signatures the ingest pipeline classifies. */
export const REGISTRY_BOT_COUNT = AI_BOT_REGISTRY.length;

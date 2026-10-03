import type { AgentConcept } from './types';
import {
  AI_BOT_REGISTRY,
  BOT_CATEGORY_META,
  vendorOf,
  type BotCategory,
} from '@/lib/aiBotRegistry';

/**
 * Agent ontology — who or what generates web traffic.
 *
 * The AI-bot leaves are generated from the canonical ingest registry
 * (supabase/functions/_shared/ai-bot-registry.ts), so the ontology can never
 * drift from how traffic is actually classified. Do not hand-add bot instances
 * here — add them to the registry.
 *
 * Hierarchy:
 *   web_agent
 *   ├── human_visitor
 *   └── automated_agent
 *       └── ai_agent
 *           ├── training_crawler   (GPTBot, ClaudeBot, Google-Extended, …)
 *           ├── agentic_agent      (ChatGPT-User, Claude-User, Perplexity-User, …)
 *           └── citation_crawler   (OAI-SearchBot, PerplexityBot, Googlebot, …)
 */

/** Ontology class ID for each registry category. */
export const CATEGORY_CLASS: Record<BotCategory, string> = {
  training: 'training_crawler',
  agentic: 'agentic_agent',
  citation: 'citation_crawler',
};

/** Stable concept ID for a registry bot name, e.g. "ChatGPT-User" → "chatgpt_user". */
export const agentIdFor = (botName: string): string =>
  botName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

const instances: Record<string, AgentConcept> = {};
const childrenOf: Record<BotCategory, string[]> = { training: [], agentic: [], citation: [] };

// Registry order is most-specific-first; object insertion order preserves it.
for (const sig of AI_BOT_REGISTRY) {
  const id = agentIdFor(sig.name);
  instances[id] = {
    id,
    kind: 'agent-instance',
    label: sig.name,
    description: `${vendorOf(sig)} — ${BOT_CATEGORY_META[sig.category].label.toLowerCase()}.`,
    parent: CATEGORY_CLASS[sig.category],
    vendor: sig.type,
    uaPatterns: [sig.pattern.source],
  };
  childrenOf[sig.category].push(id);
}

const categoryClass = (category: BotCategory): AgentConcept => ({
  id: CATEGORY_CLASS[category],
  kind: 'agent-class',
  label: BOT_CATEGORY_META[category].label,
  description: BOT_CATEGORY_META[category].description,
  parent: 'ai_agent',
  children: childrenOf[category],
});

export const agents: Record<string, AgentConcept> = {

  /* ── Abstract roots ──────────────────────────────────────────── */

  web_agent: {
    id: 'web_agent',
    kind: 'agent-class',
    label: 'Web Agent',
    description: 'Any entity that generates an HTTP request to a tracked site.',
    children: ['human_visitor', 'automated_agent'],
  },

  human_visitor: {
    id: 'human_visitor',
    kind: 'agent-class',
    label: 'Human Visitor',
    description: 'A person browsing with a regular browser.',
    parent: 'web_agent',
  },

  automated_agent: {
    id: 'automated_agent',
    kind: 'agent-class',
    label: 'Automated Agent',
    description: 'Software that requests pages without a human driving each request.',
    parent: 'web_agent',
    children: ['ai_agent'],
  },

  ai_agent: {
    id: 'ai_agent',
    kind: 'agent-class',
    label: 'AI Agent',
    description: 'Crawlers and fetchers operated by AI vendors, classified into training, agentic and citation.',
    parent: 'automated_agent',
    children: Object.values(CATEGORY_CLASS),
  },

  /* ── Category classes (mirror ai_bot_traffic.request_type) ───── */

  training_crawler: categoryClass('training'),
  agentic_agent: categoryClass('agentic'),
  citation_crawler: categoryClass('citation'),

  /* ── Instances, generated from the registry ──────────────────── */

  ...instances,
};

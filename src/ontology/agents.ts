import type { AgentConcept } from './types';
import {
  AGENT_CLASSES,
  AI_BOT_REGISTRY_SIZE,
  CATEGORY_CLASS,
  botCatalog,
} from '../../supabase/functions/_shared/agent-ontology.ts';

/**
 * Agent ontology — who or what generates web traffic.
 *
 * Classes and instances come from the master in supabase/functions/_shared/agent-ontology.ts,
 * which also generates bot_catalog and the visitor_type CHECKs (scripts/gen-ontology-sql.mjs).
 * AI-bot leaves come from the canonical ingest registry (_shared/ai-bot-registry.ts). Do not
 * hand-add classes or instances here.
 */

export { CATEGORY_CLASS };

/** Stable concept ID for a bot name, e.g. "ChatGPT-User" → "chatgpt_user". */
export const agentIdFor = (botName: string): string =>
  botName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

const classes: Record<string, AgentConcept> = {};
for (const c of Object.values(AGENT_CLASSES)) {
  classes[c.id] = { id: c.id, kind: 'agent-class', label: c.label, description: c.description, ...(c.parent ? { parent: c.parent } : {}) };
}

const instances: Record<string, AgentConcept> = {};
// Catalog order is match order (registry most-specific-first, then other bots).
botCatalog().forEach((b, i) => {
  // Registry bots keep their name-based ID (detectAgent); other bots use their catalog slug.
  const id = agentIdFor(i < AI_BOT_REGISTRY_SIZE ? b.name : b.slug);
  instances[id] = {
    id,
    kind: 'agent-instance',
    label: b.name,
    description: b.description,
    parent: b.category,
    ...(b.vendor ? { vendor: b.vendor } : {}),
    uaPatterns: b.uaPatterns,
  };
});

for (const concept of [...Object.values(classes), ...Object.values(instances)]) {
  if (!concept.parent) continue;
  const parent = classes[concept.parent];
  parent.children = [...(parent.children ?? []), concept.id];
}

export const agents: Record<string, AgentConcept> = { ...classes, ...instances };

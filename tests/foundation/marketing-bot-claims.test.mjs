// Guards marketing copy against naming AI bots the ingest pipeline does not classify.
// Any "<Something>Bot" token on a public page or llms file must be a registry bot name
// (supabase/functions/_shared/ai-bot-registry.ts) or on the explicit allowlist below.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { AI_BOT_REGISTRY } from '../../supabase/functions/_shared/ai-bot-registry.ts';

const root = new URL('../../', import.meta.url);
const files = [
  ...readdirSync(new URL('src/pages/', root)).filter(f => f.endsWith('.tsx')).map(f => `src/pages/${f}`),
  ...readdirSync(new URL('src/content/', root)).filter(f => f.endsWith('.ts')).map(f => `src/content/${f}`),
  'public/llms.txt',
  'public/llms-full.txt',
];

// Generic words and non-crawler products that match the pattern but are not AI bot names.
const ALLOWLIST = new Set(['Chatbot', 'ChatBot', 'Robot', 'AI-bot', 'AI-Bot', 'Per-bot', 'Cookiebot']);
const registryNames = new Set(AI_BOT_REGISTRY.map(b => b.name.toLowerCase()));

test('public pages only name AI bots that the registry classifies', () => {
  const unknown = [];
  for (const file of files) {
    const text = readFileSync(new URL(file, root), 'utf8');
    for (const [token] of text.matchAll(/(?<![\w-])[A-Z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*?-?[Bb]ot\b/g)) {
      if (ALLOWLIST.has(token) || registryNames.has(token.toLowerCase())) continue;
      unknown.push(`${file}: ${token}`);
    }
  }
  assert.deepEqual([...new Set(unknown)], [], 'Add the bot to ai-bot-registry.ts or remove it from the copy');
});

test('registry categories are the three documented ones', () => {
  for (const b of AI_BOT_REGISTRY) assert.ok(['training', 'agentic', 'citation'].includes(b.category), b.name);
});

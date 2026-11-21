// tests/foundation/ai-bot-citation-crawlers.test.mjs
// "Citation requests" on the AI bots tab counts citation crawlers from the bot registry.
// ai_citations held human AI-referral visits and is no longer read
// (20261212000001_ai_bot_citation_crawlers.sql); those visits are ai_search_traffic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('PostgreSQL: citation requests = registry citation crawlers, owner only', async () => {
  const db = new PGlite();
  const sql = read('./ai-bot-citation-crawlers.sql').replace(/^\\ir \.\.\/\.\.\/(.*)$/gm, (_, p) => read(`../../${p}`));
  try {
    await assert.doesNotReject(db.exec(sql));
  } finally {
    await db.close();
  }
});

test('no app code reads ai_citations', () => {
  for (const p of [
    '../../src/hooks/useAIBotTracking.tsx',
    '../../src/components/dashboard/tabs/AIBotTab.tsx',
    '../../src/components/dashboard/tabs/KPICatalogTab.tsx',
    '../../src/hooks/useKPIMetrics.tsx',
    '../../supabase/functions/ai-bot-tracker/index.ts',
  ]) assert.doesNotMatch(read(p), /ai_citations|citationCtr/, p);
});

test('the AI bots tab and KPI catalog do not call crawler requests citations of content', () => {
  const tab = read('../../src/components/dashboard/tabs/AIBotTab.tsx');
  assert.doesNotMatch(tab, />\s*Citation Requests\s*</);
  const kpi = read('../../src/hooks/useKPIMetrics.tsx');
  assert.doesNotMatch(kpi, /cited or referenced by AI systems in their responses/);
});

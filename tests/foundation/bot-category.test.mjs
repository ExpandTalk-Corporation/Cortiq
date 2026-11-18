// tests/foundation/bot-category.test.mjs
// Spec 2026-11-18 phase 1 AC7: bot_category comes from the registry on every new ai_bot_traffic row.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { classifyBot, storedBotCategory } from '../../supabase/functions/_shared/ai-bot-registry.ts';

test('storedBotCategory: registry bots get their category, everything else other', () => {
  assert.equal(storedBotCategory(classifyBot('Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)')), 'training');
  assert.equal(storedBotCategory(classifyBot('Mozilla/5.0 ChatGPT-User/1.0')), 'agentic');
  assert.equal(storedBotCategory(classifyBot('Mozilla/5.0 PerplexityBot/1.0')), 'citation');
  // The generic fallback says "citation" without a registry match; it must not be stored as such.
  const generic = classifyBot('SomeCrawler/1.0 bot');
  assert.equal(generic.registryMatch, false);
  assert.equal(storedBotCategory(generic), 'other');
});

test('all three ai_bot_traffic writers set bot_category through storedBotCategory', () => {
  for (const fn of ['ai-bot-tracker', 'server-hit', 'cloudflare-ingest']) {
    const src = readFileSync(`supabase/functions/${fn}/index.ts`, 'utf8');
    const insert = src.slice(src.indexOf("from('ai_bot_traffic')") - 400, src.indexOf("from('ai_bot_traffic')") + 1200);
    assert.match(src, /storedBotCategory/, fn);
    assert.match(src, /bot_category:\s/, `${fn} writes bot_category`);
    assert.ok(insert.length > 0);
  }
});

test('PostgreSQL: backfill maps request_type for registry rows, leaves others as other', async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`CREATE TABLE public.ai_bot_traffic (id serial, bot_name text, request_type text, bot_category text DEFAULT 'other');
      INSERT INTO ai_bot_traffic (bot_name, request_type) VALUES
        ('GPTBot','training'), ('ChatGPT-User','agentic'), ('PerplexityBot','citation'),
        ('Honeypot visitor','unknown'), ('X','unknown'), ('Y', NULL);`);
    await pg.exec(readFileSync('supabase/migrations/20261202000004_bot_category_backfill.sql', 'utf8'));
    const rows = (await pg.query(`SELECT bot_name, bot_category FROM ai_bot_traffic ORDER BY id`)).rows;
    assert.deepEqual(rows.map((r) => r.bot_category), ['training', 'agentic', 'citation', 'other', 'other', 'other']);
  } finally { await pg.close(); }
});

// tests/foundation/ontology-sql.test.mjs
// The agent ontology (supabase/functions/_shared/agent-ontology.ts) is the master for bot classes
// and visitor types; bot_catalog and the CHECKs are generated from it by scripts/gen-ontology-sql.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { renderOntologySql, latestSyncMigration, integrationTypes } from '../../scripts/gen-ontology-sql.mjs';
import {
  AGENT_CLASSES, BOT_CLASSES, VISITOR_TYPES, botCatalog, classifyAgent, visitorTypeFor, isA,
} from '../../supabase/functions/_shared/agent-ontology.ts';
import { AI_BOT_REGISTRY } from '../../supabase/functions/_shared/ai-bot-registry.ts';
import { agents } from '../../src/ontology/agents.ts';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const uaFor = (pattern) => `Mozilla/5.0 (compatible; ${pattern}/1.0; +https://example.com/bot)`;

test('the latest *_ontology_sync.sql is what the ontology renders (run node scripts/gen-ontology-sql.mjs)', () => {
  const latest = latestSyncMigration();
  assert.ok(latest, 'no *_ontology_sync.sql migration');
  assert.equal(latest.sql, renderOntologySql(), `${latest.file} is out of sync with the ontology`);
});

test('ontology classes form one tree and bot classes are its automated leaves', () => {
  for (const c of Object.values(AGENT_CLASSES)) {
    if (c.parent) assert.ok(AGENT_CLASSES[c.parent], `${c.id}: unknown parent ${c.parent}`);
    assert.ok(isA(c.id, 'web_agent'), `${c.id} is not under web_agent`);
  }
  assert.ok(BOT_CLASSES.length >= 3);
  for (const id of BOT_CLASSES) {
    assert.ok(isA(id, 'automated_agent'), `${id}`);
    assert.ok(!Object.values(AGENT_CLASSES).some((c) => c.parent === id), `${id} has children`);
  }
});

test('bot catalog: registry first in order, unique slugs, known classes, LIKE-safe patterns', () => {
  const bots = botCatalog();
  assert.deepEqual(bots.slice(0, AI_BOT_REGISTRY.length).map((b) => b.name), AI_BOT_REGISTRY.map((s) => s.name));
  assert.equal(new Set(bots.map((b) => b.slug)).size, bots.length, 'duplicate slug');
  for (const b of bots) {
    assert.ok(BOT_CLASSES.includes(b.category), `${b.slug}: ${b.category}`);
    assert.ok(b.uaPatterns.length > 0, b.slug);
    // A regex metacharacter or LIKE wildcard would make the SQL substring differ from the JS match.
    for (const p of b.uaPatterns) assert.match(p, /^[A-Za-z0-9 _.\-\/]+$/, `${b.slug}: ${p}`);
    for (const p of b.uaPatterns) assert.ok(!p.includes('_') || b.slug === 'ia-archiver', `${b.slug}: '_' is a LIKE wildcard`);
  }
  for (const id of Object.keys(agents)) assert.match(id, /^[a-z0-9_]+$/);
});

test('every class has exactly one stored visitor_type per table', () => {
  for (const [table, map] of Object.entries(VISITOR_TYPES)) {
    for (const ids of Object.values(map)) for (const id of ids) assert.ok(AGENT_CLASSES[id], `${table}: unknown class ${id}`);
    for (const id of Object.keys(AGENT_CLASSES)) {
      const direct = Object.keys(map).filter((v) => map[v].includes(id));
      assert.ok(direct.length <= 1, `${table}: ${id} listed under ${direct.join(', ')}`);
      assert.ok(Object.keys(map).includes(visitorTypeFor(table, id)), `${table}: ${id}`);
    }
  }
  assert.equal(visitorTypeFor('cloudflare_traffic', 'agentic_agent'), 'ai_bot');
  assert.equal(visitorTypeFor('cloudflare_traffic', 'seo_tool'), 'search_crawler');
  assert.equal(visitorTypeFor('unified_visitors', 'monitoring'), 'bot');
});

test('classifyAgent: every catalog bot by its own pattern; browsers, fallbacks and empty UAs', () => {
  for (const b of botCatalog()) {
    for (const p of b.uaPatterns) assert.deepEqual(classifyAgent(uaFor(p)), { classId: b.category, botName: b.name }, p);
  }
  const chrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
  assert.deepEqual(classifyAgent(chrome), { classId: 'human_visitor', botName: null });
  assert.deepEqual(classifyAgent('SomeNewCrawler/2.0'), { classId: 'generic_bot', botName: 'Generic bot' });
  assert.deepEqual(classifyAgent(null), { classId: 'web_agent', botName: null });
  assert.deepEqual(classifyAgent('MistralAI-User/1.0'), { classId: 'agentic_agent', botName: 'MistralAI-User' });
});

test('cloudflare-ingest classifies through the ontology, not its own bot lists', () => {
  const src = read('../../supabase/functions/cloudflare-ingest/index.ts');
  assert.match(src, /from "\.\.\/_shared\/agent-ontology\.ts"/);
  for (const list of ['AI_BOTS', 'SEARCH_CRAWLERS', 'SCRAPERS', 'MONITORING']) assert.doesNotMatch(src, new RegExp(`\\b${list}\\b`));
});

test('build fails on drift: gen-ontology-sql --check runs first in npm run build', () => {
  const { scripts } = JSON.parse(read('../../package.json'));
  assert.match(scripts.build, /^node scripts\/gen-ontology-sql\.mjs --check && /);
});

// Minimal pre-sync schema with the old CHECKs and a few old catalog rows.
const FIXTURE = `
CREATE TABLE public.bot_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE, display_name text NOT NULL,
  category text NOT NULL CONSTRAINT bot_catalog_category_check CHECK (category IN
    ('ai_agent','search_crawler','seo_tool','monitoring','training_crawler','generic_bot')),
  ua_patterns text[] NOT NULL DEFAULT '{}', ip_ranges text[] NOT NULL DEFAULT '{}', description text, vendor text,
  is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.bot_detections (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_catalog_id uuid REFERENCES public.bot_catalog(id), bot_name text NOT NULL, bot_category text NOT NULL);
CREATE TABLE public.unified_visitors (id serial PRIMARY KEY, visitor_type text NOT NULL DEFAULT 'unknown');
CREATE TABLE public.cloudflare_traffic (id serial PRIMARY KEY, visitor_type text NOT NULL
  CONSTRAINT cloudflare_traffic_visitor_type_check CHECK (visitor_type IN ('human','search_crawler','ai_bot','scraper','monitoring','unknown')));
CREATE TABLE public.company_integrations (id serial PRIMARY KEY, integration_type text NOT NULL);
INSERT INTO public.bot_catalog (name, display_name, category, ua_patterns, created_at) VALUES
  ('google-extended', 'Google-Extended', 'ai_agent', ARRAY['Google-Extended'], now() - interval '2 days'),
  ('claudebot', 'ClaudeBot', 'ai_agent', ARRAY['ClaudeBot'], now() - interval '1 day');
INSERT INTO public.bot_detections (bot_catalog_id, bot_name, bot_category)
  SELECT id, name, category FROM public.bot_catalog;
INSERT INTO public.unified_visitors (visitor_type) VALUES ('unknown'), ('human'), ('ai_agent');
`;

test('PostgreSQL: sync migration rewrites the catalog and match_bot follows ontology order', async () => {
  const db = new PGlite();
  try {
    await db.exec(FIXTURE);
    await db.exec(read('../../supabase/migrations/20261214000001_bot_catalog_match_order.sql'));
    await db.exec(latestSyncMigration().sql);
    // Applying the same state again is a no-op.
    await db.exec(latestSyncMigration().sql);

    const bots = botCatalog();
    const { rows: count } = await db.query('SELECT count(*)::int AS n FROM public.bot_catalog');
    assert.equal(count[0].n, bots.length);

    const { rows: det } = await db.query('SELECT bot_name, bot_catalog_id, bot_category FROM public.bot_detections ORDER BY bot_name');
    assert.deepEqual(det.map((r) => [r.bot_name, r.bot_catalog_id === null, r.bot_category]),
      [['claudebot', false, 'ai_agent'], ['google-extended', true, 'ai_agent']]);

    for (const b of bots) {
      for (const p of b.uaPatterns) {
        const { rows } = await db.query('SELECT bot_name, bot_category FROM public.match_bot($1)', [uaFor(p)]);
        assert.deepEqual(rows[0], { bot_name: b.slug, bot_category: b.category }, p);
      }
    }
    const { rows: mistral } = await db.query("SELECT bot_name FROM public.match_bot('MistralAI-User/1.0')");
    assert.equal(mistral[0].bot_name, 'mistralai-user');

    await assert.rejects(db.exec("INSERT INTO public.unified_visitors (visitor_type) VALUES ('robot')"), /visitor_type_check/);
    await assert.rejects(db.exec("INSERT INTO public.cloudflare_traffic (visitor_type) VALUES ('bot')"), /visitor_type_check/);
    await assert.rejects(db.exec("INSERT INTO public.company_integrations (integration_type) VALUES ('hubspot')"), /integration_type_check/);
    for (const t of integrationTypes()) await db.query('INSERT INTO public.company_integrations (integration_type) VALUES ($1)', [t]);
    await assert.rejects(db.exec("UPDATE public.bot_catalog SET category = 'ai_agent' WHERE name = 'gptbot'"), /category_check/);
  } finally {
    await db.close();
  }
});

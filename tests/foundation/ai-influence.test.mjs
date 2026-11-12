// tests/foundation/ai-influence.test.mjs
// Attribution layer 2: AI influence and brand signals (20261127000001_ai_influence.sql,
// docs/superpowers/specs/2026-11-12-attribution-models-and-ai-influence.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { traffic } from '../../src/ontology/traffic.ts';
import { parseAiInfluence, aiInfluenceTotals, aiReadShare, brandClickShare } from '../../src/lib/aiInfluence.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const migration = read('../../supabase/migrations/20261127000001_ai_influence.sql');

test('PostgreSQL: get_ai_influence counts signals per day, page and brand, owner only', async () => {
  const db = new PGlite();
  const sql = read('./ai-influence.sql').replace(/^\\ir \.\.\/\.\.\/(.*)$/gm, (_, p) => read(`../../${p}`));
  try {
    await assert.doesNotReject(db.exec(sql));
  } finally {
    await db.close();
  }
});

test('the SQL AI referral list matches the ai_search_referral children in the traffic ontology', () => {
  const children = traffic.ai_search_referral.children.map((id) => traffic[id]);
  const fn = migration.match(/FUNCTION public\.is_ai_assistant_referral[\s\S]*?\$\$;/)[0];
  for (const c of children) {
    for (const host of c.referrerPatterns ?? []) assert.ok(fn.includes(host.replace(/\./g, '\\.')), `referrer ${host} missing`);
    for (const utm of c.utmSources ?? []) assert.ok(fn.includes(`'${utm}'`), `utm_source ${utm} missing`);
  }
});

test('training crawlers are left out and the dead bot_category column is not used', () => {
  assert.match(migration, /request_type IN \('agentic', 'citation'\)/);
  assert.doesNotMatch(migration, /bot_category/);
});

test('parseAiInfluence fills gaps; totals and shares', () => {
  const empty = parseAiInfluence(null);
  assert.deepEqual(empty.daily, []);
  assert.equal(empty.brand, null);
  assert.equal(aiReadShare(empty.conversions), null);

  const d = parseAiInfluence({
    windowDays: 7,
    daily: [{ day: '2026-11-05', agentic: 1, citation: '2', referrals: 3 }, { day: '2026-11-06', agentic: 2 }],
    conversions: { total: 4, onAiReadPages: 1 },
    brand: [{ periodStart: '2026-11-01', periodEnd: '2026-11-30', brandClicks: 1, otherClicks: 3 }],
  });
  assert.deepEqual(aiInfluenceTotals(d), { agentic: 3, citation: 2, referrals: 3 });
  assert.equal(aiReadShare(d.conversions), 25);
  assert.equal(brandClickShare(d.brand[0]), 25);
  assert.equal(brandClickShare({ ...d.brand[0], brandClicks: 0, otherClicks: 0 }), null);
});

test('the card says signal, never credit, and is shown in every Attribution state', () => {
  const card = read('../../src/components/dashboard/AiInfluenceCard.tsx');
  assert.match(card, /Signal, not credit/);
  assert.match(card, /correlation, not a cause/);
  assert.doesNotMatch(card, /drove|caused by AI|AI-driven/i);
  const tab = read('../../src/components/dashboard/tabs/AttributionTab.tsx');
  assert.equal((tab.match(/<AiInfluenceCard /g) ?? []).length, 3);
  const hook = read('../../src/hooks/useAiInfluence.ts');
  assert.match(hook, /rpc\('get_ai_influence'/);
  assert.match(hook, /queryKey: \['ai-influence', siteId, p_from, p_to, windowDays\]/);
});

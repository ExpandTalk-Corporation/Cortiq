// tests/foundation/reported-channel.test.mjs
// Attribution layer 1.5: self-reported source (20261210000001_reported_channel.sql,
// supabase/functions/_shared/reported-channel.ts, docs/superpowers/plans/2026-11-20-attribution-layer-1-5.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import {
  REPORTED_CHANNELS, REPORTED_CHANNEL_LABELS, cleanChannelMap, mapReportedChannel,
} from '../../supabase/functions/_shared/reported-channel.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const migration = read('../../supabase/migrations/20261210000001_reported_channel.sql');

test('PostgreSQL: storage gate, HubSpot write, observed channel and aggregate read', async () => {
  const db = new PGlite();
  const sql = read('./reported-channel.sql').replace(/^\\ir \.\.\/\.\.\/(.*)$/gm, (_, p) => read(`../../${p}`));
  try {
    await assert.doesNotReject(db.exec(sql));
  } finally {
    await db.close();
  }
});

test('the SQL category list equals the shared list', () => {
  const fn = migration.match(/FUNCTION public\.is_reported_channel[\s\S]*?\$\$;/)[0];
  const sqlList = [...fn.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual([...sqlList].sort(), [...REPORTED_CHANNELS].sort());
  assert.deepEqual(Object.keys(REPORTED_CHANNEL_LABELS).sort(), [...REPORTED_CHANNELS].sort());
});

test('mapping: trim + lower-case exact match, else other; nothing else', () => {
  const map = cleanChannelMap({ ' ChatGPT ': 'ai_assistant', Podcast: 'podcast', Bad: 'religion', 7: 'other' });
  assert.deepEqual(map, { chatgpt: 'ai_assistant', podcast: 'podcast', 7: 'other' });
  assert.equal(mapReportedChannel('  CHATGPT', map), 'ai_assistant');
  assert.equal(mapReportedChannel('Chat GPT', map), 'other');
  assert.equal(mapReportedChannel('', map), null);
  assert.equal(mapReportedChannel(42, map), null);
  assert.equal(mapReportedChannel('constructor', map), 'other');
  assert.deepEqual(cleanChannelMap(['x']), {});
  assert.deepEqual(cleanChannelMap(null), {});
  const big = Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`v${i}`, 'other']));
  assert.equal(Object.keys(cleanChannelMap(big)).length, 50);
});

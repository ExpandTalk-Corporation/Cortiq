import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('InsightText renders tokens through formatFact with a popover and a fallback', () => {
  const src = read('src/components/dashboard/ai/InsightText.tsx');
  assert.match(src, /splitTokens\(text\)/);
  assert.match(src, /formatFact\(fact\)/);
  assert.match(src, /PopoverContent/);
  assert.match(src, /Fact not found/);
  assert.ok(!/\{\{m/.test(src.replace(/\/\/.*$/gm, '')), 'never prints a raw token');
});

test('InsightCard loads data_snapshot facts and uses InsightText for title, description and actions', () => {
  const src = read('src/components/dashboard/ai/InsightCard.tsx');
  assert.match(src, /data_snapshot/);
  assert.equal((src.match(/<InsightText /g) ?? []).length, 3);
});

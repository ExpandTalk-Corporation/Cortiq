// generate-dashboard-insights must use Claude (Anthropic is the listed sub-processor), not OpenAI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../../supabase/functions/generate-dashboard-insights/index.ts', import.meta.url), 'utf8');

test('no OpenAI endpoint, key or model remains', () => {
  for (const banned of ['api.openai.com', 'OPENAI_API_KEY', 'gpt-4o', 'choices[0]']) {
    assert.ok(!src.includes(banned), `must not reference ${banned}`);
  }
});

test('calls the Anthropic Messages API with the documented headers', () => {
  assert.ok(src.includes("'https://api.anthropic.com/v1/messages'"));
  assert.ok(src.includes("'x-api-key'") && src.includes("'anthropic-version': '2023-06-01'"));
  assert.ok(src.includes("Deno.env.get('ANTHROPIC_API_KEY')"));
});

test('handles refusals and sends no sampling params (rejected on current models)', () => {
  assert.ok(src.includes("stop_reason === 'refusal'"));
  assert.ok(!/\btemperature\s*:/.test(src));
});

test('only URL paths, never query strings, reach the model', () => {
  assert.ok(src.includes('new URL(page.url') && src.includes('.pathname'));
});

test('token usage is read with Anthropic field names', () => {
  assert.ok(src.includes('usage?.input_tokens') && src.includes('usage?.output_tokens'));
  assert.ok(!src.includes('prompt_tokens') && !src.includes('completion_tokens'));
});

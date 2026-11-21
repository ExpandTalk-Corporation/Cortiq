// The registry only lists User-Agents that arrive in traffic. robots.txt-only control tokens
// (Google-Extended, Applebot-Extended) never do, so they must not be classified as visits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AI_BOT_REGISTRY, ROBOTS_TXT_ONLY_TOKENS, classifyBot } from '../../supabase/functions/_shared/ai-bot-registry.ts';

test('no registry entry is a robots.txt-only token', () => {
  for (const token of Object.keys(ROBOTS_TXT_ONLY_TOKENS)) {
    const named = AI_BOT_REGISTRY.find((s) => s.name.toLowerCase() === token.toLowerCase());
    assert.equal(named, undefined, `${token} is a robots.txt token, not a User-Agent`);
    assert.notEqual(classifyBot(token).botName, token);
    // The crawler that actually fetches for the token is classified.
    assert.ok(AI_BOT_REGISTRY.some((s) => s.name === ROBOTS_TXT_ONLY_TOKENS[token]));
  }
});

test('registry names are unique', () => {
  const names = AI_BOT_REGISTRY.map((s) => s.name);
  assert.deepEqual(names, [...new Set(names)]);
});

test('every registry name classifies as itself (most-specific-first order)', () => {
  for (const sig of AI_BOT_REGISTRY) {
    assert.equal(classifyBot(`Mozilla/5.0 (compatible; ${sig.name}/1.0)`).botName, sig.name, sig.name);
  }
});

test('vendor fetchers for a user are agentic, not training', () => {
  const ua = {
    'MistralAI-User': 'Mozilla/5.0 (compatible; MistralAI-User/1.0; +https://docs.mistral.ai/robots)',
    'Google-Agent': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Google-Agent; +https://developers.google.com/crawling/docs/crawlers-fetchers/google-agent) Chrome/139.0.0.0 Safari/537.36',
    'Meta-ExternalFetcher': 'meta-externalfetcher/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)',
    'Amzn-User': 'Mozilla/5.0 (compatible; Amzn-User/0.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.6045.214 Safari/537.36',
    'Kimi-User': 'Mozilla/5.0 (compatible; Kimi-User/1.0)',
  };
  for (const [name, s] of Object.entries(ua)) {
    const c = classifyBot(s);
    assert.equal(c.botName, name);
    assert.equal(c.botCategory, 'agentic', name);
  }
  assert.equal(classifyBot('Mozilla/5.0 (compatible; MistralAI-Training/1.0)').botCategory, 'training');
  assert.equal(classifyBot('Mozilla/5.0 (compatible; cohere-training-data-crawler/1.0)').botName, 'cohere-training-data-crawler');
});

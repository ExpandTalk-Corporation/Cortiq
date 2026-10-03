// GEO audit building blocks used by supabase/functions/geo-analyze.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scorePassage, extractBlocks, analyzeCitability } from '../../supabase/functions/_shared/geo/citability.ts';
import { parseRobots, checkLlmsTxt, checkRendering } from '../../supabase/functions/_shared/geo/site-checks.ts';

test('robots.txt: path disallows are normal, root disallow blocks, specific group beats *', () => {
  const access = parseRobots([
    'User-agent: *',
    'Disallow: /dashboard',
    '',
    'User-agent: GPTBot',
    'User-agent: CCBot',
    'Disallow: /',
    '',
    'User-agent: ClaudeBot',
    'Disallow: /',
    'Allow: /',
  ].join('\n'));
  assert.equal(access.PerplexityBot, 'allowed');
  assert.equal(access.GPTBot, 'blocked');
  assert.equal(access.CCBot, 'blocked');
  assert.equal(access.ClaudeBot, 'allowed');
});

test('robots.txt: a global Disallow: / blocks bots without their own group', () => {
  const access = parseRobots('User-agent: *\nDisallow: /\n\nUser-agent: OAI-SearchBot\nAllow: /\n');
  assert.equal(access.Bytespider, 'blocked');
  assert.equal(access['OAI-SearchBot'], 'allowed');
});

test('llms.txt structure check follows llmstxt.org', () => {
  const good = checkLlmsTxt('# CortIQ\n\n> Analytics for AI traffic.\n\n## Docs\n- [Getting started](https://cortiq.se/docs/)\n', true);
  assert.deepEqual(good.issues, []);
  const bare = checkLlmsTxt('CortIQ analytics https://cortiq.se', false);
  assert.ok(bare.issues.length >= 3);
  assert.equal(checkLlmsTxt(null, false).present, false);
});

test('rendering check flags an empty SPA shell', () => {
  assert.equal(checkRendering('<html><body><div id="root"></div><script src="/a.js"></script></body></html>').verdict, 'javascript-only');
  const words = Array.from({ length: 200 }, (_, i) => `word${i}`).join(' ');
  assert.equal(checkRendering(`<html><body><main><p>${words}</p></main></body></html>`).verdict, 'server-rendered');
});

test('citability: a self-contained, fact-rich answer passage beats vague text', () => {
  const strong = 'Agentic fetch is a request an AI assistant makes on behalf of a user. According to Cloudflare Radar, ' +
    'AI crawlers made 4.2% of HTML requests in 2025. For example, ChatGPT-User fetches a product page when a customer ' +
    'asks about it, and CortIQ records the visit with the page path and the assistant name. Training crawlers such as ' +
    'GPTBot behave differently: they collect content for model training and send no visitors back.';
  const weak = 'We think this is really great and they will like it a lot, and it helps them with that thing they do every day.';
  assert.ok(scorePassage(strong, 'What is an agentic fetch?').total > scorePassage(weak).total + 25);
});

test('citability: blocks are grouped under headings and nav/footer text is ignored', () => {
  const para = 'CortIQ classifies AI traffic into training crawlers, agentic fetches and citation crawlers for every site it measures.';
  const html = `<nav><p>${para} nav</p></nav><h2>How it works</h2><p>${para}</p><p>${para}</p><footer><p>${para}</p></footer>`;
  const blocks = extractBlocks(html);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].heading, 'How it works');
  const page = analyzeCitability(html);
  assert.equal(page.passages, 1);
  assert.ok(page.score > 0 && page.score <= 100);
});

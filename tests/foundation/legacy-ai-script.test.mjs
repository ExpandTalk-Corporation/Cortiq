// The legacy browser bot scripts ran before consent. They are retired to comments-only
// no-ops so old embeds neither 404 nor touch the visitor's device.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

for (const file of ['ai-tracking-unified.js', 'ai-bot-probe.js']) {
  test(`${file} is a no-op`, () => {
    const code = readFileSync(new URL(`../../public/${file}`, import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').trim();
    assert.equal(code, '', `${file} must contain no executable code`);
  });
}

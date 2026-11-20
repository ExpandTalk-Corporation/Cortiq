// tests/foundation/jurisdiction-legacy-removed.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { anonymizeIP } from '../../supabase/functions/_shared/ip.ts';

const FN = fileURLToPath(new URL('../../supabase/functions/', import.meta.url));
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });

test('anonymizeIP keeps the network part only', () => {
  assert.equal(anonymizeIP('203.0.113.9'), '203.0.113.0');
  assert.equal(anonymizeIP('203.0.113.9, 10.0.0.1'), '203.0.113.0');
  assert.equal(anonymizeIP('2001:db8:85a3:8d3:1319:8a2e:370:7348'), '2001:db8:85a3:0:0:0:0:0');
  assert.equal(anonymizeIP(null), null);
  assert.equal(anonymizeIP('garbage'), null);
});

test('AC1: the old jurisdiction module and pipeline modes are gone', () => {
  assert.equal(existsSync(join(FN, '_shared', 'jurisdiction.ts')), false);
  for (const f of walk(FN).filter((p) => p.endsWith('.ts'))) {
    const src = readFileSync(f, 'utf8');
    assert.doesNotMatch(src, /_shared\/jurisdiction\.ts|from '\.\/jurisdiction\.ts'/, f);
    assert.doesNotMatch(src, /PipelineMode|getPipelineMode|sanitizeForMode|effective_pipeline_mode/, f);
  }
});

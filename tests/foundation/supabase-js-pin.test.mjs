// tests/foundation/supabase-js-pin.test.mjs
// One supabase-js version for all Edge Functions, equal to the frontend's locked version.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const FUNCTIONS = new URL('../../supabase/functions/', import.meta.url);
const SHARED = 'supabase.ts';

function sources(dir, rel = '') {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) return sources(join(dir, e.name), r);
    return /\.(ts|js|mjs)$/.test(e.name) ? [r] : [];
  });
}

test('every Edge Function imports supabase-js only through _shared/supabase.ts', () => {
  const offenders = sources(FUNCTIONS.pathname.replace(/^\/([A-Za-z]:)/, '$1'))
    .filter((f) => f !== `_shared/${SHARED}`)
    .filter((f) => /from\s+['"][^'"]*@supabase\/supabase-js/.test(readFileSync(new URL(f, FUNCTIONS), 'utf8')));
  assert.deepEqual(offenders, []);
});

test('the pinned version equals the frontend lockfile version', () => {
  const shared = readFileSync(new URL(`_shared/${SHARED}`, FUNCTIONS), 'utf8');
  const pinned = [...shared.matchAll(/npm:@supabase\/supabase-js@(\d+\.\d+\.\d+)/g)].map((m) => m[1]);
  assert.ok(pinned.length > 0, 'exact version pinned');
  assert.equal(new Set(pinned).size, 1, 'one version in the shared module');
  const lock = JSON.parse(readFileSync(new URL('../../package-lock.json', import.meta.url), 'utf8'));
  assert.equal(pinned[0], lock.packages['node_modules/@supabase/supabase-js'].version);
});

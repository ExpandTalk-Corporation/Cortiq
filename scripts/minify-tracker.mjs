/**
 * Minifies public/spa-tracking.js → public/cortiq.js
 * Runs as the first step of `npm run build`.
 */

import { build } from 'esbuild';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

async function minify(srcRel, outRel) {
  const src = resolve(root, srcRel);
  const out = resolve(root, outRel);
  const srcSize = readFileSync(src).length;
  await build({
    entryPoints: [src],
    bundle: false,
    minify: true,
    outfile: out,
    target: ['es2020'],
    logLevel: 'silent',
  });
  const outSize = readFileSync(out).length;
  const saved = Math.round((1 - outSize / srcSize) * 100);
  const name = outRel.split('/').pop();
  console.log(`✓ ${name} — ${(outSize / 1024).toFixed(1)} KB minified (was ${(srcSize / 1024).toFixed(1)} KB, −${saved}%)`);
}

await minify('public/spa-tracking.js',    'public/cortiq.js');
await minify('public/consent-banner.js',  'public/consent-banner.min.js');

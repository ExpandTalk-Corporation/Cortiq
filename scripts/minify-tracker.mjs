/**
 * Minifies public/spa-tracking.js → public/cortiq.js, consent-banner.js → consent-banner.min.js
 * and one consent-banner.<lang>.js per banner language.
 * Runs as the first step of `npm run build`.
 */

import { build, transform } from 'esbuild';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';
import { readFileSync, writeFileSync } from 'fs';
import { bannerLanguages, singleLanguage } from './banner-languages.mjs';

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

// One minified banner per language, for sites with a fixed banner language (snippetTemplate.ts).
const banner = readFileSync(resolve(root, 'public/consent-banner.js'), 'utf8');
for (const lang of bannerLanguages(banner)) {
  const { code } = await transform(singleLanguage(banner, lang), { minify: true, target: 'es2020' });
  writeFileSync(resolve(root, `public/consent-banner.${lang}.js`), code);
}
console.log(`✓ consent-banner.<lang>.js — ${bannerLanguages(banner).join(', ')}`);

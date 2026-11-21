// Banner-language layer on /markets/: data from CLDR (committed), only banner languages, generated module current,
// static (no fetch, no external URLs), and the copy keeps language and market apart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildLangMap, renderLang } from '../../scripts/build-market-map.mjs';
import { LANG_COUNTRIES, LANG_PATHS } from '../../src/lib/bannerLangMapPaths.generated.ts';
import { BANNER_LANGS } from '../../supabase/functions/_shared/banner-langs.ts';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const GENERATED = 'src/lib/bannerLangMapPaths.generated.ts';
const COMPONENT = 'src/components/home/BannerLanguageMap.tsx';

test('the committed language layer is the current generator output', () => {
  assert.equal(read(GENERATED).replace(/\r\n/g, '\n'), renderLang(buildLangMap()), 'run: node scripts/build-market-map.mjs');
});

test('exactly the banner languages, each with at least one country and a drawn shape', () => {
  const data = JSON.parse(read('scripts/data/cldr-banner-languages.json'));
  assert.deepEqual(Object.keys(data.languages), [...BANNER_LANGS], 'same languages, same order as BANNER_LANGS');
  assert.deepEqual(Object.keys(LANG_COUNTRIES), [...BANNER_LANGS]);
  for (const l of BANNER_LANGS) {
    assert.ok(LANG_COUNTRIES[l].length > 0, `no country for ${l}`);
    assert.match(LANG_PATHS[l], /^M/, `no shape for ${l}`);
    for (const c of LANG_COUNTRIES[l]) assert.match(c.code, /^[A-Z]{2}$/);
  }
});

test('the countries the layer was built for are there', () => {
  const has = (l, c) => LANG_COUNTRIES[l].some((x) => x.code === c);
  for (const [l, c] of [['pt', 'AO'], ['pt', 'MZ'], ['pt', 'BR'], ['en', 'ZA'], ['es', 'MX'], ['es', 'AR'], ['es', 'CL'],
    ['es', 'CO'], ['es', 'PE'], ['fr', 'CA'], ['en', 'CA'], ['sv', 'FI'], ['de', 'CH'], ['nb', 'NO']]) {
    assert.ok(has(l, c), `${c} for ${l}`);
  }
  const names = Object.values(LANG_COUNTRIES).flat().map((c) => c.name);
  for (const n of names) assert.doesNotMatch(n, /,|\(/, `list-style name ${n}`);
});

test('the layer is static and keeps language apart from market rules', () => {
  const src = read(COMPONENT);
  for (const f of [COMPONENT, GENERATED]) {
    const s = read(f);
    assert.doesNotMatch(s, /\bfetch\s*\(|sendBeacon|XMLHttpRequest|import\s*\(/, `${f} loads at runtime`);
    assert.doesNotMatch(s, /https?:\/\/|<img\b|<image\b/i, `${f} references an external resource`);
  }
  assert.match(src, /the country\s+is never used/);
  const page = read('src/pages/Markets.tsx');
  assert.match(page, /<BannerLanguageMap/);
  assert.match(page, /a language does not change which rules apply/);
  for (const re of [/\bcovered\b/i, /\bcover(s|ing)?\b/i, /compliant/i, /no consent (is )?needed/i]) {
    assert.doesNotMatch(src, re, `forbidden phrase ${re}`);
  }
  const css = read('src/index.css');
  const block = (sel) => css.slice(css.indexOf(`${sel} {`), css.indexOf('}', css.indexOf(`${sel} {`)));
  for (const sel of [':root', '.dark']) for (const t of ['--map-lang', '--map-lang-land']) assert.match(block(sel), new RegExp(`${t}:`), `${t} in ${sel}`);
});

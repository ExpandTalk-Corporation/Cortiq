// World map on /markets/ and the homepage: shapes follow the engine's marketOf(), the category per market comes from
// the engine, the map loads nothing from outside, and the page keeps to the jurisdiction copy rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMap, render } from '../../scripts/build-market-map.mjs';
import { MAP_SHAPES, MAP_THUMB, MAP_VIEWBOX } from '../../src/lib/marketMapPaths.generated.ts';
import { MARKETS, PACK, PRODUCTION_STATUSES } from '../../src/lib/jurisdiction.ts';
import { marketOf, EEA_COUNTRIES } from '../../supabase/functions/_shared/jurisdiction/markets.ts';
import { marketStatuses } from '../../src/lib/marketStatus.ts';
import { MAP_CATEGORIES, mapCategory, marketMapModel } from '../../src/lib/marketMap.ts';
import { MARKETING_ROUTES } from '../../src/marketing-routes.ts';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const GENERATED = 'src/lib/marketMapPaths.generated.ts';
const COMPONENT = 'src/components/home/MarketMap.tsx';
const PAGE = 'src/pages/Markets.tsx';

test('the committed map module is the current generator output', () => {
  const committed = read(GENERATED).replace(/\r\n/g, '\n');
  assert.equal(committed, render(buildMap()), 'run: node scripts/build-market-map.mjs');
});

test("every shape's market is marketOf() for each place it contains", () => {
  for (const s of MAP_SHAPES) {
    assert.ok(s.codes.length > 0);
    for (const code of s.codes) {
      const [country, region = ''] = code.split('-');
      assert.equal(marketOf(country, region), s.market, `${code} is drawn as ${s.market}`);
    }
  }
});

test('every market the engine knows has at least one shape, and nothing else is drawn', () => {
  for (const m of MARKETS) assert.ok(MAP_SHAPES.some((s) => s.market === m), `no shape for ${m}`);
  for (const s of MAP_SHAPES) assert.ok(MARKETS.includes(s.market), `unknown market ${s.market}`);
  const codes = MAP_SHAPES.flatMap((s) => s.codes);
  // Natural Earth draws Somaliland and Northern Cyprus apart; edge geo reports them as SO and CY, so they share a code.
  const twice = codes.filter((c, i) => codes.indexOf(c) !== i).sort();
  assert.deepEqual(twice, ['CY', 'SO'], 'a place is drawn twice');
  for (const c of EEA_COUNTRIES) assert.ok(codes.includes(c), `EEA state ${c} missing from the map`);
  for (const c of ['US-CA', 'CA-QC', 'GB', 'CH', 'BR']) assert.ok(codes.includes(c), `${c} missing`);
  assert.ok(!codes.includes('AQ'), 'no Antarctica');
  assert.match(MAP_VIEWBOX, /^0 0 1000 \d+$/);
  assert.deepEqual(Object.keys(MAP_THUMB), [...MARKETS], 'thumbnail outline for every market');
  for (const m of MARKETS) assert.match(MAP_THUMB[m], /^M/);
});

test('the map module stays small', () => {
  const kb = Buffer.byteLength(read(GENERATED)) / 1024;
  assert.ok(kb < 80, `generated map is ${kb.toFixed(1)} kB`);
});

test('the category per market is derived from the engine', () => {
  const { legend, entries } = marketMapModel();
  assert.deepEqual(entries.map((e) => e.status.market), [...MARKETS]);
  assert.deepEqual(legend.map((l) => l.category), [...MAP_CATEGORIES]);
  assert.deepEqual(legend.flatMap((l) => l.markets).sort(), [...MARKETS].sort(), 'every market in exactly one legend item');
  for (const s of marketStatuses()) {
    const own = PACK.rules.filter((r) => r.markets.length === 1 && r.markets[0] === s.market);
    const expected = s.approved.length ? 'approved' : own.length ? 'market_rules' : 'global_only';
    assert.equal(mapCategory(s), expected, s.market);
  }
  const anyProduction = PACK.rules.some((r) => PRODUCTION_STATUSES.includes(r.status));
  if (!anyProduction) assert.equal(legend.find((l) => l.category === 'approved').markets.length, 0);
  for (const l of legend.filter((x) => x.category !== 'approved')) assert.match(l.label, /logged only$/);
});

test('the map component writes no status text of its own', () => {
  const src = read(COMPONENT);
  assert.match(src, /marketMapModel\(\)/);
  assert.match(src, /categoryLabel/);
  assert.match(src, /\{l\.label\}/);
  for (const f of [COMPONENT, 'src/components/home/MarketTable.tsx', PAGE]) {
    assert.doesNotMatch(read(f), /Approved internally|logged only|in review|draft|Baseline opt-in|none approved/i, `${f} hardcodes a status`);
  }
});

test('the map loads nothing from outside: no fetch, tiles or external URLs', () => {
  for (const f of [COMPONENT, GENERATED, PAGE, 'src/lib/marketMap.ts']) {
    const src = read(f);
    assert.doesNotMatch(src, /\bfetch\s*\(|sendBeacon|XMLHttpRequest|import\s*\(/, `${f} loads at runtime`);
    assert.doesNotMatch(src, /https?:\/\/|\/\/[a-z0-9-]+\.[a-z]{2,}|tile\.|\{z\}|leaflet|mapbox|<img\b|<image\b/i, `${f} references an external resource`);
  }
});

test('/markets/ is registered, prerendered and in the footer', () => {
  const r = MARKETING_ROUTES.find((x) => x.path === '/markets/');
  assert.ok(r, 'route registered');
  assert.equal(r.source, PAGE);
  assert.ok(r.footer, 'footer link');
  assert.match(read('src/entry-server.tsx'), /'\/markets\/': Markets/);
  assert.match(read('src/App.tsx'), /path="\/markets" element=\{<Markets \/>\}/);
  assert.match(read('src/components/home/RoutingSection.tsx'), /<MarketMapThumbnail/);
  assert.match(read(COMPONENT), /to="\/markets\/"/);
});

test('the /markets/ page keeps to the copy rules', () => {
  const r = MARKETING_ROUTES.find((x) => x.path === '/markets/');
  const text = [read(PAGE), read(COMPONENT), read('src/lib/marketMap.ts'), r.title, r.description].join('\n');
  for (const re of [/\bcovered\b/i, /coverage of (the )?laws?/i, /we cover \d+/i, /\bcover(s|ing)? \d+ (countries|markets)/i,
    /compliant/i, /compliance with/i, /no consent (is )?needed/i, /no banner (is )?needed/i]) {
    assert.doesNotMatch(text, re, `forbidden phrase ${re}`);
  }
  assert.match(read(PAGE), /\{DISCLAIMER\}/);
  assert.match(read(PAGE), /logged against real traffic, not applied/);
});

// Builds the world map on /markets/ and the homepage from Natural Earth data, once, at dev time.
// Run `node scripts/build-market-map.mjs` after changing the engine's market mapping or the data packages;
// tests/foundation/market-map.test.mjs fails while the committed module is stale.
//
// Sources (all Natural Earth, public domain):
//   countries        world-atlas@2.0.2 countries-110m; EEA states that 110m drops (Malta, Liechtenstein) from 50m
//   US states        us-atlas@3.0.1 states-10m: California on its own, the other 50 states + DC merged
//   Canadian provs.  sane-topojson@4.0.0 world_50m subunits (Natural Earth admin-1): Québec on its own, the rest merged
// Market per shape comes from the engine's own marketOf(); this file never lists markets.
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { geoEqualEarth } from 'd3-geo';
import { feature, merge } from 'topojson-client';
import { EEA_COUNTRIES, marketOf } from '../supabase/functions/_shared/jurisdiction/markets.ts';
import { MARKETS } from '../supabase/functions/_shared/jurisdiction/types.ts';

const require = createRequire(import.meta.url);
const OUT = fileURLToPath(new URL('../src/lib/marketMapPaths.generated.ts', import.meta.url));

const WIDTH = 1000;
// Douglas-Peucker tolerance (px) and smallest island kept (px²; a country always keeps its largest ring).
// FULL is the map on /markets/; THUMB is the homepage thumbnail, coarser so the prerendered homepage stays light.
const FULL = { tolerance: 0.45, minArea: 1.5 };
const THUMB = { tolerance: 1.8, minArea: 16 };

// Features in world-atlas without an ISO code: the code edge geo reports for each place.
const NO_CODE = { Kosovo: 'XK', Somaliland: 'SO', 'N. Cyprus': 'CY' };
// us-atlas ids are FIPS codes; the engine reads the postal code (ISO 3166-2:US suffix). Territories (60+) are
// separate countries in edge geo and in world-atlas, so they are left out here.
const FIPS = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL',
  '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME',
  '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS', '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH',
  '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND', '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI',
  '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT', '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI',
  '56': 'WY',
};

function sources() {
  const iso = require('i18n-iso-countries');
  const w110 = require('world-atlas/countries-110m.json');
  const w50 = require('world-atlas/countries-50m.json');
  const states = require('us-atlas/states-10m.json');
  const sane = require('sane-topojson/dist/world_50m.json');
  const codeOf = (g) => (g.id ? iso.numericToAlpha2(g.id) : NO_CODE[g.properties.name]);

  const countries = [];
  const have = new Set();
  for (const g of w110.objects.countries.geometries) {
    const code = codeOf(g);
    if (!code) throw new Error(`no ISO code for ${g.properties.name}`);
    if (code === 'AQ' || code === 'US' || code === 'CA') continue; // no Antarctica; US and Canada come split below
    countries.push({ codes: [code], geo: feature(w110, g) });
    have.add(code);
  }
  for (const g of w50.objects.countries.geometries) {
    const code = codeOf(g);
    if (code && EEA_COUNTRIES.has(code) && !have.has(code)) countries.push({ codes: [code], geo: feature(w50, g) });
  }

  const us = states.objects.states.geometries.filter((g) => FIPS[g.id]);
  const ca = us.filter((g) => FIPS[g.id] === 'CA');
  const usRest = us.filter((g) => FIPS[g.id] !== 'CA');
  countries.push({ codes: ['US-CA'], geo: merge(states, ca) });
  countries.push({ codes: usRest.map((g) => `US-${FIPS[g.id]}`).sort(), geo: merge(states, usRest) });

  const provinces = sane.objects.subunits.geometries.filter((g) => g.properties.gu === 'CAN');
  const qc = provinces.filter((g) => g.id === 'QC');
  const caRest = provinces.filter((g) => g.id !== 'QC');
  if (qc.length !== 1 || caRest.length !== 12) throw new Error('expected Québec and 12 other provinces and territories');
  countries.push({ codes: ['CA-QC'], geo: merge(sane, qc) });
  countries.push({ codes: caRest.map((g) => `CA-${g.id}`).sort(), geo: merge(sane, caRest) });
  return countries;
}

// --- geometry ---------------------------------------------------------------------------------------
const sqDist = (p, a, b) => {
  const dx = b[0] - a[0]; const dy = b[1] - a[1];
  const t = dx || dy ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy))) : 0;
  const x = a[0] + t * dx - p[0]; const y = a[1] + t * dy - p[1];
  return x * x + y * y;
};
function simplify(pts, tol) {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let max = 0; let idx = -1;
    for (let i = s + 1; i < e; i++) { const d = sqDist(pts[i], pts[s], pts[e]); if (d > max) { max = d; idx = i; } }
    if (max > tol * tol) { keep[idx] = 1; stack.push([s, idx], [idx, e]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const area = (r) => Math.abs(r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;

function rings(projection, geo) {
  const out = []; let ring = null;
  const sink = projection.stream({
    point(x, y) { ring?.push([x, y]); },
    lineStart() { ring = []; },
    lineEnd() { if (ring?.length) out.push(ring); ring = null; },
    polygonStart() {}, polygonEnd() {}, sphere() {},
  });
  const feed = (g) => {
    if (g.type === 'FeatureCollection') g.features.forEach(feed);
    else if (g.type === 'Feature') feed(g.geometry);
    else if (g.type === 'GeometryCollection') g.geometries.forEach(feed);
    else streamGeometry(g, sink);
  };
  feed(geo);
  return out;
}
function streamGeometry(g, s) {
  const polygon = (poly) => {
    s.polygonStart();
    for (const r of poly) { s.lineStart(); for (let i = 0; i < r.length - 1; i++) s.point(r[i][0], r[i][1]); s.lineEnd(); }
    s.polygonEnd();
  };
  if (g.type === 'Polygon') polygon(g.coordinates);
  else if (g.type === 'MultiPolygon') g.coordinates.forEach(polygon);
  else throw new Error(`unexpected geometry ${g.type}`);
}

function toPath(rs) {
  const parts = [];
  for (const r of rs) {
    const pts = [];
    for (const [x, y] of r) {
      const p = [Math.round(x), Math.round(y)];
      const last = pts[pts.length - 1];
      if (!last || last[0] !== p[0] || last[1] !== p[1]) pts.push(p);
    }
    if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
    if (pts.length < 3) continue;
    let d = `M${pts[0][0]} ${pts[0][1]}l`;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i][0] - pts[i - 1][0]; const dy = pts[i][1] - pts[i - 1][1];
      d += `${i > 1 && dx >= 0 ? ' ' : ''}${dx}${dy >= 0 ? ' ' : ''}${dy}`;
    }
    parts.push(`${d}z`);
  }
  return parts.join('');
}

function pathAt(raw, { tolerance, minArea }) {
  let rs = raw.map((r) => simplify(r, tolerance));
  const largest = rs.reduce((a, r) => (area(r) > area(a) ? r : a), rs[0] ?? []);
  rs = rs.filter((r) => r === largest || area(r) >= minArea);
  const d = toPath(rs);
  if (d) return d;
  // Microstates collapse below a pixel: draw a 2-px square at their position so they stay on the map.
  const [x, y] = largest[0];
  return `M${Math.round(x) - 1} ${Math.round(y) - 1}h2v2h-2z`;
}

export function buildMap() {
  const all = sources();
  const land = { type: 'FeatureCollection', features: all.map((c) => (c.geo.type === 'Feature' ? c.geo : { type: 'Feature', geometry: c.geo })) };
  const projection = geoEqualEarth().fitWidth(WIDTH, land);
  // Integer coordinates on a 1000-px-wide map; fitWidth gives the height.
  const [[, y0], [, y1]] = [projection([0, 90]), projection([0, -60])];
  const top = Math.floor(y0); const height = Math.ceil(y1 - top);

  const shapes = [];
  for (const c of all) {
    const [country, region = ''] = c.codes[0].split('-');
    const market = marketOf(country, region);
    if (!market) throw new Error(`marketOf(${c.codes[0]}) is null`);
    for (const code of c.codes) {
      const [cc, rr = ''] = code.split('-');
      if (marketOf(cc, rr) !== market) throw new Error(`${code} is not in the same market as ${c.codes[0]}`);
    }
    const raw = rings(projection, c.geo).map((r) => r.map(([x, y]) => [x, y - top]));
    shapes.push({ codes: c.codes, market, d: pathAt(raw, FULL), thumb: pathAt(raw, THUMB) });
  }
  shapes.sort((a, b) => MARKETS.indexOf(a.market) - MARKETS.indexOf(b.market) || a.codes[0].localeCompare(b.codes[0]));
  const thumb = Object.fromEntries(MARKETS.map((m) => [m, shapes.filter((x) => x.market === m).map((x) => x.thumb).join('')]));
  return { viewBox: `0 0 ${WIDTH} ${height}`, shapes: shapes.map(({ thumb: _, ...x }) => x), thumb };
}

export const render = (map) => `// Generated by scripts/build-market-map.mjs from Natural Earth data (public domain). Do not edit.
// Market per shape = marketOf() from the jurisdiction engine; tests/foundation/market-map.test.mjs checks both.
import type { Market } from '../../supabase/functions/_shared/jurisdiction/types.ts';

export interface MapShape { codes: string[]; market: Market; d: string }

export const MAP_VIEWBOX = ${JSON.stringify(map.viewBox)};

export const MAP_SHAPES: MapShape[] = [
${map.shapes.map((s) => `  { codes: ${JSON.stringify(s.codes)}, market: ${JSON.stringify(s.market)}, d: ${JSON.stringify(s.d)} },`).join('\n')}
];

/** Coarser outline per market for the homepage thumbnail (same projection and viewBox). */
export const MAP_THUMB: Record<Market, string> = {
${Object.entries(map.thumb).map(([m, d]) => `  ${m}: ${JSON.stringify(d)},`).join('\n')}
};
`;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const text = render(buildMap());
  writeFileSync(OUT, text);
  console.log(`Wrote ${OUT} (${(Buffer.byteLength(text) / 1024).toFixed(1)} kB)`);
}

// Spec 2026-11-18 phase 1 AC5/AC6: every new consent row has geo_country + geo_source, and a
// GPC signal always records marketing as refused.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadEdge, mockDatabase } from './edge-harness.mjs';
import { consentGeo, gpcRequested } from '../../supabase/functions/_shared/consent-geo.ts';

const SITE = '11111111-1111-4111-8111-111111111111';

test('consentGeo: copies the resolved geo', () => {
  assert.deepEqual(consentGeo({ country: 'SE', region: null, source: 'timezone', ip: null }), { geo_country: 'SE', geo_region: null, geo_source: 'timezone' });
  assert.deepEqual(consentGeo({ country: null, region: null, source: 'unknown', ip: null }), { geo_country: null, geo_region: null, geo_source: 'unknown' });
});

test('gpcRequested: body flag or Sec-GPC header', () => {
  assert.equal(gpcRequested({ gpc_signal: true }, new Headers()), true);
  assert.equal(gpcRequested({}, new Headers({ 'sec-gpc': '1' })), true);
  assert.equal(gpcRequested({ gpc_signal: 'true' }, new Headers()), false);
  assert.equal(gpcRequested({}, new Headers({ 'sec-gpc': '0' })), false);
});

function setup() {
  const db = mockDatabase((op) => {
    if (op.table === 'sites') return { data: { id: SITE }, error: null };
    if (op.table === 'cookie_consents' && op.type === 'select') return { data: null, error: null };
    if (op.table === 'cookie_consents' && op.type === 'insert') return { data: { id: 'row-1', ...op.payload }, error: null };
    return { data: null, error: null };
  }, async (name) => ({ data: name === 'check_rate_limit' ? true : null, error: null }));
  return { db, handler: loadEdge('store-consent', db.client) };
}
const post = (body, headers = {}) => new Request('https://fn.test/store-consent', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
});
const choice = (marketing) => ({ site_id: SITE, session_id: 'c-1', consent_types: { analytics: true, marketing, preferences: false } });
const inserted = (db) => db.calls.find((c) => c.table === 'cookie_consents' && c.type === 'insert').payload;

test('store-consent: time zone → geo_country/geo_source on the row', async () => {
  const { db, handler } = setup();
  const res = await handler(post({ ...choice(false), time_zone: 'Europe/Berlin' }));
  assert.equal(res.status, 200);
  const row = inserted(db);
  assert.equal(row.geo_country, 'DE');
  assert.equal(row.geo_source, 'timezone');
});

test('store-consent: bogus time zone → unknown, no guess', async () => {
  const { db, handler } = setup();
  await handler(post({ ...choice(false), time_zone: 'Mars/Olympus' }));
  assert.deepEqual([inserted(db).geo_country, inserted(db).geo_source], [null, 'unknown']);
});

test('store-consent: GPC forces marketing false even if an old banner sent true', async () => {
  for (const [body, headers] of [[{ ...choice(true), gpc_signal: true }, {}], [choice(true), { 'Sec-GPC': '1' }]]) {
    const { db, handler } = setup();
    await handler(post(body, headers));
    const row = inserted(db);
    assert.equal(row.consent_types.marketing, false);
    assert.equal(row.consent_types.analytics, true, 'other categories untouched');
    assert.equal(row.gpc_signal, true);
  }
});

test('store-consent: update path writes the same geo and GPC result', () => {
  const src = readFileSync('supabase/functions/store-consent/index.ts', 'utf8');
  const update = src.slice(src.indexOf(".update({"), src.indexOf("})", src.indexOf(".update({")));
  assert.match(update, /geo_country: consentData\.geo_country/);
  assert.match(update, /geo_source: consentData\.geo_source/);
  assert.match(update, /consent_types: consentData\.consent_types/);
});

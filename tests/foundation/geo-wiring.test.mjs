// tests/foundation/geo-wiring.test.mjs
// Spec 2026-11-18 phase 2 AC1: geo and client IP come from resolveGeo only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadEdge, mockDatabase } from './edge-harness.mjs';
import { signGeo, GEO_HEADER } from '../../supabase/functions/_shared/geo-token.js';

const FUNCS = ['track-event', 'visitor-identification', 'store-consent', 'aggregate-hit', 'ai-bot-tracker', 'canary-tracker', 'geo-check'];
const RAW = /headers\.get\(\s*['"](cf-ipcountry|x-country|cf-connecting-ip|x-forwarded-for|x-real-ip)['"]/i;

test('no allowlisted function reads geo or IP headers directly', () => {
  for (const fn of FUNCS) {
    const src = readFileSync(`supabase/functions/${fn}/index.ts`, 'utf8');
    assert.doesNotMatch(src, RAW, fn);
    assert.match(src, /resolveGeo\(/, fn);
  }
  assert.doesNotMatch(readFileSync('supabase/functions/_shared/bot-detection.ts', 'utf8'), /headers\.get\(\s*['"](cf-ipcountry|x-country)['"]/i);
});

test('store-consent: signed geo → geo_source ip with region', async () => {
  const KEY = 'k'.repeat(32);
  const SITE = '11111111-1111-4111-8111-111111111111';
  const db = mockDatabase((op) => {
    if (op.table === 'sites') return { data: { id: SITE }, error: null };
    if (op.table === 'cookie_consents' && op.type === 'insert') return { data: { id: 'r', ...op.payload }, error: null };
    return { data: null, error: null };
  }, async (name) => ({ data: name === 'check_rate_limit' ? true : null, error: null }));
  const handler = loadEdge('store-consent', db.client, { env: { GEO_SIGNING_KEY: KEY } });
  const token = await signGeo({ country: 'US', region: 'CA', ip: '203.0.113.4' }, KEY, Math.floor(Date.now() / 1000));
  await handler(new Request('https://fn.test/store-consent', {
    method: 'POST', headers: { 'Content-Type': 'application/json', [GEO_HEADER]: token },
    body: JSON.stringify({ site_id: SITE, session_id: 's', consent_types: { analytics: true, marketing: false }, time_zone: 'Europe/Stockholm' }),
  }));
  const row = db.calls.find((c) => c.table === 'cookie_consents' && c.type === 'insert').payload;
  assert.deepEqual([row.geo_country, row.geo_region, row.geo_source], ['US', 'CA', 'ip']);
  assert.equal(row.ip_address, '203.0.113.0', 'anonymized signed IP, never raw');
});

test('geo-check: signed country decides scope; unknown stays in scope', async () => {
  const KEY = 'k'.repeat(32);
  const handler = loadEdge('geo-check', null, { env: { GEO_SIGNING_KEY: KEY } });
  const token = await signGeo({ country: 'US', region: 'TX', ip: null }, KEY, Math.floor(Date.now() / 1000));
  const us = await (await handler(new Request('https://fn.test/geo-check', { headers: { [GEO_HEADER]: token } }))).json();
  assert.deepEqual(us, { country: 'US', region: 'TX', in_scope: false });
  const none = await (await handler(new Request('https://fn.test/geo-check'))).json();
  assert.deepEqual(none, { country: null, region: null, in_scope: true });
});

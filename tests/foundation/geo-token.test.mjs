// Spec 2026-11-18 phase 2 AC1/AC2: geo comes from a token signed by the CortIQ Worker; anything
// unsigned, tampered, stale or signed with another key is ignored.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signGeo, verifyGeo, GEO_HEADER } from '../../supabase/functions/_shared/geo-token.js';
import { resolveGeo } from '../../supabase/functions/_shared/geo.ts';

const KEY = 'k'.repeat(32);
const NOW = 1_800_000_000;
const req = (headers = {}) => new Request('https://fn.test/x', { method: 'POST', headers });

test('sign → verify round trip', async () => {
  const t = await signGeo({ country: 'US', region: 'CA', ip: '203.0.113.9' }, KEY, NOW);
  assert.match(t, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.deepEqual(await verifyGeo(t, KEY, NOW + 10), { c: 'US', r: 'CA', ip: '203.0.113.9', ts: NOW });
});

test('wrong key, tampered payload, short key → null', async () => {
  const t = await signGeo({ country: 'SE', region: null, ip: '198.51.100.1' }, KEY, NOW);
  assert.equal(await verifyGeo(t, 'x'.repeat(32), NOW), null);
  const [v, , sig] = t.split('.');
  const forged = Buffer.from(JSON.stringify({ c: 'US', r: null, ip: '198.51.100.1', ts: NOW })).toString('base64url');
  assert.equal(await verifyGeo(`${v}.${forged}.${sig}`, KEY, NOW), null);
  assert.equal(await signGeo({ country: 'SE', region: null, ip: null }, 'short', NOW), null);
  assert.equal(await verifyGeo(t, 'short', NOW), null);
  assert.equal(await verifyGeo('garbage', KEY, NOW), null);
  assert.equal(await verifyGeo('v1.' + 'a'.repeat(2000) + '.b', KEY, NOW), null);
});

test('expired (>60 s) or from the future (>5 s) → null', async () => {
  const t = await signGeo({ country: 'SE', region: null, ip: null }, KEY, NOW);
  assert.ok(await verifyGeo(t, KEY, NOW + 60));
  assert.equal(await verifyGeo(t, KEY, NOW + 61), null);
  assert.equal(await verifyGeo(t, KEY, NOW - 6), null);
});

test('normalization: XX/T1 → no country, region only for US/CA, junk ip dropped', async () => {
  const v = async (claims) => verifyGeo(await signGeo(claims, KEY, NOW), KEY, NOW);
  assert.equal((await v({ country: 'XX', region: null, ip: null })).c, null);
  assert.equal((await v({ country: 'T1', region: null, ip: null })).c, null);
  assert.equal((await v({ country: 'BR', region: 'SP', ip: null })).r, null);
  assert.equal((await v({ country: 'CA', region: 'QC', ip: null })).r, 'QC');
  assert.equal((await v({ country: 'SE', region: null, ip: '<script>' })).ip, null);
});

test('resolveGeo: valid token → ip source, token ip', async () => {
  const t = await signGeo({ country: 'CA', region: 'QC', ip: '2001:db8::1' }, KEY, NOW);
  const g = await resolveGeo(req({ [GEO_HEADER]: t, 'x-forwarded-for': '10.0.0.1' }), { key: KEY, timeZone: 'Europe/Stockholm', now: NOW * 1000 });
  assert.deepEqual(g, { country: 'CA', region: 'QC', source: 'ip', ip: '2001:db8::1' });
});

test('resolveGeo: invalid token present → time zone, ip null (never the proxy ip)', async () => {
  const g = await resolveGeo(req({ [GEO_HEADER]: 'v1.bad.sig', 'x-forwarded-for': '172.70.1.1' }), { key: KEY, timeZone: 'Europe/Berlin', now: NOW * 1000 });
  assert.deepEqual(g, { country: 'DE', region: null, source: 'timezone', ip: null });
});

test('resolveGeo: no header → time zone or unknown, ip from forwarding headers', async () => {
  assert.deepEqual(await resolveGeo(req({ 'x-forwarded-for': '198.51.100.7, 10.0.0.1' }), { key: KEY, timeZone: 'America/Sao_Paulo' }),
    { country: 'BR', region: null, source: 'timezone', ip: '198.51.100.7' });
  assert.deepEqual(await resolveGeo(req(), { key: null, timeZone: 'Mars/Base' }),
    { country: null, region: null, source: 'unknown', ip: null });
});

test('resolveGeo: no key configured → token ignored', async () => {
  const t = await signGeo({ country: 'US', region: 'NY', ip: '203.0.113.1' }, KEY, NOW);
  const g = await resolveGeo(req({ [GEO_HEADER]: t }), { key: undefined, timeZone: undefined, now: NOW * 1000 });
  assert.equal(g.source, 'unknown');
});

test('resolveGeo: non-string timeZone is treated as absent (ruling carried from phase 1)', async () => {
  const g = await resolveGeo(req(), { key: KEY, timeZone: { toString: () => 'Europe/Stockholm' }, now: NOW * 1000 });
  assert.deepEqual(g, { country: null, region: null, source: 'unknown', ip: null });
});

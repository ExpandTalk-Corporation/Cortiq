// tests/foundation/aggregate-helpers.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanPath, referrerSource, utmFrom, deviceFromUA, clientIp, visitorHash } from '../../supabase/functions/_shared/aggregate.js';

test('cleanPath drops query, fragment and trailing slash', () => {
  assert.equal(cleanPath(new URL('https://a.test/demo/?email=x@y.se#top')), '/demo');
  assert.equal(cleanPath(new URL('https://a.test/')), '/');
  assert.equal(cleanPath(new URL('https://a.test/' + 'x'.repeat(600))).length, 512);
});

test('referrerSource: external domain only, own site and junk are direct', () => {
  assert.equal(referrerSource('https://www.linkedin.com/feed/?trk=abc', 'shop.test'), 'linkedin.com');
  assert.equal(referrerSource('https://shop.test/pricing', 'shop.test'), '');
  assert.equal(referrerSource('https://blog.shop.test/x', 'shop.test'), '');
  assert.equal(referrerSource('', 'shop.test'), '');
  assert.equal(referrerSource('not a url', 'shop.test'), '');
  assert.equal(referrerSource(42, 'shop.test'), '');
});

test('utmFrom keeps three keys, trimmed and capped, ignores the rest', () => {
  assert.deepEqual(utmFrom({ utm_source: ' LinkedIn ', utm_medium: 'paid', utm_campaign: 'q'.repeat(150), utm_term: 'x', email: 'a@b' }),
    { p_utm_source: 'LinkedIn', p_utm_medium: 'paid', p_utm_campaign: 'q'.repeat(100) });
  assert.deepEqual(utmFrom(null), { p_utm_source: '', p_utm_medium: '', p_utm_campaign: '' });
  assert.deepEqual(utmFrom({ utm_source: 5 }), { p_utm_source: '', p_utm_medium: '', p_utm_campaign: '' });
});

test('deviceFromUA classifies coarse device only', () => {
  assert.equal(deviceFromUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148'), 'mobile');
  assert.equal(deviceFromUA('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36'), 'mobile');
  assert.equal(deviceFromUA('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)'), 'tablet');
  assert.equal(deviceFromUA('Mozilla/5.0 (Linux; Android 14; SM-X710) Safari/537.36'), 'tablet');
  assert.equal(deviceFromUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0'), 'desktop');
  assert.equal(deviceFromUA(''), 'desktop');
});

test('clientIp prefers cf-connecting-ip, then the first x-forwarded-for entry', () => {
  assert.equal(clientIp(new Headers({ 'cf-connecting-ip': '203.0.113.9', 'x-forwarded-for': '198.51.100.1' })), '203.0.113.9');
  assert.equal(clientIp(new Headers({ 'x-forwarded-for': '198.51.100.1, 10.0.0.1' })), '198.51.100.1');
  assert.equal(clientIp(new Headers()), '');
});

test('visitorHash is deterministic per salt and changes with salt, site, ip or ua', async () => {
  const h = await visitorHash('salt1', 'site', '203.0.113.9', 'UA');
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(await visitorHash('salt1', 'site', '203.0.113.9', 'UA'), h);
  for (const args of [['salt2', 'site', '203.0.113.9', 'UA'], ['salt1', 'other', '203.0.113.9', 'UA'],
                      ['salt1', 'site', '203.0.113.10', 'UA'], ['salt1', 'site', '203.0.113.9', 'UA2']]) {
    assert.notEqual(await visitorHash(...args), h);
  }
});

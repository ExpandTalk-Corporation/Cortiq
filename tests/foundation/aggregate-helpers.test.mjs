// tests/foundation/aggregate-helpers.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanPath, referrerSource, utmFrom, fallbackGoal, looksIdentifying, cleanText, deviceFromUA, clientIp, visitorHash } from '../../supabase/functions/_shared/aggregate.js';

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

test('cleanPath masks segments that look like an email, an ID or a token', () => {
  const p = (path) => cleanPath(new URL('https://a.test' + path));
  assert.equal(p('/u/jane%40example.com/settings'), '/u/:id/settings');
  assert.equal(p('/order/48213377/receipt'), '/order/:id/receipt');
  assert.equal(p('/doc/5f0c6c1e-7d2a-4b1e-9a3c-2f4e6d8b0a1c'), '/doc/:id');
  assert.equal(p('/reset/9f86d081884c7d659a2feaa0c55ad015'), '/reset/:id');
  assert.equal(p('/t/eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig'), '/t/:id');
  assert.equal(p('/i/aGVsbG8gd29ybGQgdGhpcyBpcyBhIHRva2Vu42'), '/i/:id');
  // Ordinary pages keep their shape: slugs, years, short numbers, locales.
  for (const ok of ['/blog/how-to-measure-ai-traffic-in-2026', '/products/12345', '/sv/kontakt', '/2026/11/news', '/p/iphone-15-pro-max-256gb'])
    assert.equal(p(ok), ok);
});

test('looksIdentifying and cleanText', () => {
  for (const v of ['a.b@c.se', 'a%40c.se', '0701234567', '5f0c6c1e7d2a4b1e9a3c2f4e6d8b0a1c', 'abc123DEF456ghi789JKL012mno'])
    assert.equal(looksIdentifying(v), true, v);
  for (const v of ['linkedin', 'cpc', 'black_friday_2026_retargeting', 'spring-sale', 'q4', 'Newsletter 2026-11'])
    assert.equal(looksIdentifying(v), false, v);
  assert.equal(cleanText('  Spring sale  ', 100), 'Spring sale');
  assert.equal(cleanText('jane@example.com', 100), '');
  assert.equal(cleanText(42, 100), '');
});

test('utmFrom drops values that look like an email or an ID', () => {
  assert.deepEqual(utmFrom({ utm_source: 'mailchimp', utm_medium: 'jane@example.com', utm_campaign: 'id-48213377' }),
    { p_utm_source: 'mailchimp', p_utm_medium: '', p_utm_campaign: '' });
});

test('fallbackGoal: form id and content id sanitised, path content id keeps its shape', () => {
  assert.deepEqual(fallbackGoal('contact', 'Contact form', '/kontakt'), { id: 'form:contact', name: 'Contact form' });
  assert.deepEqual(fallbackGoal('', '/order/48213377?email=a@b.se', '/order/:id'), { id: 'form:/order/:id', name: '/order/:id' });
  assert.deepEqual(fallbackGoal('jane@example.com', 'jane@example.com', '/x'), { id: 'form:/x', name: 'Conversion' });
  assert.deepEqual(fallbackGoal(undefined, undefined, '/x'), { id: 'form:/x', name: 'Conversion' });
  assert.ok(fallbackGoal('f'.repeat(150), 'n'.repeat(300), '/x').id.length <= 'form:'.length + 100);
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

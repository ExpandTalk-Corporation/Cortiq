import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertSafeUrl, isPrivateAddress } from '../../supabase/functions/_shared/safe-url.ts';

test('blocks private, loopback, metadata and non-http targets', async () => {
  for (const url of ['http://localhost/', 'http://127.0.0.1/', 'http://10.1.2.3/', 'http://172.20.0.1/',
    'http://192.168.1.1/', 'http://169.254.169.254/latest', 'http://[::1]/', 'http://2130706433/',
    'http://100.64.0.1/', 'http://printer.local/', 'ftp://example.com/']) {
    await assert.rejects(assertSafeUrl(url, null), undefined, url);
  }
});

test('blocks public names that resolve to private addresses', async () => {
  const resolve = async (_host, type) => (type === 'A' ? ['10.0.0.5'] : []);
  await assert.rejects(assertSafeUrl('https://evil.example/', resolve), /resolved to private/);
});

test('allows public hosts and survives resolver failures', async () => {
  assert.equal((await assertSafeUrl('https://example.com/a?b=1', async () => ['93.184.215.14'])).hostname, 'example.com');
  await assertSafeUrl('https://example.com/', async () => { throw new Error('resolver unavailable'); });
});

test('isPrivateAddress handles bracketed IPv6 and public addresses', () => {
  assert.equal(isPrivateAddress('[fd00::1]'), true);
  assert.equal(isPrivateAddress('8.8.8.8'), false);
  assert.equal(isPrivateAddress('fcbarcelona.com'), false);
  assert.equal(isPrivateAddress('fd.example.com'), false);
});

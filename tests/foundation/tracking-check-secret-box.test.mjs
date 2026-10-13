import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seal, open, randomToken } from '../../supabase/functions/_shared/tracking-check/secret-box.ts';

const key = Buffer.alloc(32, 7).toString('base64');
const otherKey = Buffer.alloc(32, 9).toString('base64');

test('seal and open round-trip with a fresh IV every time', async () => {
  const a = await seal('{"username":"u","password":"p"}', key);
  const b = await seal('{"username":"u","password":"p"}', key);
  assert.notEqual(a, b);
  assert.ok(!a.includes('password'));
  assert.equal(await open(a, key), '{"username":"u","password":"p"}');
});

test('a wrong or malformed key fails', async () => {
  const sealed = await seal('secret', key);
  await assert.rejects(open(sealed, otherKey));
  await assert.rejects(seal('secret', Buffer.alloc(16).toString('base64')), /32 bytes/);
});

test('random tokens are 43 url-safe characters', () => {
  const t = randomToken();
  assert.match(t, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(t, randomToken());
});

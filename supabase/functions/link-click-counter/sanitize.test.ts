import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { sanitize } from './sanitize.ts';

Deno.test('strips query and hash from pagePath and anchor link_key', () => {
  const out = sanitize({
    pagePath: '/produkter/yxa?utm_source=fb#top',
    linkKind: 'link',
    linkKey: 'vikingage.se/kontakt?ref=foo#form',
    linkLabel: 'Kontakta oss',
    deviceType: 'mobile',
  });
  assertEquals(out.pagePath, '/produkter/yxa');
  assertEquals(out.linkKey, 'vikingage.se/kontakt');
  assertEquals(out.linkKind, 'link');
  assertEquals(out.deviceType, 'mobile');
});

Deno.test('truncates label and key to 200 chars', () => {
  const long = 'a'.repeat(500);
  const out = sanitize({ pagePath: '/', linkKind: 'button', linkKey: long, linkLabel: long, deviceType: 'x' });
  assertEquals(out.linkKey.length, 200);
  assertEquals(out.linkLabel?.length, 200);
});

Deno.test('normalises unknown device_type to desktop and rejects bad kind', () => {
  const out = sanitize({ pagePath: '/', linkKind: 'button', linkKey: 'Boka', linkLabel: 'Boka', deviceType: 'weird' });
  assertEquals(out.deviceType, 'desktop');
  assertThrows(() => sanitize({ pagePath: '/', linkKind: 'nope', linkKey: 'x', linkLabel: 'x', deviceType: 'desktop' }));
});

Deno.test('rejects empty pagePath or linkKey', () => {
  assertThrows(() => sanitize({ pagePath: '', linkKind: 'link', linkKey: 'x', linkLabel: '', deviceType: 'desktop' }));
  assertThrows(() => sanitize({ pagePath: '/', linkKind: 'link', linkKey: '', linkLabel: '', deviceType: 'desktop' }));
});

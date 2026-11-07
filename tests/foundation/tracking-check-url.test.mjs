import { test } from 'node:test';
import assert from 'node:assert/strict';
import { siteFromQuery } from '../../src/lib/trackingCheckUrl.ts';

test('the landing page address becomes the site origin; anything else is ignored', () => {
  assert.equal(siteFromQuery('?url=example.com'), 'https://example.com');
  assert.equal(siteFromQuery('?url=' + encodeURIComponent('http://www.example.com/contact?x=1')), 'http://www.example.com');
  assert.equal(siteFromQuery('?url=' + encodeURIComponent('  https://Shop.Example.se/ ')), 'https://shop.example.se');
  assert.equal(siteFromQuery('?url=' + encodeURIComponent('javascript:alert(1)')), undefined);
  assert.equal(siteFromQuery('?url=' + encodeURIComponent('ftp://example.com')), undefined);
  assert.equal(siteFromQuery('?url=not a url'), undefined);
  assert.equal(siteFromQuery('?url=staging.example.com:8443'), 'https://staging.example.com:8443');
  assert.equal(siteFromQuery(''), undefined);
});

// tests/foundation/tracking-snippet.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderTrackingSnippet } from '../../src/lib/snippetTemplate.ts';

const loader = readFileSync(new URL('../../src/lib/consent-loader.js', import.meta.url), 'utf8');
const beacon = readFileSync(new URL('../../src/lib/aggregate-beacon.js', import.meta.url), 'utf8');
const opts = { apiUrl: 'https://api.test/functions/v1', siteId: 'site-1', trackingKey: 'tk_key', scriptSrc: 'https://cortiq.se/spa-tracking.js' };

test('default snippet: consent-gated loader only, no beacon, no aggregate flag', () => {
  const html = renderTrackingSnippet(opts, { loader, beacon });
  assert.match(html, /loads only after analytics consent/);
  assert.equal(html.includes('aggregate-hit'), false);
  assert.equal(html.includes('aggregate: true'), false);
  assert.match(html, /https:\/\/cortiq\.se\/spa-tracking\.js/);
});

test('aggregate snippet: flag set, beacon inlined before the loader, comments stripped', () => {
  const html = renderTrackingSnippet({ ...opts, aggregate: true }, { loader, beacon });
  assert.match(html, /aggregate: true/);
  assert.ok(html.indexOf('aggregate-hit') > -1 && html.indexOf('aggregate-hit') < html.indexOf('spa-tracking.js'));
  assert.equal(/^\s*\/\//m.test(html.replace(/<!--.*?-->/g, '')), false, 'no line comments shipped');
  assert.match(html, /counts page views without consent/);
});

test('cortiq-banner setup: banner tag before the gated loader (it reads data-policy-version), with site id, api url and escaped company', () => {
  const html = renderTrackingSnippet(
    { ...opts, consentSetup: 'cortiq-banner', bannerSrc: 'https://cortiq.se/consent-banner.js', company: 'Viking "Age"' },
    { loader, beacon });
  assert.ok(html.indexOf('consent-banner.js') < html.indexOf('spa-tracking.js'));
  assert.match(html, /data-site-id="site-1"/);
  assert.match(html, /data-api-url="https:\/\/api\.test\/functions\/v1"/);
  assert.match(html, /data-company="Viking &quot;Age&quot;"/);
  assert.match(html, /data-categories="analytics"/);
  assert.match(html, /data-policy-version="1"/);
});

test('own-cmp is the default and adds no banner', () => {
  assert.equal(renderTrackingSnippet(opts, { loader, beacon }).includes('consent-banner.js'), false);
});

test('no-banner setup: aggregate beacon only, never the tracker', () => {
  const html = renderTrackingSnippet({ ...opts, consentSetup: 'none' }, { loader, beacon });
  assert.match(html, /aggregate: true/);
  assert.match(html, /apiKey: 'tk_key'/);
  assert.match(html, /aggregate-hit/);
  assert.equal(html.includes('spa-tracking.js'), false);
  assert.equal(html.includes('consent-banner'), false);
});

// tests/foundation/tracking-snippet.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderTrackingSnippet, bannerDetailsProblem } from '../../src/lib/snippetTemplate.ts';

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
    { ...opts, consentSetup: 'cortiq-banner', bannerSrc: 'https://cortiq.se/consent-banner.js', company: ' Viking "Age" ',
      policyUrl: 'https://vikingage.se/integritet', policyVersion: '3' },
    { loader, beacon });
  assert.ok(html.indexOf('consent-banner.js') < html.indexOf('spa-tracking.js'));
  assert.match(html, /data-site-id="site-1"/);
  assert.match(html, /data-api-url="https:\/\/api\.test\/functions\/v1"/);
  assert.match(html, /data-company="Viking &quot;Age&quot;"/);
  assert.match(html, /data-categories="analytics"/);
  assert.match(html, /data-policy-url="https:\/\/vikingage\.se\/integritet"/);
  assert.match(html, /data-policy-version="3"/);
});

test('cortiq-banner never ships a placeholder controller or policy link', () => {
  const banner = { ...opts, consentSetup: 'cortiq-banner' };
  assert.throws(() => renderTrackingSnippet(banner, { loader, beacon }), /company name/);
  assert.throws(() => renderTrackingSnippet({ ...banner, company: '  ' , policyUrl: '/privacy' }, { loader, beacon }), /company name/);
  assert.throws(() => renderTrackingSnippet({ ...banner, company: 'Ex AB' }, { loader, beacon }), /privacy policy/);
  const html = renderTrackingSnippet({ ...banner, company: 'Ex AB', policyUrl: '/privacy' }, { loader, beacon });
  assert.equal(html.includes('Your Company'), false);
  assert.match(html, /data-policy-version="1"/, 'version defaults to 1');
});

test('privacy policy URL: https or a root-relative path only', () => {
  for (const ok of ['https://ex.se/privacy', '/privacy', '/']) assert.equal(bannerDetailsProblem({ company: 'Ex AB', policyUrl: ok }), null, ok);
  for (const bad of ['http://ex.se/p', '//evil.se/p', 'javascript:alert(1)', 'privacy', '/p"onload=x', 'https://ex.se/a b']) {
    assert.notEqual(bannerDetailsProblem({ company: 'Ex AB', policyUrl: bad }), null, bad);
  }
});

test('values cannot break out of the inline script or the banner attributes', () => {
  const evil = "x'</script><script>alert(1)//\n";
  for (const consentSetup of ['own-cmp', 'none', 'cortiq-banner']) {
    const html = renderTrackingSnippet(
      { ...opts, siteId: evil, trackingKey: evil, apiUrl: evil, consentSetup, company: '<b>"Ex"</b>', policyUrl: '/p' },
      { loader, beacon });
    assert.equal(html.includes('</script><script>alert'), false, consentSetup);
    assert.equal(/'x'</.test(html), false, consentSetup);
    assert.equal(html.includes('<b>'), false, consentSetup);
  }
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

// tests/foundation/self-tracking.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSelfTrackingSnippet, readSelfTrackingFiles, SELF_TRACKING_EXCLUDE } from '../../scripts/self-tracking-snippet.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url)).replace(/[\\/]$/, '');
const files = readSelfTrackingFiles(ROOT);
const SITE = '1174dce9-ca03-4660-b6b2-41c3d3632954';

test('no env, no tracking: the build ships without a snippet', () => {
  assert.equal(buildSelfTrackingSnippet({}, files), '');
  assert.equal(buildSelfTrackingSnippet({ VITE_CORTIQ_SITE_ID: SITE }, files), '');
});

test('snippet is consent-gated, cookieless, versioned and excludes the app', () => {
  const html = buildSelfTrackingSnippet({ VITE_CORTIQ_SITE_ID: SITE, VITE_CORTIQ_TRACKING_KEY: 'abcDEF123_-key' }, files);
  const config = JSON.parse(html.match(/window\.cortiqConfig = (\{.*\});/)[1]);
  assert.equal(config.siteId, SITE);
  assert.equal(config.cookieless, true);
  assert.equal(config.excludePaths, SELF_TRACKING_EXCLUDE);
  for (const p of ['/dashboard', '/auth', '/tracking-check']) assert.ok(config.excludePaths.includes(p), p);
  assert.match(html, new RegExp(`/cortiq\\.js\\?ver=${files.version.replace(/\./g, '\\.')}`));
  assert.match(html, /site_cookie_consent/, 'waits for the site banner');
  assert.doesNotMatch(html, /<script[^>]+src=/, 'no tracker request before consent');
  assert.doesNotMatch(html, /__CORTIQ_SRC__/);
});

test('malformed values fail the build instead of shipping broken JS', () => {
  assert.throws(() => buildSelfTrackingSnippet({ VITE_CORTIQ_SITE_ID: 'nope', VITE_CORTIQ_TRACKING_KEY: 'abcDEF123' }, files));
  assert.throws(() => buildSelfTrackingSnippet({ VITE_CORTIQ_SITE_ID: SITE, VITE_CORTIQ_TRACKING_KEY: "x';alert(1)//" }, files));
});

test('index.html carries the injection marker and vite wires the plugin', () => {
  assert.match(readFileSync(`${ROOT}/index.html`, 'utf8'), /<!--cortiq-self-tracking-->/);
  assert.match(readFileSync(`${ROOT}/vite.config.ts`, 'utf8'), /selfTracking\(mode\)/);
});

test('tracker skips page views on excludePaths, not only bot detection', () => {
  const src = readFileSync(`${ROOT}/public/spa-tracking.js`, 'utf8');
  assert.match(src, /function trackPageView\(\) \{\s*\/\/[^\n]*\n\s*if \(isExcludedPath\(\)\) return;/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fillCsp, inlineScripts, inlineHandlers, scriptHash, PLACEHOLDER } from '../../scripts/csp-hashes.mjs';

test('inline scripts: executable bodies only, not src scripts or JSON-LD', () => {
  const html = '<script>a()</script><script type="application/ld+json">{}</script><script src="/x.js"></script><script type="module">b()</script>';
  assert.deepEqual(inlineScripts(html), ['a()', 'b()']);
  assert.equal(scriptHash('a()'), `'sha256-${crypto.createHash('sha256').update('a()').digest('base64')}'`);
  assert.deepEqual(inlineHandlers('<button onclick="x()">'), ['<button onclick=']);
  assert.deepEqual(inlineHandlers('<a href="/">'), []);
});

test('each .htaccess with the placeholder gets the hashes of the pages it serves', () => {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'csp-'));
  const write = (rel, body) => { fs.mkdirSync(path.dirname(path.join(dist, rel)), { recursive: true }); fs.writeFileSync(path.join(dist, rel), body); };
  write('.htaccess', `script-src 'self' ${PLACEHOLDER}`);
  write('index.html', '<script>a()</script>');
  write('features/index.html', '<script>a()</script><script>b()</script>');
  write('api-docs/.htaccess', `script-src ${PLACEHOLDER}`);
  write('api-docs/index.html', '<script>c()\r\nd()</script>');
  write('server/x.html', '<script>ignored()</script>');
  fillCsp(dist);
  const root = fs.readFileSync(path.join(dist, '.htaccess'), 'utf8');
  assert.equal(root, `script-src 'self' ${[scriptHash('a()'), scriptHash('b()')].sort().join(' ')}`);
  assert.equal(fs.readFileSync(path.join(dist, 'api-docs/.htaccess'), 'utf8'), `script-src ${[scriptHash('c()\r\nd()'), scriptHash('c()\nd()')].sort().join(' ')}`);
  write('bad/index.html', '<img onerror="x()">');
  write('.htaccess', PLACEHOLDER);
  assert.throws(() => fillCsp(dist), /Inline event handler/);
  fs.rmSync(dist, { recursive: true });
});

const ENDPOINT = 'https://cxmkdtgfocgbfizawlwa.supabase.co/functions/v1/csp-report';
const policyLine = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8').split(/\r?\n/)
  .find((l) => l.includes('Header always set Content-Security-Policy '));

test('the site policy is enforced, keeps scripts restricted and reports violations', () => {
  const ht = fs.readFileSync(new URL('../../public/.htaccess', import.meta.url), 'utf8');
  assert.doesNotMatch(ht, /Content-Security-Policy-Report-Only/);
  const line = policyLine('../../public/.htaccess');
  assert.match(line, /Content-Security-Policy "default-src 'self'; script-src 'self' __CSP_SCRIPT_HASHES__;/);
  assert.doesNotMatch(line.match(/script-src([^;]*)/)[1], /unsafe-|\*|https:/);
  assert.match(line, /frame-ancestors 'self'/);
  assert.ok(line.includes(`report-uri ${ENDPOINT}; report-to csp-endpoint"`));
  assert.ok(ht.includes(`Header always set Reporting-Endpoints "csp-endpoint=\\"${ENDPOINT}\\""`));
  assert.match(ht, /Header always set X-Frame-Options "SAMEORIGIN"/);
  assert.match(ht, /Header always set X-Content-Type-Options "nosniff"/);
});

test('the API docs policy is enforced and reported too', () => {
  const line = policyLine('../../public/api-docs/.htaccess');
  assert.match(line, /script-src 'self' https:\/\/unpkg\.com\/swagger-ui-dist@5\.10\.0\/ __CSP_SCRIPT_HASHES__;/);
  assert.ok(line.includes(`report-uri ${ENDPOINT}; report-to csp-endpoint"`));
});

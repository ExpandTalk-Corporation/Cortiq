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
  write('api-docs/index.html', '<script>c()</script>');
  write('server/x.html', '<script>ignored()</script>');
  fillCsp(dist);
  const root = fs.readFileSync(path.join(dist, '.htaccess'), 'utf8');
  assert.equal(root, `script-src 'self' ${[scriptHash('a()'), scriptHash('b()')].sort().join(' ')}`);
  assert.equal(fs.readFileSync(path.join(dist, 'api-docs/.htaccess'), 'utf8'), `script-src ${scriptHash('c()')}`);
  write('bad/index.html', '<img onerror="x()">');
  write('.htaccess', PLACEHOLDER);
  assert.throws(() => fillCsp(dist), /Inline event handler/);
  fs.rmSync(dist, { recursive: true });
});

test('the site policy is report-only and keeps scripts restricted', () => {
  const ht = fs.readFileSync(new URL('../../public/.htaccess', import.meta.url), 'utf8');
  const line = ht.split(/\r?\n/).find((l) => l.includes('Header always set Content-Security-Policy'));
  assert.match(line, /Content-Security-Policy-Report-Only "default-src 'self'; script-src 'self' __CSP_SCRIPT_HASHES__;/);
  assert.doesNotMatch(line.match(/script-src([^;]*)/)[1], /unsafe-|\*|https:/);
});

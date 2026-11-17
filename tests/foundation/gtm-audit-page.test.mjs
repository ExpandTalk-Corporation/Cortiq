import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { sendAuditStats } from '../../src/lib/gtmAuditStats.ts';
import { buildStats } from '../../supabase/functions/_shared/gtm-audit/stats.ts';
import { audit } from '../../supabase/functions/_shared/gtm-audit/audit.ts';
import { sampleExport } from '../../scripts/gtm-audit/fixture.mjs';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

/** Recursively lists .ts files under a repo-relative directory, repo-relative paths. */
function listTsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(new URL(`../../${dir}`, import.meta.url), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...listTsFiles(rel));
    else if (entry.name.endsWith('.ts')) out.push(rel);
  }
  return out;
}

/** Strips // and /* *\/ comments so prose mentioning fetch/sendBeacon/XHR doesn't false-positive. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

test('sendAuditStats posts only the counters, with keepalive', async () => {
  const stats = buildStats(audit(sampleExport()));
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return new Response(null, { status: 204 }); };
  await sendAuditStats(stats, 'https://fn.test/functions/v1/gtm-audit-stats');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://fn.test/functions/v1/gtm-audit-stats');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.keepalive, true);
  assert.deepEqual(JSON.parse(calls[0].init.body), stats);
  assert.equal(calls[0].init.body.includes('GTM-SAMPLE1'), false);
});

test('sendAuditStats never throws and skips without an endpoint', async () => {
  let n = 0;
  globalThis.fetch = async () => { n += 1; throw new Error('offline'); };
  const stats = buildStats(audit(sampleExport()));
  await sendAuditStats(stats, 'https://fn.test/x');
  await sendAuditStats(stats, null);
  assert.equal(n, 1);
});

test('the GTM audit engine and UI make no network calls of their own', () => {
  const files = [
    'src/pages/GtmAudit.tsx',
    'src/lib/gtmAuditXlsx.ts',
    ...readdirSync(new URL('../../src/components/gtm-audit/', import.meta.url)).map((f) => `src/components/gtm-audit/${f}`),
    ...listTsFiles('supabase/functions/_shared/gtm-audit'),
  ];
  for (const f of files) {
    assert.doesNotMatch(stripComments(read(f)), /\bfetch\s*\(|sendBeacon|XMLHttpRequest|supabase\./, f);
  }
});

test('the page states where the file goes', () => {
  const page = read('src/pages/GtmAudit.tsx');
  assert.match(page, /never leaves your browser/);
  assert.match(page, /seoFor\("\/gtm-audit\/"\)/);
});

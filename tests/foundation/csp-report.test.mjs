// tests/foundation/csp-report.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCspReports, normalizeReport, cleanSource, MAX_REPORTS } from '../../supabase/functions/_shared/csp-report.js';
import { loadEdge, mockDatabase } from './edge-harness.mjs';

const legacy = (over = {}) => ({ 'csp-report': {
  'document-uri': 'https://cortiq.se/dashboard/sites/0b7c9a7e-1111-4111-8111-111111111111/?tab=replay#x',
  'violated-directive': 'script-src-elem', 'effective-directive': 'script-src-elem',
  'blocked-uri': 'https://1688360.cc/track.js?v=2', 'source-file': 'https://cortiq.se/assets/index-abc.js',
  disposition: 'enforce', 'script-sample': 'document.cookie', ...over,
} });
const modern = (body = {}) => ({ type: 'csp-violation', url: 'https://www.cortiq.se/features/', body: {
  documentURL: 'https://www.cortiq.se/features/?utm_source=x', effectiveDirective: 'connect-src',
  blockedURL: 'https://evil.test/hit.php?c=secret', disposition: 'report', sample: 'x', ...body,
} });

test('legacy report-uri body: path without query or ids, blocked origin+path, no sample', () => {
  assert.deepEqual(normalizeReport(legacy()), {
    document_path: '/dashboard/sites/:id', directive: 'script-src-elem',
    blocked: 'https://1688360.cc/track.js', source: 'https://cortiq.se/assets/index-abc.js', disposition: 'enforce',
  });
});

test('Reporting API body: same row shape, report disposition kept', () => {
  assert.deepEqual(normalizeReport(modern()), {
    document_path: '/features', directive: 'connect-src', blocked: 'https://evil.test/hit.php', source: '', disposition: 'report',
  });
});

test('reports for other hosts, http pages or odd directives are dropped', () => {
  assert.equal(normalizeReport(legacy({ 'document-uri': 'https://evil.test/' })), null);
  assert.equal(normalizeReport(legacy({ 'document-uri': 'http://cortiq.se/' })), null);
  assert.equal(normalizeReport(legacy({ 'effective-directive': "x'; drop", 'violated-directive': '' })), null);
  assert.equal(normalizeReport({ type: 'deprecation', body: {} }), null);
  assert.equal(normalizeReport(null), null);
});

test('blocked values: keywords kept, other schemes reduced to the scheme', () => {
  assert.equal(cleanSource('inline'), 'inline');
  assert.equal(cleanSource('eval'), 'eval');
  assert.equal(cleanSource('data:text/javascript,alert(1)'), 'data');
  assert.equal(cleanSource('chrome-extension://abcdef/content.js'), 'chrome-extension');
  assert.equal(cleanSource('not a url'), '');
});

test('batches: deduplicated, capped, invalid JSON → nothing', () => {
  const list = [modern(), modern(), ...Array.from({ length: 40 }, (_, i) => modern({ blockedURL: `https://h${i}.test/` }))];
  const rows = parseCspReports(JSON.stringify(list));
  assert.equal(rows.length, MAX_REPORTS - 1);
  assert.deepEqual(parseCspReports('{nope'), []);
});

function setup({ rate = { data: true, error: null } } = {}) {
  const rpcCalls = [];
  const db = mockDatabase(() => ({ data: null, error: null }), async (name, args) => {
    rpcCalls.push({ name, args });
    return name === 'check_rate_limit' ? rate : { data: null, error: null };
  });
  return { rpcCalls, handler: loadEdge('csp-report', db.client) };
}
const post = (body, type = 'application/csp-report') => new Request('https://fn.test/csp-report', {
  method: 'POST', headers: { 'content-type': type }, body: typeof body === 'string' ? body : JSON.stringify(body),
});

test('function: ingests each row, answers 204 with CORS', async () => {
  const { handler, rpcCalls } = setup();
  const res = await handler(post([modern(), legacy()], 'application/reports+json'));
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  const ingests = rpcCalls.filter((c) => c.name === 'ingest_csp_report').map((c) => c.args);
  assert.deepEqual(ingests.map((a) => a.p_blocked), ['https://evil.test/hit.php', 'https://1688360.cc/track.js']);
  assert.equal(JSON.stringify(rpcCalls).includes('document.cookie'), false);
});

test('function: rate limited, foreign or junk reports never reach the table', async () => {
  for (const [opts, body] of [[{ rate: { data: false, error: null } }, legacy()], [{}, legacy({ 'document-uri': 'https://x.test/' })], [{}, 'junk']]) {
    const { handler, rpcCalls } = setup(opts);
    assert.equal((await handler(post(body))).status, 204);
    assert.equal(rpcCalls.some((c) => c.name === 'ingest_csp_report'), false);
  }
  const { handler } = setup();
  assert.equal((await handler(new Request('https://fn.test/csp-report', { method: 'OPTIONS' }))).status, 200);
  assert.equal((await handler(new Request('https://fn.test/csp-report'))).status, 405);
});

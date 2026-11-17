import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildStats, validateStats, statsRows, bucketOf, MAX_COUNT } from '../../supabase/functions/_shared/gtm-audit/stats.ts';
import { audit } from '../../supabase/functions/_shared/gtm-audit/audit.ts';
import { tag, tpl, template, tplType, exportOf } from '../../scripts/gtm-audit/fixture.mjs';
import { loadEdge, mockDatabase } from './edge-harness.mjs';

const result = () => audit(exportOf({
  tags: [
    tag(1, 'Secret campaign name', 'html', [tpl('html', '<script src="https://snap.licdn.com/li.lms-analytics/insight.min.js"></script>')]),
    tag(2, 'Private chat', 'html', [tpl('html', '<script src="https://cdn.example-chat.com/w.js"></script>')]),
    tag(3, 'GA4', 'gaawe', [tpl('eventName', 'purchase')]),
    tag(4, 'Mystery', tplType(25)),
    tag(5, 'Odd', 'zzz_unknown_type'),
  ],
  templates: [template(25, 'Mystery template')],
}));

test('buckets', () => {
  assert.deepEqual([1, 10, 11, 25, 26, 50, 51, 100, 101, 250, 251, 9999].map(bucketOf),
    ['1-10', '1-10', '11-25', '11-25', '26-50', '26-50', '51-100', '51-100', '101-250', '101-250', '250+', '250+']);
});

test('buildStats: whitelisted keys only, no names, URLs or container IDs', () => {
  const s = buildStats(result());
  assert.equal(s.v, 1);
  assert.equal(s.bucket, '1-10');
  assert.deepEqual(s.types, { html: 2, gaawe: 1, template: 1, other: 1 });
  assert.deepEqual(s.vendors, { linkedin: 1, ga4: 1, unknown: 3 });
  assert.equal(s.checks['gtm.consent_missing'], 1);
  assert.equal(s.checks['gtm.stale'], undefined);
  assert.equal(Object.values(s.migration).reduce((a, b) => a + b, 0), 5);
  const json = JSON.stringify(s);
  for (const secret of ['Secret', 'Private', 'example-chat', 'GTM-SAMPLE1', 'purchase', 'zzz_unknown', 'Mystery']) {
    assert.equal(json.includes(secret), false, secret);
  }
  assert.deepEqual(validateStats(JSON.parse(json)), s);
});

test('validateStats rejects free text, unknown keys and bad counts; caps large counts', () => {
  const ok = buildStats(result());
  assert.equal(validateStats(null), null);
  assert.equal(validateStats('x'), null);
  assert.equal(validateStats({ ...ok, extra: 1 }), null);
  assert.equal(validateStats({ ...ok, v: 99 }), null);
  assert.equal(validateStats({ ...ok, bucket: 'lots' }), null);
  assert.equal(validateStats({ ...ok, types: { 'my secret tag': 1 } }), null);
  assert.equal(validateStats({ ...ok, vendors: { 'example.com': 1 } }), null);
  assert.equal(validateStats({ ...ok, checks: { 'gtm.nope': 1 } }), null);
  assert.equal(validateStats({ ...ok, migration: { covered: 1.5 } }), null);
  assert.equal(validateStats({ ...ok, migration: { covered: -1 } }), null);
  assert.equal(validateStats({ ...ok, types: ['html'] }), null);
  assert.equal(validateStats({ ...ok, types: JSON.parse('{"__proto__": 1}') }), null);
  assert.equal(validateStats({ ...ok, types: { html: 1e9 } }).types.html, MAX_COUNT);
});

test('statsRows: one row per counter, keys match the table check', () => {
  const { keys, counts } = statsRows(buildStats(result()));
  assert.equal(keys.length, counts.length);
  assert.equal(keys[0], 'files');
  assert.ok(keys.includes('bucket:1-10'));
  assert.ok(keys.includes('type:gaawe'));
  assert.ok(keys.includes('vendor:linkedin'));
  assert.ok(keys.includes('check:gtm.consent_missing'));
  assert.ok(keys.every((k) => /^[a-z0-9:_.+-]{1,80}$/.test(k)), keys.join());
  assert.ok(counts.every((c) => Number.isInteger(c) && c > 0 && c <= MAX_COUNT));
});

test('migration: service-role-only table and RPC with the same key check', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/20261201000001_gtm_audit_stats.sql', import.meta.url), 'utf8');
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON public\.gtm_audit_stats_daily FROM anon, authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.ingest_gtm_audit_stats\(text\[\], integer\[\]\) TO service_role/);
  assert.ok(sql.includes("'^[a-z0-9:_.+-]{1,80}$'"));
  assert.match(readFileSync(new URL('../../supabase/config.toml', import.meta.url), 'utf8'), /\[functions\.gtm-audit-stats\]\s*\nverify_jwt = false/);
});

function setup({ rate = { data: true, error: null } } = {}) {
  const rpcCalls = [];
  const db = mockDatabase(() => ({ data: null, error: null }), async (name, args) => {
    rpcCalls.push({ name, args });
    return name === 'check_rate_limit' ? rate : { data: null, error: null };
  });
  return { rpcCalls, handler: loadEdge('gtm-audit-stats', db.client) };
}
const post = (body) => new Request('https://fn.test/gtm-audit-stats', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body),
});

test('function: valid stats → one ingest call, 204 with CORS', async () => {
  const { handler, rpcCalls } = setup();
  const s = buildStats(result());
  const res = await handler(post(s));
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  const ingest = rpcCalls.filter((c) => c.name === 'ingest_gtm_audit_stats');
  assert.equal(ingest.length, 1);
  assert.deepEqual(ingest[0].args, { p_keys: statsRows(s).keys, p_counts: statsRows(s).counts });
});

test('function: junk, unknown keys, oversized bodies and rate limits never reach the table', async () => {
  const s = buildStats(result());
  for (const [opts, body, status] of [
    [{}, 'not json', 400],
    [{}, { ...s, vendors: { 'secret.example.com': 1 } }, 400],
    [{}, 'x'.repeat(11 * 1024), 413],
    [{ rate: { data: false, error: null } }, s, 204],
  ]) {
    const { handler, rpcCalls } = setup(opts);
    assert.equal((await handler(post(body))).status, status);
    assert.equal(rpcCalls.some((c) => c.name === 'ingest_gtm_audit_stats'), false);
  }
  const { handler } = setup();
  assert.equal((await handler(new Request('https://fn.test/gtm-audit-stats', { method: 'GET' }))).status, 405);
  assert.equal((await handler(new Request('https://fn.test/gtm-audit-stats', { method: 'OPTIONS' }))).status, 200);
});

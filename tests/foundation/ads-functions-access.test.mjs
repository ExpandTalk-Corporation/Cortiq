import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Executes the real paid-ads-analytics and click-fraud-analysis handlers with Supabase mocked.
// The user-scoped client stands in for RLS on `sites`; the service client records every read.
const siteId = '11111111-1111-4111-8111-111111111111';

function endpoint(name, { validUser = true, allowedSite = true, tables = {} } = {}) {
  let handler;
  const calls = { service: [], filters: [] };
  const service = {
    from(table) {
      calls.service.push(table);
      const result = { data: tables[table] ?? [], error: null };
      const query = {
        select() { return query; }, eq() { return query; }, not() { return query; },
        gte() { return query; }, lte() { return query; }, order() { return query; }, limit() { return query; },
        in(column, values) { calls.filters.push({ table, column, values }); return query; },
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => ({ data: null, error: null }),
        then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
      };
      return query;
    },
  };
  const userClient = {
    auth: { getUser: async () => ({ data: { user: validUser ? { id: 'owner' } : null }, error: null }) },
    from(table) {
      assert.equal(table, 'sites');
      const query = {
        select() { return query; }, eq() { return query; },
        maybeSingle: async () => ({ data: allowedSite ? { id: siteId } : null, error: null }),
      };
      return query;
    },
  };
  const env = { SUPABASE_URL: 'https://example.invalid', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service' };
  const cache = new Map();
  function load(url) {
    if (cache.has(url.href)) return cache.get(url.href);
    const exports = {};
    cache.set(url.href, exports);
    const code = ts.transpileModule(readFileSync(url, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    runInNewContext(code, {
      exports, Request, Response, URL, setTimeout, clearTimeout, crypto, TextEncoder, btoa, atob, performance,
      console: { log() {}, warn() {}, error() {} },
      Deno: { env: { get: key => env[key] }, serve: fn => { handler = fn; } },
      fetch: async () => { throw new Error('Unexpected outbound request'); },
      require(specifier) {
        if (specifier.endsWith('_shared/supabase.ts')) return { createClient: (_url, key) => (key === 'service' ? service : userClient) };
        if (specifier.startsWith('.')) return load(new URL(specifier, url));
        if (specifier.includes('http/server')) return { serve: fn => { handler = fn; } };
        throw new Error(`Unhandled dependency: ${specifier}`);
      },
    });
    return exports;
  }
  load(new URL(`../../supabase/functions/${name}/index.ts`, import.meta.url));
  return { handler, calls };
}

function request(body = { siteId, startDate: '2026-10-01', endDate: '2026-10-31' }, authorization = 'Bearer session') {
  return new Request('https://example.invalid/fn', {
    method: 'POST',
    headers: authorization ? { Authorization: authorization } : {},
    body: JSON.stringify(body),
  });
}

for (const name of ['paid-ads-analytics', 'click-fraud-analysis']) {
  for (const scenario of [
    { label: 'missing authentication', authorization: '', status: 401 },
    { label: 'invalid session', options: { validUser: false }, status: 401 },
    { label: 'another tenant site', options: { allowedSite: false }, status: 403 },
  ]) {
    test(`${name} rejects ${scenario.label} before any service-role read`, async () => {
      const { handler, calls } = endpoint(name, scenario.options);
      const response = await handler(request(undefined, scenario.authorization ?? 'Bearer session'));
      assert.equal(response.status, scenario.status);
      assert.deepEqual(calls.service, []);
    });
  }

  test(`${name} lets a site member through to tracking_sessions`, async () => {
    const { handler, calls } = endpoint(name);
    const response = await handler(request());
    assert.equal(response.status, 200);
    assert.ok(calls.service.includes('tracking_sessions'));
  });
}

test('paid-ads-analytics joins conversions on tracking_sessions.id (uuid), not the text session token', async () => {
  const sessionUuid = '22222222-2222-4222-8222-222222222222';
  const { handler, calls } = endpoint('paid-ads-analytics', {
    tables: {
      tracking_sessions: [{ id: sessionUuid, session_id: 'sess_abc', utm_campaign: 'autumn', utm_source: 'google', utm_medium: 'cpc', started_at: '2026-10-05T10:00:00Z', page_views: 2 }],
      conversion_events: [{ session_id: sessionUuid, event_value: '50', event_name: 'purchase' }],
    },
  });
  const body = await (await handler(request())).json();
  const conversionFilter = calls.filters.find(f => f.table === 'conversion_events');
  assert.deepEqual(conversionFilter, { table: 'conversion_events', column: 'session_id', values: [sessionUuid] });
  assert.equal(body.summary.totalConversions, 1);
  assert.equal(body.campaigns[0].conversions, 1);
  assert.equal(body.campaigns[0].revenue, 50);
});

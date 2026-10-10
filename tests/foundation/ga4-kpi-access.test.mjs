import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Executes the real ga4-kpi-dashboard(-debug) handlers. Supabase, Google OAuth and
// GA4 are mocked; the user-scoped client stands in for RLS on `sites`.
const siteId = '11111111-1111-4111-8111-111111111111';

function endpoint(name, { validUser = true, allowedSite = true } = {}) {
  let handler;
  const calls = { service: [], google: 0, getUserTokens: [], userAuthHeaders: [] };
  const service = {
    from(table) {
      calls.service.push(table);
      const query = {
        select() { return query; }, eq() { return query; },
        single: async () => ({ data: { ga_property_id: '123', ga_integration_enabled: true, site_name: 'Test' }, error: null }),
        maybeSingle: async () => ({ data: { ga_property_id: '123', ga_integration_enabled: true, site_name: 'Test' }, error: null }),
      };
      return query;
    },
  };
  const userClient = {
    auth: { getUser: async (token) => { calls.getUserTokens.push(token); return { data: { user: validUser ? { id: 'owner' } : null }, error: null }; } },
    from(table) {
      assert.equal(table, 'sites');
      const query = {
        select() { return query; }, eq() { return query; },
        maybeSingle: async () => ({ data: allowedSite ? { id: siteId } : null, error: null }),
      };
      return query;
    },
  };
  const env = { SUPABASE_URL: 'https://example.invalid', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', GA4_SERVICE_ACCOUNT_KEY: '' };
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
      Deno: { env: { get: key => env[key] } },
      fetch: async () => { calls.google++; throw new Error('Unexpected outbound request'); },
      require(specifier) {
        if (specifier.startsWith('.')) return load(new URL(specifier, url));
        if (specifier.includes('http/server')) return { serve: fn => { handler = fn; } };
        if (specifier.includes('supabase-js')) return { createClient: (_url, key, options) => {
          if (key === 'service') return service;
          assert.equal(key, 'anon');
          calls.userAuthHeaders.push(options?.global?.headers?.Authorization);
          return userClient;
        } };
        throw new Error(`Unhandled dependency: ${specifier}`);
      },
    });
    return exports;
  }
  load(new URL(`../../supabase/functions/${name}/index.ts`, import.meta.url));
  return { handler, calls };
}

function request(body = { siteId, startDate: '2026-01-01', endDate: '2026-12-31',
  comparisonStartDate: '2025-01-01', comparisonEndDate: '2025-12-31' }, authorization = 'Bearer session') {
  return new Request('https://example.invalid/fn', {
    method: 'POST',
    headers: authorization ? { Authorization: authorization } : {},
    body: JSON.stringify(body),
  });
}

const FUNCTIONS = ['ga4-kpi-dashboard', 'ga4-kpi-dashboard-debug', 'ga4-search-terms', 'ga4-search-terms-debug'];

for (const name of FUNCTIONS) {
  for (const scenario of [
    { label: 'missing authentication', authorization: '', status: 401 },
    { label: 'invalid session', options: { validUser: false }, status: 401 },
    { label: 'another tenant site', options: { allowedSite: false }, status: 403 },
    { label: 'non-UUID site id', body: { siteId: 'x', startDate: '2026-01-01', endDate: '2026-12-31' }, status: 400 },
  ]) {
    test(`${name} rejects ${scenario.label} before service-role reads or GA4`, async () => {
      const { handler, calls } = endpoint(name, scenario.options);
      const response = await handler(request(scenario.body, scenario.authorization ?? 'Bearer session'));
      assert.equal(response.status, scenario.status);
      assert.deepEqual(calls.service, []);
      assert.equal(calls.google, 0);
    });
  }

  test(`${name} lets a site member through to the site config lookup`, async () => {
    const { handler, calls } = endpoint(name);
    await handler(request());
    assert.deepEqual(calls.getUserTokens, ['session']);
    assert.deepEqual(calls.userAuthHeaders, ['Bearer session']);
    assert.ok(calls.service.includes('sites'), 'authorized request reads site config');
  });
}

test('config.toml requires a JWT for the GA4 dashboard functions', () => {
  const toml = readFileSync(new URL('../../supabase/config.toml', import.meta.url), 'utf8');
  for (const name of FUNCTIONS) {
    const block = toml.match(new RegExp(`\\[functions\\.${name}\\]\\s*\\nverify_jwt\\s*=\\s*(\\w+)`));
    assert.ok(block, `${name} block missing`);
    assert.equal(block[1], 'true');
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Execute the real edge handler, replacing only external runtime/IO boundaries.
const source = readFileSync(new URL('../../supabase/functions/generate-dashboard-insights/index.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const siteId = '11111111-1111-4111-8111-111111111111';

function endpoint({ validUser = true, allowedSite = true, siteError = null, summaryError = null, sourceError = null,
  providerStatus = 200, aiInsights = [], insertError = null } = {}) {
  let handler;
  const calls = { service: [], ai: 0, siteFilters: [], prompt: '', inserts: [], summaryArgs: null };
  const service = {
    from(table) {
      calls.service.push(table);
      const result = { data: [], error: sourceError, count: table === 'heatmap_data' ? 2500 : 42 };
      let insert = false;
      const query = {
        select() { return query; }, eq() { return query; }, gte() { return query; }, lte() { return query; }, order() { return query; },
        limit() { return Promise.resolve(result); },
        insert(payload) { insert = true; calls.inserts.push({ table, payload }); return query; }, update() { return query; },
        single() { return Promise.resolve({ data: { id: 'run-1' }, error: null }); },
        then(resolve, reject) { return Promise.resolve(insert && table === 'dashboard_insights' ? { error: insertError } : result).then(resolve, reject); },
      };
      return query;
    },
  };
  const userClient = {
    rpc: async (name, args) => {
      assert.equal(name, 'get_analytics_summary');
      calls.summaryArgs = args;
      return { error: summaryError, data: { total_page_views: 12345, total_sessions: 4567,
        top_pages: [{ url: 'https://example.test/path?email=private@example.test#token', views: 4321 }], device_breakdown: { desktop: 4567 } } };
    },
    auth: { getUser: async () => ({ data: { user: validUser ? { id: 'owner' } : null }, error: null }) },
    from(table) {
      assert.equal(table, 'sites');
      const query = {
        select() { return query; },
        eq(key, value) { calls.siteFilters.push([key, value]); return query; },
        maybeSingle: async () => ({ data: allowedSite ? { id: siteId } : null, error: siteError }),
      };
      return query;
    },
  };
  runInNewContext(compiled, {
    exports: {}, Request, Response, console: { log() {}, error() {} },
    Deno: { env: { get: key => ({ SUPABASE_URL: 'https://example.invalid', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', OPENAI_API_KEY: 'test' })[key] } },
    require(name) {
      if (name.includes('http/server')) return { serve: fn => { handler = fn; } };
      if (name.includes('supabase-js')) return { createClient: (_url, key, options) => {
        if (key === 'service') return service;
        assert.equal(options.global.headers.Authorization, 'Bearer session');
        return userClient;
      } };
      return {};
    },
    fetch: async (_url, options) => {
      calls.ai++;
      calls.prompt = JSON.parse(options.body).messages[1].content;
      return Response.json({ choices: [{ message: { content: JSON.stringify({ insights: aiInsights }) } }], usage: {} }, { status: providerStatus });
    },
  });
  return { handler, calls };
}

function request(body = { siteId }, authorization = 'Bearer session', method = 'POST') {
  return new Request('https://example.invalid/insights', {
    method, headers: authorization ? { Authorization: authorization } : {},
    ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  });
}

for (const scenario of [
  { name: 'missing authentication', authorization: '', status: 401 },
  { name: 'invalid session', options: { validUser: false }, status: 401 },
  { name: 'another tenant site', options: { allowedSite: false }, status: 403 },
  { name: 'failed access lookup', options: { siteError: { message: 'offline' } }, status: 503 },
  { name: 'malformed JSON', body: '{', status: 400 },
  { name: 'missing site', body: {}, status: 400 },
  { name: 'null body', body: null, status: 400 },
  { name: 'invalid site ID', body: { siteId: 'not-a-uuid' }, status: 400 },
  { name: 'wrong method', method: 'GET', status: 405 },
]) {
  test(`insights reject ${scenario.name} before privileged reads or AI`, async () => {
    const { handler, calls } = endpoint(scenario.options);
    const response = await handler(request('body' in scenario ? scenario.body : { siteId }, scenario.authorization, scenario.method));
    assert.equal(response.status, scenario.status);
    assert.equal(calls.service.length, 0);
    assert.equal(calls.ai, 0);
  });
}

test('authorized site reaches the existing insight pipeline with the user-scoped filter', async () => {
  const { handler, calls } = endpoint();
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).success, true);
  assert.deepEqual(calls.siteFilters, [['id', siteId]]);
  assert.equal(calls.summaryArgs.p_site_id, siteId);
  assert.equal(calls.service.includes('page_views'), false);
  assert.equal(calls.ai, 1);
});

test('AI receives aggregate totals above former limits and explicit form scope', async () => {
  const { handler, calls } = endpoint();
  const response = await handler(request());
  const body = await response.json();
  assert.equal(body.dataPoints.pageViews, 12345);
  assert.equal(body.dataPoints.heatmapInteractions, 2500);
  assert.equal(body.dataPoints.formsTracked, 42);
  assert.match(calls.prompt, /12345/);
  assert.match(calls.prompt, /4567/);
  assert.match(calls.prompt, /LIFETIME/);
  assert.match(calls.prompt, /not a seven-day total/);
  assert.equal(calls.prompt.includes('private@example.test'), false);
});

for (const options of [{ summaryError: { message: 'offline' } }, { sourceError: { message: 'offline' } }]) {
  test(`analytics query failure prevents AI call: ${Object.keys(options)[0]}`, async () => {
    const { handler, calls } = endpoint(options);
    assert.equal((await handler(request())).status, 500);
    assert.equal(calls.ai, 0);
    assert.equal(calls.inserts.some(c => c.table === 'dashboard_insights'), false);
  });
}

test('provider limit does not fabricate or save a website recommendation', async () => {
  const { handler, calls } = endpoint({ providerStatus: 429 });
  assert.equal((await handler(request())).status, 500);
  assert.equal(calls.inserts.some(c => c.table === 'dashboard_insights'), false);
});

const suggestion = { title: 'Review page', description: 'Inspect the page', actionItems: ['Check content'], priority: 'low', type: 'traffic', confidence: 99 };
test('model confidence is not stored as a measured probability', async () => {
  const { handler, calls } = endpoint({ aiInsights: [suggestion] });
  assert.equal((await handler(request())).status, 200);
  assert.equal(calls.inserts.find(c => c.table === 'dashboard_insights').payload[0].confidence_score, null);
});

test('failed insight write does not report success', async () => {
  const { handler } = endpoint({ aiInsights: [suggestion], insertError: { message: 'offline' } });
  assert.equal((await handler(request())).status, 500);
});

test('malformed model structure is rejected before insight writes', async () => {
  const { handler, calls } = endpoint({ aiInsights: [{ title: 'incomplete' }] });
  assert.equal((await handler(request())).status, 500);
  assert.equal(calls.inserts.some(c => c.table === 'dashboard_insights'), false);
});

test('CORS preflight performs no privileged work', async () => {
  const { handler, calls } = endpoint();
  assert.equal((await handler(request(undefined, '', 'OPTIONS'))).status, 200);
  assert.equal(calls.service.length, 0);
});

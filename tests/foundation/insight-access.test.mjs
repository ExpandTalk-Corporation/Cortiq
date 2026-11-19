import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Execute the real edge handler, replacing only external runtime/IO boundaries.
const source = readFileSync(new URL('../../supabase/functions/generate-dashboard-insights/index.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const siteId = '11111111-1111-4111-8111-111111111111';

const factsCompiled = ts.transpileModule(readFileSync(new URL('../../supabase/functions/_shared/insight-facts.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function insightFacts() { const exports = {}; runInNewContext(factsCompiled, { exports }); return exports; }

function endpoint({ validUser = true, allowedSite = true, siteError = null, summaryError = null, sourceError = null,
  providerStatus = 200, providerStatuses = null, aiInsights = [], aiReplies = [aiInsights], insertError = null } = {}) {
  let handler;
  const calls = { service: [], ai: 0, siteFilters: [], prompt: '', inserts: [], summaryArgs: null, updates: [], prompts: [], summaryCalls: [] };
  const service = {
    from(table) {
      calls.service.push(table);
      const result = (table === 'form_sessions' || table === 'conversion_events')
        ? { data: [], error: null }
        : { data: [], error: sourceError, count: table === 'heatmap_data' ? 2500 : 42 };
      let insert = false;
      const query = {
        select() { return query; }, eq() { return query; }, gte() { return query; }, lte() { return query; }, order() { return query; },
        limit() { return Promise.resolve(result); },
        insert(payload) { insert = true; calls.inserts.push({ table, payload }); return query; },
        update(payload) { calls.updates.push({ table, payload }); return query; },
        single() { return Promise.resolve({ data: { id: 'run-1' }, error: null }); },
        then(resolve, reject) { return Promise.resolve(insert && table === 'dashboard_insights' ? { error: insertError } : result).then(resolve, reject); },
      };
      return query;
    },
  };
  const userClient = {
    rpc: async (name, args) => {
      if (name === 'get_measurement_health') return { error: null, data: { status: 'warning', checks: [{ key: 'uptime', status: 'ok' }, { key: 'pipelines', status: 'warning' }] } };
      assert.equal(name, 'get_analytics_summary');
      calls.summaryCalls.push(args);
      calls.summaryArgs ??= args;   // the current period is requested first
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
    Deno: { env: { get: key => ({ SUPABASE_URL: 'https://example.invalid', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', ANTHROPIC_API_KEY: 'test' })[key] } },
    require(name) {
      if (name.includes('http/server')) return { serve: fn => { handler = fn; } };
      if (name.includes('supabase-js') || name.endsWith('/_shared/supabase.ts')) return { createClient: (_url, key, options) => {
        if (key === 'service') return service;
        assert.equal(options.global.headers.Authorization, 'Bearer session');
        return userClient;
      } };
      if (name.endsWith('/_shared/insight-facts.ts')) return insightFacts();
      return {};
    },
    fetch: async (_url, options) => {
      const body = JSON.parse(options.body);
      calls.prompt ||= body.messages[0].content;
      calls.prompts.push(body.messages);
      const reply = aiReplies[Math.min(calls.ai, aiReplies.length - 1)];
      const status = providerStatuses ? providerStatuses[Math.min(calls.ai, providerStatuses.length - 1)] : providerStatus;
      calls.ai++;
      return Response.json({ content: [{ type: 'text', text: JSON.stringify({ insights: reply }) }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } }, { status });
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
  { name: 'only one period bound', body: { siteId, from: '2026-09-01' }, status: 400 },
  { name: 'malformed period', body: { siteId, from: '2026-9-1', to: '2026-09-30' }, status: 400 },
  { name: 'impossible date', body: { siteId, from: '2026-02-30', to: '2026-03-02' }, status: 400 },
  { name: 'reversed period', body: { siteId, from: '2026-09-30', to: '2026-09-01' }, status: 400 },
  { name: 'period over 366 days', body: { siteId, from: '2025-01-01', to: '2026-09-01' }, status: 400 },
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
  assert.match(calls.prompt, /not a total for this period/);
  assert.match(calls.prompt, /the last 7 days/);
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

const suggestion = { title: 'Review page', description: 'Page views reached {{m1}} this period', actionItems: ['Check content'], priority: 'low', type: 'traffic', confidence: 99 };
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

test('the dashboard period reaches the summary RPC, the prompt and the audit record', async () => {
  const { handler, calls } = endpoint({ aiInsights: [suggestion] });
  const response = await handler(request({ siteId, from: '2026-09-01', to: '2026-09-30' }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(calls.summaryArgs.p_from, '2026-09-01T00:00:00.000Z');
  assert.equal(calls.summaryArgs.p_to, '2026-09-30T23:59:59.999Z');
  assert.equal(calls.summaryCalls[1].p_to, '2026-08-31T23:59:59.999Z', 'the previous period ends just before the selected one');
  assert.match(calls.prompt, /2026-09-01 to 2026-09-30 \(30 days/);
  assert.deepEqual(body.period, { from: '2026-09-01', to: '2026-09-30', days: 30 });
  assert.equal(body.runId, 'run-1', 'the panel links the result to its agent_runs record');
  const runUpdate = calls.inserts.find(c => c.table === 'agent_runs');
  assert.ok(runUpdate, 'agent_runs is still written');
  assert.equal(calls.inserts.find(c => c.table === 'dashboard_insights').payload[0].run_id, 'run-1');
});

test('the prompt lists facts by id and forbids bare numbers', async () => {
  const { handler, calls } = endpoint({ aiInsights: [suggestion] });
  assert.equal((await handler(request())).status, 200);
  assert.match(calls.prompt, /m1 \| Page views \| 12345 count \|/);
  assert.match(calls.prompt, /\{\{mN\}\}/);
  const snapshot = calls.updates.find((u) => u.table === 'agent_runs' && u.payload.data_snapshot?.facts).payload.data_snapshot;
  assert.equal(snapshot.facts[0].id, 'm1');
  assert.equal(snapshot.facts[0].source, 'get_analytics_summary');
});

test('stored insights carry their fact ids', async () => {
  const { handler, calls } = endpoint({ aiInsights: [suggestion] });
  await handler(request());
  // Spread into a plain array first: data_points was built inside a separately-sandboxed
  // vm context (insight-facts.ts loaded via its own runInNewContext), so it is a same-shape
  // but cross-realm Array whose prototype differs from this file's — deepEqual (strict) treats
  // that as unequal even though the values match.
  assert.deepEqual([...calls.inserts.find((c) => c.table === 'dashboard_insights').payload[0].data_points], ['m1']);
  assert.equal(calls.inserts.find((c) => c.table === 'dashboard_insights').payload[0].description, 'Page views reached {{m1}} this period', 'text is stored with tokens');
});

test('a bare number triggers one retry with the errors; the fixed insight is stored', async () => {
  const bad = { ...suggestion, description: 'Page views reached 12345' };
  const { handler, calls } = endpoint({ aiReplies: [[bad], [suggestion]] });
  assert.equal((await handler(request())).status, 200);
  assert.equal(calls.ai, 2);
  assert.match(calls.prompts[1].at(-1).content, /number "12345" written without a fact token/);
  assert.equal(calls.inserts.find((c) => c.table === 'dashboard_insights').payload.length, 1);
});

test('insights still invalid after the retry are dropped and counted', async () => {
  const bad = { ...suggestion, description: 'About 41% of visitors leave' };
  const { handler, calls } = endpoint({ aiReplies: [[bad], [bad]] });
  const res = await handler(request());
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).insights, []);
  assert.equal(calls.inserts.some((c) => c.table === 'dashboard_insights'), false);
  const done = calls.updates.find((u) => u.table === 'agent_runs' && u.payload.status === 'completed').payload;
  // Not the old wholesale-replace count (which only looked at the retry's single insight):
  // the first-pass rejection (not recovered) plus the retry's own failed insight = 2.
  assert.equal(done.data_snapshot.rejected, 2);
  assert.equal(done.input_tokens, 20, 'usage of both calls is recorded');
});

test('valid first-pass insights survive the retry; only the rejected slot is replaced', async () => {
  const good1 = { title: 'Traffic up', description: 'Page views reached {{m1}} this period', actionItems: ['Check content'], priority: 'low', type: 'traffic' };
  const good2 = { title: 'Session volume', description: 'Sessions reached {{m2}} this period', actionItems: ['Check content'], priority: 'medium', type: 'traffic' };
  const bad = { title: 'Bad one', description: 'About 41% of visitors leave', actionItems: ['Fix it'], priority: 'low', type: 'traffic' };
  const retryGood = { title: 'New insight from retry', description: 'Pages per session reached {{m7}}', actionItems: ['Check content'], priority: 'low', type: 'traffic' };
  const { handler, calls } = endpoint({ aiReplies: [[good1, good2, bad], [retryGood]] });
  const res = await handler(request());
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(calls.ai, 2, 'the retry was attempted');
  assert.deepEqual(body.insights.map((i) => i.title).sort(), ['New insight from retry', 'Session volume', 'Traffic up']);
  const stored = calls.inserts.find((c) => c.table === 'dashboard_insights').payload;
  assert.equal(stored.length, 3, 'the two valid first-pass insights plus the retry replacement');
  const done = calls.updates.find((u) => u.table === 'agent_runs' && u.payload.status === 'completed').payload;
  assert.equal(done.data_snapshot.rejected, 0);
});

test('a failed or non-OK retry keeps the valid first-pass insights and does not fail the run', async () => {
  const good1 = { title: 'Traffic up', description: 'Page views reached {{m1}} this period', actionItems: ['Check content'], priority: 'low', type: 'traffic' };
  const good2 = { title: 'Session volume', description: 'Sessions reached {{m2}} this period', actionItems: ['Check content'], priority: 'medium', type: 'traffic' };
  const bad = { title: 'Bad one', description: 'About 41% of visitors leave', actionItems: ['Fix it'], priority: 'low', type: 'traffic' };
  const { handler, calls } = endpoint({ aiReplies: [[good1, good2, bad]], providerStatuses: [200, 500] });
  const res = await handler(request());
  assert.equal(res.status, 200, 'a broken retry call does not fail the whole run');
  const body = await res.json();
  assert.equal(calls.ai, 2, 'the retry was attempted even though it failed');
  assert.deepEqual(body.insights.map((i) => i.title).sort(), ['Session volume', 'Traffic up']);
  const stored = calls.inserts.find((c) => c.table === 'dashboard_insights').payload;
  assert.equal(stored.length, 2, 'only the two valid first-pass insights are stored');
});

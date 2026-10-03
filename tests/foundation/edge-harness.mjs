import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

export function loadEdge(name, client, { env = {}, fetch = async () => { throw new Error('Unexpected outbound request'); } } = {}) {
  let handler;
  const cache = new Map();
  function load(url) {
    if (cache.has(url.href)) return cache.get(url.href);
    const exports = {};
    cache.set(url.href, exports);
    const code = ts.transpileModule(readFileSync(url, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    runInNewContext(code, {
      exports, Request, Response, URL, fetch,
      console: { log() {}, warn() {}, error() {} },
      Deno: { serve: fn => { handler = fn; }, env: { get: key => env[key] ?? 'test-value' } },
      require(specifier) {
        if (specifier.startsWith('.')) return load(new URL(specifier, url));
        if (specifier.includes('supabase-js')) return { createClient: () => client };
        if (specifier.includes('http/server')) return { serve: fn => { handler = fn; } };
        if (specifier.includes('/xhr@')) return {};
        throw new Error(`Unhandled dependency: ${specifier}`);
      },
    });
    return exports;
  }
  load(new URL(`../../supabase/functions/${name}/index.ts`, import.meta.url));
  return handler;
}

export function mockDatabase(resolve, rpc = async () => ({ data: true, error: null })) {
  const calls = [];
  const client = {
    rpc,
    from(table) {
      const operation = { table, type: 'select', filters: [], payload: null };
      const query = {
        select(columns) { operation.columns = columns; return query; },
        insert(payload) { operation.type = 'insert'; operation.payload = payload; return query; },
        update(payload) { operation.type = 'update'; operation.payload = payload; return query; },
        eq(key, value) { operation.filters.push([key, value]); return query; },
        order() { return query; }, limit() { return query; }, not() { return query; },
        in() { return query; }, or() { return query; },
        then(yes, no) { calls.push(operation); return Promise.resolve(resolve(operation)).then(yes, no); },
        maybeSingle() { return query; }, single() { return query; },
      };
      return query;
    },
  };
  return { client, calls };
}

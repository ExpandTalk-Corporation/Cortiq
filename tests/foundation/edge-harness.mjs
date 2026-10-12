import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import ts from 'typescript';

// Every loaded file is compiled with vm.compileFunction and run WITHOUT a separate vm
// context, so it shares this module's own realm (Array, Object, Error, ...). A per-file
// vm.runInNewContext would isolate each file into its own realm: `instanceof Error` would
// then fail across module boundaries, and values built by handler code (arrays, plain
// objects) would fail strict deep-equal against literals in the test file even when they
// are structurally identical (Node's documented "same structure but not reference-equal").
const PARAMS = ['exports', 'require', 'Deno', 'Request', 'Response', 'URL', 'fetch', 'crypto', 'TextEncoder', 'TextDecoder', 'AbortSignal', 'Headers', 'btoa', 'atob', 'setTimeout', 'console'];

export function loadEdge(name, client, { env = {}, fetch = async () => { throw new Error('Unexpected outbound request'); } } = {}) {
  let handler;
  const cache = new Map();
  const Deno = { serve: fn => { handler = fn; }, env: { get: key => env[key] ?? 'test-value' } };
  const noopConsole = { log() {}, warn() {}, error() {} };
  function load(url) {
    if (cache.has(url.href)) return cache.get(url.href);
    const exports = {};
    cache.set(url.href, exports);
    const code = ts.transpileModule(readFileSync(url, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const require = (specifier) => {
      if (specifier.startsWith('.')) return load(new URL(specifier, url));
      if (specifier.includes('supabase-js')) return { createClient: () => client };
      if (specifier.includes('http/server')) return { serve: fn => { handler = fn; } };
      if (specifier.includes('/xhr@')) return {};
      throw new Error(`Unhandled dependency: ${specifier}`);
    };
    const fn = compileFunction(code, PARAMS, { filename: url.href });
    fn(exports, require, Deno, Request, Response, URL, fetch, globalThis.crypto, TextEncoder, TextDecoder, AbortSignal, Headers, btoa, atob, setTimeout, noopConsole);
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

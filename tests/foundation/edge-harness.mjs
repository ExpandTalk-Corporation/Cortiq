import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import ts from 'typescript';

// Every loaded file is compiled with vm.compileFunction and run WITHOUT a separate vm
// context, so it shares this module's own realm (Array, Object, Error, ...). A per-file
// vm.runInNewContext would isolate each file into its own realm: `instanceof Error` would
// then fail across module boundaries, and values built by handler code (arrays, plain
// objects) would fail strict deep-equal against literals in the test file even when they
// are structurally identical (Node's documented "same structure but not reference-equal").
//
// Sharing the real realm also means the real `globalThis` is reachable. `globalThis` and
// `self` are therefore bound to a shadow object (prototype-chained to the real globalThis,
// so everything else — JSON, console, ... — still works) so that `globalThis.fetch` /
// `.Deno` agree with the bare `fetch` / `Deno` stubs below, and `globalThis.WebSocket` /
// `.process` are hidden instead of reaching real Node globals — otherwise a missing stub would
// make a real network call instead of failing the test. `.EdgeRuntime` is hidden unless the
// caller passes a stub (loadEdge does, to collect work handed to EdgeRuntime.waitUntil).
const PARAMS = ['exports', 'require', 'Deno', 'Request', 'Response', 'URL', 'fetch', 'crypto', 'TextEncoder', 'TextDecoder', 'AbortSignal', 'Headers', 'btoa', 'atob', 'setTimeout', 'console', 'globalThis', 'self'];
const noopConsole = { log() {}, warn() {}, error() {} };

function runModule(code, filename, { exports, require, Deno, fetch, EdgeRuntime }) {
  const shadow = Object.create(globalThis, {
    fetch: { value: fetch },
    Deno: { value: Deno },
    WebSocket: { value: undefined },
    process: { value: undefined },
    EdgeRuntime: { value: EdgeRuntime },
  });
  const fn = compileFunction(code, PARAMS, { filename });
  return fn(exports, require, Deno, Request, Response, URL, fetch, globalThis.crypto, TextEncoder, TextDecoder, AbortSignal, Headers, btoa, atob, setTimeout, noopConsole, shadow, shadow);
}

// Work handed to EdgeRuntime.waitUntil runs after the response in production. By default the
// returned handler waits for it before resolving, so tests can assert what it wrote; pass
// { flushWaitUntil: false } to get the raw handler, with the pending work on handler.waitUntilWork.
// { edgeRuntime: false } hides EdgeRuntime entirely (code then takes its no-runtime path).
export function loadEdge(name, client, { env = {}, fetch = async () => { throw new Error('Unexpected outbound request'); }, flushWaitUntil = true, edgeRuntime = true } = {}) {
  let handler;
  const cache = new Map();
  const waitUntilWork = [];
  const EdgeRuntime = edgeRuntime ? { waitUntil: (p) => { waitUntilWork.push(p); } } : undefined;
  const Deno = { serve: fn => { handler = fn; }, env: { get: key => env[key] ?? 'test-value' } };
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
    runModule(code, url.href, { exports, require, Deno, fetch, EdgeRuntime });
    return exports;
  }
  load(new URL(`../../supabase/functions/${name}/index.ts`, import.meta.url));
  const raw = handler;
  if (!flushWaitUntil) return Object.assign((req) => raw(req), { waitUntilWork });
  return async (req) => {
    const res = await raw(req);
    while (waitUntilWork.length) await Promise.allSettled(waitUntilWork.splice(0));
    return res;
  };
}

// Exposed only for a harness self-test: compiles and runs a source string the same way
// loadEdge compiles a file, without needing a real file on disk.
export function compileEdgeSource(code, { fetch = async () => { throw new Error('Unexpected outbound request'); } } = {}) {
  const exports = {};
  const Deno = { serve() {}, env: { get: () => 'test-value' } };
  const require = (specifier) => { throw new Error(`Unhandled dependency: ${specifier}`); };
  runModule(code, 'inline-test.ts', { exports, require, Deno, fetch });
  return exports;
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
        upsert(payload) { operation.type = 'upsert'; operation.payload = payload; return query; },
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

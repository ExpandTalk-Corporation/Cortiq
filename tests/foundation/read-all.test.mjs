// tests/foundation/read-all.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PAGE_SIZE, readAll, readAllIn } from '../../supabase/functions/_shared/read-all.ts';

/** A fake PostgREST query over `rows` that, like Supabase, never returns more than PAGE_SIZE rows. */
function table(rows, log = []) {
  return (filter = () => true) => ({
    order(column) {
      return {
        range(from, to) {
          log.push({ column, from, to });
          const hits = rows.filter(filter).sort((a, b) => a.id - b.id);
          return Promise.resolve({ data: hits.slice(from, Math.min(to + 1, from + PAGE_SIZE)), error: null });
        },
      };
    },
  });
}
const rows = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1, session_id: `s${i % 7}` }));

test('reads past the 1,000-row response cap', async () => {
  const log = [];
  const { data, error } = await readAll(() => table(rows(2500), log)());
  assert.equal(error, null);
  assert.equal(data.length, 2500);
  assert.deepEqual(new Set(data.map((r) => r.id)).size, 2500);
  assert.deepEqual(log.map((l) => [l.column, l.from, l.to]), [['id', 0, 999], ['id', 1000, 1999], ['id', 2000, 2999]]);
});

test('stops at max', async () => {
  const { data } = await readAll(() => table(rows(2500))(), 1200);
  assert.equal(data.length, 1200);
});

test('an exact multiple of the page size ends with one empty page', async () => {
  const log = [];
  const { data } = await readAll(() => table(rows(2000), log)());
  assert.equal(data.length, 2000);
  assert.equal(log.length, 3);
});

test('returns the error instead of partial rows', async () => {
  let calls = 0;
  const failing = () => ({ order: () => ({ range: () => Promise.resolve(++calls === 2 ? { data: null, error: { message: 'boom' } } : { data: rows(1000), error: null }) }) });
  assert.deepEqual(await readAll(failing), { data: null, error: { message: 'boom' } });
});

test('readAllIn splits the id list into chunks', async () => {
  const chunks = new Map(); // first id → chunk size; build runs once per page
  const t = table(rows(3000));
  const ids = Array.from({ length: 450 }, (_, i) => `s${i}`);
  const { data } = await readAllIn(ids, (chunk) => { chunks.set(chunk[0], chunk.length); return t((r) => chunk.includes(r.session_id)); });
  assert.deepEqual([...chunks.values()], [200, 200, 50]);
  assert.equal(data.length, 3000);
});

test('mcp-server has no single-request .limit() above the response cap', () => {
  const src = readFileSync(new URL('../../supabase/functions/mcp-server/index.ts', import.meta.url), 'utf8');
  const big = [...src.matchAll(/\.limit\((\d+)\)/g)].map((m) => Number(m[1])).filter((n) => n > PAGE_SIZE);
  assert.deepEqual(big, []);
});

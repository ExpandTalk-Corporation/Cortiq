// PostgREST caps every response at the project's max rows (1,000 on Supabase unless raised), so a
// single .limit(100000) silently returns only the first 1,000 rows. readAll pages through instead.
export const PAGE_SIZE = 1000;

// Rows stay loosely typed, as they are from the untyped client the Edge Functions use.
// deno-lint-ignore no-explicit-any
export type Row = Record<string, any>;
export interface Page { data: Row[] | null; error: { message: string } | null }
interface Pageable {
  order(column: string): { range(from: number, to: number): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> };
}

/**
 * Reads up to `max` rows of a query in pages of PAGE_SIZE, ordered by `id` so pages neither overlap
 * nor skip rows. `build` must return a fresh query each call (filters only, no order/limit/range).
 */
export async function readAll(build: () => Pageable, max = 100_000): Promise<Page> {
  const rows: Row[] = [];
  while (rows.length < max) {
    const want = Math.min(PAGE_SIZE, max - rows.length);
    const { data, error } = await build().order('id').range(rows.length, rows.length + want - 1);
    if (error) return { data: null, error };
    rows.push(...((data ?? []) as Row[]));
    if (!data || data.length < want) break;
  }
  return { data: rows, error: null };
}

/** readAll for an `.in(column, ids)` filter, split into chunks so each request URL stays short. */
export async function readAllIn(ids: string[], build: (chunk: string[]) => Pageable, chunkSize = 200): Promise<Page> {
  const rows: Row[] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    const { data, error } = await readAll(() => build(ids.slice(i, i + chunkSize)));
    if (error) return { data: null, error };
    rows.push(...(data ?? []));
  }
  return { data: rows, error: null };
}

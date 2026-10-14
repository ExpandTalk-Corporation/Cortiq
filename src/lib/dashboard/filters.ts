// src/lib/dashboard/filters.ts
// Dashboard filter state. Pure and dependency-free so node --test can import it directly.

export interface DashboardFilters {
  from: string; // YYYY-MM-DD, inclusive
  to: string;   // YYYY-MM-DD, inclusive
  path: string | null;
  segmentId: string | null;
}

export const DEFAULT_DAYS = 30;
export const MAX_RANGE_DAYS = 366;
const DAY_MS = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const toIso = (d: Date) => d.toISOString().slice(0, 10);
const parseIso = (s: string | null): Date | null => {
  if (!s || !ISO_DATE.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || toIso(d) !== s ? null : d;
};
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY_MS);
const utcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export function defaultFilters(today: Date): DashboardFilters {
  const end = utcDay(today);
  return { from: toIso(addDays(end, -(DEFAULT_DAYS - 1))), to: toIso(end), path: null, segmentId: null };
}

export function normalizePath(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) {
    try { return new URL(raw).pathname || '/'; } catch { return null; }
  }
  const noQuery = raw.split(/[?#]/)[0];
  return noQuery.startsWith('/') ? noQuery : `/${noQuery}`;
}

export function parseFilters(params: URLSearchParams, today: Date): DashboardFilters {
  const fallback = defaultFilters(today);
  const end = utcDay(today);
  const from = parseIso(params.get('from'));
  let to = parseIso(params.get('to'));
  let range = { from: fallback.from, to: fallback.to };
  if (from && to) {
    if (to > end) to = end;
    const days = Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1;
    if (days >= 1 && days <= MAX_RANGE_DAYS) range = { from: toIso(from), to: toIso(to) };
  }
  const path = params.get('path');
  const segment = params.get('segment');
  return {
    ...range,
    path: path ? normalizePath(path) : null,
    segmentId: segment && segment.trim() ? segment.trim() : null,
  };
}

export function writeFilters(params: URLSearchParams, f: DashboardFilters): URLSearchParams {
  const out = new URLSearchParams(params);
  out.set('from', f.from);
  out.set('to', f.to);
  if (f.path) out.set('path', f.path); else out.delete('path');
  if (f.segmentId) out.set('segment', f.segmentId); else out.delete('segment');
  return out;
}

export function previousPeriod(from: string, to: string): { from: string; to: string } {
  const f = parseIso(from)!;
  const t = parseIso(to)!;
  const days = Math.round((t.getTime() - f.getTime()) / DAY_MS) + 1;
  return { from: toIso(addDays(f, -days)), to: toIso(addDays(f, -1)) };
}

export function percentChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

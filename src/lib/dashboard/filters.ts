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

/** Number of days in an inclusive YYYY-MM-DD range. */
export function rangeDays(from: string, to: string): number {
  const f = parseIso(from)!;
  const t = parseIso(to)!;
  return Math.round((t.getTime() - f.getTime()) / DAY_MS) + 1;
}

/**
 * UTC timestamp bounds for an inclusive date range: start of `from`, and the start of
 * the day after `to` (exclusive). Use as `.gte(col, start).lt(col, end)`.
 */
export function rangeBounds(from: string, to: string): { start: string; end: string } {
  return { start: `${from}T00:00:00.000Z`, end: `${toIso(addDays(parseIso(to)!, 1))}T00:00:00.000Z` };
}

const shiftYear = (s: string, years: number): string => {
  const d = parseIso(s)!;
  const y = d.getUTCFullYear() + years;
  const m = d.getUTCMonth();
  // Feb 29 in a non-leap target year clamps to Feb 28 instead of rolling into March.
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return toIso(new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), lastDay))));
};

/** The same calendar period one year earlier (year-over-year comparison). */
export function sameRangeLastYear(from: string, to: string): { from: string; to: string } {
  return { from: shiftYear(from, -1), to: shiftYear(to, -1) };
}

/** Calendar months touched by the range, as 'YYYY-MM', in chronological order. */
export function monthsInRange(from: string, to: string): string[] {
  const out: string[] = [];
  const f = parseIso(from)!;
  const t = parseIso(to)!;
  let y = f.getUTCFullYear();
  let m = f.getUTCMonth();
  while (y < t.getUTCFullYear() || (y === t.getUTCFullYear() && m <= t.getUTCMonth())) {
    out.push(`${y}-${String(m + 1).padStart(2, '0')}`);
    m += 1;
    if (m === 12) { m = 0; y += 1; }
  }
  return out;
}

/**
 * Month-of-year columns ('MM') for the range in chronological order, for reports keyed by
 * GA4's `month` dimension (which has no year). A range that touches the same calendar
 * month twice (e.g. a 365-day range) folds both into one column; `foldedMonths` says so.
 */
export function monthColumns(from: string, to: string): { months: string[]; foldedMonths: boolean } {
  const yearMonths = monthsInRange(from, to);
  const months: string[] = [];
  for (const ym of yearMonths) {
    const m = ym.slice(5, 7);
    if (!months.includes(m)) months.push(m);
  }
  return { months, foldedMonths: months.length < yearMonths.length };
}

export const DAILY_TREND_MAX_DAYS = 92;

/**
 * Trend buckets for a range: one per day up to DAILY_TREND_MAX_DAYS, otherwise one per
 * calendar month. `keyOf` maps an ISO timestamp or YYYY-MM-DD string to its bucket key.
 */
export function trendBuckets(from: string, to: string): {
  granularity: 'day' | 'month';
  keys: string[];
  keyOf: (date: string) => string;
} {
  if (rangeDays(from, to) <= DAILY_TREND_MAX_DAYS) {
    const keys: string[] = [];
    for (let d = parseIso(from)!; toIso(d) <= to; d = addDays(d, 1)) keys.push(toIso(d));
    return { granularity: 'day', keys, keyOf: (date) => date.slice(0, 10) };
  }
  return { granularity: 'month', keys: monthsInRange(from, to), keyOf: (date) => date.slice(0, 7) };
}

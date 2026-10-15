// supabase/functions/_shared/report-range.ts
// Date-range helpers shared by the dashboard report functions. Dependency-free so the
// foundation tests can import it directly under node --test.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
export const MAX_RANGE_DAYS = 366;

export interface DateRange {
  startDate: string; // YYYY-MM-DD, inclusive
  endDate: string;   // YYYY-MM-DD, inclusive
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** A valid inclusive range of at most MAX_RANGE_DAYS days, or null. */
export function validRange(startDate: unknown, endDate: unknown): DateRange | null {
  if (!isIsoDate(startDate) || !isIsoDate(endDate) || endDate < startDate) return null;
  const days = rangeDays({ startDate, endDate });
  return days <= MAX_RANGE_DAYS ? { startDate, endDate } : null;
}

export function rangeDays(range: DateRange): number {
  return Math.round((Date.parse(`${range.endDate}T00:00:00Z`) - Date.parse(`${range.startDate}T00:00:00Z`)) / DAY_MS) + 1;
}

/**
 * The reporting range a request asks for. Explicit startDate/endDate win; otherwise the
 * legacy `year` input is honoured (Jan 1 to Dec 31, capped at today for the current year).
 * Returns null when neither is usable.
 */
export function resolveRange(
  body: { startDate?: unknown; endDate?: unknown; year?: unknown },
  today: Date,
): DateRange | null {
  const explicit = validRange(body.startDate, body.endDate);
  if (explicit) return explicit;
  const year = Number(body.year);
  if (!Number.isInteger(year) || year < 2000 || year > 9999) return null;
  const todayIso = today.toISOString().slice(0, 10);
  const end = year === today.getUTCFullYear() ? todayIso : `${year}-12-31`;
  return { startDate: `${year}-01-01`, endDate: end };
}

function shiftYear(iso: string, years: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const y = d.getUTCFullYear() + years;
  const m = d.getUTCMonth();
  // Feb 29 in a non-leap target year clamps to Feb 28 instead of rolling into March.
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), lastDay))).toISOString().slice(0, 10);
}

/** The same calendar dates one year earlier. Mirrors sameRangeLastYear in src/lib/dashboard/filters.ts. */
export function sameRangeLastYear(range: DateRange): DateRange {
  return { startDate: shiftYear(range.startDate, -1), endDate: shiftYear(range.endDate, -1) };
}

/** UTC timestamp bounds for a range: start inclusive, end exclusive (the day after endDate). */
export function rangeBounds(range: DateRange): { start: string; end: string } {
  const end = new Date(Date.parse(`${range.endDate}T00:00:00Z`) + DAY_MS).toISOString();
  return { start: `${range.startDate}T00:00:00.000Z`, end };
}

export interface MergedRow {
  dimensions: Record<string, string>;
  current: number[];
  comparison: number[] | null;
}

/**
 * Folds a GA4 runReport response into one row per dimension tuple with current and
 * comparison metric values.
 *
 * With two dateRanges the Data API returns one row per (dimensions, range), tagged with an
 * extra "dateRange" dimension ("date_range_0" / "date_range_1"), and each row's
 * metricValues only cover that range. Summing those rows as if they were one period mixes
 * the comparison period into the current one. A response without a dateRange dimension
 * is treated as a single period, unless every row carries twice as many metric values as
 * there are metric headers (current first, comparison second).
 */
export function mergeDateRangeRows(response: any): { dimensionNames: string[]; metricNames: string[]; rows: MergedRow[] } {
  const dimensionHeaders: string[] = (response?.dimensionHeaders ?? []).map((h: any) => h.name);
  const metricNames: string[] = (response?.metricHeaders ?? []).map((h: any) => h.name);
  const rangeIdx = dimensionHeaders.indexOf('dateRange');
  const dimensionNames = dimensionHeaders.filter((_, i) => i !== rangeIdx);
  const n = metricNames.length;
  const hasComparison = rangeIdx >= 0;
  const rows = new Map<string, MergedRow>();

  for (const row of response?.rows ?? []) {
    const values: string[] = (row.dimensionValues ?? []).map((v: any) => v?.value ?? '');
    const dims: Record<string, string> = {};
    dimensionHeaders.forEach((name, i) => { if (i !== rangeIdx) dims[name] = values[i] ?? ''; });
    const key = JSON.stringify(dimensionNames.map(name => dims[name]));
    const metrics: number[] = (row.metricValues ?? []).map((v: any) => parseFloat(v?.value ?? '0') || 0);

    let merged = rows.get(key);
    if (!merged) {
      merged = { dimensions: dims, current: Array(n).fill(0), comparison: null };
      rows.set(key, merged);
    }
    if (hasComparison) {
      merged.comparison ??= Array(n).fill(0);
      const target = values[rangeIdx] === 'date_range_1' ? merged.comparison : merged.current;
      for (let i = 0; i < n; i++) target[i] += metrics[i] ?? 0;
    } else {
      for (let i = 0; i < n; i++) merged.current[i] += metrics[i] ?? 0;
      if (metrics.length === 2 * n && n > 0) {
        merged.comparison ??= Array(n).fill(0);
        for (let i = 0; i < n; i++) merged.comparison[i] += metrics[n + i] ?? 0;
      }
    }
  }

  return { dimensionNames, metricNames, rows: [...rows.values()] };
}

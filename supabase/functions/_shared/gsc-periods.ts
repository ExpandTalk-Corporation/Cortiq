// Search Console data is stored per calendar month (gsc_data.period_start = first day,
// period_end = last day). Readers sum across periods, so periods must never overlap:
// a rolling 28-day window synced daily would count the same clicks up to 28 times.

export interface MonthPeriod {
  /** First day of the month, YYYY-MM-DD — the row key together with period_end. */
  periodStart: string;
  /** Last day of the month, YYYY-MM-DD. */
  periodEnd: string;
  /** Last day to query: the month end, or today for the current month. */
  queryEnd: string;
}

/** Search Console keeps 16 months of performance data. */
export const GSC_HISTORY_MONTHS = 16;

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The `count` most recent calendar months up to and including the month of `today` (UTC),
 * oldest first. The daily sync uses 2 (the current month plus the previous one, which
 * Google still revises for a few days); a first sync or "Load history" uses 16.
 */
export function monthPeriods(today: Date, count: number): MonthPeriod[] {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const todayIso = iso(today);
  const periods: MonthPeriod[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const start = new Date(Date.UTC(y, m - i, 1));
    const end = new Date(Date.UTC(y, m - i + 1, 0));
    const periodEnd = iso(end);
    periods.push({ periodStart: iso(start), periodEnd, queryEnd: periodEnd < todayIso ? periodEnd : todayIso });
  }
  return periods;
}

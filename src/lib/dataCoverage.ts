// src/lib/dataCoverage.ts
// Shape and wording for get_data_coverage (20261124000002): which days in the selected range
// have page views, and the gaps where tracking was missing. No imports, so the foundation
// tests can load it directly.

export type CoverageGap = { from: string; to: string; days: number };
export type DataCoverage = {
  firstDay: string | null;
  lastDay: string | null;
  daysWithData: number;
  daysInRange: number;
  dataBefore: boolean;
  dataAfter: boolean;
  gaps: CoverageGap[];
};

type Raw = {
  first_day?: string | null; last_day?: string | null; days_with_data?: number | string | null;
  days_in_range?: number | string | null; data_before?: boolean | null; data_after?: boolean | null;
  gaps?: CoverageGap[] | null;
} | null | undefined;

export function toDataCoverage(raw: Raw): DataCoverage {
  return {
    firstDay: raw?.first_day ?? null,
    lastDay: raw?.last_day ?? null,
    daysWithData: Number(raw?.days_with_data ?? 0),
    daysInRange: Number(raw?.days_in_range ?? 0),
    dataBefore: raw?.data_before === true,
    dataAfter: raw?.data_after === true,
    gaps: Array.isArray(raw?.gaps) ? raw!.gaps!.map((g) => ({ from: g.from, to: g.to, days: Number(g.days) })) : [],
  };
}

/** One line under the KPIs: which days the figures actually cover. */
export function coverageLine(c: DataCoverage): string {
  if (!c.firstDay || !c.lastDay) return 'No page views in this range.';
  const span = c.firstDay === c.lastDay ? c.firstDay : `${c.firstDay} to ${c.lastDay}`;
  return `Page views from ${span}, on ${c.daysWithData} of ${c.daysInRange} days.`;
}

/** Warning sentence per gap, or an empty list. */
export function gapWarnings(c: DataCoverage): string[] {
  return c.gaps.map((g) => {
    const span = g.from === g.to ? g.from : `${g.from} to ${g.to}`;
    return `No page views ${span} (${g.days} ${g.days === 1 ? 'day' : 'days'}), while the site has data before and after. `
      + 'Tracking was probably missing, so totals and trends for this range are too low.';
  });
}

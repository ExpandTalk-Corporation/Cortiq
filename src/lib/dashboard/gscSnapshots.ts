// src/lib/dashboard/gscSnapshots.ts
// gsc_data holds one snapshot per Search Console sync (a rolling report window), so the
// same page appears once per sync. Pure and dependency-free so node --test can import it.

export interface LowCTRPage {
  url: string;
  impressions: number;
  clicks: number;
  ctr: number;
  position: number;
}

export type GSCPageRow = {
  value: string; impressions: number; clicks: number; ctr: number | string; position: number | string;
  period_end: string;
};

/**
 * Keeps the latest snapshot per URL (rows must arrive newest period first), then applies
 * the thresholds, so a page is never listed twice or summed across overlapping syncs.
 */
export function pickLowCTRPages(rows: GSCPageRow[], minImpressions: number, maxCtr: number, limit = 50): LowCTRPage[] {
  const latest = new Map<string, GSCPageRow>();
  for (const row of rows) if (!latest.has(row.value)) latest.set(row.value, row);
  return [...latest.values()]
    .filter(row => row.impressions >= minImpressions && Number(row.ctr) <= maxCtr)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, limit)
    .map(row => ({
      url: row.value,
      impressions: row.impressions,
      clicks: row.clicks,
      ctr: Number(row.ctr),
      position: Number(row.position),
    }));
}

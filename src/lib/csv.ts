// src/lib/csv.ts
// Injection-safe CSV (same rule as supabase/functions/_shared/tracking-check/report.ts).
// Numbers are written as-is: a negative number is data, not a formula.

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const s = String(value);
  const guarded = typeof value !== 'number' && /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${guarded.replace(/"/g, '""')}"`;
}

export function toCsv(columns: string[], rows: unknown[][]): string {
  return '﻿' + [columns, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

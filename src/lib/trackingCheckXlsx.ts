// Tracking Check report as an Excel workbook: a summary sheet and one row per finding.
// exceljs is loaded on demand so it stays out of the report page bundle.
import type { FindingStatus, Mode } from '../../supabase/functions/_shared/tracking-check/types.ts';
import { FINDING_STATUS_LABEL, SHEET_COLUMNS, toSheetRows, type ReportSummary } from '../../supabase/functions/_shared/tracking-check/report.ts';
import type { FindingRow } from '@/hooks/useTrackingCheck';

interface XlsxInput {
  summary: ReportSummary;
  findings: FindingRow[];
  mode: Mode;
  baselineUrl: string | null;
  targetUrl: string;
  finishedAt: string | null;
}

const WIDTHS = [5, 14, 10, 12, 45, 60, 70, 22, 30, 40, 14];
const WRAPPED = new Set(['Finding', 'Explanation', 'What to do', 'Pages', 'Evidence']);
const STATUS_FILL: Record<FindingStatus, string> = {
  fail: 'FFFDE2E2', warning: 'FFFEF3C7', manual: 'FFDBEAFE', untestable: 'FFF3F4F6', pass: 'FFDCFCE7',
};

export async function trackingCheckXlsx({ summary, findings, mode, baselineUrl, targetUrl, finishedAt }: XlsxInput): Promise<Blob> {
  // Node (tests) exposes the CommonJS module as default; Vite flattens it.
  const mod = await import('exceljs');
  const ExcelJS = (mod as unknown as { default?: typeof mod }).default ?? mod;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CortIQ Tracking Check';

  const info = wb.addWorksheet('Summary');
  info.columns = [{ width: 22 }, { width: 80 }];
  const rows: [string, string | number][] = [
    ['Site', mode === 'comparison' && baselineUrl ? `${baselineUrl} → ${targetUrl}` : targetUrl],
    ['Check', mode === 'comparison' ? 'Migration comparison' : 'Consent policy'],
    ['Finished', finishedAt ? new Date(finishedAt).toLocaleString() : ''],
    ['Result', summary.headline],
    ...(summary.commitments ? [['Checked against', summary.commitments.length
      ? summary.commitments.map((c) => `• ${c}`).join('\n') : 'No commitments ticked']] as [string, string][] : []),
    ...(['fail', 'warning', 'manual', 'untestable', 'pass'] as FindingStatus[]).map((s): [string, number] => [FINDING_STATUS_LABEL[s], summary.counts[s]]),
  ];
  for (const r of rows) info.addRow(r);
  info.getColumn(1).font = { bold: true };
  info.getColumn(2).alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };

  const ws = wb.addWorksheet('Findings', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = SHEET_COLUMNS.map((header, i) => ({ header, width: WIDTHS[i] }));
  toSheetRows(findings).forEach((r) => ws.addRow(r));
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
  SHEET_COLUMNS.forEach((name, i) => {
    if (WRAPPED.has(name)) ws.getColumn(i + 1).alignment = { wrapText: true, vertical: 'top' };
    else ws.getColumn(i + 1).alignment = { vertical: 'top' };
  });
  header.alignment = { vertical: 'middle' };
  findings.forEach((f, i) => {
    ws.getRow(i + 2).getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STATUS_FILL[f.status] } };
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: SHEET_COLUMNS.length } };

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

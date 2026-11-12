// Tracking Check report as an Excel workbook: a summary sheet, one row per tool (newer runs) and one row per finding.
// exceljs is loaded on demand so it stays out of the report page bundle.
import type { FindingStatus, Mode } from '../../supabase/functions/_shared/tracking-check/types.ts';
import { FINDING_STATUS_LABEL, MATRIX_MANUAL_NOTE, MATRIX_NOTE, SHEET_COLUMNS, toSheetRows, toVendorSheet, type ReportSummary } from '../../supabase/functions/_shared/tracking-check/report.ts';
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
const VENDOR_WIDTHS: Record<string, number> = { Status: 14, Tool: 26, Category: 12, 'Loaded by': 14, Findings: 45, 'What to do': 70 };
const WRAPPED =new Set(['Finding', 'Explanation', 'What to do', 'Pages', 'Evidence']);
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

  if (summary.vendors?.length) {
    const sheet = toVendorSheet(summary.vendors, findings);
    const vs = wb.addWorksheet('By tool', { views: [{ state: 'frozen', ySplit: 1, xSplit: 2 }] });
    vs.columns = sheet.columns.map((header) => ({ header, width: VENDOR_WIDTHS[header] ?? 28 }));
    sheet.rows.forEach((r) => vs.addRow(r));
    vs.columns.forEach((c) => { c.alignment = { wrapText: true, vertical: 'top' }; });
    const vh = vs.getRow(1);
    vh.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    vh.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
    summary.vendors.forEach((v, i) => {
      if (v.status) vs.getRow(i + 2).getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STATUS_FILL[v.status] } };
    });
    vs.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };
    vs.addRow([]);
    for (const text of [MATRIX_NOTE, MATRIX_MANUAL_NOTE]) {
      const note = vs.addRow([text]);
      note.font = { italic: true };
      note.height = 48;
      vs.mergeCells(note.number, 1, note.number, sheet.columns.length);
    }
  }

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

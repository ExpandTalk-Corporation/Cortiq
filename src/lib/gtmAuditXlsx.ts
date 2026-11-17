// GTM container audit as an Excel workbook: summary, findings, one row per tag, triggers and variables.
// Built in the browser from ReportData; exceljs is loaded on demand so it stays out of the page bundle.
import type { FindingStatus } from '../../supabase/functions/_shared/tracking-check/types.ts';
import { FINDING_STATUS_LABEL } from '../../supabase/functions/_shared/tracking-check/report.ts';
import { MIGRATION_CLASSES } from '../../supabase/functions/_shared/gtm-audit/types.ts';
import { MIGRATION_LABEL } from '../../supabase/functions/_shared/gtm-audit/migrate.ts';
import type { ReportData } from '../../supabase/functions/_shared/gtm-audit/report.ts';
import { GTM_FINDING_COLUMNS, ITEM_COLUMNS, TAG_COLUMNS, toGtmFindingRows, toItemRows, toTagRows } from '../../supabase/functions/_shared/gtm-audit/sheets.ts';

const FINDING_WIDTHS: Record<string, number> = { '#': 5, Status: 14, Priority: 10, Area: 8, Finding: 45, Explanation: 60, 'What to do': 60, Owner: 20, Evidence: 60 };
const TAG_WIDTHS: Record<string, number> = { Tag: 36, Type: 22, Vendor: 22, Triggers: 30, Consent: 24, 'Consent evidence': 50, Plan: 40, Why: 60, Folder: 16, 'Last changed': 12, Paused: 8 };
const STATUS_FILL: Record<FindingStatus, string> = {
  fail: 'FFFDE2E2', warning: 'FFFEF3C7', manual: 'FFDBEAFE', untestable: 'FFF3F4F6', pass: 'FFDCFCE7',
};

type Sheet = import('exceljs').Worksheet;

function table(ws: Sheet, columns: string[], widths: Record<string, number>, rows: (string | number)[][]) {
  ws.columns = columns.map((header) => ({ header, width: widths[header] ?? 18 }));
  rows.forEach((r) => ws.addRow(r));
  ws.columns.forEach((c) => { c.alignment = { wrapText: true, vertical: 'top' }; });
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
}

export async function gtmAuditXlsx(report: ReportData): Promise<Blob> {
  // Node (tests) exposes the CommonJS module as default; Vite flattens it.
  const mod = await import('exceljs');
  const ExcelJS = (mod as unknown as { default?: typeof mod }).default ?? mod;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CortIQ GTM audit';

  const info = wb.addWorksheet('Summary');
  info.columns = [{ width: 26 }, { width: 80 }];
  const rows: [string, string | number][] = [
    ['Container', report.publicId],
    ['Exported', report.exportedAt === null ? '' : new Date(report.exportedAt).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'],
    ['Result', report.summary.headline],
    ['Evidence level', 'Configuration (container export, not observed live)'],
    ...(['fail', 'warning', 'manual', 'pass'] as FindingStatus[]).map((s): [string, number] => [FINDING_STATUS_LABEL[s], report.findings.filter((f) => f.status === s).length]),
    ...MIGRATION_CLASSES.map((c): [string, number] => [MIGRATION_LABEL[c], report.summary.counts[c]]),
  ];
  for (const r of rows) info.addRow(r);
  info.getColumn(1).font = { bold: true };
  info.getColumn(2).alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };

  const fs = wb.addWorksheet('Findings', { views: [{ state: 'frozen', ySplit: 1 }] });
  table(fs, GTM_FINDING_COLUMNS, FINDING_WIDTHS, toGtmFindingRows(report.findings));
  report.findings.forEach((f, i) => {
    fs.getRow(i + 2).getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STATUS_FILL[f.status] } };
  });

  table(wb.addWorksheet('Tags', { views: [{ state: 'frozen', ySplit: 1, xSplit: 1 }] }), TAG_COLUMNS, TAG_WIDTHS, toTagRows(report.tags));
  table(wb.addWorksheet('Triggers & variables', { views: [{ state: 'frozen', ySplit: 1 }] }), ITEM_COLUMNS, { Name: 40, Type: 22 }, toItemRows(report));

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

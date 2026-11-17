import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { GTM_FINDING_COLUMNS, TAG_COLUMNS, ITEM_COLUMNS, toGtmFindingRows, toTagRows } from '../../supabase/functions/_shared/gtm-audit/sheets.ts';
import { audit } from '../../supabase/functions/_shared/gtm-audit/audit.ts';
import { reportData } from '../../supabase/functions/_shared/gtm-audit/report.ts';
import { gtmAuditXlsx } from '../../src/lib/gtmAuditXlsx.ts';
import { buildSample } from '../../scripts/gtm-audit/sample-report.mjs';
import { tag, tpl, exportOf } from '../../scripts/gtm-audit/fixture.mjs';

const load = async (blob) => { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await blob.arrayBuffer()); return wb; };

test('finding rows drop the page and manual-verification columns (no pages in a container export)', () => {
  assert.equal(GTM_FINDING_COLUMNS.includes('Pages'), false);
  assert.equal(GTM_FINDING_COLUMNS.includes('Verified manually'), false);
  const s = buildSample();
  const rows = toGtmFindingRows(s.findings);
  assert.equal(rows.length, 9);
  assert.ok(rows.every((r) => r.length === GTM_FINDING_COLUMNS.length));
  const evidence = rows[0][GTM_FINDING_COLUMNS.indexOf('Evidence')];
  assert.match(evidence, /^Evidence level: configuration/);
});

test('tag rows: one per tag with consent and migration in words', () => {
  const s = buildSample();
  const rows = toTagRows(s.tags);
  assert.equal(rows.length, 16);
  const col = (n) => TAG_COLUMNS.indexOf(n);
  const lead = rows.find((r) => r[col('Tag')] === 'Meta - Lead');
  assert.equal(lead[col('Consent')], 'No consent condition');
  assert.equal(lead[col('Plan')], 'Conversion tag — can be sent server-side');
  const ua = rows.find((r) => r[col('Tag')] === 'UA - pageview');
  assert.equal(ua[col('Last changed')], '2022-06-01');
  assert.equal(rows.find((r) => r[col('Tag')] === 'Reddit pixel')[col('Paused')], 'Yes');
});

test('the workbook has four sheets; names that look like formulas stay text', async () => {
  const r = audit(exportOf({ tags: [tag(1, '=HYPERLINK("https://evil.example")', 'html', [tpl('html', '<script src="https://cdn.example-chat.com/w.js"></script>')])] }));
  const wb = await load(await gtmAuditXlsx(reportData(r)));
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['Summary', 'Findings', 'Tags', 'Triggers & variables']);
  const tags = wb.getWorksheet('Tags');
  assert.deepEqual(tags.getRow(1).values.slice(1), TAG_COLUMNS);
  assert.equal(tags.getCell('A2').value, '=HYPERLINK("https://evil.example")');
  assert.equal(tags.getCell('A2').formula, undefined);
  assert.equal(wb.getWorksheet('Summary').getCell('B1').value, 'GTM-SAMPLE1');
});

test('the sample workbook lists every trigger and variable', async () => {
  const s = buildSample();
  const wb = await load(await gtmAuditXlsx(s));
  const items = wb.getWorksheet('Triggers & variables');
  assert.deepEqual(items.getRow(1).values.slice(1), ITEM_COLUMNS);
  assert.equal(items.rowCount, 1 + s.triggers.length + s.variables.length);
  const names = items.getColumn(2).values.slice(2);
  assert.ok(names.includes('Old landing page'));
  assert.ok(names.includes('DLV - unused'));
});

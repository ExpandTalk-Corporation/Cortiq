import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { summarize, toSheetRows, SHEET_COLUMNS } from '../../supabase/functions/_shared/tracking-check/report.ts';
import { trackingCheckXlsx } from '../../src/lib/trackingCheckXlsx.ts';

const f = (status, priority, title, extra = {}) => ({ scope: 'Consent', checkKey: title, title, status, priority, explanation: `${title} explained.`,
  fix: `Step one for ${title}.\n\nStep two.`, typicalOwner: 'gtm', evidence: { pages: ['/', '/blog/'], details: ['requests to x.example'] }, verifiedAt: null, ...extra });

test('sheet rows put the full fix in its own column and blank it for passes', () => {
  const rows = toSheetRows([f('fail', 'high', 'GA4 before choice'), f('pass', null, 'Defaults denied'), f('manual', 'medium', 'Retention', { typicalOwner: null, verifiedAt: '2026-11-07T10:00:00Z' })]);
  const col = (name) => SHEET_COLUMNS.indexOf(name);
  assert.deepEqual(rows[0].slice(0, 5), [1, 'Problem', 'High', 'Consent', 'GA4 before choice']);
  assert.equal(rows[0][col('What to do')], 'Step one for GA4 before choice.\n\nStep two.');
  assert.equal(rows[0][col('Owner')], 'Tag manager (GTM)');
  assert.equal(rows[0][col('Pages')], '/\n/blog/');
  assert.equal(rows[1][col('What to do')], '');
  assert.equal(rows[1][col('Priority')], '');
  assert.equal(rows[2][col('Verified manually')], '2026-11-07');
});

test('the workbook has a summary sheet and a filterable findings sheet; formulas stay text', async () => {
  const findings = [f('fail', 'high', '=HYPERLINK("x")'), f('warning', 'medium', 'Inzynk cookieless')];
  const blob = await trackingCheckXlsx({ summary: summarize(findings, 'policy'), findings, mode: 'policy', baselineUrl: null, targetUrl: 'https://paligo.net', finishedAt: '2026-11-07T14:59:56Z' });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await blob.arrayBuffer());
  const summary = wb.getWorksheet('Summary');
  assert.equal(summary.getCell('B1').value, 'https://paligo.net');
  assert.match(String(summary.getCell('B4').value), /^1 problem to fix/);
  assert.equal(summary.getCell('A5').value, 'Checked against');
  assert.equal(summary.getCell('B5').value, 'No commitments ticked');
  const ws = wb.getWorksheet('Findings');
  assert.deepEqual(ws.getRow(1).values.slice(1), SHEET_COLUMNS);
  assert.equal(ws.rowCount, 3);
  assert.equal(ws.getCell('E2').value, '=HYPERLINK("x")');
  assert.equal(ws.getCell('E2').formula, undefined);
  assert.equal(ws.getCell('G2').alignment.wrapText, true);
  assert.ok(ws.autoFilter);
  assert.equal(ws.views[0].state, 'frozen');
});

test('runs with a vendor matrix get a By tool sheet before the findings', async () => {
  const findings = [f('fail', 'high', 'HubSpot before choice', { checkKey: 'consent.before_choice.hubspot' })];
  const vendors = [{ id: 'hubspot', name: 'HubSpot tracking code', category: 'analytics', origin: 'page', status: 'fail', findings: ['consent.before_choice.hubspot'],
    states: { none: { pages: ['/'], of: 2, stored: ['hubspotutk'] }, reject: { pages: [], of: 2, stored: [] } } }];
  const blob = await trackingCheckXlsx({ summary: { ...summarize(findings, 'policy'), vendors }, findings, mode: 'policy', baselineUrl: null, targetUrl: 'https://paligo.net', finishedAt: null });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await blob.arrayBuffer());
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['Summary', 'By tool', 'Findings']);
  const ws = wb.getWorksheet('By tool');
  assert.deepEqual(ws.getRow(2).values.slice(1, 6), ['Problem', 'HubSpot tracking code', 'Analytics', 'Page source', 'Stores hubspotutk (1 of 2 pages: /)']);
  assert.equal(ws.getCell('F2').value, 'Nothing seen');
  assert.match(String(ws.getCell('H2').value), /^Step one/);
  assert.match(String(ws.getCell('A4').value), /fresh browser/);
});

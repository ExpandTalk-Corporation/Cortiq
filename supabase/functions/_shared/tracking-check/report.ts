// Turns findings into the report headline, summary lines and tracker-compatible CSV.
import type { Finding, FindingStatus, Mode } from './types.ts';

export interface SummaryLine { status: FindingStatus; text: string; checkKey: string }
export interface ReportSummary { headline: string; counts: Record<FindingStatus, number>; blocking: number; lines: SummaryLine[] }

export function summarize(findings: Finding[], mode: Mode): ReportSummary {
  const counts: Record<FindingStatus, number> = { pass: 0, fail: 0, warning: 0, manual: 0, untestable: 0 };
  for (const f of findings) counts[f.status]++;
  const blocking = findings.filter((f) => f.status === 'fail' && f.priority === 'high').length;
  const nothingTested = counts.pass + counts.fail + counts.warning === 0;
  const lead = nothingTested ? 'The site could not be tested automatically' : mode === 'comparison'
    ? (blocking ? `${blocking} ${blocking === 1 ? 'problem blocks' : 'problems block'} go-live`
      : counts.fail ? `${counts.fail} ${counts.fail === 1 ? 'problem' : 'problems'} to fix` : 'No blocking problems')
    : (counts.fail ? `${counts.fail} ${counts.fail === 1 ? 'commitment is' : 'commitments are'} not met` : 'All tested commitments are met');
  const parts = nothingTested ? [lead] : [lead, `${counts.pass} OK`];
  if (counts.warning) parts.push(`${counts.warning} to review`);
  const manual = counts.manual + counts.untestable;
  if (manual) parts.push(`${manual} to test manually`);

  const lines: SummaryLine[] = [
    ...findings.filter((f) => f.status === 'fail').slice(0, 3),
    ...findings.filter((f) => f.status === 'warning').slice(0, 2),
  ].map((f) => ({ status: f.status, text: f.title, checkKey: f.checkKey }));
  for (const scope of ['Parameters', 'Consent', 'Tags'] as const) {
    if (lines.length >= 5) break;
    if (findings.some((f) => f.scope === scope && f.status === 'fail')) continue;
    const p = findings.find((f) => f.scope === scope && f.status === 'pass');
    if (p) lines.push({ status: 'pass', text: p.title, checkKey: p.checkKey });
  }
  return { headline: parts.join(' · '), counts, blocking, lines };
}

export const CSV_COLUMNS = ['Scope', 'Details', 'Deliverable', 'Owner', 'Status', 'Priority', 'Double Check / Blocker', 'Notes'];
const STATUS_LABEL: Record<FindingStatus, string> = { pass: 'Completed', warning: 'Pending Review', fail: 'Not Started', manual: 'Not Started', untestable: 'Not Started' };

const firstSentence = (text: string) => {
  const line = text.split('\n')[0];
  return (line.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? line).trim();
};
// Quote every cell; neutralise spreadsheet formulas.
const cell = (value: string) => `"${(/^[=+\-@\t\r]/.test(value) ? `'${value}` : value).replace(/"/g, '""')}"`;

export function toCsv(findings: Finding[]): string {
  const rows = findings.map((f) => [
    f.scope,
    f.title,
    f.status === 'pass' ? 'No action needed' : firstSentence(f.fix || f.explanation),
    '',
    STATUS_LABEL[f.status],
    f.priority ? f.priority.charAt(0).toUpperCase() + f.priority.slice(1) : '',
    f.status === 'fail' && f.priority === 'high' ? 'Yes' : '',
    [f.explanation, f.evidence.pages.length ? `Pages: ${f.evidence.pages.join(', ')}` : ''].filter(Boolean).join(' '),
  ]);
  return '﻿' + [CSV_COLUMNS, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

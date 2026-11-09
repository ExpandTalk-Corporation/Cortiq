// Turns findings into the report headline, summary lines and tracker-compatible CSV.
import type { ConsentCategory, ConsentState, Finding, FindingStatus, Mode, Owner, PolicyTemplate, ScriptOrigin } from './types.ts';

export interface SummaryLine { status: FindingStatus; text: string; checkKey: string }
export interface ReportSummary {
  headline: string; counts: Record<FindingStatus, number>; blocking: number; lines: SummaryLine[];
  /** Policy runs: the commitments the site was checked against, so "Problem" reads as "not met", not as a legal verdict. */
  commitments?: string[];
  /** One row per tool with what it did in each consent state (runs since the vendor matrix was added). */
  vendors?: VendorRow[];
}

export type CommitmentFlag = Exclude<keyof PolicyTemplate, 'expectedIds' | 'manualItems'>;
export const COMMITMENT_LABEL: Record<CommitmentFlag, string> = {
  noGoogleBeforeConsent: 'Nothing is sent to Google before consent or after "Reject all" (Consent Mode basic)',
  consentDefaultsDenied: 'Consent Mode v2 defaults are "denied"',
  ga4RequiresAnalytics: 'Google Analytics only runs with Statistics consent',
  adsRequiresMarketing: 'Google Ads only runs with Marketing consent',
  enhancedConversionsOff: 'Enhanced Conversions is off',
  noUnknownVendorsAfterReject: 'No unknown third parties after "Reject all"',
};

export function commitmentsOf(policy: PolicyTemplate | null | undefined): string[] {
  if (!policy) return [];
  return (Object.keys(COMMITMENT_LABEL) as CommitmentFlag[]).filter((k) => policy[k]).map((k) => COMMITMENT_LABEL[k]);
}

export function summarize(findings: Finding[], mode: Mode, policy?: PolicyTemplate | null): ReportSummary {
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
  return { headline: parts.join(' · '), counts, blocking, lines, ...(mode === 'policy' ? { commitments: commitmentsOf(policy) } : {}) };
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

// Excel export: one row per finding, with the fix in its own column (the CSV keeps the tracker layout above).
export const OWNER_LABEL: Record<Owner, string> = {
  developer: 'Developer', gtm: 'Tag manager (GTM)', cmp: 'Cookie banner (CMP)', marketing: 'Marketing', legal: 'Controller / legal',
};
export const FINDING_STATUS_LABEL: Record<FindingStatus, string> = {
  fail: 'Problem', warning: 'Review', manual: 'Test manually', untestable: 'Not tested', pass: 'OK',
};
export const SHEET_COLUMNS = ['#', 'Status', 'Priority', 'Area', 'Finding', 'Explanation', 'What to do', 'Owner', 'Pages', 'Evidence', 'Verified manually'];

export function toSheetRows(findings: (Finding & { verifiedAt?: string | null })[]): (string | number)[][] {
  return findings.map((f, i) => [
    i + 1,
    FINDING_STATUS_LABEL[f.status],
    f.priority && f.status !== 'pass' ? f.priority.charAt(0).toUpperCase() + f.priority.slice(1) : '',
    f.scope,
    f.title,
    f.explanation,
    f.status === 'pass' ? '' : f.fix,
    f.typicalOwner ? OWNER_LABEL[f.typicalOwner] : '',
    f.evidence.pages.join('\n'),
    f.evidence.details.join('\n'),
    f.verifiedAt ? f.verifiedAt.slice(0, 10) : '',
  ]);
}

// Per-tool view: one row per tool, one column per consent state. Built by vendorMatrix() in the worker.
export interface VendorCell {
  /** Pages where the tool sent requests or stored data in this state. */
  pages: string[];
  /** Pages observed in this state. */
  of: number;
  /** Cookie and storage names the tool set in this state. */
  stored: string[];
}

export interface VendorRow {
  id: string;
  name: string;
  category: ConsentCategory;
  origin: ScriptOrigin | null;
  states: Partial<Record<ConsentState, VendorCell>>;
  /** Most severe status among the findings about this tool; null when no finding names it. */
  status: FindingStatus | null;
  /** checkKeys of the findings about this tool, most severe first. */
  findings: string[];
}

export const MATRIX_STATES: ConsentState[] = ['none', 'reject', 'accept', 'analytics_only', 'marketing_only'];
export const STATE_LABEL: Record<ConsentState, string> = {
  none: 'Before choice', reject: 'After "Reject all"', accept: 'After "Accept all"', analytics_only: 'Statistics only', marketing_only: 'Marketing only',
};
export const ORIGIN_SHORT: Record<ScriptOrigin, string> = { page: 'Page source', gtm: 'GTM', cmp: 'Cookie banner', other: 'Another script' };
export const MATRIX_NOTE = 'Each consent state starts in a fresh browser. Cookies are listed when first set, so after "Accept all" a cookie the tool already set before the click is not listed again. Pages are listed only when the tool did not behave the same on every tested page.';

/** States that any row has a cell for, in display order. */
export const matrixStates = (rows: VendorRow[]): ConsentState[] => MATRIX_STATES.filter((s) => rows.some((r) => r.states[s]?.of));

/** A cell as text: what the tool did, and on which pages only when it did not do it everywhere. */
export function cellText(cell: VendorCell | undefined, maxPages = 5): string {
  if (!cell || !cell.of) return 'Not tested';
  if (!cell.pages.length) return 'Nothing';
  const what = cell.stored.length ? `Stores ${cell.stored.join(', ')}` : 'Sends requests';
  if (cell.pages.length >= cell.of) return what;
  const shown = cell.pages.slice(0, maxPages).join(', ');
  const more = cell.pages.length > maxPages ? ` +${cell.pages.length - maxPages} more` : '';
  return `${what} (${cell.pages.length} of ${cell.of} pages: ${shown}${more})`;
}

/** The "By tool" sheet: header and rows. The fix comes from the tool's most severe open finding. */
export function toVendorSheet(rows: VendorRow[], findings: Finding[]): { columns: string[]; rows: string[][] } {
  const states = matrixStates(rows);
  const byKey = new Map(findings.map((f) => [f.checkKey, f]));
  return {
    columns: ['Status', 'Tool', 'Category', 'Loaded by', ...states.map((s) => STATE_LABEL[s]), 'Findings', 'What to do'],
    rows: rows.map((r) => {
      const mine = r.findings.map((k) => byKey.get(k)).filter((f): f is Finding => !!f);
      return [
        r.status ? FINDING_STATUS_LABEL[r.status] : '',
        r.name,
        r.category.charAt(0).toUpperCase() + r.category.slice(1),
        r.origin ? ORIGIN_SHORT[r.origin] : '',
        ...states.map((s) => cellText(r.states[s])),
        mine.map((f) => f.title).join('\n'),
        mine.find((f) => f.status !== 'pass')?.fix ?? '',
      ];
    }),
  };
}

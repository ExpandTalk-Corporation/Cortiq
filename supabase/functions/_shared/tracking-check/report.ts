// Turns findings into the report headline, summary lines and tracker-compatible CSV.
import type { RunDiff } from './diff.ts';
import type { ConsentCategory, ConsentState, Finding, FindingStatus, Mode, Owner, PolicyTemplate, ScriptOrigin } from './types.ts';

export interface SummaryLine { status: FindingStatus; text: string; checkKey: string }
export interface ReportSummary {
  headline: string; counts: Record<FindingStatus, number>; blocking: number; lines: SummaryLine[];
  /** Policy runs: the commitments the site was checked against, so "Problem" reads as "not met", not as a legal verdict. */
  commitments?: string[];
  /** One row per tool with what it did in each consent state (runs since the vendor matrix was added). */
  vendors?: VendorRow[];
  /** External scripts with integrity and measured hash (runs since the script inventory was added). */
  scripts?: ScriptRow[];
  /** Runs of a schedule: changes since the previous finished run of the same schedule. */
  diff?: RunDiff;
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
  // Count problems, not commitments: several problems can break the same commitment, and some break a rule that always applies.
  const problems = `${counts.fail} ${counts.fail === 1 ? 'problem' : 'problems'} to fix`;
  const lead = nothingTested ? 'The site could not be tested automatically' : mode === 'comparison'
    ? (blocking ? `${blocking} ${blocking === 1 ? 'problem blocks' : 'problems block'} go-live` : counts.fail ? problems : 'No blocking problems')
    : (counts.fail ? problems : 'All tested commitments are met');
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
  /** Cookie and storage names the tool set (or wrote again) in this state. */
  stored: string[];
  /** Cookies left over from before the consent action and not touched after it. */
  kept?: string[];
  /** Did the tool send requests in this state? Absent in rows from before this field. */
  sends?: boolean;
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
export const MATRIX_NOTE = 'Each column is a separate visit in a fresh browser that accepts third-party cookies, like most visitors\' browsers. "Stores" lists cookies the tool set or wrote again in that state, so after "Accept all" a cookie set before the click and not touched again is not listed. "Keeps" lists cookies from before the choice that were still there after "Reject all". Pages are named only when the tool did not behave the same on every tested page.';
/** Why a manual check in a private window can miss what the report lists. */
export const MATRIX_MANUAL_NOTE = 'Checking by hand: Chrome\'s incognito window and Safari block third-party cookies, so cookies another domain sets, such as LinkedIn\'s bcookie or YouTube\'s VISITOR_INFO1_LIVE, may not show up there. That does not mean they are not set for visitors. To see them, use a new browser profile in a normal window, or allow third-party cookies in the incognito window (the eye icon in the address bar). Cookies on the site\'s own domain, such as HubSpot\'s __hstc or Google\'s _ga, show up in both.';

/** States that any row has a cell for, in display order. */
export const matrixStates = (rows: VendorRow[]): ConsentState[] => MATRIX_STATES.filter((s) => rows.some((r) => r.states[s]?.of));

// Consent journey: the tested states as steps, with the tools active in each. Each step is its own visit, so there are no timings.
export interface JourneyTool {
  id: string; name: string; category: ConsentCategory; stored: string[];
  /** Status of the finding about this tool in this state; null when no finding covers this state. */
  status: FindingStatus | null;
  findingKey: string | null;
}
export interface JourneyStep { state: ConsentState; tools: JourneyTool[]; byCategory: Partial<Record<ConsentCategory, number>> }

/** Which states a consent finding is about, from its checkKey and the tool's category. */
function findingStates(checkKey: string, category: ConsentCategory): ConsentState[] {
  if (checkKey.startsWith('consent.before_choice.')) return ['none'];
  if (checkKey.startsWith('consent.after_reject.')) return ['reject'];
  if (checkKey.startsWith('consent.category.')) {
    if (category === 'marketing') return ['analytics_only'];
    if (category === 'analytics') return ['marketing_only'];
  }
  return [];
}

export function consentJourney(rows: VendorRow[], findings: { checkKey: string; status: FindingStatus }[]): JourneyStep[] {
  const statusOf = new Map(findings.map((f) => [f.checkKey, f.status]));
  return matrixStates(rows).map((state) => {
    const tools: JourneyTool[] = [];
    const byCategory: Partial<Record<ConsentCategory, number>> = {};
    for (const r of rows) {
      const cell = r.states[state];
      if (!cell?.pages.length) continue;
      const key = r.findings.find((k) => findingStates(k, r.category).includes(state) && statusOf.get(k) !== 'pass') ?? null;
      tools.push({ id: r.id, name: r.name, category: r.category, stored: cell.stored, status: key ? statusOf.get(key) ?? null : null, findingKey: key });
      byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;
    }
    return { state, tools, byCategory };
  });
}

/** A cell as text: what the tool did, and on which pages only when it did not do it everywhere. */
export function cellText(cell: VendorCell | undefined, maxPages = 5): string {
  if (!cell || !cell.of) return 'Not tested';
  if (!cell.pages.length) return 'Nothing seen';
  const kept = cell.kept ?? [];
  const parts = [
    cell.stored.length ? `stores ${cell.stored.join(', ')}` : '',
    kept.length ? `keeps ${kept.join(', ')} from before the choice` : '',
    cell.sends && !cell.stored.length ? 'sends requests' : '',
  ].filter(Boolean);
  const text = parts.length ? parts.join('; ') : 'sends requests';
  const what = text.charAt(0).toUpperCase() + text.slice(1);
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

// Script inventory: one row per external script of the tested pages. Built by scriptInventory() in the worker.
export interface ScriptRow {
  /** Script URL with query parameter names only (values can hold IDs). */
  url: string;
  host: string;
  /** Registry vendor id and name, when the URL belongs to a known tool. */
  vendorId: string | null;
  tool: string | null;
  /** Served from the tested site's own domain (or a subdomain of it). */
  firstParty: boolean;
  /** What loaded it; null when the probe recorded no initiator. */
  origin: ScriptOrigin | null;
  /** Consent states the script loaded in, in MATRIX_STATES order. */
  states: ConsentState[];
  /** Loaded before the cookie choice or after "Reject all". */
  beforeConsent: boolean;
  /** The tag's integrity attribute; null when missing on any tested page. */
  integrity: string | null;
  crossorigin: string | null;
  /** SRI-format hash of the body measured with all cookies accepted, else null. */
  sha256: string | null;
  bytes: number | null;
  /** False when the vendor updates the file in place, so a fixed hash would break it. */
  sriPossible: boolean;
  /** Up to 10 pages the script loaded on; pageCount is the full number, of the pages with an inventory. */
  pages: string[];
  pageCount: number;
  of: number;
}

export const SCRIPTS_NOTE = 'External scripts of the tested pages, seen by one headless browser in one location. Scripts that only load for some visitors (on checkout pages, in certain countries, or hidden from automated browsers) may be missing, and this is not monitoring of real visitors\' browsers. Hashes are measured on the visit with all cookies accepted. Integrity applies to scripts in the page source; scripts loaded by GTM, the cookie banner or another script are listed for the inventory only.';

/** Integrity column text. */
export function scriptIntegrityText(r: ScriptRow): string {
  if (r.integrity) return `Yes (${r.integrity.split('-')[0]})`;
  if (r.firstParty) return 'No (own domain)';
  if (r.origin === 'page' && !r.sriPossible) return 'No (fixed hash not possible)';
  return 'No';
}

/** Consent column text: the earliest point the script loaded. */
export function scriptConsentText(r: ScriptRow): string {
  if (r.states.includes('none')) return STATE_LABEL.none;
  if (r.states.includes('reject')) return STATE_LABEL.reject;
  return r.states.length ? 'Only after consent' : 'Not tested';
}

/** Pages column text: all pages, or which ones. */
export function scriptPagesText(r: ScriptRow, maxPages = 5): string {
  if (r.pageCount >= r.of) return `All ${r.of} ${r.of === 1 ? 'page' : 'pages'}`;
  const more = r.pageCount > maxPages ? ` +${r.pageCount - maxPages} more` : '';
  return `${r.pageCount} of ${r.of}: ${r.pages.slice(0, maxPages).join(', ')}${more}`;
}

/** The "Scripts" sheet: header and rows. */
export function toScriptSheet(rows: ScriptRow[]): { columns: string[]; rows: string[][] } {
  return {
    columns: ['URL', 'Host', 'Tool', 'Party', 'Loaded by', 'First loads', 'States', 'Integrity', 'SHA-256 (measured)', 'Size', 'Pages'],
    rows: rows.map((r) => [
      r.url,
      r.host,
      r.tool ?? '',
      r.firstParty ? 'First party' : 'Third party',
      r.origin ? ORIGIN_SHORT[r.origin] : 'Unknown',
      scriptConsentText(r),
      r.states.map((s) => STATE_LABEL[s]).join(', '),
      r.integrity ?? scriptIntegrityText(r),
      r.sha256 ?? '',
      r.bytes === null ? '' : `${Math.max(1, Math.round(r.bytes / 1024))} KB`,
      scriptPagesText(r),
    ]),
  };
}

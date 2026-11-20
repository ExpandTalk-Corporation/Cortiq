/** Spreadsheet rows for the GTM audit export. Shared by the browser export and the tests. */
import type { Finding } from '../tracking-check/types.ts';
import { SHEET_COLUMNS, toSheetRows } from '../tracking-check/report.ts';
import type { ConsentStatus, TagRow } from './types.ts';
import type { ReportData } from './report.ts';

const DROPPED = ['Pages', 'Verified manually'];
export const GTM_FINDING_COLUMNS = SHEET_COLUMNS.filter((c) => !DROPPED.includes(c));
const KEEP = SHEET_COLUMNS.map((c, i) => (DROPPED.includes(c) ? -1 : i)).filter((i) => i >= 0);
const EVIDENCE_INDEX = GTM_FINDING_COLUMNS.indexOf('Evidence');

// Excel's hard cell limit is 32,767 characters — a finding with many detail lines (e.g. one row per tag in a
// large container) can exceed it. Cut at ~32,000 and say how much was dropped, rather than let the export fail.
const EVIDENCE_LIMIT = 32_000;
export function truncateEvidence(cell: string | number): string | number {
  if (typeof cell !== 'string' || cell.length <= EVIDENCE_LIMIT) return cell;
  const cut = cell.slice(0, EVIDENCE_LIMIT);
  const lastBreak = cut.lastIndexOf('\n');
  const kept = lastBreak > 0 ? cut.slice(0, lastBreak) : cut;
  const more = cell.length - kept.length;
  return `${kept}\n… (${more} more)`;
}

export function toGtmFindingRows(findings: Finding[]): (string | number)[][] {
  return toSheetRows(findings).map((row) => KEEP.map((i) => row[i]))
    .map((row) => row.map((cell, i) => (i === EVIDENCE_INDEX ? truncateEvidence(cell) : cell)));
}

export const CONSENT_LABEL: Record<ConsentStatus, string> = {
  gated: 'Waits for consent',
  likely_gated: 'Probably waits (trigger name only)',
  not_gated: 'No consent condition',
  google_consent_mode: 'Google Consent Mode',
};

export const TAG_COLUMNS = ['Tag', 'Type', 'Vendor', 'Sends to', 'Triggers', 'Consent', 'Consent evidence', 'Plan', 'Why', 'Relied on by', 'Folder', 'Last changed', 'Paused'];

const day = (ms: number | null): string => (ms === null ? '' : new Date(ms).toISOString().slice(0, 10));

export function toTagRows(tags: TagRow[]): (string | number)[][] {
  return tags.map((t) => [
    t.name, t.typeLabel, t.vendorName, t.sendsTo.join('\n'), t.triggers.join('\n'), CONSENT_LABEL[t.consent], t.consentEvidence,
    t.migrationLabel, t.migrationReason,
    t.reliedOnBy.map((d) => (d.confidence === 'certain' ? d.name : `${d.name} (possible)`)).join('\n'),
    t.folder, day(t.modifiedAt), t.paused ? 'Yes' : '',
  ]);
}

export const ITEM_COLUMNS = ['Kind', 'Name', 'Type', 'Used by tags', 'Folder'];

export function toItemRows(r: ReportData): (string | number)[][] {
  return [
    ...r.triggers.map((t) => [t.builtIn ? 'Built-in trigger' : 'Trigger', t.name, t.type, t.tags, t.folder]),
    ...r.variables.map((v) => ['Variable', v.name, v.type, '', '']),
  ];
}

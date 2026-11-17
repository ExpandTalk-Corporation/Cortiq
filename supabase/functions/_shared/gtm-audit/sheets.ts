/** Spreadsheet rows for the GTM audit export. Shared by the browser export and the tests. */
import type { Finding } from '../tracking-check/types.ts';
import { SHEET_COLUMNS, toSheetRows } from '../tracking-check/report.ts';
import type { ConsentStatus, TagRow } from './types.ts';
import type { ReportData } from './report.ts';

const DROPPED = ['Pages', 'Verified manually'];
export const GTM_FINDING_COLUMNS = SHEET_COLUMNS.filter((c) => !DROPPED.includes(c));
const KEEP = SHEET_COLUMNS.map((c, i) => (DROPPED.includes(c) ? -1 : i)).filter((i) => i >= 0);

export function toGtmFindingRows(findings: Finding[]): (string | number)[][] {
  return toSheetRows(findings).map((row) => KEEP.map((i) => row[i]));
}

export const CONSENT_LABEL: Record<ConsentStatus, string> = {
  gated: 'Waits for consent',
  likely_gated: 'Probably waits (trigger name only)',
  not_gated: 'No consent condition',
  google_consent_mode: 'Google Consent Mode',
};

export const TAG_COLUMNS = ['Tag', 'Type', 'Vendor', 'Triggers', 'Consent', 'Consent evidence', 'Plan', 'Why', 'Folder', 'Last changed', 'Paused'];

const day = (ms: number | null): string => (ms === null ? '' : new Date(ms).toISOString().slice(0, 10));

export function toTagRows(tags: TagRow[]): (string | number)[][] {
  return tags.map((t) => [
    t.name, t.typeLabel, t.vendorName, t.triggers.join('\n'), CONSENT_LABEL[t.consent], t.consentEvidence,
    t.migrationLabel, t.migrationReason, t.folder, day(t.modifiedAt), t.paused ? 'Yes' : '',
  ]);
}

export const ITEM_COLUMNS = ['Kind', 'Name', 'Type', 'Used by tags', 'Folder'];

export function toItemRows(r: ReportData): (string | number)[][] {
  return [
    ...r.triggers.map((t) => [t.builtIn ? 'Built-in trigger' : 'Trigger', t.name, t.type, t.tags, t.folder]),
    ...r.variables.map((v) => ['Variable', v.name, v.type, '', '']),
  ];
}

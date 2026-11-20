/**
 * Dashboard view of the self-reported source ("how did you hear about us?"), attribution layer 1.5.
 * Spec: docs/superpowers/specs/2026-11-12-attribution-models-and-ai-influence.md (jurist review 2026-11-20).
 *
 * The category list lives in supabase/functions/_shared/reported-channel.ts; this file re-exports it
 * and parses the aggregate get_reported_channel payload. Aggregate display only: nothing here reads
 * conversion rows, and counts of 1–4 arrive from the database as "fewer than 5" without a number.
 */
import {
  REPORTED_CHANNELS,
  REPORTED_CHANNEL_LABELS,
  MAX_MAP_ENTRIES,
  MAX_ANSWER_LENGTH,
  isReportedChannel,
  answerKey,
  cleanChannelMap,
  type ReportedChannel,
} from '../../supabase/functions/_shared/reported-channel.ts';

export {
  REPORTED_CHANNELS, REPORTED_CHANNEL_LABELS, MAX_MAP_ENTRIES, MAX_ANSWER_LENGTH,
  isReportedChannel, answerKey, cleanChannelMap,
};
export type { ReportedChannel };

/** A count from the database: an exact number, or "fewer than 5" (1–4) with no number. */
export interface Count { n: number | null; lt5: boolean }
export interface ReportedRow extends Count { channel: string }
export interface ReportedCell extends Count { reported: string; observed: string }

export interface ReportedChannelSummary {
  conversions: Count;
  answered: Count;
  matched: Count;
  reported: ReportedRow[];
  cells: ReportedCell[];
}

export const FEWER_THAN_5 = 'fewer than 5';

/** Observed source of the converting visit, in the same codes plus `unknown` (no tracked visit). */
export function observedLabel(code: string): string {
  if (code === 'unknown') return 'no tracked visit';
  if (code === 'direct') return 'direct';
  return isReportedChannel(code) ? REPORTED_CHANNEL_LABELS[code].toLowerCase() : code;
}

export function reportedLabel(code: string): string {
  return isReportedChannel(code) ? REPORTED_CHANNEL_LABELS[code] : code;
}

function count(v: unknown): Count {
  const r = (v ?? {}) as Record<string, unknown>;
  if (r.lt5 === true) return { n: null, lt5: true };
  const n = Number(r.n);
  return { n: Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0, lt5: false };
}

/** Normalises the get_reported_channel payload; missing parts become zero or empty. */
export function parseReportedChannel(raw: unknown): ReportedChannelSummary {
  const r = (raw ?? {}) as Record<string, any>;
  const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);
  return {
    conversions: count(r.conversions),
    answered: count(r.answered),
    matched: count(r.matched),
    reported: arr(r.reported)
      .filter((x) => typeof x?.channel === 'string')
      .map((x) => ({ channel: x.channel, ...count(x) })),
    cells: arr(r.cells)
      .filter((x) => typeof x?.reported === 'string' && typeof x?.observed === 'string')
      .map((x) => ({ reported: x.reported, observed: x.observed, ...count(x) })),
  };
}

/** "12" or "fewer than 5". */
export function formatCount(c: Count): string {
  return c.lt5 ? FEWER_THAN_5 : (c.n ?? 0).toLocaleString('en');
}

/** Whole-number percentage, or null when either side is hidden or the base is zero. */
export function percent(part: Count, whole: Count): number | null {
  if (part.lt5 || whole.lt5 || part.n === null || whole.n === null || whole.n === 0) return null;
  return Math.round((part.n / whole.n) * 100);
}

/** "12 of 40 (30 %)" — n always next to the percentage; no percentage when a count is hidden. */
export function formatShare(part: Count, whole: Count): string {
  const p = percent(part, whole);
  const base = `${formatCount(part)} of ${formatCount(whole)}`;
  return p === null ? base : `${base} (${p} %)`;
}

/** Cells where the answer and the observed source differ, largest first ("said AI assistant, arrived direct"). */
export function mismatches(s: ReportedChannelSummary): ReportedCell[] {
  return s.cells.filter((c) => c.reported !== c.observed);
}

export function mismatchLabel(c: ReportedCell): string {
  const said = reportedLabel(c.reported);
  if (c.observed === 'unknown') return `said ${said}, no tracked visit`;
  if (c.observed === 'direct') return `said ${said}, arrived direct`;
  return `said ${said}, arrived via ${observedLabel(c.observed)}`;
}

/** Form field NAME accepted by the database constraint (select or radio group name, never a selector). */
export const FORM_FIELD_PATTERN = /^[A-Za-z0-9_.:[\]-]{1,100}$/;
/** HubSpot internal property name accepted by the database constraint. */
export const HUBSPOT_PROPERTY_PATTERN = /^[A-Za-z0-9_]{1,100}$/;

export interface MapRow { answer: string; channel: ReportedChannel | '' }

/** Rows from the editor → the stored map; blank rows are skipped, duplicates keep the first. */
export function rowsToMap(rows: MapRow[]): { map: Record<string, ReportedChannel>; errors: string[] } {
  const map: Record<string, ReportedChannel> = {};
  const errors: string[] = [];
  for (const row of rows) {
    const key = answerKey(row.answer);
    if (!key && !row.channel) continue;
    if (!key) { errors.push('Every row needs an answer value.'); continue; }
    if (key.length > MAX_ANSWER_LENGTH) { errors.push(`"${key.slice(0, 20)}…" is longer than ${MAX_ANSWER_LENGTH} characters.`); continue; }
    if (!row.channel) { errors.push(`Pick a category for "${key}".`); continue; }
    if (key in map) continue;
    map[key] = row.channel;
  }
  if (Object.keys(map).length > MAX_MAP_ENTRIES) errors.push(`At most ${MAX_MAP_ENTRIES} answer values.`);
  return { map, errors };
}

export function mapToRows(raw: unknown): MapRow[] {
  return Object.entries(cleanChannelMap(raw)).map(([answer, channel]) => ({ answer, channel }));
}

/**
 * Art. 13 notice the customer can put next to the question on its own form (form path)
 * or HubSpot form (HubSpot path). A starting point for the customer's own text, not legal advice.
 */
export function noticeTemplate(path: 'form' | 'hubspot', siteName: string): string {
  const who = siteName || '[company name]';
  if (path === 'form') {
    return `How did you hear about us? (optional)\n\n`
      + `If you have accepted statistics cookies, ${who} stores the option you select as a category together with `
      + `the statistics for your visit, to understand which channels bring visitors. We use CortIQ as our processor. `
      + `Text you type in other fields is not read for this purpose. You can withdraw your consent at any time in the `
      + `cookie settings. Read more in our privacy policy: [link].`;
  }
  return `How did you hear about us? (optional)\n\n`
    + `${who} stores your answer in our customer system. If you have accepted marketing cookies on our website, `
    + `a hashed form of your email address is used to link your visit to your answer, and only a category is kept `
    + `with the visit statistics. We use CortIQ as our processor; the category is not sent to advertising platforms. `
    + `You can withdraw your consent at any time in the cookie settings. Read more in our privacy policy: [link].`;
}

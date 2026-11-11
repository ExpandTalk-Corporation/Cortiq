// Compares a scheduled run with the previous finished run of the same schedule. Pure and browser-safe:
// stored in summary.diff by the worker and rendered by ReportView ("Changes since <date>").
import type { FindingStatus, Priority, Scope } from './types.ts';
import type { VendorRow } from './report.ts';

/** The finding fields the diff needs (worker Findings and database rows both fit after mapping). */
export interface DiffFinding { checkKey: string; title: string; status: FindingStatus; priority: Priority | null; scope: Scope | string }

export interface DiffItem {
  checkKey: string; title: string; scope: string; priority: Priority | null;
  status: FindingStatus;
  /** Status in the previous run; null when the check did not exist there. */
  previous: FindingStatus | null;
}
export interface DiffVendor { id: string; name: string }
export interface DiffCookie { vendor: string; name: string }

export interface RunDiff {
  previousRunId: string;
  previousFinishedAt: string | null;
  /** Problems that are new or worse (warning → fail) since the previous run. */
  newProblems: DiffItem[];
  /** Problems in the previous run that now pass or are no longer reported. */
  resolved: DiffItem[];
  /** Problems in both runs at the same or a lower severity. */
  unchanged: DiffItem[];
  /** Problems in the previous run that could not be tested automatically this time. */
  notTested: DiffItem[];
  /** Vendor changes; only compared when both runs have the vendor matrix. */
  newVendors: DiffVendor[];
  removedVendors: DiffVendor[];
  newCookies: DiffCookie[];
  counts: { newProblems: number; resolved: number; unchanged: number; notTested: number; newVendors: number; removedVendors: number; newCookies: number };
}

export const DIFF_LIST_MAX = 50;
const PROBLEM: FindingStatus[] = ['fail', 'warning'];
const SEVERITY: Record<FindingStatus, number> = { fail: 4, warning: 3, manual: 2, untestable: 1, pass: 0 };
const isProblem = (s: FindingStatus | null | undefined) => !!s && PROBLEM.includes(s);

// A checkKey can in principle repeat; keep the most severe finding per key.
function byKey(findings: DiffFinding[]): Map<string, DiffFinding> {
  const map = new Map<string, DiffFinding>();
  for (const f of findings) {
    const prev = map.get(f.checkKey);
    if (!prev || SEVERITY[f.status] > SEVERITY[prev.status]) map.set(f.checkKey, f);
  }
  return map;
}

const item = (f: DiffFinding, previous: FindingStatus | null, status: FindingStatus = f.status): DiffItem =>
  ({ checkKey: f.checkKey, title: f.title, scope: String(f.scope), priority: f.priority, status, previous });

// Every cookie or storage name a vendor set in any consent state.
function cookiesOf(row: VendorRow): Set<string> {
  const names = new Set<string>();
  for (const cell of Object.values(row.states ?? {})) for (const n of cell?.stored ?? []) names.add(n);
  return names;
}

export function diffRuns(
  current: { findings: DiffFinding[]; vendors?: VendorRow[] | null },
  previous: { id: string; finishedAt: string | null; findings: DiffFinding[]; vendors?: VendorRow[] | null },
): RunDiff {
  const now = byKey(current.findings);
  const before = byKey(previous.findings);
  const newProblems: DiffItem[] = [];
  const resolved: DiffItem[] = [];
  const unchanged: DiffItem[] = [];
  const notTested: DiffItem[] = [];

  for (const f of now.values()) {
    const prev = before.get(f.checkKey)?.status ?? null;
    if (!isProblem(f.status)) continue;
    if (!isProblem(prev) || (f.status === 'fail' && prev === 'warning')) newProblems.push(item(f, prev));
    else unchanged.push(item(f, prev));
  }
  for (const p of before.values()) {
    if (!isProblem(p.status)) continue;
    const cur = now.get(p.checkKey);
    if (!cur || cur.status === 'pass') resolved.push(item(cur ?? p, p.status, 'pass'));
    else if (cur.status === 'manual' || cur.status === 'untestable') notTested.push(item(cur, p.status));
  }

  const newVendors: DiffVendor[] = [];
  const removedVendors: DiffVendor[] = [];
  const newCookies: DiffCookie[] = [];
  if (Array.isArray(current.vendors) && Array.isArray(previous.vendors)) {
    const prevRows = new Map(previous.vendors.map((r) => [r.id, r]));
    const curIds = new Set(current.vendors.map((r) => r.id));
    for (const row of current.vendors) {
      const old = prevRows.get(row.id);
      if (!old) { newVendors.push({ id: row.id, name: row.name }); continue; }
      const oldNames = cookiesOf(old);
      for (const name of cookiesOf(row)) if (!oldNames.has(name)) newCookies.push({ vendor: row.name, name });
    }
    for (const row of previous.vendors) if (!curIds.has(row.id)) removedVendors.push({ id: row.id, name: row.name });
  }

  const order = (a: DiffItem, b: DiffItem) => SEVERITY[b.status] - SEVERITY[a.status] || rank(a.priority) - rank(b.priority) || a.title.localeCompare(b.title);
  newProblems.sort(order); unchanged.sort(order); notTested.sort(order);
  resolved.sort((a, b) => SEVERITY[b.previous ?? 'pass'] - SEVERITY[a.previous ?? 'pass'] || a.title.localeCompare(b.title));

  const cap = <T>(list: T[]) => list.slice(0, DIFF_LIST_MAX);
  return {
    previousRunId: previous.id,
    previousFinishedAt: previous.finishedAt,
    newProblems: cap(newProblems), resolved: cap(resolved), unchanged: cap(unchanged), notTested: cap(notTested),
    newVendors: cap(newVendors), removedVendors: cap(removedVendors), newCookies: cap(newCookies),
    counts: {
      newProblems: newProblems.length, resolved: resolved.length, unchanged: unchanged.length, notTested: notTested.length,
      newVendors: newVendors.length, removedVendors: removedVendors.length, newCookies: newCookies.length,
    },
  };
}

const rank = (p: Priority | null) => (p === 'high' ? 0 : p === 'medium' ? 1 : p === 'low' ? 2 : 3);

/** Should the owner be told about this run? New or worse problems, new vendors or new cookies. */
export const hasNewProblems = (diff: RunDiff | null | undefined): boolean =>
  !!diff && (diff.counts.newProblems + diff.counts.newVendors + diff.counts.newCookies) > 0;

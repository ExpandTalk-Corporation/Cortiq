// One row per tool with what it did in each consent state, so a report reads per tool instead of per page and state.
// Built from the observations (the findings only hold a summary of them) and stored with the run summary.
// Display helpers live in report.ts so the browser bundle does not pull in the vendor registry.
import type { ConsentState, Finding, FindingStatus, SiteObservation } from './types.ts';
import { vendorForName, vendorForUrl, type Vendor } from '../tracking-vendors.ts';
import { displayPath, testablePages, vendorOrigin } from './assess/util.ts';
import { MATRIX_STATES, type VendorRow } from './report.ts';

const SEVERITY: FindingStatus[] = ['fail', 'warning', 'manual', 'untestable', 'pass'];

/** The finding names this tool: consent findings end in the vendor id ("consent.before_choice.hubspot"). */
const aboutVendor = (f: Finding, id: string) => f.checkKey.split('.').at(-1) === id;

export function vendorMatrix(site: SiteObservation, findings: Finding[]): VendorRow[] {
  const pages = testablePages(site);
  const rows = new Map<string, VendorRow>();
  const observed = new Map<ConsentState, number>();
  for (const p of pages) {
    for (const st of p.browser?.states ?? []) {
      // A state that could not be reached (no banner button found) says nothing about the tool.
      if (st.method === 'not_automated') continue;
      observed.set(st.state, (observed.get(st.state) ?? 0) + 1);
      const seen = new Map<string, { vendor: Vendor; stored: Set<string>; kept: Set<string>; sends: boolean }>();
      const add = (v: Vendor | null) => {
        if (!v || v.kind === 'infrastructure') return null;
        if (!seen.has(v.id)) seen.set(v.id, { vendor: v, stored: new Set(), kept: new Set(), sends: false });
        return seen.get(v.id)!;
      };
      for (const r of st.requests) { const s = add(vendorForUrl(r.url)); if (s) s.sends = true; }
      for (const name of [...st.cookies.map((c) => c.name), ...st.storageKeys]) add(vendorForName(name))?.stored.add(name);
      // Left over from before the choice: only telling after "Reject all" (after "Accept all" it is expected).
      if (st.state === 'reject') for (const c of st.keptCookies ?? []) add(vendorForName(c.name))?.kept.add(c.name);
      for (const [id, { vendor, stored, kept, sends }] of seen) {
        if (!rows.has(id)) rows.set(id, { id, name: vendor.name, category: vendor.category, origin: null, states: {}, status: null, findings: [] });
        const cell = rows.get(id)!.states[st.state] ??= { pages: [], of: 0, stored: [] };
        const path = displayPath(p.path);
        if (!cell.pages.includes(path)) cell.pages.push(path);
        for (const n of stored) if (!cell.stored.includes(n)) cell.stored.push(n);
        for (const n of kept) if (!stored.has(n) && !(cell.kept ??= []).includes(n)) cell.kept.push(n);
        if (sends) cell.sends = true;
      }
    }
  }
  for (const row of rows.values()) {
    for (const state of MATRIX_STATES) {
      const n = observed.get(state);
      if (n) (row.states[state] ??= { pages: [], of: 0, stored: [] }).of = n;
    }
    row.origin = vendorOrigin(pages, row.id);
    const mine = findings.filter((f) => aboutVendor(f, row.id)).sort((a, b) => SEVERITY.indexOf(a.status) - SEVERITY.indexOf(b.status));
    row.findings = mine.map((f) => f.checkKey);
    row.status = mine[0]?.status ?? null;
  }
  const rank = (r: VendorRow) => (r.status ? SEVERITY.indexOf(r.status) : SEVERITY.length);
  return [...rows.values()].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

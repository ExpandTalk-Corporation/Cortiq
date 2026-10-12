import type { ConsentState, Finding, PageObservation, SiteObservation, StateObservation } from '../types.ts';
import { vendorForUrl, type Vendor } from '../../tracking-vendors.ts';

export function isTestable(page: PageObservation): boolean {
  if (page.failed) return false;
  const f = page.fetch;
  if (f && (f.error || f.challenge || f.finalStatus === 401)) return false;
  if (page.browser && page.browser.states.some((s) => s.challenge || s.error)) return false;
  return true;
}

export const testablePages = (site: SiteObservation): PageObservation[] => site.pages.filter((p) => !p.legacy && isTestable(p));

export const stateOf = (page: PageObservation, state: ConsentState): StateObservation | undefined =>
  page.browser?.states.find((s) => s.state === state);

export function requestVendors(st: StateObservation): Map<string, Vendor> {
  const out = new Map<string, Vendor>();
  for (const r of st.requests) {
    const v = vendorForUrl(r.url);
    if (v) out.set(v.id, v);
  }
  return out;
}

/** Vendors that loaded or tried to load (blocked by CSP) in any state on any testable page. */
export function attemptedVendors(site: SiteObservation): Map<string, { vendor: Vendor; pages: Set<string> }> {
  const out = new Map<string, { vendor: Vendor; pages: Set<string> }>();
  for (const p of testablePages(site)) {
    for (const st of p.browser?.states ?? []) {
      const urls = [...st.requests.map((r) => r.url), ...st.cspViolations.map((v) => v.blockedUrl)];
      for (const url of urls) {
        const v = vendorForUrl(url);
        if (!v) continue;
        if (!out.has(v.id)) out.set(v.id, { vendor: v, pages: new Set() });
        out.get(v.id)!.pages.add(p.path);
      }
    }
  }
  return out;
}

export function allRequestUrls(site: SiteObservation): string[] {
  return testablePages(site).flatMap((p) => (p.browser?.states ?? []).flatMap((s) => s.requests.map((r) => r.url)));
}

/** True when at least one testable page was observed with all cookies accepted (or had no banner). */
export function fullLoadReliable(site: SiteObservation): boolean {
  return testablePages(site).some((p) => {
    const a = stateOf(p, 'accept');
    return !!a && a.method !== 'not_automated';
  });
}

export function stripQueryValues(url: string): string {
  try {
    const u = new URL(url);
    const names = [...new Set(u.searchParams.keys())];
    return u.origin + u.pathname + (names.length ? '?' + names.join('&') : '');
  } catch {
    return url.replace(/=[^&\s]*/g, '');
  }
}

export const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export function finding(f: Omit<Finding, 'evidence'> & { evidence?: Partial<Finding['evidence']> }): Finding {
  return { ...f, evidence: { pages: f.evidence?.pages ?? [], details: f.evidence?.details ?? [] } };
}

const SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'ac', 'gov', 'edu']);
/** Approximate registrable domain: "www.shop.example.co.uk" → "example.co.uk". */
export function siteKey(host: string): string {
  const labels = host.toLowerCase().split('.');
  const n = labels.length >= 3 && labels.at(-1)!.length === 2 && SECOND_LEVEL.has(labels.at(-2)!) ? 3 : 2;
  return labels.slice(-n).join('.');
}

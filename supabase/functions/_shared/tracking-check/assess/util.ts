import type { ConsentState, Finding, PageObservation, ScriptOrigin, SiteObservation, StateObservation } from '../types.ts';
import { vendorForUrl, type Vendor } from '../../tracking-vendors.ts';

/** HTTP error status that makes the page untestable, or null. Legacy URLs that end in an error are assessed as broken redirects instead. */
export function errorStatus(page: PageObservation): number | null {
  const f = page.fetch;
  if (f && f.finalStatus >= 400 && (!page.legacy || f.finalStatus === 401)) return f.finalStatus;
  const st = page.browser?.states.find((s) => s.status >= 400);
  return st ? st.status : null;
}

/** Storage written inside embedded frames, attributed by the frame's origin (a YouTube player's keys belong to YouTube). */
export function frameStored(st: StateObservation): { vendor: Vendor; key: string }[] {
  return (st.frameStorage ?? []).flatMap(({ origin, key }) => {
    const vendor = vendorForUrl(`${origin}/`);
    return vendor ? [{ vendor, key }] : [];
  });
}

export function isTestable(page: PageObservation): boolean {
  if (page.failed) return false;
  const f = page.fetch;
  if (f && (f.error || f.challenge)) return false;
  if (page.browser && page.browser.states.some((s) => s.challenge || s.error)) return false;
  return errorStatus(page) === null;
}

/** Non-legacy testable pages; with `paths`, only those paths (used to compare the same pages on both sites). */
export const testablePages = (site: SiteObservation, paths?: Set<string>): PageObservation[] =>
  site.pages.filter((p) => !p.legacy && isTestable(p) && (!paths || paths.has(p.path)));

/** Paths that are testable on both sites. Comparison findings only use these pages. */
export function comparablePaths(a: SiteObservation, b: SiteObservation): Set<string> {
  const inB = new Set(testablePages(b).map((p) => p.path));
  return new Set(testablePages(a).map((p) => p.path).filter((path) => inB.has(path)));
}

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
export function attemptedVendors(site: SiteObservation, paths?: Set<string>): Map<string, { vendor: Vendor; pages: Set<string> }> {
  const out = new Map<string, { vendor: Vendor; pages: Set<string> }>();
  for (const p of testablePages(site, paths)) {
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

export type { ScriptOrigin };
const ORIGIN_ORDER: ScriptOrigin[] = ['page', 'gtm', 'cmp', 'other'];

/** Follows "what loaded this script" up through vendor loaders (HubSpot's loader, gtag.js) until the page, GTM or a CMP. */
function traceOrigin(start: string, initiatorOf: Map<string, string>): ScriptOrigin {
  let init = start;
  for (let i = 0; i < 10; i++) {
    if (init === 'page') return 'page';
    const v = vendorForUrl(init);
    if (v?.id === 'gtm') return 'gtm';
    if (v?.kind === 'cmp') return 'cmp';
    const next = initiatorOf.get(init);
    if (!next) return 'other';
    init = next;
  }
  return 'other';
}

/**
 * How a vendor's scripts were loaded on these pages, or null when the probe recorded no initiators.
 * The page source wins over GTM: a hardcoded copy keeps loading whatever GTM's consent settings say.
 */
export function vendorOrigin(pages: PageObservation[], vendorId: string): ScriptOrigin | null {
  const found = new Set<ScriptOrigin>();
  for (const p of pages) {
    for (const st of p.browser?.states ?? []) {
      const initiatorOf = new Map<string, string>();
      for (const r of st.requests) if (r.initiator && !initiatorOf.has(r.url)) initiatorOf.set(r.url, r.initiator);
      for (const r of st.requests) {
        if (r.initiator && vendorForUrl(r.url)?.id === vendorId) found.add(traceOrigin(r.initiator, initiatorOf));
      }
    }
  }
  return ORIGIN_ORDER.find((o) => found.has(o)) ?? null;
}

/** The CMP's own script origin (any CMP in the registry), or null. */
export function cmpOrigin(pages: PageObservation[]): ScriptOrigin | null {
  const ids = new Set<string>();
  for (const p of pages) for (const st of p.browser?.states ?? []) for (const r of st.requests) {
    const v = vendorForUrl(r.url);
    if (v?.kind === 'cmp') ids.add(v.id);
  }
  const origins = [...ids].map((id) => vendorOrigin(pages, id)).filter((o): o is ScriptOrigin => !!o);
  return ORIGIN_ORDER.find((o) => origins.includes(o)) ?? null;
}

export function allRequestUrls(site: SiteObservation, paths?: Set<string>): string[] {
  return testablePages(site, paths).flatMap((p) => (p.browser?.states ?? []).flatMap((s) => s.requests.map((r) => r.url)));
}

/** True when at least one testable page was observed with all cookies accepted (or had no banner). */
export function fullLoadReliable(site: SiteObservation, paths?: Set<string>): boolean {
  return testablePages(site, paths).some((p) => {
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

/** A page path for display: query parameter names only, no values, no fragment ("/index.php?page_id=42" → "/index.php?page_id"). */
export function displayPath(path: string): string {
  const i = path.search(/[?#]/);
  if (i < 0) return path;
  const names = path[i] === '?' ? [...new Set(new URLSearchParams(path.slice(i + 1).split('#')[0]).keys())] : [];
  return path.slice(0, i) + (names.length ? '?' + names.join('&') : '');
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

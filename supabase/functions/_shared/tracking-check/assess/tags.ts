import type { AssessInput, Finding, FormHit, SiteObservation } from '../types.ts';
import { vendorForUrl, extractVendorIds, vendorById, type CspDirective, type Vendor } from '../../tracking-vendors.ts';
import { cspAllows } from '../fetch-probe.ts';
import { MANUAL_STEPS } from '../instructions.ts';
import { allRequestUrls, attemptedVendors, comparablePaths, finding, fullLoadReliable, plural, testablePages } from './util.ts';

const firstCsp = (site: SiteObservation) => testablePages(site).find((p) => p.fetch?.csp)?.fetch?.csp ?? null;
const pageList = (pages: Iterable<string>) => [...pages].join(', ');

export function cspFixLines(vendor: Vendor, csp: Record<string, string[]> | null, extra: Map<string, Set<string>> = new Map()): string[] {
  const directives = new Map<string, Set<string>>();
  for (const [d, domains] of Object.entries(vendor.csp) as [CspDirective, string[]][]) directives.set(d, new Set(domains));
  for (const [d, hosts] of extra) {
    if (!directives.has(d)) directives.set(d, new Set());
    for (const h of hosts) directives.get(d)!.add(h);
  }
  const lines: string[] = [];
  for (const [d, domains] of directives) {
    const missing = [...domains].filter((h) => !csp || !cspAllows(csp, d, h));
    if (missing.length) lines.push(`${d}: add ${missing.join(' ')}`);
  }
  return lines;
}

export function assessTags({ mode, target, baseline, policy }: AssessInput): Finding[] {
  const out: Finding[] = [];

  // Only pages testable on both sites are compared; untestable pages are reported by coverage.
  const common = mode === 'comparison' && baseline ? comparablePaths(baseline, target) : new Set<string>();
  if (mode === 'comparison' && baseline && common.size) {
    const tgt = attemptedVendors(target, common);
    const base = attemptedVendors(baseline, common);
    const reliable = fullLoadReliable(baseline, common) && fullLoadReliable(target, common);
    const targetCsp = firstCsp(target);

    // A switch to another consent platform is one review item, not a missing plus a new tool.
    const cmps = (m: Map<string, { vendor: Vendor }>) => [...m.values()].filter((e) => e.vendor.kind === 'cmp').map((e) => e.vendor);
    const baseCmps = cmps(base), tgtCmps = cmps(tgt);
    const cmpChanged = baseCmps.length > 0 && tgtCmps.length > 0
      && (baseCmps.length !== tgtCmps.length || baseCmps.some((v) => !tgt.has(v.id)));
    const compared = (v: Vendor) => v.kind !== 'infrastructure' && !(cmpChanged && v.kind === 'cmp');
    if (cmpChanged) {
      const names = (vs: Vendor[]) => vs.map((v) => v.name).join(' + ');
      out.push(finding({
        scope: 'Tags', checkKey: 'tags.cmp_changed', status: 'warning', priority: 'low',
        title: `The cookie banner changes from ${names(baseCmps)} to ${names(tgtCmps)}`,
        explanation: 'The new site uses a different consent management platform. Visitors will be asked for consent again, and categories and tag blocking are configured separately in the new tool.',
        fix: 'Confirm that the new cookie banner assigns each tool to the same category as today and has Consent Mode v2 switched on.',
        typicalOwner: 'cmp', evidence: { pages: [...common] },
      }));
    }

    let missingCount = 0;
    let comparedCount = 0;
    for (const [id, { vendor, pages }] of base) {
      if (!compared(vendor)) continue;
      comparedCount++;
      if (tgt.has(id)) continue;
      missingCount++;
      if (!reliable && vendor.category !== 'necessary') {
        out.push(finding({
          scope: 'Tags', checkKey: `tags.missing.${id}`, status: 'manual', priority: 'high',
          title: `Check whether ${vendor.name} loads on the new site`,
          explanation: `${vendor.name} loads on the current site (${pageList(pages)}), but the cookie banner on one of the sites could not be accepted automatically, so its absence on the new site is not confirmed.`,
          fix: MANUAL_STEPS.tags, typicalOwner: 'marketing', evidence: { pages: [...pages] },
        }));
        continue;
      }
      const csp = targetCsp ? cspFixLines(vendor, targetCsp) : [];
      out.push(finding({
        scope: 'Tags', checkKey: `tags.missing.${id}`, status: 'fail', priority: 'high',
        title: `${vendor.name} is missing on the new site`,
        explanation: `${vendor.name} loads on the current site (${pageList(pages)}) but not on the new site. ${vendor.impact}`,
        fix: [`Add ${vendor.name} to the new site, in the base layout or through GTM, gated by the cookie banner.`,
          ...(csp.length ? ["The new site's Content-Security-Policy would also block it. Extend it:", ...csp] : [])].join('\n'),
        typicalOwner: 'developer', evidence: { pages: [...pages] },
      }));
    }
    for (const [id, { vendor, pages }] of tgt) {
      if (base.has(id) || !compared(vendor)) continue;
      out.push(finding({
        scope: 'Tags', checkKey: `tags.new.${id}`, status: 'warning', priority: 'low',
        title: `${vendor.name} is new on the new site`,
        explanation: `${vendor.name} loads on the new site (${pageList(pages)}) but not on the current site.`,
        fix: 'Confirm it is intended, assigned to the right cookie-banner category and covered by the privacy policy.',
        typicalOwner: 'marketing', evidence: { pages: [...pages] },
      }));
    }
    if (!missingCount && comparedCount) out.push(finding({
      scope: 'Tags', checkKey: 'tags.present', status: 'pass', priority: null,
      title: `All ${plural(comparedCount, 'tool', 'tools')} from the current site load on the new site`,
      explanation: [...base.values()].filter((b) => compared(b.vendor)).map((b) => b.vendor.name).join(', '), fix: '', typicalOwner: null,
    }));

    const baseIds = extractVendorIds(allRequestUrls(baseline, common));
    const tgtIds = extractVendorIds(allRequestUrls(target, common));
    for (const [vendorId, ids] of baseIds) {
      const now = tgtIds.get(vendorId);
      if (!now) continue;
      const same = ids.size === now.size && [...ids].every((i) => now.has(i));
      if (same) continue;
      const name = vendorById(vendorId)?.name ?? vendorId;
      out.push(finding({
        scope: 'Tags', checkKey: `tags.ids.${vendorId}`, status: 'fail', priority: 'high',
        title: `${name} uses a different ID on the new site`,
        explanation: 'Data from the new site goes to a different account, container or property than today.',
        fix: 'Use the same ID as the current site, unless the change is intended and reporting has been updated.',
        typicalOwner: 'gtm', evidence: { details: [`current: ${[...ids].join(', ')}; new: ${[...now].join(', ')}`] },
      }));
    }
  }

  if (mode === 'policy' && policy?.expectedIds.length) {
    const found = new Set([...extractVendorIds(allRequestUrls(target)).values()].flatMap((s) => [...s].map((i) => i.toUpperCase())));
    const reliable = fullLoadReliable(target);
    const ok: string[] = [];
    for (const raw of policy.expectedIds) {
      const id = raw.trim();
      if (found.has(id.toUpperCase())) { ok.push(id); continue; }
      out.push(finding({
        scope: 'Tags', checkKey: `tags.expected.${id}`, status: reliable ? 'fail' : 'manual', priority: 'high',
        title: reliable ? `Expected ID ${id} was not found` : `Check manually that ${id} loads after consent`,
        explanation: reliable
          ? 'No request with this ID was seen in any consent state, including after accepting all cookies.'
          : 'The cookie banner could not be accepted automatically, so tags that wait for consent were not observed.',
        fix: reliable ? 'Check that the tag is installed with this ID and fires after consent.' : MANUAL_STEPS.tags,
        typicalOwner: 'gtm',
      }));
    }
    if (ok.length === policy.expectedIds.length) out.push(finding({
      scope: 'Tags', checkKey: 'tags.expected', status: 'pass', priority: null,
      title: 'All expected IDs were found', explanation: ok.join(', '), fix: '', typicalOwner: null,
    }));
  }
  return out;
}

export function assessCsp({ target }: AssessInput): Finding[] {
  const pages = testablePages(target).filter((p) => p.browser);
  if (!pages.length) return [];
  const csp = firstCsp(target);
  const byVendor = new Map<string, { vendor: Vendor; pages: Set<string>; count: number; extra: Map<string, Set<string>> }>();
  const byHost = new Map<string, { directive: string; pages: Set<string> }>();
  for (const p of pages) {
    for (const st of p.browser!.states) {
      for (const v of st.cspViolations) {
        if (!/^https?:/.test(v.blockedUrl)) continue;          // inline/eval violations are not tracking requests
        const directive = v.directive.replace(/-(elem|attr)$/, '');
        let host = '';
        try { host = new URL(v.blockedUrl).hostname; } catch { continue; }   // malformed report
        const vendor = vendorForUrl(v.blockedUrl);
        if (vendor) {
          const e = byVendor.get(vendor.id) ?? { vendor, pages: new Set(), count: 0, extra: new Map() };
          e.pages.add(p.path); e.count++;
          if (!e.extra.has(directive)) e.extra.set(directive, new Set());
          e.extra.get(directive)!.add(host);
          byVendor.set(vendor.id, e);
        } else {
          const e = byHost.get(host) ?? { directive, pages: new Set() };
          e.pages.add(p.path);
          byHost.set(host, e);
        }
      }
    }
  }
  const out: Finding[] = [];
  for (const [id, e] of byVendor) {
    out.push(finding({
      scope: 'CSP', checkKey: `csp.blocked.${id}`, status: 'fail', priority: 'high',
      title: `The Content-Security-Policy blocks ${e.vendor.name}`,
      explanation: `${plural(e.count, 'request', 'requests')} to ${e.vendor.name} were blocked on ${pageList(e.pages)}. ${e.vendor.impact}`,
      fix: ['Extend the Content-Security-Policy:', ...cspFixLines(e.vendor, csp, e.extra)].join('\n'),
      typicalOwner: 'developer', evidence: { pages: [...e.pages] },
    }));
  }
  for (const [host, e] of byHost) {
    out.push(finding({
      scope: 'CSP', checkKey: `csp.blocked.host.${host}`, status: 'warning', priority: 'medium',
      title: `The Content-Security-Policy blocks requests to ${host}`,
      explanation: `Requests to ${host} were blocked on ${pageList(e.pages)}. It is not a tool CortIQ recognises.`,
      fix: `If ${host} is intended, add it to ${e.directive}.`, typicalOwner: 'developer', evidence: { pages: [...e.pages] },
    }));
  }
  if (!out.length && !fullLoadReliable(target)) out.push(finding({
    scope: 'CSP', checkKey: 'csp.ok', status: 'manual', priority: 'medium',
    title: 'Check manually that the Content-Security-Policy allows tags after consent',
    explanation: 'No CSP violations were reported. Consented tags were not observed, so CSP could only be checked for tags that load without consent.',
    fix: MANUAL_STEPS.generic, typicalOwner: 'developer', evidence: { pages: pages.map((p) => p.path) },
  }));
  else if (!out.length) out.push(finding({
    scope: 'CSP', checkKey: 'csp.ok', status: 'pass', priority: null,
    title: 'No requests are blocked by the Content-Security-Policy', explanation: 'No CSP violations were reported in any consent state.',
    fix: '', typicalOwner: null, evidence: { pages: pages.map((p) => p.path) },
  }));
  return out;
}

export function assessForms({ mode, target, baseline }: AssessInput): Finding[] {
  if (mode !== 'comparison' || !baseline) return [];
  const common = comparablePaths(baseline, target);
  const collect = (site: SiteObservation) => {
    const m = new Map<string, { hit: FormHit; pages: Set<string> }>();
    for (const p of testablePages(site, common)) for (const hit of p.browser?.forms ?? []) {
      const key = `${hit.provider}:${hit.formId}`;
      if (!m.has(key)) m.set(key, { hit, pages: new Set() });
      m.get(key)!.pages.add(p.path);
    }
    return m;
  };
  const base = collect(baseline), tgt = collect(target);
  if (!base.size) return [];
  const label = (h: FormHit) => (h.provider === 'hubspot' ? `HubSpot form ${h.formId}` : `Gravity Form ${h.formId}`);
  const missing = [...base.entries()].filter(([k]) => !tgt.has(k)).map(([, v]) => v);
  if (!missing.length) return [finding({
    scope: 'Forms', checkKey: 'forms.present', status: 'pass', priority: null,
    title: `All ${plural(base.size, 'form', 'forms')} from the current site are on the new site`,
    explanation: [...base.values()].map((v) => label(v.hit)).join(', '), fix: '', typicalOwner: null,
  })];
  return [finding({
    scope: 'Forms', checkKey: 'forms.missing', status: 'fail', priority: 'high',
    title: `${plural(missing.length, 'form', 'forms')} from the current site ${missing.length === 1 ? 'is' : 'are'} missing on the new site`,
    explanation: 'Leads from these forms will stop arriving, or arrive through a different form that workflows and reports do not expect.',
    fix: 'Embed the same forms on the new site, or update workflows, lists and reports that depend on these form IDs.',
    typicalOwner: 'marketing',
    evidence: { pages: missing.flatMap((m) => [...m.pages]), details: missing.map((m) => `${label(m.hit)} (on ${pageList(m.pages)})`) },
  })];
}

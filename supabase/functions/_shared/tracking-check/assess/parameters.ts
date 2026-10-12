import type { AssessInput, Finding, PageObservation, SiteObservation } from '../types.ts';
import { MANUAL_STEPS } from '../instructions.ts';
import { errorStatus, finding, isTestable, plural, stripQueryValues } from './util.ts';

function untestableReason(p: PageObservation): string {
  if (p.failed) return p.failed;
  if (p.fetch?.error) return p.fetch.error;
  if (p.fetch?.challenge) return 'bot protection challenge';
  if (p.fetch?.finalStatus === 401) return 'password required (basic auth missing, wrong or expired)';
  const st = p.browser?.states.find((s) => s.challenge || s.error);
  if (st) return st.challenge ? 'bot protection challenge in the browser' : st.error!;
  const status = errorStatus(p);
  return status ? `HTTP ${status}` : 'unknown error';
}

export function assessCoverage({ target, baseline }: AssessInput): Finding[] {
  const sites = [target, baseline].filter((s): s is SiteObservation => !!s);
  const bad = sites.flatMap((s) => s.pages.filter((p) => !isTestable(p)).map((p) => ({ s, p })));
  if (!bad.length) return [];
  return [finding({
    scope: 'Coverage', checkKey: 'coverage.untestable', status: 'untestable', priority: 'medium',
    title: `${plural(bad.length, 'page', 'pages')} could not be tested automatically`,
    explanation: 'These pages blocked the automated browser (bot protection or a login), timed out or returned an error. They are left out of every other check in this report.',
    fix: MANUAL_STEPS.generic, typicalOwner: 'developer',
    evidence: {
      pages: bad.map(({ s, p }) => `${s.role === 'baseline' ? 'current' : 'new'} ${p.path}`),
      details: bad.map(({ p }) => `${p.path}: ${untestableReason(p)}`),
    },
  })];
}

export function assessParameters({ mode, target }: AssessInput): Finding[] {
  const out: Finding[] = [];
  const probed = target.pages.filter((p) => p.fetch && isTestable(p));
  if (probed.length) {
    const lost = probed.filter((p) => p.fetch!.paramsLost.length);
    out.push(lost.length
      ? finding({
        scope: 'Parameters', checkKey: 'params.survive', status: 'fail', priority: 'high',
        title: `Ad and campaign parameters are lost on ${plural(lost.length, 'page', 'pages')}`,
        explanation: 'UTM parameters and click IDs (gclid, gbraid, wbraid, fbclid, msclkid) are removed before the page loads. Analytics and ad platforms then cannot attribute the visit to the campaign or ad click.',
        fix: 'Keep the query string on every redirect, and remove tracking parameters from any URL-cleaning or "noise parameter" list.',
        typicalOwner: 'developer',
        evidence: { pages: lost.map((p) => p.path), details: lost.map((p) => `${p.path}: lost ${p.fetch!.paramsLost.join(', ')}`) },
      })
      : finding({
        scope: 'Parameters', checkKey: 'params.survive', status: 'pass', priority: null,
        title: `Ad and campaign parameters survive on all ${plural(probed.length, 'tested page', 'tested pages')}`,
        explanation: 'UTM parameters and click IDs stay in the URL, including through redirects.',
        fix: '', typicalOwner: null, evidence: { pages: probed.map((p) => p.path) },
      }));
  }
  if (mode === 'comparison') out.push(...assessLegacyRedirects(target));
  return out;
}

function assessLegacyRedirects(target: SiteObservation): Finding[] {
  const legacy = target.pages.filter((p) => p.legacy && p.fetch && isTestable(p));
  if (!legacy.length) return [];
  const chain = (p: PageObservation) => p.fetch!.hops.map((h) => `${h.status} ${stripQueryValues(h.url)}`).join(' → ');
  const broken = legacy.filter((p) => p.fetch!.finalStatus >= 400);
  const weak = legacy.filter((p) => {
    if (p.fetch!.finalStatus >= 400) return false;
    const redirects = p.fetch!.hops.slice(0, -1);
    return redirects.length === 0 || redirects.length > 2 || redirects.some((h) => h.status !== 301 && h.status !== 308);
  });
  const out: Finding[] = [];
  if (broken.length) out.push(finding({
    scope: 'Parameters', checkKey: 'redirects.legacy', status: 'fail', priority: 'high',
    title: `${plural(broken.length, 'old URL returns', 'old URLs return')} an error on the new site`,
    explanation: 'Visitors and ads that use these old URLs land on an error page, and search engines drop them.',
    fix: 'Add a permanent (301) redirect from each old URL to its new equivalent, keeping the query string.',
    typicalOwner: 'developer', evidence: { pages: broken.map((p) => p.path), details: broken.map((p) => `${p.path}: ${chain(p)}`) },
  }));
  if (weak.length) out.push(finding({
    scope: 'Parameters', checkKey: 'redirects.legacy_quality', status: 'warning', priority: 'medium',
    title: `${plural(weak.length, 'old URL does', 'old URLs do')} not use a single permanent redirect`,
    explanation: 'Temporary redirects (302/307), chains of several redirects or old URLs that no longer redirect weaken search signals and slow the first page view.',
    fix: 'Use one permanent (301 or 308) redirect straight to the final URL.',
    typicalOwner: 'developer', evidence: { pages: weak.map((p) => p.path), details: weak.map((p) => `${p.path}: ${chain(p)}`) },
  }));
  if (!out.length) out.push(finding({
    scope: 'Parameters', checkKey: 'redirects.legacy', status: 'pass', priority: null,
    title: `All ${plural(legacy.length, 'old URL redirects', 'old URLs redirect')} permanently to a working page`,
    explanation: 'Each old URL uses one permanent redirect to a page that loads.', fix: '', typicalOwner: null,
    evidence: { pages: legacy.map((p) => p.path) },
  }));
  return out;
}

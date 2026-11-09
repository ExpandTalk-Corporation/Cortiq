import type { AssessInput, ConsentState, Finding, PageObservation, StateObservation } from '../types.ts';
import { isGoogleHost } from '../../tracking-vendors.ts';
import { displayPath, finding, plural, siteKey, stateOf, testablePages } from './util.ts';

/**
 * What Google actually receives, read from the request URLs: the `gcs` and `gcd` Consent Mode parameters,
 * email addresses in URLs sent to third parties, and whether the cookie banner remembers the choice.
 */
export function assessSignals(input: AssessInput): Finding[] {
  const pages = testablePages(input.target).filter((p) => p.browser);
  if (!pages.length) return [];
  return [...consentSignals(input, pages), ...emailInUrls(input, pages), ...choiceRemembered(pages)];
}

// ── gcs / gcd ────────────────────────────────────────────────────────────────────────────────

export const CONSENT_DEFAULT_SNIPPET = [
  'Put this first in <head>, before GTM or the Google tag:',
  '<script>',
  'window.dataLayer = window.dataLayer || [];',
  'function gtag(){dataLayer.push(arguments);}',
  "gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied', functionality_storage: 'granted', security_storage: 'granted', wait_for_update: 500 });",
  '</script>',
  'In GTM, set the default in a tag on the "Consent Initialization – All Pages" trigger (most cookie banner templates have this setting), and update it only from the cookie banner when the visitor chooses.',
].join('\n');

/** gcd letters, per signal (ad_storage, analytics_storage, ad_user_data, ad_personalization). */
const GCD_LETTERS: Record<string, string> = {
  l: 'not set', p: 'denied by default', q: 'denied by default and update', t: 'granted by default',
  r: 'denied by default, granted by update', m: 'denied by update (no default)', n: 'granted by update (no default)',
  u: 'granted by default, denied by update', v: 'granted by default and update',
};
const GCD_SIGNALS = ['ad_storage', 'analytics_storage', 'ad_user_data', 'ad_personalization'];
const GRANTED_BY_DEFAULT = new Set(['t', 'u', 'v']);

interface Signal { gcs: string | null; gcd: string | null }

/** gcs = "G1" + ad_storage + analytics_storage, each 1 (granted), 0 (denied) or - (Consent Mode not set). */
export function parseGcs(gcs: string): { ad: string; analytics: string } | null {
  const m = /^G1([01-])([01-])$/.exec(gcs);
  return m ? { ad: m[1], analytics: m[2] } : null;
}

/** gcd → per-signal letters, e.g. "13r3r3r2r5" → { ad_storage: 'r', … }. Null when unparseable. */
export function parseGcd(gcd: string): Record<string, string> | null {
  if (!/^\d{2}[a-z]\d[a-z]\d[a-z]\d[a-z]\d?$/i.test(gcd)) return null;
  return Object.fromEntries(GCD_SIGNALS.map((k, i) => [k, gcd[2 + i * 2].toLowerCase()]));
}

function signalsOf(st: StateObservation): Signal[] {
  const out: Signal[] = [];
  for (const r of st.requests) {
    if (!isGoogleHost(r.url)) continue;
    let u: URL;
    try { u = new URL(r.url); } catch { continue; }
    const gcs = u.searchParams.get('gcs');
    const gcd = u.searchParams.get('gcd');
    if (gcs || gcd) out.push({ gcs, gcd });
  }
  return out;
}

const granted = (s: Signal) => {
  const g = s.gcs ? parseGcs(s.gcs) : null;
  return !!g && (g.ad === '1' || g.analytics === '1');
};
const missing = (s: Signal) => {
  if (s.gcs && parseGcs(s.gcs)) return parseGcs(s.gcs)!.ad === '-' && parseGcs(s.gcs)!.analytics === '-';
  const d = s.gcd ? parseGcd(s.gcd) : null;
  return !!d && Object.values(d).every((l) => l === 'l');
};
const deniedOnly = (s: Signal) => {
  const g = s.gcs ? parseGcs(s.gcs) : null;
  return !!g && g.ad === '0' && g.analytics === '0';
};
function describe(s: Signal): string {
  const parts: string[] = [];
  if (s.gcs) parts.push(`gcs=${s.gcs}`);
  const d = s.gcd ? parseGcd(s.gcd) : null;
  if (d) parts.push(GCD_SIGNALS.map((k) => `${k} ${GCD_LETTERS[d[k]] ?? 'unknown'}`).join(', '));
  return parts.join(' (') + (parts.length > 1 ? ')' : '');
}

/** States whose requests describe the choice: `none` always, the others only when the choice was really applied. */
const choiceApplied = (st: StateObservation | undefined) => !!st && st.method !== 'not_automated' && st.method !== 'not_needed';

function consentSignals({ mode, policy }: AssessInput, pages: PageObservation[]): Finding[] {
  const strictGoogle = mode === 'policy' && !!policy?.noGoogleBeforeConsent;
  type Hit = { pages: Set<string>; details: Set<string>; byDefault: boolean };
  const hits: Record<'grantedNone' | 'grantedReject' | 'missing' | 'advanced' | 'acceptLost', Hit> = {
    grantedNone: { pages: new Set(), details: new Set(), byDefault: false },
    grantedReject: { pages: new Set(), details: new Set(), byDefault: false },
    missing: { pages: new Set(), details: new Set(), byDefault: false },
    advanced: { pages: new Set(), details: new Set(), byDefault: false },
    acceptLost: { pages: new Set(), details: new Set(), byDefault: false },
  };
  const add = (h: Hit, p: PageObservation, state: ConsentState, s: Signal) => { h.pages.add(p.path); h.details.add(`${p.path} (${state}): ${describe(s)}`); };
  let seen = 0;
  const seenPages = new Set<PageObservation>();

  for (const p of pages) {
    for (const state of ['none', 'reject', 'accept'] as const) {
      const st = stateOf(p, state);
      if (!st || (state !== 'none' && !choiceApplied(st))) continue;
      const signals = signalsOf(st);
      if (!signals.length) continue;
      seen += signals.length; seenPages.add(p);
      if (state === 'accept') {
        const real = signals.filter((s) => !missing(s));
        if (real.length && real.every(deniedOnly)) add(hits.acceptLost, p, state, real[0]);
        continue;
      }
      // Without Consent Mode the tag can still be blocked until consent; it only matters when it fires before the choice.
      for (const s of signals) if (missing(s)) add(hits.missing, p, state, s);
      const g = signals.find(granted);
      if (g) {
        const h = state === 'none' ? hits.grantedNone : hits.grantedReject;
        add(h, p, state, g);
        const d = g.gcd ? parseGcd(g.gcd) : null;
        if (d && Object.values(d).some((l) => GRANTED_BY_DEFAULT.has(l))) h.byDefault = true;
      } else if (!strictGoogle) {
        const a = signals.find(deniedOnly);
        if (a) add(hits.advanced, p, state, a);
      }
    }
  }
  if (!seen) return [];

  const out: Finding[] = [];
  const ev = (h: Hit) => ({ pages: [...h.pages], details: [...h.details] });
  for (const [key, h, label] of [['consent.signal.granted_before_choice', hits.grantedNone, 'before the visitor chooses'], ['consent.signal.granted_after_reject', hits.grantedReject, 'after "Reject all"']] as const) {
    if (!h.pages.size) continue;
    out.push(finding({
      scope: 'Consent', checkKey: key, status: 'fail', priority: 'high',
      title: `Google receives consent as "granted" ${label}`,
      explanation: `Google requests ${label} carried a granted consent state (gcs=G1… with a 1) on ${[...h.pages].join(', ')}. ${h.byDefault
        ? 'The gcd parameter shows "granted by default": the Consent Mode default is hardcoded to granted.'
        : 'Something sends a consent update to granted without the visitor\'s choice, or the default is set too late.'} Google then sets and reads cookies as if the visitor had agreed.`,
      fix: CONSENT_DEFAULT_SNIPPET, typicalOwner: 'cmp', evidence: ev(h),
    }));
  }
  if (hits.missing.pages.size) {
    out.push(finding({
      scope: 'Consent', checkKey: 'consent.signal.missing', status: 'fail', priority: 'high',
      title: 'Google tags fire before consent without a Consent Mode signal',
      explanation: `Requests to Google before the choice or after "Reject all" on ${[...hits.missing.pages].join(', ')} had gcs=G1-- or a gcd with every signal "not set": the tags neither wait for consent nor tell Google that consent is missing. Google cannot tell whether the visitor consented, and Google Ads needs Consent Mode signals for EEA traffic.`,
      fix: `Either block the Google tags until consent in the cookie banner, or add Consent Mode v2 with denied defaults.

${CONSENT_DEFAULT_SNIPPET}`, typicalOwner: 'gtm', evidence: ev(hits.missing),
    }));
  }
  if (hits.acceptLost.pages.size) {
    out.push(finding({
      scope: 'Consent', checkKey: 'consent.signal.accept_not_forwarded', status: 'warning', priority: 'high',
      title: '"Accept all" does not reach Google',
      explanation: `After "Accept all" and a reload, Google requests on ${[...hits.acceptLost.pages].join(', ')} still carried gcs=G100 (all denied). The cookie banner does not send a Consent Mode update, so Google measures accepting visitors as if they had refused.`,
      fix: "Turn on the cookie banner's Consent Mode v2 integration, or send gtag('consent', 'update', { ad_storage: 'granted', analytics_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted' }) from the banner when the visitor accepts, and on every page view once consent is stored.",
      typicalOwner: 'cmp', evidence: ev(hits.acceptLost),
    }));
  }
  if (hits.advanced.pages.size) {
    out.push(finding({
      scope: 'Consent', checkKey: 'consent.signal.advanced', status: 'manual', priority: 'medium',
      title: 'Consent Mode advanced: Google receives cookieless pings without consent',
      explanation: `Google tags fired with all consent denied (gcs=G100) on ${[...hits.advanced.pages].join(', ')}. This is Consent Mode advanced: no cookies, but each ping sends the IP address, user agent and page URL to Google, which uses them for modelling. Whether that is acceptable without consent is a decision for the controller (with the DPO); this is assessed by the controller.`,
      fix: 'Decide and document basic or advanced. Basic: the cookie banner blocks the Google tags until consent, so nothing is sent before the choice. Advanced: keep the tags, and describe the cookieless pings in the privacy policy.',
      typicalOwner: 'legal', evidence: ev(hits.advanced),
    }));
  }
  if (!out.length) {
    out.push(finding({
      scope: 'Consent', checkKey: 'consent.signal', status: 'pass', priority: null,
      title: 'Google receives the consent state the visitor chose',
      explanation: `Checked ${plural(seen, 'Google request', 'Google requests')} with Consent Mode parameters (gcs/gcd): none granted before the choice or after "Reject all", and "Accept all" reaches Google.`,
      fix: '', typicalOwner: null, evidence: { pages: [...seenPages].map((p) => p.path) },
    }));
  }
  return out;
}

// ── email addresses in URLs sent to third parties ───────────────────────────────────────────

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+/gi;
const FILE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif', 'ico', 'css', 'js', 'json', 'pdf', 'html', 'php']);
/** Machine identities, not people: Google Cloud service accounts (e.g. in signed Cloud Storage URLs). */
const SERVICE_ACCOUNT = /(^|\.)gserviceaccount\.com$/i;
/** Signed-URL credentials (Google Cloud Storage, S3) name a service account, never a visitor. */
const SIGNED_URL_CREDENTIAL = /^x-(goog|amz)-credential$/i;

function decodeDeep(v: string): string {
  let s = v;
  for (let i = 0; i < 3; i++) {
    let next = s;
    try { next = decodeURIComponent(s.replace(/\+/g, ' ')); } catch { break; }
    if (next === s) break;
    s = next;
  }
  return s;
}

export function containsEmail(value: string): boolean {
  const s = decodeDeep(value);
  for (const m of s.matchAll(EMAIL)) {
    // Not credentials in "https://key@host", and file extensions are not TLDs ("logo@2x.png").
    if (m.index && /[/:]/.test(s[m.index - 1])) continue;
    const domain = m[0].split('@')[1].replace(/\.+$/, '');
    if (SERVICE_ACCOUNT.test(domain)) continue;
    const labels = domain.split('.');
    const tld = labels.at(-1)!.toLowerCase();
    if (labels.length >= 2 && labels.every(Boolean) && /^[a-z]{2,24}$/.test(tld) && !FILE_EXT.has(tld)) return true;
  }
  return false;
}

/** Names of the query parameters (or "path") of `url` that contain an email address. Values are never returned. */
export function emailParams(url: string): string[] {
  let u: URL;
  try { u = new URL(url); } catch { return []; }
  const names = new Set<string>();
  for (const [k, v] of u.searchParams) if (!SIGNED_URL_CREDENTIAL.test(k) && containsEmail(v)) names.add(k);
  if (containsEmail(u.pathname)) names.add('path');
  return [...names];
}

function emailInUrls({ target }: AssessInput, pages: PageObservation[]): Finding[] {
  const own = siteKey(new URL(target.origin).hostname);
  const leaks = new Map<string, { params: Set<string>; pages: Set<string> }>();
  let thirdParty = 0;
  for (const p of pages) {
    for (const st of p.browser!.states) {
      for (const r of st.requests) {
        let host = '';
        try { host = new URL(r.url).hostname; } catch { continue; }
        if (!host || siteKey(host) === own) continue;
        thirdParty++;
        const params = emailParams(r.url);
        if (!params.length) continue;
        if (!leaks.has(host)) leaks.set(host, { params: new Set(), pages: new Set() });
        const l = leaks.get(host)!;
        params.forEach((x) => l.params.add(x));
        l.pages.add(displayPath(p.path));
      }
    }
  }
  if (!thirdParty) return [];
  if (!leaks.size) {
    return [finding({
      scope: 'Tags', checkKey: 'privacy.email_in_url', status: 'pass', priority: null,
      title: 'No email addresses in URLs sent to third parties',
      explanation: `Checked ${plural(thirdParty, 'third-party request', 'third-party requests')}. Forms are not submitted automatically: add the thank-you page address (with the parameters the form adds) as a page to check it too.`,
      fix: '', typicalOwner: null, evidence: { pages: pages.map((p) => displayPath(p.path)) },
    })];
  }
  return [finding({
    scope: 'Tags', checkKey: 'privacy.email_in_url', status: 'fail', priority: 'high',
    title: `An email address is sent to ${plural(leaks.size, 'third party', 'third parties')} in the URL`,
    explanation: `Requests to ${[...leaks.keys()].join(', ')} contained an email address in the URL, usually because the page address itself contains it (for example a thank-you page like /thanks?email=…) and tags send the page URL (dl, dr, page_location). The address is then personal data shared with the vendor (Google's terms also forbid sending it). The values are not shown in this report.`,
    fix: 'Do not put email addresses or other personal data in URLs: redirect to a thank-you page without them. Until then, strip them before the tags fire (GTM: a variable that removes the parameter from page_location/page_referrer; GA4: Admin → Data streams → Redact data → Email).',
    typicalOwner: 'developer',
    evidence: { pages: [...new Set([...leaks.values()].flatMap((l) => [...l.pages]))], details: [...leaks].map(([h, l]) => `${h}: ${[...l.params].join(', ')}`) },
  })];
}

// ── the cookie banner remembers the choice ──────────────────────────────────────────────────

function choiceRemembered(pages: PageObservation[]): Finding[] {
  const forgotten = new Map<string, Set<string>>();
  for (const p of pages) {
    for (const st of p.browser!.states) {
      if (st.state === 'none' || st.bannerAfterChoice !== true) continue;
      if (!forgotten.has(p.path)) forgotten.set(p.path, new Set());
      forgotten.get(p.path)!.add(st.state === 'reject' ? '"Reject all"' : st.state === 'accept' ? '"Accept all"' : st.state.replace('_', ' '));
    }
  }
  if (!forgotten.size) return [];
  return [finding({
    scope: 'Consent', checkKey: 'consent.choice_not_remembered', status: 'fail', priority: 'medium',
    title: 'The cookie banner does not remember the choice',
    explanation: `The choice was made through the cookie banner's own API, but after a reload the banner was shown again on ${[...forgotten.keys()].join(', ')}. Visitors are asked again on every page view, and an "Accept all" may never reach the tags.`,
    fix: "Check that the banner stores its consent cookie (name, domain, path, Secure/SameSite) and that nothing removes it: a cache serving another visitor's page, a consent version that changes on every load, or a domain mismatch between www and the bare domain. Test in an incognito window: choose, reload, and the banner should stay hidden.",
    typicalOwner: 'cmp',
    evidence: { pages: [...forgotten.keys()], details: [...forgotten].map(([path, s]) => `${path}: banner shown again after ${[...s].join(', ')}`) },
  })];
}

import type { AssessInput, Finding, PageObservation, StateObservation } from '../types.ts';
import { isGoogleHost, vendorForName, vendorForUrl, type Vendor } from '../../tracking-vendors.ts';
import { MANUAL_STEPS } from '../instructions.ts';
import { finding, plural, requestVendors, siteKey, stateOf, testablePages } from './util.ts';

const REQUIRED_DEFAULTS = ['ad_storage', 'analytics_storage', 'ad_user_data', 'ad_personalization'];
const needsConsent = (v: Vendor) => v.category === 'analytics' || v.category === 'marketing';
const automated = (st?: StateObservation) => !!st && st.method !== 'not_automated';
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const paths = (pages: Iterable<PageObservation | string>) => [...pages].map((p) => (typeof p === 'string' ? p : p.path));
const GOOGLE_EXEMPTION = 'Google Fonts and reCAPTCHA were exempted.';
/** Google endpoints that are not one of the registry's Google tags (strict "nothing to Google" policy only). */
const GOOGLE_OTHER: Vendor = {
  id: 'google', name: 'Google', category: 'necessary', googleTag: true, requests: [], cookies: [], csp: {}, impact: '',
};

function pass(checkKey: string, title: string, explanation: string, pages: PageObservation[]): Finding {
  return finding({ scope: checkKey.startsWith('ads.') ? 'Ads/GA4' : 'Consent', checkKey, status: 'pass', priority: null,
    title, explanation, fix: '', typicalOwner: null, evidence: { pages: paths(pages) } });
}

export function assessConsent(input: AssessInput): Finding[] {
  const pages = testablePages(input.target).filter((p) => p.browser);
  if (!pages.length) return [];
  return [
    ...consentDefaults(input, pages),
    ...choiceCheck(input, pages, 'none'),
    ...choiceCheck(input, pages, 'reject'),
    ...categoryCheck(input, pages),
    ...unknownAfterReject(input, pages),
    ...enhancedConversions(input, pages),
    ...manualItems(input),
  ];
}

function consentDefaults({ mode, policy }: AssessInput, pages: PageObservation[]): Finding[] {
  const googleSeen = pages.some((p) => p.browser!.states.some((st) => [...requestVendors(st).values()].some((v) => v.googleTag)));
  if (mode === 'policy' ? !policy?.consentDefaultsDenied : !googleSeen) return [];
  const details: string[] = [];
  const affected: string[] = [];
  for (const p of pages) {
    const none = stateOf(p, 'none');
    if (!none) continue;
    // Region-specific defaults (e.g. granted outside the EEA) are not the default this visitor gets.
    const defaults = none.consentCommands.filter((c) => c.kind === 'default');
    const def = defaults.find((c) => !('region' in c.params)) ?? defaults[0];
    if (!def) { details.push(`${p.path}: no consent default is set`); affected.push(p.path); continue; }
    const wrong = REQUIRED_DEFAULTS.filter((k) => def.params[k] !== 'denied');
    if (wrong.length) {
      details.push(`${p.path}: ${wrong.map((k) => `${k}=${def.params[k] ?? 'missing'}`).join(', ')}`);
      affected.push(p.path);
    }
  }
  if (!details.length) {
    return [pass('consent.defaults', 'Consent Mode v2 defaults are "denied" before the visitor chooses',
      'ad_storage, analytics_storage, ad_user_data and ad_personalization all default to denied.', pages)];
  }
  return [finding({
    scope: 'Consent', checkKey: 'consent.defaults', status: 'fail', priority: 'high',
    title: 'Consent Mode v2 defaults are missing or not "denied"',
    explanation: 'Google tags need a consent default of "denied" before they load. Without it they behave as if consent was given, and Google Ads needs Consent Mode signals for EEA traffic.',
    fix: "Set gtag('consent', 'default', { ad_storage: 'denied', analytics_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' }) before GTM or the Google tag loads. Most cookie banners (CookieYes, Cookiebot, OneTrust) have a Consent Mode v2 setting that does this.",
    typicalOwner: 'cmp', evidence: { pages: affected, details },
  })];
}

function choiceCheck({ mode, policy }: AssessInput, pages: PageObservation[], state: 'none' | 'reject'): Finding[] {
  const label = state === 'none' ? 'before the visitor chooses' : 'after "Reject all"';
  const key = state === 'none' ? 'consent.before_choice' : 'consent.after_reject';
  const strictGoogle = mode === 'policy' && !!policy?.noGoogleBeforeConsent;
  const notAutomated = pages.filter((p) => stateOf(p, state)?.method === 'not_automated');
  const evaluated = pages.filter((p) => {
    const st = stateOf(p, state);
    return !!st && st.method !== 'not_automated' && !(state === 'reject' && st.method === 'not_needed');
  });

  const hits = new Map<string, { vendor: Vendor; pages: Set<string>; stored: Set<string>; hosts: Set<string> }>();
  const hit = (v: Vendor) => {
    if (!hits.has(v.id)) hits.set(v.id, { vendor: v, pages: new Set(), stored: new Set(), hosts: new Set() });
    return hits.get(v.id)!;
  };
  for (const p of evaluated) {
    const st = stateOf(p, state)!;
    for (const r of st.requests) {
      const known = vendorForUrl(r.url);
      const v = known && (needsConsent(known) || (strictGoogle && known.googleTag)) ? known
        : strictGoogle && isGoogleHost(r.url) ? GOOGLE_OTHER : null;
      if (!v) continue;
      let host = '';
      try { host = new URL(r.url).hostname; } catch { continue; }
      const h = hit(v); h.pages.add(p.path); h.hosts.add(host);
    }
    for (const name of [...st.cookies.map((c) => c.name), ...st.storageKeys]) {
      const v = vendorForName(name);
      if (!v || !needsConsent(v)) continue;
      const h = hit(v); h.pages.add(p.path); h.stored.add(name);
    }
  }

  const out: Finding[] = [];
  for (const [id, h] of hits) {
    const v = h.vendor;
    const where = [...h.pages].join(', ');
    const hosts = [...h.hosts].join(', ') || v.name;
    const evidence = { pages: [...h.pages], details: [...[...h.hosts].map((x) => `requests to ${x}`), ...[...h.stored].map((n) => `stored ${n}`)] };
    if (h.stored.size) {
      out.push(finding({
        scope: 'Consent', checkKey: `${key}.${id}`, status: 'fail', priority: 'high',
        title: `${v.name} stores data on the device ${label}`,
        explanation: `${v.name} set ${[...h.stored].join(', ')} ${label} on ${where}. Storing or reading data on the device for analytics or marketing may require consent under ePrivacy rules (in Sweden: LEK 9 kap. 28 §); this is assessed by the controller.`,
        fix: `Load ${v.name} only after consent for the "${v.category}" category: block it in the cookie banner, or give its GTM tag a consent requirement.`,
        typicalOwner: 'cmp', evidence,
      }));
    } else if (v.googleTag && strictGoogle) {
      out.push(finding({
        scope: 'Consent', checkKey: `${key}.${id}`, status: 'fail', priority: 'high',
        title: id === 'google' ? `Requests are sent to Google ${label}` : `${v.name} sends requests to Google ${label}`,
        explanation: `${id === 'google' ? 'The page' : v.name} contacted ${hosts} ${label} on ${where}, without setting cookies. The agreed setup is that nothing is sent to Google before consent (Consent Mode basic). ${GOOGLE_EXEMPTION}`,
        fix: id === 'gtm'
          ? 'Load the GTM container only after consent, or record the container request as an accepted exception (the container itself sets no cookies).'
          : id === 'google'
            ? 'Find the tag that calls these Google endpoints (DevTools → Network → Initiator, or Tag Assistant) and block it until consent.'
            : `Block ${v.name} until consent (Consent Mode basic) instead of letting it send cookieless pings (Consent Mode advanced).`,
        typicalOwner: 'gtm', evidence,
      }));
    } else {
      out.push(finding({
        scope: 'Consent', checkKey: `${key}.cookieless.${id}`, status: 'warning', priority: 'medium',
        title: `${v.name} sends requests ${label} without cookies`,
        explanation: `${v.name} contacted ${hosts} ${label} on ${where}, without setting cookies or local storage. Cookieless measurement may require consent under ePrivacy rules (in Sweden: LEK 9 kap. 28 §); this is assessed by the controller.`,
        fix: `Check ${v.name}'s settings (for example a "track visitors always" option) and decide with the controller whether measuring visitors ${state === 'none' ? 'before they choose' : 'who rejected cookies'} is acceptable.`,
        typicalOwner: 'legal', evidence,
      }));
    }
  }
  if (notAutomated.length) {
    out.push(finding({
      scope: 'Consent', checkKey: `${key}.manual`, status: 'manual', priority: 'high',
      title: 'Check manually that nothing is tracked after "Reject all"',
      explanation: `The automated browser could not find or click the cookie banner's reject option on ${paths(notAutomated).join(', ')}.`,
      fix: MANUAL_STEPS.reject, typicalOwner: 'cmp', evidence: { pages: paths(notAutomated) },
    }));
  } else if (state === 'reject' && mode === 'policy' && !evaluated.length) {
    // Policy runs commit to "nothing after reject": without any banner to reject, that was not tested.
    out.push(finding({
      scope: 'Consent', checkKey: `${key}.manual`, status: 'manual', priority: 'high',
      title: 'Check manually that nothing is tracked after "Reject all"',
      explanation: `No cookie banner was detected on ${paths(pages).join(', ')}, so "Reject all" could not be tested.`,
      fix: MANUAL_STEPS.reject, typicalOwner: 'cmp', evidence: { pages: paths(pages) },
    }));
  }
  if (!out.length && evaluated.length) {
    const title = state === 'none'
      ? (strictGoogle ? 'Nothing is tracked or sent to Google before the visitor chooses' : 'No analytics or marketing tools run before the visitor chooses')
      : (strictGoogle ? 'Nothing is tracked or sent to Google after "Reject all"' : 'Nothing is tracked after "Reject all"');
    out.push(pass(key, title, `Checked on ${plural(evaluated.length, 'page', 'pages')}: no analytics or marketing requests, cookies or local storage${strictGoogle ? `, and no requests to Google. ${GOOGLE_EXEMPTION}` : '.'}`, evaluated));
  }
  return out;
}

function categoryCheck({ mode, policy }: AssessInput, pages: PageObservation[]): Finding[] {
  if (mode !== 'policy' || !(policy?.ga4RequiresAnalytics || policy?.adsRequiresMarketing)) return [];

  // Define checks based on independent policy flags
  // adsRequiresMarketing: check analytics_only state (marketing must not send with only Statistics)
  // ga4RequiresAnalytics: check marketing_only state (analytics must not send with only Marketing)
  const checks: Array<{ state: string; forbidden: string; only: string }> = [];
  if (policy.adsRequiresMarketing) {
    checks.push({ state: 'analytics_only', forbidden: 'marketing', only: 'Statistics' });
  }
  if (policy.ga4RequiresAnalytics) {
    checks.push({ state: 'marketing_only', forbidden: 'analytics', only: 'Marketing' });
  }

  // Find pages where required states are missing or not automated
  const unsupported = pages.filter((p) =>
    checks.some((c) => {
      const st = stateOf(p, c.state as any);
      return !st || st.method === 'not_automated';
    })
  );

  // Check for violations in automated states
  const wrong = new Map<string, { vendor: Vendor; only: string; pages: Set<string> }>();
  for (const p of pages) {
    for (const c of checks) {
      const st = stateOf(p, c.state as any);
      if (!automated(st)) continue;
      for (const r of st!.requests) {
        let u: URL;
        try { u = new URL(r.url); } catch { continue; }
        // The shared gtag.js library loads for every Google tag and sends no data; only hits count.
        if (/(^|\.)googletagmanager\.com$/.test(u.hostname) && u.pathname.startsWith('/gtag/js')) continue;
        const v = vendorForUrl(r.url);
        if (!v || v.category !== c.forbidden) continue;
        if (!wrong.has(v.id)) wrong.set(v.id, { vendor: v, only: c.only, pages: new Set() });
        wrong.get(v.id)!.pages.add(p.path);
      }
    }
  }

  const out: Finding[] = [];
  for (const [id, w] of wrong) {
    out.push(finding({
      scope: 'Consent', checkKey: `consent.category.${id}`, status: 'fail', priority: 'high',
      title: `${w.vendor.name} runs with only ${w.only} accepted`,
      explanation: `${w.vendor.name} is a ${w.vendor.category} tool but sent requests when only the ${w.only} category was accepted, on ${[...w.pages].join(', ')}.`,
      fix: `Assign ${w.vendor.name} to the ${cap(w.vendor.category)} category in the cookie banner, or require ${w.vendor.category === 'marketing' ? 'ad_storage' : 'analytics_storage'} in its GTM consent settings.`,
      typicalOwner: 'cmp', evidence: { pages: [...w.pages] },
    }));
  }
  if (unsupported.length) {
    out.push(finding({
      scope: 'Consent', checkKey: 'consent.category.manual', status: 'manual', priority: 'high',
      title: 'Check consent categories manually',
      explanation: `The cookie banner on ${paths(unsupported).join(', ')} offers no supported way to accept a single category automatically.`,
      fix: MANUAL_STEPS.granular, typicalOwner: 'cmp', evidence: { pages: paths(unsupported) },
    }));
  } else if (!out.length) {
    const ran = checks.map((c) => c.forbidden);
    const title = ran.length === 2 ? 'Each tool only runs when its own consent category is accepted'
      : ran[0] === 'marketing' ? 'Marketing tools do not run with only Statistics accepted' : 'Analytics tools do not run with only Marketing accepted';
    const sentences = ran.map((f) => (f === 'marketing' ? 'With only Statistics accepted, no marketing tools sent data.' : 'With only Marketing accepted, no analytics tools sent data.'));
    out.push(pass('consent.category', title, sentences.join(' '), pages));
  }
  return out;
}

function unknownAfterReject({ mode, policy, target }: AssessInput, pages: PageObservation[]): Finding[] {
  if (mode !== 'policy' || !policy?.noUnknownVendorsAfterReject) return [];
  const own = siteKey(new URL(target.origin).hostname);
  const hosts = new Map<string, Set<string>>();
  const evaluated: PageObservation[] = [];
  for (const p of pages) {
    const st = stateOf(p, 'reject');
    if (!st || st.method === 'not_automated' || st.method === 'not_needed') continue;
    evaluated.push(p);
    for (const r of st.requests) {
      let host = '';
      try { host = new URL(r.url).hostname; } catch { continue; }
      if (!host || siteKey(host) === own || vendorForUrl(r.url)) continue;
      if (!hosts.has(host)) hosts.set(host, new Set());
      hosts.get(host)!.add(p.path);
    }
  }
  if (!evaluated.length) return [];
  if (!hosts.size) {
    return [pass('consent.unknown_after_reject', 'No unknown third parties are contacted after "Reject all"',
      'Every third-party request after rejection went to a tool CortIQ recognises.', evaluated)];
  }
  return [finding({
    scope: 'Consent', checkKey: 'consent.unknown_after_reject', status: 'warning', priority: 'medium',
    title: `${plural(hosts.size, 'unknown third party is', 'unknown third parties are')} contacted after "Reject all"`,
    explanation: "These domains are not in CortIQ's list of known tools. They may be harmless (CDNs, video, fonts) or tracking tools.",
    fix: 'Identify each domain. If it is a tracking or marketing tool, block it until consent in the cookie banner.',
    typicalOwner: 'marketing',
    evidence: { pages: [...new Set([...hosts.values()].flatMap((s) => [...s]))], details: [...hosts].map(([h, ps]) => `${h} (on ${[...ps].join(', ')})`) },
  })];
}

function enhancedConversions({ mode, policy }: AssessInput, pages: PageObservation[]): Finding[] {
  if (mode !== 'policy' || !policy?.enhancedConversionsOff) return [];
  const seen = pages.filter((p) => p.browser!.states.some((s) => s.enhancedConversions));
  if (seen.length) {
    return [finding({
      scope: 'Ads/GA4', checkKey: 'ads.enhanced_conversions', status: 'fail', priority: 'high',
      title: 'Enhanced Conversions appears to be switched on',
      explanation: 'The Google tag configuration or its requests include user data for Enhanced Conversions (hashed email), which the agreed setup excludes.',
      fix: 'Turn off Enhanced Conversions in Google Ads (Goals → Settings), and remove user_data and allow_enhanced_conversions from the Google tag or GTM.',
      typicalOwner: 'gtm', evidence: { pages: paths(seen) },
    })];
  }
  return [finding({
    scope: 'Ads/GA4', checkKey: 'ads.enhanced_conversions', status: 'manual', priority: 'medium',
    title: 'Confirm Enhanced Conversions is off in Google Ads',
    explanation: 'No Enhanced Conversions data was seen while loading pages. It is normally sent when a form is submitted, which is not tested automatically.',
    fix: 'In Google Ads, open Goals → Settings → Enhanced conversions and confirm it is off. Optionally submit a test form with Tag Assistant connected and check that no user_data is sent.',
    typicalOwner: 'gtm',
  })];
}

function manualItems({ mode, policy }: AssessInput): Finding[] {
  if (mode !== 'policy' || !policy) return [];
  return policy.manualItems.map((item) => finding({
    scope: 'Manual', checkKey: `manual.${item.key}`, status: 'manual', priority: 'medium', title: item.label,
    explanation: 'This cannot be verified from outside the site. Check it in the relevant admin tool and mark it as verified.',
    fix: '', typicalOwner: 'marketing',
  }));
}

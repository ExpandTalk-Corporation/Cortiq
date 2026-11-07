import type { AssessInput, Finding, PageObservation, StateObservation } from '../types.ts';
import { GOOGLE_EXEMPT_VENDORS, isGoogleHost, vendorForName, vendorForUrl, type Vendor } from '../../tracking-vendors.ts';
import { MANUAL_STEPS } from '../instructions.ts';
import { finding, plural, requestVendors, siteKey, stateOf, testablePages } from './util.ts';
import { CONSENT_DEFAULT_SNIPPET } from './signals.ts';
import { DATA_DROP, cmpName, cmpOf, consentModeSteps, googleHostLabel, gtmBlockSteps, verifyInConsole } from './guides.ts';

const REQUIRED_DEFAULTS = ['ad_storage', 'analytics_storage', 'ad_user_data', 'ad_personalization'];
const needsConsent = (v: Vendor) => v.category === 'analytics' || v.category === 'marketing';
const automated = (st?: StateObservation) => !!st && st.method !== 'not_automated';
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const paths = (pages: Iterable<PageObservation | string>) => [...pages].map((p) => (typeof p === 'string' ? p : p.path));
const GOOGLE_EXEMPTION = 'Google Fonts and reCAPTCHA were exempted.';
const LEGAL = 'may require consent under ePrivacy rules (in Sweden: LEK 9 kap. 28 §); this is assessed by the controller.';
const hasDefault = (st?: StateObservation) => !!st && st.consentCommands.some((c) => c.kind === 'default');
/** Google endpoints that are not one of the registry's Google tags (strict "nothing to Google" policy only). */
const GOOGLE_OTHER: Vendor = {
  id: 'google', name: 'Google', category: 'necessary', googleTag: true, requests: [], cookies: [], csp: {}, impact: '',
};

function pass(checkKey: string, title: string, explanation: string, pages: PageObservation[]): Finding {
  return finding({ scope: checkKey.startsWith('ads.') ? 'Ads/GA4' : 'Consent', checkKey, status: 'pass', priority: null,
    title, explanation, fix: '', typicalOwner: null, evidence: { pages: paths(pages) } });
}

/**
 * Strict Google policy: the "nothing to Google" commitment, reported on its own line so an unrelated
 * vendor's warning (e.g. a cookieless analytics ping) never hides it. Only emitted when something else
 * already produced a finding for this state (otherwise the combined "nothing is tracked or sent to
 * Google" pass below already says so) and no Google-owned request was seen on the evaluated pages.
 */
function googleCommitment(state: 'none' | 'reject', key: string, evaluated: PageObservation[]): Finding {
  const title = state === 'none' ? 'Nothing is sent to Google before the visitor chooses' : 'Nothing is sent to Google after "Reject all"';
  const exemptSeen = evaluated.some((p) => stateOf(p, state)!.requests.some((r) => {
    const v = vendorForUrl(r.url);
    return !!v && GOOGLE_EXEMPT_VENDORS.includes(v.id);
  }));
  return pass(`${key}.google_commitment`, title,
    `Checked on ${plural(evaluated.length, 'page', 'pages')}: no requests to Google.${exemptSeen ? ` ${GOOGLE_EXEMPTION}` : ''}`,
    evaluated);
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
  // No Consent Mode is a valid choice when the Google tags wait for consent: nothing reaches Google before
  // the visitor chooses. It only fails when Google is contacted before the choice without denied defaults.
  const googleBeforeChoice = pages.some((p) => {
    const none = stateOf(p, 'none');
    return !!none && [...requestVendors(none).values()].some((v) => v.googleTag);
  });
  if (!googleBeforeChoice) {
    return [finding({
      scope: 'Consent', checkKey: 'consent.defaults', status: 'warning', priority: 'medium',
      title: 'Consent Mode is not used: decide whether you need it',
      explanation: `No Consent Mode default was found on ${affected.join(', ')}, but no Google tag fired before the visitor chose, so the tags wait for consent. That is a valid setup. Without Consent Mode, Google Ads gets no consent signals for EEA traffic, which limits remarketing, audiences and conversion modelling.`,
      fix: `If you use Google Ads, add Consent Mode v2 (most cookie banners have a setting for it) and keep blocking the tags until consent (basic mode). If you only use GA4 or no Google advertising, you can leave it out; untick "Consent Mode v2 defaults" in the check's commitments.\n\n${CONSENT_DEFAULT_SNIPPET}`,
      typicalOwner: 'marketing', evidence: { pages: affected, details },
    })];
  }
  const cmp = cmpOf(pages);
  const banner = cmpName(cmp);
  const missing = pages.some((p) => affected.includes(p.path) && !hasDefault(stateOf(p, 'none')));
  const googleStored = pages.some((p) => {
    const none = stateOf(p, 'none');
    return !!none && [...none.cookies.map((c) => c.name), ...none.storageKeys].some((n) => vendorForName(n)?.googleTag);
  });
  const ownSteps = consentModeSteps(cmp) !== consentModeSteps(null);
  return [finding({
    scope: 'Consent', checkKey: 'consent.defaults', status: 'fail', priority: 'high',
    title: 'Consent Mode v2 defaults are missing or not "denied"',
    explanation: [
      missing ? `No Consent Mode default was found on ${affected.join(', ')}.` : `The Consent Mode default is not "denied" on ${affected.join(', ')}.`,
      'Consent Mode is how the cookie banner tells Google\'s tags whether the visitor has said yes. Without a "denied" default, the tags act as if the visitor accepted until the banner says otherwise.',
      googleStored ? 'Here they set Google cookies before the visitor answered.' : 'Here they contacted Google before the visitor answered.',
      missing && banner ? `The cookie banner (${banner}) loaded, but it does not pass its answer on to Google's tags.` : '',
      'Google Ads also needs these signals for traffic from the EEA.',
    ].filter(Boolean).join(' '),
    fix: [
      consentModeSteps(cmp),
      ownSteps ? `Without a banner setting, add the default yourself. ${CONSENT_DEFAULT_SNIPPET}` : CONSENT_DEFAULT_SNIPPET,
      'The default only makes the tags hold back their cookies. To stop them contacting Google before consent, each tag also needs a consent requirement (see the finding for each tag).',
      verifyInConsole(cmp),
    ].join('\n\n'),
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

  const cmp = cmpOf(pages);
  const banner = cmpName(cmp);
  const consequence = state === 'none' ? 'The visitor is tracked before saying yes or no.' : 'The visitor is tracked although they said no.';
  /** Why the tool ran before the choice: no Consent Mode default, or a banner that only blocks after an active choice. */
  const diagnosis = (v: Vendor, onPages: Set<string>): string => {
    if (state !== 'none') return '';
    const mine = evaluated.filter((p) => onPages.has(p.path));
    const parts: string[] = [];
    if (v.googleTag && v.id !== 'gtm' && mine.some((p) => !hasDefault(stateOf(p, 'none')))) {
      parts.push('No Consent Mode default was set, so Google\'s tags acted as if the visitor had accepted.');
    }
    const rejected = mine.filter((p) => {
      const r = stateOf(p, 'reject');
      return !!r && r.method !== 'not_automated' && r.method !== 'not_needed';
    });
    if (rejected.length && rejected.every((p) => !stateOf(p, 'reject')!.requests.some((r) => vendorForUrl(r.url)?.id === v.id))) {
      parts.push(`After "Reject all" it sent nothing, so the cookie banner${banner ? ` (${banner})` : ''} blocks it after an active choice, but not while the visitor has not answered yet.`);
    } else if (banner) {
      parts.push(`The cookie banner (${banner}) loaded, but ${v.name} did not wait for its answer.`);
    }
    return parts.join(' ');
  };

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
        explanation: [`${v.name} set ${[...h.stored].join(', ')} in the browser ${label} on ${where}.`, diagnosis(v, h.pages), consequence,
          `Storing or reading data on the device for analytics or marketing ${LEGAL}`].filter(Boolean).join(' '),
        fix: v.googleTag
          ? [gtmBlockSteps(cmp, v), `Check it yourself: in an incognito window, before answering the cookie banner, DevTools → Application → Cookies should show no ${[...h.stored].join(', ')}.`, DATA_DROP].join('\n\n')
          : [`Load ${v.name} only after consent for the "${v.category}" category: block it in the cookie banner${banner ? ` (${banner})` : ''}, or give its GTM tag a consent requirement.`, v.note ?? ''].filter(Boolean).join('\n\n'),
        typicalOwner: v.googleTag ? 'gtm' : 'cmp', evidence,
      }));
    } else if (v.googleTag && strictGoogle && id === 'gtm') {
      out.push(finding({
        scope: 'Consent', checkKey: `${key}.${id}`, status: 'fail', priority: 'high',
        title: `${v.name} sends requests to Google ${label}`,
        explanation: `The GTM container file (gtm.js) was downloaded from ${hosts} ${label} on ${where}. It sets no cookies, but Google receives the visitor's IP address and the page address. Many sites accept this because GTM often loads the cookie banner itself; under the agreed setup (nothing is sent to Google before consent) it is a deviation. This is a decision for the controller rather than a configuration error. ${GOOGLE_EXEMPTION}`,
        fix: 'Choose one:\n1) Record the container request as an accepted exception (the most common choice), with the reasoning.\n2) Load GTM only after consent. The cookie banner must then load directly in the page, not through GTM, and visitors who never answer the banner are not measured at all.',
        typicalOwner: 'legal', evidence,
      }));
    } else if (v.googleTag && strictGoogle && id === 'google') {
      out.push(finding({
        scope: 'Consent', checkKey: `${key}.${id}`, status: 'fail', priority: 'high',
        title: `Requests are sent to Google ${label}`,
        explanation: `The page contacted ${hosts} ${label} on ${where}, without setting cookies. No tag CortIQ recognises sent these requests, so the sender has to be found in the browser. The agreed setup is that nothing is sent to Google before consent (Consent Mode basic). ${GOOGLE_EXEMPTION}`,
        fix: 'Find the tag that calls these Google endpoints (DevTools → Network → click the request → Initiator, or Tag Assistant) and give it a consent requirement in GTM, or block it in the cookie banner.',
        typicalOwner: 'gtm',
        evidence: { ...evidence, details: [...h.hosts].map((x) => { const what = googleHostLabel(x); return `requests to ${x}${what ? ` (${what})` : ''}`; }) },
      }));
    } else if (v.googleTag && strictGoogle) {
      out.push(finding({
        scope: 'Consent', checkKey: `${key}.${id}`, status: 'fail', priority: 'high',
        title: `${v.name} sends requests to Google ${label}`,
        explanation: [`${v.name} contacted ${hosts} ${label} on ${where}, without setting cookies.`, diagnosis(v, h.pages),
          'Cookieless pings still give Google the visitor\'s IP address, browser and page address (Consent Mode advanced). The agreed setup is that nothing is sent to Google before consent (Consent Mode basic).', GOOGLE_EXEMPTION].filter(Boolean).join(' '),
        fix: [gtmBlockSteps(cmp, v), DATA_DROP].join('\n\n'),
        typicalOwner: 'gtm', evidence,
      }));
    } else {
      out.push(finding({
        scope: 'Consent', checkKey: `${key}.cookieless.${id}`, status: 'warning', priority: 'medium',
        title: `${v.name} sends requests ${label} without cookies`,
        explanation: `${v.name} contacted ${hosts} ${label} on ${where}, without setting cookies or local storage. Without cookies, the visitor's IP address, browser and page address still reach ${v.name}. Cookieless measurement ${LEGAL}`,
        fix: [v.note ?? `Check ${v.name}'s settings (for example a "track visitors always" option).`,
          `Decide with the controller whether measuring visitors ${state === 'none' ? 'before they choose' : 'who rejected cookies'} is acceptable.`].join('\n\n'),
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
  const hadOtherFindings = out.length > 0;
  if (!hadOtherFindings && evaluated.length) {
    const title = state === 'none'
      ? (strictGoogle ? 'Nothing is tracked or sent to Google before the visitor chooses' : 'No analytics or marketing tools run before the visitor chooses')
      : (strictGoogle ? 'Nothing is tracked or sent to Google after "Reject all"' : 'Nothing is tracked after "Reject all"');
    out.push(pass(key, title, `Checked on ${plural(evaluated.length, 'page', 'pages')}: no analytics or marketing requests, cookies or local storage${strictGoogle ? `, and no requests to Google. ${GOOGLE_EXEMPTION}` : '.'}`, evaluated));
  }
  // Other findings (e.g. a cookieless-vendor warning) must not hide whether the Google commitment itself
  // held: report it on its own line unless the combined pass above already covered it, or Google was seen
  // (the hits loop above already produced a fail finding for that).
  if (strictGoogle && evaluated.length && hadOtherFindings) {
    const googleSeen = evaluated.some((p) => stateOf(p, state)!.requests.some((r) => isGoogleHost(r.url)));
    if (!googleSeen) out.push(googleCommitment(state, key, evaluated));
  }
  return [...out, ...verifyWidgets(evaluated, state, key, label)];
}

/** Names a verify widget stored before use, as a sentence for its finding. */
const stored = (details: Set<string>): string => {
  const names = [...details].filter((d) => d.startsWith('stored ')).map((d) => d.slice(7));
  return names.length ? ` It set ${names.join(', ')} in the browser before anyone used it.` : '';
};

/** Functional widgets (vendor.verify) that load without consent: neither pass nor fail, the controller decides. */
function verifyWidgets(evaluated: PageObservation[], state: 'none' | 'reject', key: string, label: string): Finding[] {
  const seen = new Map<string, { vendor: Vendor; pages: Set<string>; details: Set<string> }>();
  const add = (v: Vendor, path: string, detail: string) => {
    if (!seen.has(v.id)) seen.set(v.id, { vendor: v, pages: new Set(), details: new Set() });
    const s = seen.get(v.id)!; s.pages.add(path); s.details.add(detail);
  };
  for (const p of evaluated) {
    const st = stateOf(p, state)!;
    for (const r of st.requests) {
      const v = vendorForUrl(r.url);
      if (!v?.verify) continue;
      try { add(v, p.path, `requests to ${new URL(r.url).hostname}`); } catch { /* unparseable URL */ }
    }
    for (const name of [...st.cookies.map((c) => c.name), ...st.storageKeys]) {
      const v = vendorForName(name);
      if (v?.verify) add(v, p.path, `stored ${name}`);
    }
  }
  return [...seen].map(([id, s]) => finding({
    scope: 'Consent', checkKey: `${key}.verify.${id}`, status: 'manual', priority: 'medium',
    title: `Verify ${s.vendor.name}: it loads ${label}`,
    explanation: `${s.vendor.name} loaded ${label} on ${[...s.pages].join(', ')}.${stored(s.details)} ${s.vendor.verify} Whether it needs consent depends on its configuration; this is assessed by the controller.`,
    fix: `Check what ${s.vendor.name} stores and sends before the visitor uses it. If it is not strictly necessary, load it only after consent, or only when the visitor opens it.`,
    typicalOwner: 'legal', evidence: { pages: [...s.pages], details: [...s.details] },
  }));
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

/** Guidance for the built-in manual items (StartForm MANUAL_ITEMS); other keys get the generic text. */
const MANUAL_GUIDE: Record<string, { explanation: string; fix: string; owner: Finding['typicalOwner'] }> = {
  reject_equal: {
    explanation: 'Refusing must be as easy as accepting: a "Reject all" button on the first layer of the banner, with the same prominence as "Accept all", and no categories ticked in advance.',
    fix: 'Open the site in an incognito window and compare the two buttons (placement, size, colour, number of clicks). Open the settings layer and check that only necessary cookies are on.',
    owner: 'cmp',
  },
  privacy_policy: {
    explanation: 'The privacy or cookie policy should name Google (and other vendors) as recipients, describe the transfer to the US under the EU–US Data Privacy Framework, and tell visitors how to withdraw consent.',
    fix: 'Read the policy linked from the banner. Check that each tool found in this report is listed with its purpose, that the US transfer is described, and that there is a way to reopen the cookie settings (for example a footer link).',
    owner: 'legal',
  },
  consent_mode_decision: {
    explanation: 'Consent Mode basic blocks Google tags until consent; advanced lets them send cookieless pings (IP address, user agent, page URL) before consent. Which one the site uses is a decision for the controller, ideally together with the DPO.',
    fix: 'Record the decision and the reasoning (for example in the record of processing activities), and make sure the setup matches it: this report shows whether Google is contacted before the choice.',
    owner: 'legal',
  },
};

function manualItems({ mode, policy }: AssessInput): Finding[] {
  if (mode !== 'policy' || !policy) return [];
  return policy.manualItems.map((item) => {
    const g = MANUAL_GUIDE[item.key];
    return finding({
      scope: 'Manual', checkKey: `manual.${item.key}`, status: 'manual', priority: 'medium', title: item.label,
      explanation: g?.explanation ?? 'This cannot be verified from outside the site. Check it in the relevant admin tool and mark it as verified.',
      fix: g?.fix ?? '', typicalOwner: g?.owner ?? 'marketing',
    });
  });
}

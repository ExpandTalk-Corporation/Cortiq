import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assess } from '../../supabase/functions/_shared/tracking-check/assess/index.ts';
import { page, site, st, req, POLICY } from './tracking-check-fixtures.mjs';

const DENIED = { kind: 'default', params: { ad_storage: 'denied', analytics_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' } };
const GA = 'https://www.googletagmanager.com/gtag/js?id=G-6J9DFZLXNL';
const GA_HIT = 'https://region1.google-analytics.com/g/collect?v=2&tid=G-6J9DFZLXNL&gcs=G100';
const ADS = 'https://www.googletagmanager.com/gtag/js?id=AW-18424645060';
const ADS_HIT = 'https://www.google.com/pagead/1p-conversion/18424645060/?gcs=G100';
const GTM = 'https://www.googletagmanager.com/gtm.js?id=GTM-ABC123';
const EXT = 'https://cdn.extellio.com/tracker.js';
const policyRun = (states, policy = POLICY) => assess({ mode: 'policy', baseline: null, policy, target: site('target', [page('/', { states })]) });
const compareRun = (states) => assess({ mode: 'comparison', baseline: site('baseline', [page('/')]), policy: null, target: site('target', [page('/', { states })]) });
const byKey = (findings, key) => findings.filter((f) => f.checkKey === key);
const granular = [st('analytics_only', { requests: [req(GA)] }), st('marketing_only', { requests: [req(ADS)] })];

test('Pretec case: nothing to Google after reject passes; Extellio cookieless pings are a factual warning', () => {
  const findings = policyRun([
    st('none', { consentCommands: [DENIED] }),
    st('reject', { requests: [req(EXT), req('https://cdn.extellio.com/ping?id=1')] }),
    st('accept', { requests: [req(GA), req(ADS)], cookies: [{ name: '_ga', domain: '.pretec.se' }] }),
    ...granular,
  ]);
  const [ext] = byKey(findings, 'consent.after_reject.cookieless.extellio');
  assert.equal(ext.status, 'warning');
  assert.match(ext.explanation, /LEK 9 kap\. 28 §/);
  assert.match(ext.explanation, /assessed by the controller/);
  assert.equal(byKey(findings, 'consent.before_choice')[0].status, 'pass');
  assert.equal(byKey(findings, 'consent.defaults')[0].status, 'pass');
  assert.equal(byKey(findings, 'consent.category')[0].status, 'pass');
  assert.equal(byKey(findings, 'consent.after_reject').length, 0, 'no combined pass while a warning exists');
  const [commitment] = byKey(findings, 'consent.after_reject.google_commitment');
  assert.equal(commitment.status, 'pass', 'the Google commitment is reported on its own line, independent of the Extellio warning');
  assert.match(commitment.explanation, /no requests to Google/);
});

test('strict policy: a Google hit after reject never gets a separate "nothing sent to Google" pass', () => {
  const states = [st('none', { consentCommands: [DENIED] }), st('reject', { requests: [req(GA_HIT)] }), st('accept'), ...granular];
  const findings = policyRun(states);
  assert.equal(byKey(findings, 'consent.after_reject.ga4')[0].status, 'fail');
  assert.equal(byKey(findings, 'consent.after_reject.google_commitment').length, 0, 'the Google fail finding already covers it');
});

test('an analytics tool that stores cookies after reject fails', () => {
  const findings = compareRun([st('none'), st('reject', { requests: [req(GA_HIT)], cookies: [{ name: '_ga', domain: '.new.example' }] }), st('accept')]);
  const [f] = byKey(findings, 'consent.after_reject.ga4');
  assert.equal(f.status, 'fail');
  assert.match(f.explanation, /_ga/);
});

test('cookieless Google pings after reject: warning in comparison, fail under a strict policy', () => {
  const states = [st('none', { consentCommands: [DENIED] }), st('reject', { requests: [req(GA_HIT)] }), st('accept'), ...granular];
  assert.equal(byKey(compareRun(states.slice(0, 3)), 'consent.after_reject.cookieless.ga4')[0].status, 'warning');
  assert.equal(byKey(policyRun(states), 'consent.after_reject.ga4')[0].status, 'fail');
});

test('GTM before choice: ignored in comparison, fail under a strict Google policy', () => {
  const states = [st('none', { requests: [req(GTM)], consentCommands: [DENIED] }), st('reject'), st('accept')];
  assert.equal(byKey(compareRun(states), 'consent.before_choice')[0].status, 'pass');
  assert.equal(byKey(policyRun([...states, ...granular]), 'consent.before_choice.gtm')[0].status, 'fail');
});

test('Paligo case: B2B identification tags fail before choice; functional widgets are "verify", never pass/fail', () => {
  const findings = compareRun([
    st('none', { consentCommands: [DENIED], requests: [req('https://sc.lfeeder.com/lftracker_v1_x.js'), req('https://js.chilipiper.com/marketing.js'), req('https://launcher.1mind.com/deployment-1')], cookies: [{ name: '_lfa', domain: '.paligo.net' }] }),
    st('reject'), st('accept'),
  ]);
  assert.equal(byKey(findings, 'consent.before_choice.leadfeeder')[0].status, 'fail');
  for (const id of ['chilipiper', '1mind']) {
    const [f] = byKey(findings, `consent.before_choice.verify.${id}`);
    assert.equal(f.status, 'manual', id);
    assert.match(f.explanation, /assessed by the controller/);
  }
  const widgetsOnly = compareRun([st('none', { requests: [req('https://js.chilipiper.com/marketing.js')] }), st('reject'), st('accept')]);
  assert.equal(byKey(widgetsOnly, 'consent.before_choice')[0].status, 'pass', 'a widget alone does not hide the combined pass');
  assert.equal(byKey(widgetsOnly, 'consent.before_choice.verify.chilipiper').length, 1);
});

test('Paligo case 2: Inzynk and 1mind cookies are attributed, so Inzynk is not reported as cookieless', () => {
  const findings = compareRun([
    st('none', { consentCommands: [DENIED], requests: [req('https://tags.inzynk.io/bpedxeoi/iztag.js'), req('https://launcher.1mind.com/deployment-1')],
      cookies: [{ name: 'izcid', domain: 'www.paligo.net' }, { name: 'iztid', domain: 'www.paligo.net' }, { name: 'om_user_token', domain: 'www.paligo.net' }] }),
    st('reject'), st('accept'),
  ]);
  const [inzynk] = byKey(findings, 'consent.before_choice.inzynk');
  assert.equal(inzynk.status, 'fail');
  assert.match(inzynk.explanation, /izcid, iztid/);
  assert.equal(byKey(findings, 'consent.before_choice.cookieless.inzynk').length, 0);
  const [widget] = byKey(findings, 'consent.before_choice.verify.1mind');
  assert.equal(widget.status, 'manual');
  assert.match(widget.explanation, /It set om_user_token in the browser before anyone used it\./);
});

test('a YouTube embed before choice is "verify", names its cookies, and is not an unknown third party after reject', () => {
  const yt = [req('https://www.youtube.com/embed/abc123'), req('https://i.ytimg.com/vi/abc123/hqdefault.jpg')];
  const ytCookies = [{ name: 'YSC', domain: '.youtube.com' }, { name: 'VISITOR_INFO1_LIVE', domain: '.youtube.com' }];
  const findings = policyRun([
    st('none', { consentCommands: [DENIED], requests: yt, cookies: ytCookies }),
    st('reject', { requests: [req('https://www.youtube-nocookie.com/embed/abc123')] }), st('accept'),
  ], { ...POLICY, noUnknownVendorsAfterReject: true });
  const [before] = byKey(findings, 'consent.before_choice.verify.youtube');
  assert.equal(before.status, 'manual');
  assert.match(before.explanation, /It set YSC, VISITOR_INFO1_LIVE in the browser before anyone used it\./);
  assert.match(before.explanation, /privacy-enhanced mode \(youtube-nocookie\.com\)/);
  assert.equal(byKey(findings, 'consent.after_reject.verify.youtube').length, 1);
  assert.equal(byKey(findings, 'consent.unknown_after_reject')[0].status, 'pass');
});

test('an X embed before choice is "verify" and leaves the combined pass in place', () => {
  const findings = compareRun([st('none', { requests: [req('https://platform.twitter.com/widgets.js')] }), st('reject'), st('accept')]);
  assert.equal(byKey(findings, 'consent.before_choice')[0].status, 'pass');
  const [x] = byKey(findings, 'consent.before_choice.verify.x-embed');
  assert.equal(x.status, 'manual');
  assert.match(x.explanation, /the visitor's IP address reaches X/);
  assert.match(x.fix, /only when the visitor opens it/);
});

test('reject that could not be automated is manual and never passes', () => {
  const findings = compareRun([st('none'), st('reject', { method: 'not_automated' }), st('accept')]);
  assert.equal(byKey(findings, 'consent.after_reject.manual')[0].status, 'manual');
  assert.equal(byKey(findings, 'consent.after_reject').length, 0);
});

test('Consent Mode defaults: required when Google is present, skipped otherwise', () => {
  const waits = compareRun([st('none'), st('reject'), st('accept', { requests: [req(GA)] })]);
  assert.equal(byKey(waits, 'consent.defaults')[0].status, 'warning', 'Google waits for consent: no Consent Mode is a decision');
  const withGoogle = compareRun([st('none', { requests: [req(GA)] }), st('reject'), st('accept', { requests: [req(GA)] })]);
  const [f] = byKey(withGoogle, 'consent.defaults');
  assert.equal(f.status, 'fail');
  assert.match(f.evidence.details[0], /no consent default/);
  const partial = compareRun([st('none', { consentCommands: [{ kind: 'default', params: { ad_storage: 'denied', analytics_storage: 'granted' } }] }), st('reject'), st('accept', { requests: [req(GA)] })]);
  assert.match(byKey(partial, 'consent.defaults')[0].evidence.details[0], /analytics_storage=granted, ad_user_data=missing/);
  assert.equal(byKey(compareRun([st('none'), st('reject'), st('accept')]), 'consent.defaults').length, 0);
});

test('category check: Ads with only Statistics fails; unsupported granular consent is manual', () => {
  const base = [st('none', { consentCommands: [DENIED] }), st('reject'), st('accept')];
  const wrong = policyRun([...base, st('analytics_only', { requests: [req(GA), req(ADS_HIT)] }), st('marketing_only', { requests: [req(ADS)] })]);
  assert.equal(byKey(wrong, 'consent.category.google-ads')[0].status, 'fail');
  const unsupported = policyRun([...base, st('analytics_only', { method: 'not_automated' }), st('marketing_only', { method: 'not_automated' })]);
  assert.equal(byKey(unsupported, 'consent.category.manual')[0].status, 'manual');
  assert.equal(byKey(unsupported, 'consent.category').length, 0);
});

test('unknown third parties after reject are a warning; own site and known tools are ignored', () => {
  const findings = policyRun([st('none', { consentCommands: [DENIED] }),
    st('reject', { requests: [req('https://cdn.new.example/app.js'), req('https://fonts.googleapis.com/css'), req('https://px.unknown-tracker.example/p.gif')] }),
    st('accept'), ...granular]);
  const [f] = byKey(findings, 'consent.unknown_after_reject');
  assert.equal(f.status, 'warning');
  assert.deepEqual(f.evidence.details, ['px.unknown-tracker.example (on /)']);
});

test('category check respects independent policy flags', () => {
  const base = [st('none', { consentCommands: [DENIED] }), st('reject'), st('accept')];
  const onlyAdsRequired = { ...POLICY, ga4RequiresAnalytics: false, adsRequiresMarketing: true };
  const findings = policyRun([
    ...base,
    st('analytics_only', { requests: [req(ADS_HIT)] }),  // Ads (marketing) in analytics_only → fail
    st('marketing_only', { requests: [req(GA)], method: 'not_automated' }),  // GA4 (analytics) in marketing_only, not_automated, but not checked
  ], onlyAdsRequired);
  assert.equal(byKey(findings, 'consent.category.google-ads')[0].status, 'fail');
  assert.equal(byKey(findings, 'consent.category.ga4').length, 0, 'GA4 not checked when ga4RequiresAnalytics is false');
  assert.equal(byKey(findings, 'consent.category.manual').length, 0, 'manual not emitted for unchecked states');
});

test('Enhanced Conversions: seen is a fail, not seen is manual', () => {
  const base = [st('none', { consentCommands: [DENIED] }), st('reject'), ...granular];
  assert.equal(byKey(policyRun([...base, st('accept', { enhancedConversions: true })]), 'ads.enhanced_conversions')[0].status, 'fail');
  assert.equal(byKey(policyRun([...base, st('accept')]), 'ads.enhanced_conversions')[0].status, 'manual');
});

test('policy manual items become manual findings', () => {
  const findings = policyRun([st('none', { consentCommands: [DENIED] }), st('reject'), st('accept'), ...granular],
    { ...POLICY, manualItems: [{ key: 'ga4_retention', label: 'GA4 data retention is 2 months' }] });
  const [f] = byKey(findings, 'manual.ga4_retention');
  assert.equal(f.status, 'manual');
  assert.equal(f.scope, 'Manual');
});

const NONE = st('none', { consentCommands: [DENIED] });

test('strict Google policy: any Google endpoint after reject fails; Google Fonts and reCAPTCHA are exempt', () => {
  const findings = policyRun([NONE, st('reject', { requests: [
    req('https://td.doubleclick.net/td/rul/123'), req('https://www.google.se/gen_204?x=1'),
  ] }), st('accept'), ...granular]);
  const [f] = byKey(findings, 'consent.after_reject.google');
  assert.equal(f.status, 'fail');
  assert.equal(f.priority, 'high');
  assert.deepEqual(f.evidence.details, [
    'requests to td.doubleclick.net (Google Ads)',
    'requests to www.google.se (Google Ads or GA4 audiences; the country domain follows the location of the test browser)',
  ]);
  assert.match(f.explanation, /Google Fonts and reCAPTCHA were exempted/);

  const exempt = policyRun([NONE, st('reject', { requests: [req('https://fonts.googleapis.com/css2?family=Inter'), req('https://www.google.com/recaptcha/api.js')] }), st('accept'), ...granular]);
  assert.equal(exempt.filter((x) => x.checkKey.startsWith('consent.after_reject') && x.status === 'fail').length, 0);
  const [ok] = byKey(exempt, 'consent.after_reject');
  assert.equal(ok.status, 'pass');
  assert.match(ok.explanation, /Google Fonts and reCAPTCHA were exempted/);
});

test('unknown Google endpoints are not counted outside strict mode', () => {
  const findings = compareRun([st('none'), st('reject', { requests: [req('https://td.doubleclick.net/td/rul/123')] }), st('accept')]);
  assert.equal(findings.filter((x) => x.checkKey.startsWith('consent.after_reject.')).length, 0);
});

test('policy: no banner detected anywhere means reject is manual, not silently skipped', () => {
  const findings = policyRun([NONE, st('reject', { method: 'not_needed' }), st('accept', { method: 'not_needed' }), ...granular]);
  const [m] = byKey(findings, 'consent.after_reject.manual');
  assert.equal(m.status, 'manual');
  assert.match(m.explanation, /No cookie banner was detected/);
  assert.equal(byKey(findings, 'consent.after_reject').length, 0);
  // Comparison mode keeps treating a page without a banner as nothing to reject.
  assert.equal(byKey(compareRun([st('none'), st('reject', { method: 'not_needed' }), st('accept')]), 'consent.after_reject.manual').length, 0);
});

test('Consent Mode defaults: the default without a region wins over region-specific ones', () => {
  const region = { kind: 'default', params: { region: 'US', ad_storage: 'granted', analytics_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted' } };
  const findings = compareRun([st('none', { consentCommands: [region, DENIED] }), st('reject'), st('accept', { requests: [req(GA)] })]);
  assert.equal(byKey(findings, 'consent.defaults')[0].status, 'pass');
});

test('category pass only claims the checks that ran', () => {
  const base = [NONE, st('reject'), st('accept')];
  const onlyAds = policyRun([...base, st('analytics_only'), st('marketing_only', { method: 'not_automated' })], { ...POLICY, ga4RequiresAnalytics: false });
  const [p] = byKey(onlyAds, 'consent.category');
  assert.equal(p.status, 'pass');
  assert.match(p.explanation, /only Statistics accepted/);
  assert.doesNotMatch(p.explanation + p.title, /only Marketing/);
  const onlyGa = policyRun([...base, st('analytics_only', { method: 'not_automated' }), st('marketing_only')], { ...POLICY, adsRequiresMarketing: false });
  const [q] = byKey(onlyGa, 'consent.category');
  assert.match(q.explanation, /only Marketing accepted/);
  assert.doesNotMatch(q.explanation + q.title, /only Statistics/);
});

test('category check ignores the shared gtag.js library and counts data hits', () => {
  const base = [NONE, st('reject'), st('accept')];
  const library = policyRun([...base, st('analytics_only', { requests: [req(GA), req(ADS)] }), st('marketing_only', { requests: [req(ADS)] })]);
  assert.equal(byKey(library, 'consent.category.google-ads').length, 0);
  assert.equal(byKey(library, 'consent.category')[0].status, 'pass');
  const hit = policyRun([...base, st('analytics_only', { requests: [req('https://www.google.com/pagead/1p-conversion/18424645060/?gcs=G100')] }), st('marketing_only')]);
  assert.equal(byKey(hit, 'consent.category.google-ads')[0].status, 'fail');
});

test('stored-data and unknown-third-party wording states facts, not a legal verdict', () => {
  const findings = compareRun([st('none'), st('reject', { requests: [req(GA_HIT)], cookies: [{ name: '_ga', domain: '.new.example' }] }), st('accept')]);
  const [f] = byKey(findings, 'consent.after_reject.ga4');
  assert.match(f.explanation, /may require consent under ePrivacy rules \(in Sweden: LEK 9 kap\. 28 §\); this is assessed by the controller\./);
  assert.doesNotMatch(f.explanation, /need consent before/);
  const clean = policyRun([NONE, st('reject', { requests: [req('https://cdn-cookieyes.com/x.js')] }), st('accept'), ...granular]);
  const [u] = byKey(clean, 'consent.unknown_after_reject');
  assert.equal(u.explanation, 'Every third-party request after rejection went to a tool CortIQ recognises.');
});

test('PwC case: OneTrust says no, but the Google tags never wait; findings name the cause and the CMP-specific fix', () => {
  const none = st('none', {
    requests: [req(GTM), req('https://region1.analytics.google.com/g/collect?v=2&tid=G-ZEYTM5WSW8'), req('https://stats.g.doubleclick.net/g/collect?v=2&tid=G-ZEYTM5WSW8'),
      req('https://www.google.nl/ads/ga-audiences?v=1&t=sr'), req('https://ad.doubleclick.net/activity;src=1'), req('https://c.go-mpulse.net/api/config.json')],
    cookies: [{ name: '_ga', domain: '.pwc.se' }, { name: '_ga_ZEYTM5WSW8', domain: '.pwc.se' }, { name: '_gcl_au', domain: '.pwc.se' }],
  });
  const findings = assess({ mode: 'policy', baseline: null, policy: POLICY,
    target: site('target', [page('/', { cmp: 'onetrust', states: [none, st('reject', { requests: [req(GTM)] }), st('accept'), ...granular] })]) });

  assert.equal(byKey(findings, 'consent.before_choice.google').length, 0, 'every Google endpoint is attributed to a tag');
  const [ga] = byKey(findings, 'consent.before_choice.ga4');
  assert.ok(ga.evidence.details.includes('requests to region1.analytics.google.com'));
  assert.ok(ga.evidence.details.includes('requests to stats.g.doubleclick.net'));
  assert.match(ga.explanation, /No Consent Mode default was set/);
  assert.match(ga.explanation, /After "Reject all" it sent nothing, so the cookie banner \(OneTrust\) blocks it after an active choice/);
  assert.match(ga.explanation, /LEK 9 kap\. 28 §\); this is assessed by the controller\./);
  assert.match(ga.fix, /"Require additional consent for tag to fire" and add analytics_storage/);
  assert.match(ga.fix, /OneTrustGroupsUpdated/);
  assert.match(ga.fix, /OnetrustActiveGroups/);
  assert.match(ga.fix, /fewer GA4 sessions/);
  assert.equal(ga.typicalOwner, 'gtm');

  const [ads] = byKey(findings, 'consent.before_choice.google-ads');
  assert.ok(ads.evidence.details.includes('requests to www.google.nl'));
  assert.match(ads.fix, /Conversion Linker/);
  assert.match(ads.fix, /add ad_storage/);

  const [def] = byKey(findings, 'consent.defaults');
  assert.equal(def.status, 'fail');
  assert.match(def.explanation, /No Consent Mode default was found on \//);
  assert.match(def.explanation, /set Google cookies before the visitor answered/);
  assert.match(def.explanation, /The cookie banner \(OneTrust\) loaded/);
  assert.match(def.fix, /C0002/);
  assert.match(def.fix, /gtag\('consent', 'default'/);

  const [gtm] = byKey(findings, 'consent.before_choice.gtm');
  assert.equal(gtm.typicalOwner, 'legal');
  assert.match(gtm.explanation, /decision for the controller/);
  assert.match(gtm.fix, /^Choose one:/);

  const [mpulse] = byKey(findings, 'consent.before_choice.cookieless.akamai-mpulse');
  assert.match(mpulse.fix, /injected by the Akamai CDN/);
});

test('the defaults fix follows the detected CMP, and falls back to the generic setting and the snippet', () => {
  const states = [st('none', { requests: [req(GA_HIT)] }), st('reject'), st('accept'), ...granular];
  const cky = byKey(policyRun(states), 'consent.defaults')[0];
  assert.match(cky.fix, /^In CookieYes/);
  assert.match(cky.fix, /Without a banner setting, add the default yourself/);
  const findings = assess({ mode: 'policy', baseline: null, policy: POLICY, target: site('target', [page('/', { cmp: null, states })]) });
  const [def] = byKey(findings, 'consent.defaults');
  assert.doesNotMatch(def.fix, /OneTrust|CookieYes|C0002/);
  assert.match(def.fix, /Put this first in <head>/);
  assert.match(def.explanation, /contacted Google before the visitor answered/);
});

const HS = 'https://js-eu1.hs-scripts.com/123456.js';
const HS_HIT = 'https://track-eu1.hubspot.com/__ptq.gif?k=1';
const CB = 'https://consent.cookiebot.com/uc.js';
const from = (url, initiator) => ({ ...req(url), initiator });

test('a tool in the page source is told to move out of the template or be blocked by the banner, not to use GTM consent settings', () => {
  const findings = policyRun([
    st('none', { consentCommands: [DENIED], requests: [from(HS, 'page'), req(HS_HIT, 'image')], cookies: [{ name: 'hubspotutk', domain: '.new.example' }] }),
    st('reject'), st('accept'),
  ]);
  const [hs] = byKey(findings, 'consent.before_choice.hubspot');
  assert.match(hs.fix, /in the page source/);
  assert.match(hs.fix, /consent settings in GTM do not affect it/);
  assert.match(hs.fix, /data-cookieyes="cookieyes-analytics"/);
  assert.equal(hs.typicalOwner, 'developer');
  assert.ok(hs.evidence.details.includes('script loaded from the page source'));
});

test('a tool loaded by GTM, also through its own loader, gets the GTM consent setting', () => {
  const findings = policyRun([
    st('none', { consentCommands: [DENIED], requests: [from(GTM, 'page'), from(HS, GTM), from('https://js-eu1.hs-analytics.net/analytics/1.js', HS)],
      cookies: [{ name: 'hubspotutk', domain: '.new.example' }] }),
    st('reject'), st('accept'),
  ]);
  const [hs] = byKey(findings, 'consent.before_choice.hubspot');
  assert.match(hs.fix, /loaded by Google Tag Manager/);
  assert.match(hs.fix, /Require additional consent/);
  assert.equal(hs.typicalOwner, 'gtm');
});

test('the GTM container row recommends loading GTM after consent when the banner is in the page source', () => {
  const run = (cbInitiator) => byKey(assess({ mode: 'policy', baseline: null, policy: POLICY, target: site('target', [page('/', { cmp: 'cookiebot', states: [
    st('none', { consentCommands: [DENIED], requests: [from(CB, cbInitiator), from(GTM, 'page')] }), st('reject'), st('accept'),
  ] })]) }), 'consent.before_choice.gtm')[0];
  const inPage = run('page');
  assert.match(inPage.fix, /^Recommended: load GTM only after consent\. Cookiebot loads directly in the page source/);
  assert.match(inPage.fix, /data-cookieconsent="statistics"/);
  assert.match(inPage.fix, /Alternative: Record the container request/);
  assert.match(run(GTM).fix, /The cookie banner is loaded by GTM/);
  assert.match(run(undefined).fix, /^Choose one:/);
});

test('Paligo case 3: GA4 through server-side tagging on the own domain is GA4, says so, and fails the Google commitment', () => {
  const SGTM = 'https://analytics.new.example/g/collect?v=2&tid=G-6J9DFZLXNL&gcs=G100';
  const states = [st('none', { consentCommands: [DENIED], requests: [req(SGTM)] }), st('reject', { requests: [req(SGTM)] }), st('accept'), ...granular];
  const findings = policyRun(states);
  for (const key of ['consent.before_choice.ga4', 'consent.after_reject.ga4']) {
    const [f] = byKey(findings, key);
    assert.equal(f.status, 'fail', key);
    assert.match(f.explanation, /analytics\.new\.example/);
    assert.match(f.explanation, /server-side tagging/);
  }
  assert.equal(byKey(findings, 'consent.after_reject.google_commitment').length, 0);
  assert.equal(byKey(findings, 'consent.unknown_after_reject')[0].status, 'pass', 'the own-domain GA4 endpoint is a known tool');
  const [cookieless] = byKey(compareRun(states.slice(0, 3)), 'consent.after_reject.cookieless.ga4');
  assert.match(cookieless.explanation, /server-side tagging/);
});

test('an IP lookup service before choice and after reject is "verify", not an unknown third party', () => {
  const IPIFY = 'https://api.ipify.org/?format=json';
  const findings = policyRun([st('none', { consentCommands: [DENIED], requests: [req(IPIFY, 'fetch')] }), st('reject', { requests: [req(IPIFY, 'fetch')] }), st('accept'), ...granular]);
  assert.equal(byKey(findings, 'consent.before_choice.verify.ip-lookup')[0].status, 'manual');
  assert.equal(byKey(findings, 'consent.after_reject.verify.ip-lookup')[0].status, 'manual');
  assert.equal(byKey(findings, 'consent.unknown_after_reject')[0].status, 'pass');
});

test('Paligo case 1: cookies from before the choice after "Reject all" — kept and silent is a warning, kept with requests or written again is a fail', () => {
  const findings = policyRun([
    st('none'),
    st('reject', {
      requests: [req('https://px.ads.linkedin.com/collect?pid=1')],
      cookies: [{ name: '_zitok', domain: '.new.example' }],                       // written again after "no"
      keptCookies: [{ name: 'hubspotutk', domain: '.new.example' }, { name: 'bcookie', domain: '.linkedin.com' }],
    }),
    st('accept'),
  ]);
  const [hs] = byKey(findings, 'consent.after_reject.kept.hubspot');
  assert.equal(hs.status, 'warning');
  assert.match(hs.explanation, /hubspotutk was set before the visitor chose/);
  assert.match(hs.explanation, /before the choice/);
  assert.equal(byKey(findings, 'consent.after_reject.hubspot').length, 0);

  const [li] = byKey(findings, 'consent.after_reject.linkedin');
  assert.equal(li.status, 'fail');
  assert.match(li.title, /keeps tracking with cookies from before the choice/);
  assert.match(li.explanation, /bcookie/);
  assert.ok(li.evidence.details.includes('kept bcookie from before the choice'));
  assert.match(li.fix, /delete bcookie/);

  const [zi] = byKey(findings, 'consent.after_reject.zoominfo');
  assert.equal(zi.status, 'fail');
  assert.match(zi.title, /stores data on the device/);
});

test('kept cookies only count after "Reject all"', () => {
  const findings = policyRun([st('none', { keptCookies: [{ name: 'hubspotutk', domain: '.new.example' }] }), st('reject'), st('accept')]);
  assert.equal(findings.filter((f) => f.checkKey.endsWith('.hubspot')).length, 0);
});

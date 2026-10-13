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

test('reject that could not be automated is manual and never passes', () => {
  const findings = compareRun([st('none'), st('reject', { method: 'not_automated' }), st('accept')]);
  assert.equal(byKey(findings, 'consent.after_reject.manual')[0].status, 'manual');
  assert.equal(byKey(findings, 'consent.after_reject').length, 0);
});

test('Consent Mode defaults: required when Google is present, skipped otherwise', () => {
  const withGoogle = compareRun([st('none'), st('reject'), st('accept', { requests: [req(GA)] })]);
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
    req('https://stats.g.doubleclick.net/g/collect?v=2&tid=G-1'), req('https://www.google.se/pagead/1p-user-list/123/?random=1'),
  ] }), st('accept'), ...granular]);
  const [f] = byKey(findings, 'consent.after_reject.google');
  assert.equal(f.status, 'fail');
  assert.equal(f.priority, 'high');
  assert.deepEqual(f.evidence.details, ['requests to stats.g.doubleclick.net', 'requests to www.google.se']);
  assert.match(f.explanation, /Google Fonts and reCAPTCHA were exempted/);

  const exempt = policyRun([NONE, st('reject', { requests: [req('https://fonts.googleapis.com/css2?family=Inter'), req('https://www.google.com/recaptcha/api.js')] }), st('accept'), ...granular]);
  assert.equal(exempt.filter((x) => x.checkKey.startsWith('consent.after_reject') && x.status === 'fail').length, 0);
  const [ok] = byKey(exempt, 'consent.after_reject');
  assert.equal(ok.status, 'pass');
  assert.match(ok.explanation, /Google Fonts and reCAPTCHA were exempted/);
});

test('unknown Google endpoints are not counted outside strict mode', () => {
  const findings = compareRun([st('none'), st('reject', { requests: [req('https://stats.g.doubleclick.net/g/collect?v=2')] }), st('accept')]);
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

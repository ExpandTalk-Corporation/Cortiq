import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assess } from '../../supabase/functions/_shared/tracking-check/assess/index.ts';
import { page, site, st, req, POLICY } from './tracking-check-fixtures.mjs';

const DENIED = { kind: 'default', params: { ad_storage: 'denied', analytics_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' } };
const GA = 'https://www.googletagmanager.com/gtag/js?id=G-6J9DFZLXNL';
const GA_HIT = 'https://region1.google-analytics.com/g/collect?v=2&tid=G-6J9DFZLXNL&gcs=G100';
const ADS = 'https://www.googletagmanager.com/gtag/js?id=AW-18424645060';
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
  assert.equal(byKey(findings, 'consent.after_reject').length, 0, 'no pass while a warning exists');
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
  const wrong = policyRun([...base, st('analytics_only', { requests: [req(GA), req(ADS)] }), st('marketing_only', { requests: [req(ADS)] })]);
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

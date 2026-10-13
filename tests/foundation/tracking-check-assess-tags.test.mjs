import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assess } from '../../supabase/functions/_shared/tracking-check/assess/index.ts';
import { detectForms } from '../../supabase/functions/_shared/form-detection.ts';
import { fetchOk, page, site, st, req, POLICY } from './tracking-check-fixtures.mjs';

const HS = 'https://js.hs-scripts.com/7117856.js';
const GA = 'https://www.googletagmanager.com/gtag/js?id=G-6J9DFZLXNL';
const acceptWith = (...urls) => [st('none'), st('reject'), st('accept', { requests: urls.map((u) => req(u)) })];
const compare = (basePages, targetPages) => assess({ mode: 'comparison', baseline: site('baseline', basePages), target: site('target', targetPages), policy: null });
const byKey = (findings, key) => findings.filter((f) => f.checkKey === key);

test('Paligo case: HubSpot missing on the new site, and its CSP would block it', () => {
  const csp = { 'script-src': ["'self'", 'js.hsforms.net'], 'connect-src': ["'self'", 'forms.hsforms.com'] };
  const findings = compare(
    [page('/pricing/', { states: acceptWith(HS, GA) })],
    [page('/pricing/', { states: acceptWith(GA), fetch: fetchOk('/pricing/', { csp }) })],
  );
  const [missing] = byKey(findings, 'tags.missing.hubspot');
  assert.equal(missing.status, 'fail');
  assert.equal(missing.priority, 'high');
  assert.match(missing.explanation, /Original Source/);
  assert.match(missing.fix, /script-src: add js\.hs-scripts\.com/);
  assert.equal(byKey(findings, 'tags.missing.ga4').length, 0);
});

test('tools only on the new site are warnings; all present gives a pass', () => {
  const findings = compare([page('/', { states: acceptWith(GA) })], [page('/', { states: acceptWith(GA, HS) })]);
  assert.equal(byKey(findings, 'tags.new.hubspot')[0].status, 'warning');
  assert.equal(byKey(findings, 'tags.present')[0].status, 'pass');
});

test('missing consented tags are manual, not fail, when accept could not be automated', () => {
  const notAutomated = [st('none'), st('reject', { method: 'not_automated' }), st('accept', { method: 'not_automated' })];
  const findings = compare([page('/', { states: acceptWith(HS) })], [page('/', { states: notAutomated })]);
  assert.equal(byKey(findings, 'tags.missing.hubspot')[0].status, 'manual');
});

test('a different ID for the same tool is a fail', () => {
  const findings = compare([page('/', { states: acceptWith(GA) })], [page('/', { states: acceptWith('https://www.googletagmanager.com/gtag/js?id=G-OTHER') })]);
  const [ids] = byKey(findings, 'tags.ids.ga4');
  assert.equal(ids.status, 'fail');
  assert.match(ids.evidence.details[0], /G-6J9DFZLXNL/);
});

test('policy expected IDs: a missing ID fails, all found passes', () => {
  const run = (expectedIds) => assess({ mode: 'policy', baseline: null, policy: { ...POLICY, expectedIds },
    target: site('target', [page('/', { states: acceptWith(GA) })]) });
  const partial = run(['G-6J9DFZLXNL', 'AW-18424645060']);
  assert.equal(byKey(partial, 'tags.expected.AW-18424645060')[0].status, 'fail');
  assert.equal(byKey(partial, 'tags.expected').length, 0, 'no pass while an ID is missing');
  assert.equal(byKey(run(['g-6j9dfzlxnl']), 'tags.expected')[0].status, 'pass');
});

test('CSP violations name the vendor and the exact directive to extend', () => {
  const states = [st('none'), st('reject'), st('accept', { cspViolations: [{ blockedUrl: HS, directive: 'script-src-elem' }, { blockedUrl: 'https://cdn.unknown.example/x.js', directive: 'script-src' }] })];
  const findings = assess({ mode: 'policy', baseline: null, policy: POLICY, target: site('target', [page('/pricing/', { states })]) });
  const [blocked] = byKey(findings, 'csp.blocked.hubspot');
  assert.equal(blocked.status, 'fail');
  assert.match(blocked.fix, /script-src: add .*js\.hs-scripts\.com/);
  assert.equal(byKey(findings, 'csp.blocked.host.cdn.unknown.example')[0].status, 'warning');
});

test('no CSP violations gives a pass', () => {
  const findings = assess({ mode: 'policy', baseline: null, policy: POLICY, target: site('target', [page('/')]) });
  assert.equal(byKey(findings, 'csp.ok')[0].status, 'pass');
});

test('forms from the current site missing on the new site fail', () => {
  const guid = '11111111-2222-3333-4444-555555555555';
  const findings = compare(
    [page('/get-started/', { forms: [{ provider: 'hubspot', formId: guid, method: 'data_form_id' }] })],
    [page('/get-started/', { forms: [] })],
  );
  const [f] = byKey(findings, 'forms.missing');
  assert.equal(f.status, 'fail');
  assert.match(f.evidence.details[0], new RegExp(guid));
});

test('detectForms finds HubSpot (attribute, hs_context, embed script) and Gravity Forms', () => {
  const g1 = 'aaaaaaaa-1111-2222-3333-444444444444', g2 = 'bbbbbbbb-1111-2222-3333-444444444444', g3 = 'cccccccc-1111-2222-3333-444444444444';
  const html = `<form data-form-id="${g1}"></form>
    <input name="hs_context" value="${encodeURIComponent(JSON.stringify({ formGuid: g2 }))}">
    <script>hbspt.forms.create({ portalId: "7117856", formId: "${g3}" });</script>
    <div class="gform_wrapper" id="gform_wrapper_4"></div><form data-form-id="${g1}"></form>`;
  assert.deepEqual(detectForms(html).map((f) => `${f.provider}:${f.formId}:${f.method}`).sort(), [
    `gravity_forms:4:gravity_class`, `hubspot:${g1}:data_form_id`, `hubspot:${g2}:hs_context`, `hubspot:${g3}:embed_script`,
  ].sort());
});

test('target behind a challenge: no missing tags or forms are reported (coverage covers it)', () => {
  const guid = '11111111-2222-3333-4444-555555555555';
  const GTM = 'https://www.googletagmanager.com/gtm.js?id=GTM-ABC123';
  const CKY = 'https://cdn-cookieyes.com/client_data/abc/script.js';
  const findings = compare(
    [page('/', { states: acceptWith(GTM, CKY, HS), forms: [{ provider: 'hubspot', formId: guid, method: 'data_form_id' }] })],
    [page('/', { fetch: fetchOk('/', { challenge: true, finalStatus: 403 }), states: [st('none', { challenge: true, status: 403 })] })],
  );
  assert.equal(findings.filter((f) => f.checkKey.startsWith('tags.') || f.checkKey.startsWith('forms.')).length, 0,
    findings.map((f) => f.checkKey).join());
  assert.equal(byKey(findings, 'coverage.untestable')[0].status, 'untestable');
});

test('a form on a page whose target counterpart is untestable is not reported missing', () => {
  const guid = '11111111-2222-3333-4444-555555555555';
  const findings = compare(
    [page('/', { states: acceptWith(GA) }), page('/contact/', { forms: [{ provider: 'hubspot', formId: guid, method: 'data_form_id' }] })],
    [page('/', { states: acceptWith(GA) }), page('/contact/', { failed: 'Browserless 500' })],
  );
  assert.equal(byKey(findings, 'forms.missing').length, 0);
  assert.equal(byKey(findings, 'tags.present')[0].status, 'pass');
});

test('CSP is only partly verified when consented tags were not observed', () => {
  const states = [st('none'), st('reject', { method: 'not_automated' }), st('accept', { method: 'not_automated' })];
  const findings = assess({ mode: 'policy', baseline: null, policy: POLICY, target: site('target', [page('/', { states })]) });
  const [f] = byKey(findings, 'csp.ok');
  assert.equal(f.status, 'manual');
  assert.match(f.explanation, /Consented tags were not observed, so CSP could only be checked for tags that load without consent/);
});

test('a malformed blocked URL in a CSP report is skipped', () => {
  const states = [st('none'), st('reject'), st('accept', { cspViolations: [{ blockedUrl: 'https://[broken', directive: 'script-src' }] })];
  const findings = assess({ mode: 'policy', baseline: null, policy: POLICY, target: site('target', [page('/', { states })]) });
  assert.equal(byKey(findings, 'csp.ok')[0].status, 'pass');
});

test('a CMP change is one low warning; Google Fonts and reCAPTCHA never block go-live', () => {
  const CKY = 'https://cdn-cookieyes.com/client_data/abc/script.js';
  const CB = 'https://consent.cookiebot.com/uc.js';
  const FONTS = 'https://fonts.googleapis.com/css2?family=Inter';
  const CAPTCHA = 'https://www.google.com/recaptcha/api.js';
  const findings = compare([page('/', { states: acceptWith(GA, CKY, FONTS, CAPTCHA) })], [page('/', { states: acceptWith(GA, CB) })]);
  const [changed] = byKey(findings, 'tags.cmp_changed');
  assert.equal(changed.status, 'warning');
  assert.equal(changed.priority, 'low');
  assert.match(changed.title, /CookieYes.*Cookiebot/);
  assert.deepEqual(findings.filter((f) => /^tags\.(missing|new)\./.test(f.checkKey)).map((f) => f.checkKey), []);
  const [present] = byKey(findings, 'tags.present');
  assert.equal(present.title, 'All 1 tool from the current site load on the new site');
  assert.equal(present.explanation, 'Google Analytics 4');
});

test('a CMP that disappears without a replacement is still missing', () => {
  const CKY = 'https://cdn-cookieyes.com/client_data/abc/script.js';
  const findings = compare([page('/', { states: acceptWith(GA, CKY) })], [page('/', { states: acceptWith(GA) })]);
  assert.equal(byKey(findings, 'tags.missing.cookieyes')[0].status, 'fail');
  assert.equal(byKey(findings, 'tags.cmp_changed').length, 0);
});

test('detectForms lowercases HubSpot GUIDs from hs_context like the other methods', () => {
  const guid = 'AAAAAAAA-1111-2222-3333-444444444444';
  const html = `<input name="hs_context" value="${encodeURIComponent(JSON.stringify({ formGuid: guid }))}"><form data-form-id="${guid}"></form>`;
  assert.deepEqual(detectForms(html).map((f) => `${f.formId}:${f.method}`), [`${guid.toLowerCase()}:hs_context`]);
});

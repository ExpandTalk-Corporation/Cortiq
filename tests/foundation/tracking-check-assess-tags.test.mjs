import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assess } from '../../supabase/functions/_shared/tracking-check/assess/index.ts';
import { cspIssues, hubSpotListenerTag } from '../../supabase/functions/_shared/tracking-check/assess/tags.ts';
import { parseCsp } from '../../supabase/functions/_shared/tracking-check/fetch-probe.ts';
import { detectForms, detectHubSpotFormEmbed } from '../../supabase/functions/_shared/form-detection.ts';
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

test('a blocked reCAPTCHA gets the full reCAPTCHA CSP, minus what is already allowed', () => {
  const csp = { 'script-src': ["'self'", 'https://www.googletagmanager.com'], 'frame-src': ["'self'"] };
  const states = [st('none'), st('reject'), st('accept', { cspViolations: [{ blockedUrl: 'https://www.google.com/recaptcha/api.js', directive: 'script-src-elem' }] })];
  const findings = assess({ mode: 'policy', baseline: null, policy: POLICY, target: site('target', [page('/blog/', { states, fetch: fetchOk('/blog/', { csp }) })]) });
  const [blocked] = byKey(findings, 'csp.blocked.recaptcha');
  assert.match(blocked.explanation, /^1 request to Google reCAPTCHA was blocked/);
  assert.match(blocked.fix, /script-src: add www\.google\.com www\.gstatic\.com/);
  assert.match(blocked.fix, /frame-src: add www\.google\.com recaptcha\.google\.com/);
  assert.deepEqual(blocked.evidence.details, ['script-src blocked https://www.google.com/recaptcha/api.js (After "Accept all")']);
});

test('a non-necessary embed blocked before consent: fix offers removal or consent-gating, not just "allow it"', () => {
  const libsyn = [{ blockedUrl: 'https://html5-player.libsyn.com/embed/episode/id/10087019/', directive: 'frame-src' }];
  const states = [st('none', { cspViolations: libsyn }), st('reject', { cspViolations: libsyn }), st('accept', { cspViolations: libsyn })];
  const findings = assess({ mode: 'policy', baseline: null, policy: POLICY, target: site('target', [page('/blog/', { states })]) });
  const [blocked] = byKey(findings, 'csp.blocked.libsyn');
  assert.match(blocked.fix, /^Libsyn podcast player is not strictly necessary/);
  assert.match(blocked.fix, /replace it with a plain link/);
  assert.match(blocked.fix, /frame-src: add html5-player\.libsyn\.com/);
});

test('a tag blocked only after consent keeps the plain CSP fix', () => {
  const states = [st('none'), st('reject'), st('accept', { cspViolations: [{ blockedUrl: HS, directive: 'script-src-elem' }] })];
  const findings = assess({ mode: 'policy', baseline: null, policy: POLICY, target: site('target', [page('/', { states })]) });
  assert.match(byKey(findings, 'csp.blocked.hubspot')[0].fix, /^Extend the Content-Security-Policy:/);
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

test('detectHubSpotFormEmbed tells the legacy iframe embed from the v4 frame', () => {
  const legacy = `<script src="//js.hsforms.net/forms/embed/v2.js"></script><script>hbspt.forms.create({ portalId: "1", formId: "x" });</script>
    <div class="hbspt-form"><iframe id="hs-form-iframe-0" class="hs-form-iframe" src="about:blank"></iframe></div>`;
  assert.deepEqual(detectHubSpotFormEmbed(legacy), { legacy: true, v4: false, framed: true });
  assert.deepEqual(detectHubSpotFormEmbed('<div class="hs-form-frame" data-region="eu1" data-form-id="x" data-portal-id="1"></div>'),
    { legacy: false, v4: true, framed: true });
  // Legacy script that rendered a raw <form> (e.g. css: "" / raw HTML option): not framed.
  assert.deepEqual(detectHubSpotFormEmbed('<script>hbspt.forms.create({})</script><form class="hs-form"></form>'),
    { legacy: true, v4: false, framed: false });
  assert.equal(detectHubSpotFormEmbed('<form action="/contact"></form><style>.hs-form-frame{width:100%}</style>'), null);
});

const HS_FRAMED = { legacy: true, v4: false, framed: true };
const ADS = 'https://www.googleadservices.com/pagead/conversion/123456789/?label=abc';

test('HubSpot forms in an iframe give a manual finding with the listener fix', () => {
  const findings = assess({ mode: 'policy', baseline: null, policy: POLICY, target: site('target', [page('/free-trial/', { hubspotForms: HS_FRAMED })]) });
  const [f] = byKey(findings, 'forms.hubspot_iframe');
  assert.equal(f.status, 'manual');
  assert.equal(f.typicalOwner, 'gtm');
  assert.deepEqual(f.evidence.pages, ['/free-trial/']);
  assert.match(f.fix, /hsFormCallback/);
  assert.doesNotMatch(f.fix, /hs-form-event/);
  assert.doesNotMatch(f.explanation, /Enhanced conversions \(Google Ads\)/);
});

test('with Google Ads on the site the finding separates Enhanced measurement from Enhanced conversions', () => {
  const states = [st('none'), st('reject'), st('accept', { requests: [req(ADS, 'image')] })];
  const findings = assess({ mode: 'comparison', baseline: site('baseline', [page('/')]), policy: null,
    target: site('target', [page('/', { states, hubspotForms: { legacy: false, v4: true, framed: true } })]) });
  const [f] = byKey(findings, 'forms.hubspot_iframe');
  assert.match(f.explanation, /Enhanced conversions \(Google Ads\) are separate/);
  assert.match(f.fix, /hs-form-event:on-submission:success/);
  assert.match(f.fix, /user-provided data/);
});

test('HubSpot forms rendered without an iframe give no iframe finding', () => {
  const findings = assess({ mode: 'policy', baseline: null, policy: POLICY,
    target: site('target', [page('/', { hubspotForms: { legacy: true, v4: false, framed: false } }), page('/a/')]) });
  assert.equal(byKey(findings, 'forms.hubspot_iframe').length, 0);
});

// Runs the GTM tag's script against a fake window and returns the dataLayer and the registered listeners.
function runListenerTag(tag, extraWindow = {}) {
  const listeners = {};
  const window = { addEventListener: (type, fn) => { listeners[type] = fn; }, ...extraWindow };
  const body = tag.replace(/^<script>\n/, '').replace(/\n<\/script>$/, '');
  new Function('window', body)(window);
  return { window, listeners };
}

test('the HubSpot listener tag only contains the embeds seen and is valid script', () => {
  const legacyOnly = hubSpotListenerTag(true, false);
  assert.match(legacyOnly, /^<script>\n[\s\S]*\n<\/script>$/);
  assert.match(legacyOnly, /hsFormCallback/);
  assert.doesNotMatch(legacyOnly, /hs-form-event/);
  assert.doesNotMatch(hubSpotListenerTag(false, true), /hsFormCallback/);
  const { listeners } = runListenerTag(hubSpotListenerTag(true, true));
  assert.deepEqual(Object.keys(listeners).sort(), ['hs-form-event:on-submission:success', 'message']);
});

test('the legacy listener pushes hubspot_form_submit with the email captured before submit', () => {
  const { window, listeners } = runListenerTag(hubSpotListenerTag(true, false));
  listeners.message({ data: { type: 'other' } });
  listeners.message({ data: { type: 'hsFormCallback', eventName: 'onBeforeFormSubmit', id: 'f1', data: [{ name: 'email', value: 'a@b.se' }] } });
  listeners.message({ data: { type: 'hsFormCallback', eventName: 'onFormSubmitted', id: 'f1', data: { redirectUrl: '' } } });
  assert.deepEqual(window.dataLayer, [
    { event: 'hubspot_form_submit', hs_form_id: 'f1', hs_email: 'a@b.se' },
    { hs_email: undefined },
  ]);
});

test('the v4 listener reads the email field from HubSpotFormsV4', async () => {
  const form = { getFormFieldValues: () => Promise.resolve([{ name: '0-1/firstname', value: 'A' }, { name: '0-1/email', value: 'a@b.se' }]) };
  const { window, listeners } = runListenerTag(hubSpotListenerTag(false, true), { HubSpotFormsV4: { getFormFromEvent: () => form } });
  listeners['hs-form-event:on-submission:success']({ detail: { formId: 'f2' } });
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(window.dataLayer[0], { event: 'hubspot_form_submit', hs_form_id: 'f2', hs_email: 'a@b.se' });
});

const policyRun = (pages) => assess({ mode: 'policy', baseline: null, policy: POLICY, target: site('target', pages) });
const withCsp = (path, csp, cspReportOnly = null) => page(path, { fetch: fetchOk(path, { csp: parseCsp(csp), cspReportOnly: parseCsp(cspReportOnly) }) });

test('CSP quality: no policy, report-only and no script restriction are separate warnings', () => {
  assert.deepEqual(cspIssues(null, null), ['missing']);
  assert.deepEqual(cspIssues(null, parseCsp("script-src 'self'")), ['report_only']);
  assert.deepEqual(cspIssues(parseCsp("frame-ancestors 'self'; upgrade-insecure-requests"), null), ['script_src.missing']);
  const [missing] = byKey(policyRun([page('/'), page('/about/')]), 'csp.missing');
  assert.equal(missing.status, 'warning');
  assert.equal(missing.priority, 'low');
  assert.deepEqual(missing.evidence.pages, ['/', '/about/']);
});

test('CSP quality: wildcards, unsafe-inline and unsafe-eval in the effective script-src', () => {
  assert.deepEqual(cspIssues(parseCsp("default-src 'self' https: 'unsafe-inline' 'unsafe-eval'"), null),
    ['script_src.wildcard', 'script_src.unsafe_inline', 'script_src.unsafe_eval']);
  assert.deepEqual(cspIssues(parseCsp("script-src 'self' data:"), null), ['script_src.wildcard']);
  // script-src-elem overrides script-src for script elements.
  assert.deepEqual(cspIssues(parseCsp("script-src *; script-src-elem 'self'"), null), []);
});

test('CSP quality: a nonce disables unsafe-inline; strict-dynamic with a nonce also disables host wildcards', () => {
  assert.deepEqual(cspIssues(parseCsp("script-src 'nonce-abc' 'unsafe-inline' https:"), null), ['script_src.wildcard']);
  assert.deepEqual(cspIssues(parseCsp("script-src 'nonce-abc' 'strict-dynamic' 'unsafe-inline' https:"), null), []);
  assert.deepEqual(cspIssues(parseCsp("script-src 'sha384-xyz' 'strict-dynamic' *"), null), []);
  // strict-dynamic without a nonce or hash does not neutralise anything.
  assert.deepEqual(cspIssues(parseCsp("script-src 'strict-dynamic' 'unsafe-inline' *"), null), ['script_src.wildcard', 'script_src.unsafe_inline']);
});

test('CSP quality: a strict policy passes; evidence shows the script-src of affected pages', () => {
  const strict = "script-src 'self' https://www.googletagmanager.com; connect-src 'self'";
  assert.equal(byKey(policyRun([withCsp('/', strict)]), 'csp.policy.ok')[0].status, 'pass');
  const findings = policyRun([withCsp('/', strict), withCsp('/blog/', "script-src 'self' 'unsafe-inline'")]);
  assert.equal(byKey(findings, 'csp.policy.ok').length, 0);
  const [inline] = byKey(findings, 'csp.script_src.unsafe_inline');
  assert.deepEqual(inline.evidence.pages, ['/blog/']);
  assert.deepEqual(inline.evidence.details, ["script-src: 'self' 'unsafe-inline'"]);
});

test('CSP quality: pages that could not be fetched, legacy URLs and the baseline are not assessed', () => {
  const broken = page('/', { fetch: fetchOk('/', { error: 'timeout' }) });
  assert.equal(policyRun([broken]).filter((f) => f.checkKey.startsWith('csp.') && f.checkKey !== 'csp.ok').length, 0);
  const findings = compare([page('/')], [withCsp('/', "script-src 'self'")]);
  assert.equal(byKey(findings, 'csp.missing').length, 0);
  assert.equal(byKey(findings, 'csp.policy.ok')[0].status, 'pass');
});

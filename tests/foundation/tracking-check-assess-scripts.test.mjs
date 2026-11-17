import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assess } from '../../supabase/functions/_shared/tracking-check/assess/index.ts';
import { assessScripts, scriptInventory } from '../../supabase/functions/_shared/tracking-check/assess/scripts.ts';
import { sriPossibleFor } from '../../supabase/functions/_shared/tracking-vendors.ts';
import { page, site, st, POLICY } from './tracking-check-fixtures.mjs';

const JQ = 'https://code.jquery.com/jquery-3.7.1.min.js';
const GTM = 'https://www.googletagmanager.com/gtm.js?id=GTM-ABC123';
const GA = 'https://www.googletagmanager.com/gtag/js?id=G-TEST123';
const OPTI = 'https://cdn.optimizely.com/js/123456.js';
const CDNJS = 'https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.21/lodash.min.js';
const OWN = 'https://new.example/assets/app.js';
const SRI = 'sha384-abcdefghijklmnopqrstuvwxyz0123456789';

const req = (url, initiator) => ({ url, type: 'script', ...(initiator ? { initiator } : {}) });
const tag = (url, extra = {}) => ({ url, integrity: null, crossorigin: null, ...extra });

/** A state where `scripts` load with the given initiators ({url: initiator}) and tags. */
const loaded = (state, scripts, extra = {}) => st(state, {
  requests: scripts.map(([url, init]) => req(url, init)),
  scripts: scripts.map(([url, , t]) => tag(url, t)),
  ...extra,
});

const run = (pages) => assess({ mode: 'policy', baseline: null, target: site('target', pages), policy: POLICY });
const scriptFindings = (pages) => run(pages).filter((f) => f.scope === 'Scripts');
const byKey = (findings, key) => findings.filter((f) => f.checkKey === key);

const MIXED = [
  [JQ, 'page'],
  [GTM, 'page'],
  [GA, GTM],
  [OPTI, 'page'],
  [CDNJS, 'page', { integrity: SRI, crossorigin: 'anonymous' }],
  [OWN, 'page'],
];

test('scripts: a page-source script without integrity gets a warning per host, with a concrete fix', () => {
  const findings = scriptFindings([page('/', { states: [loaded('none', MIXED), loaded('reject', MIXED), loaded('accept', MIXED.map(([u, i, t]) => [u, i, { ...t, ...(u === JQ ? { sha256: 'sha256-JQHASH', bytes: 87000 } : {}) }]))] })]);
  const [jq] = byKey(findings, 'scripts.sri.missing.code.jquery.com');
  assert.ok(jq, 'missing finding for code.jquery.com');
  assert.equal(jq.status, 'warning');
  assert.equal(jq.priority, 'medium');
  assert.equal(jq.typicalOwner, 'developer');
  assert.match(jq.fix, /integrity="sha384-/);
  assert.match(jq.fix, /crossorigin="anonymous"/);
  assert.match(jq.fix, /openssl dgst -sha384/);
  assert.match(jq.fix, /Access-Control-Allow-Origin/);
  assert.match(jq.fix, /sha256-JQHASH/);
  assert.match(jq.explanation, /before the visitor has made a cookie choice/);
  assert.doesNotMatch(jq.fix + jq.explanation, /PCI/);
  // No missing finding for the hosts that cannot carry integrity, carry it, or are the site's own.
  assert.equal(findings.filter((f) => f.checkKey.startsWith('scripts.sri.missing.')).length, 1);
  assert.equal(byKey(findings, 'scripts.sri.ok').length, 0);
});

test('scripts: GTM and Optimizely in the page source get one manual CSP finding, not a missing-integrity warning', () => {
  const findings = scriptFindings([page('/', { states: [st('none'), st('reject'), loaded('accept', MIXED)] })]);
  const [u] = byKey(findings, 'scripts.sri.unsupported');
  assert.equal(u.status, 'manual');
  assert.equal(u.priority, 'medium');
  assert.match(u.explanation, /Google Tag Manager/);
  assert.match(u.explanation, /Optimizely/);
  assert.match(u.fix, /script-src/);
  assert.match(u.fix, /'unsafe-eval'/);
  assert.match(u.fix, /connect-src/);
  assert.match(u.fix, /cdn\.optimizely\.com/);
  // Loaded only after consent here: no before-consent sentence.
  assert.doesNotMatch(u.explanation, /before the visitor has made a cookie choice/);
});

test('scripts: scripts injected by GTM are inventory only', () => {
  const findings = scriptFindings([page('/', { states: [st('none'), st('reject'), loaded('accept', [[GTM, 'page'], [GA, GTM], [JQ, GTM]])] })]);
  assert.equal(findings.filter((f) => f.checkKey.startsWith('scripts.sri.missing.')).length, 0);
  const [ok] = byKey(findings, 'scripts.sri.ok');
  assert.equal(ok.status, 'pass');
  assert.match(ok.explanation, /2 scripts are loaded by GTM/);
});

test('scripts: integrity on every page-source script that can carry it passes', () => {
  const findings = scriptFindings([page('/', { states: [st('none'), st('reject'), loaded('accept', [[CDNJS, 'page', { integrity: SRI, crossorigin: 'anonymous' }], [OWN, 'page']])] })]);
  assert.deepEqual(findings.map((f) => f.checkKey), ['scripts.sri.ok']);
  assert.match(findings[0].explanation, /1 third-party script in the page source carries integrity/);
});

test('scripts: integrity counts only when the tag has it on every page', () => {
  const pages = [
    page('/', { states: [st('none'), st('reject'), loaded('accept', [[CDNJS, 'page', { integrity: SRI, crossorigin: 'anonymous' }]])] }),
    page('/about', { states: [st('none'), st('reject'), loaded('accept', [[CDNJS, 'page']])] }),
  ];
  const [row] = scriptInventory(site('target', pages));
  assert.equal(row.integrity, null);
  assert.equal(row.crossorigin, null);
  assert.equal(row.pageCount, 2);
  assert.equal(byKey(scriptFindings(pages), 'scripts.sri.missing.cdnjs.cloudflare.com').length, 1);
});

test('scripts: observations from before the inventory give no findings and no inventory', () => {
  const pages = [page('/', { states: [st('none'), st('reject'), st('accept', { requests: [req(JQ, 'page')] })] })];
  assert.equal(scriptInventory(site('target', pages)), undefined);
  assert.deepEqual(scriptFindings(pages), []);
});

test('scripts: without initiators nothing is judged', () => {
  const pages = [page('/', { states: [st('none'), st('reject'), loaded('accept', [[JQ], [GTM]])] })];
  assert.equal(scriptInventory(site('target', pages)).length, 2);
  assert.deepEqual(assessScripts({ mode: 'policy', target: site('target', pages), baseline: null, policy: POLICY }), []);
});

test('scripts: inventory rows hold origin, states, consent, hash and sort problems first', () => {
  const accept = loaded('accept', MIXED.map(([u, i, t]) => [u, i, { ...t, ...(u === GA ? { sha256: 'sha256-GA', bytes: 2048 } : {}) }]));
  const rows = scriptInventory(site('target', [page('/', { states: [loaded('none', [[GTM, 'page']]), st('reject'), accept] })]));
  const by = Object.fromEntries(rows.map((r) => [r.host + new URL(r.url).pathname, r]));
  const gtm = by['www.googletagmanager.com/gtm.js'];
  assert.equal(gtm.vendorId, 'gtm');
  assert.equal(gtm.origin, 'page');
  assert.deepEqual(gtm.states, ['none', 'accept']);
  assert.equal(gtm.beforeConsent, true);
  assert.equal(gtm.sriPossible, false);
  assert.ok(!gtm.url.includes('GTM-ABC123'), 'query values are stripped');
  const ga = by['www.googletagmanager.com/gtag/js'];
  assert.equal(ga.origin, 'gtm');
  assert.equal(ga.beforeConsent, false);
  assert.equal(ga.sha256, 'sha256-GA');
  assert.equal(ga.bytes, 2048);
  const own = by['new.example/assets/app.js'];
  assert.equal(own.firstParty, true);
  assert.equal(rows.at(-1), own, 'first-party scripts sort last');
  assert.equal(rows[0].origin, 'page');
  assert.equal(rows[0].integrity, null);
});

test('scripts: a state whose consent choice was not automated does not count as a load state', () => {
  const rows = scriptInventory(site('target', [page('/', { states: [st('none'), loaded('reject', [[JQ, 'page']], { method: 'not_automated' }), st('accept')] })]));
  assert.deepEqual(rows[0].states, []);
  assert.equal(rows[0].beforeConsent, false);
});

test('sriPossibleFor: vendor flags, Turnstile vs cdnjs, and gtag for other products', () => {
  assert.equal(sriPossibleFor(JQ), true);
  assert.equal(sriPossibleFor(CDNJS), true);
  assert.equal(sriPossibleFor(GTM), false);
  assert.equal(sriPossibleFor(OPTI), false);
  assert.equal(sriPossibleFor('https://challenges.cloudflare.com/turnstile/v0/api.js'), false);
  assert.equal(sriPossibleFor('https://www.googletagmanager.com/gtag/js?id=DC-1234567'), false);
  assert.equal(sriPossibleFor('https://js.hs-scripts.com/7117856.js'), false);
});

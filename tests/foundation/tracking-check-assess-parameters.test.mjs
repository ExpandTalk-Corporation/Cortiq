import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assess } from '../../supabase/functions/_shared/tracking-check/assess/index.ts';
import { stripQueryValues } from '../../supabase/functions/_shared/tracking-check/assess/util.ts';
import { fetchOk, page, site, st, POLICY } from './tracking-check-fixtures.mjs';

const run = (targetPages, mode = 'comparison') => assess({ mode, target: site('target', targetPages), baseline: mode === 'comparison' ? site('baseline', []) : null, policy: null });
const byKey = (findings, key) => findings.filter((f) => f.checkKey === key);

test('parameters pass when every page keeps them', () => {
  const [f] = byKey(run([page('/'), page('/pricing/')]), 'params.survive');
  assert.equal(f.status, 'pass');
  assert.match(f.title, /all 2 tested pages/);
});

test('parameters fail and name the lost parameters per page', () => {
  const [f] = byKey(run([page('/'), page('/pricing/', { fetch: fetchOk('/pricing/', { paramsLost: ['gclid', 'utm_source'] }) })]), 'params.survive');
  assert.equal(f.status, 'fail');
  assert.equal(f.priority, 'high');
  assert.deepEqual(f.evidence.pages, ['/pricing/']);
  assert.match(f.evidence.details[0], /gclid, utm_source/);
});

test('legacy URLs: error is a fail, 302/307 or long chains are warnings, single 301 passes', () => {
  const hops = (...codes) => codes.map((status, i) => ({ url: `https://new.example/h${i}?gclid=SECRET`, status }));
  const legacy = (path, codes) => page(path, { legacy: true, fetch: fetchOk(path, { hops: hops(...codes), finalStatus: codes.at(-1) }) });
  const findings = run([page('/'), legacy('/gone/', [301, 404]), legacy('/temp/', [302, 200]), legacy('/chain/', [301, 301, 301, 200]), legacy('/fine/', [301, 200])]);
  assert.equal(byKey(findings, 'redirects.legacy')[0].status, 'fail');
  assert.deepEqual(byKey(findings, 'redirects.legacy')[0].evidence.pages, ['/gone/']);
  const quality = byKey(findings, 'redirects.legacy_quality')[0];
  assert.equal(quality.status, 'warning');
  assert.deepEqual(quality.evidence.pages, ['/temp/', '/chain/']);
  assert.ok(!quality.evidence.details.join(' ').includes('SECRET'), 'evidence must not contain parameter values');
});

test('legacy redirect checks only run in comparison mode', () => {
  const findings = run([page('/'), page('/old/', { legacy: true })], 'policy');
  assert.equal(byKey(findings, 'redirects.legacy').length + byKey(findings, 'redirects.legacy_quality').length, 0);
});

test('challenge, 401 and failed pages are untestable and excluded from other checks', () => {
  const findings = run([
    page('/a/', { fetch: fetchOk('/a/', { challenge: true, paramsLost: ['gclid'] }) }),
    page('/b/', { fetch: fetchOk('/b/', { finalStatus: 401, paramsLost: ['gclid'] }) }),
    page('/c/', { failed: 'Browserless 500' }),
  ]);
  const [coverage] = byKey(findings, 'coverage.untestable');
  assert.equal(coverage.status, 'untestable');
  assert.deepEqual(coverage.evidence.pages, ['new /a/', 'new /b/', 'new /c/']);
  assert.equal(byKey(findings, 'params.survive').length, 0, 'no pass or fail from untestable pages');
});

test('findings are sorted fail, warning, manual, untestable, pass', () => {
  const findings = run([page('/'), page('/x/', { failed: 'boom' }), page('/old/', { legacy: true, fetch: fetchOk('/old/', { hops: [{ url: 'https://new.example/old/', status: 404 }], finalStatus: 404 }) })]);
  const order = { fail: 0, warning: 1, manual: 2, untestable: 3, pass: 4 };
  const ranks = findings.map((f) => order[f.status]);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
});

test('stripQueryValues keeps parameter names only', () => {
  assert.equal(stripQueryValues('https://s.example/p?token=abc&gclid=1&token=2'), 'https://s.example/p?token&gclid');
  assert.equal(stripQueryValues('https://s.example/p'), 'https://s.example/p');
});

test('error pages (HTTP 403/500) are untestable and give no params, consent or CSP pass', () => {
  const findings = assess({ mode: 'policy', baseline: null, policy: POLICY, target: site('target', [
    page('/blocked/', { fetch: fetchOk('/blocked/', { finalStatus: 403 }) }),
    page('/broken/', { states: [st('none', { status: 500 }), st('reject', { status: 500 }), st('accept', { status: 500 })] }),
  ]) });
  const [coverage] = byKey(findings, 'coverage.untestable');
  assert.equal(coverage.status, 'untestable');
  assert.deepEqual(coverage.evidence.details, ['/blocked/: HTTP 403', '/broken/: HTTP 500']);
  assert.equal(findings.filter((f) => f.status === 'pass').length, 0, findings.filter((f) => f.status === 'pass').map((f) => f.checkKey).join());
  assert.equal(findings.filter((f) => ['Parameters', 'Consent', 'CSP'].includes(f.scope)).length, 0);
});

test('a legacy URL that ends in an error is still assessed as a broken redirect, not untestable', () => {
  const findings = run([page('/'), page('/old/', { legacy: true, fetch: fetchOk('/old/', { hops: [{ url: 'https://new.example/old/', status: 404 }], finalStatus: 404 }) })]);
  assert.equal(byKey(findings, 'redirects.legacy')[0].status, 'fail');
  assert.equal(byKey(findings, 'coverage.untestable').length, 0);
});

test('legacy URLs with query strings show parameter names only, never values', () => {
  const legacy = page('/index.php?page_id=42', { legacy: true, fetch: fetchOk('/x', { hops: [{ url: 'https://new.example/index.php?page_id=42', status: 404 }], finalStatus: 404 }) });
  const untestable = page('/old.php?token=abc', { legacy: true, failed: 'timeout' });
  const findings = run([page('/'), legacy, untestable]);
  const text = JSON.stringify(findings);
  assert.ok(!text.includes('42') && !text.includes('abc'), text);
  assert.deepEqual(byKey(findings, 'redirects.legacy')[0].evidence.pages, ['/index.php?page_id']);
  assert.deepEqual(byKey(findings, 'coverage.untestable')[0].evidence.pages, ['new /old.php?token']);
});

test('consent automation coverage lists the CMP and method per state for each site', () => {
  const findings = assess({ mode: 'comparison', policy: null,
    baseline: site('baseline', [page('/', { cmp: 'cookiebot' })]),
    target: site('target', [page('/'), page('/b/', { states: [st('none'), st('reject', { method: 'text' }), st('accept')] })]) });
  const [f] = byKey(findings, 'coverage.consent_automation');
  assert.equal(f.status, 'pass');
  assert.equal(f.priority, null);
  assert.equal(f.scope, 'Coverage');
  assert.deepEqual(f.evidence.details, ['current: Cookiebot — reject: adapter, accept: adapter', 'new: CookieYes — reject: adapter/button text, accept: adapter']);
});

test('consent automation coverage is a low warning when a state could not be automated', () => {
  const findings = assess({ mode: 'policy', baseline: null, policy: POLICY,
    target: site('target', [page('/', { cmp: null, states: [st('none'), st('reject', { method: 'not_needed' }), st('accept', { method: 'not_automated' })] })]) });
  const [f] = byKey(findings, 'coverage.consent_automation');
  assert.equal(f.status, 'warning');
  assert.equal(f.priority, 'low');
  assert.deepEqual(f.evidence.details, ['new: no cookie banner detected — reject: no banner, accept: not automated']);
});

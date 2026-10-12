import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assess } from '../../supabase/functions/_shared/tracking-check/assess/index.ts';
import { stripQueryValues } from '../../supabase/functions/_shared/tracking-check/assess/util.ts';
import { fetchOk, page, site } from './tracking-check-fixtures.mjs';

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

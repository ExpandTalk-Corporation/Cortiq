import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffRuns, hasNewProblems, DIFF_LIST_MAX } from '../../supabase/functions/_shared/tracking-check/diff.ts';

const f = (checkKey, status, extra = {}) => ({ checkKey, title: `Title ${checkKey}`, status, priority: 'high', scope: 'Consent', ...extra });
const prev = (findings, vendors) => ({ id: 'prev-run', finishedAt: '2026-11-01T10:00:00Z', findings, vendors });
const vendor = (id, stored = {}) => ({
  id, name: id.toUpperCase(), category: 'analytics', origin: 'page', status: null, findings: [],
  states: Object.fromEntries(Object.entries(stored).map(([state, names]) => [state, { pages: ['/'], of: 1, stored: names }])),
});
const keys = (list) => list.map((i) => i.checkKey);

test('new, resolved, unchanged and no-longer-tested problems', () => {
  const d = diffRuns(
    { findings: [f('a', 'fail'), f('b', 'fail'), f('c', 'warning'), f('d', 'pass'), f('e', 'fail'), f('g', 'manual'), f('h', 'warning')] },
    prev([f('a', 'pass'), f('b', 'fail'), f('c', 'fail'), f('d', 'fail'), f('e', 'warning'), f('g', 'fail'), f('h', 'warning'), f('gone', 'warning')]),
  );
  // a: pass → fail; e: warning → fail (worse).
  assert.deepEqual(keys(d.newProblems), ['a', 'e']);
  assert.deepEqual(d.newProblems.map((i) => i.previous), ['pass', 'warning']);
  // b: still failing; c: fail → warning is better but still a problem; h: same warning.
  assert.deepEqual(keys(d.unchanged).sort(), ['b', 'c', 'h']);
  // d: fixed; gone: no longer reported.
  assert.deepEqual(keys(d.resolved).sort(), ['d', 'gone']);
  assert.ok(d.resolved.every((i) => i.status === 'pass'));
  assert.deepEqual(keys(d.notTested), ['g']);
  assert.deepEqual(d.counts, { newProblems: 2, resolved: 2, unchanged: 3, notTested: 1, newVendors: 0, removedVendors: 0, newCookies: 0 });
  assert.equal(d.previousRunId, 'prev-run');
  assert.equal(d.previousFinishedAt, '2026-11-01T10:00:00Z');
  assert.equal(hasNewProblems(d), true);
});

test('a check that did not exist before counts as new only when it is a problem', () => {
  const d = diffRuns({ findings: [f('x', 'warning'), f('y', 'pass'), f('z', 'manual')] }, prev([]));
  assert.deepEqual(keys(d.newProblems), ['x']);
  assert.equal(d.newProblems[0].previous, null);
  assert.equal(d.counts.unchanged + d.counts.resolved + d.counts.notTested, 0);
});

test('identical runs have no changes and raise no notice', () => {
  const findings = [f('a', 'fail'), f('b', 'pass')];
  const vendors = [vendor('ga4', { accept: ['_ga'] })];
  const d = diffRuns({ findings, vendors }, prev(findings, vendors));
  assert.equal(d.counts.newProblems + d.counts.resolved + d.counts.newVendors + d.counts.newCookies, 0);
  assert.equal(d.counts.unchanged, 1);
  assert.equal(hasNewProblems(d), false);
  assert.equal(hasNewProblems(null), false);
});

test('new and removed vendors and new cookie names', () => {
  const d = diffRuns(
    { findings: [], vendors: [vendor('ga4', { accept: ['_ga', '_ga_X'], reject: ['_gid'] }), vendor('meta', { accept: ['_fbp'] })] },
    prev([], [vendor('ga4', { accept: ['_ga'] }), vendor('hotjar', { accept: ['_hj'] })]),
  );
  assert.deepEqual(d.newVendors, [{ id: 'meta', name: 'META' }]);
  assert.deepEqual(d.removedVendors, [{ id: 'hotjar', name: 'HOTJAR' }]);
  // Cookies of a vendor that is new are covered by the vendor itself.
  assert.deepEqual(d.newCookies, [{ vendor: 'GA4', name: '_ga_X' }, { vendor: 'GA4', name: '_gid' }]);
  assert.equal(hasNewProblems(d), true);
});

test('vendors are compared only when both runs have the vendor matrix', () => {
  const d = diffRuns({ findings: [], vendors: [vendor('ga4')] }, prev([], null));
  assert.deepEqual([d.newVendors, d.removedVendors, d.newCookies], [[], [], []]);
});

test('duplicate check keys keep the most severe status; lists are capped but counts are not', () => {
  const d = diffRuns({ findings: [f('a', 'pass'), f('a', 'fail')] }, prev([f('a', 'warning'), f('a', 'pass')]));
  assert.deepEqual(keys(d.newProblems), ['a']);
  assert.equal(d.newProblems[0].previous, 'warning');

  const many = Array.from({ length: DIFF_LIST_MAX + 10 }, (_, i) => f(`k${i}`, 'fail'));
  const big = diffRuns({ findings: many }, prev([]));
  assert.equal(big.newProblems.length, DIFF_LIST_MAX);
  assert.equal(big.counts.newProblems, DIFF_LIST_MAX + 10);
});

test('new problems are ordered fail first, then by priority', () => {
  const d = diffRuns({ findings: [f('w', 'warning', { priority: 'high' }), f('low', 'fail', { priority: 'low' }), f('high', 'fail', { priority: 'high' })] }, prev([]));
  assert.deepEqual(keys(d.newProblems), ['high', 'low', 'w']);
});

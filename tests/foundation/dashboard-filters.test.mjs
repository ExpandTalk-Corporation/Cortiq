// tests/foundation/dashboard-filters.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultFilters, parseFilters, writeFilters, previousPeriod, percentChange, normalizePath,
} from '../../src/lib/dashboard/filters.ts';

const TODAY = new Date('2026-10-14T12:00:00Z');

test('default is the last 30 days including today', () => {
  assert.deepEqual(defaultFilters(TODAY), { from: '2026-09-15', to: '2026-10-14', path: null, segmentId: null });
});

test('valid params round-trip and keep unrelated keys', () => {
  const p = new URLSearchParams('tab=analytics&from=2026-09-01&to=2026-09-30&path=%2Fpricing&segment=abc');
  const f = parseFilters(p, TODAY);
  assert.deepEqual(f, { from: '2026-09-01', to: '2026-09-30', path: '/pricing', segmentId: 'abc' });
  const out = writeFilters(new URLSearchParams('tab=analytics'), f);
  assert.equal(out.get('tab'), 'analytics');
  assert.equal(out.get('from'), '2026-09-01');
  assert.equal(out.get('path'), '/pricing');
});

test('garbage, inverted, future-clamped and oversized ranges fall back safely', () => {
  assert.deepEqual(parseFilters(new URLSearchParams('from=banana&to=2026-09-30'), TODAY), defaultFilters(TODAY));
  assert.deepEqual(parseFilters(new URLSearchParams('from=2026-09-30&to=2026-09-01'), TODAY), defaultFilters(TODAY));
  assert.deepEqual(parseFilters(new URLSearchParams('from=2020-01-01&to=2026-10-14'), TODAY), defaultFilters(TODAY));
  assert.equal(parseFilters(new URLSearchParams('from=2026-10-01&to=2027-01-01'), TODAY).to, '2026-10-14');
});

test('empty filters are omitted from the URL', () => {
  const out = writeFilters(new URLSearchParams('segment=old&path=/x'), { ...defaultFilters(TODAY) });
  assert.equal(out.has('segment'), false);
  assert.equal(out.has('path'), false);
});

test('previous period has the same length and ends the day before', () => {
  assert.deepEqual(previousPeriod('2026-09-01', '2026-09-30'), { from: '2026-08-02', to: '2026-08-31' });
  assert.deepEqual(previousPeriod('2026-10-14', '2026-10-14'), { from: '2026-10-13', to: '2026-10-13' });
});

test('percent change: zero previous is "new", not Infinity', () => {
  assert.equal(percentChange(10, 0), null);
  assert.equal(percentChange(0, 0), null);
  assert.equal(percentChange(150, 100), 50);
  assert.equal(percentChange(50, 100), -50);
});

test('paths are normalised from full URLs and bare input', () => {
  assert.equal(normalizePath('https://example.com/pricing/?a=1'), '/pricing/');
  assert.equal(normalizePath('pricing'), '/pricing');
  assert.equal(normalizePath('  '), null);
  assert.equal(normalizePath('/50%_off'), '/50%_off');
});

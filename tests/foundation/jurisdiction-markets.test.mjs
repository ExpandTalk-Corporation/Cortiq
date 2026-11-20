import { test } from 'node:test';
import assert from 'node:assert/strict';
import { marketOf, STRICTEST_DEFAULT, EEA_COUNTRIES } from '../../supabase/functions/_shared/jurisdiction/markets.ts';
import { OUTCOME_RANK, MARKETS, PURPOSES, PRODUCTION_STATUSES } from '../../supabase/functions/_shared/jurisdiction/types.ts';

test('EEA countries map to eu; UK, CH, BR and the rest map to their own market', () => {
  for (const c of ['SE', 'DE', 'FR', 'IE', 'IS', 'LI', 'NO']) assert.equal(marketOf(c, null), 'eu', c);
  assert.equal(EEA_COUNTRIES.size, 30);
  assert.equal(marketOf('GB', null), 'uk');
  assert.equal(marketOf('CH', null), 'ch');
  assert.equal(marketOf('BR', null), 'br');
  assert.equal(marketOf('JP', null), 'other');
  assert.equal(marketOf('se', null), 'eu', 'case-insensitive');
});

test('Review Focus 2: US and Canada without a region fall into the stricter sub-market', () => {
  assert.equal(marketOf('US', 'CA'), 'us_ca');
  assert.equal(marketOf('US', 'TX'), 'us_other');
  assert.equal(marketOf('US', null), 'us_ca');
  assert.equal(marketOf('US', ''), 'us_ca');
  assert.equal(marketOf('CA', 'QC'), 'ca_qc');
  assert.equal(marketOf('CA', 'ON'), 'ca_other');
  assert.equal(marketOf('CA', null), 'ca_qc');
  assert.equal(marketOf('CA', 42), 'ca_qc', 'non-string region is unknown');
});

test('invalid, anonymous-proxy and Tor countries are unknown (null)', () => {
  for (const c of [null, undefined, '', 'XX', 'T1', 'SWE', 'S1', 1, {}]) assert.equal(marketOf(c, null), null, String(c));
});

test('constants: ranks are strict, markets and purposes are closed lists', () => {
  assert.deepEqual(STRICTEST_DEFAULT, ['eu', 'uk', 'ca_qc']);
  assert.ok(OUTCOME_RANK.allowed < OUTCOME_RANK.allowed_unless_opt_out);
  assert.ok(OUTCOME_RANK.allowed_unless_opt_out < OUTCOME_RANK.needs_opt_in);
  assert.ok(OUTCOME_RANK.needs_opt_in < OUTCOME_RANK.blocked);
  assert.deepEqual([...MARKETS], ['eu', 'uk', 'ch', 'us_ca', 'us_other', 'ca_qc', 'ca_other', 'br', 'other']);
  assert.deepEqual([...PURPOSES], ['statistics', 'conversion', 'attribution', 'ad_platform_sharing', 'agent_measurement']);
  assert.deepEqual([...PRODUCTION_STATUSES], ['approved_internal', 'reviewed_counsel']);
});

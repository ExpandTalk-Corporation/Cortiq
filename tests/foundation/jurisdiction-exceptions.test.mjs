// tests/foundation/jurisdiction-exceptions.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, MAX_EXCEPTION_MS } from '../../supabase/functions/_shared/jurisdiction/decide.ts';
import { PACK } from '../../supabase/functions/_shared/jurisdiction/packs.ts';

const NOW = new Date('2026-12-01T12:00:00Z');
const approve = (r) => ({ ...r, status: 'approved_internal', approval: { approvedBy: 'test', approvedAt: '2026-11-01', reviewDue: '2027-01-31' } });
const RELAX = { ...approve(PACK.rules[0]), id: 'eu.attribution.li', purposes: ['attribution'],
  technique: { storage: 'session', identifiers: 'session' }, outcome: 'allowed_unless_opt_out',
  relaxable: true, requiredLegalBasis: 'legitimate_interest' };
const pack = (rules) => ({ version: 'x', rules });
const exc = (over = {}) => ({ ruleId: 'eu.attribution.li@1', jurisdiction: 'eu', purpose: 'attribution', legalBasis: 'legitimate_interest',
  assessmentRef: 'LIA-2026-01', approvedBy: 'Daniel Larsson', approvedAt: '2026-11-15T00:00:00Z', expiresAt: '2027-11-14T00:00:00Z', ...over });
const run = (over) => decide({
  visitor: { country: 'SE', region: null, geoSource: 'ip' }, customer: { establishment: 'SE', markets: ['eu'], appliesLaws: {} },
  purpose: 'attribution', signals: { consent: { analytics: null, marketing: null }, evidence: 'none', gpc: false },
  technique: { storage: 'session', identifiers: 'session' }, exceptions: [], now: NOW, pack: pack([RELAX]), ...over,
});

test('a relaxable rule applies only through a valid approved exception', () => {
  assert.deepEqual([run({}).outcome, run({}).reason], ['needs_opt_in', 'consent_missing']);
  const ok = run({ exceptions: [exc()] });
  assert.deepEqual([ok.outcome, ok.permit, ok.ruleIds], ['allowed_unless_opt_out', true, ['eu.attribution.li@1']]);
});

test('must-pass: expired, too long, not yet valid or mismatched exceptions are ignored', () => {
  assert.equal(MAX_EXCEPTION_MS, 366 * 86400e3);
  const bad = [
    exc({ expiresAt: '2026-11-30T00:00:00Z' }),                          // expired
    exc({ expiresAt: '2027-12-01T00:00:00Z' }),                          // longer than 12 months
    exc({ approvedAt: '2026-12-15T00:00:00Z', expiresAt: '2027-06-01T00:00:00Z' }), // not yet approved
    exc({ jurisdiction: 'uk' }), exc({ purpose: 'statistics' }), exc({ ruleId: 'eu.attribution.li@2' }),
    exc({ legalBasis: 'consent' }), exc({ expiresAt: 'never' }),
  ];
  for (const e of bad) assert.equal(run({ exceptions: [e] }).outcome, 'needs_opt_in', JSON.stringify(e));
});

test('a relaxable rule below approved_internal never relaxes, not even on a test site', () => {
  for (const status of ['draft', 'reviewed_agent', 'suspended']) {
    const d = run({ pack: pack([{ ...RELAX, status, approval: null }]), exceptions: [exc()], testSite: true });
    assert.equal(d.outcome, 'needs_opt_in', status);
  }
});

test('hard floor: EU cross-site identifiers need opt-in even with an exception', () => {
  const cross = { ...RELAX, technique: { storage: 'persistent', identifiers: 'cross_site' } };
  const d = run({ pack: pack([cross]), exceptions: [exc()], technique: { storage: 'persistent', identifiers: 'cross_site' } });
  assert.deepEqual([d.outcome, d.ruleIds], ['needs_opt_in', ['floor.eu_cross_site']]);
});

test('customer tightening: opt_in raises, off blocks even with consent', () => {
  const statsPack = pack([approve(PACK.rules[0])]);
  const base = { purpose: 'statistics', technique: { storage: 'none', identifiers: 'none' }, pack: statsPack };
  assert.equal(run(base).outcome, 'allowed_unless_opt_out');
  const optIn = run({ ...base, tighten: { statistics: 'opt_in' } });
  assert.deepEqual([optIn.outcome, optIn.reason, optIn.ruleIds.includes('tighten.opt_in')], ['needs_opt_in', 'consent_missing', true]);
  const off = run({ ...base, tighten: { statistics: 'off' }, signals: { consent: { analytics: true, marketing: true }, evidence: 'ledger', gpc: false } });
  assert.deepEqual([off.outcome, off.permit, off.reason], ['blocked', false, 'customer_off']);
  assert.equal(run({ ...base, tighten: { conversion: 'off' } }).outcome, 'allowed_unless_opt_out', 'other purpose untouched');
});

test('AC4: a relax attempt through tighten has no effect', () => {
  for (const value of ['allowed', 'relax', 'allowed_unless_opt_out', 'default', '', null, 42]) {
    const d = run({ purpose: 'statistics', technique: { storage: 'session', identifiers: 'session' }, tighten: { statistics: value } });
    assert.deepEqual([d.outcome, d.permit], ['needs_opt_in', false], String(value));
  }
});

test('tighten.off on a rule-blocked outcome keeps reason rule_blocked, not customer_off', () => {
  const blockedRule = { ...approve(PACK.rules[0]), outcome: 'blocked' };
  const statsPack = pack([blockedRule]);
  const d = run({ purpose: 'statistics', technique: { storage: 'none', identifiers: 'none' }, pack: statsPack, tighten: { statistics: 'off' } });
  assert.deepEqual([d.outcome, d.permit, d.reason], ['blocked', false, 'rule_blocked']);
  assert.ok(d.ruleIds.includes('tighten.off'), 'tighten.off should still be in ruleIds');
});

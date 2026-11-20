// tests/foundation/jurisdiction-decide.test.mjs
// Spec 2026-11-18 phase 3 AC2: table tests incl. the must-pass cases.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, marketsFor } from '../../supabase/functions/_shared/jurisdiction/decide.ts';
import { PACK } from '../../supabase/functions/_shared/jurisdiction/packs.ts';

const NOW = new Date('2026-12-01T12:00:00Z');
const AGG = { storage: 'none', identifiers: 'none' };
const SESSION = { storage: 'session', identifiers: 'session' };
const approve = (r) => ({ ...r, status: 'approved_internal', approval: { approvedBy: 'test', approvedAt: '2026-11-01', reviewDue: '2027-01-31' } });
const APPROVED = { version: 'test-approved', rules: PACK.rules.map(approve) };
const ip = (country, region = null) => ({ country, region, geoSource: 'ip' });
const profile = (markets, appliesLaws = {}) => ({ establishment: 'SE', markets, appliesLaws });
const sig = (over = {}) => ({ consent: { analytics: null, marketing: null }, evidence: 'none', gpc: false, ...over });
const run = (over) => decide({
  visitor: ip('SE'), customer: profile(['eu']), purpose: 'statistics', signals: sig(), technique: AGG,
  exceptions: [], now: NOW, ...over,
});

test('must-pass: EU visitor without consent, identifying technique -> opt-in required, not permitted', () => {
  const d = run({ technique: SESSION });
  assert.deepEqual([d.outcome, d.permit, d.reason], ['needs_opt_in', false, 'consent_missing']);
  assert.deepEqual(d.ruleIds, ['baseline.statistics']);
  assert.deepEqual(d.constraints, { storage: 'none', identifiers: 'none' });
});

test('must-pass: EU aggregate without consent depends on the rule status, never on the code', () => {
  const unapproved = run({});
  assert.deepEqual([unapproved.outcome, unapproved.permit, unapproved.reason], ['needs_opt_in', false, 'consent_missing']);
  const approved = run({ pack: APPROVED });
  assert.deepEqual([approved.outcome, approved.permit, approved.reason], ['allowed_unless_opt_out', true, 'allowed']);
  assert.deepEqual(approved.ruleIds, ['eu.statistics.aggregate@1']);
  assert.equal(approved.packVersion, 'test-approved');
  const refused = run({ pack: APPROVED, signals: sig({ consent: { analytics: false, marketing: false }, evidence: 'ledger' }) });
  assert.deepEqual([refused.permit, refused.reason, refused.evidence], [false, 'opt_out', 'ledger']);
  const cmDenied = run({ pack: APPROVED, signals: sig({ consentModeUpdate: 'denied' }) });
  assert.deepEqual([cmDenied.permit, cmDenied.reason], [false, 'opt_out']);
  const cmDefault = run({ pack: APPROVED, signals: sig({ consentModeDefault: 'denied' }) });
  assert.equal(cmDefault.permit, true, 'a Consent Mode default is not a choice');
});

test('must-pass: California visitor with GPC -> no ad-platform sharing, even after later consent', () => {
  const d = run({ visitor: ip('US', 'CA'), customer: profile(['us_ca']), purpose: 'ad_platform_sharing',
    technique: { storage: 'persistent', identifiers: 'cross_site' },
    signals: sig({ consent: { analytics: true, marketing: true }, evidence: 'ledger', gpc: true }) });
  assert.deepEqual([d.permit, d.reason], [false, 'gpc']);
  assert.ok(d.ruleIds.includes('floor.gpc_sharing'));
  const attribution = run({ visitor: ip('US', 'CA'), customer: profile(['us_ca']), purpose: 'attribution',
    signals: sig({ consent: { analytics: true, marketing: true }, gpc: true }) });
  assert.deepEqual([attribution.permit, attribution.reason], [false, 'gpc']);
  const stats = run({ visitor: ip('US', 'CA'), customer: profile(['us_ca']), technique: SESSION,
    signals: sig({ consent: { analytics: true, marketing: false }, evidence: 'ledger', gpc: true }) });
  assert.equal(stats.permit, true, 'GPC does not cancel consented statistics');
});

test('must-pass: Quebec visitor with an identifying technique -> opt-in, draft rules ignored on customer sites', () => {
  const d = run({ visitor: ip('CA', 'QC'), customer: profile(['ca_qc']), technique: SESSION });
  assert.deepEqual([d.markets, d.outcome, d.permit, d.reason], [['ca_qc'], 'needs_opt_in', false, 'consent_missing']);
  const ok = run({ visitor: ip('CA', 'QC'), customer: profile(['ca_qc']), technique: SESSION,
    signals: sig({ consent: { analytics: true, marketing: false }, evidence: 'ledger' }) });
  assert.deepEqual([ok.permit, ok.constraints], [true, SESSION]);
});

test('unknown geo and spoofed or unsigned geo use the customer markets (fail closed)', () => {
  for (const geoSource of ['timezone', 'unknown', 'adapter']) {
    const d = run({ visitor: { country: 'US', region: 'TX', geoSource }, customer: profile(['eu', 'us_other']), pack: APPROVED });
    assert.equal(d.fallback, 'unknown_geo', geoSource);
    assert.deepEqual(d.markets, ['eu', 'us_other']);
  }
  const noMarkets = marketsFor({ country: null, region: null, geoSource: 'unknown' }, profile([]));
  assert.deepEqual(noMarkets, { markets: ['eu', 'uk', 'ca_qc'], fallback: 'unknown_geo' });
});

test('no profile -> visitor market plus the strictest default; outcome is the strictest across them', () => {
  assert.deepEqual(marketsFor(ip('JP'), null), { markets: ['other', 'eu', 'uk', 'ca_qc'], fallback: 'no_profile' });
  assert.deepEqual(marketsFor(ip('SE'), null), { markets: ['eu', 'uk', 'ca_qc'], fallback: 'no_profile' });
  // uk and ca_qc have no usable rule -> baseline, so an approved EU rule alone cannot relax a no-profile site.
  const d = run({ customer: null, pack: { version: 'eu-only', rules: [approve(PACK.rules[0])] } });
  assert.deepEqual([d.outcome, d.permit, d.fallback], ['needs_opt_in', false, 'no_profile']);
});

test('statuses: draft only on admin test sites, suspended never, reviewed_agent not in production', () => {
  const qc = { visitor: ip('CA', 'QC'), customer: profile(['ca_qc']) };
  assert.equal(run(qc).outcome, 'needs_opt_in', 'draft world rule ignored on a customer site');
  assert.equal(run({ ...qc, testSite: true }).outcome, 'allowed_unless_opt_out', 'draft applies on a test site');
  const suspended = { version: 's', rules: [{ ...approve(PACK.rules[0]), status: 'suspended', approval: null }] };
  assert.equal(run({ pack: suspended, testSite: true }).outcome, 'needs_opt_in');
  const future = { version: 'f', rules: [{ ...approve(PACK.rules[0]), effectiveFrom: '2027-01-01' }] };
  assert.equal(run({ pack: future }).outcome, 'needs_opt_in', 'not yet effective');
});

test('law answers: "no" excludes a law-bound rule, "dont_know" keeps it', () => {
  const lawRule = { ...approve(PACK.rules[0]), id: 'us.ccpa.test', markets: ['us_ca'], outcome: 'blocked', law: 'us_ccpa' };
  const pack = { version: 'law', rules: [lawRule] };
  const base = { visitor: ip('US', 'CA'), pack };
  assert.equal(run({ ...base, customer: profile(['us_ca'], { us_ccpa: 'no' }) }).outcome, 'needs_opt_in');
  assert.equal(run({ ...base, customer: profile(['us_ca'], { us_ccpa: 'dont_know' }) }).outcome, 'blocked');
  assert.equal(run({ ...base, customer: profile(['us_ca'], {}) }).reason, 'rule_blocked');
});

// tests/foundation/jurisdiction-profile.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { profileToCustomer, PROFILE_QUESTIONS, DISCLAIMER, decide, PACK } from '../../supabase/functions/_shared/jurisdiction/index.ts';

const BANNED = [/no consent needed/i, /gdpr[- ]compliant without consent/i, /no banner needed/i];

test('profileToCustomer: null stays null (fail closed to the strictest default)', () => {
  assert.equal(profileToCustomer(null), null);
});

test('profileToCustomer: unknown markets dropped, establishment market added, answers normalised', () => {
  const c = profileToCustomer({ establishment_country: 'se', markets: ['us_ca', 'mars', 7], answers: { us_ccpa: 'maybe', x: 'no' } });
  assert.deepEqual(c, { establishment: 'SE', markets: ['us_ca', 'eu'], appliesLaws: { us_ccpa: 'dont_know', x: 'no' } });
  const junk = profileToCustomer({ establishment_country: null, markets: 'eu', answers: [] });
  assert.deepEqual(junk, { establishment: null, markets: [], appliesLaws: {} });
});

test('"dont_know" counts as the law applying (stricter)', () => {
  const lawRule = { ...PACK.rules[0], id: 'us.law', markets: ['us_ca'], outcome: 'blocked', law: 'us_ccpa', status: 'approved_internal',
    approval: { approvedBy: 't', approvedAt: '2026-11-01', reviewDue: '2027-01-31' } };
  const customer = profileToCustomer({ establishment_country: 'US', markets: ['us_ca'], answers: { us_ccpa: 'dont_know' } });
  const d = decide({ visitor: { country: 'US', region: 'CA', geoSource: 'ip' }, customer, purpose: 'statistics',
    signals: { consent: { analytics: true, marketing: true }, evidence: 'ledger', gpc: false },
    technique: { storage: 'none', identifiers: 'none' }, exceptions: [], now: new Date('2026-12-01'), pack: { version: 't', rules: [lawRule] } });
  assert.equal(d.outcome, 'blocked');
});

test('profile questions: one CCPA question with references, no legal conclusions, disclaimer present', () => {
  assert.deepEqual(PROFILE_QUESTIONS.map((q) => [q.key, q.market]), [['us_ccpa', 'us_ca']]);
  for (const q of PROFILE_QUESTIONS) {
    assert.ok(q.references.length > 0);
    assert.match(q.help, /I don't know/);
    for (const re of BANNED) assert.doesNotMatch(q.text + q.help, re);
  }
  assert.equal(DISCLAIMER, "These are CortIQ's technical defaults, not legal advice.");
});

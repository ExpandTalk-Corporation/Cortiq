import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mockDatabase } from './edge-harness.mjs';
import {
  parseSitePolicy, loadSitePolicy, STRICT_POLICY, isEnforced, readLedger, signalsFrom, visitorFrom, decideAndLog,
  jurisdictionGate, resetPolicyCache,
} from '../../supabase/functions/_shared/jurisdiction-edge.ts';

const SITE = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-11-20T12:00:00Z');
const ledgerDb = (row, error = null) => mockDatabase((op) => (op.table === 'cookie_consents' ? { data: row, error } : { data: null, error: null })).client;

test('Review Focus 5: malformed policy JSON gives the strictest default, never throws', async () => {
  for (const raw of [null, undefined, 42, 'x', [], { profile: 'x' }, { profile: { markets: 'eu' } }, { tighten: [] }, { exceptions: {} }, { testSite: 'yes' }]) {
    const p = parseSitePolicy(raw);
    assert.equal(p.testSite, false, JSON.stringify(raw));
    assert.deepEqual(p.exceptions, []);
  }
  assert.equal(parseSitePolicy(null).customer, null);
  const p = parseSitePolicy({ profile: { establishment_country: 'SE', markets: ['eu', 'mars'], answers: { us_ccpa: 'perhaps' } },
    tighten: { statistics: 'off', conversion: 'allowed', bogus: 'off' },
    exceptions: [{ ruleId: 'eu.x@1', jurisdiction: 'eu', purpose: 'attribution', legalBasis: 'lb', assessmentRef: 'A', approvedBy: 'u', approvedAt: '2026-11-01T00:00:00Z', expiresAt: '2027-01-01T00:00:00Z' },
                 { ruleId: 'eu.y@1', jurisdiction: 'mars', purpose: 'attribution' }],
    testSite: true });
  assert.deepEqual(p.customer.markets, ['eu']);
  assert.equal(p.customer.appliesLaws.us_ccpa, 'dont_know');
  assert.deepEqual(p.tighten, { statistics: 'off', conversion: 'allowed' }, 'unknown purposes dropped; decide() ignores relax values (AC4)');
  assert.deepEqual(p.exceptions.map((e) => e.ruleId), ['eu.x@1']);
  assert.equal(p.testSite, true);

  const failing = { rpc: async () => ({ data: null, error: { message: 'down' } }) };
  assert.deepEqual(await loadSitePolicy(failing, SITE), STRICT_POLICY);
  const throwing = { rpc: async () => { throw new Error('network'); } };
  assert.deepEqual(await loadSitePolicy(throwing, SITE), STRICT_POLICY);
});

test('enforcement flag: shadow unless "all" or the function is listed', () => {
  assert.equal(isEnforced('aggregate-hit', undefined), false);
  assert.equal(isEnforced('aggregate-hit', ''), false);
  assert.equal(isEnforced('aggregate-hit', 'test-value'), false, 'edge-harness default');
  assert.equal(isEnforced('aggregate-hit', 'all'), true);
  assert.equal(isEnforced('aggregate-hit', ' server-hit , aggregate-hit '), true);
  assert.equal(isEnforced('track-event', 'aggregate-hit'), false);
});

test('Review Focus 4: expired, missing or broken ledger rows read as no answer', async () => {
  const valid = { consent_types: { analytics: true, marketing: false }, gpc_signal: false, expires_at: '2027-01-01T00:00:00Z' };
  assert.deepEqual(await readLedger(ledgerDb(valid), SITE, 's1', NOW), { analytics: true, marketing: false, gpc: false });
  assert.equal(await readLedger(ledgerDb({ ...valid, expires_at: '2026-11-19T00:00:00Z' }), SITE, 's1', NOW), null);
  assert.equal(await readLedger(ledgerDb(null), SITE, 's1', NOW), null);
  // A withdrawn row (consent_given false) is a refusal of both categories, whatever consent_types says.
  assert.deepEqual(await readLedger(ledgerDb({ ...valid, consent_given: false }), SITE, 's1', NOW), { analytics: false, marketing: false, gpc: false });
  assert.equal(await readLedger(ledgerDb(valid, { message: 'down' }), SITE, 's1', NOW), null);
  assert.equal(await readLedger(ledgerDb(valid), SITE, '', NOW), null);
  assert.equal(await readLedger(ledgerDb(valid), SITE, 42, NOW), null);
  assert.deepEqual(await readLedger(ledgerDb({ ...valid, consent_types: { analytics: 'yes' } }), SITE, 's1', NOW),
    { analytics: null, marketing: null, gpc: false }, 'non-boolean values are no answer');
});

test('Review Focus 1: consent race. No ledger row yet + tracker gate = consent with tracker_gate evidence', () => {
  assert.deepEqual(signalsFrom(null, { trackerGate: ['analytics'], gpcHeader: false }),
    { consent: { analytics: true, marketing: null }, evidence: 'tracker_gate', gpc: false });
  assert.deepEqual(signalsFrom(null, { trackerGate: [], gpcHeader: false }),
    { consent: { analytics: null, marketing: null }, evidence: 'none', gpc: false });
});

test('the ledger only tightens the tracker gate; GPC from either source sticks', () => {
  const s = signalsFrom({ analytics: false, marketing: true, gpc: false }, { trackerGate: ['analytics', 'marketing'], gpcHeader: false });
  assert.deepEqual(s.consent, { analytics: false, marketing: true });
  assert.equal(s.evidence, 'ledger');
  const noGate = signalsFrom({ analytics: true, marketing: null, gpc: true }, { trackerGate: [], gpcHeader: false });
  assert.deepEqual([noGate.consent.analytics, noGate.gpc], [true, true]);
  assert.equal(signalsFrom(null, { trackerGate: [], gpcHeader: true }).gpc, true);
});

test('visitorFrom: only signed edge geo is trusted', () => {
  assert.deepEqual(visitorFrom({ country: 'SE', region: null, source: 'ip' }), { country: 'SE', region: null, geoSource: 'ip' });
  assert.equal(visitorFrom({ country: 'SE', region: null, source: 'timezone' }).geoSource, 'timezone');
  assert.equal(visitorFrom({ country: 'SE', region: null, source: 'ip' }, true).geoSource, 'adapter');
  assert.equal(visitorFrom({ country: 'SE', region: null, source: 'weird' }).geoSource, 'unknown');
});

test('decideAndLog: logs daily counts with country only for signed geo; log failure is swallowed', async () => {
  const calls = [];
  const client = { rpc: async (name, args) => { calls.push({ name, args }); return { data: null, error: { message: 'boom' } }; } };
  const input = { visitor: { country: 'SE', region: null, geoSource: 'ip' }, purpose: 'statistics',
    signals: { consent: { analytics: null, marketing: null }, evidence: 'none', gpc: false }, technique: { storage: 'none', identifiers: 'none' } };
  const d = await decideAndLog(client, 'aggregate-hit', SITE, input, STRICT_POLICY, undefined);
  assert.equal(d.enforce, false);
  assert.equal(d.drop, false, 'shadow mode never drops');
  assert.equal(d.permit, false);
  const [log] = calls;
  assert.equal(log.name, 'log_jurisdiction_decision');
  assert.deepEqual(Object.keys(log.args).sort(), ['p_count', 'p_country', 'p_enforced', 'p_evidence', 'p_fn', 'p_outcome', 'p_purpose', 'p_reason', 'p_rule_id', 'p_site_id']);
  assert.equal(log.args.p_country, 'SE');
  assert.equal(log.args.p_enforced, false);

  const tz = await decideAndLog(client, 'aggregate-hit', SITE, { ...input, visitor: { country: 'SE', region: null, geoSource: 'timezone' } }, STRICT_POLICY, 'all');
  assert.equal(calls[1].args.p_country, '', 'untrusted geo is never logged as a country');
  assert.equal(tz.drop, true, 'enforced + not permitted = drop');
  const throwing = { rpc: async () => { throw new Error('network'); } };
  await decideAndLog(throwing, 'aggregate-hit', SITE, input, STRICT_POLICY, 'all');
});

test('decideAndLog: a throwing decide() fails closed when enforced, changes nothing in shadow, logs nothing', async () => {
  const calls = [];
  const client = { rpc: async (name, args) => { calls.push({ name, args }); return { data: null, error: null }; } };
  const broken = { visitor: null, purpose: 'statistics',
    signals: { consent: { analytics: null, marketing: null }, evidence: 'none', gpc: false }, technique: { storage: 'none', identifiers: 'none' } };
  const shadow = await decideAndLog(client, 'aggregate-hit', SITE, broken, STRICT_POLICY, undefined);
  assert.deepEqual([shadow.enforce, shadow.drop, shadow.permit], [false, false, false]);
  const enforced = await decideAndLog(client, 'aggregate-hit', SITE, broken, STRICT_POLICY, 'all');
  assert.deepEqual([enforced.enforce, enforced.drop, enforced.permit], [true, true, false]);
  assert.equal(calls.length, 0);
});

test('readLedger: latest answer first, by updated_at then created_at (as session-consent.ts)', async () => {
  const orders = [];
  const query = {
    select() { return query; }, eq() { return query; }, limit() { return query; }, maybeSingle() { return query; },
    order(col, opts) { orders.push([col, opts.ascending]); return query; },
    then(yes, no) { return Promise.resolve({ data: null, error: null }).then(yes, no); },
  };
  await readLedger({ from: () => query }, SITE, 's1', NOW);
  assert.deepEqual(orders, [['updated_at', false], ['created_at', false]]);
});

test('jurisdictionGate: shadow resolves false at once; enforced starts the policy and ledger reads together', async () => {
  const started = [];
  const client = {
    rpc: async (name) => { started.push(name); return { data: null, error: null }; },
    from: () => {
      started.push('cookie_consents');
      const q = { select: () => q, eq: () => q, order: () => q, limit: () => q, maybeSingle: () => q,
        then: (yes, no) => Promise.resolve({ data: null, error: null }).then(yes, no) };
      return q;
    },
  };
  const input = () => ({ visitor: { country: 'SE', region: null, geoSource: 'ip' }, purpose: 'statistics',
    signals: { consent: { analytics: null, marketing: null }, evidence: 'none', gpc: false }, technique: { storage: 'none', identifiers: 'none' } });
  assert.equal(await jurisdictionGate(client, 'track-event', SITE, undefined, 's1').gate(input), false, 'shadow never drops');
  await new Promise((r) => setTimeout(r, 0));

  started.length = 0;
  resetPolicyCache();
  const pending = jurisdictionGate(client, 'track-event', SITE, 'all', 's1').gate(input);
  assert.deepEqual([...started].sort(), ['cookie_consents', 'get_site_jurisdiction'], 'both reads start before either finishes');
  assert.equal(await pending, true, 'enforced + strict default + no consent = drop');
});

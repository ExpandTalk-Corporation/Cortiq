import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PACK, PACK_VERSION, usable } from '../../supabase/functions/_shared/jurisdiction/packs.ts';
import { BASELINE, CATEGORY, SHARING_PURPOSES } from '../../supabase/functions/_shared/jurisdiction/baseline.ts';
import { PRODUCTION_STATUSES, MARKETS, PURPOSES } from '../../supabase/functions/_shared/jurisdiction/types.ts';

const BANNED = [/no consent needed/i, /gdpr[- ]compliant without consent/i, /no banner needed/i];

test('baseline is opt-in for every purpose; sharing purposes are marketing', () => {
  for (const p of PURPOSES) assert.equal(BASELINE[p], 'needs_opt_in', p);
  assert.deepEqual(CATEGORY, { statistics: 'analytics', conversion: 'analytics', agent_measurement: 'analytics', attribution: 'marketing', ad_platform_sharing: 'marketing' });
  assert.deepEqual([...SHARING_PURPOSES].sort(), ['ad_platform_sharing', 'attribution']);
});

test('pack snapshot: version 2026.11.21-1, rule ids and honest statuses (changing a status is a reviewed decision)', () => {
  assert.equal(PACK.version, PACK_VERSION);
  assert.equal(PACK_VERSION, '2026.11.21-1');
  assert.deepEqual(PACK.rules.map((r) => [`${r.id}@${r.version}`, r.status]), [
    ['eu.statistics.aggregate@1', 'reviewed_agent'],
    ['world.statistics.aggregate@1', 'draft'],
    ['all.agent_measurement.server_log@1', 'draft'],
  ]);
});

test('rule invariants: sources, uncertainties, hypothesis wording, approval only when approved', () => {
  const ids = new Set();
  for (const r of PACK.rules) {
    const key = `${r.id}@${r.version}`;
    assert.ok(!ids.has(key), `duplicate ${key}`); ids.add(key);
    assert.ok(r.markets.length > 0 && r.markets.every((m) => MARKETS.includes(m)), key);
    assert.ok(r.purposes.length > 0 && r.purposes.every((p) => PURPOSES.includes(p)), key);
    assert.ok(r.sources.length > 0 && r.sources.every((s) => s.title && s.ref && /^\d{4}-\d{2}-\d{2}$/.test(s.checked)), key);
    assert.ok(r.uncertainties.length > 0, key);
    assert.match(r.assessment, /^Hypothesis/, key);
    if (r.relaxable) assert.ok(r.requiredLegalBasis, `${key} relaxable needs a legal basis`);
    if (PRODUCTION_STATUSES.includes(r.status)) {
      assert.ok(r.approval && r.approval.approvedBy && r.approval.approvedAt && r.approval.reviewDue, `${key} approval record`);
      const due = Date.parse(r.approval.reviewDue) - Date.parse(r.approval.approvedAt);
      assert.ok(due > 0 && due <= 92 * 86400e3, `${key} quarterly re-evaluation`);
    } else {
      assert.equal(r.approval, null, `${key} has an approval record but is not approved`);
    }
    for (const re of BANNED) assert.doesNotMatch(JSON.stringify(r), re, key);
  }
});

test('usable(): production statuses everywhere, draft and reviewed_agent only on test sites, suspended never', () => {
  const r = (status) => ({ ...PACK.rules[0], status });
  assert.equal(usable(r('approved_internal'), false), true);
  assert.equal(usable(r('reviewed_counsel'), false), true);
  assert.equal(usable(r('reviewed_agent'), false), false);
  assert.equal(usable(r('draft'), false), false);
  assert.equal(usable(r('draft'), true), true);
  assert.equal(usable(r('reviewed_agent'), true), true);
  assert.equal(usable(r('suspended'), true), false);
});

test('server log rule: GDPR art. 21 listed; public-authority limit in the hypothesis; UK line keeps UK GDPR legitimate interest', () => {
  const log = PACK.rules.find((r) => r.id === 'all.agent_measurement.server_log');
  assert.equal(log.outcome, 'allowed_unless_opt_out');
  assert.deepEqual(log.purposes, ['agent_measurement']);
  assert.match(log.assessment, /The art\. 21 right to object is exercised through the customer's ordinary channel/);
  assert.match(log.assessment, /CortIQ also treats `Sec-GPC: 1` as an objection by automated means \(art\. 21\(5\)\)/);
  assert.match(log.assessment, /art\. 12\(2\)/);
  assert.match(log.assessment, /art\. 21\(4\)/);
  assert.ok(log.uncertainties.some((u) => /do-not-sell-or-share signal/.test(u)));
  assert.ok(log.uncertainties.some((u) => /cannot be matched to stored hits/.test(u)));
  assert.ok(!log.uncertainties.some((u) => /still transmitted/.test(u)), 'adapters drop GPC requests at source');
  assert.ok(log.sources.some((s) => s.ref === 'https://w3c.github.io/gpc/'));
  assert.ok(!log.uncertainties.some((u) => /jurist review recommends/.test(u)));
  assert.ok(PACK.rules.every((r) => r.sources.every((s) => s.ref !== 'PR #69')));
  assert.ok(log.sources.some((s) => s.title === 'Regulation (EU) 2016/679 art. 21(1), (4) and (5); art. 12(2)' && s.ref === 'CELEX:32016R0679'));
  assert.match(log.assessment, /[Aa]rt\. 6\(1\)\(f\) is not available to public authorities in the performance of their tasks/);
  const uk = PACK.rules.find((r) => r.id === 'world.statistics.aggregate').uncertainties.find((u) => u.startsWith('UK:'));
  assert.match(uk, /UK GDPR legitimate-interest assessment is still required/);
});

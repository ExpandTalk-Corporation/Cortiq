import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { effectiveByMarket } from '../../src/lib/effectiveByMarket.ts';

test('effectiveByMarket: no profile = EU, UK, Québec at the baseline; nothing below approved_internal is listed', () => {
  const rows = effectiveByMarket({ customer: null, tighten: {} });
  assert.deepEqual([...new Set(rows.map((r) => r.market))], ['eu', 'uk', 'ca_qc']);
  for (const r of rows) {
    assert.equal(r.status, 'baseline');
    assert.deepEqual(r.ruleIds, []);
    assert.equal(r.outcome, 'needs_opt_in');
  }
});

test('effectiveByMarket: tighten applies to every market', () => {
  const rows = effectiveByMarket({ customer: { establishment: 'SE', markets: ['eu'], appliesLaws: {} }, tighten: { statistics: 'off' } });
  assert.equal(rows.find((r) => r.purpose === 'statistics').outcome, 'blocked');
});

const read = (p) => readFileSync(new URL(`../../src/components/dashboard/jurisdiction/${p}`, import.meta.url), 'utf8');
test('copy rules: disclaimer shown, forbidden phrases absent, relaxing only via approved exception', () => {
  const all = ['RulesByMarketTab.tsx', 'LegalProfileForm.tsx', 'TightenControls.tsx', 'EffectiveRulesTable.tsx'].map(read).join('\n');
  assert.match(all, /DISCLAIMER/);
  for (const bad of [/no consent needed/i, /GDPR-compliant without consent/i, /no banner needed/i]) assert.doesNotMatch(all, bad);
  // Tighten offers only opt_in and off.
  assert.match(read('TightenControls.tsx'), /\['opt_in', 'off'\]/);
  assert.doesNotMatch(read('TightenControls.tsx'), /allowed_unless_opt_out|'allowed'/);
});

test('CMPDashboard registers the tab', () => {
  const src = readFileSync(new URL('../../src/components/dashboard/CMPDashboard.tsx', import.meta.url), 'utf8');
  assert.match(src, /<TabsTrigger value="rules">Rules by market<\/TabsTrigger>/);
  assert.match(src, /<RulesByMarketTab selectedSite=\{selectedSite\} \/>/);
});

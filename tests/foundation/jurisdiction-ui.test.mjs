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
test('copy rules: disclaimer shown, forbidden phrases absent, relaxing is not offered by the tighten control', () => {
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

test('Off applies now, opt-in and market rules are recorded only; Stopped column explains what it counts', () => {
  const tab = read('RulesByMarketTab.tsx');
  assert.match(tab, /"Off" is applied now: it stops data for that purpose on this site\./);
  assert.match(tab, /"Require opt-in" and the market rules are recorded only, not yet applied/);
  assert.match(tab, /your own Off is applied now/);
  assert.doesNotMatch(tab, /data for every purpose is collected as before|nothing is stopped yet/);
  assert.ok(tab.indexOf('{NOT_YET_APPLIED}') < tab.indexOf('Make it stricter'), 'notice sits above the tighten controls');
  assert.match(read('CoverageByCountryCard.tsx'), /Counts only your own Off settings until the market rules are switched on\./);
  assert.match(read('LegalProfileForm.tsx'), /Visitors whose country we cannot verify are treated by the strictest of the markets you select\./);
});

test('copy never presents shadow decisions as applied or rules as approved (jurist review 2026-11-20)', () => {
  const tab = read('RulesByMarketTab.tsx');
  const card = read('CoverageByCountryCard.tsx');
  assert.match(tab, /None of these rules has been legally reviewed and approved yet; each is a working hypothesis\./);
  assert.match(tab, /What the rules would decide/);
  assert.match(card, /<th>Would be measured<\/th>/);
  for (const bad of [/What applies now/, /Answers decide which market rules CortIQ applies/, /opt-in is required/]) assert.doesNotMatch(tab, bad);
  assert.doesNotMatch(card, /share measured per country|<th>Measured<\/th>/);
});

test('coverage hook and card are safe without a site; tables scroll on narrow screens', () => {
  const hook = readFileSync(new URL('../../src/hooks/useCoverageByCountry.ts', import.meta.url), 'utf8');
  assert.match(hook, /selectedSite: Site \| null/);
  assert.match(hook, /useSiteJurisdiction\(siteId\)/);
  assert.match(hook, /enabled: !!siteId/);
  const card = read('CoverageByCountryCard.tsx');
  assert.doesNotMatch(card, /as Site/);
  assert.equal(card.match(/<div className="overflow-x-auto"><table/g)?.length, 3);
});

// tests/foundation/pixel-readiness-by-country.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assessPixelReadinessByCountry, MIN_COUNTRY_ANSWERS, ASSUMED_ACCEPTANCE } from '../../src/lib/pixelReadiness.ts';

const acc = (country, answers, a, m = 0) => ({ country, answers, analyticsAccepted: a, marketingAccepted: m });

test('country rate from 20 answers, site rate below that, assumed without any answers', () => {
  assert.equal(MIN_COUNTRY_ANSWERS, 20);
  const r = assessPixelReadinessByCountry({
    goalCountries: [{ country: 'SE', conversions: 40 }, { country: 'NO', conversions: 10 }, { country: '', conversions: 5 }],
    acceptance: [acc('SE', 20, 15), acc('NO', 19, 19)],
    blockedCountries: [],
  });
  const by = Object.fromEntries(r.rows.map((x) => [x.country, x]));
  assert.deepEqual([by.SE.acceptanceSource, by.SE.acceptanceUsed, by.SE.effectiveConversions], ['country', 0.75, 30]);
  const siteRate = 34 / 39;
  assert.deepEqual([by.NO.acceptanceSource, by.NO.acceptanceUsed], ['site', siteRate]);
  assert.equal(by.NO.effectiveConversions, Math.floor(10 * siteRate + 1e-9));
  assert.equal(by[''].acceptanceSource, 'site');
  assert.equal(r.totalEffective, r.rows.reduce((s, x) => s + x.effectiveConversions, 0));
  assert.deepEqual(r.rows.map((x) => x.country), ['SE', 'NO', '']);

  const none = assessPixelReadinessByCountry({ goalCountries: [{ country: 'SE', conversions: 10 }], acceptance: [], blockedCountries: [] });
  assert.deepEqual([none.rows[0].acceptanceSource, none.rows[0].acceptanceUsed], ['assumed', ASSUMED_ACCEPTANCE]);
});

test('blocked countries count as zero; marketing acceptance only when asked; bands', () => {
  const input = { goalCountries: [{ country: 'SE', conversions: 100 }, { country: 'DE', conversions: 100 }], acceptance: [acc('SE', 40, 40, 20), acc('DE', 40, 40, 40)], blockedCountries: ['DE'] };
  const a = assessPixelReadinessByCountry(input);
  assert.deepEqual(a.rows.find((x) => x.country === 'DE'), { country: 'DE', conversions: 100, acceptanceUsed: 0, acceptanceSource: 'blocked', effectiveConversions: 0 });
  assert.deepEqual([a.totalEffective, a.band], [100, 'comfortable']);
  const m = assessPixelReadinessByCountry({ ...input, category: 'marketing' });
  assert.deepEqual([m.totalEffective, m.band], [50, 'comfortable']);
  const low = assessPixelReadinessByCountry({ ...input, goalCountries: [{ country: 'SE', conversions: 35 }], category: 'marketing' });
  assert.deepEqual([low.totalEffective, low.band], [17, 'below_min']);
});

test('junk input never throws or goes negative', () => {
  const r = assessPixelReadinessByCountry({ goalCountries: [{ country: 'SE', conversions: -5 }, { country: 'NO', conversions: NaN }], acceptance: [acc('SE', 0, 0)], blockedCountries: [] });
  assert.ok(r.rows.every((x) => x.effectiveConversions === 0));
});

test('card: verify path, technical-defaults disclaimer, no forbidden phrases', () => {
  const src = readFileSync(new URL('../../src/components/dashboard/jurisdiction/CoverageByCountryCard.tsx', import.meta.url), 'utf8');
  assert.match(src, /DISCLAIMER/);
  assert.match(src, /Verify:/);
  for (const bad of [/no consent needed/i, /GDPR-compliant without consent/i, /no banner needed/i]) assert.doesNotMatch(src, bad);
  const cmp = readFileSync(new URL('../../src/components/dashboard/CMPDashboard.tsx', import.meta.url), 'utf8');
  assert.match(cmp, /<CoverageByCountryCard selectedSite=\{selectedSite\} \/>/);
});

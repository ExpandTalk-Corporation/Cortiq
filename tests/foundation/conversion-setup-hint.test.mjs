// tests/foundation/conversion-setup-hint.test.mjs
// Spec 2026-11-18 phase 1 AC1: 0 conversions came from missing or unedited goals while forms were
// being completed. The Goals view says so and offers a one-click "any form submission" goal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { conversionSetupHint, PREDEFINED_GOALS, ANY_FORM_GOAL } from '../../src/lib/conversionSetupHint.ts';
import { normalizeGoals, clientGoals } from '../../supabase/functions/_shared/conversion-goals.js';

test('hint: completed forms and no goals → no_goals', () => {
  assert.equal(conversionSetupHint({ completedForms30d: 50, goals: [] }), 'no_goals');
});
test('hint: only unedited templates → template_only', () => {
  const goals = PREDEFINED_GOALS.slice(0, 2).map((g) => ({ type: g.type, selector: g.selector }));
  assert.equal(conversionSetupHint({ completedForms30d: 3, goals }), 'template_only');
});
test('hint: a real goal, or no completed forms → ok', () => {
  assert.equal(conversionSetupHint({ completedForms30d: 3, goals: [{ type: 'form_submission', selector: '#signup' }] }), 'ok');
  assert.equal(conversionSetupHint({ completedForms30d: 0, goals: [] }), 'ok');
});
test('the one-click goal survives server normalization and reaches the tracker', () => {
  const stored = normalizeGoals([{ id: 'goal_1', ...ANY_FORM_GOAL }]);
  assert.equal(stored.length, 1);
  assert.deepEqual(clientGoals(stored).map((g) => [g.type, g.selector]), [['form_submission', 'form']]);
});
test('Goals view uses the lib and counts completed forms server-side', () => {
  const ui = readFileSync('src/components/dashboard/ConversionGoalsConfig.tsx', 'utf8');
  assert.match(ui, /from '@\/lib\/conversionSetupHint'/);
  assert.match(ui, /from\('form_sessions'\)\s*\.select\('id', \{ count: 'exact', head: true \}\)/);
  assert.match(ui, /\.not\('completed_at', 'is', null\)/);
  assert.doesNotMatch(ui, /const predefinedGoals = \[/);
});
test('the one-click goal is added as an observation goal, never primary', () => {
  // 'form' matches any form on the page, including search/login forms that aren't
  // conversions — is_primary must not be true just because it's the first goal added.
  const ui = readFileSync('src/components/dashboard/ConversionGoalsConfig.tsx', 'utf8');
  assert.match(ui, /addAnyFormGoal = \(\) => setGoals\(\[\.\.\.goals, \{ id: `goal_\$\{Date\.now\(\)\}`, \.\.\.ANY_FORM_GOAL, is_primary: false \}\]\)/);
  assert.doesNotMatch(ui, /addAnyFormGoal[\s\S]{0,120}is_primary: goals\.length === 0/);
});
test('the setup hint copy does not overclaim what was verified', () => {
  const ui = readFileSync('src/components/dashboard/ConversionGoalsConfig.tsx', 'utf8');
  // Must not claim certainty the code never checked: whether a conversion fired, or
  // that the example selectors definitely match nothing on this particular site.
  assert.doesNotMatch(ui, /no conversion was recorded/);
  assert.doesNotMatch(ui, /match no form on the site/);
  assert.match(ui, /none of them count as conversions/);
  assert.match(ui, /likely match no form on this site/);
});

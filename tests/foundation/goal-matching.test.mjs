// tests/foundation/goal-matching.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesGoal } from '../../src/lib/goalMatching.ts';

test('matches on event_name === goal.name', () => {
  assert.equal(matchesGoal({ event_name: 'demo_request', element_selector: null }, { name: 'demo_request' }), true);
});

test('falls back to the first comma-separated selector head when event_name differs', () => {
  const goal = { name: 'demo_request', selector: '.cta-button, #footer-cta' };
  assert.equal(matchesGoal({ event_name: 'other_event', element_selector: '.cta-button.primary' }, goal), true);
});

test('no match when neither name nor selector head matches', () => {
  const goal = { name: 'demo_request', selector: '.cta-button' };
  assert.equal(matchesGoal({ event_name: 'other_event', element_selector: '.nav-link' }, goal), false);
});

test('null event fields and missing selector do not match and do not throw', () => {
  assert.equal(matchesGoal({ event_name: null, element_selector: null }, { name: 'demo_request' }), false);
  assert.equal(matchesGoal({ event_name: null, element_selector: null }, { name: 'demo_request', selector: '' }), false);
});

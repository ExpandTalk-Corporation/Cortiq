import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consentJourney } from '../../supabase/functions/_shared/tracking-check/report.ts';
import { TRACKING_CHECK_SAMPLE } from '../../src/data/trackingCheckSample.ts';

const cell = (pages, of = 2, stored = []) => ({ pages, of, stored, sends: pages.length > 0 });
const row = (id, category, states, findings = []) => ({ id, name: id.toUpperCase(), category, origin: null, states, status: null, findings });

test('steps follow the tested states in order and list the active tools by category', () => {
  const rows = [
    row('ga4', 'analytics', { none: cell(['/'], 2, ['_ga']), reject: cell([]), accept: cell(['/', '/a']) }, ['consent.before_choice.ga4']),
    row('meta', 'marketing', { none: cell([]), reject: cell(['/']), accept: cell(['/']) }, ['consent.after_reject.meta']),
    row('chat', 'preferences', { none: cell(['/a']), reject: cell(['/a']), accept: cell(['/a']) }),
  ];
  const findings = [{ checkKey: 'consent.before_choice.ga4', status: 'fail' }, { checkKey: 'consent.after_reject.meta', status: 'fail' }];
  const steps = consentJourney(rows, findings);
  assert.deepEqual(steps.map((s) => s.state), ['none', 'reject', 'accept']);
  const none = steps[0];
  assert.deepEqual(none.tools.map((t) => t.id), ['ga4', 'chat']);
  assert.deepEqual(none.byCategory, { analytics: 1, preferences: 1 });
  assert.equal(none.tools[0].status, 'fail');
  assert.equal(none.tools[0].findingKey, 'consent.before_choice.ga4');
  assert.deepEqual(none.tools[0].stored, ['_ga']);
  assert.equal(none.tools[1].status, null);
  // A finding about one state never marks the same tool in another state.
  const accept = steps[2];
  assert.ok(accept.tools.every((t) => t.status === null));
  assert.equal(steps[1].tools.find((t) => t.id === 'meta').status, 'fail');
});

test('category findings mark the tool only in the single-category step it should not run in', () => {
  const rows = [row('ads', 'marketing', { accept: cell(['/']), analytics_only: cell(['/']), marketing_only: cell(['/']) }, ['consent.category.cookieless.ads'])];
  const steps = consentJourney(rows, [{ checkKey: 'consent.category.cookieless.ads', status: 'warning' }]);
  assert.equal(steps.find((s) => s.state === 'analytics_only').tools[0].status, 'warning');
  assert.equal(steps.find((s) => s.state === 'marketing_only').tools[0].status, null);
});

test('untested states are left out, and a tested state with nothing active has no tools', () => {
  const rows = [row('ga4', 'analytics', { none: cell([], 3), accept: cell(['/'], 3) })];
  const steps = consentJourney(rows, []);
  assert.deepEqual(steps.map((s) => s.state), ['none', 'accept']);
  assert.deepEqual(steps[0].tools, []);
  assert.deepEqual(consentJourney([], []), []);
});

test('the sample report has a journey with a problem before the choice and after "Reject all"', () => {
  const steps = consentJourney(TRACKING_CHECK_SAMPLE.summary.vendors, TRACKING_CHECK_SAMPLE.findings);
  assert.ok(steps.find((s) => s.state === 'none').tools.some((t) => t.status === 'fail'));
  assert.ok(steps.find((s) => s.state === 'reject').tools.some((t) => t.status === 'fail'));
});

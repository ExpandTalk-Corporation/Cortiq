import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assess } from '../../supabase/functions/_shared/tracking-check/assess/index.ts';
import { vendorMatrix } from '../../supabase/functions/_shared/tracking-check/vendor-matrix.ts';
import { cellText, matrixStates, toVendorSheet } from '../../supabase/functions/_shared/tracking-check/report.ts';
import { page, site, st, req, POLICY } from './tracking-check-fixtures.mjs';

const HS = 'https://js-eu1.hs-scripts.com/123456.js';
const GA = 'https://www.googletagmanager.com/gtag/js?id=G-6J9DFZLXNL';
const DENIED = { kind: 'default', params: { ad_storage: 'denied', analytics_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' } };

const run = () => {
  const hubspotBefore = st('none', { consentCommands: [DENIED], requests: [{ ...req(HS), initiator: 'page' }], cookies: [{ name: 'hubspotutk', domain: '.new.example' }] });
  const target = site('target', [
    page('/', { states: [hubspotBefore, st('reject'), st('accept', { requests: [req(GA), req(HS)] })] }),
    page('/pricing/', { states: [st('none', { consentCommands: [DENIED] }), st('reject'), st('accept', { requests: [req(GA), req(HS)] })] }),
    page('/blog/', { states: [st('none', { consentCommands: [DENIED] }), st('reject', { method: 'not_automated' }), st('accept', { requests: [req(GA)] })] }),
  ]);
  const findings = assess({ mode: 'policy', baseline: null, policy: POLICY, target });
  return { rows: vendorMatrix(target, findings), findings };
};

test('one row per tool, worst first, with what it did in each state', () => {
  const { rows } = run();
  assert.deepEqual(rows.map((r) => r.id), ['hubspot', 'ga4']);
  const [hs, ga] = rows;
  assert.equal(hs.status, 'fail');
  assert.equal(hs.origin, 'page');
  assert.deepEqual(hs.findings, ['consent.before_choice.hubspot']);
  assert.equal(cellText(hs.states.none), 'Stores hubspotutk (1 of 3 pages: /)');
  assert.equal(cellText(hs.states.reject), 'Nothing');
  assert.equal(hs.states.reject.of, 2, 'a reject that could not be automated is not counted');
  assert.equal(cellText(hs.states.accept), 'Sends requests (2 of 3 pages: /, /pricing/)');
  assert.equal(cellText(ga.states.accept), 'Sends requests', 'pages are left out when the tool behaved the same everywhere');
  assert.equal(cellText(undefined), 'Not tested');
  assert.deepEqual(matrixStates(rows), ['none', 'reject', 'accept']);
});

test('the By tool sheet has a column per tested state and the fix of the worst finding', () => {
  const { rows, findings } = run();
  const sheet = toVendorSheet(rows, findings);
  assert.deepEqual(sheet.columns, ['Status', 'Tool', 'Category', 'Loaded by', 'Before choice', 'After "Reject all"', 'After "Accept all"', 'Findings', 'What to do']);
  const [hs] = sheet.rows;
  assert.deepEqual(hs.slice(0, 4), ['Problem', 'HubSpot tracking code', 'Analytics', 'Page source']);
  assert.match(hs[7], /HubSpot tracking code stores data on the device before the visitor chooses/);
  assert.match(hs[8], /in the page source/);
});

test('cellText caps the page list', () => {
  const pages = Array.from({ length: 8 }, (_, i) => `/p${i}`);
  assert.equal(cellText({ pages, of: 10, stored: [] }), 'Sends requests (8 of 10 pages: /p0, /p1, /p2, /p3, /p4 +3 more)');
});

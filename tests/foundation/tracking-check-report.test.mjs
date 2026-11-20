import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, toCsv, CSV_COLUMNS, SCRIPTS_NOTE, scriptConsentText, scriptIntegrityText, scriptPagesText, toScriptSheet } from '../../supabase/functions/_shared/tracking-check/report.ts';

const f = (status, priority, scope, title, extra = {}) => ({ scope, checkKey: title.toLowerCase().replace(/\W+/g, '.'), title, status, priority,
  explanation: `${title} explained.`, fix: status === 'pass' ? '' : `Fix ${title}. Then verify.`, typicalOwner: null, evidence: { pages: ['/'], details: [] }, ...extra });

test('comparison headline counts blocking problems and lines lead with issues', () => {
  const s = summarize([f('fail', 'high', 'Tags', 'HubSpot is missing'), f('fail', 'high', 'CSP', 'CSP blocks HubSpot'),
    f('warning', 'low', 'Tags', 'Reddit is new'), f('manual', 'high', 'Consent', 'Check reject'),
    f('pass', null, 'Parameters', 'Parameters survive'), f('pass', null, 'Consent', 'Nothing before choice')], 'comparison');
  assert.equal(s.headline, '2 problems block go-live · 2 OK · 1 to review · 1 to test manually');
  assert.equal(s.blocking, 2);
  assert.deepEqual(s.lines.map((l) => l.text), ['HubSpot is missing', 'CSP blocks HubSpot', 'Reddit is new', 'Parameters survive', 'Nothing before choice']);
});

test('policy headline and pass lines skip scopes that have failures', () => {
  const ok = summarize([f('manual', 'medium', 'Manual', 'GA4 retention'), f('pass', null, 'Consent', 'Nothing after reject')], 'policy');
  assert.equal(ok.headline, 'All tested commitments are met · 1 OK · 1 to test manually');
  const bad = summarize([f('fail', 'high', 'Consent', 'Google after reject'), f('pass', null, 'Consent', 'Defaults denied')], 'policy');
  assert.equal(bad.headline, '1 problem to fix · 1 OK');
  assert.deepEqual(bad.lines.map((l) => l.text), ['Google after reject']);
});

test('policy summaries name the commitments the site was checked against', () => {
  const policy = { noGoogleBeforeConsent: false, consentDefaultsDenied: true, ga4RequiresAnalytics: false, adsRequiresMarketing: false,
    enhancedConversionsOff: true, noUnknownVendorsAfterReject: false, expectedIds: [], manualItems: [] };
  const s = summarize([f('pass', null, 'Consent', 'Defaults denied')], 'policy', policy);
  assert.deepEqual(s.commitments, ['Consent Mode v2 defaults are "denied"', 'Enhanced Conversions is off']);
  const strict = summarize([], 'policy', { ...policy, noGoogleBeforeConsent: true });
  assert.match(strict.commitments[0], /Nothing is sent to Google before consent.*Consent Mode basic/);
  assert.equal('commitments' in summarize([], 'comparison', policy), false);
});

test('CSV matches the tracker columns, maps statuses and escapes safely', () => {
  const csv = toCsv([
    f('fail', 'high', 'Tags', 'HubSpot is missing'),
    f('warning', 'medium', 'Consent', 'Extellio, cookieless', { explanation: 'Says "hello"\nline two' }),
    f('pass', null, 'Parameters', '=HYPERLINK("x")'),
  ]);
  assert.ok(csv.startsWith('﻿'));
  const lines = csv.slice(1).trimEnd().split('\r\n');
  assert.equal(lines[0], CSV_COLUMNS.map((c) => `"${c}"`).join(','));
  assert.deepEqual(CSV_COLUMNS, ['Scope', 'Details', 'Deliverable', 'Owner', 'Status', 'Priority', 'Double Check / Blocker', 'Notes']);
  assert.match(lines[1], /^"Tags","HubSpot is missing","Fix HubSpot is missing\.","","Not Started","High","Yes",/);
  assert.match(csv, /"Pending Review","Medium",""/);
  assert.match(csv, /"Says ""hello""\nline two/);
  assert.match(csv, /"'=HYPERLINK\(""x""\)","No action needed","","Completed"/);
});

test('a run where nothing could be tested says so instead of claiming no problems', () => {
  const s = summarize([f('untestable', 'medium', 'Coverage', '2 pages could not be tested'), f('manual', 'high', 'Consent', 'Check reject')], 'comparison');
  assert.match(s.headline, /^The site could not be tested automatically/);
  assert.doesNotMatch(s.headline, /No blocking problems/);
  const p = summarize([f('manual', 'high', 'Consent', 'Check reject')], 'policy');
  assert.match(p.headline, /^The site could not be tested automatically/);
  assert.doesNotMatch(p.headline, /commitments are met/);
});

test('script rows: integrity, consent and page texts, and the Scripts sheet', () => {
  const row = (extra = {}) => ({ url: 'https://code.jquery.com/jquery.min.js', host: 'code.jquery.com', vendorId: null, tool: null, firstParty: false, origin: 'page',
    states: ['accept'], beforeConsent: false, integrity: null, crossorigin: null, sha256: null, bytes: null, sriPossible: true, pages: ['/', '/a/'], pageCount: 2, of: 2, ...extra });
  assert.equal(scriptIntegrityText(row({ integrity: 'sha384-abc' })), 'Yes (sha384)');
  assert.equal(scriptIntegrityText(row({ firstParty: true })), 'No (own domain)');
  assert.equal(scriptIntegrityText(row({ sriPossible: false })), 'No (fixed hash not possible)');
  assert.equal(scriptIntegrityText(row({ origin: 'gtm', sriPossible: false })), 'No');
  assert.equal(scriptConsentText(row({ states: ['none', 'accept'] })), 'Before choice');
  assert.equal(scriptConsentText(row({ states: ['reject', 'accept'] })), 'After "Reject all"');
  assert.equal(scriptConsentText(row()), 'Only after consent');
  assert.equal(scriptConsentText(row({ states: [] })), 'Not tested');
  assert.equal(scriptPagesText(row()), 'All 2 pages');
  assert.equal(scriptPagesText(row({ pages: ['/', '/a/', '/b/'], pageCount: 3, of: 9 }), 2), '3 of 9: /, /a/ +1 more');
  const sheet = toScriptSheet([row({ integrity: 'sha384-abc', sha256: 'sha256-x', bytes: 87000 })]);
  assert.equal(sheet.rows[0][sheet.columns.indexOf('Integrity')], 'sha384-abc');
  assert.equal(sheet.rows[0][sheet.columns.indexOf('SHA-256 (measured)')], 'sha256-x');
  assert.equal(sheet.rows[0][sheet.columns.indexOf('Size')], '85 KB');
  assert.equal(sheet.rows[0][sheet.columns.indexOf('Loaded by')], 'Page source');
  // The note keeps to the plan's limits: one browser, one location, no compliance claims.
  assert.match(SCRIPTS_NOTE, /one headless browser in one location/);
  assert.doesNotMatch(SCRIPTS_NOTE, /PCI|complian/i);
});

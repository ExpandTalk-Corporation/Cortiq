import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSample, render } from '../../scripts/gtm-audit/sample-report.mjs';

test('the /gtm-audit sample report is the current audit() output', () => {
  const committed = readFileSync(new URL('../../src/data/gtmAuditSample.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(committed, render(buildSample()), 'run: node scripts/gtm-audit/sample-report.mjs');
});

test('the sample shows every check result and every migration class', () => {
  const s = buildSample();
  const byKey = Object.fromEntries(s.findings.map((f) => [f.checkKey, f.status]));
  assert.deepEqual(byKey, {
    'gtm.consent_missing': 'fail',
    'gtm.consent_inferred': 'manual',
    'gtm.identifies_visitors': 'fail',
    'gtm.consent_mode_default': 'pass',
    'gtm.multiple_destinations': 'manual',
    'gtm.dependencies': 'manual',
    'gtm.unknown_custom_html': 'manual',
    'gtm.community_template_injects': 'manual',
    'gtm.duplicate': 'warning',
    'gtm.dead': 'warning',
    'gtm.stale': 'manual',
  });
  for (const c of ['covered', 'consent_tool', 'pixel', 'conversion', 'third_party', 'keep_google', 'remove', 'review']) {
    assert.ok(s.summary.counts[c] > 0, c);
  }
  assert.equal(s.tags.length, 18);
  assert.equal(s.summary.headline, '3 of 18 tags have no consent condition · 1 identifies visitors · 3 removal candidates');
});

test('the sample shows the HubSpot listener feeding the lead conversions', () => {
  const f = buildSample().findings.find((x) => x.checkKey === 'gtm.dependencies');
  assert.ok(f.evidence.details.some((d) => d.startsWith('HubSpot form listener (') && d.includes('Google Ads - lead conversion (Google Ads)') && d.endsWith("— event 'generate_lead' (certain)")), f.evidence.details.join('\n'));
});

test('the sample shows two Meta pixel IDs', () => {
  const f = buildSample().findings.find((x) => x.checkKey === 'gtm.multiple_destinations');
  assert.equal(f.evidence.details[1], 'Meta Pixel: 2 IDs — 1234567890 (2 tags, last changed 2026-10-01), 9876543210 (1 tag, last changed 2023-03-14)');
});

test('the sample is synthetic and carries no raw HTML', () => {
  const json = JSON.stringify(buildSample());
  assert.equal(json.includes('<script'), false);
  assert.ok(json.includes('GTM-SAMPLE1'));
});

test('trigger and variable rows', () => {
  const s = buildSample();
  const unused = s.triggers.find((t) => t.name === 'Old landing page');
  assert.deepEqual(unused, { name: 'Old landing page', type: 'PAGEVIEW', tags: 0, folder: '', builtIn: false });
  assert.equal(s.triggers.find((t) => t.name === 'All Pages').builtIn, true);
  assert.ok(s.variables.some((v) => v.name === 'DLV - unused'));
});

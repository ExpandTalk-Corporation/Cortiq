import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audit, ENGINE_VERSION } from '../../supabase/functions/_shared/gtm-audit/audit.ts';
import { CHECK_KEYS } from '../../supabase/functions/_shared/gtm-audit/types.ts';
import { tag, tpl, customEvent, variable, exportOf } from '../../scripts/gtm-audit/fixture.mjs';

const small = () => exportOf({
  tags: [
    tag(1, 'LinkedIn', 'html', [tpl('html', '<script src="https://snap.licdn.com/li.lms-analytics/insight.min.js"></script>')], { folder: 40 }),
    tag(2, 'Clay', 'html', [tpl('html', '<script src="https://static.claydar.com/t.js"></script>')], { fire: [10] }),
    tag(3, 'GA4 lead', 'gaawe', [tpl('eventName', 'generate_lead')], { fire: [15] }),
    tag(4, 'Old', 'html', [], { paused: true }),
  ],
  triggers: [customEvent(10, 'CE - marketing consent', 'cookie_consent_marketing'), customEvent(15, 'CE - lead', 'generate_lead')],
  variables: [variable(30, 'GA4 ID', 'c', [tpl('value', 'G-SAMPLE')])],
  folders: [{ folderId: '40', name: 'Marketing' }],
});

test('engine version is 2', () => assert.equal(ENGINE_VERSION, 2));

test('parse errors pass through unchanged', () => {
  assert.equal(audit('{').error, 'not_json');
  assert.equal(audit({}).error, 'not_gtm');
});

test('accepts the file text as well as the parsed object', () => {
  assert.equal(audit(JSON.stringify(small())).tags.length, 4);
});

test('rows, findings and summary', () => {
  const r = audit(small());
  assert.deepEqual(r.findings.map((f) => f.checkKey), [...CHECK_KEYS]);
  const li = r.tags.find((t) => t.name === 'LinkedIn');
  assert.deepEqual(
    [li.vendorId, li.vendorName, li.typeLabel, li.triggers, li.consent, li.migration, li.migrationLabel, li.folder],
    ['linkedin', 'LinkedIn Insight Tag', 'Custom HTML', ['All Pages'], 'not_gated', 'pixel', 'Pixel tag', 'Marketing'],
  );
  assert.equal(r.tags.find((t) => t.name === 'Old').migration, 'remove');
  assert.deepEqual([r.summary.tags, r.summary.noConsent, r.summary.identifies, r.summary.removal], [4, 1, 1, 1]);
  assert.equal(r.summary.headline, '1 of 4 tags has no consent condition · 1 identifies visitors · 1 removal candidate');
  assert.equal(Object.values(r.summary.counts).reduce((a, b) => a + b, 0), 4);
});

// Review Focus 1, end to end: random damage anywhere in a valid export never throws.
test('fuzz: damaged exports never throw', () => {
  let seed = 7;
  const rand = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const JUNK = [null, 0, -1, 1e308, '', 'x', [], {}, [null], { __proto__: { polluted: true } }, true, '{{_event}}', 'cvt_1_2'];
  const damage = (node, depth) => {
    if (!node || typeof node !== 'object' || depth > 6) return;
    const keys = Object.keys(node);
    if (!keys.length) return;
    const k = keys[rand(keys.length)];
    if (rand(3) === 0) node[k] = JUNK[rand(JUNK.length)];
    else damage(node[k], depth + 1);
  };
  for (let i = 0; i < 500; i += 1) {
    const doc = small();
    for (let j = 0; j < 1 + rand(5); j += 1) damage(doc, 0);
    const r = audit(doc);
    assert.ok(r && (typeof r.error === 'string' || Array.isArray(r.tags)), `iteration ${i}`);
  }
  assert.equal({}.polluted, undefined);
});

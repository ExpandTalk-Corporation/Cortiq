import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, isParseError, MAX_FILE_BYTES } from '../../supabase/functions/_shared/gtm-audit/parse.ts';
import { templateIdOf } from '../../supabase/functions/_shared/gtm-audit/tag-types.ts';
import {
  tag, tpl, list, ms, needed, trigger, customEvent, triggerGroup, variable, template, tplType, exportOf, cond,
  ALL_PAGES, CONSENT_INIT,
} from '../../scripts/gtm-audit/fixture.mjs';

const basic = () => exportOf({
  tags: [
    tag(1, 'GA4 - lead', 'gaawe', [tpl('eventName', 'generate_lead'), list('eventSettingsTable', [ms({ parameter: 'form', parameterValue: 'contact' })])],
      { fire: [10], consent: needed('analytics_storage'), folder: 40, modified: Date.UTC(2024, 0, 2) }),
    tag(2, 'Old pixel', 'html', [tpl('html', '<script src="https://cdn.example.com/p.js"></script>')], { paused: true, fire: [] }),
    tag(3, 'Banner', tplType(22), [], { fire: [CONSENT_INIT] }),
  ],
  triggers: [
    customEvent(10, 'CE - lead', 'generate_lead', { folder: 40 }),
    triggerGroup(11, 'Group', [10, ALL_PAGES]),
    trigger(12, 'Click - CTA', 'CLICK', { filter: [cond('CONTAINS', '{{Click Classes}}', 'cta', true)] }),
  ],
  variables: [variable(30, 'GA4 ID', 'c', [tpl('value', 'G-SAMPLE')])],
  folders: [{ folderId: '40', name: 'Analytics' }],
  templates: [template(22, 'Banner CMP', { permissions: { inject_script: ['https://*.consent.example.com/*'], access_consent: [] }, gallery: ['ExampleOwner', 'example-cmp'] })],
  builtIns: ['PAGE_URL', 'EVENT'],
});

test('normalizes tags: params, consent, paused, folder, modifiedAt', () => {
  const c = parse(basic());
  assert.ok(!isParseError(c));
  assert.equal(c.publicId, 'GTM-SAMPLE1');
  assert.equal(c.exportedAt, Date.UTC(2026, 10, 1, 10, 0, 0));
  const [ga4, old, banner] = c.tags;
  assert.deepEqual(ga4.params, { eventName: 'generate_lead', eventSettingsTable: [{ parameter: 'form', parameterValue: 'contact' }] });
  assert.deepEqual(ga4.consent, { status: 'needed', types: ['analytics_storage'] });
  assert.deepEqual(ga4.firingTriggerIds, ['10']);
  assert.equal(ga4.folderId, '40');
  assert.equal(ga4.modifiedAt, Date.UTC(2024, 0, 2));
  assert.equal(old.paused, true);
  assert.deepEqual(old.firingTriggerIds, []);
  assert.deepEqual(banner.consent, { status: 'not_set', types: [] });
  assert.deepEqual(c.folders, [{ id: '40', name: 'Analytics' }]);
  assert.deepEqual(c.builtInVariables, ['PAGE_URL', 'EVENT']);
});

test('normalizes triggers, groups and adds referenced built-in triggers', () => {
  const c = parse(basic());
  const byId = Object.fromEntries(c.triggers.map((t) => [t.id, t]));
  assert.deepEqual(byId['10'].conditions, [{ type: 'EQUALS', arg0: '{{_event}}', arg1: 'generate_lead', negate: false }]);
  assert.deepEqual(byId['11'].groupTriggerIds, ['10', ALL_PAGES]);
  assert.equal(byId['12'].conditions[0].negate, true);
  assert.deepEqual(byId[ALL_PAGES], { id: ALL_PAGES, name: 'All Pages', type: 'PAGEVIEW', conditions: [], builtIn: true, groupTriggerIds: [], folderId: null });
  assert.equal(byId[CONSENT_INIT].type, 'CONSENT_INIT');
  assert.equal(byId['10'].builtIn, false);
});

test('reads template permissions, URLs and gallery reference', () => {
  const c = parse(basic());
  assert.deepEqual(c.templates, [{
    id: '22', name: 'Banner CMP', permissions: ['inject_script', 'access_consent'],
    urls: ['https://*.consent.example.com/*'], gallery: { owner: 'ExampleOwner', repository: 'example-cmp' },
  }]);
  assert.equal(templateIdOf(tplType(22)), '22');
  assert.equal(templateIdOf('cvt_22'), '22');
  assert.equal(templateIdOf('gaawe'), null);
});

test('accepts a JSON string, camelCase API enums and a missing format version', () => {
  const raw = basic();
  delete raw.exportFormatVersion;
  delete raw.exportTime;
  raw.containerVersion.tag[0].consentSettings = { consentStatus: 'needed', consentType: { type: 'list', list: [{ type: 'template', value: 'ad_storage' }] } };
  raw.containerVersion.tag[2].consentSettings = { consentStatus: 'notNeeded' };
  const c = parse(JSON.stringify(raw));
  assert.ok(!isParseError(c));
  assert.equal(c.exportedAt, null);
  assert.deepEqual(c.tags[0].consent, { status: 'needed', types: ['ad_storage'] });
  assert.equal(c.tags[2].consent.status, 'not_needed');
});

test('returns a distinct error for each bad input', () => {
  assert.equal(parse('{nope').error, 'not_json');
  assert.equal(parse('x'.repeat(MAX_FILE_BYTES + 1)).error, 'too_large');
  assert.equal(parse({ hello: 1 }).error, 'not_gtm');
  assert.equal(parse([1, 2]).error, 'not_gtm');
  assert.equal(parse(null).error, 'not_gtm');
  assert.equal(parse({ ...basic(), exportFormatVersion: 1 }).error, 'format_version');
  assert.equal(parse(exportOf({ tags: [tag(1, 'x', 'html')], usageContext: ['SERVER'] })).error, 'server_container');
  assert.equal(parse(exportOf()).error, 'empty');
  const messages = [parse('{'), parse({}), parse({ ...basic(), exportFormatVersion: 3 }), parse(exportOf())].map((e) => e.message);
  assert.equal(new Set(messages).size, messages.length);
  assert.ok(messages.every((m) => m.length > 10));
});

test('ignores __proto__ parameter keys', () => {
  const raw = JSON.parse('{"type":"TEMPLATE","key":"__proto__","value":"polluted"}');
  const c = parse(exportOf({ tags: [tag(1, 'x', 'html', [raw, tpl('html', '<p>')])] }));
  assert.deepEqual(c.tags[0].params, { html: '<p>' });
  assert.equal(Object.getPrototypeOf(c.tags[0].params), Object.prototype);
  assert.equal({}.polluted, undefined);
});

// Review Focus 1: hostile or malformed shapes never throw.
test('fuzz: mutated exports never throw', () => {
  let seed = 7;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const junk = [null, 0, -1, 'x', '', true, [], {}, [null], { type: 'LIST', list: 'nope' }, { type: 'MAP', map: [null, 1] }, JSON.parse('{"__proto__":{"x":1}}')];
  const mutate = (node, depth) => {
    if (depth > 0 && rand() < 0.15) return junk[Math.floor(rand() * junk.length)];
    if (Array.isArray(node)) return node.map((n) => mutate(n, depth + 1));
    if (node && typeof node === 'object') return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, mutate(v, depth + 1)]));
    return node;
  };
  for (let i = 0; i < 500; i++) {
    const out = parse(mutate(basic(), 0));
    assert.ok(out && typeof out === 'object');
  }
});

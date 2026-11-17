import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../../supabase/functions/_shared/gtm-audit/parse.ts';
import { tagInfos } from '../../supabase/functions/_shared/gtm-audit/info.ts';
import { runRules, duplicateGroups } from '../../supabase/functions/_shared/gtm-audit/rules/index.ts';
import { EVIDENCE_LEVEL } from '../../supabase/functions/_shared/gtm-audit/rules/finding.ts';
import { CHECK_KEYS } from '../../supabase/functions/_shared/gtm-audit/types.ts';
import {
  tag, tpl, needed, trigger, customEvent, variable, template, tplType, exportOf, ALL_PAGES, CONSENT_INIT,
} from '../../scripts/gtm-audit/fixture.mjs';

const OLD = Date.UTC(2023, 0, 1);
const run = (spec) => {
  const c = parse(exportOf(spec));
  const infos = tagInfos(c);
  return { infos, byKey: Object.fromEntries(runRules(c, infos).map((f) => [f.checkKey, f])) };
};
const liHtml = tpl('html', '<script src="https://snap.licdn.com/li.lms-analytics/insight.min.js"></script>');
const chatHtml = tpl('html', '<script>var s=document.createElement("script");s.src="https://cdn.example-chat.com/w.js";</script>');

test('every rule returns one GTM finding with the configuration evidence level', () => {
  const { byKey } = run({ tags: [tag(1, 'Inline', 'html', [tpl('html', '<script>1</script>')])] });
  assert.deepEqual(Object.keys(byKey), [...CHECK_KEYS]);
  for (const f of Object.values(byKey)) {
    assert.equal(f.scope, 'GTM');
    assert.equal(f.evidence.details[0], EVIDENCE_LEVEL);
    assert.deepEqual(f.evidence.pages, []);
    if (f.status === 'pass') { assert.equal(f.priority, null); assert.equal(f.fix, ''); }
  }
});

test('gtm.consent_missing: marketing tag and third-party Custom HTML without a consent condition', () => {
  const { byKey } = run({
    tags: [
      tag(1, 'LinkedIn', 'html', [liHtml]),
      tag(2, 'Chat widget', 'html', [chatHtml]),
      tag(3, 'LinkedIn gated', 'html', [liHtml], { consent: needed('ad_storage') }),
      tag(4, 'Inline push', 'html', [tpl('html', '<script>dataLayer.push({a:1})</script>')]),
      tag(5, 'GA4', 'gaawe'),
      tag(6, 'Paused LI', 'html', [liHtml], { paused: true }),
    ],
  });
  const f = byKey['gtm.consent_missing'];
  assert.deepEqual([f.status, f.priority, f.typicalOwner], ['fail', 'high', 'gtm']);
  assert.equal(f.evidence.details.length, 3);
  assert.match(f.evidence.details[1], /^LinkedIn \(LinkedIn Insight Tag\): No consent condition found/);
  assert.match(f.evidence.details[2], /^Chat widget \(Custom HTML\)/);
  assert.doesNotMatch(JSON.stringify(f), /fires without consent/i);
  assert.equal(run({ tags: [tag(3, 'LI', 'html', [liHtml], { consent: needed('ad_storage') })] }).byKey['gtm.consent_missing'].status, 'pass');
});

test('gtm.consent_inferred: consent read from the trigger name only', () => {
  const { byKey } = run({ tags: [tag(1, 'LI', 'html', [liHtml], { fire: [13] })], triggers: [trigger(13, 'Consent Analytics Trigger', 'PAGEVIEW')] });
  assert.deepEqual([byKey['gtm.consent_inferred'].status, byKey['gtm.consent_inferred'].priority], ['manual', 'medium']);
  assert.equal(byKey['gtm.consent_missing'].status, 'pass');
});

test('gtm.identifies_visitors: fail when not gated, warning when gated, owner legal', () => {
  const claydar = tpl('html', '<script src="https://static.claydar.com/t.js"></script>');
  const open = run({ tags: [tag(1, 'Clay', 'html', [claydar])] }).byKey['gtm.identifies_visitors'];
  assert.deepEqual([open.status, open.priority, open.typicalOwner], ['fail', 'high', 'legal']);
  const gated = run({
    tags: [tag(1, 'Clay', 'html', [claydar], { fire: [10] })], triggers: [customEvent(10, 'CE consent', 'cookie_consent_marketing')],
  }).byKey['gtm.identifies_visitors'];
  assert.deepEqual([gated.status, gated.priority], ['warning', 'high']);
  assert.equal(run({ tags: [tag(1, 'LI', 'html', [liHtml])] }).byKey['gtm.identifies_visitors'].status, 'pass');
});

test('gtm.consent_mode_default: Google tags need a default on Consent Initialization', () => {
  const missing = run({ tags: [tag(1, 'GA4', 'gaawe')] }).byKey['gtm.consent_mode_default'];
  assert.deepEqual([missing.status, missing.priority], ['warning', 'medium']);
  assert.match(missing.explanation, /page source/);
  const html = run({ tags: [tag(1, 'GA4', 'gaawe'), tag(2, 'Default', 'html', [tpl('html', "<script>gtag('consent', 'default', {ad_storage:'denied'})</script>")], { fire: [CONSENT_INIT] })] });
  assert.equal(html.byKey['gtm.consent_mode_default'].status, 'pass');
  const cmp = run({
    tags: [tag(1, 'GA4', 'gaawe'), tag(2, 'CMP', tplType(22), [], { fire: [CONSENT_INIT] })],
    templates: [template(22, 'CMP', { permissions: { access_consent: [] } })],
  });
  assert.equal(cmp.byKey['gtm.consent_mode_default'].status, 'pass');
  assert.equal(run({ tags: [tag(1, 'LI', 'html', [liHtml])] }).byKey['gtm.consent_mode_default'].status, 'pass');
});

test('gtm.unknown_custom_html and gtm.community_template_injects', () => {
  const { byKey } = run({
    tags: [
      tag(1, 'Chat widget', 'html', [chatHtml]),
      tag(2, 'HubSpot form listener', 'html', [tpl('html', "<script>window.addEventListener('message',function(e){if(e.data.eventName==='onFormSubmitted'){}})</script>")]),
      tag(3, 'Helper', tplType(23)),
    ],
    templates: [template(23, 'Visitor helper', { permissions: { inject_script: ['https://cdn.example-widgets.com/*'] }, gallery: ['example-dev', 'visitor-helper'] })],
  });
  const u = byKey['gtm.unknown_custom_html'];
  assert.deepEqual([u.status, u.priority, u.evidence.details.length], ['manual', 'medium', 2]);
  assert.match(u.evidence.details[1], /cdn\.example-chat\.com/);
  const c = byKey['gtm.community_template_injects'];
  assert.deepEqual([c.status, c.priority], ['manual', 'low']);
  assert.match(c.evidence.details[1], /cdn\.example-widgets\.com/);
});

test('gtm.duplicate: same vendor, ID and event on the same trigger', () => {
  const ev = (id) => tag(id, `GA4 lead ${id}`, 'gaawe', [tpl('eventName', 'generate_lead'), tpl('measurementIdOverride', '{{GA4 ID}}')], { fire: [15] });
  const spec = { tags: [ev(1), ev(2), tag(3, 'GA4 other', 'gaawe', [tpl('eventName', 'sign_up'), tpl('measurementIdOverride', '{{GA4 ID}}')], { fire: [15] })], triggers: [customEvent(15, 'CE lead', 'generate_lead')] };
  const { byKey, infos } = run(spec);
  assert.deepEqual([byKey['gtm.duplicate'].status, byKey['gtm.duplicate'].priority], ['warning', 'medium']);
  assert.deepEqual(duplicateGroups(infos).map((g) => g.map((i) => i.tag.id)), [['1', '2']]);
});

test('gtm.dead: paused tags, tags without triggers, unused triggers and variables', () => {
  const { byKey } = run({
    tags: [
      tag(1, 'Paused', 'html', [], { paused: true }),
      tag(2, 'No trigger', 'html', [], { fire: [] }),
      tag(3, 'Uses var', 'html', [tpl('html', '<script>var id = "{{Pixel ID}}"</script>')], { fire: [10] }),
    ],
    triggers: [customEvent(10, 'Used', 'x'), trigger(14, 'Old landing page', 'PAGEVIEW')],
    variables: [variable(30, 'Pixel ID', 'c', [tpl('value', '123')]), variable(31, 'DLV unused', 'v', [tpl('name', 'unused')])],
  });
  const f = byKey['gtm.dead'];
  assert.deepEqual([f.status, f.priority], ['warning', 'low']);
  assert.deepEqual(f.evidence.details.slice(1), ['Paused tag: Paused', 'Tag without a firing trigger: No trigger', 'Unused trigger: Old landing page', 'Unused variable: DLV unused']);
});

test('gtm.stale: active tags unchanged for more than 24 months before the export', () => {
  const { byKey } = run({ tags: [tag(1, 'Old', 'html', [], { modified: OLD }), tag(2, 'New', 'html'), tag(3, 'Old paused', 'html', [], { modified: OLD, paused: true })] });
  const f = byKey['gtm.stale'];
  assert.deepEqual([f.status, f.priority, f.typicalOwner, f.evidence.details.length], ['manual', 'low', 'marketing', 2]);
  assert.match(f.evidence.details[1], /2023-01-01/);
  // Without exportTime the newest tag's modifiedAt is the reference date.
  const raw = exportOf({ tags: [tag(1, 'Old', 'html', [], { modified: OLD }), tag(2, 'New', 'html')] });
  delete raw.exportTime;
  const c = parse(raw);
  assert.equal(runRules(c, tagInfos(c)).find((f) => f.checkKey === 'gtm.stale').status, 'manual');
});

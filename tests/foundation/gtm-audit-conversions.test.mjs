import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../../supabase/functions/_shared/gtm-audit/parse.ts';
import { tagInfos } from '../../supabase/functions/_shared/gtm-audit/info.ts';
import { runRules } from '../../supabase/functions/_shared/gtm-audit/rules/index.ts';
import { conversionTags, isConversion, CONVERSION_RE, EVENT_KEYS } from '../../supabase/functions/_shared/gtm-audit/conversions.ts';
import {
  tag, tpl, bool, list, ms, cond, trigger, customEvent, triggerGroup, template, tplType, exportOf, ALL_PAGES, INIT, CONSENT_INIT,
} from '../../scripts/gtm-audit/fixture.mjs';

const META = template(20, 'Meta Pixel', { permissions: { inject_script: ['https://connect.facebook.net/*'] }, gallery: ['facebookarchive', 'GoogleTagManager-WebTemplate-For-FacebookPixel'] });
const ruleOf = (spec, key) => {
  const c = parse(exportOf({ templates: [META], ...spec }));
  return runRules(c, tagInfos(c)).find((f) => f.checkKey === key);
};
const ads = (id, name, label, opts = {}, extra = []) => tag(id, name, 'awct', [tpl('conversionId', '123456789'), tpl('conversionLabel', label), ...extra], opts);
const meta = (id, name, event, opts = {}) => tag(id, name, tplType(20), [tpl('pixelId', '1234567890'), tpl('eventName', 'standard'), tpl('standardEventName', event)], opts);
const thankYou = trigger(12, 'Thank-you page', 'PAGEVIEW', { filter: [cond('CONTAINS', '{{Page Path}}', '/thank-you')] });
const formSubmit = trigger(13, 'Form submit', 'FORM_SUBMISSION');

test('conversion tags: awct, or a vendor tag whose event text matches CONVERSION_RE; active only', () => {
  assert.ok(EVENT_KEYS.includes('standardEventName') && CONVERSION_RE.test('generate_lead'));
  const c = parse(exportOf({
    templates: [META],
    tags: [
      ads(1, 'Ads', 'abc'),
      meta(2, 'Meta Lead', 'Lead'),
      meta(3, 'Meta PageView', 'PageView'),
      tag(4, 'Meta HTML', 'html', [tpl('html', "<script src=\"https://connect.facebook.net/en_US/fbevents.js\"></script><script>fbq('track', 'Purchase')</script>")]),
      tag(5, 'Inline lead push', 'html', [tpl('html', "<script>dataLayer.push({event:'lead'})</script>")]),
      ads(6, 'Paused Ads', 'abc', { paused: true }),
    ],
  }));
  const infos = tagInfos(c);
  assert.deepEqual(infos.filter(isConversion).map((i) => i.tag.name), ['Ads', 'Meta Lead', 'Meta HTML', 'Paused Ads']);
  assert.deepEqual(conversionTags(c, infos).map((i) => i.tag.name), ['Ads', 'Meta Lead', 'Meta HTML']);
});

test('gtm.conversion_on_every_page: built-in and unconditioned page triggers', () => {
  const f = ruleOf({
    tags: [
      ads(1, 'Ads all pages', 'a'),
      ads(2, 'Ads init', 'b', { fire: [INIT] }),
      ads(3, 'Ads consent init', 'c', { fire: [CONSENT_INIT] }),
      ads(4, 'Ads page view', 'd', { fire: [10] }),
      ads(5, 'Ads DOM ready', 'e', { fire: [11] }),
      meta(6, 'Meta Lead', 'Lead', { fire: [14] }),
      meta(7, 'Meta PageView', 'PageView'),
      ads(8, 'Ads thank-you', 'f', { fire: [12] }),
      ads(9, 'Ads paused', 'g', { paused: true }),
    ],
    triggers: [trigger(10, 'Every page view', 'PAGEVIEW'), trigger(11, 'DOM Ready', 'DOM_READY'), thankYou, trigger(14, 'Window loaded', 'WINDOW_LOADED')],
  }, 'gtm.conversion_on_every_page');
  assert.deepEqual([f.status, f.priority, f.typicalOwner], ['warning', 'high', 'marketing']);
  assert.equal(f.title, '6 conversion tags are set to fire on every page');
  assert.deepEqual(f.evidence.details.slice(1), [
    'Ads all pages (Google Ads): All Pages',
    'Ads init (Google Ads): Initialization - All Pages',
    'Ads consent init (Google Ads): Consent Initialization - All Pages',
    'Ads page view (Google Ads): Every page view',
    'Ads DOM ready (Google Ads): DOM Ready',
    'Meta Lead (Meta Pixel): Window loaded',
  ]);
  assert.match(f.explanation, /inflates/);
  assert.match(f.explanation, /bidding/);
  assert.match(f.fix, /confirmation page|form-submit/);
});

test('gtm.conversion_on_every_page: a conditioned page view passes', () => {
  const f = ruleOf({ tags: [ads(1, 'Ads', 'a', { fire: [12] }), ads(2, 'Ads form', 'b', { fire: [13] })], triggers: [thankYou, formSubmit] }, 'gtm.conversion_on_every_page');
  assert.equal(f.status, 'pass');
  assert.equal(f.priority, null);
});

test('gtm.conversion_on_every_page: a trigger group is every-page only when every member is', () => {
  const spec = (members) => ({
    tags: [ads(1, 'Ads grouped', 'a', { fire: [20] })],
    triggers: [trigger(10, 'Every page view', 'PAGEVIEW'), trigger(11, 'DOM Ready', 'DOM_READY'), thankYou, triggerGroup(20, 'Group', members)],
  });
  const all = ruleOf(spec([10, 11]), 'gtm.conversion_on_every_page');
  assert.equal(all.status, 'warning');
  assert.deepEqual(all.evidence.details.slice(1), ['Ads grouped (Google Ads): Group']);
  assert.equal(ruleOf(spec([10, 12]), 'gtm.conversion_on_every_page').status, 'pass');
  assert.equal(ruleOf(spec([]), 'gtm.conversion_on_every_page').status, 'pass');
});

test('gtm.conversion_on_every_page: a tag with a blocking trigger is an exception and passes', () => {
  const f = ruleOf({ tags: [ads(1, 'Ads all pages, blocked', 'a', { block: [12] })], triggers: [thankYou] }, 'gtm.conversion_on_every_page');
  assert.equal(f.status, 'pass');
});

test('an awct tag that only runs as a setup tag still counts (effectivelyActive)', () => {
  const f = ruleOf({
    tags: [ads(1, 'Ads setup', 'a', { fire: [] }), tag(2, 'Runner', 'html', [tpl('html', '<p>')], { fire: [13], setup: ['Ads setup'] })],
    triggers: [formSubmit],
  }, 'gtm.enhanced_conversions_off');
  assert.equal(f.status, 'manual');
  assert.deepEqual(f.evidence.details.slice(1), ['Ads setup (Google Ads)']);
});

test('gtm.conversion_double_count: same vendor, same trigger, different conversion labels', () => {
  const f = ruleOf({
    tags: [ads(1, 'Ads lead', 'LEADlabel', { fire: [13] }), ads(2, 'Ads signup', 'SIGNUPlabel', { fire: [13] }), ads(3, 'Ads other trigger', 'OTHER', { fire: [12] })],
    triggers: [thankYou, formSubmit],
  }, 'gtm.conversion_double_count');
  assert.deepEqual([f.status, f.priority, f.typicalOwner], ['warning', 'high', 'marketing']);
  assert.deepEqual(f.evidence.details.slice(1), ['Form submit: Ads lead (LEADlabel), Ads signup (SIGNUPlabel)']);
  assert.match(f.explanation, /Primary/);
  assert.match(f.explanation, /Secondary/);
  assert.match(f.fix, /Secondary in Google Ads/);
});

test('gtm.conversion_double_count: Meta Lead and CompleteRegistration on one trigger', () => {
  const f = ruleOf({ tags: [meta(1, 'Meta Lead', 'Lead', { fire: [13] }), meta(2, 'Meta Reg', 'CompleteRegistration', { fire: [13] })], triggers: [formSubmit] }, 'gtm.conversion_double_count');
  assert.equal(f.status, 'warning');
  assert.deepEqual(f.evidence.details.slice(1), ['Form submit: Meta Lead (Lead), Meta Reg (CompleteRegistration)']);
});

test('gtm.conversion_double_count: same event is left to gtm.duplicate; other vendors and paused tags pass', () => {
  const same = { tags: [ads(1, 'Ads A', 'SAME', { fire: [13] }), ads(2, 'Ads B', 'SAME', { fire: [13] })], triggers: [formSubmit] };
  assert.equal(ruleOf(same, 'gtm.conversion_double_count').status, 'pass');
  assert.equal(ruleOf(same, 'gtm.duplicate').status, 'warning');
  const vendors = { tags: [ads(1, 'Ads', 'LEAD', { fire: [13] }), meta(2, 'Meta Lead', 'Lead', { fire: [13] })], triggers: [formSubmit] };
  assert.equal(ruleOf(vendors, 'gtm.conversion_double_count').status, 'pass');
  const paused = { tags: [ads(1, 'Ads A', 'A', { fire: [13] }), ads(2, 'Ads B', 'B', { fire: [13], paused: true })], triggers: [formSubmit] };
  assert.equal(ruleOf(paused, 'gtm.conversion_double_count').status, 'pass');
  const pageView = { tags: [meta(1, 'Meta PageView', 'PageView', { fire: [13] }), meta(2, 'Meta Lead', 'Lead', { fire: [13] })], triggers: [formSubmit] };
  assert.equal(ruleOf(pageView, 'gtm.conversion_double_count').status, 'pass');
  const ga4 = { tags: [tag(1, 'GA4 lead', 'gaawe', [tpl('eventName', 'generate_lead')], { fire: [13] }), tag(2, 'GA4 submit', 'gaawe', [tpl('eventName', 'form_submit')], { fire: [13] })], triggers: [formSubmit] };
  assert.equal(ruleOf(ga4, 'gtm.conversion_double_count').status, 'pass');
});

test('gtm.enhanced_conversions_off: manual when no awct tag shows Enhanced Conversions', () => {
  const f = ruleOf({ tags: [ads(1, 'Ads lead', 'a', { fire: [13] }), ads(2, 'Ads EC', 'b', { fire: [13] }, [bool('enableEnhancedConversion', true)])], triggers: [formSubmit] }, 'gtm.enhanced_conversions_off');
  assert.deepEqual([f.status, f.priority, f.typicalOwner], ['manual', 'low', 'marketing']);
  assert.deepEqual(f.evidence.details.slice(1), ['Ads lead (Google Ads)']);
  assert.match(f.explanation, /automatic Enhanced Conversions/);
  assert.match(f.explanation, /in Google Ads/);
  assert.match(f.explanation, /hashed/);
  assert.match(f.explanation, /marketing consent/);
  assert.match(f.explanation, /privacy policy/);
  assert.match(f.fix, /marketing consent/);
  assert.doesNotMatch(JSON.stringify(f), /you should/i);
});

test('gtm.enhanced_conversions_off: passes on the tag param, an awud tag or Google tag user data (not awcc, which is call tracking)', () => {
  const key = 'gtm.enhanced_conversions_off';
  const base = ads(1, 'Ads', 'a', { fire: [13] });
  const triggers = [formSubmit];
  assert.equal(ruleOf({ tags: [tag(1, 'GA4', 'gaawe', [tpl('eventName', 'purchase')])] }, key).status, 'pass');
  assert.equal(ruleOf({ tags: [ads(1, 'Ads', 'a', { fire: [13] }, [bool('enableEnhancedConversion', true)])], triggers }, key).status, 'pass');
  assert.equal(ruleOf({ tags: [ads(1, 'Ads', 'a', { fire: [13] }, [bool('enableEnhancedConversion', false)])], triggers }, key).status, 'manual');
  assert.equal(ruleOf({ tags: [base, tag(2, 'User data', 'awud', [], { fire: [13] })], triggers }, key).status, 'pass');
  assert.equal(ruleOf({ tags: [base, tag(2, 'Calls', 'awcc', [], { fire: [13] })], triggers }, key).status, 'manual');
  assert.equal(ruleOf({ tags: [base, tag(2, 'User data', 'awud', [], { fire: [13], paused: true })], triggers }, key).status, 'manual');
  const googtag = (params) => tag(2, 'Google tag', 'googtag', [tpl('tagId', 'AW-123456789'), ...params], { fire: [INIT] });
  assert.equal(ruleOf({ tags: [base, googtag([tpl('user_data', '{{User data}}')])], triggers }, key).status, 'pass');
  assert.equal(ruleOf({ tags: [base, googtag([list('configSettingsTable', [ms({ parameter: 'allow_enhanced_conversions', parameterValue: 'true' })])])], triggers }, key).status, 'pass');
  assert.equal(ruleOf({ tags: [base, googtag([])], triggers }, key).status, 'manual');
  assert.equal(ruleOf({ tags: [ads(1, 'Ads', 'a', { paused: true })] }, key).status, 'pass');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../../supabase/functions/_shared/gtm-audit/parse.ts';
import { tagInfos } from '../../supabase/functions/_shared/gtm-audit/info.ts';
import { fragileUses } from '../../supabase/functions/_shared/gtm-audit/fragile.ts';
import { runRules } from '../../supabase/functions/_shared/gtm-audit/rules/index.ts';
import { tag, tpl, cond, trigger, triggerGroup, variable, exportOf } from '../../scripts/gtm-audit/fixture.mjs';

const uses = (spec) => {
  const c = parse(exportOf(spec));
  return fragileUses(c, tagInfos(c)).map((u) => `${u.tag.tag.name}: ${u.source}`).sort();
};
const ruleOf = (spec) => {
  const c = parse(exportOf(spec));
  return runRules(c, tagInfos(c)).find((f) => f.checkKey === 'gtm.fragile_dom');
};

test('each fragile source type', () => {
  assert.deepEqual(uses({
    tags: [
      tag(1, 'Css', 'gaawe', [tpl('eventName', 'a')], { fire: [10] }),
      tag(2, 'ClickText', 'gaawe', [tpl('eventName', 'b')], { fire: [11] }),
      tag(3, 'FormId', 'gaawe', [tpl('eventName', 'c')], { fire: [12] }),
      tag(4, 'Visible', 'gaawe', [tpl('eventName', 'd')], { fire: [13] }),
      tag(5, 'DomVar', 'gaawe', [tpl('eventName', '{{Price el}}')]),
      tag(6, 'JsVar', 'gaawe', [tpl('eventName', '{{Read title}}')]),
      tag(7, 'SafeJs', 'gaawe', [tpl('eventName', '{{Safe js}}')]),
      tag(8, 'PagePath', 'gaawe', [tpl('eventName', 'e')], { fire: [14] }),
    ],
    triggers: [
      trigger(10, 'CTA click', 'CLICK', { filter: [cond('CSS_SELECTOR', '{{Click Element}}', '.btn-primary')] }),
      trigger(11, 'Buy text', 'LINK_CLICK', { filter: [cond('EQUALS', '{{Click Text}}', 'Buy now')] }),
      trigger(12, 'Form id', 'FORM_SUBMISSION', { filter: [cond('EQUALS', '{{Form ID}}', 'contact')] }),
      trigger(13, 'Hero seen', 'ELEMENT_VISIBILITY', { params: [tpl('selectorType', 'CSS'), tpl('elementSelector', '#hero')] }),
      trigger(14, 'Path', 'PAGEVIEW', { filter: [cond('EQUALS', '{{Page Path}}', '/x')] }),
    ],
    variables: [
      variable(1, 'Price el', 'd', [tpl('elementId', 'price')]),
      variable(2, 'Read title', 'jsm', [tpl('javascript', 'function(){return document.querySelector("h1").innerText}')]),
      variable(3, 'Safe js', 'jsm', [tpl('javascript', 'function(){return 1}')]),
    ],
  }), [
    'ClickText: link click trigger "Buy text" checks Click Text "Buy now"',
    'Css: click trigger "CTA click" matches CSS selector ".btn-primary"',
    'DomVar: DOM element variable "{{Price el}}"',
    'FormId: form trigger "Form id" checks Form ID "contact"',
    'JsVar: Custom JavaScript variable "{{Read title}}" reads the page',
    'Visible: element visibility trigger "Hero seen" watches "#hero"',
  ]);
});

test('a tag reached through a trigger group, and a DOM variable through a chain', () => {
  assert.deepEqual(uses({
    tags: [tag(1, 'Grouped', 'gaawe', [], { fire: [20] }), tag(2, 'Chained', 'gaawe', [tpl('eventName', '{{Outer}}')]), tag(3, 'Paused', 'gaawe', [], { fire: [10], paused: true })],
    triggers: [trigger(10, 'CTA', 'CLICK', { filter: [cond('CSS_SELECTOR', '{{Click Element}}', '.cta')] }), triggerGroup(20, 'Group', [10])],
    variables: [variable(1, 'Outer', 'jsm', [tpl('javascript', 'function(){return {{Inner}}}')]), variable(2, 'Inner', 'd', [tpl('elementId', 'x')])],
  }), ['Chained: DOM element variable "{{Inner}}"', 'Grouped: click trigger "CTA" matches CSS selector ".cta"']);
});

test('gtm.fragile_dom: medium on a conversion, low otherwise; pass when none', () => {
  const triggers = [trigger(10, 'CTA', 'CLICK', { filter: [cond('CSS_SELECTOR', '{{Click Element}}', '.cta')] })];
  const conv = ruleOf({ tags: [tag(1, 'Lead conversion', 'awct', [tpl('conversionId', '111111111')], { fire: [10] })], triggers });
  assert.equal(conv.status, 'manual');
  assert.equal(conv.priority, 'medium');
  assert.equal(conv.typicalOwner, 'developer');
  assert.equal(conv.title, '1 tag relies on page markup');
  assert.deepEqual(conv.evidence.details.slice(1), ['Lead conversion (Google Ads): click trigger "CTA" matches CSS selector ".cta"']);
  assert.equal(conv.explanation, "These tags' triggers depend on page markup (a CSS class, element ID or button text). A redesign or a text change can stop them without any error, and the tag silently stops counting.");
  assert.equal(conv.fix, "Have the site push a named event when the action happens (for example `dataLayer.push({event: 'generate_lead'})`) and trigger on that event instead.");
  const ga = ruleOf({ tags: [tag(1, 'Click event', 'gaawe', [tpl('eventName', 'cta')], { fire: [10] })], triggers });
  assert.equal(ga.priority, 'low');
  const none = ruleOf({ tags: [tag(1, 'Inline', 'html', [tpl('html', '<p>')])] });
  assert.equal(none.status, 'pass');
  assert.equal(none.title, 'No tag relies on page markup');
});

test('a trigger-less setup tag of an active tag is checked', () => {
  assert.deepEqual(uses({
    tags: [tag(1, 'Prep', 'gaawe', [tpl('eventName', '{{Btn}}')], { fire: [] }), tag(2, 'Main', 'gaawe', [], { setup: ['Prep'] })],
    variables: [variable(1, 'Btn', 'd', [tpl('elementId', 'cta')])],
  }), ['Prep: DOM element variable "{{Btn}}"']);
});

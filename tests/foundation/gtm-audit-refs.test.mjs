import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../../supabase/functions/_shared/gtm-audit/parse.ts';
import {
  MAX_VAR_DEPTH, variableRefs, variableByName, firingTriggers, expandVars, varsUsedBy,
} from '../../supabase/functions/_shared/gtm-audit/refs.ts';
import { tag, tpl, cond, trigger, customEvent, triggerGroup, variable, exportOf, ALL_PAGES } from '../../scripts/gtm-audit/fixture.mjs';

test('parse keeps setup and teardown tag names, and ignores wrong types', () => {
  const raw = exportOf({ tags: [tag(1, 'Main', 'html', [], { setup: ['Setup A'], teardown: ['Clean up'] }), tag(2, 'Plain', 'html')] });
  raw.containerVersion.tag.push({ tagId: '3', name: 'Odd', type: 'html', setupTag: 'nope', teardownTag: [{ tagName: 7 }, null, {}] });
  const c = parse(raw);
  assert.deepEqual(c.tags[0].setupTagNames, ['Setup A']);
  assert.deepEqual(c.tags[0].teardownTagNames, ['Clean up']);
  assert.deepEqual(c.tags[1].setupTagNames, []);
  assert.deepEqual(c.tags[2].setupTagNames, []);
  assert.deepEqual(c.tags[2].teardownTagNames, ['7']);
});

test('parse keeps trigger params and the custom-event match', () => {
  const c = parse(exportOf({
    tags: [tag(1, 'T', 'html', [], { fire: [10, 11, 12, 13, 14, 15, 16] })],
    triggers: [
      customEvent(10, 'Equals', 'form_ok'),
      trigger(11, 'Contains', 'CUSTOM_EVENT', { custom: [cond('CONTAINS', '{{_event}}', 'lead')] }),
      trigger(12, 'Starts', 'CUSTOM_EVENT', { custom: [cond('STARTS_WITH', '{{Event}}', 'gtm.')] }),
      trigger(13, 'Regex', 'CUSTOM_EVENT', { custom: [cond('MATCH_REGEX', '{{_event}}', '^(a|b)$')] }),
      trigger(14, 'Negated', 'CUSTOM_EVENT', { custom: [cond('EQUALS', '{{_event}}', 'x', true)] }),
      trigger(15, 'Other var', 'CUSTOM_EVENT', { custom: [cond('EQUALS', '{{Page Path}}', '/x')] }),
      trigger(16, 'Visible', 'ELEMENT_VISIBILITY', { params: [tpl('elementSelector', '.hero')] }),
    ],
  }));
  const by = Object.fromEntries(c.triggers.map((t) => [t.name, t]));
  assert.deepEqual(by.Equals.customEvent, { match: 'equals', value: 'form_ok' });
  assert.deepEqual(by.Contains.customEvent, { match: 'contains', value: 'lead' });
  assert.deepEqual(by.Starts.customEvent, { match: 'starts_with', value: 'gtm.' });
  assert.deepEqual(by.Regex.customEvent, { match: 'regex', value: '^(a|b)$' });
  assert.equal(by.Negated.customEvent, null);
  assert.equal(by['Other var'].customEvent, null);
  assert.equal(by.Visible.params.elementSelector, '.hero');
  const allPages = parse(exportOf({ tags: [tag(1, 'T', 'html')] })).triggers.find((t) => t.id === ALL_PAGES);
  assert.deepEqual(allPages.params, {});
  assert.equal(allPages.customEvent, null);
});

test('variableRefs collects names inside {{…}} from nested values', () => {
  assert.deepEqual(variableRefs({ a: 'x {{One}} y', b: ['{{Two}}', { c: '{{One}}' }], d: '{{ bad' }), ['One', 'Two']);
  assert.deepEqual(variableRefs('no refs'), []);
});

test('variableByName: first variable with a name wins; no prototype keys', () => {
  const c = parse(exportOf({ tags: [tag(1, 'T', 'html')], variables: [variable(1, 'X', 'c', [tpl('value', 'first')]), variable(2, 'X', 'c', [tpl('value', 'second')])] }));
  assert.equal(variableByName('X', c).params.value, 'first');
  assert.equal(variableByName('constructor', c), undefined);
});

test('firingTriggers expands trigger groups, nested groups and cycles once each', () => {
  const raw = exportOf({
    tags: [tag(1, 'T', 'html', [], { fire: [20] })],
    triggers: [customEvent(10, 'A', 'a'), triggerGroup(21, 'Inner', [10, 20]), triggerGroup(20, 'Outer', [21])],
  });
  const c = parse(raw);
  assert.deepEqual(firingTriggers(c.tags[0], c).map((t) => t.name).sort(), ['A', 'Inner', 'Outer']);
});

test(`expandVars follows variable chains ${MAX_VAR_DEPTH} levels deep and stops`, () => {
  const vars = Array.from({ length: 8 }, (_, n) => variable(n + 1, `V${n}`, 'jsm', [tpl('javascript', n < 7 ? `function(){return {{V${n + 1}}}}` : 'function(){return 1}')]));
  const c = parse(exportOf({ tags: [tag(1, 'T', 'html', [tpl('html', '{{V0}}')])], variables: vars }));
  const names = expandVars(['V0'], c).map((v) => v.name);
  assert.ok(names.includes('V5'));
  assert.equal(names.includes('V6'), false);
});

test('expandVars ends on cycles and self references', () => {
  const c = parse(exportOf({
    tags: [tag(1, 'T', 'html')],
    variables: [variable(1, 'A', 'jsm', [tpl('javascript', '{{B}}')]), variable(2, 'B', 'jsm', [tpl('javascript', '{{A}}{{B}}')])],
  }));
  assert.deepEqual(expandVars(['A'], c).map((v) => v.name), ['A', 'B']);
});

test('varsUsedBy reads tag params and firing-trigger conditions', () => {
  const c = parse(exportOf({
    tags: [tag(1, 'T', 'gaawe', [tpl('eventName', '{{Ev}}')], { fire: [10] })],
    triggers: [trigger(10, 'Click', 'CLICK', { filter: [cond('EQUALS', '{{Btn}}', 'x')] })],
    variables: [variable(1, 'Ev', 'c', [tpl('value', 'e')]), variable(2, 'Btn', 'd', [tpl('elementId', 'b')]), variable(3, 'Unused', 'c')],
  }));
  assert.deepEqual(varsUsedBy(c.tags[0], c).map((v) => v.name).sort(), ['Btn', 'Ev']);
});

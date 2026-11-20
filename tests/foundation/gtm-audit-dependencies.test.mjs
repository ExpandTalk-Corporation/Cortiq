import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../../supabase/functions/_shared/gtm-audit/parse.ts';
import { tagInfos } from '../../supabase/functions/_shared/gtm-audit/info.ts';
import { dependencies, eventMatch } from '../../supabase/functions/_shared/gtm-audit/dependencies.ts';
import {
  tag, tpl, cond, trigger, customEvent, triggerGroup, variable, template, tplType, needed, exportOf, CONSENT_INIT,
} from '../../scripts/gtm-audit/fixture.mjs';

const push = (event) => tpl('html', `<script>dataLayer.push({event: '${event}'})</script>`);
const deps = (spec) => {
  const c = parse(exportOf(spec));
  const name = new Map(c.tags.map((t) => [t.id, t.name]));
  return dependencies(c, tagInfos(c)).map((d) => `${name.get(d.from)} -> ${name.get(d.to)} | ${d.kind} ${d.via} ${d.confidence}`).sort();
};

test('sequence: setup and teardown tags, also without their own trigger; unknown names add nothing', () => {
  assert.deepEqual(deps({
    tags: [
      tag(1, 'Main', 'html', [], { setup: ['Prep', 'Missing'], teardown: ['After'] }),
      tag(2, 'Prep', 'html', [], { fire: [] }),
      tag(3, 'After', 'html'),
      tag(4, 'Self', 'html', [], { setup: ['Self'] }),
    ],
  }), ['After -> Main | sequence teardown certain', 'Prep -> Main | sequence setup certain']);
});

test('sequence: a duplicated name links to the first non-paused tag', () => {
  assert.deepEqual(deps({
    tags: [
      tag(1, 'Prep', 'html', [], { paused: true }),
      tag(2, 'Main', 'html', [], { setup: ['Prep'] }),
      tag(3, 'Prep', 'html'),
      tag(4, 'Prep', 'html'),
    ],
  }), ['Prep -> Main | sequence setup certain']);
});

test('event: equals is certain, contains/regex possible, groups followed, no self edge', () => {
  assert.deepEqual(deps({
    tags: [
      tag(1, 'Pusher', 'html', [tpl('html', "<script>dataLayer.push({'event':\"form_ok\", x: 1});dataLayer.push({ event: 'lead_done' })</script>")]),
      tag(2, 'Exact', 'gaawe', [], { fire: [10] }),
      tag(3, 'Contains', 'gaawe', [], { fire: [11] }),
      tag(4, 'Regex', 'gaawe', [], { fire: [12] }),
      tag(5, 'Grouped', 'gaawe', [], { fire: [13] }),
      tag(6, 'Echo', 'html', [push('echo')], { fire: [14] }),
    ],
    triggers: [
      customEvent(10, 'CE form_ok', 'form_ok'),
      trigger(11, 'CE contains lead', 'CUSTOM_EVENT', { custom: [cond('CONTAINS', '{{_event}}', 'lead')] }),
      trigger(12, 'CE regex', 'CUSTOM_EVENT', { custom: [cond('MATCH_REGEX', '{{_event}}', '^form_(ok|fail)$')] }),
      triggerGroup(13, 'Group', [10]),
      customEvent(14, 'CE echo', 'echo'),
    ],
  }), [
    'Pusher -> Contains | event lead_done possible',
    'Pusher -> Exact | event form_ok certain',
    'Pusher -> Grouped | event form_ok certain',
    'Pusher -> Regex | event form_ok possible',
  ]);
});

test('eventMatch: hostile and uncompilable regexes', () => {
  const t = (value) => ({ customEvent: { match: 'regex', value } });
  assert.equal(eventMatch(t('^(a+)+$'), 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!'), 'possible');
  assert.equal(eventMatch(t('a*a*a*b'), 'aaaa'), 'possible');
  assert.equal(eventMatch(t('x'.repeat(201)), 'y'), 'possible');
  assert.equal(eventMatch(t('(unclosed'), 'unclosed'), null);
  assert.equal(eventMatch(t('^(gtm\\.)?click$'), 'gtm.click'), 'possible');
  assert.equal(eventMatch(t('^click$'), 'other'), null);
  assert.equal(eventMatch({ customEvent: null }, 'x'), null);
  // Two quantifiers ('a*' twice) — not run, so a non-matching event still comes back 'possible'.
  assert.equal(eventMatch(t('a*a*$'), 'b'), 'possible');
});

test('event: 50 hostile regex triggers and 100 pushed events finish quickly', () => {
  const html = Array.from({ length: 100 }, (_, n) => `dataLayer.push({event:'${'a'.repeat(90)}${n}'});`).join('');
  const triggers = Array.from({ length: 50 }, (_, n) => trigger(100 + n, `R${n}`, 'CUSTOM_EVENT', { custom: [cond('MATCH_REGEX', '{{_event}}', n % 2 ? '^(a+)+$' : 'a*a*$')] }));
  const tags = [tag(1, 'Pusher', 'html', [tpl('html', `<script>${html}</script>`)]), ...triggers.map((t, n) => tag(10 + n, `L${n}`, 'gaawe', [], { fire: [100 + n] }))];
  const t0 = performance.now();
  const c = parse(exportOf({ tags, triggers }));
  dependencies(c, tagInfos(c));
  assert.ok(performance.now() - t0 < 1000);
});

test('consent_tool: CMP tag to every gated tag', () => {
  const cmp = template(22, 'Cookiebot CMP', { permissions: { inject_script: ['https://*.cookiebot.com/*'], access_consent: [] }, gallery: ['cybotcorp', 'gtm-templates-cookiebot-cmp'] });
  assert.deepEqual(deps({
    templates: [cmp],
    tags: [
      tag(1, 'CMP', tplType(22), [], { fire: [CONSENT_INIT] }),
      tag(2, 'Gated', 'html', [tpl('html', '<script src="https://snap.licdn.com/x.js"></script>')], { consent: needed('ad_storage') }),
      tag(3, 'Open', 'html', [tpl('html', '<script src="https://snap.licdn.com/x.js"></script>')]),
    ],
  }), ['CMP -> Gated | consent_tool Cookiebot certain']);
});

test('global and cookie edges are possible, also through a variable chain', () => {
  assert.deepEqual(deps({
    tags: [
      tag(1, 'Setter', 'html', [tpl('html', "<script>window.leadScore = 5; document.cookie = 'seg=b2b; path=/'</script>")]),
      tag(2, 'Reads global', 'gaawe', [tpl('eventName', '{{Wrapper}}')]),
      tag(3, 'Reads cookie', 'gaawe', [], { fire: [10] }),
      tag(4, 'Reads dataLayer', 'gaawe', [tpl('eventName', '{{JS dataLayer}}')]),
    ],
    triggers: [trigger(10, 'Seg', 'PAGEVIEW', { filter: [cond('EQUALS', '{{Cookie seg}}', 'b2b')] })],
    variables: [
      variable(1, 'Wrapper', 'jsm', [tpl('javascript', 'function(){return {{JS score}}}')]),
      variable(2, 'JS score', 'j', [tpl('name', 'window.leadScore')]),
      variable(3, 'Cookie seg', 'k', [tpl('name', 'seg')]),
      variable(4, 'JS dataLayer', 'j', [tpl('name', 'dataLayer')]),
    ],
  }), ['Setter -> Reads cookie | cookie seg possible', 'Setter -> Reads global | global leadScore possible']);
});

test('paused tags are neither providers nor dependents', () => {
  assert.deepEqual(deps({
    tags: [tag(1, 'Pusher', 'html', [push('x')], { paused: true }), tag(2, 'L', 'gaawe', [], { fire: [10] })],
    triggers: [customEvent(10, 'CE x', 'x')],
  }), []);
});

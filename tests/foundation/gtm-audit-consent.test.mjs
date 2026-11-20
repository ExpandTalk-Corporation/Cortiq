import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../../supabase/functions/_shared/gtm-audit/parse.ts';
import { consentStatus, isConsentTrigger } from '../../supabase/functions/_shared/gtm-audit/consent.ts';
import { tag, tpl, needed, trigger, customEvent, triggerGroup, variable, cond, exportOf, ALL_PAGES } from '../../scripts/gtm-audit/fixture.mjs';

const triggers = [
  customEvent(10, 'CE - marketing consent', 'cookie_consent_marketing'),
  customEvent(11, 'CE - Cookiebot', 'CookiebotOnAccept'),
  customEvent(12, 'CE - lead', 'generate_lead'),
  trigger(13, 'Consent Analytics Trigger', 'PAGEVIEW'),
  trigger(14, 'PV - consent var', 'PAGEVIEW', { filter: [cond('CONTAINS', '{{Marketing Consent}}', 'granted')] }),
  trigger(15, 'PV - CMP state', 'PAGEVIEW', { filter: [cond('CONTAINS', '{{CMP state}}', 'C0004')] }),
  triggerGroup(16, 'Group - lead after consent', [12, 10]),
  triggerGroup(17, 'Cycle A', [18]),
  triggerGroup(18, 'Cycle B', [17]),
  triggerGroup(19, 'Missing member', [999]),
  customEvent(20, 'Block - consent denied', 'OneTrustGroupsUpdated'),
];
const variables = [variable(30, 'CMP state', 'jsm', [tpl('javascript', 'function(){return window.OptanonActiveGroups}')])];

const status = (t) => {
  const c = parse(exportOf({ tags: [t], triggers, variables }));
  return consentStatus(c.tags[0], c);
};

test('consent settings with types → gated', () => {
  const s = status(tag(1, 'X', 'html', [], { consent: needed('ad_storage', 'analytics_storage') }));
  assert.equal(s.status, 'gated');
  assert.match(s.evidence, /ad_storage, analytics_storage/);
  assert.equal(status(tag(1, 'X', 'html', [], { consent: { consentStatus: 'NEEDED' } })).status, 'not_gated');
});

test('Google tags without consent settings → google_consent_mode', () => {
  assert.equal(status(tag(1, 'GA4', 'gaawe')).status, 'google_consent_mode');
  assert.equal(status(tag(1, 'Linker', 'gclidw')).status, 'google_consent_mode');
});

test('custom events from CMPs and consent variables gate a trigger', () => {
  assert.equal(status(tag(1, 'X', 'html', [], { fire: [10] })).status, 'gated');
  assert.equal(status(tag(1, 'X', 'html', [], { fire: [11] })).status, 'gated');
  assert.equal(status(tag(1, 'X', 'html', [], { fire: [14] })).status, 'gated');
  assert.equal(status(tag(1, 'X', 'html', [], { fire: [15] })).status, 'gated');
  assert.equal(status(tag(1, 'X', 'html', [], { fire: [16] })).status, 'gated');
  assert.equal(status(tag(1, 'X', 'html', [], { fire: [10, 12] })).status, 'not_gated');
});

test('a consent blocking trigger gates the tag', () => {
  const s = status(tag(1, 'X', 'html', [], { fire: [ALL_PAGES], block: [20] }));
  assert.equal(s.status, 'gated');
  assert.match(s.evidence, /Block - consent denied/);
});

test('consent-like trigger name only → likely_gated, with the inference stated', () => {
  const s = status(tag(1, 'X', 'html', [], { fire: [13] }));
  assert.equal(s.status, 'likely_gated');
  assert.match(s.evidence, /trigger name only/);
});

test('no consent condition → not_gated, phrased as not found', () => {
  const s = status(tag(1, 'X', 'html', [], { fire: [ALL_PAGES] }));
  assert.equal(s.status, 'not_gated');
  assert.match(s.evidence, /No consent condition found/);
  assert.doesNotMatch(s.evidence, /fires without consent/i);
  assert.equal(status(tag(1, 'X', 'html', [], { fire: [] })).status, 'not_gated');
});

// Review Focus 3: cycles and missing IDs.
test('trigger-group cycles and missing triggers do not hang or throw', () => {
  assert.equal(status(tag(1, 'X', 'html', [], { fire: [17] })).status, 'not_gated');
  assert.equal(status(tag(1, 'X', 'html', [], { fire: [19] })).status, 'not_gated');
  assert.equal(status(tag(1, 'X', 'html', [], { fire: ['424242'] })).status, 'not_gated');
  const c = parse(exportOf({ tags: [tag(1, 'X', 'html')], triggers, variables }));
  assert.equal(isConsentTrigger('10', c), true);
  assert.equal(isConsentTrigger('12', c), false);
  assert.equal(isConsentTrigger('nope', c), false);
});

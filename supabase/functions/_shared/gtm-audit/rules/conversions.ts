import type { Finding } from '../../tracking-check/types.ts';
import type { Container, GtmTrigger, TagInfo } from '../types.ts';
import { conversionTags, eventParts } from '../conversions.ts';
import { effectivelyActive, triggerById } from '../refs.ts';
import { finding, plural, tagLabel } from './finding.ts';

/** Page triggers that match every page when they have no conditions (built-ins never have any). */
const PAGE_TYPES = new Set(['PAGEVIEW', 'DOM_READY', 'WINDOW_LOADED', 'INIT', 'CONSENT_INIT']);
const USER_DATA_RE = /user_?data|user_provided_data|allow_enhanced_conversions/i;

/** A trigger group counts only when every member does; cycles and empty groups do not. */
function everyPage(t: GtmTrigger, c: Container, seen = new Set<string>()): boolean {
  if (t.conditions.length) return false;
  if (PAGE_TYPES.has(t.type)) return true;
  if (t.type !== 'TRIGGER_GROUP' || !t.groupTriggerIds.length || seen.has(t.id)) return false;
  seen.add(t.id);
  return t.groupTriggerIds.every((id) => { const m = triggerById(id, c); return !!m && everyPage(m, c, new Set(seen)); });
}

const triggerName = (id: string, c: Container): string => triggerById(id, c)?.name || `Trigger ${id}`;

export function conversionOnEveryPage(container: Container, infos: TagInfo[]): Finding {
  const lines: string[] = [];
  for (const i of conversionTags(container, infos)) {
    // A blocking trigger is an exception, so the tag no longer fires on every page.
    if (i.tag.blockingTriggerIds.length) continue;
    const hits = i.tag.firingTriggerIds.filter((id) => { const t = triggerById(id, container); return !!t && everyPage(t, container); });
    if (hits.length) lines.push(`${tagLabel(i)}: ${hits.map((id) => triggerName(id, container)).join(', ')}`);
  }
  if (!lines.length) {
    return finding('gtm.conversion_on_every_page', 'No conversion tag is set to fire on every page', 'pass', 'high', 'marketing',
      'Every conversion tag has a trigger limited to some pages or events.', '', []);
  }
  return finding('gtm.conversion_on_every_page',
    `${plural(lines.length, 'conversion tag')} ${lines.length === 1 ? 'is' : 'are'} set to fire on every page`, 'warning', 'high', 'marketing',
    'These conversion tags are set to fire on a trigger that matches every page. A conversion counted on every page view inflates conversions and feeds the bidding algorithm the wrong signal.',
    'Fire each one on the confirmation page (e.g. Page Path contains /thank-you) or on the form-submit event only.',
    lines);
}

export function conversionDoubleCount(container: Container, infos: TagInfo[]): Finding {
  const groups = new Map<string, TagInfo[]>();
  // GA4 events only become conversions when marked as key events in GA4, and several events on one trigger is normal.
  for (const i of conversionTags(container, infos)) {
    if (i.ident.vendorId === 'ga4') continue;
    for (const trig of new Set(i.tag.firingTriggerIds)) {
      const key = `${i.ident.vendorId}|${trig}`;
      groups.set(key, [...(groups.get(key) ?? []), i]);
    }
  }
  const lines: string[] = [];
  for (const [key, tags] of groups) {
    // Same event text on the same trigger is gtm.duplicate's case; here at least two different events.
    if (new Set(tags.map((i) => eventParts(i).join(' '))).size < 2) continue;
    const label = (i: TagInfo) => eventParts(i).filter((p) => p !== 'standard').join('/') || 'no event';
    lines.push(`${triggerName(key.slice(key.indexOf('|') + 1), container)}: ${tags.map((i) => `${i.tag.name || 'Unnamed tag'} (${label(i)})`).join(', ')}`);
  }
  if (!lines.length) {
    return finding('gtm.conversion_double_count', 'No trigger is set to send two different conversions to one vendor', 'pass', 'high', 'marketing',
      'No trigger fires conversion tags of the same vendor with different events or conversion labels.', '', []);
  }
  return finding('gtm.conversion_double_count',
    `${plural(lines.length, 'trigger')} ${lines.length === 1 ? 'is' : 'are'} set to send several conversions to one vendor`, 'warning', 'high', 'marketing',
    'Each of these triggers is set to fire two or more conversion tags of the same vendor with different events or conversion labels, so one action is counted as several conversions. In Google Ads only Primary conversion actions are used for bidding: if all but one of them are set to Secondary, the others are only reported, not double counted. The container does not show which actions are Primary.',
    'Keep one conversion per action, or set the others to Secondary in Google Ads.',
    lines);
}

export function enhancedConversionsOff(container: Container, infos: TagInfo[]): Finding {
  const running = effectivelyActive(container);
  const active = infos.filter((i) => running.has(i.tag.id));
  const awct = active.filter((i) => i.tag.type === 'awct');
  const containerWide = active.some((i) => i.tag.type === 'awud'
    || (i.tag.type === 'googtag' && USER_DATA_RE.test(JSON.stringify(i.tag.params))));
  const hits = containerWide ? [] : awct.filter((i) => i.tag.params.enableEnhancedConversion !== 'true');
  if (!hits.length) {
    return finding('gtm.enhanced_conversions_off',
      awct.length ? 'Enhanced Conversions are set up in the container' : 'No Google Ads conversion tag', 'pass', 'low', 'marketing',
      awct.length
        ? 'Every Google Ads conversion tag has Enhanced Conversions on, or the container has a user-provided data tag or Google tag setting.'
        : 'The container has no active Google Ads conversion tag.',
      '', []);
  }
  return finding('gtm.enhanced_conversions_off',
    `${plural(hits.length, 'Google Ads conversion tag')} without Enhanced Conversions in the container`, 'manual', 'low', 'marketing',
    'The container shows no Enhanced Conversions for these Google Ads conversion tags: the tag setting is off and there is no user-provided data tag or Google tag setting. Enhanced Conversions can also be switched on in Google Ads itself (automatic Enhanced Conversions), which the container export does not show. Enhanced Conversions send hashed user data, such as an email address, to Google: that needs marketing consent and a mention in the privacy policy.',
    'Check the conversion settings in Google Ads to see whether automatic Enhanced Conversions are on. Turn them on (there or in the tag) only where visitors have given marketing consent and the privacy policy mentions it.',
    hits.map(tagLabel));
}

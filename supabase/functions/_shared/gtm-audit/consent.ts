/**
 * consentStatus — whether the container configuration holds a tag back until consent. Static only:
 * conditions in Custom JavaScript variables we cannot evaluate, so the wording is always
 * "no consent condition found", never "fires without consent".
 */
import type { Container, ConsentStatus, GtmCondition, GtmTag, GtmTrigger, GtmVariable } from './types.ts';
import { GOOGLE_TYPES } from './tag-types.ts';

/** Custom event names and variable names/bodies used by CMPs and CortIQ's banner. */
export const CONSENT_RE = /consent|cookiebot|onetrust|optanon|cookieyes|usercentrics|cookieinformation|cmplz|samtycke/i;
const CONSENT_NAME_RE = /consent|cookie|gdpr|samtycke|opt.?in/i;
const EVENT_VARS = new Set(['{{_event}}', '{{Event}}']);

interface Index { triggers: Map<string, GtmTrigger>; variables: Map<string, GtmVariable> }
const cache = new WeakMap<Container, Index>();
function indexOf(c: Container): Index {
  let i = cache.get(c);
  if (!i) {
    i = { triggers: new Map(c.triggers.map((t) => [t.id, t])), variables: new Map(c.variables.map((v) => [v.name, v])) };
    cache.set(c, i);
  }
  return i;
}

function conditionIsConsent(cond: GtmCondition, variables: Map<string, GtmVariable>): boolean {
  if (EVENT_VARS.has(cond.arg0)) return CONSENT_RE.test(cond.arg1);
  const name = cond.arg0.match(/^\{\{(.+)\}\}$/)?.[1];
  if (!name) return false;
  if (CONSENT_RE.test(name)) return true;
  const v = variables.get(name);
  return !!v && CONSENT_RE.test(JSON.stringify(v.params).slice(0, 20_000));
}

function gated(id: string, idx: Index, seen: Set<string>): boolean {
  if (seen.has(id)) return false;
  seen.add(id);
  const t = idx.triggers.get(id);
  if (!t) return false;
  if (t.type === 'TRIGGER_GROUP') return t.groupTriggerIds.some((m) => gated(m, idx, seen));
  return t.conditions.some((c) => conditionIsConsent(c, idx.variables));
}

/** True when the trigger (or, for a group, any member) has a consent condition. */
export function isConsentTrigger(triggerId: string, container: Container): boolean {
  return gated(triggerId, indexOf(container), new Set());
}

export function consentStatus(tag: GtmTag, container: Container): { status: ConsentStatus; evidence: string } {
  const idx = indexOf(container);
  const nameOf = (id: string) => idx.triggers.get(id)?.name || `trigger ${id}`;
  const firing = tag.firingTriggerIds;
  const names = firing.map(nameOf).join(', ');

  if (tag.consent.status === 'needed' && tag.consent.types.length) {
    return { status: 'gated', evidence: `Consent settings require ${tag.consent.types.join(', ')}.` };
  }
  if (GOOGLE_TYPES.has(tag.type)) {
    return { status: 'google_consent_mode', evidence: 'Google tag: adapts to Consent Mode instead of being blocked; judged by the Consent Mode default check.' };
  }
  if (firing.length && firing.every((id) => isConsentTrigger(id, container))) {
    return { status: 'gated', evidence: `Every firing trigger has a consent condition (${names}).` };
  }
  const blocker = tag.blockingTriggerIds.find((id) => isConsentTrigger(id, container));
  if (blocker) return { status: 'gated', evidence: `Blocked by the consent trigger "${nameOf(blocker)}".` };
  if (firing.length && firing.every((id) => CONSENT_NAME_RE.test(nameOf(id)))) {
    return { status: 'likely_gated', evidence: `No consent condition found; consent inferred from the trigger name only (${names}).` };
  }
  return { status: 'not_gated', evidence: firing.length ? `No consent condition found on ${names}.` : 'No consent condition found; the tag has no firing trigger.' };
}

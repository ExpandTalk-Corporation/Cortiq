/**
 * Migration class per tag: what the tag could become without GTM. Phrased as facts about what exists
 * today — never as promises of features CortIQ does not have.
 */
import type { Container, MigrationClass, ParamValue, TagInfo } from './types.ts';
import { GOOGLE_TYPES } from './tag-types.ts';
import { coveredReason } from './covered.ts';
import { isConsentTrigger } from './consent.ts';
import { duplicateGroups } from './rules/hygiene.ts';
import { dependencies } from './dependencies.ts';

export const MIGRATION_LABEL: Record<MigrationClass, string> = {
  covered: 'Covered by CortIQ today',
  consent_tool: 'Consent tool — replaceable by the CortIQ banner',
  pixel: 'Pixel tag',
  conversion: 'Conversion tag — can be sent server-side',
  third_party: 'Third-party script',
  keep_google: 'Keep in Google',
  remove: 'Removal candidate',
  review: 'Review',
};

const PIXEL_VENDORS = new Set(['meta', 'linkedin', 'reddit', 'tiktok-pixel', 'pinterest-pixel', 'microsoft-ads', 'snap-pixel', 'x-pixel']);
const GOOGLE_CONVERSION = new Set(['awct', 'awcc', 'awud']);
const EVENT_KEYS = ['eventName', 'standardEventName', 'event', 'conversionLabel', 'eventType', 'customEventName'];
const CONVERSION_RE = /conversion|purchase|lead|signup|sign_up|submit|complete/i;
const PAGEVIEW_RE = /page_?view/i;
const PAGE_TYPES = new Set(['PAGEVIEW', 'DOM_READY', 'WINDOW_LOADED', 'INIT', 'CONSENT_INIT', 'HISTORY_CHANGE']);
const PIXEL_CALL_RE = /\b(?:fbq|rdt|twq|ttq|pintrk|snaptr|lintrk)\(([^)]{0,200})\)/g;

export interface MigrateContext {
  container: Container;
  /** Tag id → name of the tag it duplicates (every member of a duplicate group except the first). */
  duplicateOf: Map<string, string>;
  /** Tag id → tags that certainly rely on it (sequence, exact event, consent tool). */
  reliedOnBy: Map<string, TagInfo[]>;
}

export function migrationContext(container: Container, infos: TagInfo[]): MigrateContext {
  const duplicateOf = new Map<string, string>();
  for (const group of duplicateGroups(infos)) {
    for (const i of group.slice(1)) if (!duplicateOf.has(i.tag.id)) duplicateOf.set(i.tag.id, group[0].tag.name);
  }
  const byId = new Map(infos.map((i) => [i.tag.id, i]));
  const reliedOnBy = new Map<string, TagInfo[]>();
  for (const d of dependencies(container, infos)) {
    const to = byId.get(d.to);
    if (d.confidence !== 'certain' || !to) continue;
    const list = reliedOnBy.get(d.from) ?? [];
    if (!list.includes(to)) list.push(to);
    reliedOnBy.set(d.from, list);
  }
  return { container, duplicateOf, reliedOnBy };
}

const text = (v: ParamValue | undefined): string => (typeof v === 'string' ? v : '');

/** Event names from template fields, plus the arguments of pixel calls in Custom HTML. */
function eventText(info: TagInfo): string {
  const parts = EVENT_KEYS.map((k) => text(info.tag.params[k]));
  const html = text(info.tag.params.html).slice(0, 200_000);
  for (const m of html.matchAll(PIXEL_CALL_RE)) parts.push(m[1]);
  return parts.join(' ');
}

function firesOnPageLoad(info: TagInfo, container: Container): boolean {
  return info.tag.firingTriggerIds.some((id) => {
    const t = container.triggers.find((x) => x.id === id);
    if (!t) return false;
    return PAGE_TYPES.has(t.type) || (t.type === 'CUSTOM_EVENT' && isConsentTrigger(id, container));
  });
}

type Result = { migration: MigrationClass; reason: string };
const out = (migration: MigrationClass, reason: string): Result => ({ migration, reason });

function classify(info: TagInfo, ctx: MigrateContext): Result {
  const { tag, vendor } = info;
  if (tag.paused) return out('remove', 'Paused: it does not run.');
  if (!tag.firingTriggerIds.length) return out('remove', 'No firing trigger: it never runs.');
  const dup = ctx.duplicateOf.get(tag.id);
  if (dup) return out('remove', `Duplicate of ${dup}: same vendor, ID and event on the same trigger.`);
  if (tag.type === 'ua') return out('remove', 'Universal Analytics no longer processes data.');

  if (vendor?.kind === 'cmp') return out('consent_tool', `${vendor.name}: the CortIQ consent banner can take its place.`);
  const covered = coveredReason(info);
  if (covered) return out('covered', covered);

  if (GOOGLE_CONVERSION.has(tag.type)) return out('conversion', 'Google Ads conversion: can be sent server-side as an offline or enhanced conversion.');
  if (tag.type === 'sp') return out('pixel', 'Google Ads remarketing tag: loads in the browser.');
  if (GOOGLE_TYPES.has(tag.type)) return out('keep_google', 'Google tag: keep it in Google\'s own setup (gtag.js or GTM).');

  if (vendor && PIXEL_VENDORS.has(vendor.id)) {
    const events = eventText(info);
    if (CONVERSION_RE.test(events)) return out('conversion', `${vendor.name} conversion event: can be sent server-side through the vendor's conversions API.`);
    if (PAGEVIEW_RE.test(events)) return out('pixel', `${vendor.name} page view: the pixel loads in the browser.`);
    if (!firesOnPageLoad(info, ctx.container)) return out('conversion', `${vendor.name} on an event trigger: likely a conversion that can be sent server-side.`);
    return out('pixel', `${vendor.name} on page load: the pixel loads in the browser.`);
  }
  if (vendor && vendor.kind !== 'infrastructure') return out('third_party', `${vendor.name}: a third-party script that can be loaded directly on the site, behind consent.`);
  return out('review', 'Not identified: check what it loads and sends.');
}

/** classify(), plus the guard: a removal candidate that other tags certainly rely on becomes review (UA excepted). */
export function migrate(info: TagInfo, ctx: MigrateContext): Result {
  const base = classify(info, ctx);
  if (base.migration !== 'remove' || info.tag.type === 'ua') return base;
  const keep = (ctx.reliedOnBy.get(info.tag.id) ?? []).filter((d) => classify(d, ctx).migration !== 'remove');
  if (!keep.length) return base;
  return out('review', `Other tags rely on it: ${keep.map((d) => d.tag.name || 'Unnamed tag').join(', ')}. Remove together or rewire first.`);
}

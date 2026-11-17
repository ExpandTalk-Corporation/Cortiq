import type { Finding } from '../../tracking-check/types.ts';
import type { Container, ParamValue, TagInfo } from '../types.ts';
import { coveredReason } from '../covered.ts';
import { finding, isActive, plural, tagLabel } from './finding.ts';

const DAY = 86_400_000;
const STALE_DAYS = 730;
const ID_KEYS = ['tagId', 'measurementIdOverride', 'measurementId', 'conversionId', 'pixelId', 'pixelIds', 'pixel_id', 'partnerId', 'trackingId'];
// Meta's eventName is always the literal 'standard' for standard events — the real event lives in
// standardEventName, so the key must join every field, not just the first truthy one (same approach as
// migrate.ts's eventText), or PageView and ViewContent on the same pixel/trigger look identical.
const EVENT_KEYS = ['eventName', 'standardEventName', 'event', 'conversionLabel', 'eventType', 'customEventName'];
const text = (v: ParamValue | undefined): string => (typeof v === 'string' ? v : '');
const firstOf = (i: TagInfo, keys: string[]): string => keys.map((k) => text(i.tag.params[k])).find(Boolean) ?? '';
const eventKey = (i: TagInfo): string => EVENT_KEYS.map((k) => text(i.tag.params[k])).filter(Boolean).join(' ');
const hostsOf = (urls: string[]): string => [...new Set(urls.map((u) => { try { return new URL(u).hostname; } catch { return u; } }))].join(', ');

export function unknownCustomHtml(infos: TagInfo[]): Finding {
  const hits = infos.filter((i) => !i.tag.paused && i.tag.type === 'html' && !i.ident.vendorId && !coveredReason(i));
  if (!hits.length) return finding('gtm.unknown_custom_html', 'Every Custom HTML tag was identified', 'pass', 'medium', 'gtm', 'Each Custom HTML tag loads a known vendor or does something CortIQ covers.', '', []);
  return finding('gtm.unknown_custom_html', `${plural(hits.length, 'Custom HTML tag')} the audit could not identify`, 'manual', 'medium', 'gtm',
    'The audit could not match these Custom HTML tags to a known vendor. Check what each one loads and sends, and whether it needs consent.',
    'Name the vendor in the tag name, switch to a gallery template where one exists, or remove tags nobody owns.',
    hits.map((i) => `${tagLabel(i)}: ${i.ident.urls.length ? `loads ${hostsOf(i.ident.urls)}` : 'no external URL'}`));
}

export function communityTemplateInjects(infos: TagInfo[]): Finding {
  const hits = infos.filter((i) => !i.tag.paused && i.ident.templateOrigin === 'community' && !!i.template?.permissions.includes('inject_script'));
  if (!hits.length) return finding('gtm.community_template_injects', 'No community template injects scripts', 'pass', 'low', 'gtm', 'Every template that loads scripts is published by its vendor.', '', []);
  return finding('gtm.community_template_injects', `${plural(hits.length, 'community template')} that may load scripts`, 'manual', 'low', 'gtm',
    'These templates are not published by the vendor and may load scripts from the URLs listed in their permissions. Check who maintains each one and whether the URLs belong to the vendor.',
    "Prefer the vendor's own template; otherwise review the template's code and permission URLs before each update.",
    hits.map((i) => `${tagLabel(i)}: ${i.ident.urls.length ? hostsOf(i.ident.urls) : 'no URL listed'}`));
}

/** Tags with the same vendor, ID and event on a shared firing trigger. First tag of each group is the one to keep. */
export function duplicateGroups(infos: TagInfo[]): TagInfo[][] {
  const groups = new Map<string, TagInfo[]>();
  for (const i of infos) {
    if (i.tag.paused || !i.ident.vendorId) continue;
    const id = firstOf(i, ID_KEYS), ev = eventKey(i);
    if (!id && !ev) continue;
    for (const trig of i.tag.firingTriggerIds) {
      const key = `${i.ident.vendorId}|${id}|${ev}|${trig}`;
      groups.set(key, [...(groups.get(key) ?? []), i]);
    }
  }
  const seen = new Set<string>();
  const out: TagInfo[][] = [];
  for (const g of groups.values()) {
    const members = [...new Set(g)];
    const key = members.map((i) => i.tag.id).join(',');
    if (members.length > 1 && !seen.has(key)) { seen.add(key); out.push(members); }
  }
  return out;
}

export function duplicate(infos: TagInfo[]): Finding {
  const groups = duplicateGroups(infos);
  if (!groups.length) return finding('gtm.duplicate', 'No duplicate tags found', 'pass', 'medium', 'gtm', 'No two tags send the same vendor, ID and event on the same trigger.', '', []);
  return finding('gtm.duplicate', `${plural(groups.length, 'set')} of duplicate tags`, 'warning', 'medium', 'gtm',
    'These tags send the same vendor, ID and event on the same trigger, so the event is likely counted more than once.',
    'Keep one tag per event and pause or delete the others.',
    groups.map((g) => g.map(tagLabel).join(' = ')));
}

export function dead(container: Container, infos: TagInfo[]): Finding {
  const details: string[] = [];
  for (const i of infos) if (i.tag.paused) details.push(`Paused tag: ${i.tag.name}`);
  for (const i of infos) if (!i.tag.paused && !i.tag.firingTriggerIds.length) details.push(`Tag without a firing trigger: ${i.tag.name}`);
  const used = new Set([
    ...container.tags.flatMap((t) => [...t.firingTriggerIds, ...t.blockingTriggerIds]),
    ...container.triggers.flatMap((t) => t.groupTriggerIds),
  ]);
  for (const t of container.triggers) if (!t.builtIn && !used.has(t.id)) details.push(`Unused trigger: ${t.name}`);
  const haystack = JSON.stringify([container.tags.map((t) => t.params), container.triggers.map((t) => t.conditions)]);
  const bodies = container.variables.map((v) => JSON.stringify(v.params));
  container.variables.forEach((v, n) => {
    const ref = `{{${v.name}}}`;
    if (!haystack.includes(ref) && !bodies.some((b, m) => m !== n && b.includes(ref))) details.push(`Unused variable: ${v.name}`);
  });
  if (!details.length) return finding('gtm.dead', 'No paused or unused items', 'pass', 'low', 'gtm', 'Every tag has a trigger and every trigger and variable is used.', '', []);
  return finding('gtm.dead', `${plural(details.length, 'paused or unused item')}`, 'warning', 'low', 'gtm',
    'Paused tags, tags without a trigger and unused triggers and variables do nothing, but make the container harder to read and audit.',
    'Delete them in GTM, or move them to a folder named "Archive" if you need them later.',
    details);
}

export function stale(container: Container, infos: TagInfo[]): Finding {
  const times = container.tags.map((t) => t.modifiedAt).filter((t): t is number => t !== null);
  const ref = container.exportedAt ?? (times.length ? Math.max(...times) : null);
  const hits = ref === null ? [] : infos.filter((i) => !i.tag.paused && i.tag.modifiedAt !== null && ref - i.tag.modifiedAt > STALE_DAYS * DAY);
  if (!hits.length) return finding('gtm.stale', 'No tags older than two years', 'pass', 'low', 'marketing', 'Every active tag was changed within two years before the export.', '', []);
  return finding('gtm.stale', `${plural(hits.length, 'tag')} unchanged for more than two years`, 'manual', 'low', 'marketing',
    'Old tags often belong to campaigns, agencies or tools that are no longer used.',
    'Ask the owner whether each tag is still needed and remove the ones nobody claims.',
    hits.map((i) => `${tagLabel(i)}: last changed ${new Date(i.tag.modifiedAt as number).toISOString().slice(0, 10)}`));
}

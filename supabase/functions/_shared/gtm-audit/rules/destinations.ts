import type { Finding } from '../../tracking-check/types.ts';
import type { Container, TagInfo } from '../types.ts';
import { vendorById } from '../../tracking-vendors.ts';
import { destinationsOf } from '../destinations.ts';
import { finding, isActive, plural } from './finding.ts';

const day = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

function lastChanged(tags: TagInfo[]): string {
  const times = tags.map((i) => i.tag.modifiedAt).filter((t): t is number => t !== null);
  return times.length ? `, last changed ${day(Math.max(...times))}` : '';
}

export function multipleDestinations(container: Container, infos: TagInfo[]): Finding {
  const byVendor = new Map<string, Map<string, TagInfo[]>>();
  const unresolved = new Set<string>();
  for (const i of infos) {
    if (!isActive(i)) continue;
    for (const d of destinationsOf(i, container)) {
      if (d.id === null) { unresolved.add(i.tag.id); continue; }
      const ids = byVendor.get(d.vendorId) ?? new Map<string, TagInfo[]>();
      byVendor.set(d.vendorId, ids);
      const tags = ids.get(d.id) ?? [];
      if (!tags.includes(i)) tags.push(i);
      ids.set(d.id, tags);
    }
  }
  const lines: string[] = [];
  for (const [vendorId, ids] of byVendor) {
    if (ids.size < 2) continue;
    const parts = [...ids].map(([id, tags]) => `${id} (${plural(tags.length, 'tag')}${lastChanged(tags)})`);
    lines.push(`${vendorById(vendorId)?.name ?? vendorId}: ${ids.size} IDs — ${parts.join(', ')}`);
  }
  const tail = unresolved.size ? [`${plural(unresolved.size, 'tag')} with an ID the audit could not resolve`] : [];
  if (!lines.length) {
    return finding('gtm.multiple_destinations', 'Each vendor sends to one account', 'pass', 'high', 'marketing',
      'No vendor has more than one destination ID among the active tags.', '', tail);
  }
  return finding('gtm.multiple_destinations',
    `${plural(lines.length, 'vendor')} ${lines.length === 1 ? 'sends' : 'send'} data to more than one account`, 'manual', 'high', 'marketing',
    'Each ID is a separate account at the vendor. Check who owns each one. An ID nobody recognises often belongs to an old account or a former agency, and data sent to it is outside your control.',
    'Keep the IDs your organisation owns and has access to. Remove or pause tags that send to the others.',
    [...lines, ...tail]);
}

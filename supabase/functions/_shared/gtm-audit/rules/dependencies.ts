import type { Finding } from '../../tracking-check/types.ts';
import type { Container, TagInfo } from '../types.ts';
import { dependencies, type Dependency } from '../dependencies.ts';
import { finding, plural, tagLabel } from './finding.ts';

const MAX_NAMES = 20;
const KIND_ORDER = ['sequence', 'event', 'consent_tool', 'global', 'cookie'];

function how(d: Dependency): string {
  if (d.kind === 'sequence') return d.via === 'setup' ? 'runs first as setup tag' : 'runs after as cleanup tag';
  if (d.kind === 'event') return `event '${d.via}'`;
  if (d.kind === 'consent_tool') return `consent tool ${d.via}`;
  if (d.kind === 'global') return `global '${d.via}'`;
  return `cookie '${d.via}'`;
}

export function reliedOn(container: Container, infos: TagInfo[]): Finding {
  const deps = dependencies(container, infos);
  if (!deps.length) {
    return finding('gtm.dependencies', 'No tag relies on another tag', 'pass', 'medium', 'gtm',
      'No tag in this container provides an event, value, cookie or sequence step that another tag uses.', '', []);
  }
  const byId = new Map(infos.map((i) => [i.tag.id, i]));
  const order = new Map(infos.map((i, n) => [i.tag.id, n]));
  const groups = new Map<string, { from: TagInfo; d: Dependency; to: TagInfo[] }>();
  for (const d of deps) {
    const key = `${d.from}|${d.kind}|${d.via}|${d.confidence}`;
    const g = groups.get(key) ?? { from: byId.get(d.from) as TagInfo, d, to: [] };
    g.to.push(byId.get(d.to) as TagInfo);
    groups.set(key, g);
  }
  const lines = [...groups.values()]
    .sort((a, b) => (order.get(a.from.tag.id) ?? 0) - (order.get(b.from.tag.id) ?? 0)
      || KIND_ORDER.indexOf(a.d.kind) - KIND_ORDER.indexOf(b.d.kind)
      || (a.d.confidence === b.d.confidence ? 0 : a.d.confidence === 'certain' ? -1 : 1))
    .map((g) => {
      const to = g.to.sort((a, b) => (order.get(a.tag.id) ?? 0) - (order.get(b.tag.id) ?? 0));
      const names = to.slice(0, MAX_NAMES).map(tagLabel).join(', ') + (to.length > MAX_NAMES ? ` and ${to.length - MAX_NAMES} more` : '');
      return `${tagLabel(g.from)} → ${names} — ${how(g.d)} (${g.d.confidence})`;
    });
  const providers = new Set(deps.map((d) => d.from)).size;
  return finding('gtm.dependencies', `${plural(providers, 'tag')} that other tags rely on`, 'manual', 'medium', 'gtm',
    'Removing or changing these tags also stops the tags that rely on them. Only dependencies inside this container are shown.',
    'Remove a tag together with the tags that rely on it, or move what it provides (the event, value or cookie) to the site before removing it.',
    lines);
}

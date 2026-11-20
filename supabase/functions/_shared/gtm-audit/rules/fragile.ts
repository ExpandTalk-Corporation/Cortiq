import type { Finding } from '../../tracking-check/types.ts';
import type { Container, TagInfo } from '../types.ts';
import { fragileUses } from '../fragile.ts';
import { migrate, migrationContext } from '../migrate.ts';
import { finding, plural, tagLabel } from './finding.ts';

export function fragileDom(container: Container, infos: TagInfo[]): Finding {
  const uses = fragileUses(container, infos);
  if (!uses.length) {
    return finding('gtm.fragile_dom', 'No tag relies on page markup', 'pass', 'low', 'developer',
      'No active tag uses a CSS selector, element ID, page text or a variable that reads the page.', '', []);
  }
  const tags = [...new Set(uses.map((u) => u.tag))];
  const ctx = migrationContext(container, infos);
  const important = tags.some((i) => { const m = migrate(i, ctx).migration; return m === 'conversion' || m === 'pixel'; });
  return finding('gtm.fragile_dom', `${plural(tags.length, 'tag')} ${tags.length === 1 ? 'relies' : 'rely'} on page markup`, 'manual', important ? 'medium' : 'low', 'developer',
    'These tags fire on page markup (a CSS class, element ID or button text). A redesign or a text change can stop them without any error, and the tag silently stops counting.',
    "Have the site push a named event when the action happens (for example `dataLayer.push({event: 'generate_lead'})`) and trigger on that event instead.",
    uses.map((u) => `${tagLabel(u.tag)}: ${u.source}`));
}

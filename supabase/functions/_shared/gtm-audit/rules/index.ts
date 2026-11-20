import type { Finding } from '../../tracking-check/types.ts';
import type { Container, TagInfo } from '../types.ts';
import { consentInferred, consentMissing, consentModeDefault, identifiesVisitors } from './consent.ts';
import { multipleDestinations } from './destinations.ts';
import { communityTemplateInjects, dead, duplicate, stale, unknownCustomHtml } from './hygiene.ts';

export { duplicateGroups } from './hygiene.ts';

/** One finding per CHECK_KEYS entry, in CHECK_KEYS order. */
export function runRules(container: Container, infos: TagInfo[]): Finding[] {
  return [
    consentMissing(infos),
    consentInferred(infos),
    identifiesVisitors(infos),
    consentModeDefault(container, infos),
    multipleDestinations(container, infos),
    unknownCustomHtml(infos),
    communityTemplateInjects(infos),
    duplicate(infos),
    dead(container, infos),
    stale(container, infos),
  ];
}

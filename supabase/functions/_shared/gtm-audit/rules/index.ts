import type { Finding } from '../../tracking-check/types.ts';
import type { Container, TagInfo } from '../types.ts';
import { consentInferred, consentMissing, consentModeDefault, identifiesVisitors } from './consent.ts';
import { multipleDestinations } from './destinations.ts';
import { reliedOn } from './dependencies.ts';
import { dependencies, type Dependency } from '../dependencies.ts';
import { fragileDom } from './fragile.ts';
import { communityTemplateInjects, dead, duplicate, stale, unknownCustomHtml } from './hygiene.ts';

export { duplicateGroups } from './hygiene.ts';

/** One finding per CHECK_KEYS entry, in CHECK_KEYS order. deps: dependencies(container, infos), computed here when not given. */
export function runRules(container: Container, infos: TagInfo[], deps: Dependency[] = dependencies(container, infos)): Finding[] {
  return [
    consentMissing(infos),
    consentInferred(infos),
    identifiesVisitors(infos),
    consentModeDefault(container, infos),
    multipleDestinations(container, infos),
    reliedOn(container, infos, deps),
    unknownCustomHtml(infos),
    communityTemplateInjects(infos),
    duplicate(infos),
    fragileDom(container, infos, deps),
    dead(container, infos),
    stale(container, infos),
  ];
}

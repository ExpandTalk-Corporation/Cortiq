import type { Container, TagInfo } from './types.ts';
import { vendorById } from '../tracking-vendors.ts';
import { identify, templateFor } from './identify.ts';
import { consentStatus } from './consent.ts';

/** Identification + consent per tag: the input every rule and the migration step share. */
export function tagInfos(container: Container): TagInfo[] {
  return container.tags.map((tag) => {
    const ident = identify(tag, container);
    const { status, evidence } = consentStatus(tag, container);
    return {
      tag, ident, vendor: ident.vendorId ? vendorById(ident.vendorId) ?? null : null,
      consent: status, consentEvidence: evidence, template: templateFor(tag, container),
    };
  });
}

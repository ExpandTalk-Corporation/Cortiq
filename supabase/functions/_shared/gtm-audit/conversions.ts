/**
 * conversions — the one definition of a conversion tag, shared by migrate.ts and the conversion rules:
 * a Google Ads conversion tag (awct), or a registry-vendor tag whose event text matches CONVERSION_RE.
 */
import type { Container, ParamValue, TagInfo } from './types.ts';
import { effectivelyActive } from './refs.ts';

// Meta's eventName is always the literal 'standard' for standard events — the real event lives in
// standardEventName, so event text joins every field, not just the first truthy one.
export const EVENT_KEYS = ['eventName', 'standardEventName', 'event', 'conversionLabel', 'eventType', 'customEventName'];
export const CONVERSION_RE = /conversion|purchase|lead|signup|sign_up|submit|complete/i;
const PIXEL_CALL_RE = /\b(?:fbq|rdt|twq|ttq|pintrk|snaptr|lintrk)\(([^)]{0,200})\)/g;

const text = (v: ParamValue | undefined): string => (typeof v === 'string' ? v : '');

/** Event names from template fields, plus the arguments of pixel calls in Custom HTML. Non-empty parts only. */
export function eventParts(info: TagInfo): string[] {
  const parts = EVENT_KEYS.map((k) => text(info.tag.params[k])).filter(Boolean);
  const html = text(info.tag.params.html).slice(0, 200_000);
  for (const m of html.matchAll(PIXEL_CALL_RE)) if (m[1].trim()) parts.push(m[1].trim());
  return parts;
}

export const eventText = (info: TagInfo): string => eventParts(info).join(' ');

export const isConversion = (info: TagInfo): boolean =>
  info.tag.type === 'awct' || (!!info.ident.vendorId && CONVERSION_RE.test(eventText(info)));

/** Conversion tags that can run (effectivelyActive), in container order. */
export function conversionTags(container: Container, infos: TagInfo[]): TagInfo[] {
  const running = effectivelyActive(container);
  return infos.filter((i) => running.has(i.tag.id) && isConversion(i));
}

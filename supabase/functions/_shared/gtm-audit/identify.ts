/**
 * identify — which registry vendor a tag loads. Order: built-in tag type → Custom HTML / image URLs →
 * custom template permission URLs → gallery reference. HTML is scanned as text, never rendered.
 */
import type { Container, GtmTag, GtmTemplate, Identification, ParamValue } from './types.ts';
import type { Vendor } from '../tracking-vendors.ts';
import { TRACKING_VENDORS, vendorForUrl } from '../tracking-vendors.ts';
import { BUILTIN_VENDOR, templateIdOf } from './tag-types.ts';
import { galleryEntry } from './gallery-map.ts';

const text = (v: ParamValue | undefined): string => (typeof v === 'string' ? v : '');
const absolute = (u: string): string => (u.startsWith('//') ? `https:${u}` : u);

/** http(s) and protocol-relative URLs in quotes: src="…", s.src='…', fetch(`…`). */
export function urlsInHtml(html: string): string[] {
  const out = new Set<string>();
  // eslint-disable-next-line security/detect-unsafe-regex -- no nested quantifiers; linear, timed <5ms on a 400KB adversarial input.
  for (const m of html.slice(0, 200_000).matchAll(/["'`]((?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}[^"'`\s<>]*)["'`]/gi)) {
    out.add(absolute(m[1]));
    if (out.size >= 50) break;
  }
  return [...out];
}

// Shared hosting/CDN/cloud suffixes (and Google's own umbrella domain) host too many unrelated services to
// identify a vendor on their own — amazonaws.com/cloudfront.net alone would otherwise match rb2b, google.com
// alone would match ga4 via its analytics.google.com CSP entry, etc.
const SHARED_INFRA_SUFFIXES = ['amazonaws.com', 'cloudfront.net', 'googleapis.com', 'azureedge.net', 'akamaihd.net', 'fastly.net', 'google.com'];

/** Permission URLs may use wildcards: https://*.cookiebot.com/* — try a concrete host, then CSP domains. */
export function vendorForPattern(pattern: string): Vendor | null {
  const concrete = pattern.replace(/\*\./g, 'x.').replace(/\*/g, '');
  const direct = vendorForUrl(concrete);
  if (direct) return direct;
  // https://*.x/* (scheme required) or protocol-relative //*.x/* and //x/* (no scheme, wildcard optional).
  const base = (pattern.match(/^https?:\/\/\*\.([^/:]+)/)?.[1]
    ?? pattern.match(/^\/\/(?:\*\.)?([^/:*]+)/)?.[1])?.toLowerCase();
  if (!base || !base.includes('.')) return null;
  if (SHARED_INFRA_SUFFIXES.some((s) => base === s || base.endsWith(`.${s}`))) return null;
  return TRACKING_VENDORS.find((v) => Object.values(v.csp).flatMap((d) => d ?? [])
    .some((d) => { const host = d.replace(/^\*\./, ''); return host === base || host.endsWith(`.${base}`); })) ?? null;
}

function firstVendor(urls: string[]): string | null {
  for (const u of urls) {
    const v = vendorForPattern(u);
    if (v && v.kind !== 'infrastructure') return v.id;
  }
  return null;
}

export function templateFor(tag: GtmTag, container: Container): GtmTemplate | null {
  const id = templateIdOf(tag.type);
  return id ? container.templates.find((t) => t.id === id) ?? null : null;
}

export function identify(tag: GtmTag, container: Container): Identification {
  const base: Identification = { vendorId: null, source: 'none', templateOrigin: null, urls: [], covers: null };
  if (tag.type === 'googtag') {
    return { ...base, vendorId: text(tag.params.tagId).startsWith('AW-') ? 'google-ads' : 'ga4', source: 'builtin-type' };
  }
  if (Object.prototype.hasOwnProperty.call(BUILTIN_VENDOR, tag.type)) {
    return { ...base, vendorId: BUILTIN_VENDOR[tag.type], source: 'builtin-type' };
  }
  if (tag.type === 'html' || tag.type === 'img') {
    const urls = tag.type === 'html'
      ? urlsInHtml(text(tag.params.html))
      // eslint-disable-next-line security/detect-unsafe-regex -- optional literal prefix only; linear, timed <5ms on a 200KB input.
      : [text(tag.params.url)].filter((u) => /^(https?:)?\/\//.test(u)).map(absolute);
    const vendorId = firstVendor(urls);
    return { ...base, vendorId, source: vendorId ? 'custom-html-url' : 'none', urls };
  }
  const template = templateFor(tag, container);
  if (!template) return base;
  const entry = galleryEntry(template.gallery);
  const templateOrigin = entry?.official ? 'official' : 'community';
  const covers = entry?.covers ?? null;
  const fromPermissions = firstVendor(template.urls);
  if (fromPermissions) return { vendorId: fromPermissions, source: 'template-permissions', templateOrigin, urls: template.urls, covers };
  if (entry?.vendorId) return { vendorId: entry.vendorId, source: 'gallery-reference', templateOrigin, urls: template.urls, covers };
  return { ...base, templateOrigin, urls: template.urls, covers };
}

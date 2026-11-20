/**
 * destinations — the account IDs a tag sends to: template/built-in ID fields, fixed Custom HTML patterns
 * per vendor, and {{variables}} resolved through Constant and Lookup/RegEx Table variables. Shown in the
 * report and the local export only; never in stats.
 */
import type { Container, ParamValue, TagInfo } from './types.ts';
import { MAX_VAR_DEPTH, variableByName } from './refs.ts';

export type Resolution = 'literal' | 'constant_variable' | 'lookup' | 'unresolved';
export interface Destination {
  vendorId: string;
  /** Normalized destination ID; null when unresolved. */
  id: string | null;
  /** The value as written, e.g. '{{Meta ID}}'. */
  raw: string;
  resolved: Resolution;
}

export const ID_KEYS = ['tagId', 'measurementIdOverride', 'measurementId', 'conversionId', 'pixelId', 'pixelIds', 'pixel_id', 'partnerId', 'trackingId'];
export const MAX_HTML = 200_000;

const REF = (p: string): string => String.raw`(\{\{[^{}]{1,200}\}\}|${p})`;
const re = (source: string, flags = 'g'): RegExp => new RegExp(source, flags);

/** vendorId 'google' = decided by the ID prefix (G- → ga4, AW-/DC- → google-ads). */
export const HTML_ID_PATTERNS: { vendorId: string; re: RegExp; when?: RegExp }[] = [
  { vendorId: 'meta', re: re(String.raw`fbq\(\s*['"]init['"]\s*,\s*['"]?` + REF(String.raw`\d{6,20}`)) },
  { vendorId: 'google', re: re(String.raw`gtag\(\s*['"]config['"]\s*,\s*['"]` + REF(String.raw`(?:G|AW|DC)-[A-Za-z0-9]{4,20}`)) },
  { vendorId: 'google', re: /googletagmanager\.com\/gtag\/js\?id=((?:G|AW|DC)-[A-Za-z0-9]{4,20})/g },
  { vendorId: 'linkedin', re: re(String.raw`_linkedin_partner_id\s*=\s*['"]?` + REF(String.raw`\d{3,12}`)) },
  { vendorId: 'tiktok-pixel', re: re(String.raw`ttq\.load\(\s*['"]` + REF('[A-Za-z0-9]{8,30}')) },
  { vendorId: 'microsoft-ads', re: re(String.raw`\bti\s*:\s*['"]?` + REF(String.raw`\d{4,12}`)), when: /bat\.bing\.com/ },
  { vendorId: 'pinterest-pixel', re: re(String.raw`pintrk\(\s*['"]load['"]\s*,\s*['"]?` + REF(String.raw`\d{6,20}`)) },
  { vendorId: 'snap-pixel', re: re(String.raw`snaptr\(\s*['"]init['"]\s*,\s*['"]` + REF('[0-9a-fA-F-]{20,40}')) },
  { vendorId: 'hotjar', re: re(String.raw`hjid\s*:\s*` + REF(String.raw`\d{4,12}`)) },
  { vendorId: 'clarity', re: /clarity\.ms\/tag\/([a-z0-9]{6,20})/gi },
  { vendorId: 'clarity', re: re(String.raw`["']clarity["']\s*,\s*["']script["']\s*,\s*["']` + REF('[a-z0-9]{6,20}'), 'gi') },
];

const text = (v: ParamValue | undefined): string => (typeof v === 'string' ? v : '');
const valuesOf = (v: ParamValue | undefined): string[] =>
  (typeof v === 'string' ? v.split(',') : Array.isArray(v) ? v.flatMap((x) => (typeof x === 'string' ? x.split(',') : [])) : [])
    .map((s) => s.trim()).filter(Boolean);

const GOOGLE_PREFIX = /^(?:G|AW|DC|GT|UA)-/i;
const SKIPPED = /^(?:UA|GT)-/i;

function googleVendor(id: string): string | null {
  if (/^G-/i.test(id)) return 'ga4';
  if (/^(?:AW|DC)-/i.test(id)) return 'google-ads';
  return null;
}

/** Trim; upper-case Google IDs; drop the conversion label after AW-…/; a bare Google Ads conversion ID gets AW-. */
export function normalizeId(raw: string, vendorId?: string): string {
  let id = raw.trim();
  if (GOOGLE_PREFIX.test(id)) id = id.toUpperCase();
  if (id.startsWith('AW-')) id = id.split('/')[0];
  if (vendorId === 'google-ads' && /^\d{6,12}$/.test(id)) id = `AW-${id}`;
  return id;
}

const ONLY_REF = /^\{\{([^{}]{1,200})\}\}$/;
interface Resolved { values: string[]; resolved: Resolution }
const UNRESOLVED: Resolved = { values: [], resolved: 'unresolved' };

function resolve(raw: string, c: Container, depth = 0): Resolved {
  const v = raw.trim();
  const m = ONLY_REF.exec(v);
  if (!m) return v.includes('{{') ? UNRESOLVED : { values: [v], resolved: 'literal' };
  if (depth >= MAX_VAR_DEPTH) return UNRESOLVED;
  const variable = variableByName(m[1], c);
  if (!variable) return UNRESOLVED;
  if (variable.type === 'c') {
    const r = resolve(text(variable.params.value), c, depth + 1);
    return r.resolved === 'literal' ? { values: r.values, resolved: 'constant_variable' } : r;
  }
  if (variable.type === 'smm' || variable.type === 'remm') {
    const rows = Array.isArray(variable.params.map) ? variable.params.map : [];
    const outputs = rows.map((r) => (r && typeof r === 'object' && !Array.isArray(r) ? text(r.value) : ''));
    if (text(variable.params.setDefaultValue) === 'true') outputs.push(text(variable.params.defaultValue));
    const values = new Set<string>();
    for (const o of outputs) if (o.trim()) for (const x of resolve(o, c, depth + 1).values) values.add(x);
    return values.size ? { values: [...values], resolved: 'lookup' } : UNRESOLVED;
  }
  return UNRESOLVED;
}

export function destinationsOf(info: TagInfo, c: Container): Destination[] {
  const own = info.vendor?.id ?? null;
  const found: { vendorId: string | null; raw: string }[] = [];
  for (const k of ID_KEYS) for (const raw of valuesOf(info.tag.params[k])) found.push({ vendorId: own, raw });
  const html = text(info.tag.params.html).slice(0, MAX_HTML);
  if (html) {
    for (const p of HTML_ID_PATTERNS) {
      if (p.when && !p.when.test(html)) continue;
      for (const m of html.matchAll(p.re)) found.push({ vendorId: p.vendorId === 'google' ? null : p.vendorId, raw: m[1] });
    }
  }
  const out = new Map<string, Destination>();
  const add = (d: Destination) => { const key = `${d.vendorId}|${d.id ?? `?${d.raw}`}`; if (!out.has(key)) out.set(key, d); };
  for (const f of found) {
    const r = resolve(f.raw, c);
    if (r.resolved === 'unresolved') {
      const vendorId = f.vendorId ?? own;
      if (vendorId) add({ vendorId, id: null, raw: f.raw, resolved: 'unresolved' });
      continue;
    }
    for (const value of r.values) {
      for (const piece of value.split(',').map((s) => s.trim()).filter(Boolean)) {
        if (SKIPPED.test(piece)) continue;
        const vendorId = googleVendor(piece) ?? f.vendorId ?? own;
        if (!vendorId) continue;
        add({ vendorId, id: normalizeId(piece, vendorId), raw: f.raw, resolved: r.resolved });
      }
    }
  }
  return [...out.values()];
}

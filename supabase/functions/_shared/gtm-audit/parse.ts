/**
 * parse — GTM container export (format v2) → normalized Container. Never throws: every access to the
 * input goes through obj/arr/str, so wrong types, nulls and hostile keys degrade to empty values.
 */
import type { Container, CustomEventMatch, GtmCondition, GtmTag, GtmTemplate, GtmTrigger, ParamValue, ParseError, ParseErrorCode } from './types.ts';
import { BUILTIN_TRIGGERS } from './tag-types.ts';

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ITEMS = 2000;
const MAX_DEPTH = 8;

const MESSAGES: Record<ParseErrorCode, string> = {
  not_json: 'This is not a JSON file. Export the container from GTM: Admin → Export container.',
  not_gtm: 'This JSON file is not a Google Tag Manager container export.',
  format_version: 'This export uses a format version the audit does not read. Export the container again from GTM.',
  server_container: 'This is a server-side container. The audit covers web containers only.',
  empty: 'The container has no tags, triggers or variables.',
  too_large: 'The file is larger than 5 MB.',
};
const fail = (error: ParseErrorCode): ParseError => ({ error, message: MESSAGES[error] });

export const isParseError = (x: unknown): x is ParseError =>
  !!x && typeof x === 'object' && typeof (x as ParseError).error === 'string' && !('tags' in (x as object));

const obj = (v: unknown): Record<string, unknown> =>
  (v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v.slice(0, MAX_ITEMS) : []);
const str = (v: unknown): string =>
  (typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : '');
/** GTM export uses UPPER_SNAKE; the GTM API returns camelCase (notSet). Both → UPPER_SNAKE. */
const enumOf = (v: unknown): string => str(v).replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();
const idOrNull = (v: unknown): string | null => str(v) || null;

function paramValue(p: Record<string, unknown>, depth: number): ParamValue {
  if (depth > MAX_DEPTH) return '';
  const type = enumOf(p.type);
  if (type === 'LIST') return arr(p.list).map((x) => paramValue(obj(x), depth + 1));
  if (type === 'MAP') return paramMap(arr(p.map), depth + 1);
  return str(p.value);
}

function paramMap(items: unknown[], depth = 0): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};
  for (const raw of items) {
    const p = obj(raw);
    const key = str(p.key);
    if (!key || key === '__proto__') continue;
    out[key] = paramValue(p, depth);
  }
  return out;
}

const ids = (v: unknown): string[] => arr(v).map(str).filter(Boolean);

function consentOf(raw: unknown): GtmTag['consent'] {
  const c = obj(raw);
  const s = enumOf(c.consentStatus);
  const status = s === 'NEEDED' ? 'needed' : s === 'NOT_NEEDED' ? 'not_needed' : 'not_set';
  const types = arr(obj(c.consentType).list).map((x) => str(obj(x).value)).filter(Boolean);
  return { status, types };
}

function conditionsOf(t: Record<string, unknown>): GtmCondition[] {
  return [...arr(t.customEventFilter), ...arr(t.filter), ...arr(t.autoEventFilter)].map((raw) => {
    const c = obj(raw);
    const params = arr(c.parameter).map(obj);
    const val = (k: string) => str(params.find((p) => str(p.key) === k)?.value);
    return { type: enumOf(c.type), arg0: val('arg0'), arg1: val('arg1'), negate: val('negate') === 'true' };
  });
}

const tagNames = (v: unknown): string[] => arr(v).map((x) => str(obj(x).tagName)).filter(Boolean);

const EVENT_MATCH: Record<string, CustomEventMatch['match']> = { EQUALS: 'equals', CONTAINS: 'contains', STARTS_WITH: 'starts_with', MATCH_REGEX: 'regex' };
const EVENT_ARGS = new Set(['{{_event}}', '{{Event}}']);

function customEventOf(t: Record<string, unknown>): CustomEventMatch | null {
  for (const c of conditionsOf({ customEventFilter: t.customEventFilter })) {
    if (!Object.prototype.hasOwnProperty.call(EVENT_MATCH, c.type)) continue;
    if (!c.negate && EVENT_ARGS.has(c.arg0) && c.arg1) return { match: EVENT_MATCH[c.type], value: c.arg1 };
  }
  return null;
}

function section(data: string, name: string): string {
  const marker = `___${name}___`;
  const start = data.indexOf(marker);
  if (start < 0) return '';
  const rest = data.slice(start + marker.length);
  const end = rest.search(/___[A-Z_]+___/);
  return end < 0 ? rest : rest.slice(0, end);
}

function templateOf(raw: unknown): GtmTemplate {
  const t = obj(raw);
  const perms = section(str(t.templateData), 'WEB_PERMISSIONS');
  const permissions = [...new Set([...perms.matchAll(/"publicId":\s*"([a-z_]+)"/g)].map((m) => m[1]))];
  const urls = [...new Set([...perms.matchAll(/"string":\s*"(https?:\/\/[^"]+)"/g)].map((m) => m[1]))];
  const g = obj(t.galleryReference);
  const owner = str(g.owner), repository = str(g.repository);
  return { id: str(t.templateId), name: str(t.name), permissions, urls, gallery: owner || repository ? { owner, repository } : null };
}

function exportTime(v: unknown): number | null {
  const s = str(v);
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return null;
  const t = Date.parse(s.replace(' ', 'T') + 'Z');
  return Number.isFinite(t) ? t : null;
}

export function parse(input: unknown): Container | ParseError {
  let json = input;
  if (typeof input === 'string') {
    if (input.length > MAX_FILE_BYTES) return fail('too_large');
    try { json = JSON.parse(input); } catch { return fail('not_json'); }
  }
  const root = obj(json);
  if (!('containerVersion' in root) || !Object.keys(obj(root.containerVersion)).length) return fail('not_gtm');
  if ('exportFormatVersion' in root && Number(root.exportFormatVersion) !== 2) return fail('format_version');
  const cv = obj(root.containerVersion);
  const container = obj(cv.container);
  if (arr(container.usageContext).map(enumOf).includes('SERVER')) return fail('server_container');

  const tags: GtmTag[] = arr(cv.tag).map((raw) => {
    const t = obj(raw);
    const fp = str(t.fingerprint);
    return {
      id: str(t.tagId), name: str(t.name), type: str(t.type),
      params: paramMap(arr(t.parameter)),
      firingTriggerIds: ids(t.firingTriggerId), blockingTriggerIds: ids(t.blockingTriggerId),
      consent: consentOf(t.consentSettings),
      paused: t.paused === true || str(t.paused) === 'true',
      folderId: idOrNull(t.parentFolderId),
      modifiedAt: /^\d{12,14}$/.test(fp) ? Number(fp) : null,
      setupTagNames: tagNames(t.setupTag), teardownTagNames: tagNames(t.teardownTag),
    };
  });

  const triggers: GtmTrigger[] = arr(cv.trigger).map((raw) => {
    const t = obj(raw);
    const params = paramMap(arr(t.parameter));
    const members = Array.isArray(params.triggerIds) ? params.triggerIds.filter((x): x is string => typeof x === 'string' && x !== '') : [];
    return {
      id: str(t.triggerId), name: str(t.name), type: enumOf(t.type), conditions: conditionsOf(t),
      builtIn: false, groupTriggerIds: members, folderId: idOrNull(t.parentFolderId),
      params, customEvent: customEventOf(t),
    };
  });

  const known = new Set(triggers.map((t) => t.id));
  const referenced = [...tags.flatMap((t) => [...t.firingTriggerIds, ...t.blockingTriggerIds]), ...triggers.flatMap((t) => t.groupTriggerIds)];
  for (const id of referenced) {
    const b = Object.prototype.hasOwnProperty.call(BUILTIN_TRIGGERS, id) ? BUILTIN_TRIGGERS[id] : undefined;
    if (b && !known.has(id)) {
      known.add(id);
      triggers.push({ id, name: b.name, type: b.type, conditions: [], builtIn: true, groupTriggerIds: [], folderId: null, params: {}, customEvent: null });
    }
  }

  const variables = arr(cv.variable).map((raw) => {
    const v = obj(raw);
    return { id: str(v.variableId), name: str(v.name), type: str(v.type), params: paramMap(arr(v.parameter)) };
  });

  if (!tags.length && !triggers.length && !variables.length) return fail('empty');

  return {
    exportedAt: exportTime(root.exportTime),
    publicId: str(container.publicId),
    tags, triggers, variables,
    folders: arr(cv.folder).map((raw) => { const f = obj(raw); return { id: str(f.folderId), name: str(f.name) }; }),
    templates: arr(cv.customTemplate).map(templateOf),
    builtInVariables: arr(cv.builtInVariable).map((raw) => str(obj(raw).type)).filter(Boolean),
  };
}

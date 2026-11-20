/**
 * refs — how tags reach variables and triggers: {{Name}} references, trigger groups, and variables that
 * reference other variables (followed at most MAX_VAR_DEPTH levels, cycle-safe). Shared by destinations,
 * dependencies and fragile.
 */
import type { Container, GtmTag, GtmTrigger, GtmVariable } from './types.ts';

export const MAX_VAR_DEPTH = 5;
const REF_RE = /\{\{([^{}]{1,200})\}\}/g;
const MAX_WALK = 10;

function strings(v: unknown, out: string[], depth = 0): void {
  if (depth > MAX_WALK) return;
  if (typeof v === 'string') { out.push(v); return; }
  if (Array.isArray(v)) { for (const x of v) strings(x, out, depth + 1); return; }
  if (v && typeof v === 'object') for (const x of Object.values(v)) strings(x, out, depth + 1);
}

/** Variable names inside {{…}} anywhere in a value (strings, arrays, maps). Each name once. */
export function variableRefs(v: unknown): string[] {
  const texts: string[] = [];
  strings(v, texts);
  const names = new Set<string>();
  for (const t of texts) for (const m of t.matchAll(REF_RE)) names.add(m[1]);
  return [...names];
}

interface Index { variables: Map<string, GtmVariable>; triggers: Map<string, GtmTrigger> }
const cache = new WeakMap<Container, Index>();

function indexOf(c: Container): Index {
  let ix = cache.get(c);
  if (!ix) {
    const variables = new Map<string, GtmVariable>();
    for (const v of c.variables) if (!variables.has(v.name)) variables.set(v.name, v);
    const triggers = new Map<string, GtmTrigger>();
    for (const t of c.triggers) if (!triggers.has(t.id)) triggers.set(t.id, t);
    ix = { variables, triggers };
    cache.set(c, ix);
  }
  return ix;
}

export const variableByName = (name: string, c: Container): GtmVariable | undefined => indexOf(c).variables.get(name);
export const triggerById = (id: string, c: Container): GtmTrigger | undefined => indexOf(c).triggers.get(id);

/** The tag's firing triggers plus every trigger-group member, nested groups included, each once. */
export function firingTriggers(tag: GtmTag, c: Container): GtmTrigger[] {
  const out: GtmTrigger[] = [];
  const seen = new Set<string>();
  const queue = [...tag.firingTriggerIds];
  while (queue.length) {
    const id = queue.pop() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    const t = triggerById(id, c);
    if (!t) continue;
    out.push(t);
    queue.push(...t.groupTriggerIds);
  }
  return out;
}

/** The named variables plus the variables they reference, MAX_VAR_DEPTH levels deep. Built-ins are not variables. */
export function expandVars(names: string[], c: Container): GtmVariable[] {
  const out = new Map<string, GtmVariable>();
  let level = names;
  for (let depth = 0; depth <= MAX_VAR_DEPTH && level.length; depth++) {
    const next: string[] = [];
    for (const name of level) {
      if (out.has(name)) continue;
      const v = variableByName(name, c);
      if (!v) continue;
      out.set(name, v);
      if (depth < MAX_VAR_DEPTH) next.push(...variableRefs(v.params));
    }
    level = next;
  }
  return [...out.values()];
}

/** Variables a tag reads through its params and its firing triggers' conditions and params. */
export function varsUsedBy(tag: GtmTag, c: Container): GtmVariable[] {
  const names = new Set(variableRefs(tag.params));
  for (const t of firingTriggers(tag, c)) {
    for (const n of variableRefs([t.conditions.map((x) => [x.arg0, x.arg1]), t.params])) names.add(n);
  }
  return expandVars([...names], c);
}

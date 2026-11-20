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

interface Index {
  variables: Map<string, GtmVariable>;
  triggers: Map<string, GtmTrigger>;
  /** Per variable: the variables it references, resolved and each once (memo). */
  refs: Map<GtmVariable, GtmVariable[]>;
  /** Per root variable: its closure MAX_VAR_DEPTH levels deep, with each member's depth (memo). */
  closures: Map<GtmVariable, Map<GtmVariable, number>>;
  /** Per tag: varsUsedBy (memo). */
  used: Map<GtmTag, GtmVariable[]>;
  /** effectivelyActive (memo). */
  effective?: Set<string>;
}
const cache = new WeakMap<Container, Index>();

function indexOf(c: Container): Index {
  let ix = cache.get(c);
  if (!ix) {
    const variables = new Map<string, GtmVariable>();
    for (const v of c.variables) if (!variables.has(v.name)) variables.set(v.name, v);
    const triggers = new Map<string, GtmTrigger>();
    for (const t of c.triggers) if (!triggers.has(t.id)) triggers.set(t.id, t);
    ix = { variables, triggers, refs: new Map(), closures: new Map(), used: new Map() };
    cache.set(c, ix);
  }
  return ix;
}

function refsOf(v: GtmVariable, ix: Index): GtmVariable[] {
  let out = ix.refs.get(v);
  if (!out) {
    const seen = new Set<GtmVariable>();
    for (const name of variableRefs(v.params)) { const r = ix.variables.get(name); if (r) seen.add(r); }
    out = [...seen];
    ix.refs.set(v, out);
  }
  return out;
}

/** Breadth-first from one variable, MAX_VAR_DEPTH levels deep; insertion order = visiting order. */
function closureOf(root: GtmVariable, ix: Index): Map<GtmVariable, number> {
  let out = ix.closures.get(root);
  if (!out) {
    out = new Map([[root, 0]]);
    let level = [root];
    for (let depth = 1; depth <= MAX_VAR_DEPTH && level.length && out.size < ix.variables.size; depth++) {
      const next: GtmVariable[] = [];
      for (const v of level) {
        if (out.size === ix.variables.size) break;
        for (const r of refsOf(v, ix)) if (!out.has(r)) { out.set(r, depth); next.push(r); }
      }
      level = next;
    }
    ix.closures.set(root, out);
  }
  return out;
}

export const variableByName = (name: string, c: Container): GtmVariable | undefined => indexOf(c).variables.get(name);
export const triggerById = (id: string, c: Container): GtmTrigger | undefined => indexOf(c).triggers.get(id);

/**
 * Ids of the tags that can run: active tags (not paused, at least one firing trigger) plus the tags named as
 * their setup or teardown tags, transitively. A name links to the first non-paused tag with that name (as in
 * dependencies). Paused tags are never included.
 */
export function effectivelyActive(c: Container): Set<string> {
  const ix = indexOf(c);
  if (ix.effective) return ix.effective;
  const byName = new Map<string, GtmTag>();
  for (const t of c.tags) if (!t.paused && !byName.has(t.name)) byName.set(t.name, t);
  const out = new Set<string>();
  const queue = c.tags.filter((t) => !t.paused && t.firingTriggerIds.length > 0);
  for (const t of queue) out.add(t.id);
  while (queue.length) {
    const t = queue.pop() as GtmTag;
    for (const n of [...t.setupTagNames, ...t.teardownTagNames]) {
      const s = byName.get(n);
      if (s && !out.has(s.id)) { out.add(s.id); queue.push(s); }
    }
  }
  ix.effective = out;
  return out;
}

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

/**
 * The named variables plus the variables they reference, MAX_VAR_DEPTH levels deep (the shortest path from
 * any named variable counts). Built-ins are not variables. Built from cached per-variable closures, ordered by
 * depth, then by the order the names are given.
 */
export function expandVars(names: string[], c: Container): GtmVariable[] {
  const ix = indexOf(c);
  const roots = [...new Set(names.map((n) => ix.variables.get(n)).filter((v): v is GtmVariable => !!v))];
  if (roots.length === 1) return [...closureOf(roots[0], ix).keys()];
  const depth = new Map<GtmVariable, number>();
  for (const r of roots) {
    for (const [v, d] of closureOf(r, ix)) { const prev = depth.get(v); if (prev === undefined || d < prev) depth.set(v, d); }
  }
  return [...depth].sort((a, b) => a[1] - b[1]).map(([v]) => v);
}

/** Variables a tag reads through its params and its firing triggers' conditions and params (memo per tag). */
export function varsUsedBy(tag: GtmTag, c: Container): GtmVariable[] {
  const ix = indexOf(c);
  let out = ix.used.get(tag);
  if (!out) {
    const names = new Set(variableRefs(tag.params));
    for (const t of firingTriggers(tag, c)) {
      for (const n of variableRefs([t.conditions.map((x) => [x.arg0, x.arg1]), t.params])) names.add(n);
    }
    out = expandVars([...names], c);
    ix.used.set(tag, out);
  }
  return out;
}

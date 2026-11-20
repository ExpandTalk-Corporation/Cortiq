/**
 * dependencies — which tags rely on which, inside this container only. certain = stated in the
 * configuration (tag sequencing, an exact event match, the consent tool for gated tags); possible = a text
 * match (contains/regex event, a global or cookie name). Code on the site or in another container is not seen.
 */
import type { Container, GtmTrigger, ParamValue, TagInfo } from './types.ts';
import { effectivelyActive, firingTriggers, varsUsedBy } from './refs.ts';
import { MAX_HTML } from './destinations.ts';

export type DepKind = 'sequence' | 'event' | 'consent_tool' | 'global' | 'cookie';
export type Confidence = 'certain' | 'possible';
/** from = the tag that is relied on; to = the tag that relies on it; ids are GTM tag ids. */
export interface Dependency { from: string; to: string; kind: DepKind; via: string; confidence: Confidence }

const PUSH_RE = /dataLayer\.push\(\s*\{[^{}]{0,200}?['"]?\bevent['"]?\s*:\s*['"]([^'"]{1,100})['"]/g;
const GLOBAL_RE = /\bwindow\.([A-Za-z_$][\w$]{0,100})\s*=(?!=)|(?:^|[;{}\s])var\s+([A-Za-z_$][\w$]{0,100})\s*=/g;
const COOKIE_RE = /document\.cookie\s*=\s*['"`]\s*([^=;'"`\s]{1,100})=/g;
const IGNORED_GLOBALS = new Set(['dataLayer']);
const MAX_EVENTS = 500;
// User regexes from the uploaded file: only short patterns without a quantified group and with at most one
// quantifier are run (event names are ≤100 chars, so the worst case stays linear and small — two or more
// quantifiers, e.g. 'a*a*$', can backtrack polynomially on an unanchored match). The rest are counted as a
// possible match without running them; regex runs per audit are capped as well.
const MAX_USER_REGEX = 200;
const QUANTIFIED_GROUP = /\)\s*[*+{]/;
const QUANTIFIER = /[*+?]|\{\d/g;
const MAX_REGEX_RUNS = 2_000;

const text = (v: ParamValue | undefined): string => (typeof v === 'string' ? v : '');
const htmlOf = (i: TagInfo): string => text(i.tag.params.html).slice(0, MAX_HTML);

const runnable = (p: string): boolean =>
  p.length <= MAX_USER_REGEX && !QUANTIFIED_GROUP.test(p) && (p.match(QUANTIFIER)?.length ?? 0) <= 1;

export interface RegexBudget { runs: number; compiled?: Map<string, RegExp | null> }

/**
 * How a trigger's custom-event condition treats an event name. Each pattern is compiled once per budget
 * (an invalid pattern matches nothing); it is only run when runnable() and while the run budget lasts.
 */
export function eventMatch(t: Pick<GtmTrigger, 'customEvent'>, event: string, budget: RegexBudget = { runs: MAX_REGEX_RUNS }): Confidence | null {
  const ce = t.customEvent;
  if (!ce) return null;
  if (ce.match === 'equals') return ce.value === event ? 'certain' : null;
  if (ce.match === 'contains') return event.includes(ce.value) ? 'possible' : null;
  if (ce.match === 'starts_with') return event.startsWith(ce.value) ? 'possible' : null;
  const compiled = budget.compiled ?? (budget.compiled = new Map());
  let re = compiled.get(ce.value);
  if (re === undefined) {
    try { re = new RegExp(ce.value); } catch { re = null; }
    compiled.set(ce.value, re);
  }
  if (re === null) return null;
  if (!runnable(ce.value) || budget.runs <= 0) return 'possible';
  budget.runs -= 1;
  return re.test(event) ? 'possible' : null;
}

const pushTo = <K, V>(m: Map<K, V[]>, k: K, v: V) => { const list = m.get(k) ?? []; if (!list.includes(v)) list.push(v); m.set(k, list); };

export function dependencies(container: Container, infos: TagInfo[]): Dependency[] {
  // Tags that can run: active ones plus their setup/teardown tags (which may have no trigger of their own).
  const running = effectivelyActive(container);
  const active = infos.filter((i) => running.has(i.tag.id));
  const edges = new Map<string, Dependency>();
  const add = (from: TagInfo, to: TagInfo, kind: DepKind, via: string, confidence: Confidence) => {
    if (from.tag.id === to.tag.id) return;
    const key = `${from.tag.id}|${to.tag.id}|${kind}|${via}`;
    const prev = edges.get(key);
    if (!prev || (prev.confidence === 'possible' && confidence === 'certain')) edges.set(key, { from: from.tag.id, to: to.tag.id, kind, via, confidence });
  };

  // sequence: the provider may have no trigger of its own (it runs as setup/teardown).
  const byName = new Map<string, TagInfo>();
  for (const i of infos) if (!i.tag.paused && !byName.has(i.tag.name)) byName.set(i.tag.name, i);
  for (const b of active) {
    for (const n of b.tag.setupTagNames) { const a = byName.get(n); if (a) add(a, b, 'sequence', 'setup', 'certain'); }
    for (const n of b.tag.teardownTagNames) { const a = byName.get(n); if (a) add(a, b, 'sequence', 'teardown', 'certain'); }
  }

  // event / global / cookie providers from Custom HTML.
  const events = new Map<string, TagInfo[]>();
  const globals = new Map<string, TagInfo[]>();
  const cookies = new Map<string, TagInfo[]>();
  for (const a of active) {
    const html = htmlOf(a);
    if (!html) continue;
    for (const m of html.matchAll(PUSH_RE)) if (events.size < MAX_EVENTS || events.has(m[1])) pushTo(events, m[1], a);
    for (const m of html.matchAll(GLOBAL_RE)) { const g = m[1] ?? m[2]; if (!IGNORED_GLOBALS.has(g)) pushTo(globals, g, a); }
    for (const m of html.matchAll(COOKIE_RE)) pushTo(cookies, m[1], a);
  }

  if (events.size) {
    const budget: RegexBudget = { runs: MAX_REGEX_RUNS };
    const eventList = [...events];
    const matches = new Map<GtmTrigger, (Confidence | null)[]>();
    for (const b of active) {
      const best: (Confidence | undefined)[] = [];
      for (const t of firingTriggers(b.tag, container)) {
        if (!t.customEvent) continue;
        let row = matches.get(t);
        if (!row) { row = eventList.map(([event]) => eventMatch(t, event, budget)); matches.set(t, row); }
        row.forEach((conf, k) => {
          if (!conf || best[k] === 'certain' || best[k] === conf) return;
          best[k] = conf;
          const [event, providers] = eventList[k];
          for (const a of providers) add(a, b, 'event', event, conf);
        });
      }
    }
  }

  // consent_tool: the CMP tag is what lets gated tags run.
  for (const a of active) {
    if (a.vendor?.kind !== 'cmp') continue;
    for (const b of active) if (b.consent === 'gated') add(a, b, 'consent_tool', a.vendor.name, 'certain');
  }

  if (globals.size || cookies.size) {
    for (const b of active) {
      for (const v of varsUsedBy(b.tag, container)) {
        const name = text(v.params.name).trim();
        if (v.type === 'j') {
          const root = name.replace(/^window\./, '').split('.')[0];
          for (const a of globals.get(root) ?? []) add(a, b, 'global', root, 'possible');
        } else if (v.type === 'k') {
          for (const a of cookies.get(name) ?? []) add(a, b, 'cookie', name, 'possible');
        }
      }
    }
  }
  return [...edges.values()];
}

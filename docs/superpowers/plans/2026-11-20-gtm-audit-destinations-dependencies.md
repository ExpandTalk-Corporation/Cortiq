# GTM audit: destinations, dependencies and fragile DOM — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The GTM audit adds three checks: vendors that send to more than one account, tags that other tags rely on (with a guard on "Removal candidate"), and tags that depend on page markup. It also adds two new tag-table columns, "Sends to" and "Relied on by".

**Architecture:**
- Three new pure engine modules sit next to the existing engine in `supabase/functions/_shared/gtm-audit/`: `destinations.ts`, `dependencies.ts` and `fragile.ts`.
- They share a small reference helper, `refs.ts`, which handles variable-in-variable references and trigger groups.
- Each check is one rule function in `rules/`, registered in `runRules` in `CHECK_KEYS` order.
- `migrate.ts` reads the dependency graph for the remove→review guard.
- Everything runs in the browser. Nothing new is sent anywhere.

**Tech Stack:** TypeScript run directly by Node 24 (type stripping) in `node --test`, React/Vite for the page, exceljs for the export.

**Spec:** `docs/superpowers/specs/2026-11-20-gtm-audit-destinations-dependencies-design.md`

## Global Constraints

- **Synthetic data only.** All fixtures are synthetic. Never use a real customer's container export in fixtures, samples or tests.
- **Evidence level.** Every new finding goes through `finding()`, which prepends `EVIDENCE_LEVEL`. Never claim a tag fires: the copy says configuration.
- **What reaches stats.** Destination IDs, tag names, event names, cookie names and variable names never reach `buildStats`, `validateStats` or the `gtm-audit-stats` edge function. The only stats change is three new `CHECK_KEYS` entries.
- **Rule order.** `runRules` returns findings in exact `CHECK_KEYS` order. The final `CHECK_KEYS` order is:
  1. `gtm.consent_missing`
  2. `gtm.consent_inferred`
  3. `gtm.identifies_visitors`
  4. `gtm.consent_mode_default`
  5. `gtm.multiple_destinations`
  6. `gtm.dependencies`
  7. `gtm.unknown_custom_html`
  8. `gtm.community_template_injects`
  9. `gtm.duplicate`
  10. `gtm.fragile_dom`
  11. `gtm.dead`
  12. `gtm.stale`
- **Regexes.**
  - Every regex applied to container text is linear: bounded classes and no nested quantifiers.
  - Custom HTML is cut to its first 200 000 characters before matching (`MAX_HTML`, the same cap as `migrate.ts`).
  - Regexes are written with `String.raw` wherever they are built from strings.
- **Engine version.** `ENGINE_VERSION` becomes `2` (Task 7).
- **Copy, verbatim from the spec:**
  - multiple destinations explanation: "Each ID is a separate account at the vendor. Check who owns each one. An ID nobody recognises often belongs to an old account or a former agency, and data sent to it is outside your control."
  - multiple destinations fix: "Keep the IDs your organisation owns and has access to. Remove or pause tags that send to the others."
  - dependencies explanation: "Removing or changing these tags also stops the tags that rely on them. Only dependencies inside this container are shown."
  - dependencies fix: "Remove a tag together with the tags that rely on it, or move what it provides (the event, value or cookie) to the site before removing it."
  - fragile explanation: "These tags fire on page markup (a CSS class, element ID or button text). A redesign or a text change can stop them without any error, and the tag silently stops counting."
  - fragile fix: "Have the site push a named event when the action happens (for example `dataLayer.push({event: 'generate_lead'})`) and trigger on that event instead."
  - UI note: "Only dependencies inside this container are shown. Code on the site or in another container can also rely on a tag."
  - guard reason: "Other tags rely on it: <names>. Remove together or rewire first."
- **Decisions 2026-11-20:**
  - Full destination IDs are shown.
  - A `certain` dependent turns `remove` into `review`; UA stays `remove`.
  - Fragile DOM ships in this round.
- **Commands.** The test command is `npm run test:foundation`. To run a single file: `node --test tests/foundation/<file>.test.mjs`.
- **Version control.** Commit after every task on the working branch. Never push, merge or deploy without Daniel's explicit go.
- **Commit trailer.** Every commit ends with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **A hostile or slow trigger regex** in an uploaded file must not hang the page. Expected:
   - A pattern longer than 200 characters, with a quantified group, or with more than 2 quantifiers is treated as `possible` without being run.
   - A pattern that does not compile is skipped.
   - A container with 50 such triggers and 100 pushed events audits in under 1 s.

   Test: Task 4.
2. **Variable reference cycles** (`{{A}}` → `{{B}}` → `{{A}}`) and self-references must end. Expected: no hang, and each variable is returned once. Test: Task 1.
3. **Lookup tables with empty rows, no default, or a default that is itself a variable.** Expected:
   - Empty outputs are ignored.
   - The default counts only when `setDefaultValue` is `true`.
   - A nested `{{var}}` resolves through the same chain cap.

   Test: Task 2.
4. **A tag that pushes the event it listens to.** Same for a setup tag naming itself. Expected: no self edge, and no dependency finding from that alone. Test: Task 4.
5. **`setupTag` names that match no tag, or match two tags with the same name.** Expected:
   - An unknown name adds nothing.
   - A duplicated name links to the first non-paused tag with that name.
   - A setup tag without its own trigger is not reported as "Tag without a firing trigger".

   Tests: Task 4 and Task 5.

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `supabase/functions/_shared/gtm-audit/types.ts` | modify | New fields on `GtmTag`, `GtmTrigger`, `TagRow`; new `CHECK_KEYS` |
| `supabase/functions/_shared/gtm-audit/parse.ts` | modify | Keep setup/teardown names, trigger params, custom-event match |
| `supabase/functions/_shared/gtm-audit/refs.ts` | create | `{{var}}` references, variable/trigger lookup, trigger groups, variable chains |
| `supabase/functions/_shared/gtm-audit/destinations.ts` | create | Destination IDs per tag |
| `supabase/functions/_shared/gtm-audit/dependencies.ts` | create | Dependency edges inside the container |
| `supabase/functions/_shared/gtm-audit/fragile.ts` | create | Tags that use markup-based triggers/variables |
| `supabase/functions/_shared/gtm-audit/rules/destinations.ts` | create | Rule `gtm.multiple_destinations` |
| `supabase/functions/_shared/gtm-audit/rules/dependencies.ts` | create | Rule `gtm.dependencies` |
| `supabase/functions/_shared/gtm-audit/rules/fragile.ts` | create | Rule `gtm.fragile_dom` |
| `supabase/functions/_shared/gtm-audit/rules/hygiene.ts` | modify | `ID_KEYS` import; `dead()` skips setup/teardown tags |
| `supabase/functions/_shared/gtm-audit/rules/index.ts` | modify | Register the new rules |
| `supabase/functions/_shared/gtm-audit/migrate.ts` | modify | Remove→review guard; import from `rules/hygiene.ts` |
| `supabase/functions/_shared/gtm-audit/audit.ts` | modify | `sendsTo`, `reliedOnBy` on rows; `ENGINE_VERSION = 2` |
| `supabase/functions/_shared/gtm-audit/sheets.ts` | modify | "Sends to", "Relied on by" columns |
| `src/lib/gtmAuditXlsx.ts` | modify | Column widths |
| `src/components/gtm-audit/GtmAuditReport.tsx` | modify | Two columns + dependency note |
| `src/pages/GtmAudit.tsx` | modify | Lead copy + "cannot see" sentence |
| `scripts/gtm-audit/fixture.mjs` | modify | `setup`/`teardown` options; `lookup()` builder; sample tags 17–19, trigger 16 |
| `src/data/gtmAuditSample.ts` | regenerate | `node scripts/gtm-audit/sample-report.mjs` |
| `tests/foundation/gtm-audit-refs.test.mjs` | create | refs + parse fields |
| `tests/foundation/gtm-audit-destinations.test.mjs` | create | destinations + rule |
| `tests/foundation/gtm-audit-dependencies.test.mjs` | create | dependencies + rule + guard |
| `tests/foundation/gtm-audit-fragile.test.mjs` | create | fragile + rule |
| `tests/foundation/gtm-audit-{parse,sample,xlsx,audit,stats,page,rules}.test.mjs` | modify | Adjust to new fields/keys |
| `CLAUDE.md` | modify | GTM audit section note |

Import graph (no cycles):
- `refs.ts` imports only `types.ts`.
- `destinations.ts` imports `refs.ts`.
- `dependencies.ts` imports `refs.ts` and `rules/finding.ts`.
- `fragile.ts` imports `refs.ts` and `rules/finding.ts`.
- `migrate.ts` imports `dependencies.ts` and `rules/hygiene.ts`, **not** `rules/index.ts`.
- `rules/fragile.ts` imports `migrate.ts`.
- `rules/hygiene.ts` imports `destinations.ts` for `ID_KEYS`.

---

### Task 1: Parser fields and reference helpers

**Files:**
- Modify: `supabase/functions/_shared/gtm-audit/types.ts`
- Modify: `supabase/functions/_shared/gtm-audit/parse.ts`
- Create: `supabase/functions/_shared/gtm-audit/refs.ts`
- Modify: `scripts/gtm-audit/fixture.mjs` (the `tag()` options and a `lookup()` builder)
- Modify: `tests/foundation/gtm-audit-parse.test.mjs:52`
- Test: `tests/foundation/gtm-audit-refs.test.mjs`

**Interfaces:**
- Produces:
  - `GtmTag.setupTagNames: string[]`
  - `GtmTag.teardownTagNames: string[]`
  - `GtmTrigger.params: Record<string, ParamValue>`
  - `GtmTrigger.customEvent: CustomEventMatch | null`
  - `type CustomEventMatch = { match: 'equals' | 'contains' | 'starts_with' | 'regex'; value: string }`
- From `refs.ts`:
  - `MAX_VAR_DEPTH = 5`
  - `variableRefs(v: unknown): string[]`
  - `variableByName(name: string, c: Container): GtmVariable | undefined`
  - `triggerById(id: string, c: Container): GtmTrigger | undefined`
  - `firingTriggers(tag: GtmTag, c: Container): GtmTrigger[]`
  - `expandVars(names: string[], c: Container): GtmVariable[]`
  - `varsUsedBy(tag: GtmTag, c: Container): GtmVariable[]`
- From the fixture:
  - `tag(..., { setup: string[], teardown: string[] })`
  - `lookup(id, name, input, rows: [key, value][], defaultValue?)`

- [ ] **Step 1: Write the failing tests**

Create `tests/foundation/gtm-audit-refs.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../../supabase/functions/_shared/gtm-audit/parse.ts';
import {
  MAX_VAR_DEPTH, variableRefs, variableByName, firingTriggers, expandVars, varsUsedBy,
} from '../../supabase/functions/_shared/gtm-audit/refs.ts';
import { tag, tpl, cond, trigger, customEvent, triggerGroup, variable, exportOf, ALL_PAGES } from '../../scripts/gtm-audit/fixture.mjs';

test('parse keeps setup and teardown tag names, and ignores wrong types', () => {
  const raw = exportOf({ tags: [tag(1, 'Main', 'html', [], { setup: ['Setup A'], teardown: ['Clean up'] }), tag(2, 'Plain', 'html')] });
  raw.containerVersion.tag.push({ tagId: '3', name: 'Odd', type: 'html', setupTag: 'nope', teardownTag: [{ tagName: 7 }, null, {}] });
  const c = parse(raw);
  assert.deepEqual(c.tags[0].setupTagNames, ['Setup A']);
  assert.deepEqual(c.tags[0].teardownTagNames, ['Clean up']);
  assert.deepEqual(c.tags[1].setupTagNames, []);
  assert.deepEqual(c.tags[2].setupTagNames, []);
  assert.deepEqual(c.tags[2].teardownTagNames, ['7']);
});

test('parse keeps trigger params and the custom-event match', () => {
  const c = parse(exportOf({
    tags: [tag(1, 'T', 'html', [], { fire: [10, 11, 12, 13, 14, 15, 16] })],
    triggers: [
      customEvent(10, 'Equals', 'form_ok'),
      trigger(11, 'Contains', 'CUSTOM_EVENT', { custom: [cond('CONTAINS', '{{_event}}', 'lead')] }),
      trigger(12, 'Starts', 'CUSTOM_EVENT', { custom: [cond('STARTS_WITH', '{{Event}}', 'gtm.')] }),
      trigger(13, 'Regex', 'CUSTOM_EVENT', { custom: [cond('MATCH_REGEX', '{{_event}}', '^(a|b)$')] }),
      trigger(14, 'Negated', 'CUSTOM_EVENT', { custom: [cond('EQUALS', '{{_event}}', 'x', true)] }),
      trigger(15, 'Other var', 'CUSTOM_EVENT', { custom: [cond('EQUALS', '{{Page Path}}', '/x')] }),
      trigger(16, 'Visible', 'ELEMENT_VISIBILITY', { params: [tpl('elementSelector', '.hero')] }),
    ],
  }));
  const by = Object.fromEntries(c.triggers.map((t) => [t.name, t]));
  assert.deepEqual(by.Equals.customEvent, { match: 'equals', value: 'form_ok' });
  assert.deepEqual(by.Contains.customEvent, { match: 'contains', value: 'lead' });
  assert.deepEqual(by.Starts.customEvent, { match: 'starts_with', value: 'gtm.' });
  assert.deepEqual(by.Regex.customEvent, { match: 'regex', value: '^(a|b)$' });
  assert.equal(by.Negated.customEvent, null);
  assert.equal(by['Other var'].customEvent, null);
  assert.equal(by.Visible.params.elementSelector, '.hero');
  const allPages = parse(exportOf({ tags: [tag(1, 'T', 'html')] })).triggers.find((t) => t.id === ALL_PAGES);
  assert.deepEqual(allPages.params, {});
  assert.equal(allPages.customEvent, null);
});

test('variableRefs collects names inside {{…}} from nested values', () => {
  assert.deepEqual(variableRefs({ a: 'x {{One}} y', b: ['{{Two}}', { c: '{{One}}' }], d: '{{ bad' }), ['One', 'Two']);
  assert.deepEqual(variableRefs('no refs'), []);
});

test('variableByName: first variable with a name wins; no prototype keys', () => {
  const c = parse(exportOf({ tags: [tag(1, 'T', 'html')], variables: [variable(1, 'X', 'c', [tpl('value', 'first')]), variable(2, 'X', 'c', [tpl('value', 'second')])] }));
  assert.equal(variableByName('X', c).params.value, 'first');
  assert.equal(variableByName('constructor', c), undefined);
});

test('firingTriggers expands trigger groups, nested groups and cycles once each', () => {
  const raw = exportOf({
    tags: [tag(1, 'T', 'html', [], { fire: [20] })],
    triggers: [customEvent(10, 'A', 'a'), triggerGroup(21, 'Inner', [10, 20]), triggerGroup(20, 'Outer', [21])],
  });
  const c = parse(raw);
  assert.deepEqual(firingTriggers(c.tags[0], c).map((t) => t.name).sort(), ['A', 'Inner', 'Outer']);
});

test(`expandVars follows variable chains ${MAX_VAR_DEPTH} levels deep and stops`, () => {
  const vars = Array.from({ length: 8 }, (_, n) => variable(n + 1, `V${n}`, 'jsm', [tpl('javascript', n < 7 ? `function(){return {{V${n + 1}}}}` : 'function(){return 1}')]));
  const c = parse(exportOf({ tags: [tag(1, 'T', 'html', [tpl('html', '{{V0}}')])], variables: vars }));
  const names = expandVars(['V0'], c).map((v) => v.name);
  assert.ok(names.includes('V5'));
  assert.equal(names.includes('V6'), false);
});

test('expandVars ends on cycles and self references', () => {
  const c = parse(exportOf({
    tags: [tag(1, 'T', 'html')],
    variables: [variable(1, 'A', 'jsm', [tpl('javascript', '{{B}}')]), variable(2, 'B', 'jsm', [tpl('javascript', '{{A}}{{B}}')])],
  }));
  assert.deepEqual(expandVars(['A'], c).map((v) => v.name), ['A', 'B']);
});

test('varsUsedBy reads tag params and firing-trigger conditions', () => {
  const c = parse(exportOf({
    tags: [tag(1, 'T', 'gaawe', [tpl('eventName', '{{Ev}}')], { fire: [10] })],
    triggers: [trigger(10, 'Click', 'CLICK', { filter: [cond('EQUALS', '{{Btn}}', 'x')] })],
    variables: [variable(1, 'Ev', 'c', [tpl('value', 'e')]), variable(2, 'Btn', 'd', [tpl('elementId', 'b')]), variable(3, 'Unused', 'c')],
  }));
  assert.deepEqual(varsUsedBy(c.tags[0], c).map((v) => v.name).sort(), ['Btn', 'Ev']);
});
```

In `tests/foundation/gtm-audit-parse.test.mjs:52`, replace the built-in trigger assertion with:

```js
  assert.deepEqual(byId[ALL_PAGES], { id: ALL_PAGES, name: 'All Pages', type: 'PAGEVIEW', conditions: [], builtIn: true, groupTriggerIds: [], folderId: null, params: {}, customEvent: null });
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `node --test tests/foundation/gtm-audit-refs.test.mjs`
Expected: FAIL, with "Cannot find module …/refs.ts".

- [ ] **Step 3: Extend the fixture**

In `scripts/gtm-audit/fixture.mjs`, change `tag()` to accept `setup` and `teardown`:

```js
export function tag(id, name, type, params = [], { fire = [ALL_PAGES], block = [], consent, paused, folder, modified, setup = [], teardown = [] } = {}) {
  return {
    tagId: String(id), name, type, parameter: params, fingerprint: String(modified ?? DEFAULT_MODIFIED),
    firingTriggerId: fire.map(String),
    ...(block.length ? { blockingTriggerId: block.map(String) } : {}),
    ...(paused ? { paused: true } : {}),
    ...(folder ? { parentFolderId: String(folder) } : {}),
    ...(setup.length ? { setupTag: setup.map((tagName) => ({ tagName, stopOnSetupFailure: true })) } : {}),
    ...(teardown.length ? { teardownTag: teardown.map((tagName) => ({ tagName, stopTeardownOnFailure: true })) } : {}),
    consentSettings: consent ?? { consentStatus: 'NOT_SET' },
  };
}
```

Add the following after `variable`:

```js
/** Lookup Table variable (smm). rows: [[input, output], …]; defaultValue switches on "Set default value". */
export const lookup = (id, name, input, rows, defaultValue) => variable(id, name, 'smm', [
  tpl('input', input),
  list('map', rows.map(([key, value]) => ms({ key, value }))),
  ...(defaultValue === undefined ? [] : [bool('setDefaultValue', true), tpl('defaultValue', defaultValue)]),
]);
```

- [ ] **Step 4: Types and parser**

In `types.ts`, add the following to `GtmTag` (after `modifiedAt`):

```ts
  /** Tag names in "Fire a tag before / after this tag fires" (setupTag / teardownTag). */
  setupTagNames: string[];
  teardownTagNames: string[];
```

Add this before `GtmTrigger`:

```ts
/** A trigger's custom-event condition on {{_event}}, when it has one that is not negated. */
export interface CustomEventMatch { match: 'equals' | 'contains' | 'starts_with' | 'regex'; value: string }
```

Add the following to `GtmTrigger` (after `folderId`):

```ts
  params: Record<string, ParamValue>;
  customEvent: CustomEventMatch | null;
```

In `parse.ts`, add the `CustomEventMatch` type import and these helpers after `conditionsOf`:

```ts
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
```

In the tag mapper, add:

```ts
      setupTagNames: tagNames(t.setupTag), teardownTagNames: tagNames(t.teardownTag),
```

In the trigger mapper, return `params` and `customEvent: customEventOf(t)`:

```ts
    return {
      id: str(t.triggerId), name: str(t.name), type: enumOf(t.type), conditions: conditionsOf(t),
      builtIn: false, groupTriggerIds: members, folderId: idOrNull(t.parentFolderId),
      params, customEvent: customEventOf(t),
    };
```

Change the built-in push to:

```ts
      triggers.push({ id, name: b.name, type: b.type, conditions: [], builtIn: true, groupTriggerIds: [], folderId: null, params: {}, customEvent: null });
```

- [ ] **Step 5: Create `refs.ts`**

```ts
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
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `node --test tests/foundation/gtm-audit-refs.test.mjs tests/foundation/gtm-audit-parse.test.mjs`
Expected: PASS.

Then run `npm run test:foundation`. Expected: everything passes. The sample is unchanged, because `reportData` copies no trigger or tag fields.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/gtm-audit/types.ts supabase/functions/_shared/gtm-audit/parse.ts supabase/functions/_shared/gtm-audit/refs.ts scripts/gtm-audit/fixture.mjs tests/foundation/gtm-audit-refs.test.mjs tests/foundation/gtm-audit-parse.test.mjs
git commit -m "feat(gtm-audit): keep setup/teardown tags, trigger params and custom-event match; reference helpers"
```

---

### Task 2: Destination IDs per tag

**Files:**
- Create: `supabase/functions/_shared/gtm-audit/destinations.ts`
- Modify: `supabase/functions/_shared/gtm-audit/rules/hygiene.ts` (import `ID_KEYS` instead of defining it)
- Test: `tests/foundation/gtm-audit-destinations.test.mjs`

**Interfaces:**
- Consumes (Task 1):
  - `variableByName(name, c)`
  - `MAX_VAR_DEPTH`
- Produces:
  - `type Resolution = 'literal' | 'constant_variable' | 'lookup' | 'unresolved'`
  - `interface Destination { vendorId: string; id: string | null; raw: string; resolved: Resolution }`
  - `ID_KEYS: string[]`
  - `MAX_HTML = 200_000`
  - `HTML_ID_PATTERNS: { vendorId: string; re: RegExp; when?: RegExp }[]`. Here `vendorId: 'google'` means "decide by prefix".
  - `normalizeId(raw: string, vendorId?: string): string`
  - `destinationsOf(info: TagInfo, c: Container): Destination[]`

**Vendor ids:** use the registry ids, which are not the ones in the spec's comment:
- `meta`
- `ga4`
- `google-ads`
- `linkedin`
- `tiktok-pixel`
- `microsoft-ads`
- `pinterest-pixel`
- `snap-pixel`
- `hotjar`
- `clarity`

- [ ] **Step 1: Write the failing tests**

Create `tests/foundation/gtm-audit-destinations.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../../supabase/functions/_shared/gtm-audit/parse.ts';
import { tagInfos } from '../../supabase/functions/_shared/gtm-audit/info.ts';
import { destinationsOf, normalizeId, HTML_ID_PATTERNS } from '../../supabase/functions/_shared/gtm-audit/destinations.ts';
import { tag, tpl, variable, lookup, template, tplType, exportOf } from '../../scripts/gtm-audit/fixture.mjs';

const metaTpl = template(20, 'Meta Pixel', { permissions: { inject_script: ['https://connect.facebook.net/*'] }, gallery: ['facebookarchive', 'GoogleTagManager-WebTemplate-For-FacebookPixel'] });
const dests = (tags, variables = []) => {
  const c = parse(exportOf({ tags, variables, templates: [metaTpl] }));
  return Object.fromEntries(tagInfos(c).map((i) => [i.tag.name, destinationsOf(i, c)]));
};
const html = (s) => tpl('html', s);

test('literal, constant, lookup (nested variable and default) and unresolved IDs', () => {
  const d = dests([
    tag(1, 'Literal', tplType(20), [tpl('pixelId', '1234567890')]),
    tag(2, 'Constant', 'gaawe', [tpl('measurementIdOverride', '{{GA4 ID}}')]),
    tag(3, 'Lookup', tplType(20), [tpl('pixelId', '{{Pixel by host}}')]),
    tag(4, 'Unresolved', tplType(20), [tpl('pixelId', '{{DLV pixel}}')]),
    tag(5, 'Partial', tplType(20), [tpl('pixelId', 'x{{GA4 ID}}')]),
    tag(6, 'Several', tplType(20), [tpl('pixelIds', '111111111, 222222222')]),
  ], [
    variable(1, 'GA4 ID', 'c', [tpl('value', ' g-abc1234 ')]),
    variable(2, 'Other pixel', 'c', [tpl('value', '333333333')]),
    lookup(3, 'Pixel by host', '{{Page Hostname}}', [['a.example', '444444444'], ['b.example', '{{Other pixel}}'], ['c.example', '']], '555555555'),
    variable(4, 'DLV pixel', 'v', [tpl('name', 'pixel')]),
  ]);
  assert.deepEqual(d.Literal, [{ vendorId: 'meta', id: '1234567890', raw: '1234567890', resolved: 'literal' }]);
  assert.deepEqual(d.Constant, [{ vendorId: 'ga4', id: 'G-ABC1234', raw: '{{GA4 ID}}', resolved: 'constant_variable' }]);
  assert.deepEqual(d.Lookup.map((x) => [x.id, x.resolved]), [['444444444', 'lookup'], ['333333333', 'lookup'], ['555555555', 'lookup']]);
  assert.deepEqual(d.Unresolved, [{ vendorId: 'meta', id: null, raw: '{{DLV pixel}}', resolved: 'unresolved' }]);
  assert.deepEqual(d.Partial.map((x) => x.resolved), ['unresolved']);
  assert.deepEqual(d.Several.map((x) => x.id), ['111111111', '222222222']);
});

test('a lookup default counts only when "Set default value" is on', () => {
  const d = dests([tag(1, 'L', tplType(20), [tpl('pixelId', '{{T}}')])], [
    { variableId: '9', name: 'T', type: 'smm', parameter: [tpl('input', '{{Page Hostname}}'), tpl('defaultValue', '999999999')] },
  ]);
  assert.deepEqual(d.L.map((x) => x.resolved), ['unresolved']);
});

test('Custom HTML patterns, one per vendor', () => {
  const d = dests([
    tag(1, 'Meta', 'html', [html("<script>fbq('init', '1234567890');fbq('track','PageView')</script>")]),
    tag(2, 'Gtag', 'html', [html('<script async src="https://www.googletagmanager.com/gtag/js?id=G-HTML1234"></script><script>gtag("config", "AW-12345678/abcDEF");</script>')]),
    tag(3, 'LinkedIn', 'html', [html('<script>_linkedin_partner_id = "1234567";</script>')]),
    tag(4, 'TikTok', 'html', [html("<script>ttq.load('CABCDEFGH12345');</script>")]),
    tag(5, 'UET', 'html', [html('<script>(function(w,d,t,r,u){var o={ti:"98765432"};})(window,document,"script","//bat.bing.com/bat.js","uetq");</script>')]),
    tag(6, 'Pinterest', 'html', [html("<script>pintrk('load', '2612345678901');</script>")]),
    tag(7, 'Snap', 'html', [html("<script>snaptr('init', '1a2b3c4d-1a2b-1a2b-1a2b-1a2b3c4d5e6f');</script>")]),
    tag(8, 'Hotjar', 'html', [html('<script>(function(h,o,t,j,a,r){h._hjSettings={hjid:1234567,hjsv:6};})(window,document)</script>')]),
    tag(9, 'Clarity', 'html', [html('<script>(function(c,l,a,r,i,t,y){})(window, document, "clarity", "script", "abc123xyz");</script>')]),
    tag(10, 'Clarity src', 'html', [html('<script src="https://www.clarity.ms/tag/sample123"></script>')]),
    tag(11, 'No bing', 'html', [html('<script>var o={ti:"98765432"};</script>')]),
  ]);
  const ids = (n) => d[n].map((x) => `${x.vendorId}:${x.id}`);
  assert.deepEqual(ids('Meta'), ['meta:1234567890']);
  assert.deepEqual(ids('Gtag').sort(), ['ga4:G-HTML1234', 'google-ads:AW-12345678']);
  assert.deepEqual(ids('LinkedIn'), ['linkedin:1234567']);
  assert.deepEqual(ids('TikTok'), ['tiktok-pixel:CABCDEFGH12345']);
  assert.deepEqual(ids('UET'), ['microsoft-ads:98765432']);
  assert.deepEqual(ids('Pinterest'), ['pinterest-pixel:2612345678901']);
  assert.deepEqual(ids('Snap'), ['snap-pixel:1a2b3c4d-1a2b-1a2b-1a2b-1a2b3c4d5e6f']);
  assert.deepEqual(ids('Hotjar'), ['hotjar:1234567']);
  assert.deepEqual(ids('Clarity'), ['clarity:abc123xyz']);
  assert.deepEqual(ids('Clarity src'), ['clarity:sample123']);
  assert.deepEqual(ids('No bing'), []);
});

test('a variable inside a Custom HTML pattern resolves like a field', () => {
  const d = dests([tag(1, 'Meta', 'html', [html("<script>fbq('init', '{{Meta ID}}');</script>")])], [variable(1, 'Meta ID', 'c', [tpl('value', '7777777777')])]);
  assert.deepEqual(d.Meta, [{ vendorId: 'meta', id: '7777777777', raw: '{{Meta ID}}', resolved: 'constant_variable' }]);
});

test('Google: AW label dropped, bare conversion ID gets AW-, UA and GT skipped', () => {
  const d = dests([
    tag(1, 'Conv', 'awct', [tpl('conversionId', '000000000'), tpl('conversionLabel', 'abc')]),
    tag(2, 'Google tag AW', 'googtag', [tpl('tagId', 'AW-111111111')]),
    tag(3, 'UA', 'ua', [tpl('trackingId', 'UA-000000-1')]),
    tag(4, 'GT', 'googtag', [tpl('tagId', 'GT-ABCDEF')]),
  ]);
  assert.deepEqual(d.Conv.map((x) => `${x.vendorId}:${x.id}`), ['google-ads:AW-000000000']);
  assert.deepEqual(d['Google tag AW'].map((x) => `${x.vendorId}:${x.id}`), ['google-ads:AW-111111111']);
  assert.deepEqual(d.UA, []);
  assert.deepEqual(d.GT, []);
});

test('normalizeId', () => {
  assert.equal(normalizeId(' g-abc123 '), 'G-ABC123');
  assert.equal(normalizeId('aw-123456789/Label_X'), 'AW-123456789');
  assert.equal(normalizeId('dc-1234567'), 'DC-1234567');
  assert.equal(normalizeId('123456789', 'google-ads'), 'AW-123456789');
  assert.equal(normalizeId('123456789', 'meta'), '123456789');
  assert.equal(normalizeId('CabcDEF123'), 'CabcDEF123');
});

test('every Custom HTML pattern is linear on 5 MB', () => {
  const N = 5 * 1024 * 1024;
  const fill = (s) => s.repeat(Math.ceil(N / s.length)).slice(0, N);
  const inputs = ["fbq('init','", "gtag('config','G-", '{{', 'ti:"{{aaaa', '{{' + 'a'.repeat(199), "_linkedin_partner_id='", "ttq.load('", ' '.repeat(10)];
  for (const p of HTML_ID_PATTERNS) {
    for (const input of inputs) {
      const s = fill(input);
      const t = performance.now();
      [...s.matchAll(p.re)];
      const ms = performance.now() - t;
      assert.ok(ms < 1000, `${p.vendorId} ${p.re.source.slice(0, 30)} took ${ms} ms on ${JSON.stringify(input.slice(0, 20))}`);
    }
  }
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `node --test tests/foundation/gtm-audit-destinations.test.mjs`
Expected: FAIL, with "Cannot find module …/destinations.ts".

- [ ] **Step 3: Create `destinations.ts`**

```ts
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
```

- [ ] **Step 4: Share `ID_KEYS` with hygiene**

In `rules/hygiene.ts`, delete the `const ID_KEYS = [...]` line and add `import { ID_KEYS } from '../destinations.ts';`.

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `node --test tests/foundation/gtm-audit-destinations.test.mjs`, then `npm run test:foundation`.
Expected: PASS. The sample output is unchanged.

If a vendor in the HTML test resolves to a different registry id (for example, `identify()` picks a vendor for the Custom HTML tag from its URL), the pattern's own vendor wins anyway. A failure there means the pattern is broken, not the test.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/gtm-audit/destinations.ts supabase/functions/_shared/gtm-audit/rules/hygiene.ts tests/foundation/gtm-audit-destinations.test.mjs
git commit -m "feat(gtm-audit): destination IDs per tag (fields, Custom HTML patterns, constant and lookup variables)"
```

---

### Task 3: Rule `gtm.multiple_destinations` and the "Sends to" column

**Files:**
- Create: `supabase/functions/_shared/gtm-audit/rules/destinations.ts`
- Modify:
  - `supabase/functions/_shared/gtm-audit/types.ts` (`CHECK_KEYS`, `TagRow.sendsTo`)
  - `supabase/functions/_shared/gtm-audit/rules/index.ts`
  - `supabase/functions/_shared/gtm-audit/audit.ts` (`rows()`)
  - `supabase/functions/_shared/gtm-audit/sheets.ts`
  - `src/lib/gtmAuditXlsx.ts:11`
  - `src/components/gtm-audit/GtmAuditReport.tsx` (table)
  - `scripts/gtm-audit/fixture.mjs` (sample tag 17)
  - `tests/foundation/gtm-audit-sample.test.mjs`
  - `tests/foundation/gtm-audit-xlsx.test.mjs:18,45`
- Regenerate: `src/data/gtmAuditSample.ts`
- Test: `tests/foundation/gtm-audit-destinations.test.mjs` (append)

**Interfaces:**
- Consumes (Task 2): `destinationsOf(info, c)`, `Destination`
- Produces:
  - `multipleDestinations(container: Container, infos: TagInfo[]): Finding`
  - `TagRow.sendsTo: string[]`. Each entry is a destination ID, or `Unresolved ({{Name}})`.
  - `CHECK_KEYS` gains `'gtm.multiple_destinations'` right after `'gtm.consent_mode_default'`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/foundation/gtm-audit-destinations.test.mjs`:

```js
import { runRules } from '../../supabase/functions/_shared/gtm-audit/rules/index.ts';
import { audit } from '../../supabase/functions/_shared/gtm-audit/audit.ts';

const rule = (tags, variables = []) => {
  const c = parse(exportOf({ tags, variables, templates: [metaTpl] }));
  return runRules(c, tagInfos(c)).find((f) => f.checkKey === 'gtm.multiple_destinations');
};

test('gtm.multiple_destinations: two Meta IDs, newest change per ID, unresolved listed last', () => {
  const f = rule([
    tag(1, 'Meta A', tplType(20), [tpl('pixelId', '1234567890')], { modified: Date.UTC(2025, 2, 2) }),
    tag(2, 'Meta A2', tplType(20), [tpl('pixelId', '{{Meta ID}}')], { modified: Date.UTC(2024, 0, 1) }),
    tag(3, 'Meta old', tplType(20), [tpl('pixelId', '9876543210')], { modified: Date.UTC(2021, 5, 10) }),
    tag(4, 'Meta paused', tplType(20), [tpl('pixelId', '5555555555')], { paused: true }),
    tag(5, 'Meta DLV', tplType(20), [tpl('pixelId', '{{DLV}}')]),
  ], [variable(1, 'Meta ID', 'c', [tpl('value', '1234567890')])]);
  assert.equal(f.status, 'manual');
  assert.equal(f.priority, 'high');
  assert.equal(f.typicalOwner, 'marketing');
  assert.equal(f.title, '1 vendor sends data to more than one account');
  assert.deepEqual(f.evidence.details.slice(1), [
    'Meta Pixel: 2 IDs — 1234567890 (2 tags, last changed 2025-03-02), 9876543210 (1 tag, last changed 2021-06-10)',
    '1 tag with an ID the audit could not resolve',
  ]);
  assert.equal(f.explanation, 'Each ID is a separate account at the vendor. Check who owns each one. An ID nobody recognises often belongs to an old account or a former agency, and data sent to it is outside your control.');
  assert.equal(f.fix, 'Keep the IDs your organisation owns and has access to. Remove or pause tags that send to the others.');
});

test('gtm.multiple_destinations: GA4 + Ads, several AW labels, and UA next to G- pass', () => {
  const f = rule([
    tag(1, 'GA4', 'gaawe', [tpl('measurementIdOverride', 'G-AAAA1111')]),
    tag(2, 'Ads 1', 'awct', [tpl('conversionId', '111111111'), tpl('conversionLabel', 'a')]),
    tag(3, 'Ads 2', 'awct', [tpl('conversionId', 'AW-111111111/b')]),
    tag(4, 'UA', 'ua', [tpl('trackingId', 'UA-1-1')]),
  ]);
  assert.equal(f.status, 'pass');
  assert.equal(f.title, 'Each vendor sends to one account');
  assert.deepEqual(f.evidence.details.slice(1), []);
});

test('TagRow.sendsTo lists IDs and unresolved references', () => {
  const r = audit(exportOf({
    tags: [tag(1, 'Meta', tplType(20), [tpl('pixelId', '1234567890')]), tag(2, 'Meta DLV', tplType(20), [tpl('pixelId', '{{DLV}}')]), tag(3, 'Inline', 'html', [tpl('html', '<p>')])],
    templates: [metaTpl],
  }));
  assert.deepEqual(r.tags.map((t) => t.sendsTo), [['1234567890'], ['Unresolved ({{DLV}})'], []]);
});
```

In `tests/foundation/gtm-audit-xlsx.test.mjs`, replace `rows.length, 9` (line 18) with `rows.length, CHECK_KEYS.length`. Replace `rows.length, 16` (line 45) with `rows.length, s.tags.length`, using the report object that test already builds. Import `CHECK_KEYS` from `../../supabase/functions/_shared/gtm-audit/types.ts` if it is not imported yet, and read the surrounding lines to use the right variable name.

In the same test, add an assertion that `TAG_COLUMNS` includes `'Sends to'` and that each tag row's length equals `TAG_COLUMNS.length`.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `node --test tests/foundation/gtm-audit-destinations.test.mjs`
Expected: FAIL, because no finding has `gtm.multiple_destinations`.

- [ ] **Step 3: Rule**

Create `rules/destinations.ts`:

```ts
import type { Finding } from '../../tracking-check/types.ts';
import type { Container, TagInfo } from '../types.ts';
import { vendorById } from '../../tracking-vendors.ts';
import { destinationsOf } from '../destinations.ts';
import { finding, isActive, plural } from './finding.ts';

const day = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

function lastChanged(tags: TagInfo[]): string {
  const times = tags.map((i) => i.tag.modifiedAt).filter((t): t is number => t !== null);
  return times.length ? `, last changed ${day(Math.max(...times))}` : '';
}

export function multipleDestinations(container: Container, infos: TagInfo[]): Finding {
  const byVendor = new Map<string, Map<string, TagInfo[]>>();
  const unresolved = new Set<string>();
  for (const i of infos) {
    if (!isActive(i)) continue;
    for (const d of destinationsOf(i, container)) {
      if (d.id === null) { unresolved.add(i.tag.id); continue; }
      const ids = byVendor.get(d.vendorId) ?? new Map<string, TagInfo[]>();
      byVendor.set(d.vendorId, ids);
      const tags = ids.get(d.id) ?? [];
      if (!tags.includes(i)) tags.push(i);
      ids.set(d.id, tags);
    }
  }
  const lines: string[] = [];
  for (const [vendorId, ids] of byVendor) {
    if (ids.size < 2) continue;
    const parts = [...ids].map(([id, tags]) => `${id} (${plural(tags.length, 'tag')}${lastChanged(tags)})`);
    lines.push(`${vendorById(vendorId)?.name ?? vendorId}: ${ids.size} IDs — ${parts.join(', ')}`);
  }
  const tail = unresolved.size ? [`${plural(unresolved.size, 'tag')} with an ID the audit could not resolve`] : [];
  if (!lines.length) {
    return finding('gtm.multiple_destinations', 'Each vendor sends to one account', 'pass', 'high', 'marketing',
      'No vendor has more than one destination ID among the active tags.', '', tail);
  }
  return finding('gtm.multiple_destinations',
    `${plural(lines.length, 'vendor')} ${lines.length === 1 ? 'sends' : 'send'} data to more than one account`, 'manual', 'high', 'marketing',
    'Each ID is a separate account at the vendor. Check who owns each one. An ID nobody recognises often belongs to an old account or a former agency, and data sent to it is outside your control.',
    'Keep the IDs your organisation owns and has access to. Remove or pause tags that send to the others.',
    [...lines, ...tail]);
}
```

In `types.ts`, set `CHECK_KEYS` to:

```ts
export const CHECK_KEYS = [
  'gtm.consent_missing', 'gtm.consent_inferred', 'gtm.identifies_visitors', 'gtm.consent_mode_default',
  'gtm.multiple_destinations',
  'gtm.unknown_custom_html', 'gtm.community_template_injects', 'gtm.duplicate', 'gtm.dead', 'gtm.stale',
] as const;
```

Add the following to `TagRow`, after `vendorName`:

```ts
  /** Destination IDs, or "Unresolved ({{Name}})". */
  sendsTo: string[];
```

In `rules/index.ts`, import `multipleDestinations` from `./destinations.ts`. Add `multipleDestinations(container, infos),` after `consentModeDefault(container, infos),`.

In `audit.ts`, add `import { destinationsOf } from './destinations.ts';`. In `rows()`, add the following after `vendorName`:

```ts
      sendsTo: [...new Set(destinationsOf(i, container).map((d) => d.id ?? `Unresolved (${d.raw})`))],
```

- [ ] **Step 4: Spreadsheet, xlsx and UI**

In `sheets.ts`:

```ts
export const TAG_COLUMNS = ['Tag', 'Type', 'Vendor', 'Sends to', 'Triggers', 'Consent', 'Consent evidence', 'Plan', 'Why', 'Folder', 'Last changed', 'Paused'];
```

In `toTagRows`, add `t.sendsTo.join('\n'),` after `t.vendorName,`.

In `src/lib/gtmAuditXlsx.ts:11`, add `'Sends to': 28,` after `Vendor: 22,` in `TAG_WIDTHS`.

In `GtmAuditReport.tsx`:
- Change `min-w-[720px]` to `min-w-[860px]`.
- Add `<th className="p-2">Sends to</th>` after the Vendor header.
- Add this cell after the vendor cell:

```tsx
                  <td className="p-2 align-top break-all text-xs">{t.sendsTo.join(", ") || "—"}</td>
```

- [ ] **Step 5: Sample tag 17 and regenerating the sample**

In `sampleExport()`, append after tag 16:

```js
      tag(17, 'Meta - PageView (old agency)', tplType(20), [tpl('pixelId', '9876543210'), tpl('eventName', 'standard'), tpl('standardEventName', 'PageView')], { fire: [10], modified: OLD_2023, folder: 40 }),
```

Run: `node scripts/gtm-audit/sample-report.mjs`

In `tests/foundation/gtm-audit-sample.test.mjs`:
- Add `'gtm.multiple_destinations': 'manual',` after `'gtm.consent_mode_default': 'pass',`.
- Change `16` to `17`.
- Set the headline to `'3 of 17 tags have no consent condition · 1 identifies visitors · 3 removal candidates'`.
- Add this test:

```js
test('the sample shows two Meta pixel IDs', () => {
  const f = buildSample().findings.find((x) => x.checkKey === 'gtm.multiple_destinations');
  assert.equal(f.evidence.details[1], 'Meta Pixel: 2 IDs — 1234567890 (2 tags, last changed 2026-10-01), 9876543210 (1 tag, last changed 2023-03-14)');
});
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npm run test:foundation`
Expected: PASS, including the sample freshness test, the rules test (keys equal `[...CHECK_KEYS]`), the xlsx test and the stats test.

- [ ] **Step 7: Commit**

```bash
git add -A supabase/functions/_shared/gtm-audit src/lib/gtmAuditXlsx.ts src/components/gtm-audit/GtmAuditReport.tsx scripts/gtm-audit/fixture.mjs src/data/gtmAuditSample.ts tests/foundation
git commit -m "feat(gtm-audit): gtm.multiple_destinations and the Sends to column"
```

---

### Task 4: Dependency graph

**Files:**
- Create: `supabase/functions/_shared/gtm-audit/dependencies.ts`
- Test: `tests/foundation/gtm-audit-dependencies.test.mjs`

**Interfaces:**
- Consumes:
  - Task 1: `firingTriggers`, `varsUsedBy`, `GtmTrigger.customEvent`, `GtmTag.setupTagNames` / `teardownTagNames`
  - `isActive` from `rules/finding.ts`
  - `MAX_HTML` from `destinations.ts`
- Produces:
  - `type DepKind = 'sequence' | 'event' | 'consent_tool' | 'global' | 'cookie'`
  - `interface Dependency { from: string; to: string; kind: DepKind; via: string; confidence: 'certain' | 'possible' }`. Here `from` is the relied-on tag's id and `to` is the dependent tag's id. `via` holds:
    - for sequence: `'setup'` or `'teardown'`
    - for event: the event name
    - for consent_tool: the CMP vendor name
    - for global: the variable name
    - for cookie: the cookie name
  - `eventMatch(t: GtmTrigger, event: string): 'certain' | 'possible' | null`
  - `dependencies(container: Container, infos: TagInfo[]): Dependency[]`
- **Who is a provider:**
  - Sequence providers are any non-paused tag with that name. The first one wins, and it does not need a trigger.
  - All other providers, and every dependent, must be active (`isActive`).
- **Ruling (the plan's own):** `consent_tool` providers are active tags whose `vendor.kind === 'cmp'`. That is exactly what `migrate()` classes as `consent_tool` once paused, trigger-less, duplicate and UA tags are excluded. Reading `vendor.kind` instead of calling `migrate()` keeps `migrate.ts → dependencies.ts` free of a cycle.

- [ ] **Step 1: Write the failing tests**

Create `tests/foundation/gtm-audit-dependencies.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../../supabase/functions/_shared/gtm-audit/parse.ts';
import { tagInfos } from '../../supabase/functions/_shared/gtm-audit/info.ts';
import { dependencies, eventMatch } from '../../supabase/functions/_shared/gtm-audit/dependencies.ts';
import {
  tag, tpl, cond, trigger, customEvent, triggerGroup, variable, template, tplType, needed, exportOf, CONSENT_INIT,
} from '../../scripts/gtm-audit/fixture.mjs';

const push = (event) => tpl('html', `<script>dataLayer.push({event: '${event}'})</script>`);
const deps = (spec) => {
  const c = parse(exportOf(spec));
  const name = new Map(c.tags.map((t) => [t.id, t.name]));
  return dependencies(c, tagInfos(c)).map((d) => `${name.get(d.from)} -> ${name.get(d.to)} | ${d.kind} ${d.via} ${d.confidence}`).sort();
};

test('sequence: setup and teardown tags, also without their own trigger; unknown names add nothing', () => {
  assert.deepEqual(deps({
    tags: [
      tag(1, 'Main', 'html', [], { setup: ['Prep', 'Missing'], teardown: ['After'] }),
      tag(2, 'Prep', 'html', [], { fire: [] }),
      tag(3, 'After', 'html'),
      tag(4, 'Self', 'html', [], { setup: ['Self'] }),
    ],
  }), ['After -> Main | sequence teardown certain', 'Prep -> Main | sequence setup certain']);
});

test('sequence: a duplicated name links to the first non-paused tag', () => {
  assert.deepEqual(deps({
    tags: [
      tag(1, 'Prep', 'html', [], { paused: true }),
      tag(2, 'Main', 'html', [], { setup: ['Prep'] }),
      tag(3, 'Prep', 'html'),
      tag(4, 'Prep', 'html'),
    ],
  }), ['Prep -> Main | sequence setup certain']);
});

test('event: equals is certain, contains/regex possible, groups followed, no self edge', () => {
  assert.deepEqual(deps({
    tags: [
      tag(1, 'Pusher', 'html', [tpl('html', "<script>dataLayer.push({'event':\"form_ok\", x: 1});dataLayer.push({ event: 'lead_done' })</script>")]),
      tag(2, 'Exact', 'gaawe', [], { fire: [10] }),
      tag(3, 'Contains', 'gaawe', [], { fire: [11] }),
      tag(4, 'Regex', 'gaawe', [], { fire: [12] }),
      tag(5, 'Grouped', 'gaawe', [], { fire: [13] }),
      tag(6, 'Echo', 'html', [push('echo')], { fire: [14] }),
    ],
    triggers: [
      customEvent(10, 'CE form_ok', 'form_ok'),
      trigger(11, 'CE contains lead', 'CUSTOM_EVENT', { custom: [cond('CONTAINS', '{{_event}}', 'lead')] }),
      trigger(12, 'CE regex', 'CUSTOM_EVENT', { custom: [cond('MATCH_REGEX', '{{_event}}', '^form_(ok|fail)$')] }),
      triggerGroup(13, 'Group', [10]),
      customEvent(14, 'CE echo', 'echo'),
    ],
  }), [
    'Pusher -> Contains | event lead_done possible',
    'Pusher -> Exact | event form_ok certain',
    'Pusher -> Grouped | event form_ok certain',
    'Pusher -> Regex | event form_ok possible',
  ]);
});

test('eventMatch: hostile and uncompilable regexes', () => {
  const t = (value) => ({ customEvent: { match: 'regex', value } });
  assert.equal(eventMatch(t('^(a+)+$'), 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!'), 'possible');
  assert.equal(eventMatch(t('a*a*a*b'), 'aaaa'), 'possible');
  assert.equal(eventMatch(t('x'.repeat(201)), 'y'), 'possible');
  assert.equal(eventMatch(t('(unclosed'), 'unclosed'), null);
  assert.equal(eventMatch(t('^(gtm\\.)?click$'), 'gtm.click'), 'possible');
  assert.equal(eventMatch(t('^click$'), 'other'), null);
  assert.equal(eventMatch({ customEvent: null }, 'x'), null);
});

test('event: 50 hostile regex triggers and 100 pushed events finish quickly', () => {
  const html = Array.from({ length: 100 }, (_, n) => `dataLayer.push({event:'${'a'.repeat(90)}${n}'});`).join('');
  const triggers = Array.from({ length: 50 }, (_, n) => trigger(100 + n, `R${n}`, 'CUSTOM_EVENT', { custom: [cond('MATCH_REGEX', '{{_event}}', n % 2 ? '^(a+)+$' : 'a*a*$')] }));
  const tags = [tag(1, 'Pusher', 'html', [tpl('html', `<script>${html}</script>`)]), ...triggers.map((t, n) => tag(10 + n, `L${n}`, 'gaawe', [], { fire: [100 + n] }))];
  const t0 = performance.now();
  const c = parse(exportOf({ tags, triggers }));
  dependencies(c, tagInfos(c));
  assert.ok(performance.now() - t0 < 1000);
});

test('consent_tool: CMP tag to every gated tag', () => {
  const cmp = template(22, 'Cookiebot CMP', { permissions: { inject_script: ['https://*.cookiebot.com/*'], access_consent: [] }, gallery: ['cybotcorp', 'gtm-templates-cookiebot-cmp'] });
  assert.deepEqual(deps({
    templates: [cmp],
    tags: [
      tag(1, 'CMP', tplType(22), [], { fire: [CONSENT_INIT] }),
      tag(2, 'Gated', 'html', [tpl('html', '<script src="https://snap.licdn.com/x.js"></script>')], { consent: needed('ad_storage') }),
      tag(3, 'Open', 'html', [tpl('html', '<script src="https://snap.licdn.com/x.js"></script>')]),
    ],
  }), ['CMP -> Gated | consent_tool Cookiebot certain']);
});

test('global and cookie edges are possible, also through a variable chain', () => {
  assert.deepEqual(deps({
    tags: [
      tag(1, 'Setter', 'html', [tpl('html', "<script>window.leadScore = 5; document.cookie = 'seg=b2b; path=/'</script>")]),
      tag(2, 'Reads global', 'gaawe', [tpl('eventName', '{{Wrapper}}')]),
      tag(3, 'Reads cookie', 'gaawe', [], { fire: [10] }),
      tag(4, 'Reads dataLayer', 'gaawe', [tpl('eventName', '{{JS dataLayer}}')]),
    ],
    triggers: [trigger(10, 'Seg', 'PAGEVIEW', { filter: [cond('EQUALS', '{{Cookie seg}}', 'b2b')] })],
    variables: [
      variable(1, 'Wrapper', 'jsm', [tpl('javascript', 'function(){return {{JS score}}}')]),
      variable(2, 'JS score', 'j', [tpl('name', 'window.leadScore')]),
      variable(3, 'Cookie seg', 'k', [tpl('name', 'seg')]),
      variable(4, 'JS dataLayer', 'j', [tpl('name', 'dataLayer')]),
    ],
  }), ['Setter -> Reads cookie | cookie seg possible', 'Setter -> Reads global | global leadScore possible']);
});

test('paused tags are neither providers nor dependents', () => {
  assert.deepEqual(deps({
    tags: [tag(1, 'Pusher', 'html', [push('x')], { paused: true }), tag(2, 'L', 'gaawe', [], { fire: [10] })],
    triggers: [customEvent(10, 'CE x', 'x')],
  }), []);
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `node --test tests/foundation/gtm-audit-dependencies.test.mjs`
Expected: FAIL, with "Cannot find module …/dependencies.ts".

- [ ] **Step 3: Create `dependencies.ts`**

```ts
/**
 * dependencies — which tags rely on which, inside this container only. certain = stated in the
 * configuration (tag sequencing, an exact event match, the consent tool for gated tags); possible = a text
 * match (contains/regex event, a global or cookie name). Code on the site or in another container is not seen.
 */
import type { Container, GtmTrigger, ParamValue, TagInfo } from './types.ts';
import { firingTriggers, varsUsedBy } from './refs.ts';
import { MAX_HTML } from './destinations.ts';
import { isActive } from './rules/finding.ts';

export type DepKind = 'sequence' | 'event' | 'consent_tool' | 'global' | 'cookie';
export type Confidence = 'certain' | 'possible';
/** from = the tag that is relied on; to = the tag that relies on it; ids are GTM tag ids. */
export interface Dependency { from: string; to: string; kind: DepKind; via: string; confidence: Confidence }

const PUSH_RE = /dataLayer\.push\(\s*\{[^{}]{0,200}?['"]?\bevent['"]?\s*:\s*['"]([^'"]{1,100})['"]/g;
const GLOBAL_RE = /\bwindow\.([A-Za-z_$][\w$]{0,100})\s*=(?!=)|(?:^|[;{}\s])var\s+([A-Za-z_$][\w$]{0,100})\s*=/g;
const COOKIE_RE = /document\.cookie\s*=\s*['"`]\s*([^=;'"`\s]{1,100})=/g;
const IGNORED_GLOBALS = new Set(['dataLayer']);
const MAX_EVENTS = 500;
// User regexes from the uploaded file: only short patterns without a quantified group and with at most two
// quantifiers are run (event names are ≤100 chars, so the worst case stays polynomial and small). The rest
// are counted as a possible match without running them; regex runs per audit are capped as well.
const MAX_USER_REGEX = 200;
const QUANTIFIED_GROUP = /\)\s*[*+{]/;
const QUANTIFIER = /[*+?]|\{\d/g;
const MAX_REGEX_RUNS = 10_000;

const text = (v: ParamValue | undefined): string => (typeof v === 'string' ? v : '');
const htmlOf = (i: TagInfo): string => text(i.tag.params.html).slice(0, MAX_HTML);

const runnable = (p: string): boolean =>
  p.length <= MAX_USER_REGEX && !QUANTIFIED_GROUP.test(p) && (p.match(QUANTIFIER)?.length ?? 0) <= 2;

/** How a trigger's custom-event condition treats an event name. */
export function eventMatch(t: Pick<GtmTrigger, 'customEvent'>, event: string, budget = { runs: MAX_REGEX_RUNS }): Confidence | null {
  const ce = t.customEvent;
  if (!ce) return null;
  if (ce.match === 'equals') return ce.value === event ? 'certain' : null;
  if (ce.match === 'contains') return event.includes(ce.value) ? 'possible' : null;
  if (ce.match === 'starts_with') return event.startsWith(ce.value) ? 'possible' : null;
  let compiled: RegExp;
  try { compiled = new RegExp(ce.value); } catch { return null; }
  if (!runnable(ce.value) || budget.runs <= 0) return 'possible';
  budget.runs -= 1;
  return compiled.test(event) ? 'possible' : null;
}

const pushTo = <K, V>(m: Map<K, V[]>, k: K, v: V) => { const list = m.get(k) ?? []; if (!list.includes(v)) list.push(v); m.set(k, list); };

export function dependencies(container: Container, infos: TagInfo[]): Dependency[] {
  const active = infos.filter(isActive);
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
    const budget = { runs: MAX_REGEX_RUNS };
    const memo = new Map<string, Confidence | null>();
    for (const b of active) {
      for (const t of firingTriggers(b.tag, container)) {
        if (!t.customEvent) continue;
        for (const [event, providers] of events) {
          const key = `${t.id}|${event}`;
          if (!memo.has(key)) memo.set(key, eventMatch(t, event, budget));
          const conf = memo.get(key);
          if (conf) for (const a of providers) add(a, b, 'event', event, conf);
        }
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
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `node --test tests/foundation/gtm-audit-dependencies.test.mjs`, then `npm run test:foundation`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/gtm-audit/dependencies.ts tests/foundation/gtm-audit-dependencies.test.mjs
git commit -m "feat(gtm-audit): dependency graph inside the container (sequence, event, consent tool, global, cookie)"
```

---

### Task 5: Rule `gtm.dependencies`, remove→review guard, "Relied on by" column

**Files:**
- Create: `supabase/functions/_shared/gtm-audit/rules/dependencies.ts`
- Modify:
  - `supabase/functions/_shared/gtm-audit/migrate.ts`
  - `supabase/functions/_shared/gtm-audit/rules/hygiene.ts` (`dead()`)
  - `supabase/functions/_shared/gtm-audit/rules/index.ts`
  - `supabase/functions/_shared/gtm-audit/types.ts` (`CHECK_KEYS`, `TagRow.reliedOnBy`)
  - `supabase/functions/_shared/gtm-audit/audit.ts`
  - `supabase/functions/_shared/gtm-audit/sheets.ts`
  - `src/lib/gtmAuditXlsx.ts`
  - `src/components/gtm-audit/GtmAuditReport.tsx`
  - `scripts/gtm-audit/fixture.mjs` (sample tag 18)
  - `tests/foundation/gtm-audit-sample.test.mjs`
  - `tests/foundation/gtm-audit-page.test.mjs`
- Regenerate: `src/data/gtmAuditSample.ts`
- Test: `tests/foundation/gtm-audit-dependencies.test.mjs` (append)

**Interfaces:**
- Consumes (Task 4): `dependencies(container, infos)`, `Dependency`, `Confidence`
- Produces:
  - `reliedOn(container: Container, infos: TagInfo[]): Finding`
  - `TagRow.reliedOnBy: { name: string; confidence: 'certain' | 'possible' }[]`
  - `MigrateContext.reliedOnBy: Map<string, TagInfo[]>`. It maps a tag id to the tags that rely on it with certainty.
  - `CHECK_KEYS` gains `'gtm.dependencies'` right after `'gtm.multiple_destinations'`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/foundation/gtm-audit-dependencies.test.mjs`:

```js
import { runRules } from '../../supabase/functions/_shared/gtm-audit/rules/index.ts';
import { migrate, migrationContext } from '../../supabase/functions/_shared/gtm-audit/migrate.ts';
import { audit } from '../../supabase/functions/_shared/gtm-audit/audit.ts';

const ruleOf = (spec, key) => {
  const c = parse(exportOf(spec));
  return runRules(c, tagInfos(c)).find((f) => f.checkKey === key);
};
const classesOf = (spec) => {
  const c = parse(exportOf(spec));
  const infos = tagInfos(c);
  const ctx = migrationContext(c, infos);
  return Object.fromEntries(infos.map((i) => [i.tag.name, migrate(i, ctx)]));
};

test('gtm.dependencies: one line per relied-on tag, certain and possible', () => {
  const f = ruleOf({
    tags: [
      tag(1, 'Form success push', 'html', [push('form_ok')]),
      tag(2, 'Lead conversion', 'awct', [tpl('conversionId', '111111111')], { fire: [10] }),
      tag(3, 'Lead GA4', 'gaawe', [tpl('eventName', 'generate_lead')], { fire: [11] }),
    ],
    triggers: [customEvent(10, 'CE form_ok', 'form_ok'), trigger(11, 'CE form*', 'CUSTOM_EVENT', { custom: [cond('STARTS_WITH', '{{_event}}', 'form')] })],
  }, 'gtm.dependencies');
  assert.equal(f.status, 'manual');
  assert.equal(f.priority, 'medium');
  assert.equal(f.typicalOwner, 'gtm');
  assert.equal(f.title, '1 tag that other tags rely on');
  assert.deepEqual(f.evidence.details.slice(1), [
    "Form success push (Custom HTML) → Lead conversion (Google Ads) — event 'form_ok' (certain)",
    "Form success push (Custom HTML) → Lead GA4 (Google Analytics 4) — event 'form_ok' (possible)",
  ]);
  assert.equal(f.explanation, 'Removing or changing these tags also stops the tags that rely on them. Only dependencies inside this container are shown.');
  assert.equal(f.fix, 'Remove a tag together with the tags that rely on it, or move what it provides (the event, value or cookie) to the site before removing it.');
});

test('gtm.dependencies passes with no edges', () => {
  const f = ruleOf({ tags: [tag(1, 'Inline', 'html', [tpl('html', '<p>')])] }, 'gtm.dependencies');
  assert.equal(f.status, 'pass');
  assert.equal(f.title, 'No tag relies on another tag');
});

test('guard: a remove tag with a certain dependent becomes review; UA and possible-only stay remove', () => {
  const cls = classesOf({
    tags: [
      tag(1, 'Prep', 'html', [tpl('html', '<script>1</script>')], { fire: [] }),
      tag(2, 'Main', 'gaawe', [tpl('eventName', 'x')], { setup: ['Prep', 'Old UA'] }),
      tag(3, 'Old UA', 'ua', [tpl('trackingId', 'UA-1-1')], { fire: [] }),
      tag(4, 'Lonely', 'html', [tpl('html', '<script>1</script>')], { fire: [] }),
      tag(5, 'Paused pusher', 'html', [push('p')], { paused: true }),
    ],
  });
  assert.deepEqual(cls.Prep, { migration: 'review', reason: 'Other tags rely on it: Main. Remove together or rewire first.' });
  assert.equal(cls['Old UA'].migration, 'remove');
  assert.equal(cls.Lonely.migration, 'remove');
  assert.equal(cls['Paused pusher'].migration, 'remove');
});

test('guard: dependents that are themselves remove do not keep a tag', () => {
  const cls = classesOf({
    tags: [
      tag(1, 'Prep', 'html', [tpl('html', '<script>1</script>')], { fire: [] }),
      tag(2, 'Main', 'html', [tpl('html', '<script>2</script>')], { setup: ['Prep'], fire: [] }),
    ],
  });
  assert.equal(cls.Prep.migration, 'remove');
});

test('dead(): a setup tag without its own trigger is not reported as trigger-less', () => {
  const f = ruleOf({ tags: [tag(1, 'Prep', 'html', [], { fire: [] }), tag(2, 'Main', 'gaawe', [], { setup: ['Prep'] }), tag(3, 'Lonely', 'html', [], { fire: [] })] }, 'gtm.dead');
  assert.deepEqual(f.evidence.details.slice(1), ['Tag without a firing trigger: Lonely']);
});

test('TagRow.reliedOnBy: names with confidence, certain wins', () => {
  const r = audit(exportOf({
    tags: [
      tag(1, 'Pusher', 'html', [push('form_ok')]),
      tag(2, 'Exact', 'gaawe', [], { fire: [10] }),
      tag(3, 'Loose', 'gaawe', [], { fire: [11] }),
    ],
    triggers: [customEvent(10, 'CE', 'form_ok'), trigger(11, 'CE c', 'CUSTOM_EVENT', { custom: [cond('CONTAINS', '{{_event}}', 'form')] })],
  }));
  assert.deepEqual(r.tags[0].reliedOnBy, [{ name: 'Exact', confidence: 'certain' }, { name: 'Loose', confidence: 'possible' }]);
  assert.deepEqual(r.tags[1].reliedOnBy, []);
});
```

In `tests/foundation/gtm-audit-page.test.mjs`, add:

```js
test('the tag table shows Sends to, Relied on by and the dependency note', () => {
  const src = readFileSync(new URL('../../src/components/gtm-audit/GtmAuditReport.tsx', import.meta.url), 'utf8');
  for (const s of ['Sends to', 'Relied on by', 'Only dependencies inside this container are shown. Code on the site or in another container can also rely on a tag.']) {
    assert.ok(src.includes(s), s);
  }
});
```

`readFileSync`, `test` and `assert` are already imported in that file. Check its first lines.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `node --test tests/foundation/gtm-audit-dependencies.test.mjs tests/foundation/gtm-audit-page.test.mjs`
Expected: FAIL. There is no `gtm.dependencies` finding, and the guard is missing.

- [ ] **Step 3: Rule**

Create `rules/dependencies.ts`:

```ts
import type { Finding } from '../../tracking-check/types.ts';
import type { Container, TagInfo } from '../types.ts';
import { dependencies, type Dependency } from '../dependencies.ts';
import { finding, plural, tagLabel } from './finding.ts';

const MAX_NAMES = 20;
const KIND_ORDER = ['sequence', 'event', 'consent_tool', 'global', 'cookie'];

function how(d: Dependency): string {
  if (d.kind === 'sequence') return d.via === 'setup' ? 'runs first as setup tag' : 'runs after as cleanup tag';
  if (d.kind === 'event') return `event '${d.via}'`;
  if (d.kind === 'consent_tool') return `consent tool ${d.via}`;
  if (d.kind === 'global') return `global '${d.via}'`;
  return `cookie '${d.via}'`;
}

export function reliedOn(container: Container, infos: TagInfo[]): Finding {
  const deps = dependencies(container, infos);
  if (!deps.length) {
    return finding('gtm.dependencies', 'No tag relies on another tag', 'pass', 'medium', 'gtm',
      'No tag in this container provides an event, value, cookie or sequence step that another tag uses.', '', []);
  }
  const byId = new Map(infos.map((i) => [i.tag.id, i]));
  const order = new Map(infos.map((i, n) => [i.tag.id, n]));
  const groups = new Map<string, { from: TagInfo; d: Dependency; to: TagInfo[] }>();
  for (const d of deps) {
    const key = `${d.from}|${d.kind}|${d.via}|${d.confidence}`;
    const g = groups.get(key) ?? { from: byId.get(d.from) as TagInfo, d, to: [] };
    g.to.push(byId.get(d.to) as TagInfo);
    groups.set(key, g);
  }
  const lines = [...groups.values()]
    .sort((a, b) => (order.get(a.from.tag.id) ?? 0) - (order.get(b.from.tag.id) ?? 0)
      || KIND_ORDER.indexOf(a.d.kind) - KIND_ORDER.indexOf(b.d.kind)
      || (a.d.confidence === b.d.confidence ? 0 : a.d.confidence === 'certain' ? -1 : 1))
    .map((g) => {
      const to = g.to.sort((a, b) => (order.get(a.tag.id) ?? 0) - (order.get(b.tag.id) ?? 0));
      const names = to.slice(0, MAX_NAMES).map(tagLabel).join(', ') + (to.length > MAX_NAMES ? ` and ${to.length - MAX_NAMES} more` : '');
      return `${tagLabel(g.from)} → ${names} — ${how(g.d)} (${g.d.confidence})`;
    });
  const providers = new Set(deps.map((d) => d.from)).size;
  return finding('gtm.dependencies', `${plural(providers, 'tag')} that other tags rely on`, 'manual', 'medium', 'gtm',
    'Removing or changing these tags also stops the tags that rely on them. Only dependencies inside this container are shown.',
    'Remove a tag together with the tags that rely on it, or move what it provides (the event, value or cookie) to the site before removing it.',
    lines);
}
```

In `types.ts`, set `CHECK_KEYS` to:

```ts
export const CHECK_KEYS = [
  'gtm.consent_missing', 'gtm.consent_inferred', 'gtm.identifies_visitors', 'gtm.consent_mode_default',
  'gtm.multiple_destinations', 'gtm.dependencies',
  'gtm.unknown_custom_html', 'gtm.community_template_injects', 'gtm.duplicate', 'gtm.dead', 'gtm.stale',
] as const;
```

Add the following to `TagRow`, after `migrationReason`:

```ts
  /** Tags that rely on this one (inside the container), with how sure the audit is. */
  reliedOnBy: { name: string; confidence: 'certain' | 'possible' }[];
```

In `rules/index.ts`, import `reliedOn` from `./dependencies.ts`. Add `reliedOn(container, infos),` after `multipleDestinations(container, infos),`.

- [ ] **Step 4: Guard in `migrate.ts`**

- Change the import `import { duplicateGroups } from './rules/index.ts';` to `import { duplicateGroups } from './rules/hygiene.ts';`.
- Add `import { dependencies } from './dependencies.ts';`.
- Extend the context:

```ts
export interface MigrateContext {
  container: Container;
  /** Tag id → name of the tag it duplicates (every member of a duplicate group except the first). */
  duplicateOf: Map<string, string>;
  /** Tag id → tags that certainly rely on it (sequence, exact event, consent tool). */
  reliedOnBy: Map<string, TagInfo[]>;
}

export function migrationContext(container: Container, infos: TagInfo[]): MigrateContext {
  const duplicateOf = new Map<string, string>();
  for (const group of duplicateGroups(infos)) {
    for (const i of group.slice(1)) if (!duplicateOf.has(i.tag.id)) duplicateOf.set(i.tag.id, group[0].tag.name);
  }
  const byId = new Map(infos.map((i) => [i.tag.id, i]));
  const reliedOnBy = new Map<string, TagInfo[]>();
  for (const d of dependencies(container, infos)) {
    const to = byId.get(d.to);
    if (d.confidence !== 'certain' || !to) continue;
    const list = reliedOnBy.get(d.from) ?? [];
    if (!list.includes(to)) list.push(to);
    reliedOnBy.set(d.from, list);
  }
  return { container, duplicateOf, reliedOnBy };
}
```

Rename the current `export function migrate(info, ctx): Result { … }` to `function classify(info: TagInfo, ctx: MigrateContext): Result { … }` and leave its body unchanged. Then add:

```ts
/** classify(), plus the guard: a removal candidate that other tags certainly rely on becomes review (UA excepted). */
export function migrate(info: TagInfo, ctx: MigrateContext): Result {
  const base = classify(info, ctx);
  if (base.migration !== 'remove' || info.tag.type === 'ua') return base;
  const keep = (ctx.reliedOnBy.get(info.tag.id) ?? []).filter((d) => classify(d, ctx).migration !== 'remove');
  if (!keep.length) return base;
  return out('review', `Other tags rely on it: ${keep.map((d) => d.tag.name || 'Unnamed tag').join(', ')}. Remove together or rewire first.`);
}
```

- [ ] **Step 5: `dead()` skips setup/teardown tags**

In `rules/hygiene.ts` `dead()`, replace the trigger-less line with:

```ts
  const sequenced = new Set(container.tags.filter((t) => !t.paused).flatMap((t) => [...t.setupTagNames, ...t.teardownTagNames]));
  for (const i of infos) if (!i.tag.paused && !i.tag.firingTriggerIds.length && !sequenced.has(i.tag.name)) details.push(`Tag without a firing trigger: ${i.tag.name}`);
```

- [ ] **Step 6: Rows, spreadsheet, xlsx, UI**

In `audit.ts`, add `import { dependencies } from './dependencies.ts';`. In `rows()`, after `const ctx = …`:

```ts
  const nameOf = new Map(infos.map((i) => [i.tag.id, i.tag.name || 'Unnamed tag']));
  const relied = new Map<string, Map<string, 'certain' | 'possible'>>();
  for (const d of dependencies(container, infos)) {
    const m = relied.get(d.from) ?? new Map<string, 'certain' | 'possible'>();
    if (m.get(d.to) !== 'certain') m.set(d.to, d.confidence);
    relied.set(d.from, m);
  }
```

In the row object, add the following after `migrationReason: reason,`:

```ts
      reliedOnBy: [...(relied.get(i.tag.id) ?? new Map())].map(([id, confidence]) => ({ name: nameOf.get(id) as string, confidence })),
```

In `sheets.ts`:

```ts
export const TAG_COLUMNS = ['Tag', 'Type', 'Vendor', 'Sends to', 'Triggers', 'Consent', 'Consent evidence', 'Plan', 'Why', 'Relied on by', 'Folder', 'Last changed', 'Paused'];
```

In `toTagRows`, add the following after `t.migrationReason,`:

```ts
    t.reliedOnBy.map((d) => (d.confidence === 'certain' ? d.name : `${d.name} (possible)`)).join('\n'),
```

In `gtmAuditXlsx.ts`, add `'Relied on by': 36,` to `TAG_WIDTHS` after `Why: 60,`.

In `GtmAuditReport.tsx`:
- Change `min-w-[860px]` to `min-w-[960px]`.
- Add this paragraph right above `<div className="overflow-x-auto rounded-lg border">`:

```tsx
        <p className="text-xs text-muted-foreground">Only dependencies inside this container are shown. Code on the site or in another container can also rely on a tag.</p>
```

- Add `<th className="p-2">Relied on by</th>` after the Plan header.
- Add this cell after the Plan cell:

```tsx
                  <td className="p-2 align-top text-xs">{reliedLabel(t.reliedOnBy)}</td>
```

Add this helper above the component, next to the other module-level helpers:

```tsx
function reliedLabel(deps: TagRow["reliedOnBy"]) {
  if (!deps.length) return "—";
  const certain = deps.filter((d) => d.confidence === "certain").length;
  const text = certain === deps.length ? `${deps.length} certain` : certain ? `${deps.length} (${certain} certain)` : `${deps.length} possible`;
  return <span title={deps.map((d) => d.name).join(", ")}>{text}</span>;
}
```

If `TagRow` is not imported in this file yet, add `import type { TagRow } from "../../../supabase/functions/_shared/gtm-audit/types";`. Match the path style of the file's existing engine imports.

- [ ] **Step 7: Sample tag 18 and regenerating the sample**

In `sampleExport()`, append:

```js
      tag(18, 'Google Ads - lead conversion', 'awct', [tpl('conversionId', '000000000'), tpl('conversionLabel', 'SAMPLElead')], { fire: [15], folder: 40 }),
```

Run: `node scripts/gtm-audit/sample-report.mjs`

In `gtm-audit-sample.test.mjs`:
- Add `'gtm.dependencies': 'manual',` after `'gtm.multiple_destinations': 'manual',`.
- Set the tag count to 18.
- Set the headline to `'3 of 18 tags have no consent condition · 1 identifies visitors · 3 removal candidates'`.
- Add this test:

```js
test('the sample shows the HubSpot listener feeding the lead conversions', () => {
  const f = buildSample().findings.find((x) => x.checkKey === 'gtm.dependencies');
  assert.ok(f.evidence.details.some((d) => d.startsWith('HubSpot form listener (') && d.includes('Google Ads - lead conversion (Google Ads)') && d.endsWith("— event 'generate_lead' (certain)")), f.evidence.details.join('\n'));
});
```

- [ ] **Step 8: Run the tests and confirm they pass**

Run: `npm run test:foundation`
Expected: PASS. If the migrate test or the sample class counts change, read the reason first. The only intended class change is remove→review for tags that others certainly rely on. Nothing in the sample is affected, because tag 13 is `covered`, not `remove`.

- [ ] **Step 9: Commit**

```bash
git add -A supabase/functions/_shared/gtm-audit src/lib/gtmAuditXlsx.ts src/components/gtm-audit/GtmAuditReport.tsx scripts/gtm-audit/fixture.mjs src/data/gtmAuditSample.ts tests/foundation
git commit -m "feat(gtm-audit): gtm.dependencies, remove-to-review guard and the Relied on by column"
```

---

### Task 6: Fragile DOM triggers and variables

**Files:**
- Create: `supabase/functions/_shared/gtm-audit/fragile.ts`
- Create: `supabase/functions/_shared/gtm-audit/rules/fragile.ts`
- Modify:
  - `supabase/functions/_shared/gtm-audit/types.ts` (`CHECK_KEYS`)
  - `supabase/functions/_shared/gtm-audit/rules/index.ts`
  - `scripts/gtm-audit/fixture.mjs` (sample trigger 16, tag 19)
  - `tests/foundation/gtm-audit-sample.test.mjs`
- Regenerate: `src/data/gtmAuditSample.ts`
- Test: `tests/foundation/gtm-audit-fragile.test.mjs`

**Interfaces:**
- Consumes:
  - Task 1: `firingTriggers`, `varsUsedBy`
  - Task 5: `migrate`, `migrationContext`
  - `isActive`, `tagLabel`, `plural`, `finding`
- Produces:
  - `interface FragileUse { tag: TagInfo; source: string }`
  - `fragileUses(container: Container, infos: TagInfo[]): FragileUse[]`
  - `fragileDom(container: Container, infos: TagInfo[]): Finding`
  - `CHECK_KEYS` gains `'gtm.fragile_dom'` right after `'gtm.duplicate'`.

- [ ] **Step 1: Write the failing tests**

Create `tests/foundation/gtm-audit-fragile.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../../supabase/functions/_shared/gtm-audit/parse.ts';
import { tagInfos } from '../../supabase/functions/_shared/gtm-audit/info.ts';
import { fragileUses } from '../../supabase/functions/_shared/gtm-audit/fragile.ts';
import { runRules } from '../../supabase/functions/_shared/gtm-audit/rules/index.ts';
import { tag, tpl, cond, trigger, triggerGroup, variable, exportOf } from '../../scripts/gtm-audit/fixture.mjs';

const uses = (spec) => {
  const c = parse(exportOf(spec));
  return fragileUses(c, tagInfos(c)).map((u) => `${u.tag.tag.name}: ${u.source}`).sort();
};
const ruleOf = (spec) => {
  const c = parse(exportOf(spec));
  return runRules(c, tagInfos(c)).find((f) => f.checkKey === 'gtm.fragile_dom');
};

test('each fragile source type', () => {
  assert.deepEqual(uses({
    tags: [
      tag(1, 'Css', 'gaawe', [tpl('eventName', 'a')], { fire: [10] }),
      tag(2, 'ClickText', 'gaawe', [tpl('eventName', 'b')], { fire: [11] }),
      tag(3, 'FormId', 'gaawe', [tpl('eventName', 'c')], { fire: [12] }),
      tag(4, 'Visible', 'gaawe', [tpl('eventName', 'd')], { fire: [13] }),
      tag(5, 'DomVar', 'gaawe', [tpl('eventName', '{{Price el}}')]),
      tag(6, 'JsVar', 'gaawe', [tpl('eventName', '{{Read title}}')]),
      tag(7, 'SafeJs', 'gaawe', [tpl('eventName', '{{Safe js}}')]),
      tag(8, 'PagePath', 'gaawe', [tpl('eventName', 'e')], { fire: [14] }),
    ],
    triggers: [
      trigger(10, 'CTA click', 'CLICK', { filter: [cond('CSS_SELECTOR', '{{Click Element}}', '.btn-primary')] }),
      trigger(11, 'Buy text', 'LINK_CLICK', { filter: [cond('EQUALS', '{{Click Text}}', 'Buy now')] }),
      trigger(12, 'Form id', 'FORM_SUBMISSION', { filter: [cond('EQUALS', '{{Form ID}}', 'contact')] }),
      trigger(13, 'Hero seen', 'ELEMENT_VISIBILITY', { params: [tpl('selectorType', 'CSS'), tpl('elementSelector', '#hero')] }),
      trigger(14, 'Path', 'PAGEVIEW', { filter: [cond('EQUALS', '{{Page Path}}', '/x')] }),
    ],
    variables: [
      variable(1, 'Price el', 'd', [tpl('elementId', 'price')]),
      variable(2, 'Read title', 'jsm', [tpl('javascript', 'function(){return document.querySelector("h1").innerText}')]),
      variable(3, 'Safe js', 'jsm', [tpl('javascript', 'function(){return 1}')]),
    ],
  }), [
    'ClickText: link click trigger "Buy text" checks Click Text "Buy now"',
    'Css: click trigger "CTA click" matches CSS selector ".btn-primary"',
    'DomVar: DOM element variable "{{Price el}}"',
    'FormId: form trigger "Form id" checks Form ID "contact"',
    'JsVar: Custom JavaScript variable "{{Read title}}" reads the page',
    'Visible: element visibility trigger "Hero seen" watches "#hero"',
  ]);
});

test('a tag reached through a trigger group, and a DOM variable through a chain', () => {
  assert.deepEqual(uses({
    tags: [tag(1, 'Grouped', 'gaawe', [], { fire: [20] }), tag(2, 'Chained', 'gaawe', [tpl('eventName', '{{Outer}}')]), tag(3, 'Paused', 'gaawe', [], { fire: [10], paused: true })],
    triggers: [trigger(10, 'CTA', 'CLICK', { filter: [cond('CSS_SELECTOR', '{{Click Element}}', '.cta')] }), triggerGroup(20, 'Group', [10])],
    variables: [variable(1, 'Outer', 'jsm', [tpl('javascript', 'function(){return {{Inner}}}')]), variable(2, 'Inner', 'd', [tpl('elementId', 'x')])],
  }), ['Chained: DOM element variable "{{Inner}}"', 'Grouped: click trigger "CTA" matches CSS selector ".cta"']);
});

test('gtm.fragile_dom: medium on a conversion, low otherwise; pass when none', () => {
  const triggers = [trigger(10, 'CTA', 'CLICK', { filter: [cond('CSS_SELECTOR', '{{Click Element}}', '.cta')] })];
  const conv = ruleOf({ tags: [tag(1, 'Lead conversion', 'awct', [tpl('conversionId', '111111111')], { fire: [10] })], triggers });
  assert.equal(conv.status, 'manual');
  assert.equal(conv.priority, 'medium');
  assert.equal(conv.typicalOwner, 'developer');
  assert.equal(conv.title, '1 tag relies on page markup');
  assert.deepEqual(conv.evidence.details.slice(1), ['Lead conversion (Google Ads): click trigger "CTA" matches CSS selector ".cta"']);
  assert.equal(conv.explanation, 'These tags fire on page markup (a CSS class, element ID or button text). A redesign or a text change can stop them without any error, and the tag silently stops counting.');
  assert.equal(conv.fix, "Have the site push a named event when the action happens (for example `dataLayer.push({event: 'generate_lead'})`) and trigger on that event instead.");
  const ga = ruleOf({ tags: [tag(1, 'Click event', 'gaawe', [tpl('eventName', 'cta')], { fire: [10] })], triggers });
  assert.equal(ga.priority, 'low');
  const none = ruleOf({ tags: [tag(1, 'Inline', 'html', [tpl('html', '<p>')])] });
  assert.equal(none.status, 'pass');
  assert.equal(none.title, 'No tag relies on page markup');
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `node --test tests/foundation/gtm-audit-fragile.test.mjs`
Expected: FAIL, with "Cannot find module …/fragile.ts".

- [ ] **Step 3: Create `fragile.ts`**

```ts
/**
 * fragile — tags that depend on page markup instead of a named event: CSS-selector and Click/Form
 * class/ID/text conditions, Element Visibility selectors, DOM Element variables and Custom JavaScript
 * variables that read the page. Reached through firing triggers (groups included) and variable chains.
 */
import type { Container, GtmTrigger, GtmVariable, ParamValue, TagInfo } from './types.ts';
import { firingTriggers, varsUsedBy } from './refs.ts';
import { isActive } from './rules/finding.ts';

export interface FragileUse { tag: TagInfo; source: string }

const DOM_ARGS = new Set(['{{Click Classes}}', '{{Click ID}}', '{{Click Text}}', '{{Form Classes}}', '{{Form ID}}', '{{Form Text}}']);
const READS_PAGE = /querySelector|getElementById|getElementsBy|innerText|textContent|\$\(|jQuery\(/;
const KIND: Record<string, string> = { CLICK: 'click trigger', LINK_CLICK: 'link click trigger', FORM_SUBMISSION: 'form trigger', ELEMENT_VISIBILITY: 'element visibility trigger' };
const MAX_JS = 200_000;
const MAX_SHOWN = 100;

const text = (v: ParamValue | undefined): string => (typeof v === 'string' ? v : '');
const shown = (s: string): string => (s.length > MAX_SHOWN ? `${s.slice(0, MAX_SHOWN)}…` : s);

function triggerSources(t: GtmTrigger): string[] {
  const label = `${Object.prototype.hasOwnProperty.call(KIND, t.type) ? KIND[t.type] : 'trigger'} "${t.name}"`;
  const out: string[] = [];
  for (const c of t.conditions) {
    if (c.type === 'CSS_SELECTOR') out.push(`${label} matches CSS selector "${shown(c.arg1)}"`);
    else if (DOM_ARGS.has(c.arg0)) out.push(`${label} checks ${c.arg0.slice(2, -2)} "${shown(c.arg1)}"`);
  }
  if (t.type === 'ELEMENT_VISIBILITY') {
    const sel = text(t.params.elementSelector) || text(t.params.elementId);
    if (sel) out.push(`${label} watches "${shown(sel)}"`);
  }
  return out;
}

function variableSource(v: GtmVariable): string | null {
  if (v.type === 'd') return `DOM element variable "{{${v.name}}}"`;
  if (v.type === 'jsm' && READS_PAGE.test(text(v.params.javascript).slice(0, MAX_JS))) return `Custom JavaScript variable "{{${v.name}}}" reads the page`;
  return null;
}

export function fragileUses(container: Container, infos: TagInfo[]): FragileUse[] {
  const out: FragileUse[] = [];
  for (const i of infos) {
    if (!isActive(i)) continue;
    const sources = new Set<string>();
    for (const t of firingTriggers(i.tag, container)) for (const s of triggerSources(t)) sources.add(s);
    for (const v of varsUsedBy(i.tag, container)) { const s = variableSource(v); if (s) sources.add(s); }
    for (const source of sources) out.push({ tag: i, source });
  }
  return out;
}
```

- [ ] **Step 4: Rule and registration**

Create `rules/fragile.ts`:

```ts
import type { Finding } from '../../tracking-check/types.ts';
import type { Container, TagInfo } from '../types.ts';
import { fragileUses } from '../fragile.ts';
import { migrate, migrationContext } from '../migrate.ts';
import { finding, plural, tagLabel } from './finding.ts';

export function fragileDom(container: Container, infos: TagInfo[]): Finding {
  const uses = fragileUses(container, infos);
  if (!uses.length) {
    return finding('gtm.fragile_dom', 'No tag relies on page markup', 'pass', 'low', 'developer',
      'No active tag uses a CSS selector, element ID, page text or a variable that reads the page.', '', []);
  }
  const tags = [...new Set(uses.map((u) => u.tag))];
  const ctx = migrationContext(container, infos);
  const important = tags.some((i) => { const m = migrate(i, ctx).migration; return m === 'conversion' || m === 'pixel'; });
  return finding('gtm.fragile_dom', `${plural(tags.length, 'tag')} ${tags.length === 1 ? 'relies' : 'rely'} on page markup`, 'manual', important ? 'medium' : 'low', 'developer',
    'These tags fire on page markup (a CSS class, element ID or button text). A redesign or a text change can stop them without any error, and the tag silently stops counting.',
    "Have the site push a named event when the action happens (for example `dataLayer.push({event: 'generate_lead'})`) and trigger on that event instead.",
    uses.map((u) => `${tagLabel(u.tag)}: ${u.source}`));
}
```

In `types.ts`, set the final `CHECK_KEYS`:

```ts
export const CHECK_KEYS = [
  'gtm.consent_missing', 'gtm.consent_inferred', 'gtm.identifies_visitors', 'gtm.consent_mode_default',
  'gtm.multiple_destinations', 'gtm.dependencies',
  'gtm.unknown_custom_html', 'gtm.community_template_injects', 'gtm.duplicate', 'gtm.fragile_dom', 'gtm.dead', 'gtm.stale',
] as const;
```

In `rules/index.ts`, import `fragileDom` from `./fragile.ts`. Add `fragileDom(container, infos),` after `duplicate(infos),`. The full list now reads:
1. consentMissing
2. consentInferred
3. identifiesVisitors
4. consentModeDefault
5. multipleDestinations
6. reliedOn
7. unknownCustomHtml
8. communityTemplateInjects
9. duplicate
10. fragileDom
11. dead
12. stale

- [ ] **Step 5: Sample trigger 16 and tag 19; regenerating the sample**

In `sampleExport()`, append the following to `triggers`:

```js
      trigger(16, 'Click - Book demo button', 'CLICK', { filter: [cond('CSS_SELECTOR', '{{Click Element}}', '.btn-demo')] }),
```

Append the following to `tags`:

```js
      tag(19, 'Google Ads - demo click', 'awct', [tpl('conversionId', '000000000'), tpl('conversionLabel', 'SAMPLEdemo')], { fire: [16], folder: 40 }),
```

Run: `node scripts/gtm-audit/sample-report.mjs`

In `gtm-audit-sample.test.mjs`, set `byKey` to the full expected map:

```js
  assert.deepEqual(byKey, {
    'gtm.consent_missing': 'fail',
    'gtm.consent_inferred': 'manual',
    'gtm.identifies_visitors': 'fail',
    'gtm.consent_mode_default': 'pass',
    'gtm.multiple_destinations': 'manual',
    'gtm.dependencies': 'manual',
    'gtm.unknown_custom_html': 'manual',
    'gtm.community_template_injects': 'manual',
    'gtm.duplicate': 'warning',
    'gtm.fragile_dom': 'manual',
    'gtm.dead': 'warning',
    'gtm.stale': 'manual',
  });
```

Also in that test:
- Set the tag count to 19.
- Set the headline to `'3 of 19 tags have no consent condition · 1 identifies visitors · 3 removal candidates'`. This was verified against the current engine with tags 17–19 and trigger 16 added.
- Add this test:

```js
test('the sample shows the CSS-selector conversion as medium', () => {
  const f = buildSample().findings.find((x) => x.checkKey === 'gtm.fragile_dom');
  assert.equal(f.priority, 'medium');
  assert.deepEqual(f.evidence.details.slice(1), ['Google Ads - demo click (Google Ads): click trigger "Click - Book demo button" matches CSS selector ".btn-demo"']);
});
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npm run test:foundation`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A supabase/functions/_shared/gtm-audit scripts/gtm-audit/fixture.mjs src/data/gtmAuditSample.ts tests/foundation
git commit -m "feat(gtm-audit): gtm.fragile_dom for markup-based triggers and variables"
```

---

### Task 7: Engine version, stats, page copy, docs, full verification

**Files:**
- Modify:
  - `supabase/functions/_shared/gtm-audit/audit.ts:14`
  - `tests/foundation/gtm-audit-audit.test.mjs:19`
  - `tests/foundation/gtm-audit-stats.test.mjs`
  - `src/pages/GtmAudit.tsx` (lead and "cannot see")
  - `CLAUDE.md` (GTM container audit section)
- Regenerate: `src/data/gtmAuditSample.ts`, if the version appears in it. The freshness test tells you.

**Interfaces:**
- Consumes: everything above.
- Produces: `ENGINE_VERSION = 2`.

- [ ] **Step 1: Write the failing tests**

In `gtm-audit-audit.test.mjs:19`, replace the test with:

```js
test('engine version is 2', () => assert.equal(ENGINE_VERSION, 2));
```

In `gtm-audit-stats.test.mjs`, change `assert.equal(s.v, 1);` to `assert.equal(s.v, 2);`. Then append:

```js
import { parse } from '../../supabase/functions/_shared/gtm-audit/parse.ts';
import { cond, trigger, customEvent } from '../../scripts/gtm-audit/fixture.mjs';

test('the three new checks are counted, and nothing else from them reaches stats', () => {
  const metaTpl = template(20, 'Meta Pixel', { permissions: { inject_script: ['https://connect.facebook.net/*'] }, gallery: ['facebookarchive', 'GoogleTagManager-WebTemplate-For-FacebookPixel'] });
  const s = buildStats(audit(exportOf({
    templates: [metaTpl],
    tags: [
      tag(1, 'Meta one', tplType(20), [tpl('pixelId', '1234567890')]),
      tag(2, 'Meta two', tplType(20), [tpl('pixelId', '9876543210')]),
      tag(3, 'Secret pusher', 'html', [tpl('html', "<script>dataLayer.push({event:'secret_event'})</script>")]),
      tag(4, 'Lead', 'awct', [tpl('conversionId', '111111111')], { fire: [10] }),
      tag(5, 'Demo', 'awct', [tpl('conversionId', '111111111')], { fire: [11] }),
    ],
    triggers: [customEvent(10, 'CE', 'secret_event'), trigger(11, 'Secret button', 'CLICK', { filter: [cond('CSS_SELECTOR', '{{Click Element}}', '.secret-btn')] })],
  })));
  assert.equal(s.checks['gtm.multiple_destinations'], 1);
  assert.equal(s.checks['gtm.dependencies'], 1);
  assert.equal(s.checks['gtm.fragile_dom'], 1);
  const json = JSON.stringify(s);
  for (const secret of ['1234567890', '9876543210', 'AW-111111111', 'secret_event', 'secret-btn', 'Secret']) assert.equal(json.includes(secret), false, secret);
  assert.deepEqual(validateStats(JSON.parse(json)), s);
  assert.equal(validateStats({ ...s, checks: { ...s.checks, 'gtm.fragile_dom': 'many' } }), null);
  assert.equal(validateStats({ ...s, checks: { 'gtm.unknown_key': 1 } }), null);
});
```

`parse` is unused in this snippet, so do not add that import if lint complains. `template`, `tplType`, `tag`, `tpl` and `exportOf` are already imported at the top of the file. Add `cond`, `trigger` and `customEvent` to that existing fixture import instead of a second import line.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `node --test tests/foundation/gtm-audit-audit.test.mjs tests/foundation/gtm-audit-stats.test.mjs`
Expected: FAIL on the version assertions.

- [ ] **Step 3: Bump the version**

In `audit.ts:14`, set `export const ENGINE_VERSION = 2;`. Then run `node scripts/gtm-audit/sample-report.mjs`, which is harmless if nothing changes.

- [ ] **Step 4: Page copy**

In `src/pages/GtmAudit.tsx`, replace the lead paragraph text with:

```tsx
          See which tags have no consent condition, which tools identify visitors, which vendors send data to more than
          one account, which tags other tags rely on, which ones depend on page markup, what is duplicated, paused or
          years old — and which tags CortIQ already covers if you want to measure without Google Tag Manager.
```

In the "What the audit can and cannot see" paragraph, insert this sentence after the first sentence ("It reads the container configuration."):

```tsx
            It cannot tell who owns an account ID, and it does not see code on the site or in another container that
            relies on a tag.
```

The copy rules apply: configuration only, never "fires", and none of the banned phrases.

- [ ] **Step 5: CLAUDE.md**

In `CLAUDE.md`, under `## GTM container audit (added 2026-11-17)`, add these bullets after the "Engine:" bullet:

```markdown
- Engine v2 (2026-11-20, spec `2026-11-20-gtm-audit-destinations-dependencies-design.md`): `destinations.ts`
  (IDs per tag → `gtm.multiple_destinations`, "Sends to"), `dependencies.ts` (sequence/event/consent tool certain;
  global/cookie/regex possible → `gtm.dependencies`, "Relied on by", and a certain dependent turns `remove` into
  `review` except UA), `fragile.ts` (`gtm.fragile_dom`). Shared refs in `refs.ts` (variable chains ≤5 levels).
  User regexes from the file run only when short and simple; the rest count as `possible`.
- Destination IDs are shown in full on the page and in the local export, never in stats.
  **Deploy order:** redeploy `gtm-audit-stats` before the dist FTP, or v2 stats (new keys, `v: 2`) are rejected.
```

- [ ] **Step 6: Full verification**

Run, in order:
1. `npm run test:foundation`. Expected: all pass.
2. `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "error TS"`. Expected: the same count as on `main` before this branch (58). Check the baseline first with `git stash` or from a clean checkout of `main` if the count differs. No new errors may come from `gtm-audit/` or `src/components/gtm-audit/`.
3. `npx vite build`. Expected: build succeeds.

If `tsconfig.app.json` does not exist, use the tsconfig that `npm run build` or the repo's `typecheck` script uses (see `package.json`).

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/gtm-audit/audit.ts src/data/gtmAuditSample.ts src/pages/GtmAudit.tsx CLAUDE.md tests/foundation/gtm-audit-audit.test.mjs tests/foundation/gtm-audit-stats.test.mjs
git commit -m "feat(gtm-audit): engine v2 — stats test for new keys, page copy, CLAUDE.md"
```

---

## Deploy notes (not part of execution: only on Daniel's go)

1. `supabase functions deploy gtm-audit-stats`. The function bundles `_shared/gtm-audit/stats.ts`, and v1 rejects `v: 2` and the new check keys.
2. Run `npm run build` and FTP `dist/`.
3. Check the CSP reports and `/gtm-audit/` with the sample report.

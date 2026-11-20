# Jurisdiction Phase 3 (Rule Engine) + Phase 6 Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One server-side rule engine decides, per site, visitor market and purpose, whether a measurement may happen. It runs in all eight ingest functions, logs daily counts of each decision, and feeds a per-country coverage view and per-country pixel readiness.

**Architecture:** A pure TypeScript module `supabase/functions/_shared/jurisdiction/` (types, markets, baseline, versioned rule pack, `decide()`, customer profile) is imported by Edge Functions through a thin glue file `_shared/jurisdiction-edge.ts`. The glue loads the site's policy through one RPC, reads the consent ledger, and writes one daily counter row per decision. Rules live as data with a status. Only `approved_internal` and `reviewed_counsel` rules change production behaviour; everything else falls back to the strict baseline. Enforcement is per function behind `JURISDICTION_ENFORCE`; the default is shadow mode (decide and log, change nothing).

**Tech Stack:** Deno Edge Functions (TypeScript, Node-type-strippable syntax), Supabase PostgreSQL migrations + RLS, PGlite for SQL tests, `node --test` foundation tests with `tests/foundation/edge-harness.mjs`, React 18 + TanStack Query + shadcn/ui for the dashboard, vanilla JS for `public/consent-banner.js`.

**Spec:** `docs/superpowers/specs/2026-11-18-jurisdiction-aware-measurement-design.md` (phase 3, plus the phase 6 slice: coverage per country, consent acceptance per country x banner language, pixel readiness per country). No Maximizer. Rule packs beyond today's behaviour are phase 4.

---

## Open questions for Daniel (decide before Task 10 is merged)

1. **Which rules are approved at launch.** Today's behaviour is written as three rules (Task 2). Only `eu.statistics.aggregate@1` has had a review (jurist agent, PR #69), so it is set to `reviewed_agent`, which is *not* production. Under enforcement without an approval, aggregate measurement stops for every visitor, and server-hit / non-EU aggregate stop too. Before any function is switched to enforce, you must either approve rules in the pack (Task 2 Step 6 shows how) or accept the stop. Please also confirm that the PR #69 review cited primary sources (CELEX 32002L0058, LEK 2022:482 9 kap. 28 §); if not, it cannot be raised to `approved_internal`.
2. **Shadow at merge vs enforce at merge.** Recommended: merge in shadow mode (`JURISDICTION_ENFORCE` unset), read `jurisdiction_decisions_daily` for a week, then enable one function at a time.
3. **`tracker_gate` evidence.** Sites with their own CMP (or pinned older trackers) never write `cookie_consents` rows, so the server cannot see consent. The plan accepts "the tracker only sends after its own consent gate" as weaker evidence (`evidence: 'tracker_gate'`), and a ledger row can only tighten it. The alternative (require a ledger row) stops all full-mode tracking on own-CMP sites. Recommended: accept, and show the evidence split in coverage.
4. **Timezone geo counts as unknown.** The spec says untrusted input never relaxes. `resolveGeo` falls back to the browser time zone when there is no signed header; the plan treats that as `unknown_geo`. Effect: visitors without a geo token are judged by the customer's strictest market.
5. **Profile per site or per account.** The plan stores the legal profile per site (`site_legal_profiles`). `companies` turned out to be a legacy API-key table, not a legal entity (see Code surprises).
6. **Approval flow.** Phase 3 approves rules through a reviewed git commit (status + approval record in `packs.ts`, enforced by a test). The admin approval screen with uncertainties is phase 4. Is a git-reviewed approval acceptable until then?
7. **Pixel readiness acceptance basis.** Current code multiplies by *analytics* acceptance; an ad-platform conversion needs *marketing* consent. The plan keeps analytics as the default and adds marketing as an option behind a flag, pending your choice (Task 18).
8. **Spec open question 1 (approver role)** and the DPA text that describes who approves rules: needs the jurist agent review before the DPA changes (Task 19 adds the review step; no DPA text changes in this plan).

## Code surprises that change spec assumptions

- `supabase/functions/_shared/jurisdiction.ts`: only `anonymizeIP` is live (imported by ai-bot-tracker, canary-tracker, server-hit, store-consent, track-event, bot-detection). The jurisdiction logic in it is dead. AC1 is mostly a deletion.
- `companies.jurisdiction` lives on a legacy API-key table, not a legal entity. Migration keeps the old values only as log rows.
- track-event has no server-side consent check; own-CMP sites have no ledger rows at all. record-conversion and visitor-identification already require a current ledger row (`consent_given`, `consent_types`, `expires_at`) and return 403 without one, so for them the engine adds the market rules on top of an existing gate. The ledger's `consent_given = false` (withdrawal) must read as a refusal (Task 9).
- The banner does not send its language; aggregate goals and `conversion_events` carry no country; record-conversion does not resolve geo; server-hit geo is unsigned adapter data.
- aggregate-hit counts every country, though the legal review covered SE/EU only. The aggregate GPC skip runs before site resolution, so no decision can be logged for it today.
- WordPress `geo_gating` only hides the banner outside EEA/UK/CH; it does not relax measurement.
- `tests/foundation/geo-wiring.test.mjs` (lines 42-48) asserts the exact geo-check JSON, so the `?site=` extension must keep the no-param response byte-identical.
- Pixel readiness uses analytics acceptance for an ad-platform decision (question 7).
- `cookie_consents.locale` is always `'sv'` (column default; the banner never sends it). Task 15 adds a separate `banner_lang` instead of trusting `locale`.
- `aggregate_countries_daily` (page views) takes any geo source, including the unsigned browser time zone. Task 16's goal-country table uses signed geo only; the page-view table is left as it is.
- `log_jurisdiction_decision` would have rejected an empty rule list (baseline decisions have no rule id) through the `rule_id` CHECK, so baseline decisions would silently go unlogged. Task 8 maps it to `'baseline'`.

## Global Constraints

- Status semantics: `draft` = unit tests and admin-flagged test sites only; `reviewed_agent` = no new production behaviour; `approved_internal` and `reviewed_counsel` = production; `suspended` = baseline.
- Fail closed: unknown or untrusted geo → the strictest pack among the customer's markets; no profile → the strictest of EU, UK and Québec (`['eu','uk','ca_qc']`).
- The customer can only tighten. Relaxing requires an approved exception: a relaxable rule variant at `approved_internal` or higher, `expires_at` at most 12 months after approval.
- Hard floors: GPC blocks ad-platform sharing and attribution even after later consent; EU cross-site identifiers need opt-in.
- The server decides; client-supplied consent, geo or policy never relaxes a decision.
- `jurisdiction_decisions_daily` holds daily counts only: no IP, user agent, session id, URL or visitor id.
- No invented legal conclusions. Every legal statement in rules or UI is a hypothesis with sources and uncertainties. No rule below `approved_internal` is presented as a method the customer can use.
- Copy rules: never "no consent needed", "GDPR-compliant without consent" or "no banner needed". Customer-facing text says: "CortIQ's technical defaults, not legal advice."
- Shared tracker/plugin version bump 5.5.18 → 5.5.19 in all five places when `public/consent-banner.js` changes (SRI rule: any change to `cortiq.js` or `consent-banner.js` needs the bump, or the build fails).
- After `npm run build`: `git checkout -- public/cortiq-wordpress-plugin.zip` unless the plugin changed (it does in Task 15).
- Deploy order: `supabase db push --remote --yes` before `supabase functions deploy`. Do not deploy or push the DB as part of executing this plan without Daniel's go.
- `.ts` files imported by `node --test` must use erasable syntax only (no `enum`, no parameter properties, no namespaces) and explicit `.ts` import extensions.
- Code and comments in English. UI copy in English.

## Review Focus

1. **Consent race.** A fresh session sends track-event before the banner's `store-consent` row exists. Expected: a missing ledger row is "unknown", not "refused"; the tracker-gate evidence applies and the event is kept. Pinned in Task 9.
2. **US or Canadian visitor without a region code.** Expected: treated as the stricter sub-market (`us_ca`, `ca_qc`), never the looser one. Pinned in Task 1.
3. **Decision log RPC fails** (DB hiccup, constraint error). Expected: ingest still succeeds; logging is best effort. Pinned in Task 10.
4. **Expired ledger row.** Expected: an expired consent row reads as "no answer" (`null`), not as a refusal and not as consent. Pinned in Task 9.
5. **Malformed policy JSON** from `get_site_jurisdiction` (null, wrong types, unknown markets). Expected: the strictest default, never a crash and never a looser result. Pinned in Task 9.

---

## File structure

| File | Responsibility | Task |
|---|---|---|
| `supabase/functions/_shared/jurisdiction/types.ts` | Types and `OUTCOME_RANK`, `PURPOSES`, `MARKETS` | 1 |
| `supabase/functions/_shared/jurisdiction/markets.ts` | `marketOf(country, region)`, `STRICTEST_DEFAULT` | 1 |
| `supabase/functions/_shared/jurisdiction/baseline.ts` | Strict baseline per purpose, consent category per purpose | 2 |
| `supabase/functions/_shared/jurisdiction/packs.ts` | Versioned rule pack (today's behaviour as data) | 2 |
| `supabase/functions/_shared/jurisdiction/decide.ts` | `decide(input)`: the engine | 3, 4 |
| `supabase/functions/_shared/jurisdiction/profile.ts` | Profile questions, `profileToCustomer(row)` | 5 |
| `supabase/functions/_shared/jurisdiction/index.ts` | Barrel export | 5 |
| `supabase/functions/_shared/ip.ts` | `anonymizeIP` (moved) | 6 |
| `supabase/functions/_shared/jurisdiction.ts` | Deleted | 6 |
| `supabase/migrations/20261207000001_jurisdiction_profile.sql` | Profile, tighten, exceptions, test sites, `get_site_jurisdiction` | 7 |
| `supabase/migrations/20261207000002_jurisdiction_decisions.sql` | Decision log, retention, legacy column removal, `skipped_jurisdiction` | 8 |
| `supabase/functions/_shared/jurisdiction-edge.ts` | Policy load, ledger read, enforce flag, `decideAndLog` | 9 |
| `supabase/functions/{aggregate-hit,server-hit,ai-bot-tracker}/index.ts` | Wiring | 10 |
| `supabase/functions/{track-event,visitor-identification,record-conversion}/index.ts` | Wiring | 11 |
| `supabase/functions/{store-consent,google-ads-quality-upload}/index.ts` | Wiring, `banner_lang` | 12, 15 |
| `supabase/functions/geo-check/index.ts` | Optional `?site=` effective policy | 13 |
| `src/lib/jurisdiction.ts`, `src/lib/effectiveByMarket.ts`, `src/hooks/useSiteJurisdiction.ts` | Frontend access to the engine | 14 |
| `src/components/dashboard/jurisdiction/*.tsx`, `src/components/dashboard/CMPDashboard.tsx` | "Rules by market" tab | 14 |
| `public/consent-banner.js` + 5 version places | Send `banner_lang` (5.5.19) | 15 |
| `supabase/migrations/20261207000003_consent_banner_lang.sql` | `cookie_consents.banner_lang` | 15 |
| `supabase/migrations/20261207000004_aggregate_goal_countries.sql` | Goal counts per country | 16 |
| `supabase/migrations/20261207000005_coverage_by_country.sql` | Coverage and acceptance RPCs | 17 |
| `src/lib/pixelReadiness.ts`, `src/hooks/useCoverageByCountry.ts`, `src/components/dashboard/jurisdiction/CoverageByCountryCard.tsx` | Phase 6 slice | 18 |
| `supabase/functions/_shared/banner-langs.ts` | The 13 banner codes for Edge Functions | 15 |
| `CLAUDE.md`, `docs/runbooks/jurisdiction-enforcement.md` | Section + enforcement runbook | 19 |

---

### Task 1: Engine types and market mapping

**Files:**
- Create: `supabase/functions/_shared/jurisdiction/types.ts`
- Create: `supabase/functions/_shared/jurisdiction/markets.ts`
- Test: `tests/foundation/jurisdiction-markets.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces (`types.ts`): `PURPOSES`, `Purpose`, `OUTCOMES`, `Outcome`, `OUTCOME_RANK`, `RULE_STATUSES`, `RuleStatus`, `PRODUCTION_STATUSES`, `MARKETS`, `Market`, `Storage`, `Identifiers`, `STORAGE_RANK`, `IDENT_RANK`, `Technique`, `GeoSource`, `Visitor`, `Answer`, `CustomerProfile`, `Evidence`, `Signals`, `TIGHTEN_SETTINGS`, `Tighten`, `ApprovedException`, `RuleSource`, `RuleApproval`, `Rule`, `Pack`, `Reason`, `Fallback`, `DecideInput`, `Decision`.
- Produces (`markets.ts`): `marketOf(country: unknown, region: unknown): Market | null`, `STRICTEST_DEFAULT: readonly Market[]` (= `['eu','uk','ca_qc']`), `EEA_COUNTRIES: ReadonlySet<string>`.

- [ ] **Step 1: Write the failing test**

```js
// tests/foundation/jurisdiction-markets.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { marketOf, STRICTEST_DEFAULT, EEA_COUNTRIES } from '../../supabase/functions/_shared/jurisdiction/markets.ts';
import { OUTCOME_RANK, MARKETS, PURPOSES, PRODUCTION_STATUSES } from '../../supabase/functions/_shared/jurisdiction/types.ts';

test('EEA countries map to eu; UK, CH, BR and the rest map to their own market', () => {
  for (const c of ['SE', 'DE', 'FR', 'IE', 'IS', 'LI', 'NO']) assert.equal(marketOf(c, null), 'eu', c);
  assert.equal(EEA_COUNTRIES.size, 30);
  assert.equal(marketOf('GB', null), 'uk');
  assert.equal(marketOf('CH', null), 'ch');
  assert.equal(marketOf('BR', null), 'br');
  assert.equal(marketOf('JP', null), 'other');
  assert.equal(marketOf('se', null), 'eu', 'case-insensitive');
});

test('Review Focus 2: US and Canada without a region fall into the stricter sub-market', () => {
  assert.equal(marketOf('US', 'CA'), 'us_ca');
  assert.equal(marketOf('US', 'TX'), 'us_other');
  assert.equal(marketOf('US', null), 'us_ca');
  assert.equal(marketOf('US', ''), 'us_ca');
  assert.equal(marketOf('CA', 'QC'), 'ca_qc');
  assert.equal(marketOf('CA', 'ON'), 'ca_other');
  assert.equal(marketOf('CA', null), 'ca_qc');
  assert.equal(marketOf('CA', 42), 'ca_qc', 'non-string region is unknown');
});

test('invalid, anonymous-proxy and Tor countries are unknown (null)', () => {
  for (const c of [null, undefined, '', 'XX', 'T1', 'SWE', 'S1', 1, {}]) assert.equal(marketOf(c, null), null, String(c));
});

test('constants: ranks are strict, markets and purposes are closed lists', () => {
  assert.deepEqual(STRICTEST_DEFAULT, ['eu', 'uk', 'ca_qc']);
  assert.ok(OUTCOME_RANK.allowed < OUTCOME_RANK.allowed_unless_opt_out);
  assert.ok(OUTCOME_RANK.allowed_unless_opt_out < OUTCOME_RANK.needs_opt_in);
  assert.ok(OUTCOME_RANK.needs_opt_in < OUTCOME_RANK.blocked);
  assert.deepEqual([...MARKETS], ['eu', 'uk', 'ch', 'us_ca', 'us_other', 'ca_qc', 'ca_other', 'br', 'other']);
  assert.deepEqual([...PURPOSES], ['statistics', 'conversion', 'attribution', 'ad_platform_sharing', 'security']);
  assert.deepEqual([...PRODUCTION_STATUSES], ['approved_internal', 'reviewed_counsel']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/foundation/jurisdiction-markets.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `markets.ts`.

- [ ] **Step 3: Write `types.ts`**

```ts
// supabase/functions/_shared/jurisdiction/types.ts
// Spec 2026-11-18 phase 3. Pure data types for the rule engine. Erasable TS only (node --test strips types).
export const PURPOSES = ['statistics', 'conversion', 'attribution', 'ad_platform_sharing', 'security'] as const;
export type Purpose = typeof PURPOSES[number];

export const OUTCOMES = ['allowed', 'allowed_unless_opt_out', 'needs_opt_in', 'blocked'] as const;
export type Outcome = typeof OUTCOMES[number];
export const OUTCOME_RANK: Readonly<Record<Outcome, number>> = { allowed: 0, allowed_unless_opt_out: 1, needs_opt_in: 2, blocked: 3 };

export const RULE_STATUSES = ['draft', 'reviewed_agent', 'approved_internal', 'reviewed_counsel', 'suspended'] as const;
export type RuleStatus = typeof RULE_STATUSES[number];
export const PRODUCTION_STATUSES: readonly RuleStatus[] = ['approved_internal', 'reviewed_counsel'];

export const MARKETS = ['eu', 'uk', 'ch', 'us_ca', 'us_other', 'ca_qc', 'ca_other', 'br', 'other'] as const;
export type Market = typeof MARKETS[number];

export type Storage = 'none' | 'session' | 'persistent';
export type Identifiers = 'none' | 'session' | 'cross_site';
export const STORAGE_RANK: Readonly<Record<Storage, number>> = { none: 0, session: 1, persistent: 2 };
export const IDENT_RANK: Readonly<Record<Identifiers, number>> = { none: 0, session: 1, cross_site: 2 };
export interface Technique { storage: Storage; identifiers: Identifiers }

// 'ip' = signed edge geo (same values as _shared/geo.ts GeoSource, plus 'adapter' for unsigned
// server-adapter claims). Everything except 'ip' is untrusted (spec: fail closed).
export type GeoSource = 'ip' | 'timezone' | 'unknown' | 'adapter';
export interface Visitor { country: string | null; region: string | null; geoSource: GeoSource }

export type Answer = 'yes' | 'no' | 'dont_know';
export interface CustomerProfile { establishment: string | null; markets: Market[]; appliesLaws: Record<string, Answer> }

export type Evidence = 'ledger' | 'tracker_gate' | 'none';
export interface Signals {
  consent: { analytics: boolean | null; marketing: boolean | null };
  evidence: Evidence;
  gpc: boolean;
  consentModeDefault?: 'granted' | 'denied';
  consentModeUpdate?: 'granted' | 'denied';
}

export const TIGHTEN_SETTINGS = ['default', 'opt_in', 'off'] as const;
export type Tighten = typeof TIGHTEN_SETTINGS[number];

export interface ApprovedException {
  ruleId: string; jurisdiction: Market; purpose: Purpose; legalBasis: string;
  assessmentRef: string; approvedBy: string; approvedAt: string; expiresAt: string;
}

export interface RuleSource { title: string; ref: string; checked: string }
export interface RuleApproval { approvedBy: string; approvedAt: string; reviewDue: string }
export interface Rule {
  id: string; version: number; markets: readonly Market[]; purposes: readonly Purpose[];
  technique: Technique;          // the most invasive technique this rule covers
  outcome: Outcome; status: RuleStatus;
  law: string | null;            // key into CustomerProfile.appliesLaws; null = always applies
  relaxable: boolean;            // true = only applies through an ApprovedException
  requiredLegalBasis: string | null;
  sources: readonly RuleSource[]; uncertainties: readonly string[]; assessment: string;
  effectiveFrom: string; approval: RuleApproval | null;
}
export interface Pack { version: string; rules: readonly Rule[] }

export type Reason = 'allowed' | 'opt_out' | 'gpc' | 'consent_missing' | 'consent_refused' | 'rule_blocked' | 'customer_off';
export type Fallback = 'unknown_geo' | 'no_profile' | null;

export interface DecideInput {
  visitor: Visitor; customer: CustomerProfile | null; purpose: Purpose; signals: Signals; technique: Technique;
  exceptions: readonly ApprovedException[]; tighten?: Partial<Record<Purpose, string>>;
  testSite?: boolean; now?: Date; pack?: Pack;
}
export interface Decision {
  outcome: Outcome; permit: boolean; reason: Reason; evidence: Evidence; constraints: Technique;
  ruleIds: string[]; markets: Market[]; fallback: Fallback; packVersion: string;
}
```

- [ ] **Step 4: Write `markets.ts`**

```ts
// supabase/functions/_shared/jurisdiction/markets.ts
import type { Market } from './types.ts';

export const EEA_COUNTRIES: ReadonlySet<string> = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU',
  'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO',
]);
// Used when geo is unknown and the customer has no profile.
export const STRICTEST_DEFAULT: readonly Market[] = ['eu', 'uk', 'ca_qc'];

export function marketOf(country: unknown, region: unknown): Market | null {
  const c = typeof country === 'string' ? country.trim().toUpperCase() : '';
  if (!/^[A-Z]{2}$/.test(c) || c === 'XX' || c === 'T1') return null;
  const r = typeof region === 'string' ? region.trim().toUpperCase() : '';
  if (EEA_COUNTRIES.has(c)) return 'eu';
  if (c === 'GB') return 'uk';
  if (c === 'CH') return 'ch';
  // Missing sub-national region = the stricter sub-market (Review Focus 2).
  if (c === 'US') return r === '' || r === 'CA' ? 'us_ca' : 'us_other';
  if (c === 'CA') return r === '' || r === 'QC' ? 'ca_qc' : 'ca_other';
  if (c === 'BR') return 'br';
  return 'other';
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/foundation/jurisdiction-markets.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/jurisdiction/types.ts supabase/functions/_shared/jurisdiction/markets.ts tests/foundation/jurisdiction-markets.test.mjs
git commit -m "feat(jurisdiction): engine types and market mapping"
```

---

### Task 2: Baseline and rule pack (today's behaviour as data)

**Files:**
- Create: `supabase/functions/_shared/jurisdiction/baseline.ts`
- Create: `supabase/functions/_shared/jurisdiction/packs.ts`
- Test: `tests/foundation/jurisdiction-packs.test.mjs`

**Interfaces:**
- Consumes: `types.ts` (Task 1).
- Produces: `BASELINE: Readonly<Record<Purpose, Outcome>>` (all `needs_opt_in`), `CATEGORY: Readonly<Record<Purpose, 'analytics' | 'marketing'>>`, `SHARING_PURPOSES: ReadonlySet<Purpose>` (`attribution`, `ad_platform_sharing`), `PACK_VERSION = '2026.11.20-1'`, `PACK: Pack`, `usable(rule: Rule, testSite: boolean): boolean`.

The three rules record what the code does today. Their legal text is a hypothesis and none is approved. Approving one is a separate reviewed commit (Step 6), never part of this task.

- [ ] **Step 1: Write the failing test**

```js
// tests/foundation/jurisdiction-packs.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PACK, PACK_VERSION, usable } from '../../supabase/functions/_shared/jurisdiction/packs.ts';
import { BASELINE, CATEGORY, SHARING_PURPOSES } from '../../supabase/functions/_shared/jurisdiction/baseline.ts';
import { PRODUCTION_STATUSES, MARKETS, PURPOSES } from '../../supabase/functions/_shared/jurisdiction/types.ts';

const BANNED = [/no consent needed/i, /gdpr[- ]compliant without consent/i, /no banner needed/i];

test('baseline is opt-in for every purpose; sharing purposes are marketing', () => {
  for (const p of PURPOSES) assert.equal(BASELINE[p], 'needs_opt_in', p);
  assert.deepEqual(CATEGORY, { statistics: 'analytics', conversion: 'analytics', security: 'analytics', attribution: 'marketing', ad_platform_sharing: 'marketing' });
  assert.deepEqual([...SHARING_PURPOSES].sort(), ['ad_platform_sharing', 'attribution']);
});

test('pack snapshot: rule ids and honest statuses (changing a status is a reviewed decision)', () => {
  assert.equal(PACK.version, PACK_VERSION);
  assert.deepEqual(PACK.rules.map((r) => [`${r.id}@${r.version}`, r.status]), [
    ['eu.statistics.aggregate@1', 'reviewed_agent'],
    ['world.statistics.aggregate@1', 'draft'],
    ['all.security.server_log@1', 'draft'],
  ]);
});

test('rule invariants: sources, uncertainties, hypothesis wording, approval only when approved', () => {
  const ids = new Set();
  for (const r of PACK.rules) {
    const key = `${r.id}@${r.version}`;
    assert.ok(!ids.has(key), `duplicate ${key}`); ids.add(key);
    assert.ok(r.markets.length > 0 && r.markets.every((m) => MARKETS.includes(m)), key);
    assert.ok(r.purposes.length > 0 && r.purposes.every((p) => PURPOSES.includes(p)), key);
    assert.ok(r.sources.length > 0 && r.sources.every((s) => s.title && s.ref && /^\d{4}-\d{2}-\d{2}$/.test(s.checked)), key);
    assert.ok(r.uncertainties.length > 0, key);
    assert.match(r.assessment, /^Hypothesis/, key);
    if (r.relaxable) assert.ok(r.requiredLegalBasis, `${key} relaxable needs a legal basis`);
    if (PRODUCTION_STATUSES.includes(r.status)) {
      assert.ok(r.approval && r.approval.approvedBy && r.approval.approvedAt && r.approval.reviewDue, `${key} approval record`);
      const due = Date.parse(r.approval.reviewDue) - Date.parse(r.approval.approvedAt);
      assert.ok(due > 0 && due <= 92 * 86400e3, `${key} quarterly re-evaluation`);
    } else {
      assert.equal(r.approval, null, `${key} has an approval record but is not approved`);
    }
    for (const re of BANNED) assert.doesNotMatch(JSON.stringify(r), re, key);
  }
});

test('usable(): production statuses everywhere, draft and reviewed_agent only on test sites, suspended never', () => {
  const r = (status) => ({ ...PACK.rules[0], status });
  assert.equal(usable(r('approved_internal'), false), true);
  assert.equal(usable(r('reviewed_counsel'), false), true);
  assert.equal(usable(r('reviewed_agent'), false), false);
  assert.equal(usable(r('draft'), false), false);
  assert.equal(usable(r('draft'), true), true);
  assert.equal(usable(r('reviewed_agent'), true), true);
  assert.equal(usable(r('suspended'), true), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/foundation/jurisdiction-packs.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Write `baseline.ts`**

```ts
// supabase/functions/_shared/jurisdiction/baseline.ts
// The strict baseline applies whenever no usable rule matches. CortIQ's technical default, not legal advice.
import type { Outcome, Purpose } from './types.ts';

export const BASELINE: Readonly<Record<Purpose, Outcome>> = {
  statistics: 'needs_opt_in', conversion: 'needs_opt_in', attribution: 'needs_opt_in',
  ad_platform_sharing: 'needs_opt_in', security: 'needs_opt_in',
};
// Which consent category answers a needs_opt_in outcome.
export const CATEGORY: Readonly<Record<Purpose, 'analytics' | 'marketing'>> = {
  statistics: 'analytics', conversion: 'analytics', security: 'analytics',
  attribution: 'marketing', ad_platform_sharing: 'marketing',
};
export const SHARING_PURPOSES: ReadonlySet<Purpose> = new Set(['attribution', 'ad_platform_sharing']);
```

- [ ] **Step 4: Write `packs.ts`**

```ts
// supabase/functions/_shared/jurisdiction/packs.ts
// Rule pack 2026.11.20-1: today's behaviour written as data. Every legal statement is a hypothesis.
// Raising a status to approved_internal is a reviewed commit that also fills `approval`.
import type { Pack, Rule } from './types.ts';
import { PRODUCTION_STATUSES } from './types.ts';

export const PACK_VERSION = '2026.11.20-1';
const ALL_BUT_EU = ['uk', 'ch', 'us_ca', 'us_other', 'ca_qc', 'ca_other', 'br', 'other'] as const;

const EU_AGGREGATE: Rule = {
  id: 'eu.statistics.aggregate', version: 1, markets: ['eu'], purposes: ['statistics', 'conversion'],
  technique: { storage: 'none', identifiers: 'none' }, outcome: 'allowed_unless_opt_out',
  status: 'reviewed_agent', law: null, relaxable: false, requiredLegalBasis: null,
  sources: [
    { title: 'Directive 2002/58/EC (ePrivacy) art. 5(3)', ref: 'CELEX:32002L0058', checked: '2026-10-30' },
    { title: 'Lag (2022:482) om elektronisk kommunikation 9 kap. 28 §', ref: 'SFS 2022:482', checked: '2026-10-30' },
    { title: 'Regulation (EU) 2016/679 art. 6(1)(f)', ref: 'CELEX:32016R0679', checked: '2026-10-30' },
  ],
  uncertainties: [
    'Whether a daily-salted hash of IP and user agent is personal data for the site owner.',
    'National implementations of art. 5(3) outside Sweden were not reviewed.',
    'The review (PR #69, jurist agent) is not counsel review.',
  ],
  assessment: 'Hypothesis: counting page views without device storage and without identifiers that outlive one UTC day does not access the terminal equipment, and a legitimate-interest balance can favour the site owner when refusal and GPC are honoured.',
  effectiveFrom: '2026-10-30', approval: null,
};

const WORLD_AGGREGATE: Rule = {
  ...EU_AGGREGATE, id: 'world.statistics.aggregate', markets: [...ALL_BUT_EU], status: 'draft',
  sources: [{ title: 'Current aggregate-hit behaviour (counts every country)', ref: 'supabase/functions/aggregate-hit/index.ts', checked: '2026-11-20' }],
  uncertainties: ['No legal review covers markets outside the EU/EEA.', 'UK PECR reg. 6 and Québec Law 25 may treat this differently.'],
  assessment: 'Hypothesis: records today\'s behaviour outside the EU; not reviewed for any of these markets.',
  effectiveFrom: '2026-11-20',
};

const SERVER_LOG: Rule = {
  id: 'all.security.server_log', version: 1, markets: ['eu', ...ALL_BUT_EU], purposes: ['security'],
  technique: { storage: 'none', identifiers: 'none' }, outcome: 'allowed',
  status: 'draft', law: null, relaxable: false, requiredLegalBasis: null,
  sources: [{ title: 'server-hit code comment on server-side bot logging', ref: 'supabase/functions/server-hit/index.ts', checked: '2026-11-20' }],
  uncertainties: ['No legal review of server-side bot logging without consent.', 'Human visitors can be logged when an adapter misclassifies them.'],
  assessment: 'Hypothesis: logging requests by known automated agents on the server, with anonymised IP and no device storage, is outside the consent requirement for terminal equipment.',
  effectiveFrom: '2026-11-20', approval: null,
};

export const PACK: Pack = { version: PACK_VERSION, rules: [EU_AGGREGATE, WORLD_AGGREGATE, SERVER_LOG] };

export function usable(rule: Rule, testSite: boolean): boolean {
  if (rule.status === 'suspended') return false;
  if (PRODUCTION_STATUSES.includes(rule.status)) return true;
  return testSite && (rule.status === 'draft' || rule.status === 'reviewed_agent');
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/foundation/jurisdiction-packs.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 6: How a rule gets approved (not done in this plan)**

Approval is Daniel's decision (open question 1). The commit that approves a rule changes exactly these lines, and the invariant test enforces the shape (approval record present, review due within 92 days):

```ts
// Example only. Never commit without Daniel's explicit approval in his own message.
status: 'approved_internal',
approval: { approvedBy: 'Daniel Larsson', approvedAt: '2026-12-01', reviewDue: '2027-03-01' },
// and the snapshot line in tests/foundation/jurisdiction-packs.test.mjs:
['eu.statistics.aggregate@1', 'approved_internal'],
```

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/jurisdiction/baseline.ts supabase/functions/_shared/jurisdiction/packs.ts tests/foundation/jurisdiction-packs.test.mjs
git commit -m "feat(jurisdiction): strict baseline and rule pack with honest statuses"
```

---

### Task 3: `decide()` core and the must-pass cases

**Files:**
- Create: `supabase/functions/_shared/jurisdiction/decide.ts`
- Test: `tests/foundation/jurisdiction-decide.test.mjs`

**Interfaces:**
- Consumes: Task 1 (`marketOf`, `STRICTEST_DEFAULT`, ranks, types), Task 2 (`BASELINE`, `CATEGORY`, `SHARING_PURPOSES`, `PACK`, `usable`).
- Produces: `decide(input: DecideInput): Decision`, `marketsFor(visitor: Visitor, customer: CustomerProfile | null): { markets: Market[]; fallback: Fallback }`, `covers(rule: Rule, t: Technique): boolean`. Rule ids in `Decision.ruleIds` look like `eu.statistics.aggregate@1`, `baseline.statistics`, `floor.gpc_sharing`, `floor.eu_cross_site`.

- [ ] **Step 1: Write the failing test**

```js
// tests/foundation/jurisdiction-decide.test.mjs
// Spec 2026-11-18 phase 3 AC2: table tests incl. the must-pass cases.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, marketsFor } from '../../supabase/functions/_shared/jurisdiction/decide.ts';
import { PACK } from '../../supabase/functions/_shared/jurisdiction/packs.ts';

const NOW = new Date('2026-12-01T12:00:00Z');
const AGG = { storage: 'none', identifiers: 'none' };
const SESSION = { storage: 'session', identifiers: 'session' };
const approve = (r) => ({ ...r, status: 'approved_internal', approval: { approvedBy: 'test', approvedAt: '2026-11-01', reviewDue: '2027-01-31' } });
const APPROVED = { version: 'test-approved', rules: PACK.rules.map(approve) };
const ip = (country, region = null) => ({ country, region, geoSource: 'ip' });
const profile = (markets, appliesLaws = {}) => ({ establishment: 'SE', markets, appliesLaws });
const sig = (over = {}) => ({ consent: { analytics: null, marketing: null }, evidence: 'none', gpc: false, ...over });
const run = (over) => decide({
  visitor: ip('SE'), customer: profile(['eu']), purpose: 'statistics', signals: sig(), technique: AGG,
  exceptions: [], now: NOW, ...over,
});

test('must-pass: EU visitor without consent, identifying technique -> opt-in required, not permitted', () => {
  const d = run({ technique: SESSION });
  assert.deepEqual([d.outcome, d.permit, d.reason], ['needs_opt_in', false, 'consent_missing']);
  assert.deepEqual(d.ruleIds, ['baseline.statistics']);
  assert.deepEqual(d.constraints, { storage: 'none', identifiers: 'none' });
});

test('must-pass: EU aggregate without consent depends on the rule status, never on the code', () => {
  const unapproved = run({});
  assert.deepEqual([unapproved.outcome, unapproved.permit, unapproved.reason], ['needs_opt_in', false, 'consent_missing']);
  const approved = run({ pack: APPROVED });
  assert.deepEqual([approved.outcome, approved.permit, approved.reason], ['allowed_unless_opt_out', true, 'allowed']);
  assert.deepEqual(approved.ruleIds, ['eu.statistics.aggregate@1']);
  assert.equal(approved.packVersion, 'test-approved');
  const refused = run({ pack: APPROVED, signals: sig({ consent: { analytics: false, marketing: false }, evidence: 'ledger' }) });
  assert.deepEqual([refused.permit, refused.reason, refused.evidence], [false, 'opt_out', 'ledger']);
  const cmDenied = run({ pack: APPROVED, signals: sig({ consentModeUpdate: 'denied' }) });
  assert.deepEqual([cmDenied.permit, cmDenied.reason], [false, 'opt_out']);
  const cmDefault = run({ pack: APPROVED, signals: sig({ consentModeDefault: 'denied' }) });
  assert.equal(cmDefault.permit, true, 'a Consent Mode default is not a choice');
});

test('must-pass: California visitor with GPC -> no ad-platform sharing, even after later consent', () => {
  const d = run({ visitor: ip('US', 'CA'), customer: profile(['us_ca']), purpose: 'ad_platform_sharing',
    technique: { storage: 'persistent', identifiers: 'cross_site' },
    signals: sig({ consent: { analytics: true, marketing: true }, evidence: 'ledger', gpc: true }) });
  assert.deepEqual([d.permit, d.reason], [false, 'gpc']);
  assert.ok(d.ruleIds.includes('floor.gpc_sharing'));
  const attribution = run({ visitor: ip('US', 'CA'), customer: profile(['us_ca']), purpose: 'attribution',
    signals: sig({ consent: { analytics: true, marketing: true }, gpc: true }) });
  assert.deepEqual([attribution.permit, attribution.reason], [false, 'gpc']);
  const stats = run({ visitor: ip('US', 'CA'), customer: profile(['us_ca']), technique: SESSION,
    signals: sig({ consent: { analytics: true, marketing: false }, evidence: 'ledger', gpc: true }) });
  assert.equal(stats.permit, true, 'GPC does not cancel consented statistics');
});

test('must-pass: Quebec visitor with an identifying technique -> opt-in, draft rules ignored on customer sites', () => {
  const d = run({ visitor: ip('CA', 'QC'), customer: profile(['ca_qc']), technique: SESSION });
  assert.deepEqual([d.markets, d.outcome, d.permit, d.reason], [['ca_qc'], 'needs_opt_in', false, 'consent_missing']);
  const ok = run({ visitor: ip('CA', 'QC'), customer: profile(['ca_qc']), technique: SESSION,
    signals: sig({ consent: { analytics: true, marketing: false }, evidence: 'ledger' }) });
  assert.deepEqual([ok.permit, ok.constraints], [true, SESSION]);
});

test('unknown geo and spoofed or unsigned geo use the customer markets (fail closed)', () => {
  for (const geoSource of ['timezone', 'unknown', 'adapter']) {
    const d = run({ visitor: { country: 'US', region: 'TX', geoSource }, customer: profile(['eu', 'us_other']), pack: APPROVED });
    assert.equal(d.fallback, 'unknown_geo', geoSource);
    assert.deepEqual(d.markets, ['eu', 'us_other']);
  }
  const noMarkets = marketsFor({ country: null, region: null, geoSource: 'unknown' }, profile([]));
  assert.deepEqual(noMarkets, { markets: ['eu', 'uk', 'ca_qc'], fallback: 'unknown_geo' });
});

test('no profile -> visitor market plus the strictest default; outcome is the strictest across them', () => {
  assert.deepEqual(marketsFor(ip('JP'), null), { markets: ['other', 'eu', 'uk', 'ca_qc'], fallback: 'no_profile' });
  assert.deepEqual(marketsFor(ip('SE'), null), { markets: ['eu', 'uk', 'ca_qc'], fallback: 'no_profile' });
  // uk and ca_qc have no usable rule -> baseline, so an approved EU rule alone cannot relax a no-profile site.
  const d = run({ customer: null, pack: { version: 'eu-only', rules: [approve(PACK.rules[0])] } });
  assert.deepEqual([d.outcome, d.permit, d.fallback], ['needs_opt_in', false, 'no_profile']);
});

test('statuses: draft only on admin test sites, suspended never, reviewed_agent not in production', () => {
  const qc = { visitor: ip('CA', 'QC'), customer: profile(['ca_qc']) };
  assert.equal(run(qc).outcome, 'needs_opt_in', 'draft world rule ignored on a customer site');
  assert.equal(run({ ...qc, testSite: true }).outcome, 'allowed_unless_opt_out', 'draft applies on a test site');
  const suspended = { version: 's', rules: [{ ...approve(PACK.rules[0]), status: 'suspended', approval: null }] };
  assert.equal(run({ pack: suspended, testSite: true }).outcome, 'needs_opt_in');
  const future = { version: 'f', rules: [{ ...approve(PACK.rules[0]), effectiveFrom: '2027-01-01' }] };
  assert.equal(run({ pack: future }).outcome, 'needs_opt_in', 'not yet effective');
});

test('law answers: "no" excludes a law-bound rule, "dont_know" keeps it', () => {
  const lawRule = { ...approve(PACK.rules[0]), id: 'us.ccpa.test', markets: ['us_ca'], outcome: 'blocked', law: 'us_ccpa' };
  const pack = { version: 'law', rules: [lawRule] };
  const base = { visitor: ip('US', 'CA'), pack };
  assert.equal(run({ ...base, customer: profile(['us_ca'], { us_ccpa: 'no' }) }).outcome, 'needs_opt_in');
  assert.equal(run({ ...base, customer: profile(['us_ca'], { us_ccpa: 'dont_know' }) }).outcome, 'blocked');
  assert.equal(run({ ...base, customer: profile(['us_ca'], {}) }).reason, 'rule_blocked');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/foundation/jurisdiction-decide.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `decide.ts`.

- [ ] **Step 3: Write `decide.ts`**

```ts
// supabase/functions/_shared/jurisdiction/decide.ts
// Spec 2026-11-18 ADR-1 A+: rules decide, the customer can only tighten, untrusted input fails closed.
import { IDENT_RANK, OUTCOME_RANK, STORAGE_RANK } from './types.ts';
import type { CustomerProfile, Decision, DecideInput, Fallback, Market, Outcome, Rule, Technique, Visitor } from './types.ts';
import { marketOf, STRICTEST_DEFAULT } from './markets.ts';
import { BASELINE, CATEGORY, SHARING_PURPOSES } from './baseline.ts';
import { PACK, usable } from './packs.ts';

const NONE: Technique = { storage: 'none', identifiers: 'none' };
const stricter = (a: Outcome, b: Outcome): Outcome => (OUTCOME_RANK[a] >= OUTCOME_RANK[b] ? a : b);
const ruleKey = (r: Rule) => `${r.id}@${r.version}`;

export const covers = (rule: Rule, t: Technique): boolean =>
  STORAGE_RANK[t.storage] <= STORAGE_RANK[rule.technique.storage] && IDENT_RANK[t.identifiers] <= IDENT_RANK[rule.technique.identifiers];

const lawApplies = (rule: Rule, customer: CustomerProfile | null): boolean =>
  !rule.law || !customer || customer.appliesLaws[rule.law] !== 'no';

export function marketsFor(visitor: Visitor, customer: CustomerProfile | null): { markets: Market[]; fallback: Fallback } {
  const own = visitor.geoSource === 'ip' ? marketOf(visitor.country, visitor.region) : null;
  if (!customer) return { markets: [...new Set<Market>([...(own ? [own] : []), ...STRICTEST_DEFAULT])], fallback: 'no_profile' };
  if (!own) return { markets: customer.markets.length ? [...customer.markets] : [...STRICTEST_DEFAULT], fallback: 'unknown_geo' };
  return { markets: [own], fallback: null };
}

function marketOutcome(market: Market, input: DecideInput, now: number): { outcome: Outcome; ruleId: string } {
  const pack = input.pack ?? PACK;
  const candidates = pack.rules.filter((r) => r.markets.includes(market) && r.purposes.includes(input.purpose)
    && covers(r, input.technique) && lawApplies(r, input.customer) && Date.parse(r.effectiveFrom) <= now);
  let outcome: Outcome = BASELINE[input.purpose];
  let ruleId = `baseline.${input.purpose}`;
  const fixed = candidates.filter((r) => !r.relaxable && usable(r, !!input.testSite));
  if (fixed.length) {
    const strictest = fixed.reduce((a, b) => (OUTCOME_RANK[b.outcome] > OUTCOME_RANK[a.outcome] ? b : a));
    outcome = strictest.outcome; ruleId = ruleKey(strictest);
  }
  return { outcome, ruleId };
}

export function decide(input: DecideInput): Decision {
  const now = (input.now ?? new Date()).getTime();
  const pack = input.pack ?? PACK;
  const { markets, fallback } = marketsFor(input.visitor, input.customer);
  let outcome: Outcome = 'allowed';
  const ruleIds: string[] = [];
  for (const m of markets) {
    const r = marketOutcome(m, input, now);
    outcome = stricter(outcome, r.outcome);
    if (!ruleIds.includes(r.ruleId)) ruleIds.push(r.ruleId);
  }

  const s = input.signals;
  const category = CATEGORY[input.purpose];
  let permit = false;
  let reason: Decision['reason'];
  if (outcome === 'blocked') reason = 'rule_blocked';
  else if (SHARING_PURPOSES.has(input.purpose) && s.gpc) { reason = 'gpc'; ruleIds.push('floor.gpc_sharing'); }
  else if (outcome === 'allowed') { permit = true; reason = 'allowed'; }
  else if (outcome === 'allowed_unless_opt_out') {
    if (s.gpc) reason = 'gpc';
    else if (s.consent[category] === false || s.consentModeUpdate === 'denied') reason = 'opt_out';
    else { permit = true; reason = 'allowed'; }
  } else {
    const c = s.consent[category];
    if (c === true) { permit = true; reason = 'allowed'; } else reason = c === false ? 'consent_refused' : 'consent_missing';
  }
  return { outcome, permit, reason, evidence: s.evidence, constraints: permit ? { ...input.technique } : { ...NONE },
    ruleIds, markets, fallback, packVersion: pack.version };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/foundation/jurisdiction-decide.test.mjs tests/foundation/jurisdiction-packs.test.mjs tests/foundation/jurisdiction-markets.test.mjs`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/jurisdiction/decide.ts tests/foundation/jurisdiction-decide.test.mjs
git commit -m "feat(jurisdiction): decide() with fail-closed markets, statuses and GPC floor"
```

---

### Task 4: Approved exceptions, hard floors and customer tightening

**Files:**
- Modify: `supabase/functions/_shared/jurisdiction/decide.ts`
- Test: `tests/foundation/jurisdiction-exceptions.test.mjs`

**Interfaces:**
- Consumes: `decide`, `covers` (Task 3); `PRODUCTION_STATUSES` (Task 1).
- Produces: `MAX_EXCEPTION_MS = 366 * 86400e3` exported from `decide.ts`; `Decision.reason === 'customer_off'`; rule ids `floor.eu_cross_site`, `tighten.opt_in`, `tighten.off`. Any `tighten` value other than `opt_in` or `off` is ignored (AC4: a relax attempt has no effect).

- [ ] **Step 1: Write the failing test**

```js
// tests/foundation/jurisdiction-exceptions.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, MAX_EXCEPTION_MS } from '../../supabase/functions/_shared/jurisdiction/decide.ts';
import { PACK } from '../../supabase/functions/_shared/jurisdiction/packs.ts';

const NOW = new Date('2026-12-01T12:00:00Z');
const approve = (r) => ({ ...r, status: 'approved_internal', approval: { approvedBy: 'test', approvedAt: '2026-11-01', reviewDue: '2027-01-31' } });
const RELAX = { ...approve(PACK.rules[0]), id: 'eu.attribution.li', purposes: ['attribution'],
  technique: { storage: 'session', identifiers: 'session' }, outcome: 'allowed_unless_opt_out',
  relaxable: true, requiredLegalBasis: 'legitimate_interest' };
const pack = (rules) => ({ version: 'x', rules });
const exc = (over = {}) => ({ ruleId: 'eu.attribution.li@1', jurisdiction: 'eu', purpose: 'attribution', legalBasis: 'legitimate_interest',
  assessmentRef: 'LIA-2026-01', approvedBy: 'Daniel Larsson', approvedAt: '2026-11-15T00:00:00Z', expiresAt: '2027-11-14T00:00:00Z', ...over });
const run = (over) => decide({
  visitor: { country: 'SE', region: null, geoSource: 'ip' }, customer: { establishment: 'SE', markets: ['eu'], appliesLaws: {} },
  purpose: 'attribution', signals: { consent: { analytics: null, marketing: null }, evidence: 'none', gpc: false },
  technique: { storage: 'session', identifiers: 'session' }, exceptions: [], now: NOW, pack: pack([RELAX]), ...over,
});

test('a relaxable rule applies only through a valid approved exception', () => {
  assert.deepEqual([run({}).outcome, run({}).reason], ['needs_opt_in', 'consent_missing']);
  const ok = run({ exceptions: [exc()] });
  assert.deepEqual([ok.outcome, ok.permit, ok.ruleIds], ['allowed_unless_opt_out', true, ['eu.attribution.li@1']]);
});

test('must-pass: expired, too long, not yet valid or mismatched exceptions are ignored', () => {
  assert.equal(MAX_EXCEPTION_MS, 366 * 86400e3);
  const bad = [
    exc({ expiresAt: '2026-11-30T00:00:00Z' }),                          // expired
    exc({ expiresAt: '2027-12-01T00:00:00Z' }),                          // longer than 12 months
    exc({ approvedAt: '2026-12-15T00:00:00Z', expiresAt: '2027-06-01T00:00:00Z' }), // not yet approved
    exc({ jurisdiction: 'uk' }), exc({ purpose: 'statistics' }), exc({ ruleId: 'eu.attribution.li@2' }),
    exc({ legalBasis: 'consent' }), exc({ expiresAt: 'never' }),
  ];
  for (const e of bad) assert.equal(run({ exceptions: [e] }).outcome, 'needs_opt_in', JSON.stringify(e));
});

test('a relaxable rule below approved_internal never relaxes, not even on a test site', () => {
  for (const status of ['draft', 'reviewed_agent', 'suspended']) {
    const d = run({ pack: pack([{ ...RELAX, status, approval: null }]), exceptions: [exc()], testSite: true });
    assert.equal(d.outcome, 'needs_opt_in', status);
  }
});

test('hard floor: EU cross-site identifiers need opt-in even with an exception', () => {
  const cross = { ...RELAX, technique: { storage: 'persistent', identifiers: 'cross_site' } };
  const d = run({ pack: pack([cross]), exceptions: [exc()], technique: { storage: 'persistent', identifiers: 'cross_site' } });
  assert.deepEqual([d.outcome, d.ruleIds], ['needs_opt_in', ['floor.eu_cross_site']]);
});

test('customer tightening: opt_in raises, off blocks even with consent', () => {
  const statsPack = pack([approve(PACK.rules[0])]);
  const base = { purpose: 'statistics', technique: { storage: 'none', identifiers: 'none' }, pack: statsPack };
  assert.equal(run(base).outcome, 'allowed_unless_opt_out');
  const optIn = run({ ...base, tighten: { statistics: 'opt_in' } });
  assert.deepEqual([optIn.outcome, optIn.reason, optIn.ruleIds.includes('tighten.opt_in')], ['needs_opt_in', 'consent_missing', true]);
  const off = run({ ...base, tighten: { statistics: 'off' }, signals: { consent: { analytics: true, marketing: true }, evidence: 'ledger', gpc: false } });
  assert.deepEqual([off.outcome, off.permit, off.reason], ['blocked', false, 'customer_off']);
  assert.equal(run({ ...base, tighten: { conversion: 'off' } }).outcome, 'allowed_unless_opt_out', 'other purpose untouched');
});

test('AC4: a relax attempt through tighten has no effect', () => {
  for (const value of ['allowed', 'relax', 'allowed_unless_opt_out', 'default', '', null, 42]) {
    const d = run({ purpose: 'statistics', technique: { storage: 'session', identifiers: 'session' }, tighten: { statistics: value } });
    assert.deepEqual([d.outcome, d.permit], ['needs_opt_in', false], String(value));
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/foundation/jurisdiction-exceptions.test.mjs`
Expected: FAIL: `MAX_EXCEPTION_MS` is undefined, the valid exception case returns `needs_opt_in`, and `tighten` is ignored.

- [ ] **Step 3: Add exceptions and the EU floor to `decide.ts`**

Change the type import line and add the constant and helper below `lawApplies`:

```ts
import { IDENT_RANK, OUTCOME_RANK, PRODUCTION_STATUSES, STORAGE_RANK } from './types.ts';

// Spec: an exception expires at most 12 months after approval (366 days covers a leap year).
export const MAX_EXCEPTION_MS = 366 * 86400e3;

function hasException(rule: Rule, market: Market, input: DecideInput, now: number): boolean {
  return input.exceptions.some((e) => {
    const approved = Date.parse(e.approvedAt);
    const expires = Date.parse(e.expiresAt);
    return e.ruleId === ruleKey(rule) && e.jurisdiction === market && e.purpose === input.purpose
      && !!e.legalBasis && e.legalBasis === rule.requiredLegalBasis
      && Number.isFinite(approved) && Number.isFinite(expires)
      && approved <= now && now < expires && expires - approved <= MAX_EXCEPTION_MS;
  });
}
```

In `marketOutcome`, replace `return { outcome, ruleId };` with:

```ts
  // Relaxing: only an approved relaxable variant, chosen by a valid exception. Never draft, never on a test-site pass.
  const relaxed = candidates.filter((r) => r.relaxable && PRODUCTION_STATUSES.includes(r.status)
    && OUTCOME_RANK[r.outcome] < OUTCOME_RANK[outcome] && hasException(r, market, input, now));
  if (relaxed.length) {
    const loosest = relaxed.reduce((a, b) => (OUTCOME_RANK[b.outcome] < OUTCOME_RANK[a.outcome] ? b : a));
    outcome = loosest.outcome; ruleId = ruleKey(loosest);
  }
  // Hard floor: cross-site identifiers in the EU always need opt-in.
  if (market === 'eu' && input.technique.identifiers === 'cross_site' && OUTCOME_RANK[outcome] < OUTCOME_RANK.needs_opt_in) {
    outcome = 'needs_opt_in'; ruleId = 'floor.eu_cross_site';
  }
  return { outcome, ruleId };
```

- [ ] **Step 4: Add customer tightening to `decide()`**

Directly after the `for (const m of markets)` loop, insert:

```ts
  // The customer can only tighten. Unknown values (including any attempt to relax) are ignored.
  const t = input.tighten?.[input.purpose];
  let customerOff = false;
  if (t === 'opt_in' && OUTCOME_RANK[outcome] < OUTCOME_RANK.needs_opt_in) { outcome = 'needs_opt_in'; ruleIds.push('tighten.opt_in'); }
  else if (t === 'off') { outcome = 'blocked'; customerOff = true; ruleIds.push('tighten.off'); }
```

and change the first branch of the permit logic to:

```ts
  if (outcome === 'blocked') reason = customerOff ? 'customer_off' : 'rule_blocked';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/foundation/jurisdiction-exceptions.test.mjs tests/foundation/jurisdiction-decide.test.mjs`
Expected: PASS (both files).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/jurisdiction/decide.ts tests/foundation/jurisdiction-exceptions.test.mjs
git commit -m "feat(jurisdiction): approved exceptions, EU cross-site floor, tighten-only customer settings"
```

---

### Task 5: Customer profile and the module barrel

**Files:**
- Create: `supabase/functions/_shared/jurisdiction/profile.ts`
- Create: `supabase/functions/_shared/jurisdiction/index.ts`
- Test: `tests/foundation/jurisdiction-profile.test.mjs`

**Interfaces:**
- Consumes: Tasks 1-4.
- Produces: `DISCLAIMER: string`, `PROFILE_QUESTIONS: readonly ProfileQuestion[]` with `ProfileQuestion = { key: string; market: Market; text: string; help: string; references: readonly { title: string; ref: string }[] }`, `ProfileRow = { establishment_country: string | null; markets: unknown; answers: unknown }`, `profileToCustomer(row: ProfileRow | null): CustomerProfile | null`. `index.ts` re-exports everything from `types.ts`, `markets.ts`, `baseline.ts`, `packs.ts`, `decide.ts`, `profile.ts`.

- [ ] **Step 1: Write the failing test**

```js
// tests/foundation/jurisdiction-profile.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { profileToCustomer, PROFILE_QUESTIONS, DISCLAIMER, decide, PACK } from '../../supabase/functions/_shared/jurisdiction/index.ts';

const BANNED = [/no consent needed/i, /gdpr[- ]compliant without consent/i, /no banner needed/i];

test('profileToCustomer: null stays null (fail closed to the strictest default)', () => {
  assert.equal(profileToCustomer(null), null);
});

test('profileToCustomer: unknown markets dropped, establishment market added, answers normalised', () => {
  const c = profileToCustomer({ establishment_country: 'se', markets: ['us_ca', 'mars', 7], answers: { us_ccpa: 'maybe', x: 'no' } });
  assert.deepEqual(c, { establishment: 'SE', markets: ['us_ca', 'eu'], appliesLaws: { us_ccpa: 'dont_know', x: 'no' } });
  const junk = profileToCustomer({ establishment_country: null, markets: 'eu', answers: [] });
  assert.deepEqual(junk, { establishment: null, markets: [], appliesLaws: {} });
});

test('"dont_know" counts as the law applying (stricter)', () => {
  const lawRule = { ...PACK.rules[0], id: 'us.law', markets: ['us_ca'], outcome: 'blocked', law: 'us_ccpa', status: 'approved_internal',
    approval: { approvedBy: 't', approvedAt: '2026-11-01', reviewDue: '2027-01-31' } };
  const customer = profileToCustomer({ establishment_country: 'US', markets: ['us_ca'], answers: { us_ccpa: 'dont_know' } });
  const d = decide({ visitor: { country: 'US', region: 'CA', geoSource: 'ip' }, customer, purpose: 'statistics',
    signals: { consent: { analytics: true, marketing: true }, evidence: 'ledger', gpc: false },
    technique: { storage: 'none', identifiers: 'none' }, exceptions: [], now: new Date('2026-12-01'), pack: { version: 't', rules: [lawRule] } });
  assert.equal(d.outcome, 'blocked');
});

test('profile questions: one CCPA question with references, no legal conclusions, disclaimer present', () => {
  assert.deepEqual(PROFILE_QUESTIONS.map((q) => [q.key, q.market]), [['us_ccpa', 'us_ca']]);
  for (const q of PROFILE_QUESTIONS) {
    assert.ok(q.references.length > 0);
    assert.match(q.help, /I don't know/);
    for (const re of BANNED) assert.doesNotMatch(q.text + q.help, re);
  }
  assert.equal(DISCLAIMER, "These are CortIQ's technical defaults, not legal advice.");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/foundation/jurisdiction-profile.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `index.ts`.

- [ ] **Step 3: Write `profile.ts`**

```ts
// supabase/functions/_shared/jurisdiction/profile.ts
// The site's legal profile. Missing or "don't know" answers count as the law applying (stricter).
import { MARKETS } from './types.ts';
import type { Answer, CustomerProfile, Market } from './types.ts';
import { marketOf } from './markets.ts';

export const DISCLAIMER = "These are CortIQ's technical defaults, not legal advice.";

export interface ProfileQuestion { key: string; market: Market; text: string; help: string; references: readonly { title: string; ref: string }[] }
export const PROFILE_QUESTIONS: readonly ProfileQuestion[] = [{
  key: 'us_ccpa', market: 'us_ca',
  text: 'Does your business meet the applicability thresholds of the CCPA/CPRA?',
  help: "If you are unsure, choose \"I don't know\". CortIQ then applies the stricter default for California visitors.",
  references: [
    { title: 'Cal. Civ. Code § 1798.140(d) (definition of "business")', ref: 'https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=1798.140' },
    { title: 'California Privacy Protection Agency', ref: 'https://cppa.ca.gov/' },
  ],
}];

export interface ProfileRow { establishment_country: string | null; markets: unknown; answers: unknown }
const ANSWERS: readonly Answer[] = ['yes', 'no', 'dont_know'];

export function profileToCustomer(row: ProfileRow | null): CustomerProfile | null {
  if (!row) return null;
  const est = typeof row.establishment_country === 'string' && /^[A-Za-z]{2}$/.test(row.establishment_country)
    ? row.establishment_country.toUpperCase() : null;
  const markets: Market[] = Array.isArray(row.markets)
    ? row.markets.filter((m): m is Market => typeof m === 'string' && (MARKETS as readonly string[]).includes(m)) : [];
  const estMarket = est ? marketOf(est, null) : null;
  if (estMarket && !markets.includes(estMarket)) markets.push(estMarket);
  const appliesLaws: Record<string, Answer> = {};
  if (row.answers && typeof row.answers === 'object' && !Array.isArray(row.answers)) {
    for (const [k, v] of Object.entries(row.answers as Record<string, unknown>)) {
      appliesLaws[k] = ANSWERS.includes(v as Answer) ? (v as Answer) : 'dont_know';
    }
  }
  return { establishment: est, markets: [...new Set(markets)], appliesLaws };
}
```

- [ ] **Step 4: Write `index.ts`**

```ts
// supabase/functions/_shared/jurisdiction/index.ts
export * from './types.ts';
export * from './markets.ts';
export * from './baseline.ts';
export * from './packs.ts';
export * from './decide.ts';
export * from './profile.ts';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/foundation/jurisdiction-*.test.mjs`
Expected: PASS (all five files).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/jurisdiction/profile.ts supabase/functions/_shared/jurisdiction/index.ts tests/foundation/jurisdiction-profile.test.mjs
git commit -m "feat(jurisdiction): site legal profile mapping and module barrel"
```

---

### Task 6: Remove the legacy `_shared/jurisdiction.ts` (AC1, code part)

**Files:**
- Create: `supabase/functions/_shared/ip.ts`
- Delete: `supabase/functions/_shared/jurisdiction.ts`
- Modify: `supabase/functions/ai-bot-tracker/index.ts:3`, `supabase/functions/canary-tracker/index.ts`, `supabase/functions/server-hit/index.ts`, `supabase/functions/store-consent/index.ts`, `supabase/functions/track-event/index.ts` (import line only)
- Modify: `supabase/functions/_shared/bot-detection.ts` (remove `detectAndRecordBot`, `recordBotDetection` and the `PipelineMode` import; keep `deriveUACategory`, which canary-tracker uses)
- Test: `tests/foundation/jurisdiction-legacy-removed.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `anonymizeIP(ip: string | null): string | null` from `supabase/functions/_shared/ip.ts`, same behaviour as before.

Background: only `anonymizeIP` is live. `getPipelineMode`, `PIPELINE_RULES`, `sanitizeForMode` and `EU_COUNTRIES` have no caller; `detectAndRecordBot` in bot-detection.ts has no caller either (its own comment says so).

- [ ] **Step 1: Write the failing test**

```js
// tests/foundation/jurisdiction-legacy-removed.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { anonymizeIP } from '../../supabase/functions/_shared/ip.ts';

const FN = fileURLToPath(new URL('../../supabase/functions/', import.meta.url));
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });

test('anonymizeIP keeps the network part only', () => {
  assert.equal(anonymizeIP('203.0.113.9'), '203.0.113.0');
  assert.equal(anonymizeIP('203.0.113.9, 10.0.0.1'), '203.0.113.0');
  assert.equal(anonymizeIP('2001:db8:85a3:8d3:1319:8a2e:370:7348'), '2001:db8:85a3:0:0:0:0:0');
  assert.equal(anonymizeIP(null), null);
  assert.equal(anonymizeIP('garbage'), null);
});

test('AC1: the old jurisdiction module and pipeline modes are gone', () => {
  assert.equal(existsSync(join(FN, '_shared', 'jurisdiction.ts')), false);
  for (const f of walk(FN).filter((p) => p.endsWith('.ts'))) {
    const src = readFileSync(f, 'utf8');
    assert.doesNotMatch(src, /_shared\/jurisdiction\.ts|from '\.\/jurisdiction\.ts'/, f);
    assert.doesNotMatch(src, /PipelineMode|getPipelineMode|sanitizeForMode|effective_pipeline_mode/, f);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/foundation/jurisdiction-legacy-removed.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `ip.ts`.

- [ ] **Step 3: Create `ip.ts` (body copied verbatim from `jurisdiction.ts` lines 163-175)**

```ts
// supabase/functions/_shared/ip.ts
/** Anonymize an IPv4 or IPv6 address by zeroing the host portion. */
export function anonymizeIP(ip: string | null): string | null {
  if (!ip) return null;
  const first = ip.split(',')[0].trim();
  if (first.includes(':')) {
    // IPv6 — keep first 3 groups
    const parts = first.split(':');
    return parts.slice(0, 3).concat(['0', '0', '0', '0', '0']).join(':');
  }
  const octets = first.split('.');
  if (octets.length === 4) return `${octets[0]}.${octets[1]}.${octets[2]}.0`;
  return null;
}
```

- [ ] **Step 4: Point the five importers at `ip.ts` and delete the old file**

In each of `ai-bot-tracker`, `canary-tracker`, `server-hit`, `store-consent`, `track-event` `index.ts`, replace the import line that reads `from "../_shared/jurisdiction.ts"` (or single-quoted) with:

```ts
import { anonymizeIP } from "../_shared/ip.ts";
```

If a file imports anything else from `jurisdiction.ts`, that import is dead (verify with `grep -n "getPipelineMode\|sanitizeForMode\|PIPELINE_RULES\|EU_COUNTRIES\|getVisitorCountry" supabase/functions -r`, which must print nothing outside `_shared/jurisdiction.ts` and `_shared/bot-detection.ts`).

In `supabase/functions/_shared/bot-detection.ts`: delete the two import lines from `./jurisdiction.ts`, delete `recordBotDetection` and `detectAndRecordBot` with their doc comments, and delete any helper that is then unused (`matchBot`, `behavioralCheck` and the `resolveGeo` import only if `grep` shows no other use in the file). Keep `deriveUACategory`. Update the usage example in the file header to name `deriveUACategory`.

```bash
git rm supabase/functions/_shared/jurisdiction.ts
```

- [ ] **Step 5: Remove the stale "jurisdiction mode" copy**

`src/components/dashboard/IPSegmentManager.tsx` names modes that no longer exist. Replace line 428 with:

```tsx
            Only the segment name is stored with the event, never the raw IP address.
```

and replace lines 443-444 (the end of the "How it works" sentence) with:

```tsx
            written into the event record — not the IP address.
```

- [ ] **Step 6: Run tests**

Run: `npm run test:foundation`
Expected: PASS. No existing test references `detectAndRecordBot` or `_shared/jurisdiction.ts` (checked 2026-11-20).

- [ ] **Step 7: Commit**

```bash
git add -A supabase/functions tests/foundation/jurisdiction-legacy-removed.test.mjs src/components/dashboard/IPSegmentManager.tsx
git commit -m "refactor(jurisdiction): move anonymizeIP to _shared/ip.ts, delete the dead pipeline-mode module"
```

---

### Task 7: Migration 1: profile, tightening, exceptions, test sites, policy RPC

**Files:**
- Create: `supabase/migrations/20261207000001_jurisdiction_profile.sql`
- Create: `tests/foundation/jurisdiction-db-fixture.mjs`
- Test: `tests/foundation/jurisdiction-profile-db.test.mjs`

**Interfaces:**
- Consumes: `public.sites(id, user_id)`, `public.has_role(uuid, app_role)`, `auth.uid()`.
- Produces:
  - Tables `site_legal_profiles(site_id PK, establishment_country, markets text[], answers jsonb, answered_by, answered_at)`, `site_legal_profile_log(id, site_id, establishment_country, markets, answers, legacy_jurisdiction, changed_by, changed_at)`, `site_jurisdiction_tighten(site_id, purpose, setting, set_by, set_at, PK(site_id, purpose))`, `jurisdiction_exceptions(id, site_id, rule_id, jurisdiction, purpose, legal_basis, assessment_ref, approved_by, approved_at, expires_at)`, `jurisdiction_test_sites(site_id PK, flagged_by, flagged_at, note)`.
  - `save_site_legal_profile(p_site_id uuid, p_establishment text, p_markets text[], p_answers jsonb) RETURNS void` (authenticated, owner only).
  - `get_site_jurisdiction(p_site_id uuid) RETURNS jsonb` (service_role only) with shape `{ profile: {establishment_country, markets, answers} | null, tighten: {<purpose>: 'opt_in'|'off'}, exceptions: ApprovedException[] (camelCase keys, unexpired only), testSite: boolean }`.
  - Fixture exports `OWNER`, `OTHER`, `ADMIN`, `S1`, `S2`, `jurisdictionDb()`, `asUser(pg, userId, fn)`, `read(path)`.

- [ ] **Step 1: Write the fixture**

```js
// tests/foundation/jurisdiction-db-fixture.mjs
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

export const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const ADMIN = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
export const S1 = '11111111-1111-4111-8111-111111111111';
export const S2 = '22222222-2222-4222-8222-222222222222';
export const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

export async function jurisdictionDb(extraSql = '') {
  const pg = new PGlite();
  await pg.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TYPE public.app_role AS ENUM ('admin', 'user');
    CREATE TABLE public.user_roles (user_id uuid, role public.app_role);
    CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;
    CREATE TABLE public.sites (id uuid PRIMARY KEY, user_id uuid, domain text, is_active boolean DEFAULT true);
    INSERT INTO public.sites VALUES ('${S1}', '${OWNER}', 'one.se', true), ('${S2}', '${OTHER}', 'two.se', true);
    INSERT INTO public.user_roles VALUES ('${ADMIN}', 'admin');
    ${extraSql}`);
  await pg.exec(read('../../supabase/migrations/20261207000001_jurisdiction_profile.sql'));
  await pg.exec(`GRANT USAGE ON SCHEMA public, auth TO authenticated, service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;`);
  return pg;
}

export async function asUser(pg, userId, fn) {
  await pg.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${userId}', false);`);
  try { return await fn(); } finally { await pg.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', false);`); }
}
```

- [ ] **Step 2: Write the failing test**

```js
// tests/foundation/jurisdiction-profile-db.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jurisdictionDb, asUser, OWNER, OTHER, ADMIN, S1, S2 } from './jurisdiction-db-fixture.mjs';

const save = (pg, site, est, markets, answers) => pg.query(
  'SELECT public.save_site_legal_profile($1, $2, $3, $4::jsonb)', [site, est, markets, JSON.stringify(answers)]);

test('profile: owner saves through the RPC, each save is logged, others are refused', async () => {
  const pg = await jurisdictionDb();
  try {
    await asUser(pg, OWNER, () => save(pg, S1, 'se', ['eu', 'us_ca'], { us_ccpa: 'dont_know' }));
    await asUser(pg, OWNER, () => save(pg, S1, 'SE', ['eu'], {}));
    const row = (await pg.query(`SELECT establishment_country, markets, answers FROM site_legal_profiles WHERE site_id = '${S1}'`)).rows[0];
    assert.deepEqual(row, { establishment_country: 'SE', markets: ['eu'], answers: {} });
    assert.equal(Number((await pg.query(`SELECT count(*) n FROM site_legal_profile_log WHERE site_id = '${S1}'`)).rows[0].n), 2);
    await assert.rejects(asUser(pg, OTHER, () => save(pg, S1, 'SE', ['eu'], {})), /not_owner/);
    await assert.rejects(asUser(pg, OWNER, () => save(pg, S1, 'SE', ['mars'], {})), /check/i);
    await assert.rejects(asUser(pg, OWNER, () => save(pg, S1, 'SE', ['eu'], { us_ccpa: 'maybe' })), /invalid_answers/);
    await assert.rejects(asUser(pg, OWNER, () => pg.query(`INSERT INTO site_legal_profiles (site_id) VALUES ('${S1}')`)), /policy|permission/i);
    const seen = await asUser(pg, OTHER, () => pg.query('SELECT * FROM site_legal_profiles'));
    assert.equal(seen.rows.length, 0, 'RLS hides other owners');
  } finally { await pg.close(); }
});

test('tightening: owner can set opt_in/off only, never a relaxing value; RLS per owner', async () => {
  const pg = await jurisdictionDb();
  try {
    await asUser(pg, OWNER, () => pg.query(`INSERT INTO site_jurisdiction_tighten (site_id, purpose, setting) VALUES ('${S1}', 'statistics', 'opt_in')`));
    await assert.rejects(asUser(pg, OWNER, () => pg.query(`INSERT INTO site_jurisdiction_tighten (site_id, purpose, setting) VALUES ('${S1}', 'conversion', 'allowed')`)), /check/i);
    await assert.rejects(asUser(pg, OWNER, () => pg.query(`INSERT INTO site_jurisdiction_tighten (site_id, purpose, setting) VALUES ('${S2}', 'statistics', 'off')`)), /policy/i);
    const rows = await asUser(pg, OWNER, () => pg.query('SELECT set_by FROM site_jurisdiction_tighten'));
    assert.deepEqual(rows.rows, [{ set_by: OWNER }]);
  } finally { await pg.close(); }
});

test('exceptions: no customer write path, at most 12 months; test sites admin-only', async () => {
  const pg = await jurisdictionDb();
  try {
    const ins = (months) => pg.query(`INSERT INTO jurisdiction_exceptions (site_id, rule_id, jurisdiction, purpose, legal_basis, assessment_ref, approved_by, approved_at, expires_at)
      VALUES ('${S1}', 'eu.attribution.li@1', 'eu', 'attribution', 'legitimate_interest', 'LIA-1', '${ADMIN}', '2026-11-01', '2026-11-01'::timestamptz + interval '${months} months')`);
    await assert.rejects(asUser(pg, OWNER, () => ins(6)), /policy/i);
    await assert.rejects(ins(13), /check/i);
    await ins(12);
    await assert.rejects(asUser(pg, OWNER, () => pg.query(`INSERT INTO jurisdiction_test_sites (site_id) VALUES ('${S1}')`)), /policy/i);
    await asUser(pg, ADMIN, () => pg.query(`INSERT INTO jurisdiction_test_sites (site_id) VALUES ('${S1}')`));
    assert.equal((await asUser(pg, OWNER, () => pg.query('SELECT * FROM jurisdiction_test_sites'))).rows.length, 0);
  } finally { await pg.close(); }
});

test('get_site_jurisdiction: service role only, unexpired exceptions only, null profile when unanswered', async () => {
  const pg = await jurisdictionDb();
  try {
    const empty = (await pg.query(`SELECT public.get_site_jurisdiction('${S2}') j`)).rows[0].j;
    assert.deepEqual(empty, { profile: null, tighten: {}, exceptions: [], testSite: false });
    await asUser(pg, OWNER, () => save(pg, S1, 'SE', ['eu'], { us_ccpa: 'no' }));
    await pg.exec(`INSERT INTO site_jurisdiction_tighten (site_id, purpose, setting) VALUES ('${S1}', 'statistics', 'off');
      INSERT INTO jurisdiction_test_sites (site_id) VALUES ('${S1}');
      INSERT INTO jurisdiction_exceptions (site_id, rule_id, jurisdiction, purpose, legal_basis, assessment_ref, approved_by, approved_at, expires_at) VALUES
        ('${S1}', 'eu.a@1', 'eu', 'attribution', 'lb', 'A', '${ADMIN}', now() - interval '1 day', now() + interval '30 days'),
        ('${S1}', 'eu.b@1', 'eu', 'attribution', 'lb', 'B', '${ADMIN}', now() - interval '60 days', now() - interval '1 day');`);
    const j = (await pg.query(`SELECT public.get_site_jurisdiction('${S1}') j`)).rows[0].j;
    assert.deepEqual(j.profile, { establishment_country: 'SE', markets: ['eu'], answers: { us_ccpa: 'no' } });
    assert.deepEqual(j.tighten, { statistics: 'off' });
    assert.deepEqual(j.exceptions.map((e) => [e.ruleId, e.jurisdiction, e.purpose, e.legalBasis]), [['eu.a@1', 'eu', 'attribution', 'lb']]);
    assert.equal(j.testSite, true);
    for (const role of ['anon', 'authenticated']) {
      const g = (await pg.query(`SELECT has_function_privilege('${role}', 'public.get_site_jurisdiction(uuid)', 'EXECUTE') a`)).rows[0].a;
      assert.equal(g, false, role);
    }
  } finally { await pg.close(); }
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test tests/foundation/jurisdiction-profile-db.test.mjs`
Expected: FAIL with `ENOENT` for `20261207000001_jurisdiction_profile.sql`.

- [ ] **Step 4: Write the migration**

```sql
-- supabase/migrations/20261207000001_jurisdiction_profile.sql
-- Spec 2026-11-18 phase 3: per-site legal profile, tighten-only settings, approved exceptions, admin test sites.
-- The engine reads all of it through get_site_jurisdiction (service role). Technical defaults, not legal advice.

CREATE TABLE public.site_legal_profiles (
  site_id uuid PRIMARY KEY REFERENCES public.sites(id) ON DELETE CASCADE,
  establishment_country text CHECK (establishment_country IS NULL OR establishment_country ~ '^[A-Z]{2}$'),
  markets text[] NOT NULL DEFAULT '{}'
    CHECK (markets <@ ARRAY['eu','uk','ch','us_ca','us_other','ca_qc','ca_other','br','other']::text[]),
  answers jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(answers) = 'object'),
  answered_by uuid,
  answered_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.site_legal_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY site_legal_profiles_owner_select ON public.site_legal_profiles FOR SELECT TO authenticated
  USING (site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid()));

CREATE TABLE public.site_legal_profile_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  establishment_country text, markets text[], answers jsonb,
  legacy_jurisdiction text,          -- companies.jurisdiction at migration time (Task 8); never read by the engine
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.site_legal_profile_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY site_legal_profile_log_owner_select ON public.site_legal_profile_log FOR SELECT TO authenticated
  USING (site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.save_site_legal_profile(p_site_id uuid, p_establishment text, p_markets text[], p_answers jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_est text := upper(nullif(trim(coalesce(p_establishment, '')), ''));
  v_markets text[] := coalesce(p_markets, '{}');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sites WHERE id = p_site_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not_owner' USING ERRCODE = '42501';
  END IF;
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' OR EXISTS (
    SELECT 1 FROM jsonb_each(p_answers) e WHERE e.value NOT IN ('"yes"'::jsonb, '"no"'::jsonb, '"dont_know"'::jsonb)) THEN
    RAISE EXCEPTION 'invalid_answers' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.site_legal_profiles (site_id, establishment_country, markets, answers, answered_by, answered_at)
  VALUES (p_site_id, v_est, v_markets, p_answers, auth.uid(), now())
  ON CONFLICT (site_id) DO UPDATE SET establishment_country = EXCLUDED.establishment_country, markets = EXCLUDED.markets,
    answers = EXCLUDED.answers, answered_by = EXCLUDED.answered_by, answered_at = EXCLUDED.answered_at;
  INSERT INTO public.site_legal_profile_log (site_id, establishment_country, markets, answers, changed_by)
  VALUES (p_site_id, v_est, v_markets, p_answers, auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.save_site_legal_profile(uuid, text, text[], jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_site_legal_profile(uuid, text, text[], jsonb) TO authenticated;

-- Tighten only: no row = rule default. There is no value that relaxes.
CREATE TABLE public.site_jurisdiction_tighten (
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('statistics','conversion','attribution','ad_platform_sharing','security')),
  setting text NOT NULL CHECK (setting IN ('opt_in','off')),
  set_by uuid DEFAULT auth.uid(),
  set_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, purpose)
);
ALTER TABLE public.site_jurisdiction_tighten ENABLE ROW LEVEL SECURITY;
CREATE POLICY site_jurisdiction_tighten_owner ON public.site_jurisdiction_tighten FOR ALL TO authenticated
  USING (site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid()))
  WITH CHECK (site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid()));

-- Approved exceptions. Phase 3 has no write path (no policy for writes); phase 4 adds the approval screen.
CREATE TABLE public.jurisdiction_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  rule_id text NOT NULL CHECK (rule_id ~ '^[a-z0-9_.]+@[0-9]+$' AND length(rule_id) <= 200),
  jurisdiction text NOT NULL CHECK (jurisdiction IN ('eu','uk','ch','us_ca','us_other','ca_qc','ca_other','br','other')),
  purpose text NOT NULL CHECK (purpose IN ('statistics','conversion','attribution','ad_platform_sharing','security')),
  legal_basis text NOT NULL CHECK (length(legal_basis) BETWEEN 1 AND 100),
  assessment_ref text NOT NULL CHECK (length(assessment_ref) BETWEEN 1 AND 200),
  approved_by uuid NOT NULL,
  approved_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  CHECK (expires_at > approved_at AND expires_at <= approved_at + interval '12 months')
);
ALTER TABLE public.jurisdiction_exceptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY jurisdiction_exceptions_owner_select ON public.jurisdiction_exceptions FOR SELECT TO authenticated
  USING (site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid()));

-- Sites where draft and reviewed_agent rules run (spec: draft = unit tests and admin-flagged test sites).
CREATE TABLE public.jurisdiction_test_sites (
  site_id uuid PRIMARY KEY REFERENCES public.sites(id) ON DELETE CASCADE,
  flagged_by uuid DEFAULT auth.uid(),
  flagged_at timestamptz NOT NULL DEFAULT now(),
  note text CHECK (note IS NULL OR length(note) <= 200)
);
ALTER TABLE public.jurisdiction_test_sites ENABLE ROW LEVEL SECURITY;
CREATE POLICY jurisdiction_test_sites_admin ON public.jurisdiction_test_sites FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.get_site_jurisdiction(p_site_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'profile', (SELECT jsonb_build_object('establishment_country', p.establishment_country, 'markets', to_jsonb(p.markets), 'answers', p.answers)
                FROM public.site_legal_profiles p WHERE p.site_id = p_site_id),
    'tighten', coalesce((SELECT jsonb_object_agg(t.purpose, t.setting) FROM public.site_jurisdiction_tighten t WHERE t.site_id = p_site_id), '{}'::jsonb),
    'exceptions', coalesce((SELECT jsonb_agg(jsonb_build_object('ruleId', e.rule_id, 'jurisdiction', e.jurisdiction, 'purpose', e.purpose,
                   'legalBasis', e.legal_basis, 'assessmentRef', e.assessment_ref, 'approvedBy', e.approved_by::text,
                   'approvedAt', e.approved_at, 'expiresAt', e.expires_at) ORDER BY e.approved_at)
                FROM public.jurisdiction_exceptions e WHERE e.site_id = p_site_id AND e.expires_at > now()), '[]'::jsonb),
    'testSite', EXISTS (SELECT 1 FROM public.jurisdiction_test_sites s WHERE s.site_id = p_site_id));
$$;
REVOKE ALL ON FUNCTION public.get_site_jurisdiction(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_site_jurisdiction(uuid) TO service_role;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/foundation/jurisdiction-profile-db.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261207000001_jurisdiction_profile.sql tests/foundation/jurisdiction-db-fixture.mjs tests/foundation/jurisdiction-profile-db.test.mjs
git commit -m "feat(jurisdiction): site legal profile, tighten-only settings, exceptions table, policy RPC"
```

---

### Task 8: Migration 2: decision log, retention, legacy column removal (AC1, DB part)

**Files:**
- Create: `supabase/migrations/20261207000002_jurisdiction_decisions.sql`
- Modify: `src/integrations/supabase/types.ts` (remove `auto_eu_geo_override` and `jurisdiction` from the `companies` Row/Insert/Update blocks, around lines 2541-2570; remove `effective_pipeline_mode` from `Functions`; add the new tables and RPCs from Tasks 7, 8)
- Test: `tests/foundation/jurisdiction-decisions-db.test.mjs`

**Interfaces:**
- Consumes: Task 7 migration and fixture.
- Produces:
  - Table `jurisdiction_decisions_daily(site_id, day, fn, purpose, country, rule_id, outcome, reason, evidence, enforced, count, PRIMARY KEY (site_id, day, fn, purpose, country, rule_id, outcome, reason, evidence, enforced))`.
  - `log_jurisdiction_decision(p_site_id uuid, p_fn text, p_purpose text, p_country text, p_rule_id text, p_outcome text, p_reason text, p_evidence text, p_enforced boolean, p_count integer DEFAULT 1, p_now timestamptz DEFAULT now()) RETURNS void` (service_role only).
  - `jurisdiction_decisions_retention() RETURNS integer` (deletes rows older than 400 days), cron `jurisdiction-decisions-retention` at `50 4 * * *`.
  - `conversion_events.upload_status` accepts `'skipped_jurisdiction'`.
  - `companies.jurisdiction`, `companies.auto_eu_geo_override` and `public.effective_pipeline_mode(uuid, text)` no longer exist. Old values are kept as `site_legal_profile_log.legacy_jurisdiction` rows.
  - Function names allowed in `fn`: `aggregate-hit`, `server-hit`, `ai-bot-tracker`, `track-event`, `visitor-identification`, `record-conversion`, `store-consent`, `google-ads-quality-upload`.

- [ ] **Step 1: Write the failing test**

```js
// tests/foundation/jurisdiction-decisions-db.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jurisdictionDb, asUser, read, OWNER, OTHER, S1, S2 } from './jurisdiction-db-fixture.mjs';

const LEGACY = `
  CREATE TABLE public.companies (id uuid PRIMARY KEY, jurisdiction text NOT NULL DEFAULT 'eu_strict', auto_eu_geo_override boolean NOT NULL DEFAULT true);
  INSERT INTO public.companies VALUES ('${OWNER}', 'permissive', false), ('${OTHER}', 'eu_strict', true);
  CREATE FUNCTION public.effective_pipeline_mode(p_company_id uuid, p_visitor_country text DEFAULT NULL) RETURNS text LANGUAGE sql AS $$ SELECT 'x' $$;
  CREATE TABLE public.conversion_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id uuid, upload_status text);
  ALTER TABLE public.conversion_events ADD CONSTRAINT conversion_events_upload_status_check CHECK (upload_status IN (
    'not_applicable','pending','uploading','uploaded','skipped_no_consent','skipped_no_gclid','failed'));`;

async function db() {
  const pg = await jurisdictionDb(LEGACY);
  await pg.exec(read('../../supabase/migrations/20261207000002_jurisdiction_decisions.sql'));
  await pg.exec('GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;');
  return pg;
}
const log = (pg, over = {}) => {
  const a = { site: S1, fn: 'aggregate-hit', purpose: 'statistics', country: 'SE', rule: 'baseline.statistics', outcome: 'needs_opt_in',
    reason: 'consent_missing', evidence: 'none', enforced: false, count: 1, now: '2026-11-20T10:00:00Z', ...over };
  return pg.query('SELECT public.log_jurisdiction_decision($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
    [a.site, a.fn, a.purpose, a.country, a.rule, a.outcome, a.reason, a.evidence, a.enforced, a.count, a.now]);
};

test('decision log: daily counts only, same key adds up, owner RLS', async () => {
  const pg = await db();
  try {
    await log(pg); await log(pg); await log(pg, { count: 5 });
    await log(pg, { country: 'xx' });            // invalid → '' (unknown)
    await log(pg, { site: S2 });
    const rows = (await pg.query(`SELECT country, count FROM jurisdiction_decisions_daily WHERE site_id = '${S1}' ORDER BY country`)).rows;
    assert.deepEqual(rows, [{ country: '', count: 1 }, { country: 'SE', count: 7 }]);
    const cols = (await pg.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'jurisdiction_decisions_daily' ORDER BY ordinal_position`)).rows.map((r) => r.column_name);
    assert.deepEqual(cols, ['site_id', 'day', 'fn', 'purpose', 'country', 'rule_id', 'outcome', 'reason', 'evidence', 'enforced', 'count']);
    const mine = await asUser(pg, OWNER, () => pg.query('SELECT DISTINCT site_id FROM jurisdiction_decisions_daily'));
    assert.deepEqual(mine.rows, [{ site_id: S1 }]);
    await assert.rejects(log(pg, { fn: 'evil' }), /check/i);
    await assert.rejects(log(pg, { outcome: 'maybe' }), /check/i);
    // decideAndLog sends ruleIds.join(',') = '' when only the baseline decided; it must still be logged.
    await log(pg, { site: S2, rule: '' });
    await log(pg, { site: S2, rule: null });
    const base = (await pg.query(`SELECT rule_id, count FROM jurisdiction_decisions_daily WHERE site_id = '${S2}' AND rule_id = 'baseline'`)).rows;
    assert.deepEqual(base, [{ rule_id: 'baseline', count: 2 }]);
    for (const role of ['anon', 'authenticated']) {
      const g = (await pg.query(`SELECT has_function_privilege('${role}', 'public.log_jurisdiction_decision(uuid,text,text,text,text,text,text,text,boolean,integer,timestamptz)', 'EXECUTE') a`)).rows[0].a;
      assert.equal(g, false, role);
    }
  } finally { await pg.close(); }
});

test('retention removes rows older than 400 days', async () => {
  const pg = await db();
  try {
    await log(pg, { now: '2025-01-01T00:00:00Z' });
    await log(pg, { now: new Date().toISOString() });
    assert.equal((await pg.query('SELECT public.jurisdiction_decisions_retention() n')).rows[0].n, 1);
    assert.equal(Number((await pg.query('SELECT count(*) n FROM jurisdiction_decisions_daily')).rows[0].n), 1);
  } finally { await pg.close(); }
});

test('AC1: legacy columns and function gone, old values kept as log rows; skipped_jurisdiction allowed', async () => {
  const pg = await db();
  try {
    const cols = (await pg.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'companies'`)).rows.map((r) => r.column_name);
    assert.deepEqual(cols, ['id']);
    assert.equal((await pg.query(`SELECT count(*)::int n FROM pg_proc WHERE proname = 'effective_pipeline_mode'`)).rows[0].n, 0);
    const legacy = (await pg.query('SELECT site_id, legacy_jurisdiction FROM site_legal_profile_log ORDER BY site_id')).rows;
    assert.deepEqual(legacy, [{ site_id: S1, legacy_jurisdiction: 'permissive' }, { site_id: S2, legacy_jurisdiction: 'eu_strict' }]);
    assert.equal((await pg.query('SELECT count(*)::int n FROM site_legal_profiles')).rows[0].n, 0, 'legacy values never become a profile');
    await pg.query(`INSERT INTO conversion_events (site_id, upload_status) VALUES ('${S1}', 'skipped_jurisdiction')`);
    await assert.rejects(pg.query(`INSERT INTO conversion_events (site_id, upload_status) VALUES ('${S1}', 'nope')`), /check/i);
  } finally { await pg.close(); }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/foundation/jurisdiction-decisions-db.test.mjs`
Expected: FAIL with `ENOENT` for `20261207000002_jurisdiction_decisions.sql`.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20261207000002_jurisdiction_decisions.sql
-- Spec 2026-11-18 phase 3: daily counts of every jurisdiction decision (no IP, UA, session, URL or
-- visitor id), and removal of the legacy companies.jurisdiction model (AC1).

CREATE TABLE public.jurisdiction_decisions_daily (
  site_id  uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  day      date NOT NULL,
  fn       text NOT NULL CHECK (fn IN ('aggregate-hit','server-hit','ai-bot-tracker','track-event','visitor-identification',
                                       'record-conversion','store-consent','google-ads-quality-upload')),
  purpose  text NOT NULL CHECK (purpose IN ('statistics','conversion','attribution','ad_platform_sharing','security')),
  country  text NOT NULL DEFAULT '' CHECK (country = '' OR country ~ '^[A-Z]{2}$'),
  rule_id  text NOT NULL CHECK (length(rule_id) BETWEEN 1 AND 200),
  outcome  text NOT NULL CHECK (outcome IN ('allowed','allowed_unless_opt_out','needs_opt_in','blocked')),
  reason   text NOT NULL CHECK (reason IN ('allowed','opt_out','gpc','consent_missing','consent_refused','rule_blocked','customer_off')),
  evidence text NOT NULL CHECK (evidence IN ('ledger','tracker_gate','none')),
  enforced boolean NOT NULL,
  count    integer NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (site_id, day, fn, purpose, country, rule_id, outcome, reason, evidence, enforced)
);
ALTER TABLE public.jurisdiction_decisions_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY jurisdiction_decisions_owner_select ON public.jurisdiction_decisions_daily FOR SELECT TO authenticated
  USING (site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.log_jurisdiction_decision(
  p_site_id uuid, p_fn text, p_purpose text, p_country text, p_rule_id text, p_outcome text, p_reason text,
  p_evidence text, p_enforced boolean, p_count integer DEFAULT 1, p_now timestamptz DEFAULT now())
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_c text := upper(coalesce(trim(p_country), ''));
BEGIN
  IF v_c !~ '^[A-Z]{2}$' OR v_c IN ('XX', 'T1') THEN v_c := ''; END IF;
  INSERT INTO public.jurisdiction_decisions_daily (site_id, day, fn, purpose, country, rule_id, outcome, reason, evidence, enforced, count)
  -- No usable rule = the baseline decided (the common case while nothing is approved); '' would fail the CHECK.
  VALUES (p_site_id, (p_now AT TIME ZONE 'UTC')::date, p_fn, p_purpose, v_c, left(coalesce(nullif(trim(p_rule_id), ''), 'baseline'), 200),
          p_outcome, p_reason, p_evidence, coalesce(p_enforced, false), greatest(coalesce(p_count, 1), 0))
  ON CONFLICT (site_id, day, fn, purpose, country, rule_id, outcome, reason, evidence, enforced)
  DO UPDATE SET count = public.jurisdiction_decisions_daily.count + EXCLUDED.count;
END $$;
REVOKE ALL ON FUNCTION public.log_jurisdiction_decision(uuid, text, text, text, text, text, text, text, boolean, integer, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_jurisdiction_decision(uuid, text, text, text, text, text, text, text, boolean, integer, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.jurisdiction_decisions_retention()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE n integer;
BEGIN
  DELETE FROM public.jurisdiction_decisions_daily WHERE day < (now() AT TIME ZONE 'UTC')::date - 400;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.jurisdiction_decisions_retention() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jurisdiction_decisions_retention() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('jurisdiction-decisions-retention', '50 4 * * *', 'SELECT public.jurisdiction_decisions_retention()');
  END IF;
END $$;

-- AC1: the old account-level model goes. Old values are kept only as history, never as a profile.
INSERT INTO public.site_legal_profile_log (site_id, legacy_jurisdiction, changed_by)
SELECT s.id, c.jurisdiction, NULL FROM public.sites s JOIN public.companies c ON c.id = s.user_id;
DROP FUNCTION IF EXISTS public.effective_pipeline_mode(uuid, text);
ALTER TABLE public.companies DROP COLUMN IF EXISTS auto_eu_geo_override;
ALTER TABLE public.companies DROP COLUMN IF EXISTS jurisdiction;

-- google-ads-quality-upload marks rows the engine refused (enforce mode only).
ALTER TABLE public.conversion_events DROP CONSTRAINT IF EXISTS conversion_events_upload_status_check;
ALTER TABLE public.conversion_events ADD CONSTRAINT conversion_events_upload_status_check CHECK (upload_status IN (
  'not_applicable','pending','uploading','uploaded','skipped_no_consent','skipped_no_gclid','skipped_jurisdiction','failed'));
```

Note on `effective_pipeline_mode` in `20261207000002`: migration `20260923000003_lock_down_security_definer_rpcs.sql` lists it by name; that file has already run and is not edited. Before writing the DROP, run `node --test tests/foundation/*.test.mjs 2>&1 | grep -i effective_pipeline_mode` and remove any test that still names it (none is expected; the grep is the check).

- [ ] **Step 4: Update `types.ts` by hand**

In `src/integrations/supabase/types.ts`:
- In `companies` Row, Insert and Update, delete the `auto_eu_geo_override` and `jurisdiction` lines.
- In `Functions`, delete the `effective_pipeline_mode` entry.
- Add `site_legal_profiles`, `site_legal_profile_log`, `site_jurisdiction_tighten`, `jurisdiction_exceptions`, `jurisdiction_test_sites` and `jurisdiction_decisions_daily` table blocks following the shape of the neighbouring `aggregate_countries_daily` block (Row: every column with its TS type, `string[]` for `markets`, `Json` for `answers`; Insert/Update: same with `?`).
- Add `save_site_legal_profile: { Args: { p_site_id: string; p_establishment: string | null; p_markets: string[]; p_answers: Json }; Returns: undefined }`.

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: no new errors (the build skips tsc, so this is the only type check; see deployment-state memory).

- [ ] **Step 5: Run tests**

Run: `node --test tests/foundation/jurisdiction-decisions-db.test.mjs tests/foundation/jurisdiction-profile-db.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261207000002_jurisdiction_decisions.sql src/integrations/supabase/types.ts tests/foundation/jurisdiction-decisions-db.test.mjs
git commit -m "feat(jurisdiction): daily decision log, retention, drop legacy companies.jurisdiction"
```

---

### Task 9: Edge glue: policy load, consent ledger, enforcement flag, `decideAndLog`

**Files:**
- Create: `supabase/functions/_shared/jurisdiction-edge.ts`
- Test: `tests/foundation/jurisdiction-edge.test.mjs`

**Interfaces:**
- Consumes: `decide`, `profileToCustomer`, `PURPOSES`, `MARKETS`, types from `_shared/jurisdiction/index.ts`; RPCs `get_site_jurisdiction`, `log_jurisdiction_decision`; table `cookie_consents(site_id, session_id, consent_types, gpc_signal, expires_at, created_at)`.
- Produces:
  - `INGEST_FUNCTIONS` (the 8 names from Task 8) and `type IngestFn`.
  - `interface SitePolicy { customer: CustomerProfile | null; tighten: Partial<Record<Purpose, string>>; exceptions: ApprovedException[]; testSite: boolean }`, `STRICT_POLICY: SitePolicy`.
  - `parseSitePolicy(raw: unknown): SitePolicy` (never throws; malformed → `STRICT_POLICY` parts).
  - `loadSitePolicy(client, siteId: string): Promise<SitePolicy>` (RPC error → `STRICT_POLICY`).
  - `isEnforced(fn: IngestFn, flag: string | null | undefined): boolean` (`'all'` or a comma list of function names; anything else = shadow).
  - `interface Ledger { analytics: boolean | null; marketing: boolean | null; gpc: boolean }`.
  - `readLedger(client, siteId: string, sessionId: unknown, now?: Date): Promise<Ledger | null>` (no row, bad session id, expired row or error → `null`).
  - `signalsFrom(ledger: Ledger | null, opts: { trackerGate: ('analytics' | 'marketing')[]; gpcHeader: boolean }): Signals`.
  - `visitorFrom(geo: { country: string | null; region: string | null; source: string }, adapter?: boolean): Visitor`.
  - `decideAndLog(client, fn: IngestFn, siteId: string, input: { visitor: Visitor; purpose: Purpose; signals: Signals; technique: Technique }, policy: SitePolicy, flag: string | null | undefined, count?: number): Promise<Decision & { enforce: boolean; drop: boolean }>`; `count` defaults to 1 (server-hit passes the batch size); `drop = enforce && !permit`. Logging errors are swallowed.

Note for implementers: `tests/foundation/edge-harness.mjs` returns `'test-value'` for every unset `Deno.env` key, so `isEnforced(fn, 'test-value')` must be `false`. The glue never reads `Deno` itself; callers pass `Deno.env.get('JURISDICTION_ENFORCE')`.

- [ ] **Step 1: Write the failing test**

```js
// tests/foundation/jurisdiction-edge.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mockDatabase } from './edge-harness.mjs';
import {
  parseSitePolicy, loadSitePolicy, STRICT_POLICY, isEnforced, readLedger, signalsFrom, visitorFrom, decideAndLog,
} from '../../supabase/functions/_shared/jurisdiction-edge.ts';

const SITE = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-11-20T12:00:00Z');
const ledgerDb = (row, error = null) => mockDatabase((op) => (op.table === 'cookie_consents' ? { data: row, error } : { data: null, error: null })).client;

test('Review Focus 5: malformed policy JSON gives the strictest default, never throws', async () => {
  for (const raw of [null, undefined, 42, 'x', [], { profile: 'x' }, { profile: { markets: 'eu' } }, { tighten: [] }, { exceptions: {} }, { testSite: 'yes' }]) {
    const p = parseSitePolicy(raw);
    assert.equal(p.testSite, false, JSON.stringify(raw));
    assert.deepEqual(p.exceptions, []);
  }
  assert.equal(parseSitePolicy(null).customer, null);
  const p = parseSitePolicy({ profile: { establishment_country: 'SE', markets: ['eu', 'mars'], answers: { us_ccpa: 'perhaps' } },
    tighten: { statistics: 'off', conversion: 'allowed', bogus: 'off' },
    exceptions: [{ ruleId: 'eu.x@1', jurisdiction: 'eu', purpose: 'attribution', legalBasis: 'lb', assessmentRef: 'A', approvedBy: 'u', approvedAt: '2026-11-01T00:00:00Z', expiresAt: '2027-01-01T00:00:00Z' },
                 { ruleId: 'eu.y@1', jurisdiction: 'mars', purpose: 'attribution' }],
    testSite: true });
  assert.deepEqual(p.customer.markets, ['eu']);
  assert.equal(p.customer.appliesLaws.us_ccpa, 'dont_know');
  assert.deepEqual(p.tighten, { statistics: 'off', conversion: 'allowed' }, 'unknown purposes dropped; decide() ignores relax values (AC4)');
  assert.deepEqual(p.exceptions.map((e) => e.ruleId), ['eu.x@1']);
  assert.equal(p.testSite, true);

  const failing = { rpc: async () => ({ data: null, error: { message: 'down' } }) };
  assert.deepEqual(await loadSitePolicy(failing, SITE), STRICT_POLICY);
  const throwing = { rpc: async () => { throw new Error('network'); } };
  assert.deepEqual(await loadSitePolicy(throwing, SITE), STRICT_POLICY);
});

test('enforcement flag: shadow unless "all" or the function is listed', () => {
  assert.equal(isEnforced('aggregate-hit', undefined), false);
  assert.equal(isEnforced('aggregate-hit', ''), false);
  assert.equal(isEnforced('aggregate-hit', 'test-value'), false, 'edge-harness default');
  assert.equal(isEnforced('aggregate-hit', 'all'), true);
  assert.equal(isEnforced('aggregate-hit', ' server-hit , aggregate-hit '), true);
  assert.equal(isEnforced('track-event', 'aggregate-hit'), false);
});

test('Review Focus 4: expired, missing or broken ledger rows read as no answer', async () => {
  const valid = { consent_types: { analytics: true, marketing: false }, gpc_signal: false, expires_at: '2027-01-01T00:00:00Z' };
  assert.deepEqual(await readLedger(ledgerDb(valid), SITE, 's1', NOW), { analytics: true, marketing: false, gpc: false });
  assert.equal(await readLedger(ledgerDb({ ...valid, expires_at: '2026-11-19T00:00:00Z' }), SITE, 's1', NOW), null);
  assert.equal(await readLedger(ledgerDb(null), SITE, 's1', NOW), null);
  // A withdrawn row (consent_given false) is a refusal of both categories, whatever consent_types says.
  assert.deepEqual(await readLedger(ledgerDb({ ...valid, consent_given: false }), SITE, 's1', NOW), { analytics: false, marketing: false, gpc: false });
  assert.equal(await readLedger(ledgerDb(valid, { message: 'down' }), SITE, 's1', NOW), null);
  assert.equal(await readLedger(ledgerDb(valid), SITE, '', NOW), null);
  assert.equal(await readLedger(ledgerDb(valid), SITE, 42, NOW), null);
  assert.deepEqual(await readLedger(ledgerDb({ ...valid, consent_types: { analytics: 'yes' } }), SITE, 's1', NOW),
    { analytics: null, marketing: null, gpc: false }, 'non-boolean values are no answer');
});

test('Review Focus 1: consent race. No ledger row yet + tracker gate = consent with tracker_gate evidence', () => {
  assert.deepEqual(signalsFrom(null, { trackerGate: ['analytics'], gpcHeader: false }),
    { consent: { analytics: true, marketing: null }, evidence: 'tracker_gate', gpc: false });
  assert.deepEqual(signalsFrom(null, { trackerGate: [], gpcHeader: false }),
    { consent: { analytics: null, marketing: null }, evidence: 'none', gpc: false });
});

test('the ledger only tightens the tracker gate; GPC from either source sticks', () => {
  const s = signalsFrom({ analytics: false, marketing: true, gpc: false }, { trackerGate: ['analytics', 'marketing'], gpcHeader: false });
  assert.deepEqual(s.consent, { analytics: false, marketing: true });
  assert.equal(s.evidence, 'ledger');
  const noGate = signalsFrom({ analytics: true, marketing: null, gpc: true }, { trackerGate: [], gpcHeader: false });
  assert.deepEqual([noGate.consent.analytics, noGate.gpc], [true, true]);
  assert.equal(signalsFrom(null, { trackerGate: [], gpcHeader: true }).gpc, true);
});

test('visitorFrom: only signed edge geo is trusted', () => {
  assert.deepEqual(visitorFrom({ country: 'SE', region: null, source: 'ip' }), { country: 'SE', region: null, geoSource: 'ip' });
  assert.equal(visitorFrom({ country: 'SE', region: null, source: 'timezone' }).geoSource, 'timezone');
  assert.equal(visitorFrom({ country: 'SE', region: null, source: 'ip' }, true).geoSource, 'adapter');
  assert.equal(visitorFrom({ country: 'SE', region: null, source: 'weird' }).geoSource, 'unknown');
});

test('decideAndLog: logs daily counts with country only for signed geo; log failure is swallowed', async () => {
  const calls = [];
  const client = { rpc: async (name, args) => { calls.push({ name, args }); return { data: null, error: { message: 'boom' } }; } };
  const input = { visitor: { country: 'SE', region: null, geoSource: 'ip' }, purpose: 'statistics',
    signals: { consent: { analytics: null, marketing: null }, evidence: 'none', gpc: false }, technique: { storage: 'none', identifiers: 'none' } };
  const d = await decideAndLog(client, 'aggregate-hit', SITE, input, STRICT_POLICY, undefined);
  assert.equal(d.enforce, false);
  assert.equal(d.drop, false, 'shadow mode never drops');
  assert.equal(d.permit, false);
  const [log] = calls;
  assert.equal(log.name, 'log_jurisdiction_decision');
  assert.deepEqual(Object.keys(log.args).sort(), ['p_count', 'p_country', 'p_enforced', 'p_evidence', 'p_fn', 'p_outcome', 'p_purpose', 'p_reason', 'p_rule_id', 'p_site_id']);
  assert.equal(log.args.p_country, 'SE');
  assert.equal(log.args.p_enforced, false);

  const tz = await decideAndLog(client, 'aggregate-hit', SITE, { ...input, visitor: { country: 'SE', region: null, geoSource: 'timezone' } }, STRICT_POLICY, 'all');
  assert.equal(calls[1].args.p_country, '', 'untrusted geo is never logged as a country');
  assert.equal(tz.drop, true, 'enforced + not permitted = drop');
  const throwing = { rpc: async () => { throw new Error('network'); } };
  await decideAndLog(throwing, 'aggregate-hit', SITE, input, STRICT_POLICY, 'all');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/foundation/jurisdiction-edge.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `jurisdiction-edge.ts`.

- [ ] **Step 3: Write the glue**

```ts
// supabase/functions/_shared/jurisdiction-edge.ts
// Spec 2026-11-18 phase 3: the one place Edge Functions talk to the rule engine. Pure apart from
// the client calls; never reads Deno (callers pass Deno.env.get('JURISDICTION_ENFORCE')).
import {
  decide, profileToCustomer, MARKETS, PURPOSES,
  type ApprovedException, type CustomerProfile, type Decision, type Market, type Purpose,
  type Signals, type Technique, type Visitor,
} from './jurisdiction/index.ts';

export const INGEST_FUNCTIONS = ['aggregate-hit', 'server-hit', 'ai-bot-tracker', 'track-event', 'visitor-identification',
  'record-conversion', 'store-consent', 'google-ads-quality-upload'] as const;
export type IngestFn = typeof INGEST_FUNCTIONS[number];

export interface SitePolicy { customer: CustomerProfile | null; tighten: Partial<Record<Purpose, string>>; exceptions: ApprovedException[]; testSite: boolean }
export const STRICT_POLICY: SitePolicy = Object.freeze({ customer: null, tighten: {}, exceptions: [], testSite: false }) as SitePolicy;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 200;

function parseException(e: unknown): ApprovedException | null {
  if (!isObj(e)) return null;
  const keys = ['ruleId', 'jurisdiction', 'purpose', 'legalBasis', 'assessmentRef', 'approvedBy', 'approvedAt', 'expiresAt'] as const;
  if (!keys.every((k) => str(e[k]))) return null;
  if (!(MARKETS as readonly string[]).includes(e.jurisdiction as string) || !(PURPOSES as readonly string[]).includes(e.purpose as string)) return null;
  return Object.fromEntries(keys.map((k) => [k, e[k]])) as unknown as ApprovedException;
}

export function parseSitePolicy(raw: unknown): SitePolicy {
  if (!isObj(raw)) return { ...STRICT_POLICY, tighten: {}, exceptions: [] };
  let customer: CustomerProfile | null = null;
  if (isObj(raw.profile)) {
    try { customer = profileToCustomer(raw.profile as never); } catch { customer = null; }
  }
  const tighten: Partial<Record<Purpose, string>> = {};
  if (isObj(raw.tighten)) {
    for (const p of PURPOSES) if (typeof raw.tighten[p] === 'string') tighten[p] = raw.tighten[p] as string;
  }
  const exceptions = Array.isArray(raw.exceptions) ? raw.exceptions.map(parseException).filter((e): e is ApprovedException => !!e) : [];
  return { customer, tighten, exceptions, testSite: raw.testSite === true };
}

// deno-lint-ignore no-explicit-any
export async function loadSitePolicy(client: any, siteId: string): Promise<SitePolicy> {
  try {
    const { data, error } = await client.rpc('get_site_jurisdiction', { p_site_id: siteId });
    if (error) { console.error('jurisdiction: policy load failed:', error.message); return STRICT_POLICY; }
    return parseSitePolicy(data);
  } catch (e) {
    console.error('jurisdiction: policy load threw:', (e as Error).message);
    return STRICT_POLICY;
  }
}

export function isEnforced(fn: IngestFn, flag: string | null | undefined): boolean {
  if (typeof flag !== 'string') return false;
  const list = flag.split(',').map((s) => s.trim()).filter(Boolean);
  return list.includes('all') || list.includes(fn);
}

export interface Ledger { analytics: boolean | null; marketing: boolean | null; gpc: boolean }
const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);

// deno-lint-ignore no-explicit-any
export async function readLedger(client: any, siteId: string, sessionId: unknown, now: Date = new Date()): Promise<Ledger | null> {
  if (typeof sessionId !== 'string' || !sessionId || sessionId.length > 255) return null;
  try {
    const { data, error } = await client.from('cookie_consents')
      .select('consent_given, consent_types, gpc_signal, expires_at')
      .eq('site_id', siteId).eq('session_id', sessionId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error || !data) return null;
    const exp = Date.parse(data.expires_at);
    if (Number.isFinite(exp) && exp <= now.getTime()) return null;
    const gpc = data.gpc_signal === true;
    if (data.consent_given === false) return { analytics: false, marketing: false, gpc };
    const t = isObj(data.consent_types) ? data.consent_types : {};
    return { analytics: bool(t.analytics), marketing: bool(t.marketing), gpc };
  } catch { return null; }
}

// The ledger only tightens: a ledger false beats a tracker gate; a missing ledger row is "no answer".
export function signalsFrom(ledger: Ledger | null, opts: { trackerGate: ('analytics' | 'marketing')[]; gpcHeader: boolean }): Signals {
  const gate = (c: 'analytics' | 'marketing'): boolean | null => (opts.trackerGate.includes(c) ? true : null);
  const pick = (c: 'analytics' | 'marketing'): boolean | null => {
    const l = ledger ? ledger[c] : null;
    return l === false ? false : (l === true ? true : gate(c));
  };
  const consent = { analytics: pick('analytics'), marketing: pick('marketing') };
  const fromLedger = !!ledger && (ledger.analytics !== null || ledger.marketing !== null);
  const evidence = fromLedger ? 'ledger' : (opts.trackerGate.length ? 'tracker_gate' : 'none');
  return { consent, evidence, gpc: opts.gpcHeader || ledger?.gpc === true };
}

export function visitorFrom(geo: { country: string | null; region: string | null; source: string }, adapter = false): Visitor {
  const geoSource = adapter ? 'adapter' : (geo.source === 'ip' || geo.source === 'timezone' ? geo.source : 'unknown');
  return { country: geo.country ?? null, region: geo.region ?? null, geoSource };
}

export async function decideAndLog(
  // deno-lint-ignore no-explicit-any
  client: any, fn: IngestFn, siteId: string,
  input: { visitor: Visitor; purpose: Purpose; signals: Signals; technique: Technique },
  policy: SitePolicy, flag: string | null | undefined, count = 1,
): Promise<Decision & { enforce: boolean; drop: boolean }> {
  const d = decide({ ...input, customer: policy.customer, exceptions: policy.exceptions, tighten: policy.tighten, testSite: policy.testSite });
  const enforce = isEnforced(fn, flag);
  try {
    const { error } = await client.rpc('log_jurisdiction_decision', {
      p_site_id: siteId, p_fn: fn, p_purpose: input.purpose,
      p_country: input.visitor.geoSource === 'ip' ? (input.visitor.country ?? '') : '',
      p_rule_id: d.ruleIds.join(',').slice(0, 200), p_outcome: d.outcome, p_reason: d.reason,
      p_evidence: d.evidence, p_enforced: enforce, p_count: Math.max(1, Math.floor(count)),
    });
    if (error) console.error('jurisdiction: log failed:', error.message);
  } catch (e) { console.error('jurisdiction: log threw:', (e as Error).message); }
  return { ...d, enforce, drop: enforce && !d.permit };
}

export type { Market };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/foundation/jurisdiction-edge.test.mjs`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/jurisdiction-edge.ts tests/foundation/jurisdiction-edge.test.mjs
git commit -m "feat(jurisdiction): edge glue for policy, consent ledger, enforce flag and decision log"
```

---

### Task 10: Wire aggregate-hit, server-hit and ai-bot-tracker

**Files:**
- Modify: `supabase/functions/aggregate-hit/index.ts:89-117` (order of checks, decision before salt)
- Modify: `supabase/functions/server-hit/index.ts` (decision before the insert at line ~147)
- Modify: `supabase/functions/ai-bot-tracker/index.ts` (decision after `resolveSite`, line ~129)
- Test: `tests/foundation/jurisdiction-wiring-ingest.test.mjs`
- Existing tests that must stay green unchanged: `aggregate-hit.test.mjs`, `server-hit.test.mjs`, `ai-bot-tracker-evidence.test.mjs`, `geo-wiring.test.mjs`

**Interfaces:**
- Consumes: `loadSitePolicy`, `decideAndLog`, `signalsFrom`, `readLedger`, `visitorFrom` from Task 9.
- Produces:
  - aggregate-hit: `{ skipped: 'jurisdiction' }` (HTTP 200) when enforced and not permitted. `{ skipped: 'gpc' }` is unchanged but now comes after site resolution and the rate limit, so a GPC hit with an unknown key gets 401 instead of the GPC skip. Purpose `statistics` for pageview/engagement, `conversion` for goal; technique `{ storage: 'none', identifiers: 'none' }`; no ledger (the beacon has no session).
  - server-hit: one decision per batch, purpose `security`, visitor `{ country: null, region: null, geoSource: 'adapter' }` (adapter geo is unsigned), `count = rows.length`. Enforced and not permitted: nothing inserted, response `{ accepted, stored: 0, ignored, rejected, skipped: 'jurisdiction' }`.
  - ai-bot-tracker: purpose `security`, technique `{ storage: 'session', identifiers: 'session' }`, signals from the ledger plus `trackerGate: ['analytics']` (spa-tracking.js line ~1216 sends only after `hasAnalyticsConsent()`). Enforced and not permitted: `{ success: true, skipped: 'jurisdiction' }`, no writes.

- [ ] **Step 1: Write the failing test**

```js
// tests/foundation/jurisdiction-wiring-ingest.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEdge, mockDatabase } from './edge-harness.mjs';
import { signGeo, GEO_HEADER } from '../../supabase/functions/_shared/geo-token.js';

const SITE = '11111111-1111-4111-8111-111111111111';
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const KEY = 'tk_' + 'a'.repeat(32);
const GEO_KEY = 'g'.repeat(32);
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36';
const TEST_SITE_POLICY = { profile: null, tighten: {}, exceptions: [], testSite: true };

function db({ site, policy = null, logError = null }) {
  const rpcCalls = [];
  const m = mockDatabase(
    (op) => (op.table === 'sites' ? { data: site, error: null } : { data: null, error: null }),
    async (name, args) => {
      rpcCalls.push({ name, args });
      if (name === 'get_site_jurisdiction') return { data: policy, error: null };
      if (name === 'log_jurisdiction_decision') return { data: null, error: logError };
      if (name === 'aggregate_daily_salt') return { data: 'f'.repeat(64), error: null };
      return { data: true, error: null };
    },
  );
  return { ...m, rpcCalls };
}
const logs = (rpcCalls) => rpcCalls.filter((c) => c.name === 'log_jurisdiction_decision').map((c) => c.args);
const named = (rpcCalls, n) => rpcCalls.filter((c) => c.name === n);
const geoHeader = async (country) => ({ [GEO_HEADER]: await signGeo({ country, region: null, ip: '203.0.113.9' }, GEO_KEY, Math.floor(Date.now() / 1000)) });

// ---------- aggregate-hit ----------
const AGG_SITE = { id: SITE, user_id: OWNER, is_active: true, domain: 'shop.test', aggregate_measurement: true, conversion_goals: [] };
async function agg({ env = {}, policy = null, headers = {}, logError = null, kind = 'pageview' } = {}) {
  const d = db({ site: AGG_SITE, policy, logError });
  const handler = loadEdge('aggregate-hit', d.client, { env: { GEO_SIGNING_KEY: GEO_KEY, ...env } });
  const res = await handler(new Request('https://fn.test/aggregate-hit', {
    method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'user-agent': CHROME, ...headers },
    body: JSON.stringify({ siteId: SITE, kind, url: 'https://shop.test/', ...(kind === 'goal' ? { formId: 'f' } : {}) }),
  }));
  return { res, body: res.status === 200 ? await res.json() : null, rpcCalls: d.rpcCalls };
}

test('aggregate-hit shadow: decision logged, ingest unchanged', async () => {
  const { body, rpcCalls } = await agg({ headers: await geoHeader('SE') });
  assert.deepEqual(body, { goals: [] });
  const [l] = logs(rpcCalls);
  assert.deepEqual([l.p_fn, l.p_purpose, l.p_country, l.p_enforced, l.p_outcome], ['aggregate-hit', 'statistics', 'SE', false, 'needs_opt_in']);
  assert.equal(named(rpcCalls, 'ingest_aggregate_hit').length, 1);
});

test('aggregate-hit enforce: unapproved rule = skipped jurisdiction, nothing ingested, no salt read', async () => {
  const { body, rpcCalls } = await agg({ env: { JURISDICTION_ENFORCE: 'aggregate-hit' }, headers: await geoHeader('SE') });
  assert.deepEqual(body, { skipped: 'jurisdiction' });
  assert.equal(named(rpcCalls, 'ingest_aggregate_hit').length, 0);
  assert.equal(named(rpcCalls, 'aggregate_daily_salt').length, 0);
  assert.equal(logs(rpcCalls)[0].p_enforced, true);
});

test('aggregate-hit enforce on an admin test site: reviewed_agent EU rule applies', async () => {
  const { body, rpcCalls } = await agg({ env: { JURISDICTION_ENFORCE: 'all' }, policy: TEST_SITE_POLICY, headers: await geoHeader('SE') });
  assert.deepEqual(body, { goals: [] });
  // No profile: markets = eu, uk, ca_qc, so the EU rule and the draft world rule both apply.
  assert.equal(logs(rpcCalls)[0].p_rule_id, 'eu.statistics.aggregate@1,world.statistics.aggregate@1');
  const goal = await agg({ env: { JURISDICTION_ENFORCE: 'all' }, policy: TEST_SITE_POLICY, headers: await geoHeader('SE'), kind: 'goal' });
  assert.equal(goal.res.status, 204);
  assert.equal(logs(goal.rpcCalls)[0].p_purpose, 'conversion');
});

test('aggregate-hit: GPC still skips with reason gpc, and the decision is logged with reason gpc', async () => {
  const { body, rpcCalls } = await agg({ policy: TEST_SITE_POLICY, headers: { ...(await geoHeader('SE')), 'sec-gpc': '1' } });
  assert.deepEqual(body, { skipped: 'gpc' });
  assert.equal(logs(rpcCalls)[0].p_reason, 'gpc');
  assert.equal(named(rpcCalls, 'ingest_aggregate_hit').length, 0);
});

test('Review Focus 3: a failing decision log never fails ingest', async () => {
  const { body, rpcCalls } = await agg({ logError: { message: 'constraint' }, headers: await geoHeader('SE') });
  assert.deepEqual(body, { goals: [] });
  assert.equal(named(rpcCalls, 'ingest_aggregate_hit').length, 1);
});

// ---------- server-hit ----------
async function serverHit(env = {}) {
  const d = db({ site: { id: SITE, is_active: true, domain: 'https://www.shop.test/' } });
  const handler = loadEdge('server-hit', d.client, { env });
  const res = await handler(new Request('https://fn.test/server-hit', {
    method: 'POST', headers: { Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ hits: [
      { url: 'https://shop.test/a', userAgent: 'GPTBot/1.2', ip: '203.0.113.7', country: 'SE' },
      { url: 'https://shop.test/b', userAgent: 'ClaudeBot/1.0', country: 'US', region: 'CA' },
    ] }),
  }));
  return { body: await res.json(), d };
}

test('server-hit: one decision per batch, adapter geo is never logged as a country', async () => {
  const { body, d } = await serverHit();
  assert.equal(body.stored, 2);
  const ls = logs(d.rpcCalls);
  assert.equal(ls.length, 1);
  assert.deepEqual([ls[0].p_purpose, ls[0].p_country, ls[0].p_count], ['security', '', 2]);
  const enforced = await serverHit({ JURISDICTION_ENFORCE: 'server-hit' });
  assert.deepEqual(enforced.body, { accepted: 2, stored: 0, ignored: 0, rejected: 0, skipped: 'jurisdiction' });
  assert.equal(enforced.d.calls.some((c) => c.table === 'ai_bot_traffic' && c.type === 'insert'), false);
});

// ---------- ai-bot-tracker ----------
async function aiBot(env = {}) {
  const d = db({ site: { id: SITE, is_active: true, domain: 'shop.test', user_id: OWNER } });
  const handler = loadEdge('ai-bot-tracker', d.client, { env });
  const res = await handler(new Request('https://fn.test/ai-bot-tracker', {
    method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0 (compatible; GPTBot/1.2)' },
    body: JSON.stringify({ siteId: SITE, url: 'https://shop.test/', sessionId: 's-1' }),
  }));
  return { body: await res.json(), d };
}

test('ai-bot-tracker: security decision with tracker-gate evidence; enforce drops without writes', async () => {
  const shadow = await aiBot();
  const [l] = logs(shadow.d.rpcCalls);
  assert.deepEqual([l.p_fn, l.p_purpose, l.p_evidence], ['ai-bot-tracker', 'security', 'tracker_gate']);
  const enforced = await aiBot({ JURISDICTION_ENFORCE: 'ai-bot-tracker' });
  // Consent via tracker gate permits needs_opt_in, so enforcement keeps the row.
  assert.notEqual(enforced.body.skipped, 'jurisdiction');
});
```

Note: the last assertion documents a real consequence: with `tracker_gate` evidence (open question 3) the baseline `needs_opt_in` is satisfied, so ai-bot-tracker keeps storing. If Daniel rejects tracker-gate evidence, flip this assertion to `skipped: 'jurisdiction'` and change `trackerGate` to `[]`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/foundation/jurisdiction-wiring-ingest.test.mjs`
Expected: FAIL (no `log_jurisdiction_decision` calls; `logs(...)[0]` is undefined).

- [ ] **Step 3: Wire aggregate-hit**

Add the import:

```ts
import { loadSitePolicy, decideAndLog, signalsFrom, visitorFrom } from '../_shared/jurisdiction-edge.ts';
```

Replace lines 89-117 (from `// Objection signals and non-humans` to `const hash = ...`) with:

```ts
  // Non-humans are dropped before any lookup. GPC is read here and applied after the decision is logged.
  const gpc = req.headers.get('sec-gpc') === '1';
  const ua = (req.headers.get('user-agent') ?? '').slice(0, 512);
  if (isLikelyBot(ua)) return skipped('bot');

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const site = await resolveAggregateSite(supabase, key, String(body.siteId ?? ''), pageUrl);
  if (!site) return json({ error: 'Unknown or inactive key' }, 401);
  if (!site.aggregate_measurement) return skipped('disabled');

  const siteHost = normHost(site.domain ?? '');
  const host = normHost(pageUrl.hostname);
  if (!siteHost || !host || !ownsHost(siteHost, host)) return json({ error: 'Host does not belong to this site' }, 400);

  // Fail closed: an unavailable limiter must not become an unlimited one. Runs before the
  // decision log so a flood cannot inflate the counters.
  const { data: allowed, error: rlError } = await supabase.rpc('check_rate_limit', {
    p_key: `agg:${site.id}`, p_max_count: REQUESTS_PER_MINUTE, p_window_sec: 60,
  });
  if (rlError) return skipped('unavailable');
  if (allowed === false) return skipped('rate_limited');

  // The Worker hides the visitor's IP behind its own; the signed geo carries it (in transit only).
  const geo = await resolveGeo(req, { key: geoKey(), timeZone: body.tz });
  const policy = await loadSitePolicy(supabase, site.id);
  const decision = await decideAndLog(supabase, 'aggregate-hit', site.id, {
    visitor: visitorFrom(geo),
    purpose: kind === 'goal' ? 'conversion' : 'statistics',
    signals: signalsFrom(null, { trackerGate: [], gpcHeader: gpc }),
    technique: { storage: 'none', identifiers: 'none' },
  }, policy, Deno.env.get('JURISDICTION_ENFORCE'));
  // GPC stays absolute whatever the rule says.
  if (gpc) return skipped('gpc');
  if (decision.drop) return skipped('jurisdiction');

  const { data: salt, error: saltError } = await supabase.rpc('aggregate_daily_salt');
  if (saltError || typeof salt !== 'string' || !salt) {
    console.error('aggregate-hit: salt unavailable');
    return skipped('unavailable');
  }
  const hash = await visitorHash(salt, site.id, geo.ip ?? '', ua);
```

Update the header comment of the file: "GPC and bots are dropped" → "Bots are dropped before any lookup; GPC after the site's jurisdiction decision is logged".

- [ ] **Step 4: Wire server-hit**

Add `import { loadSitePolicy, decideAndLog, signalsFrom } from '../_shared/jurisdiction-edge.ts';` and replace the block starting `if (rows.length > 0) {` with:

```ts
  if (rows.length > 0) {
    // One decision per batch. Adapter geo is unsigned, so the engine judges by the site's markets.
    const decision = await decideAndLog(supabase, 'server-hit', site.id, {
      visitor: { country: null, region: null, geoSource: 'adapter' },
      purpose: 'security',
      signals: signalsFrom(null, { trackerGate: [], gpcHeader: false }),
      technique: { storage: 'none', identifiers: 'none' },
    }, await loadSitePolicy(supabase, site.id), Deno.env.get('JURISDICTION_ENFORCE'), rows.length);
    if (decision.drop) return json({ accepted: hits.length, stored: 0, ignored, rejected, skipped: 'jurisdiction' });
    const { error } = await supabase.from('ai_bot_traffic').insert(rows);
    if (error) {
      console.error('server-hit insert failed:', error.message);
      return json({ error: 'Store failed' }, 500);
    }
  }
```

- [ ] **Step 5: Wire ai-bot-tracker**

Add `import { loadSitePolicy, decideAndLog, signalsFrom, readLedger, visitorFrom } from "../_shared/jurisdiction-edge.ts";` and insert directly after the `if (!site || !site.is_active) { ... }` block:

```ts
    // The browser layer sends only after analytics consent (spa-tracking.js hasAnalyticsConsent);
    // a ledger row for the session can only tighten that.
    const decision = await decideAndLog(supabase, 'ai-bot-tracker', site.id, {
      visitor: visitorFrom(geo),
      purpose: 'security',
      signals: signalsFrom(await readLedger(supabase, site.id, sessionId), { trackerGate: ['analytics'], gpcHeader: req.headers.get('sec-gpc') === '1' }),
      technique: { storage: 'session', identifiers: 'session' },
    }, await loadSitePolicy(supabase, site.id), Deno.env.get('JURISDICTION_ENFORCE'));
    if (decision.drop) {
      return new Response(JSON.stringify({ success: true, skipped: 'jurisdiction' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
```

- [ ] **Step 6: Run tests**

Run: `node --test tests/foundation/jurisdiction-wiring-ingest.test.mjs tests/foundation/aggregate-hit.test.mjs tests/foundation/server-hit.test.mjs tests/foundation/ai-bot-tracker-evidence.test.mjs tests/foundation/geo-wiring.test.mjs`
Expected: PASS. If `aggregate-hit.test.mjs` "skips" fails on the `gpc` case, check that the rate-limit mock returns `{ data: true }` before the GPC skip (it does in `setup()`).

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/aggregate-hit/index.ts supabase/functions/server-hit/index.ts supabase/functions/ai-bot-tracker/index.ts tests/foundation/jurisdiction-wiring-ingest.test.mjs
git commit -m "feat(jurisdiction): decide and log in aggregate-hit, server-hit and ai-bot-tracker (shadow by default)"
```

If the ai-bot-tracker case returns before the site lookup (for example `no_bot_evidence`), copy the request shape from `tests/foundation/ai-bot-tracker-evidence.test.mjs` ('registered AI UA' case), which is known to pass the guard.

---

### Task 11: Wire track-event, visitor-identification and record-conversion

**Files:**
- Modify: `supabase/functions/track-event/index.ts` (heatmap path ~line 163, `resolveOwnedSite` ~line 204 and its six uses, `eventSiteId` ~line 440)
- Modify: `supabase/functions/visitor-identification/index.ts` (after the cookieless check ~line 362; click-ID block ~line 410)
- Modify: `supabase/functions/record-conversion/index.ts` (after `getSessionConsent` ~line 62; upload state machine ~line 100)
- Test: `tests/foundation/jurisdiction-wiring-session.test.mjs`
- Existing tests that must stay green unchanged: `server-consent.test.mjs`, `visitor-country.test.mjs`, `reporting-accuracy.test.mjs`

**Interfaces:**
- Consumes: Task 9 glue; `resolveGeo`, `geoKey` from `_shared/geo.ts`.
- Produces:
  - track-event: one memoized gate per request, `gate(siteId: string | null): Promise<boolean>` (true = drop). Purpose `statistics`, technique `{ storage: 'session', identifiers: 'session' }`, signals = ledger (by `body.session_id`) + `trackerGate: ['analytics']`. Dropped events answer `{ success: true, skipped: 'jurisdiction' }` (HTTP 200) so trackers do not retry.
  - visitor-identification: purpose `statistics`, technique `{ storage: 'persistent', identifiers: 'session' }` (the pack has no "cross-visit, one site" identifier level; a per-site fingerprint is ranked as session identifiers with persistent effect, see open question in the runbook). Drop → `{ success: true, visitor: null, skipped: 'jurisdiction' }` before the fingerprint is computed. Click IDs: second decision, purpose `attribution`, technique `{ storage: 'session', identifiers: 'cross_site' }`, signals = ledger only (`trackerGate: []`). Drop → click IDs not written.
  - record-conversion: geo now resolved (`resolveGeo(req, { key: geoKey(), timeZone: null })`). Decision 1: purpose `conversion`, technique `{ storage: 'session', identifiers: 'session' }`, signals = ledger only. Drop → `{ success: true, skipped: 'jurisdiction' }`, no insert. Decision 2 (only when a gclid would be stored): purpose `attribution`, technique `{ storage: 'session', identifiers: 'cross_site' }`. Drop → `gclid: null`, `hashed_email: null`, `click_id_consent_given: false`, `upload_status: 'skipped_jurisdiction'` (value added to the CHECK in Task 8).

- [ ] **Step 1: Write the failing test**

```js
// tests/foundation/jurisdiction-wiring-session.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEdge, mockDatabase } from './edge-harness.mjs';

const SITE = '11111111-1111-4111-8111-111111111111';
const LEDGER_OK = { consent_given: true, consent_types: { analytics: true, marketing: true }, gpc_signal: false, expires_at: '2099-01-01T00:00:00Z' };
const TEST_SITE_POLICY = { profile: null, tighten: {}, exceptions: [], testSite: true };
const OFF_POLICY = { profile: null, tighten: { attribution: 'off' }, exceptions: [], testSite: false };

function db({ site, ledger = LEDGER_OK, policy = null, extra = () => null }) {
  const rpcCalls = [];
  const m = mockDatabase((op) => {
    if (op.table === 'sites') return { data: site, error: null };
    if (op.table === 'cookie_consents') return { data: ledger, error: null };
    return extra(op) ?? { data: { id: 'row-1' }, error: null };
  }, async (name, args) => {
    rpcCalls.push({ name, args });
    if (name === 'get_site_jurisdiction') return { data: policy, error: null };
    if (name === 'upsert_unified_visitor') return { data: 'visitor-1', error: null };
    return { data: true, error: null };
  });
  return { ...m, rpcCalls };
}
const logs = (rpcCalls) => rpcCalls.filter((c) => c.name === 'log_jurisdiction_decision').map((c) => c.args);
const post = (path, body) => new Request(`https://fn.test/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

// ---------- record-conversion ----------
const CONV_SITE = { id: SITE, is_active: true, tracking_mode: 'full' };
const visitorRow = (op) => (op.table === 'unified_visitors' ? { data: { gclid: 'g-1', click_id_consent_given: true }, error: null } : null);
async function conversion({ env = {}, policy = null } = {}) {
  const d = db({ site: CONV_SITE, policy, extra: visitorRow });
  const handler = loadEdge('record-conversion', d.client, { env });
  const res = await handler(post('record-conversion', { siteId: SITE, sessionId: 's-1', visitorId: 'v-1', hashedEmail: 'a'.repeat(64) }));
  return { res, body: await res.json(), d, insert: d.calls.find((c) => c.table === 'conversion_events' && c.type === 'insert')?.payload };
}

test('record-conversion shadow: two decisions logged, row unchanged', async () => {
  const { insert, d } = await conversion();
  assert.equal(insert.upload_status, 'pending');
  assert.deepEqual(logs(d.rpcCalls).map((l) => [l.p_purpose, l.p_evidence, l.p_enforced]), [['conversion', 'ledger', false], ['attribution', 'ledger', false]]);
});

test('record-conversion enforce: customer "off" for attribution strips the click and marks skipped_jurisdiction', async () => {
  const { insert } = await conversion({ env: { JURISDICTION_ENFORCE: 'record-conversion' }, policy: OFF_POLICY });
  assert.deepEqual([insert.gclid, insert.hashed_email, insert.click_id_consent_given, insert.upload_status], [null, null, false, 'skipped_jurisdiction']);
});

test('record-conversion enforce with consent: the baseline is met, the conversion is kept', async () => {
  const { insert } = await conversion({ env: { JURISDICTION_ENFORCE: 'record-conversion' } });
  assert.equal(insert.upload_status, 'pending');
});

// ---------- visitor-identification ----------
const VI_SITE = { id: SITE, is_active: true, tracking_mode: 'full', domain: 'example.com', fingerprint_salt: 's' };
async function identify({ env = {}, policy = null, ledger = LEDGER_OK } = {}) {
  const d = db({ site: VI_SITE, policy, ledger });
  const handler = loadEdge('visitor-identification', d.client, { env });
  const res = await handler(post('visitor-identification', {
    siteId: SITE, sessionId: 's-1', userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0', screenResolution: '1920x1080',
    viewport: '1200x800', timezone: -60, language: 'sv-SE', platform: 'Win32', currentUrl: 'https://example.com/',
    gclid: 'g-1', clickIdConsentGiven: true,
  }));
  return { body: await res.json(), d, clickUpdate: d.calls.find((c) => c.table === 'unified_visitors' && c.type === 'update') };
}

test('visitor-identification enforce: tighten attribution off keeps the visitor but drops click IDs', async () => {
  const { clickUpdate, d } = await identify({ env: { JURISDICTION_ENFORCE: 'visitor-identification' }, policy: OFF_POLICY });
  assert.equal(clickUpdate, undefined);
  assert.ok(d.rpcCalls.some((c) => c.name === 'upsert_unified_visitor'));
  assert.deepEqual(logs(d.rpcCalls).map((l) => [l.p_purpose, l.p_reason]), [['statistics', 'allowed'], ['attribution', 'customer_off']]);
});

test('visitor-identification enforce: refused ledger = no profile, no fingerprint', async () => {
  const refused = { ...LEDGER_OK, consent_given: false };
  const { body, d } = await identify({ env: { JURISDICTION_ENFORCE: 'all' }, ledger: refused });
  assert.equal(body.skipped, 'jurisdiction');
  assert.equal(d.rpcCalls.some((c) => c.name === 'upsert_unified_visitor'), false);
});

// ---------- track-event ----------
// form_session is used because it returns before the hourly rate-limit query, which uses .gte()
// (not supported by mockDatabase).
async function formSession({ env = {}, ledger = null } = {}) {
  const d = db({
    site: { id: SITE }, ledger,
    extra: (op) => (op.table === 'companies' ? { data: { id: 'c-1', is_active: true }, error: null } : null),
  });
  const handler = loadEdge('track-event', d.client, { env });
  const res = await handler(new Request('https://fn.test/track-event', {
    method: 'POST', headers: { 'content-type': 'application/json', Authorization: 'Bearer acct_' + 'b'.repeat(32) },
    body: JSON.stringify({ company_id: 'c-1', site_id: SITE, session_id: 's-1', event_type: 'form_session', content_type: 'page', content_id: 'x',
      metadata: { status: 'completed', form_id: 'f', fields: [] } }),
  }));
  return { body: await res.json(), d };
}

test('Review Focus 1: no ledger row yet = tracker-gate evidence, the event is kept under enforcement', async () => {
  const { body, d } = await formSession({ env: { JURISDICTION_ENFORCE: 'track-event' } });
  assert.notEqual(body.skipped, 'jurisdiction');
  assert.equal(logs(d.rpcCalls)[0].p_evidence, 'tracker_gate');
});

test('track-event enforce: a refused ledger row drops the event without a write', async () => {
  const { body, d } = await formSession({ env: { JURISDICTION_ENFORCE: 'track-event' }, ledger: { ...LEDGER_OK, consent_types: { analytics: false, marketing: false } } });
  assert.deepEqual(body, { success: true, skipped: 'jurisdiction' });
  assert.equal(d.rpcCalls.some((c) => c.name === 'ingest_form_session' || c.name === 'record_form_session'), false);
  assert.equal(d.calls.some((c) => c.type === 'insert'), false);
});
```

Before Step 2, open `track-event/index.ts` lines 1-140 and copy the exact credential header and the `companies` lookup the function expects into `formSession()` (the account-key format and the company row fields). Keep the assertions as written.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/foundation/jurisdiction-wiring-session.test.mjs`
Expected: FAIL (no `log_jurisdiction_decision` calls).

- [ ] **Step 3: Wire record-conversion**

Add imports:

```ts
import { resolveGeo, geoKey } from '../_shared/geo.ts';
import { loadSitePolicy, decideAndLog, signalsFrom, readLedger, visitorFrom } from '../_shared/jurisdiction-edge.ts';
```

Directly after `if (!currentConsent.analytics) return json({ error: 'Analytics consent required' }, 403);` add:

```ts
    // Jurisdiction rules on top of the consent gate above. Ledger evidence only: this endpoint
    // already requires a ledger row.
    const policy = await loadSitePolicy(supabase, site.id);
    const flag = Deno.env.get('JURISDICTION_ENFORCE');
    const visitorGeo = visitorFrom(await resolveGeo(req, { key: geoKey(), timeZone: null }));
    const ledgerSignals = signalsFrom(await readLedger(supabase, site.id, sessionId), { trackerGate: [], gpcHeader: req.headers.get('sec-gpc') === '1' });
    const conversionDecision = await decideAndLog(supabase, 'record-conversion', site.id, {
      visitor: visitorGeo, purpose: 'conversion', signals: ledgerSignals,
      technique: { storage: 'session', identifiers: 'session' },
    }, policy, flag);
    if (conversionDecision.drop) return json({ success: true, skipped: 'jurisdiction' });
```

Replace the block from `const consent = currentConsent.marketing && ...` to the end of the upload state machine with:

```ts
    let consent = currentConsent.marketing && visitor?.click_id_consent_given === true;
    let gclid: string | null = consent ? visitor?.gclid ?? null : null;
    let jurisdictionBlocked = false;
    if (gclid) {
      const attribution = await decideAndLog(supabase, 'record-conversion', site.id, {
        visitor: visitorGeo, purpose: 'attribution', signals: ledgerSignals,
        technique: { storage: 'session', identifiers: 'cross_site' },
      }, policy, flag);
      if (attribution.drop) { jurisdictionBlocked = true; consent = false; gclid = null; }
    }

    // State machine: only rows with BOTH a gclid AND consent become uploadable.
    let uploadStatus: string;
    if (jurisdictionBlocked) uploadStatus = 'skipped_jurisdiction';
    else if (!gclid) uploadStatus = 'skipped_no_gclid';
    else if (!consent) uploadStatus = 'skipped_no_consent';
    else uploadStatus = 'pending';
```

`hashed_email: consent ? ... : null` and `click_id_consent_given: consent` below stay as they are; they now read the updated `consent`.

- [ ] **Step 4: Wire visitor-identification**

Add `import { loadSitePolicy, decideAndLog, signalsFrom, readLedger, visitorFrom } from "../_shared/jurisdiction-edge.ts";`. After the cookieless block and before `generateDeviceFingerprint`, add:

```ts
    const policy = await loadSitePolicy(supabase, site.id);
    const flag = Deno.env.get('JURISDICTION_ENFORCE');
    const geo = await resolveGeo(req, { key: geoKey(), timeZone: requestData.timeZone });
    const ledger = await readLedger(supabase, site.id, requestData.sessionId);
    const gpcHeader = req.headers.get('sec-gpc') === '1';
    const profileDecision = await decideAndLog(supabase, 'visitor-identification', site.id, {
      visitor: visitorFrom(geo), purpose: 'statistics',
      // The tracker calls this endpoint only after analytics consent (identifyVisitor in spa-tracking.js).
      signals: signalsFrom(ledger, { trackerGate: ['analytics'], gpcHeader }),
      technique: { storage: 'persistent', identifiers: 'session' },
    }, policy, flag);
    if (profileDecision.drop) {
      return new Response(JSON.stringify({ success: true, visitor: null, skipped: 'jurisdiction' }),
        { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }
```

Change `p_country_code: (await resolveGeo(req, { ... })).country` to `p_country_code: geo.country` (one geo resolution per request). Replace the `hasClickIds` computation with:

```ts
    let hasClickIds = serverMarketingConsent && requestData.clickIdConsentGiven && (
      requestData.gclid || requestData.fbclid || requestData.msclkid ||
      requestData.ttclid || requestData.li_fat_id
    );
    if (hasClickIds) {
      const attribution = await decideAndLog(supabase, 'visitor-identification', site.id, {
        visitor: visitorFrom(geo), purpose: 'attribution',
        signals: signalsFrom(ledger, { trackerGate: [], gpcHeader }),
        technique: { storage: 'session', identifiers: 'cross_site' },
      }, policy, flag);
      if (attribution.drop) hasClickIds = false;
    }
```

Before Step 5, verify in `spa-tracking.js` that `identifyVisitor` runs only after `hasAnalyticsConsent()`; if it does not, change `trackerGate` in the profile decision to `[]` and add a line to the Code surprises section of the PR body.

- [ ] **Step 5: Wire track-event**

Add `import { loadSitePolicy, decideAndLog, signalsFrom, readLedger, visitorFrom } from '../_shared/jurisdiction-edge.ts';`. Directly after `const num = ...` (line ~210) add, and move the existing `resolveGeo` call at line ~490 to reuse `requestGeo()`:

```ts
    // One decision per request and site (memoized). The tracker sends only after its analytics
    // gate; the ledger can only tighten that (spec ADR-1, Review Focus 1).
    let geoMemo: Awaited<ReturnType<typeof resolveGeo>> | null = null;
    const requestGeo = async () => (geoMemo ??= await resolveGeo(req, { key: geoKey(), timeZone: body.metadata?.timezone }));
    const gateMemo = new Map<string, boolean>();
    const gate = async (siteId: string | null | undefined): Promise<boolean> => {
      if (!siteId) return false;
      const hit = gateMemo.get(siteId);
      if (hit !== undefined) return hit;
      const d = await decideAndLog(supabase, 'track-event', siteId, {
        visitor: visitorFrom(await requestGeo()), purpose: 'statistics',
        signals: signalsFrom(await readLedger(supabase, siteId, body.session_id), { trackerGate: ['analytics'], gpcHeader: req.headers.get('sec-gpc') === '1' }),
        technique: { storage: 'session', identifiers: 'session' },
      }, await loadSitePolicy(supabase, siteId), Deno.env.get('JURISDICTION_ENFORCE'));
      gateMemo.set(siteId, d.drop);
      return d.drop;
    };
    const skippedJurisdiction = () => new Response(JSON.stringify({ success: true, skipped: 'jurisdiction' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
```

Move the `gate`/`requestGeo` block above the heatmap branch (line ~163) so the heatmap path can use it, then add `if (await gate(siteId)) return skippedJurisdiction();` at each of these places, directly after the site id is known and before any write:
- heatmap: after the `!site || !interaction ...` validation, using `site.id`;
- form_session (~214), interaction (~252), content (~287), the form submit branch (~308) and the conversion branch (~328): after `const siteId = await resolveOwnedSite();` and its validation;
- the main path: after `const eventSiteId = domainSiteId ?? await resolveOwnedSite();` (~440), using `eventSiteId`. Events with no resolvable site (`eventSiteId` null) are not gated, as today; they carry no site and are not shown per site.

- [ ] **Step 6: Run tests**

Run: `node --test tests/foundation/jurisdiction-wiring-session.test.mjs tests/foundation/server-consent.test.mjs tests/foundation/visitor-country.test.mjs tests/foundation/reporting-accuracy.test.mjs`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/track-event/index.ts supabase/functions/visitor-identification/index.ts supabase/functions/record-conversion/index.ts tests/foundation/jurisdiction-wiring-session.test.mjs
git commit -m "feat(jurisdiction): decide and log in track-event, visitor-identification and record-conversion"
```

---

### Task 12: store-consent logs, google-ads-quality-upload gates

**Files:**
- Modify: `supabase/functions/_shared/jurisdiction-edge.ts` (add `gateAdsUpload`)
- Modify: `supabase/functions/store-consent/index.ts` (after the insert/update, ~line 240)
- Modify: `supabase/functions/google-ads-quality-upload/index.ts` (per-row loop ~line 150)
- Test: `tests/foundation/jurisdiction-wiring-ads.test.mjs`
- Existing tests that must stay green unchanged: `google-ads-quality-upload.test.mjs`, `store-consent-geo-gpc.test.mjs`, `geo-wiring.test.mjs`

**Interfaces:**
- Consumes: Task 9 glue.
- Produces:
  - `gateAdsUpload(client, siteId: string, sessionId: unknown, policy: SitePolicy, flag: string | null | undefined): Promise<{ drop: boolean }>`: purpose `ad_platform_sharing`, technique `{ storage: 'persistent', identifiers: 'cross_site' }`, visitor `{ country: null, region: null, geoSource: 'unknown' }` (no country is stored on `conversion_events`, so the site's strictest market applies), signals = ledger only.
  - store-consent never blocks. It logs one decision per stored choice: purpose `statistics`, signals built from the choice just stored (`evidence: 'ledger'`), so `jurisdiction_decisions_daily` shows per country what the engine would decide for consented and refused visitors.
  - google-ads-quality-upload: rows with current consent go through `gateAdsUpload`; dropped rows get `upload_status = 'skipped_jurisdiction'`, `upload_claimed_at = null`.

- [ ] **Step 1: Write the failing test**

```js
// tests/foundation/jurisdiction-wiring-ads.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mockDatabase, loadEdge } from './edge-harness.mjs';
import { gateAdsUpload, STRICT_POLICY } from '../../supabase/functions/_shared/jurisdiction-edge.ts';

const SITE = '11111111-1111-4111-8111-111111111111';
const OK = { consent_given: true, consent_types: { analytics: true, marketing: true }, gpc_signal: false, expires_at: '2099-01-01T00:00:00Z' };
function ledgerDb(row) {
  const rpcCalls = [];
  const m = mockDatabase(() => ({ data: row, error: null }), async (name, args) => { rpcCalls.push({ name, args }); return { data: null, error: null }; });
  return { ...m, rpcCalls };
}

test('gateAdsUpload: shadow never drops; enforce drops on GPC (hard floor) and on customer "off"', async () => {
  assert.equal((await gateAdsUpload(ledgerDb(OK).client, SITE, 's-1', STRICT_POLICY, undefined)).drop, false);
  assert.equal((await gateAdsUpload(ledgerDb(OK).client, SITE, 's-1', STRICT_POLICY, 'google-ads-quality-upload')).drop, false, 'marketing consent meets the baseline');
  assert.equal((await gateAdsUpload(ledgerDb({ ...OK, gpc_signal: true }).client, SITE, 's-1', STRICT_POLICY, 'all')).drop, true);
  const off = { ...STRICT_POLICY, tighten: { ad_platform_sharing: 'off' } };
  assert.equal((await gateAdsUpload(ledgerDb(OK).client, SITE, 's-1', off, 'all')).drop, true);
  const d = ledgerDb(OK);
  await gateAdsUpload(d.client, SITE, 's-1', STRICT_POLICY, undefined);
  const [log] = d.rpcCalls.filter((c) => c.name === 'log_jurisdiction_decision').map((c) => c.args);
  assert.deepEqual([log.p_fn, log.p_purpose, log.p_country], ['google-ads-quality-upload', 'ad_platform_sharing', '']);
});

test('upload loop: gate after the consent check, dropped rows marked skipped_jurisdiction', () => {
  const src = readFileSync(new URL('../../supabase/functions/google-ads-quality-upload/index.ts', import.meta.url), 'utf8');
  const loop = src.slice(src.indexOf('for (const conversion of claimed)'), src.indexOf('if (pending.length === 0)'));
  assert.ok(loop.indexOf('current.analytics && current.marketing') < loop.indexOf('gateAdsUpload('));
  assert.match(loop, /upload_status: 'skipped_jurisdiction', upload_claimed_at: null/);
  assert.match(src, /loadSitePolicy\(supabase, site\.id\)/);
});

test('store-consent: logs a statistics decision from the stored choice and still stores a refusal', async () => {
  const rpcCalls = [];
  const db = mockDatabase((op) => {
    if (op.table === 'sites') return { data: { id: SITE }, error: null };
    if (op.table === 'cookie_consents' && op.type === 'select') return { data: null, error: null };
    if (op.table === 'cookie_consents' && op.type === 'insert') return { data: { id: 'row-1', ...op.payload }, error: null };
    return { data: null, error: null };
  }, async (name, args) => { rpcCalls.push({ name, args }); return { data: name === 'check_rate_limit' ? true : null, error: null }; });
  const handler = loadEdge('store-consent', db.client, { env: { JURISDICTION_ENFORCE: 'all' } });
  const res = await handler(new Request('https://fn.test/store-consent', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ site_id: SITE, session_id: 'c-1', consent_types: { analytics: false, marketing: false, preferences: false } }),
  }));
  assert.equal(res.status, 200);
  assert.ok(db.calls.some((c) => c.table === 'cookie_consents' && c.type === 'insert'), 'a refusal is always stored');
  const [log] = rpcCalls.filter((c) => c.name === 'log_jurisdiction_decision').map((c) => c.args);
  assert.deepEqual([log.p_fn, log.p_purpose, log.p_reason, log.p_evidence, log.p_enforced], ['store-consent', 'statistics', 'consent_refused', 'ledger', false]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/foundation/jurisdiction-wiring-ads.test.mjs`
Expected: FAIL with "does not provide an export named 'gateAdsUpload'".

- [ ] **Step 3: Add `gateAdsUpload` to `_shared/jurisdiction-edge.ts`**

```ts
// Ad-platform export of a stored conversion. No country is stored on conversion_events, so the
// visitor is unknown and the site's strictest market decides (fail closed). Ledger evidence only.
// deno-lint-ignore no-explicit-any
export async function gateAdsUpload(client: any, siteId: string, sessionId: unknown, policy: SitePolicy, flag: string | null | undefined): Promise<{ drop: boolean }> {
  const d = await decideAndLog(client, 'google-ads-quality-upload', siteId, {
    visitor: { country: null, region: null, geoSource: 'unknown' },
    purpose: 'ad_platform_sharing',
    signals: signalsFrom(await readLedger(client, siteId, sessionId), { trackerGate: [], gpcHeader: false }),
    technique: { storage: 'persistent', identifiers: 'cross_site' },
  }, policy, flag);
  return { drop: d.drop };
}
```

`store-consent` must never be enforced. `isEnforced` returns true for `'all'`, so `decideAndLog` is called by store-consent with the flag `null` (always shadow), as below.

- [ ] **Step 4: Wire google-ads-quality-upload**

Add `import { loadSitePolicy, gateAdsUpload } from '../_shared/jurisdiction-edge.ts';`. Directly before `const pending = [];` add `const policy = await loadSitePolicy(supabase, site.id); const flag = Deno.env.get('JURISDICTION_ENFORCE');`. Replace `if (current.analytics && current.marketing) { pending.push(conversion); } else { ... }` with:

```ts
        if (!(current.analytics && current.marketing)) {
          await supabase.from('conversion_events')
            .update({ upload_status: 'skipped_no_consent', upload_claimed_at: null })
            .eq('id', conversion.id).eq('upload_status', 'uploading');
          continue;
        }
        if ((await gateAdsUpload(supabase, site.id, sessionId, policy, flag)).drop) {
          await supabase.from('conversion_events')
            .update({ upload_status: 'skipped_jurisdiction', upload_claimed_at: null })
            .eq('id', conversion.id).eq('upload_status', 'uploading');
          continue;
        }
        pending.push(conversion);
```

- [ ] **Step 5: Wire store-consent (log only)**

Add `import { loadSitePolicy, decideAndLog, visitorFrom } from '../_shared/jurisdiction-edge.ts';`. After `result` is set (insert or update) and before the response, add:

```ts
    // Log only, never block: the ledger must record every choice, including refusals.
    // Flag null = always shadow, whatever JURISDICTION_ENFORCE says.
    await decideAndLog(supabase, 'store-consent', site_id, {
      visitor: visitorFrom(geo), purpose: 'statistics',
      signals: { consent: { analytics: requestData.consent_types.analytics, marketing: requestData.consent_types.marketing }, evidence: 'ledger', gpc },
      technique: { storage: 'session', identifiers: 'session' },
    }, await loadSitePolicy(supabase, site_id), null);
```

- [ ] **Step 6: Run tests**

Run: `node --test tests/foundation/jurisdiction-wiring-ads.test.mjs tests/foundation/google-ads-quality-upload.test.mjs tests/foundation/store-consent-geo-gpc.test.mjs tests/foundation/geo-wiring.test.mjs tests/foundation/jurisdiction-edge.test.mjs`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/jurisdiction-edge.ts supabase/functions/store-consent/index.ts supabase/functions/google-ads-quality-upload/index.ts tests/foundation/jurisdiction-wiring-ads.test.mjs
git commit -m "feat(jurisdiction): log consent choices; gate Google Ads export by market (shadow by default)"
```

---

### Task 13: geo-check `?site=` returns the visitor's effective outcome per purpose

**Files:**
- Modify: `supabase/functions/geo-check/index.ts`
- Test: `tests/foundation/jurisdiction-geo-check.test.mjs`
- Existing test that must stay green unchanged: `geo-wiring.test.mjs` (no-param JSON is byte-identical)

**Interfaces:**
- Consumes: `decide`, `PURPOSES` from `_shared/jurisdiction/index.ts`; `loadSitePolicy`, `visitorFrom` from Task 9.
- Produces: `GET /geo-check?site=<uuid>` → `{ country, region, in_scope, outcomes: Record<Purpose, Outcome> }`. No profile details, rule ids, exceptions or test-site flag are exposed. An invalid or unknown `site` returns the plain response without `outcomes`. Nothing is logged (a read, not a measurement). `Cache-Control: private, max-age=300` as today. The banner and tracker do not call it yet; it is for the snippet setup and support.

- [ ] **Step 1: Write the failing test**

```js
// tests/foundation/jurisdiction-geo-check.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEdge, mockDatabase } from './edge-harness.mjs';
import { signGeo, GEO_HEADER } from '../../supabase/functions/_shared/geo-token.js';

const KEY = 'k'.repeat(32);
const SITE = '11111111-1111-4111-8111-111111111111';

function setup(policy) {
  const rpcCalls = [];
  const db = mockDatabase(() => ({ data: null, error: null }), async (name, args) => {
    rpcCalls.push({ name, args });
    return name === 'get_site_jurisdiction' ? { data: policy, error: null } : { data: null, error: null };
  });
  return { rpcCalls, handler: loadEdge('geo-check', db.client, { env: { GEO_SIGNING_KEY: KEY } }) };
}

test('geo-check ?site=: outcome per purpose, no profile details, nothing logged', async () => {
  const { handler, rpcCalls } = setup({ profile: null, tighten: { statistics: 'off' }, exceptions: [], testSite: false });
  const token = await signGeo({ country: 'SE', region: null, ip: null }, KEY, Math.floor(Date.now() / 1000));
  const body = await (await handler(new Request(`https://fn.test/geo-check?site=${SITE}`, { headers: { [GEO_HEADER]: token } }))).json();
  assert.deepEqual(Object.keys(body), ['country', 'region', 'in_scope', 'outcomes']);
  assert.deepEqual(body.outcomes, { statistics: 'blocked', conversion: 'needs_opt_in', attribution: 'needs_opt_in', ad_platform_sharing: 'needs_opt_in', security: 'needs_opt_in' });
  assert.equal(rpcCalls.some((c) => c.name === 'log_jurisdiction_decision'), false);
});

test('geo-check: invalid site id = plain response without a DB call', async () => {
  const { handler, rpcCalls } = setup(null);
  const body = await (await handler(new Request('https://fn.test/geo-check?site=not-a-uuid'))).json();
  assert.deepEqual(body, { country: null, region: null, in_scope: true });
  assert.equal(rpcCalls.length, 0);
});
```

`statistics: 'blocked'` follows from Task 4 (tighten `'off'` gives outcome `blocked`, reason `customer_off`).

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/foundation/jurisdiction-geo-check.test.mjs`
Expected: FAIL (`outcomes` missing).

- [ ] **Step 3: Implement**

Replace the handler body in `supabase/functions/geo-check/index.ts` (keep the imports, CORS and `EEA_UK_CH` as they are):

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decide, PURPOSES } from '../_shared/jurisdiction/index.ts';
import { loadSitePolicy, signalsFrom, visitorFrom } from '../_shared/jurisdiction-edge.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const geo = await resolveGeo(req, { key: geoKey(), timeZone: null });
  const inScope = geo.country ? EEA_UK_CH.has(geo.country) : true;
  const payload: Record<string, unknown> = { country: geo.country, region: geo.region, in_scope: inScope };

  // Optional: what CortIQ's technical defaults decide for this visitor on one site. No consent is
  // assumed (signals empty), so the answer is the strictest per purpose. Not legal advice.
  const site = new URL(req.url).searchParams.get('site');
  if (site && UUID.test(site)) {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const policy = await loadSitePolicy(supabase, site);
    const outcomes: Record<string, string> = {};
    for (const purpose of PURPOSES) {
      outcomes[purpose] = decide({
        visitor: visitorFrom(geo), purpose,
        signals: signalsFrom(null, { trackerGate: [], gpcHeader: req.headers.get('sec-gpc') === '1' }),
        technique: { storage: 'none', identifiers: 'none' },
        customer: policy.customer, exceptions: policy.exceptions, tighten: policy.tighten, testSite: false,
      }).outcome;
    }
    payload.outcomes = outcomes;
  }
  return new Response(JSON.stringify(payload),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=300' } });
});
```

`testSite: false` on purpose: a public endpoint never shows draft-rule results. Use the same `createClient` import line as `aggregate-hit/index.ts` (copy it from there if the version differs).

- [ ] **Step 4: Run tests**

Run: `node --test tests/foundation/jurisdiction-geo-check.test.mjs tests/foundation/geo-wiring.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/geo-check/index.ts tests/foundation/jurisdiction-geo-check.test.mjs
git commit -m "feat(jurisdiction): geo-check ?site= returns the visitor's outcome per purpose"
```

---

### Task 14: "Rules by market" tab (profile, tighten, effective rules)

**Files:**
- Create: `src/lib/jurisdiction.ts` (re-export of the engine for the browser)
- Create: `src/lib/effectiveByMarket.ts`
- Create: `src/hooks/useSiteJurisdiction.ts`
- Create: `src/components/dashboard/jurisdiction/LegalProfileForm.tsx`
- Create: `src/components/dashboard/jurisdiction/TightenControls.tsx`
- Create: `src/components/dashboard/jurisdiction/EffectiveRulesTable.tsx`
- Create: `src/components/dashboard/jurisdiction/RulesByMarketTab.tsx`
- Modify: `src/components/dashboard/CMPDashboard.tsx:185-189` (trigger) and after line 288 (content)
- Test: `tests/foundation/jurisdiction-ui.test.mjs`

**Interfaces:**
- Consumes: `decide`, `PACK`, `PURPOSES`, `MARKETS`, `profileToCustomer`, `PROFILE_QUESTIONS`, `DISCLAIMER` from `_shared/jurisdiction/index.ts` (Task 5); RPC `save_site_legal_profile` and tables `site_legal_profiles`, `site_jurisdiction_tighten` from Task 7 (RLS: owner reads own rows; tighten rows also writable by the owner).
- Produces:
  - `effectiveByMarket(input: { customer: CustomerProfile | null; tighten: Partial<Record<Purpose, string>> }): Array<{ market: Market; purpose: Purpose; outcome: Outcome; ruleIds: string[]; status: 'production' | 'baseline' }>`. Pure; uses `decide` with a trusted visitor in each of the customer's markets (or `STRICTEST_DEFAULT` without a profile), no consent, `testSite: false`. A rule below `approved_internal` is never listed; such cells show `status: 'baseline'`.
  - `useSiteJurisdiction(siteId)` → `{ profile, tighten, isLoading, saveProfile(answers), setTighten(purpose, value | null) }` (TanStack Query, key `['site-jurisdiction', siteId]`).

- [ ] **Step 1: Write the failing test**

```js
// tests/foundation/jurisdiction-ui.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { effectiveByMarket } from '../../src/lib/effectiveByMarket.ts';

test('effectiveByMarket: no profile = EU, UK, Québec at the baseline; nothing below approved_internal is listed', () => {
  const rows = effectiveByMarket({ customer: null, tighten: {} });
  assert.deepEqual([...new Set(rows.map((r) => r.market))], ['eu', 'uk', 'ca_qc']);
  for (const r of rows) {
    assert.equal(r.status, 'baseline');
    assert.deepEqual(r.ruleIds, []);
    assert.equal(r.outcome, 'needs_opt_in');
  }
});

test('effectiveByMarket: tighten applies to every market', () => {
  const rows = effectiveByMarket({ customer: { establishment: 'SE', markets: ['eu'], appliesLaws: {} }, tighten: { statistics: 'off' } });
  assert.equal(rows.find((r) => r.purpose === 'statistics').outcome, 'blocked');
});

const read = (p) => readFileSync(new URL(`../../src/components/dashboard/jurisdiction/${p}`, import.meta.url), 'utf8');
test('copy rules: disclaimer shown, forbidden phrases absent, relaxing only via approved exception', () => {
  const all = ['RulesByMarketTab.tsx', 'LegalProfileForm.tsx', 'TightenControls.tsx', 'EffectiveRulesTable.tsx'].map(read).join('\n');
  assert.match(all, /DISCLAIMER/);
  for (const bad of [/no consent needed/i, /GDPR-compliant without consent/i, /no banner needed/i]) assert.doesNotMatch(all, bad);
  // Tighten offers only opt_in and off.
  assert.match(read('TightenControls.tsx'), /\['opt_in', 'off'\]/);
  assert.doesNotMatch(read('TightenControls.tsx'), /allowed_unless_opt_out|'allowed'/);
});

test('CMPDashboard registers the tab', () => {
  const src = readFileSync(new URL('../../src/components/dashboard/CMPDashboard.tsx', import.meta.url), 'utf8');
  assert.match(src, /<TabsTrigger value="rules">Rules by market<\/TabsTrigger>/);
  assert.match(src, /<RulesByMarketTab selectedSite=\{selectedSite\} \/>/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/foundation/jurisdiction-ui.test.mjs`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/lib/jurisdiction.ts` and `src/lib/effectiveByMarket.ts`**

```ts
// src/lib/jurisdiction.ts
// The browser reads the same engine as the Edge Functions; never a copy (one source of truth).
export * from '../../supabase/functions/_shared/jurisdiction/index.ts';
```

```ts
// src/lib/effectiveByMarket.ts
// What CortIQ's technical defaults decide per market and purpose for a site, before any consent.
// Pure; no '@/' imports (tested directly). Not legal advice.
import { decide, PURPOSES, STRICTEST_DEFAULT } from './jurisdiction.ts';
import type { CustomerProfile, Market, Outcome, Purpose } from './jurisdiction.ts';

// One representative signed country per market, so decide() evaluates exactly that market.
const SAMPLE: Record<Market, [string, string | null]> = {
  eu: ['SE', null], uk: ['GB', null], ch: ['CH', null], us_ca: ['US', 'CA'], us_other: ['US', 'TX'],
  ca_qc: ['CA', 'QC'], ca_other: ['CA', 'ON'], br: ['BR', null], other: ['JP', null],
};

export interface EffectiveRow { market: Market; purpose: Purpose; outcome: Outcome; ruleIds: string[]; status: 'production' | 'baseline' }

export function effectiveByMarket(input: { customer: CustomerProfile | null; tighten: Partial<Record<Purpose, string>> }): EffectiveRow[] {
  const markets = input.customer?.markets?.length ? input.customer.markets : [...STRICTEST_DEFAULT];
  const rows: EffectiveRow[] = [];
  for (const market of markets) {
    const [country, region] = SAMPLE[market];
    for (const purpose of PURPOSES) {
      const d = decide({
        visitor: { country, region, geoSource: 'ip' }, purpose,
        signals: { consent: { analytics: null, marketing: null }, evidence: 'none', gpc: false },
        technique: { storage: 'none', identifiers: 'none' },
        // Each market on its own: the customer profile is narrowed to this market.
        customer: { establishment: input.customer?.establishment ?? null, markets: [market], appliesLaws: input.customer?.appliesLaws ?? {} },
        exceptions: [], tighten: input.tighten, testSite: false,
      });
      // 'tighten.*' ids are the customer's own setting, not a market rule.
      const marketRules = d.ruleIds.filter((id) => !id.startsWith('tighten.'));
      rows.push({ market, purpose, outcome: d.outcome, ruleIds: marketRules, status: marketRules.length ? 'production' : 'baseline' });
    }
  }
  return rows;
}
```

If Task 5's barrel does not re-export `STRICTEST_DEFAULT`, add it there (`export { STRICTEST_DEFAULT, marketOf } from './markets.ts';`).

- [ ] **Step 4: Write the hook**

```ts
// src/hooks/useSiteJurisdiction.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { profileToCustomer } from '@/lib/jurisdiction';
import type { Purpose } from '@/lib/jurisdiction';

export interface ProfileAnswers { establishment: string | null; markets: string[]; answers: Record<string, 'yes' | 'no' | 'dont_know'> }

export function useSiteJurisdiction(siteId: string | undefined) {
  const qc = useQueryClient();
  const key = ['site-jurisdiction', siteId];
  const query = useQuery({
    queryKey: key, enabled: !!siteId,
    queryFn: async () => {
      const [{ data: profile, error: pe }, { data: overrides, error: oe }] = await Promise.all([
        supabase.from('site_legal_profiles').select('establishment_country, markets, answers').eq('site_id', siteId!).maybeSingle(),
        supabase.from('site_jurisdiction_tighten').select('purpose, setting').eq('site_id', siteId!),
      ]);
      if (pe) throw pe;
      if (oe) throw oe;
      const tighten: Partial<Record<Purpose, string>> = {};
      for (const o of overrides ?? []) tighten[o.purpose as Purpose] = o.setting;
      return { profile, customer: profileToCustomer(profile), tighten };
    },
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: key });
  const saveProfile = useMutation({
    mutationFn: async (a: ProfileAnswers) => {
      const { error } = await supabase.rpc('save_site_legal_profile', { p_site_id: siteId!, p_establishment: a.establishment, p_markets: a.markets, p_answers: a.answers });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const setTighten = useMutation({
    mutationFn: async ({ purpose, outcome }: { purpose: Purpose; outcome: 'opt_in' | 'off' | null }) => {
      const q = supabase.from('site_jurisdiction_tighten');
      const { error } = outcome === null
        ? await q.delete().eq('site_id', siteId!).eq('purpose', purpose)
        : await q.upsert({ site_id: siteId!, purpose, setting: outcome }, { onConflict: 'site_id,purpose' });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  return { ...query, saveProfile, setTighten };
}
```

Table and column names come from Task 7's migration: `site_legal_profiles(site_id, establishment_country, markets, answers)` (read only; writes go through `save_site_legal_profile`) and `site_jurisdiction_tighten(site_id, purpose, setting)` (owner RLS for all operations; the CHECK allows only `opt_in` and `off`).

- [ ] **Step 5: Write the components**

`RulesByMarketTab.tsx`:

```tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { Site } from '@/types/dashboard';
import { DISCLAIMER } from '@/lib/jurisdiction';
import { useSiteJurisdiction } from '@/hooks/useSiteJurisdiction';
import { LegalProfileForm } from './LegalProfileForm';
import { TightenControls } from './TightenControls';
import { EffectiveRulesTable } from './EffectiveRulesTable';

export function RulesByMarketTab({ selectedSite }: { selectedSite: Site | null }) {
  const j = useSiteJurisdiction(selectedSite?.id);
  if (!selectedSite) return null;
  return (
    <div className="space-y-6">
      <Alert><AlertDescription>{DISCLAIMER}</AlertDescription></Alert>
      <Card>
        <CardHeader>
          <CardTitle>Where you operate</CardTitle>
          <CardDescription>Answers decide which market rules CortIQ applies. "Don't know" uses the stricter rule.</CardDescription>
        </CardHeader>
        <CardContent><LegalProfileForm profile={j.data?.profile ?? null} onSave={(a) => j.saveProfile.mutate(a)} saving={j.saveProfile.isPending} /></CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Make it stricter</CardTitle>
          <CardDescription>You can require opt-in or turn a purpose off. Relaxing a market rule needs an exception approved by CortIQ; none are available yet.</CardDescription>
        </CardHeader>
        <CardContent><TightenControls tighten={j.data?.tighten ?? {}} onChange={(purpose, outcome) => j.setTighten.mutate({ purpose, outcome })} /></CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>What applies now</CardTitle>
          <CardDescription>Per market, before any visitor consent. "Baseline" means opt-in is required.</CardDescription>
        </CardHeader>
        <CardContent><EffectiveRulesTable customer={j.data?.customer ?? null} tighten={j.data?.tighten ?? {}} /></CardContent>
      </Card>
    </div>
  );
}
```

`TightenControls.tsx`:

```tsx
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PURPOSES } from '@/lib/jurisdiction';
import type { Purpose } from '@/lib/jurisdiction';

const CHOICES = ['opt_in', 'off'] as const;
const LABEL: Record<string, string> = { opt_in: 'Require opt-in', off: 'Off', default: 'CortIQ default' };

export function TightenControls({ tighten, onChange }: { tighten: Partial<Record<Purpose, string>>; onChange: (p: Purpose, o: 'opt_in' | 'off' | null) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {PURPOSES.map((p) => (
        <div key={p} className="space-y-1">
          <Label>{p.replace(/_/g, ' ')}</Label>
          <Select value={tighten[p] ?? 'default'} onValueChange={(v) => onChange(p, v === 'default' ? null : (v as 'opt_in' | 'off'))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="default">{LABEL.default}</SelectItem>
              {CHOICES.map((c) => <SelectItem key={c} value={c}>{LABEL[c]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  );
}
```

`CHOICES` is the only list of values the control can write; it matches the table CHECK from Task 7.

`EffectiveRulesTable.tsx`:

```tsx
import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { effectiveByMarket } from '@/lib/effectiveByMarket';
import type { CustomerProfile, Purpose } from '@/lib/jurisdiction';

const OUTCOME_LABEL: Record<string, string> = {
  allowed: 'Allowed', allowed_unless_opt_out: 'Unless the visitor objects', needs_opt_in: 'Opt-in required', blocked: 'Off',
};

export function EffectiveRulesTable({ customer, tighten }: { customer: CustomerProfile | null; tighten: Partial<Record<Purpose, string>> }) {
  const rows = useMemo(() => effectiveByMarket({ customer, tighten }), [customer, tighten]);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-left text-muted-foreground"><th className="py-1 pr-3">Market</th><th className="pr-3">Purpose</th><th className="pr-3">Outcome</th><th>Basis</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.market}-${r.purpose}`} className="border-t">
              <td className="py-1 pr-3 uppercase">{r.market.replace('_', ' ')}</td>
              <td className="pr-3">{r.purpose.replace(/_/g, ' ')}</td>
              <td className="pr-3">{OUTCOME_LABEL[r.outcome]}</td>
              <td>{r.status === 'baseline' ? <Badge variant="outline">Baseline</Badge> : <Badge variant="secondary">{r.ruleIds.join(', ')}</Badge>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

`LegalProfileForm.tsx` renders `PROFILE_QUESTIONS` from Task 5 (one radio group per question with yes / no / don't know, a country input for establishment, and market checkboxes from `MARKETS`) and calls `onSave({ establishment, markets, answers })`. Props: `{ profile: { establishment_country: string | null; markets: string[]; answers: Record<string, string> } | null; onSave: (a: ProfileAnswers) => void; saving: boolean }`. Each question shows its `help` text from `PROFILE_QUESTIONS`; no other legal copy.

In `CMPDashboard.tsx`: `import { RulesByMarketTab } from '@/components/dashboard/jurisdiction/RulesByMarketTab';`, add `<TabsTrigger value="rules">Rules by market</TabsTrigger>` after the Impact trigger and

```tsx
        <TabsContent value="rules" className="space-y-6">
          <RulesByMarketTab selectedSite={selectedSite} />
        </TabsContent>
```

after the impact `TabsContent`. Use the prop name CMPDashboard already passes to `ConsentImpact` (line 287); if it is not `selectedSite`, adjust the test regex.

- [ ] **Step 6: Run tests and type check**

Run: `node --test tests/foundation/jurisdiction-ui.test.mjs` then `npx tsc --noEmit -p tsconfig.app.json`
Expected: PASS; no new type errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/jurisdiction.ts src/lib/effectiveByMarket.ts src/hooks/useSiteJurisdiction.ts src/components/dashboard/jurisdiction src/components/dashboard/CMPDashboard.tsx tests/foundation/jurisdiction-ui.test.mjs
git commit -m "feat(jurisdiction): Rules by market tab (profile, tighten-only controls, effective rules)"
```

---

### Task 15: The banner sends its language; store-consent stores it (5.5.19)

**Files:**
- Create: `supabase/migrations/20261207000003_consent_banner_lang.sql`
- Modify: `public/consent-banner.js` (`postConsent` body, ~lines 514-526)
- Modify: `supabase/functions/store-consent/index.ts` (`consentData` and the update field list, ~lines 173-220)
- Modify (version 5.5.18 → 5.5.19): `wordpress-plugin/cortiq-analytics.php` (lines 6 and 24), `wordpress-plugin/readme.txt` (Stable tag line 6, new changelog entry above the `= 5.5.18 =` entry), `src/lib/plugin-version.ts` (line 6), `public/spa-tracking.js` (lines 4 and 20)
- Generated by the build and committed: `public/v/5.5.19/*`, `src/lib/sri-manifest.json`, per-language banner files, `public/cortiq-wordpress-plugin.zip` (the plugin version changed, so the zip is kept)
- Test: `tests/foundation/consent-banner-lang.test.mjs`
- Existing tests that must stay green: `version-sync.test.mjs`, `consent-banner.test.mjs`, `store-consent-geo-gpc.test.mjs`, `uptime-snippet-version.test.mjs`

**Interfaces:**
- Consumes: `cfg.lang` (set by `pickLang()`; `LANG_ALIAS` maps `no`/`nn` to `nb`), the 13 banner codes from `20261205000001_banner_languages.sql`.
- Produces: `cookie_consents.banner_lang text NULL` with CHECK on the 13 codes. `BANNER_LANGS: ReadonlySet<string>` in `supabase/functions/_shared/banner-langs.ts` (one list for the Edge Functions). Old rows and old banners: `NULL` (not `'sv'`). The existing `locale` column stays as it is (see Code surprises: it is always `'sv'`).

- [ ] **Step 1: Write the failing test**

```js
// tests/foundation/consent-banner-lang.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { loadEdge, mockDatabase } from './edge-harness.mjs';
import { BANNER_LANGS } from '../../supabase/functions/_shared/banner-langs.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const SITE = '11111111-1111-4111-8111-111111111111';
const LANGS = ['sv', 'en', 'de', 'fr', 'pt', 'nl', 'nb', 'da', 'fi', 'pl', 'it', 'es', 'is'];

test('one list of 13 codes, the same as the sites CHECK', () => {
  assert.deepEqual([...BANNER_LANGS].sort(), [...LANGS].sort());
  const sitesCheck = read('../../supabase/migrations/20261205000001_banner_languages.sql');
  for (const l of LANGS) assert.match(sitesCheck, new RegExp(`'${l}'`));
});

test('the banner posts the language it rendered in', () => {
  const src = read('../../public/consent-banner.js');
  const post = src.slice(src.indexOf('function postConsent'), src.indexOf('function postConsent') + 2000);
  assert.match(post, /banner_lang: cfg\.lang/);
});

async function store(bannerLang) {
  const db = mockDatabase((op) => {
    if (op.table === 'sites') return { data: { id: SITE }, error: null };
    if (op.table === 'cookie_consents' && op.type === 'select') return { data: null, error: null };
    if (op.table === 'cookie_consents' && op.type === 'insert') return { data: { id: 'row-1', ...op.payload }, error: null };
    return { data: null, error: null };
  }, async (name) => ({ data: name === 'check_rate_limit' ? true : null, error: null }));
  const handler = loadEdge('store-consent', db.client);
  const res = await handler(new Request('https://fn.test/store-consent', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ site_id: SITE, session_id: 'c-1', banner_lang: bannerLang, consent_types: { analytics: true, marketing: false, preferences: false } }),
  }));
  assert.equal(res.status, 200);
  return db.calls.find((c) => c.table === 'cookie_consents' && c.type === 'insert').payload.banner_lang;
}

test('store-consent keeps a known code and stores null for anything else', async () => {
  assert.equal(await store('fi'), 'fi');
  for (const bad of ['xx', 'SV', 'no', '', 42, null, undefined, 'sv-SE']) assert.equal(await store(bad), null, String(bad));
});

test('PostgreSQL: column accepts the 13 codes and NULL only', async () => {
  const pg = new PGlite();
  try {
    await pg.exec('CREATE TABLE public.cookie_consents (id serial PRIMARY KEY, locale text DEFAULT \'sv\');');
    await pg.exec(read('../../supabase/migrations/20261207000003_consent_banner_lang.sql'));
    for (const l of [...LANGS, null]) await pg.query('INSERT INTO cookie_consents (banner_lang) VALUES ($1)', [l]);
    await assert.rejects(pg.query("INSERT INTO cookie_consents (banner_lang) VALUES ('xx')"), /check/i);
  } finally { await pg.close(); }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/foundation/consent-banner-lang.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `banner-langs.ts`.

- [ ] **Step 3: Write the shared list and the migration**

```ts
// supabase/functions/_shared/banner-langs.ts
// The banner's languages. Same list as the sites.banner_language CHECK (20261205000001) and
// cookie_consents.banner_lang (20261207000003).
export const BANNER_LANGS: ReadonlySet<string> = new Set(['sv', 'en', 'de', 'fr', 'pt', 'nl', 'nb', 'da', 'fi', 'pl', 'it', 'es', 'is']);
export const bannerLangOf = (v: unknown): string | null => (typeof v === 'string' && BANNER_LANGS.has(v) ? v : null);
```

```sql
-- supabase/migrations/20261207000003_consent_banner_lang.sql
-- Spec 2026-11-18 phase 6 (thin slice): which banner language a visitor answered in, so acceptance
-- can be compared per country x language. NULL = an older banner or an unknown code.
ALTER TABLE public.cookie_consents ADD COLUMN IF NOT EXISTS banner_lang text;
ALTER TABLE public.cookie_consents DROP CONSTRAINT IF EXISTS cookie_consents_banner_lang_check;
ALTER TABLE public.cookie_consents ADD CONSTRAINT cookie_consents_banner_lang_check
  CHECK (banner_lang IS NULL OR banner_lang IN ('sv','en','de','fr','pt','nl','nb','da','fi','pl','it','es','is'));
COMMENT ON COLUMN public.cookie_consents.banner_lang IS 'Language the banner was shown in (5.5.19+). NULL for older banners.';
```

- [ ] **Step 4: Wire store-consent and the banner**

In `store-consent/index.ts`: `import { bannerLangOf } from '../_shared/banner-langs.ts';`, add `banner_lang: bannerLangOf(requestData.banner_lang),` to `consentData`, and add `banner_lang: consentData.banner_lang,` to the update path's field list (an updated answer can come from a banner in another language).

In `public/consent-banner.js`, in the JSON body built by `postConsent`, add `banner_lang: cfg.lang,` next to the existing consent fields. Do not touch `locale`.

- [ ] **Step 5: Bump the shared version to 5.5.19**

Change `5.5.18` to `5.5.19` in: `wordpress-plugin/cortiq-analytics.php` (header line 6 and the constant on line 24), `wordpress-plugin/readme.txt` (`Stable tag:` line 6), `src/lib/plugin-version.ts` (line 6), `public/spa-tracking.js` (header line 4 and the version constant on line 20). Add above the 5.5.18 changelog entry in `readme.txt`:

```
= 5.5.19 =
* The consent banner sends the language it was shown in with each answer, so acceptance can be compared per language.
```

`securityFix` stays unset for 5.5.19 (no security fix).

- [ ] **Step 6: Build and check the generated files**

Run: `node scripts/build-plugin.mjs` then `npm run build`, then `git status --short`.
Expected: new `public/v/5.5.19/` (cortiq.js, consent-banner.js, consent-banner.min.js and the 13 per-language files), `src/lib/sri-manifest.json` with a `5.5.19` entry, regenerated per-language banners, and a changed `public/cortiq-wordpress-plugin.zip`. Keep the zip in this task (the plugin version changed). No file under an existing `public/v/<older>/` may change; if one does, stop and check `scripts/pin-tracker.mjs`.

- [ ] **Step 7: Run tests**

Run: `node --test tests/foundation/consent-banner-lang.test.mjs tests/foundation/version-sync.test.mjs tests/foundation/consent-banner.test.mjs tests/foundation/store-consent-geo-gpc.test.mjs tests/foundation/uptime-snippet-version.test.mjs tests/foundation/jurisdiction-wiring-ads.test.mjs`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/_shared/banner-langs.ts supabase/migrations/20261207000003_consent_banner_lang.sql supabase/functions/store-consent/index.ts public/consent-banner.js wordpress-plugin/cortiq-analytics.php wordpress-plugin/readme.txt src/lib/plugin-version.ts public/spa-tracking.js public/v/5.5.19 src/lib/sri-manifest.json public/cortiq-wordpress-plugin.zip tests/foundation/consent-banner-lang.test.mjs
git add -u public
git commit -m "feat(banner): send the banner language with each answer (5.5.19)"
```

---

### Task 16: Aggregate goal conversions per country (signed geo only)

**Files:**
- Create: `supabase/migrations/20261207000004_aggregate_goal_countries.sql`
- Modify: `supabase/functions/aggregate-hit/index.ts` (page-visit goal loop ~line 136 and the form-goal ingest ~line 152)
- Test: `tests/foundation/aggregate-goal-countries.test.mjs`
- Existing test that must stay green: `aggregate-hit.test.mjs`, `jurisdiction-wiring-ingest.test.mjs`

**Interfaces:**
- Consumes: `aggregate_pages_daily` (retention anchor, as in `20261203000002_aggregate_countries.sql`), `geo` from `resolveGeo` in aggregate-hit.
- Produces: table `aggregate_goal_countries_daily(site_id, day, country, goal_id, conversions, PK(site_id, day, country, goal_id))`, owner SELECT under RLS; `ingest_aggregate_goal_country(p_site_id uuid, p_country text, p_goal_id text, p_now timestamptz DEFAULT now()) RETURNS void` (service role); `aggregate_goal_countries_retention()` with cron `'45 4 * * *'`. Country is only written when `geo.source === 'ip'` (signed edge geo); otherwise `''`. The page-view country table keeps its current behaviour (see Code surprises).

- [ ] **Step 1: Write the failing test**

```js
// tests/foundation/aggregate-goal-countries.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { loadEdge, mockDatabase } from './edge-harness.mjs';
import { signGeo, GEO_HEADER } from '../../supabase/functions/_shared/geo-token.js';

const SITE = '11111111-1111-4111-8111-111111111111';
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const KEY = 'tk_' + 'a'.repeat(32);
const GEO_KEY = 'k'.repeat(32);
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36';
const GOALS = [
  { id: 'g-form', name: 'Demo form', type: 'form_submission', selector: '#demo-form', value: 100 },
  { id: 'g-thanks', name: 'Thank-you page', type: 'page_visit', selector: '/tack' },
];

function setup({ ingest = { data: true, error: null } } = {}) {
  const rpcCalls = [];
  const db = mockDatabase((op) => {
    if (op.table === 'sites') {
      const byKey = op.filters.find(([k]) => k === 'tracking_id');
      return { data: byKey && byKey[1] === KEY ? { id: SITE, user_id: OWNER, is_active: true, domain: 'shop.test', aggregate_measurement: true, conversion_goals: GOALS } : null, error: null };
    }
    return { data: null, error: null };
  }, async (name, args) => {
    rpcCalls.push({ name, args });
    if (name === 'aggregate_daily_salt') return { data: 'f'.repeat(64), error: null };
    if (name === 'ingest_aggregate_hit') return ingest;
    if (name === 'get_site_jurisdiction') return { data: null, error: null };
    return { data: true, error: null };
  });
  return { rpcCalls, handler: loadEdge('aggregate-hit', db.client, { env: { GEO_SIGNING_KEY: GEO_KEY } }) };
}
const post = (body, headers = {}) => new Request('https://fn.test/aggregate-hit', {
  method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'user-agent': CHROME, 'cf-connecting-ip': '203.0.113.9', ...headers },
  body: JSON.stringify({ siteId: SITE, ...body }),
});
const goalCountries = (rpcCalls) => rpcCalls.filter((c) => c.name === 'ingest_aggregate_goal_country').map((c) => [c.args.p_goal_id, c.args.p_country]);
const signed = async (country) => ({ [GEO_HEADER]: await signGeo({ country, region: null, ip: '203.0.113.9' }, GEO_KEY, Math.floor(Date.now() / 1000)) });

test('page-visit and form goals are counted per signed country', async () => {
  const { handler, rpcCalls } = setup();
  await handler(post({ kind: 'pageview', url: 'https://shop.test/tack' }, await signed('NO')));
  await handler(post({ kind: 'goal', url: 'https://shop.test/demo', goalId: 'g-form' }, await signed('DE')));
  assert.deepEqual(goalCountries(rpcCalls), [['g-thanks', 'NO'], ['g-form', 'DE']]);
});

test('time-zone geo is not used for goal countries; burst-dropped views add nothing', async () => {
  const tz = setup();
  await tz.handler(post({ kind: 'pageview', url: 'https://shop.test/tack', tz: 'Europe/Stockholm' }));
  assert.deepEqual(goalCountries(tz.rpcCalls), [['g-thanks', '']]);
  const burst = setup({ ingest: { data: false, error: null } });
  await burst.handler(post({ kind: 'pageview', url: 'https://shop.test/tack' }, await signed('NO')));
  assert.deepEqual(goalCountries(burst.rpcCalls), []);
});

test('PostgreSQL: daily counts per country and goal, owner RLS, service-role ingest, retention', async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      CREATE TABLE public.sites (id uuid PRIMARY KEY, user_id uuid);
      CREATE TABLE public.aggregate_pages_daily (site_id uuid, day date);
      INSERT INTO sites VALUES ('${SITE}', '${OWNER}');
      INSERT INTO aggregate_pages_daily VALUES ('${SITE}', '2026-11-01');`);
    await pg.exec(readFileSync(new URL('../../supabase/migrations/20261207000004_aggregate_goal_countries.sql', import.meta.url), 'utf8'));
    const ing = (c, g, now) => pg.query('SELECT public.ingest_aggregate_goal_country($1, $2, $3, $4)', [SITE, c, g, now]);
    await ing('se', 'g-1', '2026-11-02T10:00:00Z'); await ing('SE', 'g-1', '2026-11-02T11:00:00Z'); await ing('XX', 'g-1', '2026-11-02T12:00:00Z');
    await ing('SE', 'g-1', '2026-10-01T00:00:00Z');
    const rows = (await pg.query('SELECT day::text, country, goal_id, conversions FROM aggregate_goal_countries_daily ORDER BY day, country')).rows;
    assert.deepEqual(rows, [
      { day: '2026-10-01', country: 'SE', goal_id: 'g-1', conversions: 1 },
      { day: '2026-11-02', country: '', goal_id: 'g-1', conversions: 1 },
      { day: '2026-11-02', country: 'SE', goal_id: 'g-1', conversions: 2 },
    ]);
    assert.equal((await pg.query('SELECT public.aggregate_goal_countries_retention() n')).rows[0].n, 1, 'older than the oldest page day');
    for (const role of ['anon', 'authenticated']) {
      const g = (await pg.query(`SELECT has_function_privilege('${role}', 'public.ingest_aggregate_goal_country(uuid,text,text,timestamptz)', 'EXECUTE') a`)).rows[0].a;
      assert.equal(g, false, role);
    }
    await assert.rejects(ing('SE', 'x'.repeat(201), '2026-11-02T10:00:00Z'), /check/i);
  } finally { await pg.close(); }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/foundation/aggregate-goal-countries.test.mjs`
Expected: FAIL (no `ingest_aggregate_goal_country` calls; migration file missing).

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20261207000004_aggregate_goal_countries.sql
-- Spec 2026-11-18 phase 6 (thin slice): consent-free goal conversions per country per day, for
-- per-country pixel readiness. Country only from the signed edge geo ('' otherwise). Daily counts,
-- no visitor key.
CREATE TABLE IF NOT EXISTS public.aggregate_goal_countries_daily (
  site_id     uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  day         date NOT NULL,
  country     text NOT NULL DEFAULT '' CHECK (country = '' OR country ~ '^[A-Z]{2}$'),
  goal_id     text NOT NULL CHECK (length(goal_id) BETWEEN 1 AND 200),
  conversions integer NOT NULL DEFAULT 0 CHECK (conversions >= 0),
  PRIMARY KEY (site_id, day, country, goal_id)
);
ALTER TABLE public.aggregate_goal_countries_daily ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Site owners read aggregate goal countries" ON public.aggregate_goal_countries_daily;
CREATE POLICY "Site owners read aggregate goal countries" ON public.aggregate_goal_countries_daily
  FOR SELECT TO authenticated
  USING (site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.ingest_aggregate_goal_country(p_site_id uuid, p_country text, p_goal_id text, p_now timestamptz DEFAULT now())
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_c text := upper(coalesce(trim(p_country), ''));
BEGIN
  IF v_c !~ '^[A-Z]{2}$' OR v_c IN ('XX', 'T1') THEN v_c := ''; END IF;
  INSERT INTO public.aggregate_goal_countries_daily (site_id, day, country, goal_id, conversions)
  VALUES (p_site_id, (p_now AT TIME ZONE 'UTC')::date, v_c, p_goal_id, 1)
  ON CONFLICT (site_id, day, country, goal_id) DO UPDATE SET conversions = public.aggregate_goal_countries_daily.conversions + 1;
END $$;
REVOKE ALL ON FUNCTION public.ingest_aggregate_goal_country(uuid, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_aggregate_goal_country(uuid, text, text, timestamptz) TO service_role;

-- Same retention as aggregate_countries_daily: rows older than the oldest remaining page day go.
CREATE OR REPLACE FUNCTION public.aggregate_goal_countries_retention()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE n integer;
BEGIN
  DELETE FROM public.aggregate_goal_countries_daily c
   WHERE NOT EXISTS (SELECT 1 FROM public.aggregate_pages_daily p WHERE p.site_id = c.site_id AND p.day <= c.day);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.aggregate_goal_countries_retention() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aggregate_goal_countries_retention() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('aggregate-goal-countries-retention', '45 4 * * *', 'SELECT public.aggregate_goal_countries_retention()');
  END IF;
END $$;
```

- [ ] **Step 4: Wire aggregate-hit**

After the `ingest` helper, add:

```ts
  // Goal conversions per country for per-country pixel readiness. Signed edge geo only: the
  // time-zone fallback is a guess and must not drive a per-country recommendation.
  const goalCountry = async (goalId: string) => {
    const { error } = await supabase.rpc('ingest_aggregate_goal_country',
      { p_site_id: site.id, p_country: geo.source === 'ip' ? geo.country : '', p_goal_id: goalId });
    if (error) console.error('aggregate-hit: goal country ingest failed:', error.message);
  };
```

In the page-visit loop, replace the single `await ingest({...})` with:

```ts
      const goalCounted = await ingest({ ...base, ...noSource, p_kind: 'goal', p_goal_id: goal.id, p_goal_name: goal.name, p_value: num(goal.value) });
      if (goalCounted !== false) await goalCountry(goal.id);
```

In the form-goal tail, assign `const goalId = goal ? goal.id : fallback.id;`, use it as `p_goal_id`, capture the ingest result the same way and call `goalCountry(goalId)` when it is not `false`.

- [ ] **Step 5: Run tests**

Run: `node --test tests/foundation/aggregate-goal-countries.test.mjs tests/foundation/aggregate-hit.test.mjs tests/foundation/jurisdiction-wiring-ingest.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261207000004_aggregate_goal_countries.sql supabase/functions/aggregate-hit/index.ts tests/foundation/aggregate-goal-countries.test.mjs
git commit -m "feat(aggregate): goal conversions per signed country"
```

---

### Task 17: Coverage and acceptance per country (read RPCs)

**Files:**
- Create: `supabase/migrations/20261207000005_coverage_by_country.sql`
- Modify: `src/integrations/supabase/types.ts` (Functions: the two RPCs; Tables: `aggregate_goal_countries_daily`, `cookie_consents.banner_lang`)
- Test: `tests/foundation/coverage-by-country-db.test.mjs`

**Interfaces:**
- Consumes: `jurisdiction_decisions_daily` (Task 8, owner RLS), `cookie_consents` (owner SELECT policy from `20250719054801`; `geo_country`, `geo_source`, `banner_lang`, `consent_types`, `created_at`).
- Produces (both `SECURITY INVOKER`, `STABLE`, `GRANT EXECUTE ... TO authenticated`; RLS limits rows to the caller's sites):
  - `coverage_by_country(p_site_id uuid, p_from date, p_to date) RETURNS TABLE(country text, purpose text, decisions bigint, permitted bigint, refused bigint, missing bigint, gpc bigint, blocked bigint, enforced_drops bigint)`. `permitted` = reason `allowed`; `refused` = `consent_refused` + `opt_out`; `missing` = `consent_missing`; `blocked` = `rule_blocked` + `customer_off`; `enforced_drops` = not permitted and `enforced`. `p_to` inclusive.
  - `consent_acceptance_by_country_lang(p_site_id uuid, p_from date, p_to date) RETURNS TABLE(country text, banner_lang text, answers bigint, analytics_accepted bigint, marketing_accepted bigint)`. Country only from `geo_source = 'ip'`, else `''`; `banner_lang` `''` when NULL. Accepted = JSON boolean `true` only.

- [ ] **Step 1: Write the failing test**

```js
// tests/foundation/coverage-by-country-db.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jurisdictionDb, asUser, read, OWNER, OTHER, S1, S2 } from './jurisdiction-db-fixture.mjs';

// Same legacy shape the Task 8 migration expects (see jurisdiction-decisions-db.test.mjs).
const EXTRA = `
  CREATE TABLE public.companies (id uuid PRIMARY KEY, jurisdiction text NOT NULL DEFAULT 'eu_strict', auto_eu_geo_override boolean NOT NULL DEFAULT true);
  CREATE FUNCTION public.effective_pipeline_mode(p_company_id uuid, p_visitor_country text DEFAULT NULL) RETURNS text LANGUAGE sql AS $$ SELECT 'x' $$;
  CREATE TABLE public.conversion_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id uuid, upload_status text);
  ALTER TABLE public.conversion_events ADD CONSTRAINT conversion_events_upload_status_check CHECK (upload_status IN (
    'not_applicable','pending','uploading','uploaded','skipped_no_consent','skipped_no_gclid','failed'));
  CREATE TABLE public.cookie_consents (site_id uuid, created_at timestamptz, consent_types jsonb, geo_country text, geo_source text, banner_lang text);
  ALTER TABLE public.cookie_consents ENABLE ROW LEVEL SECURITY;
  CREATE POLICY owner_view ON public.cookie_consents FOR SELECT USING (EXISTS (SELECT 1 FROM public.sites WHERE sites.id = cookie_consents.site_id AND sites.user_id = auth.uid()));`;

async function db() {
  const pg = await jurisdictionDb(EXTRA);
  await pg.exec(read('../../supabase/migrations/20261207000002_jurisdiction_decisions.sql'));
  await pg.exec(read('../../supabase/migrations/20261207000005_coverage_by_country.sql'));
  await pg.exec('GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;');
  const log = (site, country, reason, enforced, count, day = '2026-11-10') => pg.query(
    'SELECT public.log_jurisdiction_decision($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
    [site, 'aggregate-hit', 'statistics', country, 'baseline',
     reason === 'customer_off' ? 'blocked' : reason === 'allowed' || reason === 'opt_out' ? 'allowed_unless_opt_out' : 'needs_opt_in',
     reason, 'none', enforced, count, `${day}T10:00:00Z`]);
  await log(S1, 'SE', 'allowed', false, 7);
  await log(S1, 'SE', 'consent_missing', true, 3);
  await log(S1, 'SE', 'opt_out', false, 1);
  await log(S1, 'DE', 'customer_off', true, 2);
  await log(S1, 'SE', 'allowed', false, 50, '2026-09-01');   // out of range
  await log(S2, 'SE', 'allowed', false, 99);
  await pg.exec(`INSERT INTO cookie_consents VALUES
    ('${S1}', '2026-11-10', '{"analytics":true,"marketing":false}', 'SE', 'ip', 'sv'),
    ('${S1}', '2026-11-10', '{"analytics":false,"marketing":false}', 'SE', 'ip', 'sv'),
    ('${S1}', '2026-11-10', '{"analytics":"yes","marketing":true}', 'SE', 'ip', 'en'),
    ('${S1}', '2026-11-10', '{"analytics":true,"marketing":true}', 'SE', 'timezone', NULL),
    ('${S2}', '2026-11-10', '{"analytics":true,"marketing":true}', 'NO', 'ip', 'nb');`);
  return pg;
}

test('coverage_by_country: counts per country and purpose in range, owner only', async () => {
  const pg = await db();
  try {
    const rows = (await asUser(pg, OWNER, () => pg.query(`SELECT * FROM public.coverage_by_country('${S1}', '2026-11-01', '2026-11-30') ORDER BY country`))).rows
      .map((r) => [r.country, r.purpose, ...['decisions', 'permitted', 'refused', 'missing', 'gpc', 'blocked', 'enforced_drops'].map((k) => Number(r[k]))]);
    assert.deepEqual(rows, [['DE', 'statistics', 2, 0, 0, 0, 0, 2, 2], ['SE', 'statistics', 11, 7, 1, 3, 0, 0, 3]]);
    const foreign = (await asUser(pg, OTHER, () => pg.query(`SELECT * FROM public.coverage_by_country('${S1}', '2026-11-01', '2026-11-30')`))).rows;
    assert.equal(foreign.length, 0, 'RLS: another owner sees nothing');
    assert.equal((await pg.query(`SELECT has_function_privilege('anon', 'public.coverage_by_country(uuid,date,date)', 'EXECUTE') a`)).rows[0].a, false);
  } finally { await pg.close(); }
});

test('consent_acceptance_by_country_lang: signed country only, boolean true only', async () => {
  const pg = await db();
  try {
    const rows = (await asUser(pg, OWNER, () => pg.query(`SELECT * FROM public.consent_acceptance_by_country_lang('${S1}', '2026-11-01', '2026-11-30') ORDER BY country, banner_lang`))).rows
      .map((r) => [r.country, r.banner_lang, Number(r.answers), Number(r.analytics_accepted), Number(r.marketing_accepted)]);
    assert.deepEqual(rows, [['', '', 1, 1, 1], ['SE', 'en', 1, 0, 1], ['SE', 'sv', 2, 1, 0]]);
    assert.equal((await asUser(pg, OTHER, () => pg.query(`SELECT * FROM public.consent_acceptance_by_country_lang('${S1}', '2026-11-01', '2026-11-30')`))).rows.length, 0);
  } finally { await pg.close(); }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/foundation/coverage-by-country-db.test.mjs`
Expected: FAIL with `ENOENT` for `20261207000005_coverage_by_country.sql`.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20261207000005_coverage_by_country.sql
-- Spec 2026-11-18 phase 6 (thin slice): what the engine decided per country, and how visitors
-- answered the banner per country x banner language. SECURITY INVOKER: RLS on the source tables
-- limits rows to the caller's sites. Daily counts in, daily counts out.

CREATE OR REPLACE FUNCTION public.coverage_by_country(p_site_id uuid, p_from date, p_to date)
RETURNS TABLE(country text, purpose text, decisions bigint, permitted bigint, refused bigint, missing bigint,
              gpc bigint, blocked bigint, enforced_drops bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT d.country, d.purpose,
         sum(d.count)::bigint,
         coalesce(sum(d.count) FILTER (WHERE d.reason = 'allowed'), 0)::bigint,
         coalesce(sum(d.count) FILTER (WHERE d.reason IN ('consent_refused', 'opt_out')), 0)::bigint,
         coalesce(sum(d.count) FILTER (WHERE d.reason = 'consent_missing'), 0)::bigint,
         coalesce(sum(d.count) FILTER (WHERE d.reason = 'gpc'), 0)::bigint,
         coalesce(sum(d.count) FILTER (WHERE d.reason IN ('rule_blocked', 'customer_off')), 0)::bigint,
         coalesce(sum(d.count) FILTER (WHERE d.reason <> 'allowed' AND d.enforced), 0)::bigint
    FROM public.jurisdiction_decisions_daily d
   WHERE d.site_id = p_site_id AND d.day BETWEEN p_from AND p_to
   GROUP BY d.country, d.purpose;
$$;
REVOKE ALL ON FUNCTION public.coverage_by_country(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coverage_by_country(uuid, date, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.consent_acceptance_by_country_lang(p_site_id uuid, p_from date, p_to date)
RETURNS TABLE(country text, banner_lang text, answers bigint, analytics_accepted bigint, marketing_accepted bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT CASE WHEN c.geo_source = 'ip' AND c.geo_country ~ '^[A-Z]{2}$' THEN c.geo_country ELSE '' END AS country,
         coalesce(c.banner_lang, '') AS banner_lang,
         count(*)::bigint,
         count(*) FILTER (WHERE c.consent_types -> 'analytics' = 'true'::jsonb)::bigint,
         count(*) FILTER (WHERE c.consent_types -> 'marketing' = 'true'::jsonb)::bigint
    FROM public.cookie_consents c
   WHERE c.site_id = p_site_id AND c.created_at >= p_from AND c.created_at < p_to + 1
   GROUP BY 1, 2;
$$;
REVOKE ALL ON FUNCTION public.consent_acceptance_by_country_lang(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consent_acceptance_by_country_lang(uuid, date, date) TO authenticated, service_role;
```

`cookie_consents` rows expire and are deleted (`expires_at`), so acceptance covers the ledger's lifetime only. The card in Task 18 says so.

- [ ] **Step 4: Update `types.ts`**

Add under `Functions`, following the shape of `get_aggregate_summary`:

```ts
      coverage_by_country: {
        Args: { p_site_id: string; p_from: string; p_to: string }
        Returns: { country: string; purpose: string; decisions: number; permitted: number; refused: number; missing: number; gpc: number; blocked: number; enforced_drops: number }[]
      }
      consent_acceptance_by_country_lang: {
        Args: { p_site_id: string; p_from: string; p_to: string }
        Returns: { country: string; banner_lang: string; answers: number; analytics_accepted: number; marketing_accepted: number }[]
      }
```

Add an `aggregate_goal_countries_daily` table block (copy the `aggregate_countries_daily` block, rename it, replace `pageviews` with `conversions: number` and add `goal_id: string`) and `banner_lang: string | null` to the three `cookie_consents` blocks (Row, Insert `?`, Update `?`).

- [ ] **Step 5: Run tests and type check**

Run: `node --test tests/foundation/coverage-by-country-db.test.mjs` then `npx tsc --noEmit -p tsconfig.app.json`
Expected: PASS; no new type errors.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261207000005_coverage_by_country.sql src/integrations/supabase/types.ts tests/foundation/coverage-by-country-db.test.mjs
git commit -m "feat(jurisdiction): coverage and banner acceptance per country (read RPCs)"
```

---

### Task 18: Per-country pixel readiness and the coverage card

**Files:**
- Modify: `src/lib/pixelReadiness.ts` (append; existing exports unchanged)
- Create: `src/hooks/useCoverageByCountry.ts`
- Create: `src/components/dashboard/jurisdiction/CoverageByCountryCard.tsx`
- Modify: `src/components/dashboard/CMPDashboard.tsx` (impact `TabsContent`, ~line 287)
- Test: `tests/foundation/pixel-readiness-by-country.test.mjs`
- Existing test that must stay green unchanged: `pixel-readiness.test.mjs`

**Interfaces:**
- Consumes: `ASSUMED_ACCEPTANCE`, `SMART_BIDDING_MIN`, `SMART_BIDDING_COMFORTABLE` (same file); RPCs from Task 17; `aggregate_goal_countries_daily` from Task 16; `decide`, `marketOf`, `profileToCustomer` from `src/lib/jurisdiction.ts` (Task 14); `useSiteJurisdiction` (Task 14).
- Produces:

```ts
export const MIN_COUNTRY_ANSWERS = 20;
export interface CountryAcceptance { country: string; answers: number; analyticsAccepted: number; marketingAccepted: number }
export interface CountryReadinessInput {
  goalCountries: { country: string; conversions: number }[];   // consent-free (aggregate) counts, 30 days
  acceptance: CountryAcceptance[];                                // summed over banner languages
  blockedCountries: readonly string[];                            // ad_platform_sharing blocked by rule or customer "off"
  category?: 'analytics' | 'marketing';                           // default 'analytics'
}
export interface CountryReadinessRow {
  country: string; conversions: number; acceptanceUsed: number;
  acceptanceSource: 'country' | 'site' | 'assumed' | 'blocked'; effectiveConversions: number;
}
export interface CountryReadinessResult { rows: CountryReadinessRow[]; totalEffective: number; band: 'below_min' | 'borderline' | 'comfortable' }
export function assessPixelReadinessByCountry(input: CountryReadinessInput): CountryReadinessResult;
```

  Rules: per country, acceptance = that country's rate when it has ≥ `MIN_COUNTRY_ANSWERS` answers; else the site rate (all answers summed) when the site has any answers; else `ASSUMED_ACCEPTANCE`. A blocked country uses 0. The `''` bucket (unknown country) uses the site rate. `effectiveConversions = floor(conversions × acceptance + 1e-9)`; `totalEffective` is the sum. `band` uses the existing thresholds. Rows sorted by conversions, descending. Marketing acceptance is used only when `category: 'marketing'` (the card has a switch; default analytics, matching `assessPixelReadiness`).

- [ ] **Step 1: Write the failing test**

```js
// tests/foundation/pixel-readiness-by-country.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assessPixelReadinessByCountry, MIN_COUNTRY_ANSWERS, ASSUMED_ACCEPTANCE } from '../../src/lib/pixelReadiness.ts';

const acc = (country, answers, a, m = 0) => ({ country, answers, analyticsAccepted: a, marketingAccepted: m });

test('country rate from 20 answers, site rate below that, assumed without any answers', () => {
  assert.equal(MIN_COUNTRY_ANSWERS, 20);
  const r = assessPixelReadinessByCountry({
    goalCountries: [{ country: 'SE', conversions: 40 }, { country: 'NO', conversions: 10 }, { country: '', conversions: 5 }],
    acceptance: [acc('SE', 20, 15), acc('NO', 19, 19)],
    blockedCountries: [],
  });
  const by = Object.fromEntries(r.rows.map((x) => [x.country, x]));
  assert.deepEqual([by.SE.acceptanceSource, by.SE.acceptanceUsed, by.SE.effectiveConversions], ['country', 0.75, 30]);
  const siteRate = 34 / 39;
  assert.deepEqual([by.NO.acceptanceSource, by.NO.acceptanceUsed], ['site', siteRate]);
  assert.equal(by.NO.effectiveConversions, Math.floor(10 * siteRate + 1e-9));
  assert.equal(by[''].acceptanceSource, 'site');
  assert.equal(r.totalEffective, r.rows.reduce((s, x) => s + x.effectiveConversions, 0));
  assert.deepEqual(r.rows.map((x) => x.country), ['SE', 'NO', '']);

  const none = assessPixelReadinessByCountry({ goalCountries: [{ country: 'SE', conversions: 10 }], acceptance: [], blockedCountries: [] });
  assert.deepEqual([none.rows[0].acceptanceSource, none.rows[0].acceptanceUsed], ['assumed', ASSUMED_ACCEPTANCE]);
});

test('blocked countries count as zero; marketing acceptance only when asked; bands', () => {
  const input = { goalCountries: [{ country: 'SE', conversions: 100 }, { country: 'DE', conversions: 100 }], acceptance: [acc('SE', 40, 40, 20), acc('DE', 40, 40, 40)], blockedCountries: ['DE'] };
  const a = assessPixelReadinessByCountry(input);
  assert.deepEqual(a.rows.find((x) => x.country === 'DE'), { country: 'DE', conversions: 100, acceptanceUsed: 0, acceptanceSource: 'blocked', effectiveConversions: 0 });
  assert.deepEqual([a.totalEffective, a.band], [100, 'comfortable']);
  const m = assessPixelReadinessByCountry({ ...input, category: 'marketing' });
  assert.deepEqual([m.totalEffective, m.band], [50, 'comfortable']);
  const low = assessPixelReadinessByCountry({ ...input, goalCountries: [{ country: 'SE', conversions: 35 }], category: 'marketing' });
  assert.deepEqual([low.totalEffective, low.band], [17, 'below_min']);
});

test('junk input never throws or goes negative', () => {
  const r = assessPixelReadinessByCountry({ goalCountries: [{ country: 'SE', conversions: -5 }, { country: 'NO', conversions: NaN }], acceptance: [acc('SE', 0, 0)], blockedCountries: [] });
  assert.ok(r.rows.every((x) => x.effectiveConversions === 0));
});

test('card: verify path, technical-defaults disclaimer, no forbidden phrases', () => {
  const src = readFileSync(new URL('../../src/components/dashboard/jurisdiction/CoverageByCountryCard.tsx', import.meta.url), 'utf8');
  assert.match(src, /DISCLAIMER/);
  assert.match(src, /Verify:/);
  for (const bad of [/no consent needed/i, /GDPR-compliant without consent/i, /no banner needed/i]) assert.doesNotMatch(src, bad);
  const cmp = readFileSync(new URL('../../src/components/dashboard/CMPDashboard.tsx', import.meta.url), 'utf8');
  assert.match(cmp, /<CoverageByCountryCard selectedSite=\{selectedSite\} \/>/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/foundation/pixel-readiness-by-country.test.mjs`
Expected: FAIL with "does not provide an export named 'assessPixelReadinessByCountry'".

- [ ] **Step 3: Append to `src/lib/pixelReadiness.ts`**

```ts
// --- Per country (spec 2026-11-18 phase 6, thin slice) ---
// Consent-free goal counts per signed country x the acceptance an ad platform would see there.
// A country's own rate is used from MIN_COUNTRY_ANSWERS answers; below that the site rate.

export const MIN_COUNTRY_ANSWERS = 20;
export interface CountryAcceptance { country: string; answers: number; analyticsAccepted: number; marketingAccepted: number }
export interface CountryReadinessInput {
  goalCountries: { country: string; conversions: number }[];
  acceptance: CountryAcceptance[];
  blockedCountries: readonly string[];
  category?: 'analytics' | 'marketing';
}
export interface CountryReadinessRow {
  country: string; conversions: number; acceptanceUsed: number;
  acceptanceSource: 'country' | 'site' | 'assumed' | 'blocked'; effectiveConversions: number;
}
export interface CountryReadinessResult { rows: CountryReadinessRow[]; totalEffective: number; band: 'below_min' | 'borderline' | 'comfortable' }

const nonNeg = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0);

export function assessPixelReadinessByCountry(input: CountryReadinessInput): CountryReadinessResult {
  const field = input.category === 'marketing' ? 'marketingAccepted' : 'analyticsAccepted';
  const byCountry = new Map<string, { answers: number; accepted: number }>();
  let siteAnswers = 0, siteAccepted = 0;
  for (const a of input.acceptance) {
    const answers = nonNeg(a.answers), accepted = Math.min(answers, nonNeg(a[field]));
    siteAnswers += answers; siteAccepted += accepted;
    const cur = byCountry.get(a.country) ?? { answers: 0, accepted: 0 };
    byCountry.set(a.country, { answers: cur.answers + answers, accepted: cur.accepted + accepted });
  }
  const blocked = new Set(input.blockedCountries);
  const rows: CountryReadinessRow[] = input.goalCountries.map(({ country, conversions: raw }) => {
    const conversions = nonNeg(raw);
    let acceptanceUsed: number; let acceptanceSource: CountryReadinessRow['acceptanceSource'];
    const own = byCountry.get(country);
    if (country && blocked.has(country)) { acceptanceUsed = 0; acceptanceSource = 'blocked'; }
    else if (country && own && own.answers >= MIN_COUNTRY_ANSWERS) { acceptanceUsed = own.accepted / own.answers; acceptanceSource = 'country'; }
    else if (siteAnswers > 0) { acceptanceUsed = siteAccepted / siteAnswers; acceptanceSource = 'site'; }
    else { acceptanceUsed = ASSUMED_ACCEPTANCE; acceptanceSource = 'assumed'; }
    return { country, conversions, acceptanceUsed, acceptanceSource, effectiveConversions: Math.floor(conversions * acceptanceUsed + 1e-9) };
  }).sort((a, b) => b.conversions - a.conversions);
  const totalEffective = rows.reduce((s, r) => s + r.effectiveConversions, 0);
  const band = totalEffective < SMART_BIDDING_MIN ? 'below_min' : totalEffective < SMART_BIDDING_COMFORTABLE ? 'borderline' : 'comfortable';
  return { rows, totalEffective, band };
}
```

- [ ] **Step 4: Write the hook**

```ts
// src/hooks/useCoverageByCountry.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { decide, marketOf } from '@/lib/jurisdiction';
import { assessPixelReadinessByCountry, type CountryAcceptance, type CountryReadinessResult } from '@/lib/pixelReadiness';
import { useSiteJurisdiction } from '@/hooks/useSiteJurisdiction';
import type { Site } from '@/types/dashboard';

const DAY = 24 * 60 * 60 * 1000;
type Goal = { id?: string; name?: string; type?: string; is_primary?: boolean };

export interface CoverageRow { country: string; purpose: string; decisions: number; permitted: number; refused: number; missing: number; gpc: number; blocked: number; enforcedDrops: number }
export interface CoverageByCountry {
  coverage: CoverageRow[];
  acceptanceByLang: { country: string; bannerLang: string; answers: number; analyticsAccepted: number; marketingAccepted: number }[];
  readiness: CountryReadinessResult | null;   // null without a primary page-visit/form goal and aggregate measurement
  primaryGoalName: string | null;
  from: string; to: string;
}

export function useCoverageByCountry(selectedSite: Site, category: 'analytics' | 'marketing' = 'analytics') {
  const site = selectedSite as Site & { aggregate_measurement?: boolean; conversion_goals?: unknown };
  const j = useSiteJurisdiction(site.id);
  const goals = Array.isArray(site.conversion_goals) ? (site.conversion_goals as Goal[]) : [];
  const primary = goals.find((g) => g?.is_primary && typeof g.id === 'string') ?? null;
  const perCountry = site.aggregate_measurement === true && (primary?.type === 'page_visit' || primary?.type === 'form_submission');

  return useQuery({
    queryKey: ['coverage-by-country', site.id, primary?.id ?? null, perCountry, category, j.data?.tighten ?? null, j.data?.customer ?? null],
    enabled: !!site.id && !j.isLoading,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<CoverageByCountry> => {
      const now = Date.now();
      const from = new Date(now - 29 * DAY).toISOString().slice(0, 10);
      const to = new Date(now).toISOString().slice(0, 10);
      const args = { p_site_id: site.id, p_from: from, p_to: to };
      const [cov, acc] = await Promise.all([
        supabase.rpc('coverage_by_country', args),
        supabase.rpc('consent_acceptance_by_country_lang', args),
      ]);
      if (cov.error) throw new Error(cov.error.message);
      if (acc.error) throw new Error(acc.error.message);
      const coverage = (cov.data ?? []).map((r) => ({ country: r.country, purpose: r.purpose, decisions: Number(r.decisions), permitted: Number(r.permitted),
        refused: Number(r.refused), missing: Number(r.missing), gpc: Number(r.gpc), blocked: Number(r.blocked), enforcedDrops: Number(r.enforced_drops) }));
      const acceptanceByLang = (acc.data ?? []).map((r) => ({ country: r.country, bannerLang: r.banner_lang, answers: Number(r.answers),
        analyticsAccepted: Number(r.analytics_accepted), marketingAccepted: Number(r.marketing_accepted) }));

      let readiness: CountryReadinessResult | null = null;
      if (perCountry && primary?.id) {
        const { data, error } = await supabase.from('aggregate_goal_countries_daily')
          .select('country, conversions').eq('site_id', site.id).eq('goal_id', primary.id).gte('day', from).lte('day', to);
        if (error) throw new Error(error.message);
        const sums = new Map<string, number>();
        for (const r of data ?? []) sums.set(r.country, (sums.get(r.country) ?? 0) + Number(r.conversions));
        const acceptance = new Map<string, CountryAcceptance>();
        for (const a of acceptanceByLang) {
          const cur = acceptance.get(a.country) ?? { country: a.country, answers: 0, analyticsAccepted: 0, marketingAccepted: 0 };
          acceptance.set(a.country, { country: a.country, answers: cur.answers + a.answers,
            analyticsAccepted: cur.analyticsAccepted + a.analyticsAccepted, marketingAccepted: cur.marketingAccepted + a.marketingAccepted });
        }
        // A country is blocked for ad sharing when CortIQ's rules or the customer's own setting
        // block it even with marketing consent (the most an ad platform could ever get).
        const blockedCountries = [...sums.keys()].filter((c) => c && marketOf(c, null) && decide({
          visitor: { country: c, region: null, geoSource: 'ip' }, purpose: 'ad_platform_sharing',
          signals: { consent: { analytics: true, marketing: true }, evidence: 'ledger', gpc: false },
          technique: { storage: 'persistent', identifiers: 'cross_site' },
          customer: j.data?.customer ?? null, exceptions: [], tighten: j.data?.tighten ?? {}, testSite: false,
        }).outcome === 'blocked');
        readiness = assessPixelReadinessByCountry({
          goalCountries: [...sums].map(([country, conversions]) => ({ country, conversions })),
          acceptance: [...acceptance.values()], blockedCountries, category,
        });
      }
      return { coverage, acceptanceByLang, readiness, primaryGoalName: primary?.name ?? null, from, to };
    },
  });
}
```

The `decide` call sees no region, so US and Canada countries resolve to their strictest market (`us_ca` / `ca_qc`, per `marketOf` in Task 1); the card notes that state-level rules are not split out. If `src/types/dashboard`'s `Site` lacks `conversion_goals`, the cast above covers it, as in `usePixelReadiness.ts`.

- [ ] **Step 5: Write the card and register it**

```tsx
// src/components/dashboard/jurisdiction/CoverageByCountryCard.tsx
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { DISCLAIMER } from '@/lib/jurisdiction';
import { MIN_COUNTRY_ANSWERS } from '@/lib/pixelReadiness';
import { useCoverageByCountry } from '@/hooks/useCoverageByCountry';
import type { Site } from '@/types/dashboard';

const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : '—');
const SOURCE: Record<string, string> = { country: 'country rate', site: 'site rate', assumed: 'assumed', blocked: 'blocked by rules' };

export function CoverageByCountryCard({ selectedSite }: { selectedSite: Site | null }) {
  const [marketing, setMarketing] = useState(false);
  const q = useCoverageByCountry(selectedSite as Site, marketing ? 'marketing' : 'analytics');
  if (!selectedSite) return null;
  const d = q.data;
  const stats = (d?.coverage ?? []).filter((r) => r.purpose === 'statistics');
  return (
    <Card>
      <CardHeader>
        <CardTitle>Coverage by country</CardTitle>
        <CardDescription>Last 30 days. Decisions are daily counts from CortIQ's rule engine; countries come from the signed edge location only. {DISCLAIMER}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {q.error && <p className="text-sm text-destructive">Could not load coverage: {(q.error as Error).message}</p>}

        <section>
          <h4 className="mb-2 text-sm font-medium">Statistics: share measured per country</h4>
          {stats.length === 0 ? <p className="text-sm text-muted-foreground">No decisions logged yet.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground"><th>Country</th><th>Decisions</th><th>Measured</th><th>No answer</th><th>Refused</th><th>Stopped</th></tr></thead>
              <tbody>{stats.map((r) => (
                <tr key={r.country} className="border-t"><td>{r.country || 'Unknown'}</td><td>{r.decisions}</td><td>{pct(r.permitted, r.decisions)}</td>
                  <td>{pct(r.missing, r.decisions)}</td><td>{pct(r.refused + r.gpc, r.decisions)}</td><td>{r.enforcedDrops}</td></tr>))}
              </tbody>
            </table>)}
        </section>

        <section>
          <h4 className="mb-2 text-sm font-medium">Banner answers per country and language</h4>
          {(d?.acceptanceByLang.length ?? 0) === 0 ? <p className="text-sm text-muted-foreground">No banner answers in the ledger for this period.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground"><th>Country</th><th>Language</th><th>Answers</th><th>Analytics accepted</th><th>Marketing accepted</th></tr></thead>
              <tbody>{d!.acceptanceByLang.map((r) => (
                <tr key={`${r.country}-${r.bannerLang}`} className="border-t"><td>{r.country || 'Unknown'}</td><td>{r.bannerLang || 'Older banner'}</td><td>{r.answers}</td>
                  <td>{pct(r.analyticsAccepted, r.answers)}</td><td>{pct(r.marketingAccepted, r.answers)}</td></tr>))}
              </tbody>
            </table>)}
          <p className="mt-1 text-xs text-muted-foreground">Answers are deleted when they expire, so older periods show fewer.</p>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-medium">Pixel readiness per country</h4>
            <div className="flex items-center gap-2"><Switch id="mkt" checked={marketing} onCheckedChange={setMarketing} /><Label htmlFor="mkt">Use marketing acceptance</Label></div>
          </div>
          {!d?.readiness ? (
            <p className="text-sm text-muted-foreground">Needs aggregate measurement on and a primary page-visit or form goal.</p>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-muted-foreground"><th>Country</th><th>Conversions</th><th>Acceptance</th><th>Ad platform would see</th></tr></thead>
                <tbody>{d.readiness.rows.map((r) => (
                  <tr key={r.country} className="border-t"><td>{r.country || 'Unknown'}</td><td>{r.conversions}</td>
                    <td>{Math.round(r.acceptanceUsed * 100)}% ({SOURCE[r.acceptanceSource]})</td><td>{r.effectiveConversions}</td></tr>))}
                </tbody>
              </table>
              <p className="mt-2 text-sm">Total ≈ {d.readiness.totalEffective} per 30 days ({d.readiness.band.replace('_', ' ')}).</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Verify: goal “{d.primaryGoalName ?? '—'}”, {d.from} to {d.to}. A country's own rate is used from {MIN_COUNTRY_ANSWERS} answers, otherwise the site rate.
                US and Canadian states are not split out. Smart Bidding thresholds (~30/~50) are a rule of thumb; check Google Ads documentation.
              </p>
            </>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
```

In `CMPDashboard.tsx`: `import { CoverageByCountryCard } from '@/components/dashboard/jurisdiction/CoverageByCountryCard';` and add `<CoverageByCountryCard selectedSite={selectedSite} />` directly after `<ConsentImpact … />` inside the impact `TabsContent`.

- [ ] **Step 6: Run tests and type check**

Run: `node --test tests/foundation/pixel-readiness-by-country.test.mjs tests/foundation/pixel-readiness.test.mjs tests/foundation/jurisdiction-ui.test.mjs` then `npx tsc --noEmit -p tsconfig.app.json`
Expected: PASS; no new type errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/pixelReadiness.ts src/hooks/useCoverageByCountry.ts src/components/dashboard/jurisdiction/CoverageByCountryCard.tsx src/components/dashboard/CMPDashboard.tsx tests/foundation/pixel-readiness-by-country.test.mjs
git commit -m "feat(jurisdiction): coverage, acceptance per language and pixel readiness per country"
```

---

### Task 19: Docs, runbook and the jurist review step

**Files:**
- Modify: `CLAUDE.md` (new section after "GTM container audit")
- Create: `docs/runbooks/jurisdiction-enforcement.md`
- Test: `tests/foundation/jurisdiction-docs.test.mjs`

**Interfaces:**
- Consumes: everything above.
- Produces: the operating rules for flipping `JURISDICTION_ENFORCE` and for approving a rule.

- [ ] **Step 1: Write the failing test**

```js
// tests/foundation/jurisdiction-docs.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('CLAUDE.md and the runbook carry the operating rules', () => {
  const md = read('../../CLAUDE.md');
  const section = md.slice(md.indexOf('## Jurisdiction rule engine'));
  for (const s of ['_shared/jurisdiction/', 'JURISDICTION_ENFORCE', 'approved_internal', 'tighten', 'jurisdiction_decisions_daily', 'docs/runbooks/jurisdiction-enforcement.md', 'not legal advice'])
    assert.ok(section.includes(s), s);
  const rb = read('../../docs/runbooks/jurisdiction-enforcement.md');
  for (const s of ['shadow', 'coverage_by_country', 'jurist', 'roll back', 'db push']) assert.ok(rb.toLowerCase().includes(s.toLowerCase()), s);
  for (const bad of [/no consent needed/i, /GDPR-compliant without consent/i, /no banner needed/i]) {
    assert.doesNotMatch(section, bad);
    assert.doesNotMatch(rb, bad);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/foundation/jurisdiction-docs.test.mjs`
Expected: FAIL (section missing).

- [ ] **Step 3: Add the CLAUDE.md section**

```markdown
---

## Jurisdiction rule engine (added 2026-11-20)

Spec: `docs/superpowers/specs/2026-11-18-jurisdiction-aware-measurement-design.md`. Plan: `docs/superpowers/plans/2026-11-20-jurisdiction-phase3-rule-engine.md`.

- **One engine:** `supabase/functions/_shared/jurisdiction/` (`decide()`), read by the Edge Functions through
  `_shared/jurisdiction-edge.ts` and by the dashboard through `src/lib/jurisdiction.ts`. Never a second copy.
- **Rules:** only `approved_internal` and above apply on customer sites; `draft`/`reviewed_agent` only on admin-flagged
  test sites (`jurisdiction_test_sites`). Without an approved rule the baseline applies: opt-in for every purpose.
  Approving a rule is its own reviewed commit with a jurist review; legal text in a rule is a hypothesis until then.
- **The server decides; the customer can only tighten** (`site_jurisdiction_tighten`: `opt_in` / `off`). Relaxing needs
  an approved exception (`jurisdiction_exceptions`, max 12 months; no write path in phase 3). Hard floors: GPC stops
  sharing purposes, EU cross-site identifiers need opt-in.
- **Shadow by default:** every ingest function logs its decision to `jurisdiction_decisions_daily` (daily counts only,
  country from signed edge geo only, 400 days). `JURISDICTION_ENFORCE` (`all` or a comma list of function names)
  turns dropping on. store-consent always logs, never blocks. Flip only per
  `docs/runbooks/jurisdiction-enforcement.md`.
- **Copy:** "CortIQ's technical defaults, not legal advice" (`DISCLAIMER`). Never "no consent needed",
  "GDPR-compliant without consent" or "no banner needed".
- Phase 6 slice: `coverage_by_country`, `consent_acceptance_by_country_lang` (banner sends `banner_lang` from 5.5.19),
  `aggregate_goal_countries_daily`, `assessPixelReadinessByCountry` (Consent → Impact).
```

- [ ] **Step 4: Write the runbook**

```markdown
# Runbook: jurisdiction enforcement

Technical defaults, not legal advice. Every step that changes what is measured needs Daniel's go.

## Deploy order (any change to the engine or its tables)
1. `supabase db push --remote --yes` (migrations 20261207000001–5) before any function deploy.
2. `supabase functions deploy` for the changed functions (all ingest functions import `_shared/jurisdiction-edge.ts`).
3. `npm run build`; dist FTP when the dashboard changed. Revert `public/cortiq-wordpress-plugin.zip` unless the plugin changed.

## Before turning on enforcement for a function
1. Run in shadow for at least 14 days after deploy.
2. Check `select * from coverage_by_country('<site>', current_date - 14, current_date)` for each active site: the
   `missing` and `refused` columns are what enforcement would stop. Compare with the site's banner acceptance.
3. Check `jurisdiction_decisions_daily` for `rule_id = 'baseline'` on functions that should run on an approved rule.
   While no rule is approved, enforcement on aggregate-hit and server-hit stops all consent-free counting.
4. Get Daniel's go, then `supabase secrets set JURISDICTION_ENFORCE=<function>[,<function>]`. Picked up on the next cold start.

## Roll back
`supabase secrets set JURISDICTION_ENFORCE=` (empty = shadow everywhere). No data is lost: shadow logs continue.

## Approving a rule (phase 4 work, listed here so it is not skipped)
1. Jurist review of the rule's legal hypothesis, references and the `DISCLAIMER` copy (jurist agent first, then a
   human lawyer for any public claim; DPA update if the processing changes).
2. Separate commit that sets `status: 'approved_internal'`, `approval` and `reviewDue`; bump `PACK_VERSION`.
3. Deploy (order above). Watch `coverage_by_country` for a week.
```

- [ ] **Step 5: Run tests**

Run: `node --test tests/foundation/jurisdiction-docs.test.mjs`
Expected: PASS.

- [ ] **Step 6: Full suite**

Run: `node --test tests/foundation/*.test.mjs` then `npx tsc --noEmit -p tsconfig.app.json` then `npm run build` and `git status --short`.
Expected: all PASS; build succeeds; if `public/cortiq-wordpress-plugin.zip` shows as modified after this build, run `git checkout -- public/cortiq-wordpress-plugin.zip` (the plugin did not change after Task 15).

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md docs/runbooks/jurisdiction-enforcement.md tests/foundation/jurisdiction-docs.test.mjs
git commit -m "docs(jurisdiction): CLAUDE.md section and enforcement runbook"
```

- [ ] **Step 8: Jurist review (no code)**

Before the PR is merged, run the `jurist` agent on: the three rules in `packs.ts` (hypothesis text and references), `PROFILE_QUESTIONS`, `DISCLAIMER`, the Rules by market tab copy and the coverage card copy. Record findings in the PR body. No rule changes status in this PR whatever the review says.

---

## Deploy (only after Daniel's go; none of this is part of executing the plan)

1. Merge the PR.
2. `supabase db push --remote --yes` (20261207000001 … 20261207000005). Check: `select count(*) from jurisdiction_decisions_daily;` returns 0 and `select get_site_jurisdiction('<a site id>');` returns the strict shape.
3. `supabase functions deploy aggregate-hit server-hit ai-bot-tracker track-event visitor-identification record-conversion store-consent google-ads-quality-upload geo-check`. `JURISDICTION_ENFORCE` stays unset (shadow).
4. `npm run build`, dist FTP (includes `public/v/5.5.19/`; never delete older `public/v/` folders). Check CSP reports afterwards (`select * from csp_reports order by last_seen desc`).
5. Release 5.5.19 for the WordPress plugin.
6. After 24 h: `select fn, purpose, outcome, reason, evidence, sum(count) from jurisdiction_decisions_daily group by 1,2,3,4,5 order by 6 desc;` must show rows from every deployed function.

---

## Self-review

- **Spec coverage (phase 3):** engine types and markets (Task 1), baseline and pack with honest statuses (2), technique constraints and hard floors (3), decide with tighten and exceptions (4), profile questions and disclaimer (5), legacy removal (6), profile/tighten/exceptions/test-site tables (7), decision log and AC1 migration (8), edge glue (9), wiring of all ingest functions (10–12), geo-check (13), UI (14). Phase 6 slice: banner language (15), goal countries (16), coverage and acceptance RPCs (17), per-country pixel readiness and card (18). Docs, runbook, jurist step (19).
- **Not covered on purpose:** rule packs and the approval screen (phase 4), exception write path (phase 4), region-level US/Canada split in pixel readiness, per-country readiness for click goals (no country on `conversion_events`).
- **Placeholder scan:** done; steps that depend on code the plan could not read in full (track-event's credential header in Task 11, `LegalProfileForm` layout in Task 14) say exactly what to copy from where.
- **Type consistency:** `SitePolicy`, `decideAndLog`, `signalsFrom`, `visitorFrom`, `gateAdsUpload` match Task 9; table `site_jurisdiction_tighten(purpose, setting)` matches Task 7 in Task 14; `log_jurisdiction_decision` maps an empty rule list to `'baseline'` (Task 8), which Task 17's test relies on.
- **Review Focus:** each of the five lines has a test in its owning task (Tasks 9–11).


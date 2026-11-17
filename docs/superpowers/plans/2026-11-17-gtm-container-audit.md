# GTM Container Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public page, `/gtm-audit/`, where anyone drops a Google Tag Manager container export (JSON) and gets a report on consent gaps, visitor identification, dead/duplicate/stale tags and a migration class per tag. The file is parsed in the browser and never leaves it. Anonymous aggregate counters only.

**Architecture:** A pure engine in `supabase/functions/_shared/gtm-audit/` (parse → identify → consent → rules → migrate → stats), imported by the React page through relative imports the same way `src/` already imports `_shared/tracking-check/report.ts`. Findings reuse Tracking Check's `Finding` type with a new scope `'GTM'`. A tiny public edge function `gtm-audit-stats` validates a whitelisted counter payload with the same shared module and increments `gtm_audit_stats_daily`.

**Tech Stack:** TypeScript (erasable syntax, runs directly in Node tests and Deno), React 18 + Vite + Tailwind + shadcn/ui, exceljs (lazy), Supabase Edge Functions + Postgres, `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-17-gtm-container-audit-design.md`

## Global Constraints

- The container file never leaves the browser. The only network call from the page is the stats POST, built only by `buildStats()`.
- Stats contain no names, container IDs, domains, URLs or HTML — only whitelisted keys (engine version, tag-count bucket, GTM tag types, registry vendor IDs or `unknown`, checkKeys, migration classes) and integer counts.
- Synthetic data only in fixtures, samples and tests: `example.com`, `GTM-SAMPLE1`, invented names and IDs. Never a real customer container.
- Copy rule: "no consent condition found" — never "fires without consent". Every finding's first evidence line is `Evidence level: configuration (container export, not observed live)`.
- Migration classes are phrased as facts, never as promises of features that do not exist yet.
- Engine never throws on unexpected shapes; HTML from the container is treated as text, never rendered or executed.
- Node runs these `.ts` files directly: type-only imports MUST use `import type`, every relative import needs an explicit `.ts` extension, no enums, no parameter properties, no namespaces.
- UI copy, code and comments in English.
- Vendor names on public pages come from the registry (`tests/foundation/marketing-bot-claims.test.mjs` still applies).
- Run one test file: `node --test tests/foundation/<file>.test.mjs`. All: `npm run test:foundation`.
- Every commit ends with the trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Deviation from the spec

- **Fibbler is not added to the registry.** It loads the Leadfeeder script (`sc.lfeeder.com`), so a request or template URL cannot tell the two apart; Fibbler containers are reported as Leadfeeder.
- **Clay** is the existing `claydar` registry entry; no new entry.
- **wingify (VWO)** has no verified official gallery template; VWO is identified through URLs (`visualwebsiteoptimizer.com`) only.

## Review Focus

1. Hostile or malformed JSON (`__proto__` keys, wrong types, `null` where arrays are expected, strings where objects are expected) must never throw — the user sees a report or a clear parse error. Pinned by a fuzz test in Task 2.
2. Exports from the GTM API (camelCase enums such as `notSet`/`needed`) and hand-made exports without `exportFormatVersion` must still parse. Pinned in Task 2.
3. Trigger groups that reference each other in a cycle, or reference missing trigger IDs, must not hang or crash consent evaluation. Pinned in Task 4.
4. Huge containers (hundreds of tags) must keep each stats counter capped and accepted by the server; a tag named `=HYPERLINK(...)` must stay text in the Excel export. Pinned in Tasks 7 and 9.
5. A custom template whose permissions list both an infrastructure URL (jsDelivr) and a vendor URL, and wildcard URLs like `https://*.cookiebot.com/*`, must identify the vendor, not the CDN. Pinned in Task 3.

## File map

| File | Responsibility |
|---|---|
| `supabase/functions/_shared/tracking-vendors.ts` (modify) | New vendors + `identifiesVisitors` flag |
| `supabase/functions/_shared/tracking-check/types.ts` (modify) | `Scope` gains `'GTM'` |
| `supabase/functions/_shared/gtm-audit/types.ts` | All engine types and const arrays |
| `.../gtm-audit/tag-types.ts` | GTM built-in tag type tables (no deps) |
| `.../gtm-audit/parse.ts` | `parse(json)` → `Container \| ParseError` |
| `.../gtm-audit/gallery-map.ts` | `owner/repository` → vendor |
| `.../gtm-audit/identify.ts` | `identify(tag, container)` |
| `.../gtm-audit/consent.ts` | `consentStatus(tag, container)` |
| `.../gtm-audit/info.ts` | `tagInfos(container)`: identification + consent per tag |
| `.../gtm-audit/covered.ts` | `coveredReason(info)`: what CortIQ already does |
| `.../gtm-audit/rules/finding.ts` | Finding builder and label helpers |
| `.../gtm-audit/rules/consent.ts`, `rules/hygiene.ts`, `rules/index.ts` | Findings |
| `.../gtm-audit/migrate.ts` | Migration class per tag |
| `.../gtm-audit/audit.ts` | `audit(json)` orchestrator + summary |
| `.../gtm-audit/stats.ts` | Whitelisted stats payload, validator, rows |
| `.../gtm-audit/report.ts` | `reportData(result)`: rows the UI and export see (no raw HTML) |
| `.../gtm-audit/sheets.ts` | Rows for the Excel export |
| `supabase/functions/gtm-audit-stats/index.ts` + migration + `config.toml` | Counter ingestion |
| `scripts/gtm-audit/fixture.mjs`, `scripts/gtm-audit/sample-report.mjs` | Synthetic container + sample generator |
| `src/data/gtmAuditSample.ts` | Committed sample result (generated) |
| `src/lib/gtmAuditXlsx.ts`, `src/lib/gtmAuditStats.ts` | Excel export, stats POST |
| `src/components/gtm-audit/Dropzone.tsx`, `GtmAuditReport.tsx` | UI |
| `src/pages/GtmAudit.tsx` + `marketing-routes.ts`, `entry-server.tsx`, `App.tsx` | Page + route |
| `src/pages/Privacy.tsx` (modify) | Counter disclosure |
| `CLAUDE.md` (modify) | Project notes for the audit |

---

### Task 1: Registry vendors, `identifiesVisitors`, scope `'GTM'`

**Files:**
- Modify: `supabase/functions/_shared/tracking-vendors.ts` (interface `Vendor` near line 7–31; entries for leadfeeder/zoominfo/claydar/inzynk ~302–329; marketing section; CMP section ~463)
- Modify: `supabase/functions/_shared/tracking-check/types.ts:109`
- Test: `tests/foundation/tracking-check-vendors.test.mjs`

**Interfaces:**
- Produces: `Vendor.identifiesVisitors?: boolean`; new vendor ids `tiktok-pixel, pinterest-pixel, snap-pixel, x-pixel, criteo, g2, openai-ads, vwo, apollo, rb2b, usercentrics, cookie-information`; `Scope` includes `'GTM'`.

- [ ] **Step 1: Write the failing tests**

In `tests/foundation/tracking-check-vendors.test.mjs`, add these entries inside the `cases` object of the test `'classifies request URLs, including gtag by ID prefix'` (before `'https://example.com/app.js': null,`):

```js
    'https://analytics.tiktok.com/i18n/pixel/events.js': 'tiktok-pixel',
    'https://www.tiktok.com/embed/v2/123': 'tiktok-embed',
    'https://s.pinimg.com/ct/core.js': 'pinterest-pixel',
    'https://ct.pinterest.com/v3/?event=init': 'pinterest-pixel',
    'https://sc-static.net/scevent.min.js': 'snap-pixel',
    'https://tr.snapchat.com/p': 'snap-pixel',
    'https://static.ads-twitter.com/uwt.js': 'x-pixel',
    'https://analytics.twitter.com/i/adsct': 'x-pixel',
    'https://dynamic.criteo.com/js/ld/ld.js': 'criteo',
    'https://sslwidget.criteo.com/event': 'criteo',
    'https://tr.capterra.com/tracking/v1/123': 'g2',
    'https://bzrcdn.openai.com/sdk/pixel.js': 'openai-ads',
    'https://dev.visualwebsiteoptimizer.com/j.php?a=1': 'vwo',
    'https://assets.apollo.io/micro/website-tracker/tracker.iife.js': 'apollo',
    'https://ddwl4m2hdecbv.cloudfront.net/b/ABC123/ABC123.js.gz': 'rb2b',
    'https://s3-us-west-2.amazonaws.com/b2bjsstore/b/ABC123/ABC123.js.gz': 'rb2b',
    'https://b2bjsstore.s3.us-west-2.amazonaws.com/b/ABC123/ABC123.js.gz': 'rb2b',
    'https://web.cmp.usercentrics.eu/ui/loader.js': 'usercentrics',
    'https://policy.app.cookieinformation.com/uc.js': 'cookie-information',
```

Append a new test at the end of the file:

```js
test('flags visitor-identifying vendors and only those', () => {
  const flagged = TRACKING_VENDORS.filter((v) => v.identifiesVisitors).map((v) => v.id).sort();
  assert.deepEqual(flagged, ['apollo', 'claydar', 'inzynk', 'leadfeeder', 'rb2b', 'zoominfo']);
  assert.equal(vendorById('usercentrics')?.kind, 'cmp');
  assert.equal(vendorById('cookie-information')?.kind, 'cmp');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/foundation/tracking-check-vendors.test.mjs`
Expected: FAIL — `'https://analytics.tiktok.com/...'` resolves to `null`, and the flagged list is `[]`.

- [ ] **Step 3: Implement**

In the `Vendor` interface (after `sriNote?: string;`) add:

```ts
  /** Identifies people or companies behind a visit (B2B reveal tools). Shown as a legal finding in the GTM audit. */
  identifiesVisitors?: boolean;
```

Add `identifiesVisitors: true,` to the `leadfeeder`, `zoominfo`, `claydar` and `inzynk` entries, right after `sriPossible: false,` on the first line, e.g.:

```ts
    id: 'leadfeeder', name: 'Leadfeeder (Dealfront)', category: 'marketing', googleTag: false, sriPossible: false, identifiesVisitors: true,
```

Insert directly after the `inzynk` entry (before `// Functional widgets`):

```ts
  // Verified 2026-11-17 from vendor install docs. RB2B loads from a CloudFront distribution or its S3 bucket.
  {
    id: 'rb2b', name: 'RB2B', category: 'marketing', googleTag: false, sriPossible: false, identifiesVisitors: true,
    requests: [
      { host: /^ddwl4m2hdecbv\.cloudfront\.net$/, path: /^\/b\// },
      { host: /^s3-us-west-2\.amazonaws\.com$/, path: /^\/b2bjsstore\// },
      { host: /^b2bjsstore\.s3\.us-west-2\.amazonaws\.com$/ },
    ],
    cookies: [],
    csp: { 'script-src': ['ddwl4m2hdecbv.cloudfront.net', 's3-us-west-2.amazonaws.com', 'b2bjsstore.s3.us-west-2.amazonaws.com'], 'connect-src': ['*.rb2b.com'] },
    impact: 'RB2B cannot identify visiting people.',
  },
  {
    id: 'apollo', name: 'Apollo.io website tracker', category: 'marketing', googleTag: false, sriPossible: false, identifiesVisitors: true,
    requests: [{ host: /^assets\.apollo\.io$/, path: /^\/micro\/website-tracker/ }],
    cookies: [],
    csp: { 'script-src': ['assets.apollo.io'], 'connect-src': ['*.apollo.io'] },
    impact: 'Apollo cannot identify visiting companies.',
  },
  // Ad pixels. Hosts must not overlap the embed entries (www.tiktok.com, assets|widgets.pinterest.com).
  {
    id: 'tiktok-pixel', name: 'TikTok Pixel', category: 'marketing', googleTag: false, sriPossible: false,
    requests: [{ host: /^analytics\.tiktok\.com$/ }],
    cookies: [/^_ttp$/],
    csp: { 'script-src': ['analytics.tiktok.com'], 'connect-src': ['analytics.tiktok.com'] },
    impact: 'TikTok Ads receives no page views or conversions.',
  },
  {
    id: 'pinterest-pixel', name: 'Pinterest Tag', category: 'marketing', googleTag: false, sriPossible: false,
    requests: [{ host: /^s\.pinimg\.com$/, path: /^\/ct\// }, { host: /^ct\.pinterest\.com$/ }],
    cookies: [/^_pin_unauth$/, /^_epik$/],
    csp: { 'script-src': ['s.pinimg.com'], 'connect-src': ['ct.pinterest.com'], 'img-src': ['ct.pinterest.com'] },
    impact: 'Pinterest Ads receives no page views or conversions.',
  },
  {
    id: 'snap-pixel', name: 'Snap Pixel', category: 'marketing', googleTag: false, sriPossible: false,
    requests: [{ host: /^sc-static\.net$/ }, { host: /^tr\.snapchat\.com$/ }],
    cookies: [/^_scid/],
    csp: { 'script-src': ['sc-static.net'], 'connect-src': ['tr.snapchat.com'], 'img-src': ['tr.snapchat.com'] },
    impact: 'Snapchat Ads receives no page views or conversions.',
  },
  {
    id: 'x-pixel', name: 'X (Twitter) Pixel', category: 'marketing', googleTag: false, sriPossible: false,
    requests: [{ host: /^static\.ads-twitter\.com$/ }, { host: /^analytics\.twitter\.com$/ }],
    cookies: [/^personalization_id$/],
    csp: { 'script-src': ['static.ads-twitter.com'], 'connect-src': ['analytics.twitter.com'], 'img-src': ['analytics.twitter.com', 't.co'] },
    impact: 'X Ads receives no page views or conversions.',
  },
  {
    id: 'criteo', name: 'Criteo OneTag', category: 'marketing', googleTag: false, sriPossible: false,
    requests: [{ host: /(^|\.)criteo\.(com|net)$/ }],
    cookies: [/^cto_/],
    csp: { 'script-src': ['dynamic.criteo.com', 'static.criteo.net'], 'connect-src': ['*.criteo.com'], 'img-src': ['*.criteo.com'] },
    impact: 'Criteo receives no product views or sales for retargeting.',
  },
  {
    id: 'g2', name: 'G2 / Capterra tracking', category: 'marketing', googleTag: false, sriPossible: false,
    requests: [{ host: /^(tr|ct)\.capterra\.com$/ }],
    cookies: [],
    csp: { 'script-src': ['ct.capterra.com'], 'connect-src': ['tr.capterra.com'], 'img-src': ['tr.capterra.com'] },
    impact: 'G2 and Capterra cannot attribute visits or conversions from their listings.',
  },
  {
    id: 'openai-ads', name: 'OpenAI Ads pixel', category: 'marketing', googleTag: false, sriPossible: false,
    requests: [{ host: /^bzrcdn\.openai\.com$/ }],
    cookies: [],
    csp: { 'script-src': ['bzrcdn.openai.com'], 'connect-src': ['*.openai.com'] },
    impact: 'OpenAI Ads receives no conversions.',
  },
  {
    id: 'vwo', name: 'VWO', category: 'analytics', googleTag: false, sriPossible: false,
    requests: [{ host: /(^|\.)visualwebsiteoptimizer\.com$|(^|\.)wingify\.net$/ }],
    cookies: [/^_vwo/, /^_vis_opt/],
    csp: { 'script-src': ['dev.visualwebsiteoptimizer.com'], 'connect-src': ['*.visualwebsiteoptimizer.com', '*.wingify.net'] },
    impact: 'VWO runs no experiments, so visitors see the original page.',
  },
```

In the CMP section, after the `dynamicweb` entry (end of the CMP block) add:

```ts
  {
    id: 'usercentrics', kind: 'cmp', name: 'Usercentrics', category: 'necessary', googleTag: false, sriPossible: false,
    requests: [{ host: /(^|\.)usercentrics\.eu$/ }],
    cookies: [/^uc_/],
    csp: { 'script-src': ['web.cmp.usercentrics.eu', 'app.usercentrics.eu'], 'connect-src': ['*.usercentrics.eu'] },
    impact: 'The cookie banner does not appear, so consent cannot be collected.',
  },
  {
    id: 'cookie-information', kind: 'cmp', name: 'Cookie Information', category: 'necessary', googleTag: false, sriPossible: false,
    requests: [{ host: /(^|\.)cookieinformation\.com$/ }],
    cookies: [/^CookieInformationConsent$/],
    csp: { 'script-src': ['policy.app.cookieinformation.com'], 'connect-src': ['*.cookieinformation.com'] },
    impact: 'The cookie banner does not appear, so consent cannot be collected.',
  },
```

In `supabase/functions/_shared/tracking-check/types.ts:109` change the `Scope` line to:

```ts
export type Scope = 'Parameters' | 'Tags' | 'CSP' | 'Consent' | 'Forms' | 'Ads/GA4' | 'Manual' | 'Coverage' | 'Scripts' | 'GTM';
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/foundation/tracking-check-vendors.test.mjs`
Expected: PASS. If a case resolves to an earlier, broader entry (the first match wins), move the new entry above it and re-run.
Then: `npm run test:foundation` — Expected: PASS (other Tracking Check tests must not change).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/tracking-vendors.ts supabase/functions/_shared/tracking-check/types.ts tests/foundation/tracking-check-vendors.test.mjs
git commit -m "feat(vendors): ad pixels, B2B identification tools, Usercentrics and Cookie Information" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Engine types and parser

**Files:**
- Create: `supabase/functions/_shared/gtm-audit/types.ts`
- Create: `supabase/functions/_shared/gtm-audit/tag-types.ts`
- Create: `supabase/functions/_shared/gtm-audit/parse.ts`
- Create: `scripts/gtm-audit/fixture.mjs` (builders; `sampleExport()` is added in Task 8)
- Test: `tests/foundation/gtm-audit-parse.test.mjs`

**Interfaces:**
- Consumes: `Finding` from `../tracking-check/types.ts`, `Vendor` from `../tracking-vendors.ts` (types only).
- Produces: every type below; `parse(input: unknown): Container | ParseError`; `isParseError(x): x is ParseError`; `MAX_FILE_BYTES`; `BUILTIN_TRIGGERS`, `GOOGLE_TYPES`, `BUILTIN_VENDOR`, `TYPE_LABEL`, `KNOWN_TYPES`, `templateIdOf(type)`; fixture builders `tpl, bool, list, ms, ref, needed, tag, cond, trigger, customEvent, triggerGroup, variable, template, tplType, exportOf, ALL_PAGES, CONSENT_INIT, INIT`.

- [ ] **Step 1: Create the types (no test of its own; compiled by every later test)**

`supabase/functions/_shared/gtm-audit/types.ts`:

```ts
/**
 * GTM container audit — engine types. Pure data; shared by the public /gtm-audit page (browser),
 * the gtm-audit-stats edge function and the Node tests.
 */
import type { Finding } from '../tracking-check/types.ts';
import type { Vendor } from '../tracking-vendors.ts';

export type ParamValue = string | ParamValue[] | { [key: string]: ParamValue };

export interface GtmTag {
  id: string;
  name: string;
  type: string;
  params: Record<string, ParamValue>;
  firingTriggerIds: string[];
  blockingTriggerIds: string[];
  consent: { status: 'needed' | 'not_needed' | 'not_set'; types: string[] };
  paused: boolean;
  folderId: string | null;
  /** ms epoch from the tag fingerprint; null when the fingerprint is not a timestamp. */
  modifiedAt: number | null;
}

export interface GtmCondition { type: string; arg0: string; arg1: string; negate: boolean }

export interface GtmTrigger {
  id: string;
  name: string;
  type: string;
  conditions: GtmCondition[];
  /** All Pages / Initialization / Consent Initialization: not in trigger[], added from fixed IDs. */
  builtIn: boolean;
  /** Members of a TRIGGER_GROUP. */
  groupTriggerIds: string[];
  folderId: string | null;
}

export interface GtmVariable { id: string; name: string; type: string; params: Record<string, ParamValue> }

export interface GtmTemplate {
  id: string;
  name: string;
  /** publicId of each web permission, e.g. inject_script, send_pixel, access_consent. */
  permissions: string[];
  /** http(s) URL patterns listed in the web permissions. */
  urls: string[];
  gallery: { owner: string; repository: string } | null;
}

export interface GtmFolder { id: string; name: string }

export interface Container {
  /** exportTime as ms epoch (UTC assumed); null when absent or unreadable. */
  exportedAt: number | null;
  publicId: string;
  tags: GtmTag[];
  triggers: GtmTrigger[];
  variables: GtmVariable[];
  folders: GtmFolder[];
  templates: GtmTemplate[];
  builtInVariables: string[];
}

export type ParseErrorCode = 'not_json' | 'not_gtm' | 'format_version' | 'server_container' | 'empty' | 'too_large';
export interface ParseError { error: ParseErrorCode; message: string }

export type IdentificationSource = 'builtin-type' | 'template-permissions' | 'gallery-reference' | 'custom-html-url' | 'none';

export interface Identification {
  vendorId: string | null;
  source: IdentificationSource;
  /** official = the vendor publishes the template itself; null for non-template tags. */
  templateOrigin: 'official' | 'community' | null;
  /** URLs found in Custom HTML / image tags or template permissions. */
  urls: string[];
  /** Capability CortIQ already covers even when no registry vendor applies. */
  covers: 'utm' | null;
}

export type ConsentStatus = 'gated' | 'likely_gated' | 'not_gated' | 'google_consent_mode';

export interface TagInfo {
  tag: GtmTag;
  ident: Identification;
  vendor: Vendor | null;
  consent: ConsentStatus;
  consentEvidence: string;
  template: GtmTemplate | null;
}

export const MIGRATION_CLASSES = ['covered', 'consent_tool', 'pixel', 'conversion', 'third_party', 'keep_google', 'remove', 'review'] as const;
export type MigrationClass = typeof MIGRATION_CLASSES[number];

export const CHECK_KEYS = [
  'gtm.consent_missing', 'gtm.consent_inferred', 'gtm.identifies_visitors', 'gtm.consent_mode_default',
  'gtm.unknown_custom_html', 'gtm.community_template_injects', 'gtm.duplicate', 'gtm.dead', 'gtm.stale',
] as const;
export type CheckKey = typeof CHECK_KEYS[number];

export interface TagRow {
  id: string;
  name: string;
  typeLabel: string;
  vendorId: string | null;
  vendorName: string;
  triggers: string[];
  consent: ConsentStatus;
  consentEvidence: string;
  modifiedAt: number | null;
  migration: MigrationClass;
  migrationLabel: string;
  migrationReason: string;
  folder: string;
  paused: boolean;
}

export interface AuditSummary {
  headline: string;
  tags: number;
  noConsent: number;
  identifies: number;
  removal: number;
  counts: Record<MigrationClass, number>;
}

export interface AuditResult {
  container: Container;
  tags: TagRow[];
  findings: Finding[];
  summary: AuditSummary;
}
```

`supabase/functions/_shared/gtm-audit/tag-types.ts`:

```ts
/** GTM built-in tag types and fixed trigger IDs. Verified 2026-11-17 against GTM export format v2. */

/** Built-in triggers never appear in trigger[]; tags reference them by these fixed IDs. */
export const BUILTIN_TRIGGERS: Record<string, { name: string; type: string }> = {
  '2147479553': { name: 'All Pages', type: 'PAGEVIEW' },
  '2147479572': { name: 'Consent Initialization - All Pages', type: 'CONSENT_INIT' },
  '2147479573': { name: 'Initialization - All Pages', type: 'INIT' },
};

/** Google's own tag types: they adapt to Consent Mode rather than being blocked. */
export const GOOGLE_TYPES = new Set(['gaawe', 'gaawc', 'googtag', 'awct', 'awcc', 'awud', 'sp', 'gclidw', 'flc', 'fls', 'ua']);

/** Built-in tag type → registry vendor id. googtag is decided by its tagId prefix in identify.ts. */
export const BUILTIN_VENDOR: Record<string, string> = {
  gaawe: 'ga4', gaawc: 'ga4', ua: 'ga4',
  awct: 'google-ads', awcc: 'google-ads', awud: 'google-ads', sp: 'google-ads', gclidw: 'google-ads', flc: 'google-ads', fls: 'google-ads',
  baut: 'microsoft-ads', hjtc: 'hotjar', bzi: 'linkedin', pntr: 'pinterest-pixel', twitter_website_tag: 'x-pixel', crto: 'criteo',
};

export const TYPE_LABEL: Record<string, string> = {
  gaawe: 'GA4 event', gaawc: 'GA4 configuration', googtag: 'Google tag', ua: 'Universal Analytics',
  awct: 'Google Ads conversion', awcc: 'Google Ads enhanced conversions', awud: 'Google Ads user data', sp: 'Google Ads remarketing',
  gclidw: 'Conversion Linker', flc: 'Floodlight counter', fls: 'Floodlight sales',
  baut: 'Microsoft Advertising UET', hjtc: 'Hotjar', bzi: 'LinkedIn Insight', pntr: 'Pinterest', twitter_website_tag: 'X website tag', crto: 'Criteo OneTag',
  html: 'Custom HTML', img: 'Custom image',
};

export const KNOWN_TYPES = Object.keys(TYPE_LABEL);

/** `cvt_<containerId>_<templateId>` → templateId; null for built-in types. */
export function templateIdOf(type: string): string | null {
  return type.match(/^cvt_(?:[A-Za-z0-9]+_)?([A-Za-z0-9]+)$/)?.[1] ?? null;
}
```

- [ ] **Step 2: Create the fixture builders**

`scripts/gtm-audit/fixture.mjs`:

```js
// Builders for synthetic GTM container exports (format v2). Synthetic data only — never a real container.
export const ALL_PAGES = '2147479553';
export const CONSENT_INIT = '2147479572';
export const INIT = '2147479573';
export const DEFAULT_MODIFIED = Date.UTC(2026, 9, 1);

export const tpl = (key, value) => ({ type: 'TEMPLATE', key, value: String(value) });
export const bool = (key, value) => ({ type: 'BOOLEAN', key, value: String(value) });
export const list = (key, items) => ({ type: 'LIST', key, list: items });
export const ms = (entries) => ({ type: 'MAP', map: Object.entries(entries).map(([k, v]) => tpl(k, v)) });
export const ref = (id) => ({ type: 'TRIGGER_REFERENCE', value: String(id) });
export const needed = (...types) => ({
  consentStatus: 'NEEDED', consentType: { type: 'LIST', list: types.map((t) => ({ type: 'TEMPLATE', value: t })) },
});

export function tag(id, name, type, params = [], { fire = [ALL_PAGES], block = [], consent, paused, folder, modified } = {}) {
  return {
    tagId: String(id), name, type, parameter: params, fingerprint: String(modified ?? DEFAULT_MODIFIED),
    firingTriggerId: fire.map(String),
    ...(block.length ? { blockingTriggerId: block.map(String) } : {}),
    ...(paused ? { paused: true } : {}),
    ...(folder ? { parentFolderId: String(folder) } : {}),
    consentSettings: consent ?? { consentStatus: 'NOT_SET' },
  };
}

export const cond = (type, arg0, arg1, negate = false) => ({
  type, parameter: [tpl('arg0', arg0), tpl('arg1', arg1), ...(negate ? [bool('negate', true)] : [])],
});

export function trigger(id, name, type, { filter = [], custom = [], params = [], folder } = {}) {
  return {
    triggerId: String(id), name, type,
    ...(custom.length ? { customEventFilter: custom } : {}),
    ...(filter.length ? { filter } : {}),
    ...(params.length ? { parameter: params } : {}),
    ...(folder ? { parentFolderId: String(folder) } : {}),
  };
}
export const customEvent = (id, name, event, opts = {}) => trigger(id, name, 'CUSTOM_EVENT', { ...opts, custom: [cond('EQUALS', '{{_event}}', event)] });
export const triggerGroup = (id, name, memberIds) => trigger(id, name, 'TRIGGER_GROUP', { params: [list('triggerIds', memberIds.map(ref))] });
export const variable = (id, name, type, params = []) => ({ variableId: String(id), name, type, parameter: params });

/** permissions: { inject_script: ['https://cdn.example.com/*'], access_consent: [] } */
export function template(id, name, { permissions = {}, gallery } = {}) {
  const perms = Object.entries(permissions).map(([publicId, urls]) => JSON.stringify({
    instance: {
      key: { publicId, versionId: '1' },
      param: urls.length ? [{ key: 'urls', value: { type: 2, listItem: urls.map((u) => ({ type: 1, string: u })) } }] : [],
    },
    isRequired: true,
  }));
  const templateData = `___INFO___\n\n{"type":"TAG","displayName":${JSON.stringify(name)}}\n\n___WEB_PERMISSIONS___\n\n[${perms.join(',')}]\n\n___TESTS___\n\nscenarios: []\n`;
  return {
    templateId: String(id), name, templateData,
    ...(gallery ? { galleryReference: { host: 'github.com', owner: gallery[0], repository: gallery[1], version: 'abc123', signature: 'def456' } } : {}),
  };
}
export const tplType = (id) => `cvt_1234567_${id}`;

export function exportOf({ tags = [], triggers = [], variables = [], folders = [], templates = [], builtIns = [], exportTime = '2026-11-01 10:00:00', usageContext = ['WEB'] } = {}) {
  return {
    exportFormatVersion: 2, exportTime,
    containerVersion: {
      container: { publicId: 'GTM-SAMPLE1', usageContext },
      tag: tags, trigger: triggers, variable: variables, folder: folders, customTemplate: templates,
      builtInVariable: builtIns.map((type) => ({ type, name: type })),
    },
  };
}
```

- [ ] **Step 3: Write the failing tests**

`tests/foundation/gtm-audit-parse.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, isParseError, MAX_FILE_BYTES } from '../../supabase/functions/_shared/gtm-audit/parse.ts';
import { templateIdOf } from '../../supabase/functions/_shared/gtm-audit/tag-types.ts';
import {
  tag, tpl, list, ms, needed, trigger, customEvent, triggerGroup, variable, template, tplType, exportOf, cond,
  ALL_PAGES, CONSENT_INIT,
} from '../../scripts/gtm-audit/fixture.mjs';

const basic = () => exportOf({
  tags: [
    tag(1, 'GA4 - lead', 'gaawe', [tpl('eventName', 'generate_lead'), list('eventSettingsTable', [ms({ parameter: 'form', parameterValue: 'contact' })])],
      { fire: [10], consent: needed('analytics_storage'), folder: 40, modified: Date.UTC(2024, 0, 2) }),
    tag(2, 'Old pixel', 'html', [tpl('html', '<script src="https://cdn.example.com/p.js"></script>')], { paused: true, fire: [] }),
    tag(3, 'Banner', tplType(22), [], { fire: [CONSENT_INIT] }),
  ],
  triggers: [
    customEvent(10, 'CE - lead', 'generate_lead', { folder: 40 }),
    triggerGroup(11, 'Group', [10, ALL_PAGES]),
    trigger(12, 'Click - CTA', 'CLICK', { filter: [cond('CONTAINS', '{{Click Classes}}', 'cta', true)] }),
  ],
  variables: [variable(30, 'GA4 ID', 'c', [tpl('value', 'G-SAMPLE')])],
  folders: [{ folderId: '40', name: 'Analytics' }],
  templates: [template(22, 'Banner CMP', { permissions: { inject_script: ['https://*.consent.example.com/*'], access_consent: [] }, gallery: ['ExampleOwner', 'example-cmp'] })],
  builtIns: ['PAGE_URL', 'EVENT'],
});

test('normalizes tags: params, consent, paused, folder, modifiedAt', () => {
  const c = parse(basic());
  assert.ok(!isParseError(c));
  assert.equal(c.publicId, 'GTM-SAMPLE1');
  assert.equal(c.exportedAt, Date.UTC(2026, 10, 1, 10, 0, 0));
  const [ga4, old, banner] = c.tags;
  assert.deepEqual(ga4.params, { eventName: 'generate_lead', eventSettingsTable: [{ parameter: 'form', parameterValue: 'contact' }] });
  assert.deepEqual(ga4.consent, { status: 'needed', types: ['analytics_storage'] });
  assert.deepEqual(ga4.firingTriggerIds, ['10']);
  assert.equal(ga4.folderId, '40');
  assert.equal(ga4.modifiedAt, Date.UTC(2024, 0, 2));
  assert.equal(old.paused, true);
  assert.deepEqual(old.firingTriggerIds, []);
  assert.deepEqual(banner.consent, { status: 'not_set', types: [] });
  assert.deepEqual(c.folders, [{ id: '40', name: 'Analytics' }]);
  assert.deepEqual(c.builtInVariables, ['PAGE_URL', 'EVENT']);
});

test('normalizes triggers, groups and adds referenced built-in triggers', () => {
  const c = parse(basic());
  const byId = Object.fromEntries(c.triggers.map((t) => [t.id, t]));
  assert.deepEqual(byId['10'].conditions, [{ type: 'EQUALS', arg0: '{{_event}}', arg1: 'generate_lead', negate: false }]);
  assert.deepEqual(byId['11'].groupTriggerIds, ['10', ALL_PAGES]);
  assert.equal(byId['12'].conditions[0].negate, true);
  assert.deepEqual(byId[ALL_PAGES], { id: ALL_PAGES, name: 'All Pages', type: 'PAGEVIEW', conditions: [], builtIn: true, groupTriggerIds: [], folderId: null });
  assert.equal(byId[CONSENT_INIT].type, 'CONSENT_INIT');
  assert.equal(byId['10'].builtIn, false);
});

test('reads template permissions, URLs and gallery reference', () => {
  const c = parse(basic());
  assert.deepEqual(c.templates, [{
    id: '22', name: 'Banner CMP', permissions: ['inject_script', 'access_consent'],
    urls: ['https://*.consent.example.com/*'], gallery: { owner: 'ExampleOwner', repository: 'example-cmp' },
  }]);
  assert.equal(templateIdOf(tplType(22)), '22');
  assert.equal(templateIdOf('cvt_22'), '22');
  assert.equal(templateIdOf('gaawe'), null);
});

test('accepts a JSON string, camelCase API enums and a missing format version', () => {
  const raw = basic();
  delete raw.exportFormatVersion;
  delete raw.exportTime;
  raw.containerVersion.tag[0].consentSettings = { consentStatus: 'needed', consentType: { type: 'list', list: [{ type: 'template', value: 'ad_storage' }] } };
  raw.containerVersion.tag[2].consentSettings = { consentStatus: 'notNeeded' };
  const c = parse(JSON.stringify(raw));
  assert.ok(!isParseError(c));
  assert.equal(c.exportedAt, null);
  assert.deepEqual(c.tags[0].consent, { status: 'needed', types: ['ad_storage'] });
  assert.equal(c.tags[2].consent.status, 'not_needed');
});

test('returns a distinct error for each bad input', () => {
  assert.equal(parse('{nope').error, 'not_json');
  assert.equal(parse('x'.repeat(MAX_FILE_BYTES + 1)).error, 'too_large');
  assert.equal(parse({ hello: 1 }).error, 'not_gtm');
  assert.equal(parse([1, 2]).error, 'not_gtm');
  assert.equal(parse(null).error, 'not_gtm');
  assert.equal(parse({ ...basic(), exportFormatVersion: 1 }).error, 'format_version');
  assert.equal(parse(exportOf({ tags: [tag(1, 'x', 'html')], usageContext: ['SERVER'] })).error, 'server_container');
  assert.equal(parse(exportOf()).error, 'empty');
  const messages = [parse('{'), parse({}), parse({ ...basic(), exportFormatVersion: 3 }), parse(exportOf())].map((e) => e.message);
  assert.equal(new Set(messages).size, messages.length);
  assert.ok(messages.every((m) => m.length > 10));
});

test('ignores __proto__ parameter keys', () => {
  const raw = JSON.parse('{"type":"TEMPLATE","key":"__proto__","value":"polluted"}');
  const c = parse(exportOf({ tags: [tag(1, 'x', 'html', [raw, tpl('html', '<p>')])] }));
  assert.deepEqual(c.tags[0].params, { html: '<p>' });
  assert.equal(Object.getPrototypeOf(c.tags[0].params), Object.prototype);
  assert.equal({}.polluted, undefined);
});

// Review Focus 1: hostile or malformed shapes never throw.
test('fuzz: mutated exports never throw', () => {
  let seed = 7;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const junk = [null, 0, -1, 'x', '', true, [], {}, [null], { type: 'LIST', list: 'nope' }, { type: 'MAP', map: [null, 1] }, JSON.parse('{"__proto__":{"x":1}}')];
  const mutate = (node, depth) => {
    if (depth > 0 && rand() < 0.15) return junk[Math.floor(rand() * junk.length)];
    if (Array.isArray(node)) return node.map((n) => mutate(n, depth + 1));
    if (node && typeof node === 'object') return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, mutate(v, depth + 1)]));
    return node;
  };
  for (let i = 0; i < 500; i++) {
    const out = parse(mutate(basic(), 0));
    assert.ok(out && typeof out === 'object');
  }
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `node --test tests/foundation/gtm-audit-parse.test.mjs`
Expected: FAIL — `Cannot find module .../gtm-audit/parse.ts`.

- [ ] **Step 5: Implement the parser**

`supabase/functions/_shared/gtm-audit/parse.ts`:

```ts
/**
 * parse — GTM container export (format v2) → normalized Container. Never throws: every access to the
 * input goes through obj/arr/str, so wrong types, nulls and hostile keys degrade to empty values.
 */
import type { Container, GtmCondition, GtmTag, GtmTemplate, GtmTrigger, ParamValue, ParseError, ParseErrorCode } from './types.ts';
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
    };
  });

  const triggers: GtmTrigger[] = arr(cv.trigger).map((raw) => {
    const t = obj(raw);
    const params = paramMap(arr(t.parameter));
    const members = Array.isArray(params.triggerIds) ? params.triggerIds.filter((x): x is string => typeof x === 'string' && x !== '') : [];
    return {
      id: str(t.triggerId), name: str(t.name), type: enumOf(t.type), conditions: conditionsOf(t),
      builtIn: false, groupTriggerIds: members, folderId: idOrNull(t.parentFolderId),
    };
  });

  const known = new Set(triggers.map((t) => t.id));
  const referenced = [...tags.flatMap((t) => [...t.firingTriggerIds, ...t.blockingTriggerIds]), ...triggers.flatMap((t) => t.groupTriggerIds)];
  for (const id of referenced) {
    const b = Object.prototype.hasOwnProperty.call(BUILTIN_TRIGGERS, id) ? BUILTIN_TRIGGERS[id] : undefined;
    if (b && !known.has(id)) {
      known.add(id);
      triggers.push({ id, name: b.name, type: b.type, conditions: [], builtIn: true, groupTriggerIds: [], folderId: null });
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
```

- [ ] **Step 6: Run tests**

Run: `node --test tests/foundation/gtm-audit-parse.test.mjs`
Expected: PASS (7 tests).

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/gtm-audit/types.ts supabase/functions/_shared/gtm-audit/tag-types.ts supabase/functions/_shared/gtm-audit/parse.ts scripts/gtm-audit/fixture.mjs tests/foundation/gtm-audit-parse.test.mjs
git commit -m "feat(gtm-audit): container export parser and engine types" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Vendor identification and gallery map

**Files:**
- Create: `supabase/functions/_shared/gtm-audit/gallery-map.ts`
- Create: `supabase/functions/_shared/gtm-audit/identify.ts`
- Test: `tests/foundation/gtm-audit-identify.test.mjs`

**Interfaces:**
- Consumes: `Container, GtmTag, GtmTemplate, Identification` (Task 2); `BUILTIN_VENDOR, templateIdOf` (Task 2); `TRACKING_VENDORS, vendorForUrl` from `../tracking-vendors.ts`.
- Produces: `identify(tag: GtmTag, container: Container): Identification`; `templateFor(tag, container): GtmTemplate | null`; `urlsInHtml(html: string): string[]`; `galleryEntry(g): GalleryEntry | null`; `GALLERY`.

- [ ] **Step 1: Write the failing tests**

`tests/foundation/gtm-audit-identify.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../../supabase/functions/_shared/gtm-audit/parse.ts';
import { identify, urlsInHtml } from '../../supabase/functions/_shared/gtm-audit/identify.ts';
import { galleryEntry } from '../../supabase/functions/_shared/gtm-audit/gallery-map.ts';
import { tag, tpl, template, tplType, exportOf } from '../../scripts/gtm-audit/fixture.mjs';

const one = (t, templates = []) => {
  const c = parse(exportOf({ tags: [t], templates }));
  return identify(c.tags[0], c);
};

test('built-in types map to registry vendors; googtag by tagId prefix', () => {
  assert.equal(one(tag(1, 'GT', 'googtag', [tpl('tagId', 'G-SAMPLE')])).vendorId, 'ga4');
  assert.equal(one(tag(1, 'GT', 'googtag', [tpl('tagId', 'AW-123')])).vendorId, 'google-ads');
  assert.deepEqual(one(tag(1, 'Ev', 'gaawe')), { vendorId: 'ga4', source: 'builtin-type', templateOrigin: null, urls: [], covers: null });
  assert.equal(one(tag(1, 'UET', 'baut')).vendorId, 'microsoft-ads');
  assert.equal(one(tag(1, 'Weird', 'zzz_unknown')).source, 'none');
});

test('Custom HTML and image tags: URLs from src and quoted literals', () => {
  const li = one(tag(1, 'LI', 'html', [tpl('html', '<script>(function(){var s=document.createElement("script");s.src="https://snap.licdn.com/li.lms-analytics/insight.min.js";})();</script>')]));
  assert.deepEqual([li.vendorId, li.source], ['linkedin', 'custom-html-url']);
  assert.equal(one(tag(1, 'HJ', 'html', [tpl('html', "<script>h._hjSettings={};a.src='//static.hotjar.com/c/hotjar-1.js'</script>")])).vendorId, 'hotjar');
  assert.equal(one(tag(1, 'Img', 'img', [tpl('url', 'https://px.ads.linkedin.com/collect/?pid=1')])).vendorId, 'linkedin');
  const plain = one(tag(1, 'Inline', 'html', [tpl('html', '<script>window.dataLayer.push({a:1})</script>')]));
  assert.deepEqual([plain.vendorId, plain.source, plain.urls], [null, 'none', []]);
  assert.deepEqual(urlsInHtml('<img src="//cdn.example.com/a.gif"><a href=\'https://example.com/x?y=1\'>'), ['https://cdn.example.com/a.gif', 'https://example.com/x?y=1']);
});

test('template permissions identify the vendor, official only via the gallery map', () => {
  const meta = one(tag(1, 'Meta', tplType(20)), [template(20, 'Meta Pixel', {
    permissions: { inject_script: ['https://connect.facebook.net/en_US/fbevents.js'] }, gallery: ['facebookarchive', 'GoogleTagManager-WebTemplate-For-FacebookPixel'],
  })]);
  assert.deepEqual([meta.vendorId, meta.source, meta.templateOrigin], ['meta', 'template-permissions', 'official']);
  const unofficial = one(tag(1, 'Clay', tplType(24)), [template(24, 'Clay', {
    permissions: { inject_script: ['https://static.claydar.com/*'] }, gallery: ['Jude-Nwachukwu', 'gtm-clay-web-intent-tag'],
  })]);
  assert.deepEqual([unofficial.vendorId, unofficial.templateOrigin], ['claydar', 'community']);
  const noGallery = one(tag(1, 'Own', tplType(25)), [template(25, 'Own', { permissions: { inject_script: ['https://cdn.example-widgets.com/*'] } })]);
  assert.deepEqual([noGallery.vendorId, noGallery.source, noGallery.templateOrigin], [null, 'none', 'community']);
});

test('gallery reference is the fallback when permissions name no known host', () => {
  const tt = one(tag(1, 'TikTok', tplType(26)), [template(26, 'TikTok Pixel', { permissions: { send_pixel: [] }, gallery: ['tiktok', 'gtm-template-pixel'] })]);
  assert.deepEqual([tt.vendorId, tt.source, tt.templateOrigin], ['tiktok-pixel', 'gallery-reference', 'official']);
  const utm = one(tag(1, 'UTM', tplType(27)), [template(27, 'Persist', { permissions: { set_cookies: [] }, gallery: ['gtm-templates-simo-ahava', 'persist-campaign-data'] })]);
  assert.deepEqual([utm.vendorId, utm.covers, utm.templateOrigin], [null, 'utm', 'community']);
  assert.equal(galleryEntry({ owner: 'Jude-Nwachukwu', repository: 'something-else' }), null);
  assert.equal(galleryEntry(null), null);
});

// Review Focus 5: infrastructure + vendor URLs, and wildcard hosts.
test('skips infrastructure URLs and resolves wildcard hosts', () => {
  const cb = one(tag(1, 'CMP', tplType(22)), [template(22, 'CMP', {
    permissions: { inject_script: ['https://cdn.jsdelivr.net/npm/helper@1/*', 'https://*.cookiebot.com/*'], access_consent: [] },
  })]);
  assert.deepEqual([cb.vendorId, cb.source], ['cookiebot', 'template-permissions']);
  const li = one(tag(1, 'LI', tplType(21)), [template(21, 'LI', { permissions: { inject_script: ['https://snap.licdn.com/*'] } })]);
  assert.equal(li.vendorId, 'linkedin');
  const cdnOnly = one(tag(1, 'CDN', tplType(28)), [template(28, 'CDN', { permissions: { inject_script: ['https://cdn.jsdelivr.net/*'] } })]);
  assert.equal(cdnOnly.vendorId, null);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/foundation/gtm-audit-identify.test.mjs`
Expected: FAIL — `Cannot find module .../gtm-audit/identify.ts`.

- [ ] **Step 3: Implement the gallery map**

`supabase/functions/_shared/gtm-audit/gallery-map.ts`:

```ts
/**
 * Community Template Gallery repositories → registry vendor. Keys are lowercase `owner/repository`.
 * Verified on GitHub 2026-11-17. `official` = published by the vendor itself. Community authors with
 * many templates are matched on the full repository, never on the owner alone.
 */
export interface GalleryEntry { vendorId: string | null; official: boolean; covers?: 'utm' }

export const GALLERY: Record<string, GalleryEntry> = {
  'linkedin/linkedin-gtm-community-template': { vendorId: 'linkedin', official: true },
  'meta/googletagmanager-webtemplate-for-facebookpixel': { vendorId: 'meta', official: true },
  'facebookarchive/googletagmanager-webtemplate-for-facebookpixel': { vendorId: 'meta', official: true },
  'microsoft/clarity-gtm-template': { vendorId: 'clarity', official: true },
  'reddit/reddit-gtm-template': { vendorId: 'reddit', official: true },
  'tiktok/gtm-template-pixel': { vendorId: 'tiktok-pixel', official: true },
  'pinterest/ws-gtm-template': { vendorId: 'pinterest-pixel', official: true },
  'snapchat/snapchat-google-tag-manager': { vendorId: 'snap-pixel', official: true },
  'twitter/google-tag-manager-base-tag': { vendorId: 'x-pixel', official: true },
  'twitter/google-tag-manager-event-tag': { vendorId: 'x-pixel', official: true },
  'criteo/gtm-criteo-onetag': { vendorId: 'criteo', official: true },
  'criteo/gtm-criteo-loader': { vendorId: 'criteo', official: true },
  'leadfeeder/leadfeeder-google-tag-manager-template': { vendorId: 'leadfeeder', official: true },
  'capterra-public/gtm-gdm-tag': { vendorId: 'g2', official: true },
  'capterra-public/gtm-conversion-tag': { vendorId: 'g2', official: true },
  'capterra-public/gtm-conversion-tracking': { vendorId: 'g2', official: true },
  'openai/ads-measurement-pixel-gtm-template': { vendorId: 'openai-ads', official: true },
  'jude-nwachukwu/gtm-clay-web-intent-tag': { vendorId: 'claydar', official: false },
  'usercentrics/gtm-templates-cookiebot-cmp': { vendorId: 'cookiebot', official: true },
  'cybotcorp/gtm-templates-cookiebot-cmp': { vendorId: 'cookiebot', official: true },
  'cookieyeshq/cookieyes-gtm-template': { vendorId: 'cookieyes', official: true },
  'onetrustcmp/onetrust-gtm-template': { vendorId: 'onetrust', official: true },
  'usercentrics/gtm-templates-usercentrics-cmp': { vendorId: 'usercentrics', official: true },
  'cookie-information/ci-consent-mode-template-v2': { vendorId: 'cookie-information', official: true },
  'cookie-information/ci-consent-mode-template': { vendorId: 'cookie-information', official: true },
  'gtm-templates-simo-ahava/persist-campaign-data': { vendorId: null, official: false, covers: 'utm' },
};

export function galleryEntry(g: { owner: string; repository: string } | null): GalleryEntry | null {
  if (!g) return null;
  const key = `${g.owner}/${g.repository}`.toLowerCase();
  return Object.prototype.hasOwnProperty.call(GALLERY, key) ? GALLERY[key] : null;
}
```

- [ ] **Step 4: Implement identification**

`supabase/functions/_shared/gtm-audit/identify.ts`:

```ts
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
  for (const m of html.slice(0, 200_000).matchAll(/["'`]((?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}[^"'`\s<>]*)["'`]/gi)) {
    out.add(absolute(m[1]));
    if (out.size >= 50) break;
  }
  return [...out];
}

/** Permission URLs may use wildcards: https://*.cookiebot.com/* — try a concrete host, then CSP domains. */
function vendorForPattern(pattern: string): Vendor | null {
  const concrete = pattern.replace(/\*\./g, 'x.').replace(/\*/g, '');
  const direct = vendorForUrl(concrete);
  if (direct) return direct;
  const base = pattern.match(/^https?:\/\/\*\.([^/:]+)/)?.[1]?.toLowerCase();
  if (!base) return null;
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
```

- [ ] **Step 5: Run tests**

Run: `node --test tests/foundation/gtm-audit-identify.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/gtm-audit/gallery-map.ts supabase/functions/_shared/gtm-audit/identify.ts tests/foundation/gtm-audit-identify.test.mjs
git commit -m "feat(gtm-audit): identify tag vendors from types, HTML, template permissions and gallery" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Consent status per tag

**Files:**
- Create: `supabase/functions/_shared/gtm-audit/consent.ts`
- Test: `tests/foundation/gtm-audit-consent.test.mjs`

**Interfaces:**
- Consumes: `Container, ConsentStatus, GtmCondition, GtmTag, GtmTrigger, GtmVariable` (Task 2); `GOOGLE_TYPES` (Task 2).
- Produces: `consentStatus(tag: GtmTag, container: Container): { status: ConsentStatus; evidence: string }`; `isConsentTrigger(triggerId: string, container: Container): boolean`; `CONSENT_RE`.

- [ ] **Step 1: Write the failing tests**

`tests/foundation/gtm-audit-consent.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../../supabase/functions/_shared/gtm-audit/parse.ts';
import { consentStatus, isConsentTrigger } from '../../supabase/functions/_shared/gtm-audit/consent.ts';
import { tag, tpl, needed, trigger, customEvent, triggerGroup, variable, cond, exportOf, ALL_PAGES } from '../../scripts/gtm-audit/fixture.mjs';

const triggers = [
  customEvent(10, 'CE - marketing consent', 'cookie_consent_marketing'),
  customEvent(11, 'CE - Cookiebot', 'CookiebotOnAccept'),
  customEvent(12, 'CE - lead', 'generate_lead'),
  trigger(13, 'Consent Analytics Trigger', 'PAGEVIEW'),
  trigger(14, 'PV - consent var', 'PAGEVIEW', { filter: [cond('CONTAINS', '{{Marketing Consent}}', 'granted')] }),
  trigger(15, 'PV - CMP state', 'PAGEVIEW', { filter: [cond('CONTAINS', '{{CMP state}}', 'C0004')] }),
  triggerGroup(16, 'Group - lead after consent', [12, 10]),
  triggerGroup(17, 'Cycle A', [18]),
  triggerGroup(18, 'Cycle B', [17]),
  triggerGroup(19, 'Missing member', [999]),
  customEvent(20, 'Block - consent denied', 'OneTrustGroupsUpdated'),
];
const variables = [variable(30, 'CMP state', 'jsm', [tpl('javascript', 'function(){return window.OptanonActiveGroups}')])];

const status = (t) => {
  const c = parse(exportOf({ tags: [t], triggers, variables }));
  return consentStatus(c.tags[0], c);
};

test('consent settings with types → gated', () => {
  const s = status(tag(1, 'X', 'html', [], { consent: needed('ad_storage', 'analytics_storage') }));
  assert.equal(s.status, 'gated');
  assert.match(s.evidence, /ad_storage, analytics_storage/);
  assert.equal(status(tag(1, 'X', 'html', [], { consent: { consentStatus: 'NEEDED' } })).status, 'not_gated');
});

test('Google tags without consent settings → google_consent_mode', () => {
  assert.equal(status(tag(1, 'GA4', 'gaawe')).status, 'google_consent_mode');
  assert.equal(status(tag(1, 'Linker', 'gclidw')).status, 'google_consent_mode');
});

test('custom events from CMPs and consent variables gate a trigger', () => {
  assert.equal(status(tag(1, 'X', 'html', [], { fire: [10] })).status, 'gated');
  assert.equal(status(tag(1, 'X', 'html', [], { fire: [11] })).status, 'gated');
  assert.equal(status(tag(1, 'X', 'html', [], { fire: [14] })).status, 'gated');
  assert.equal(status(tag(1, 'X', 'html', [], { fire: [15] })).status, 'gated');
  assert.equal(status(tag(1, 'X', 'html', [], { fire: [16] })).status, 'gated');
  assert.equal(status(tag(1, 'X', 'html', [], { fire: [10, 12] })).status, 'not_gated');
});

test('a consent blocking trigger gates the tag', () => {
  const s = status(tag(1, 'X', 'html', [], { fire: [ALL_PAGES], block: [20] }));
  assert.equal(s.status, 'gated');
  assert.match(s.evidence, /Block - consent denied/);
});

test('consent-like trigger name only → likely_gated, with the inference stated', () => {
  const s = status(tag(1, 'X', 'html', [], { fire: [13] }));
  assert.equal(s.status, 'likely_gated');
  assert.match(s.evidence, /trigger name only/);
});

test('no consent condition → not_gated, phrased as not found', () => {
  const s = status(tag(1, 'X', 'html', [], { fire: [ALL_PAGES] }));
  assert.equal(s.status, 'not_gated');
  assert.match(s.evidence, /No consent condition found/);
  assert.doesNotMatch(s.evidence, /fires without consent/i);
  assert.equal(status(tag(1, 'X', 'html', [], { fire: [] })).status, 'not_gated');
});

// Review Focus 3: cycles and missing IDs.
test('trigger-group cycles and missing triggers do not hang or throw', () => {
  assert.equal(status(tag(1, 'X', 'html', [], { fire: [17] })).status, 'not_gated');
  assert.equal(status(tag(1, 'X', 'html', [], { fire: [19] })).status, 'not_gated');
  assert.equal(status(tag(1, 'X', 'html', [], { fire: ['424242'] })).status, 'not_gated');
  const c = parse(exportOf({ tags: [tag(1, 'X', 'html')], triggers, variables }));
  assert.equal(isConsentTrigger('10', c), true);
  assert.equal(isConsentTrigger('12', c), false);
  assert.equal(isConsentTrigger('nope', c), false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/foundation/gtm-audit-consent.test.mjs`
Expected: FAIL — `Cannot find module .../gtm-audit/consent.ts`.

- [ ] **Step 3: Implement**

`supabase/functions/_shared/gtm-audit/consent.ts`:

```ts
/**
 * consentStatus — whether the container configuration holds a tag back until consent. Static only:
 * conditions in Custom JavaScript variables we cannot evaluate, so the wording is always
 * "no consent condition found", never "fires without consent".
 */
import type { Container, ConsentStatus, GtmCondition, GtmTag, GtmTrigger, GtmVariable } from './types.ts';
import { GOOGLE_TYPES } from './tag-types.ts';

/** Custom event names and variable names/bodies used by CMPs and CortIQ's banner. */
export const CONSENT_RE = /consent|cookiebot|onetrust|optanon|cookieyes|usercentrics|cookieinformation|cmplz|samtycke/i;
const CONSENT_NAME_RE = /consent|cookie|gdpr|samtycke|opt.?in/i;
const EVENT_VARS = new Set(['{{_event}}', '{{Event}}']);

interface Index { triggers: Map<string, GtmTrigger>; variables: Map<string, GtmVariable> }
const cache = new WeakMap<Container, Index>();
function indexOf(c: Container): Index {
  let i = cache.get(c);
  if (!i) {
    i = { triggers: new Map(c.triggers.map((t) => [t.id, t])), variables: new Map(c.variables.map((v) => [v.name, v])) };
    cache.set(c, i);
  }
  return i;
}

function conditionIsConsent(cond: GtmCondition, variables: Map<string, GtmVariable>): boolean {
  if (EVENT_VARS.has(cond.arg0)) return CONSENT_RE.test(cond.arg1);
  const name = cond.arg0.match(/^\{\{(.+)\}\}$/)?.[1];
  if (!name) return false;
  if (CONSENT_RE.test(name)) return true;
  const v = variables.get(name);
  return !!v && CONSENT_RE.test(JSON.stringify(v.params).slice(0, 20_000));
}

function gated(id: string, idx: Index, seen: Set<string>): boolean {
  if (seen.has(id)) return false;
  seen.add(id);
  const t = idx.triggers.get(id);
  if (!t) return false;
  if (t.type === 'TRIGGER_GROUP') return t.groupTriggerIds.some((m) => gated(m, idx, seen));
  return t.conditions.some((c) => conditionIsConsent(c, idx.variables));
}

/** True when the trigger (or, for a group, any member) has a consent condition. */
export function isConsentTrigger(triggerId: string, container: Container): boolean {
  return gated(triggerId, indexOf(container), new Set());
}

export function consentStatus(tag: GtmTag, container: Container): { status: ConsentStatus; evidence: string } {
  const idx = indexOf(container);
  const nameOf = (id: string) => idx.triggers.get(id)?.name || `trigger ${id}`;
  const firing = tag.firingTriggerIds;
  const names = firing.map(nameOf).join(', ');

  if (tag.consent.status === 'needed' && tag.consent.types.length) {
    return { status: 'gated', evidence: `Consent settings require ${tag.consent.types.join(', ')}.` };
  }
  if (GOOGLE_TYPES.has(tag.type)) {
    return { status: 'google_consent_mode', evidence: 'Google tag: adapts to Consent Mode instead of being blocked; judged by the Consent Mode default check.' };
  }
  if (firing.length && firing.every((id) => isConsentTrigger(id, container))) {
    return { status: 'gated', evidence: `Every firing trigger has a consent condition (${names}).` };
  }
  const blocker = tag.blockingTriggerIds.find((id) => isConsentTrigger(id, container));
  if (blocker) return { status: 'gated', evidence: `Blocked by the consent trigger "${nameOf(blocker)}".` };
  if (firing.length && firing.every((id) => CONSENT_NAME_RE.test(nameOf(id)))) {
    return { status: 'likely_gated', evidence: `No consent condition found; consent inferred from the trigger name only (${names}).` };
  }
  return { status: 'not_gated', evidence: firing.length ? `No consent condition found on ${names}.` : 'No consent condition found; the tag has no firing trigger.' };
}
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/foundation/gtm-audit-consent.test.mjs`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/gtm-audit/consent.ts tests/foundation/gtm-audit-consent.test.mjs
git commit -m "feat(gtm-audit): consent status from consent settings, CMP events, variables and trigger groups" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Rules → findings

**Files:**
- Create: `supabase/functions/_shared/gtm-audit/info.ts`
- Create: `supabase/functions/_shared/gtm-audit/covered.ts`
- Create: `supabase/functions/_shared/gtm-audit/rules/finding.ts`
- Create: `supabase/functions/_shared/gtm-audit/rules/consent.ts`
- Create: `supabase/functions/_shared/gtm-audit/rules/hygiene.ts`
- Create: `supabase/functions/_shared/gtm-audit/rules/index.ts`
- Test: `tests/foundation/gtm-audit-rules.test.mjs`

**Interfaces:**
- Consumes: `identify, templateFor` (Task 3); `consentStatus, isConsentTrigger` (Task 4); `GOOGLE_TYPES, TYPE_LABEL` (Task 2); `vendorById` from `../tracking-vendors.ts`; `Finding, FindingStatus, Owner, Priority` from `../tracking-check/types.ts`.
- Produces: `tagInfos(container: Container): TagInfo[]`; `coveredReason(info: TagInfo): string | null`; `runRules(container: Container, infos: TagInfo[]): Finding[]` (exactly one finding per `CHECK_KEYS` entry, in that order); `duplicateGroups(infos: TagInfo[]): TagInfo[][]` (re-exported from `rules/index.ts`); `missingConsent(infos: TagInfo[]): TagInfo[]` (`rules/consent.ts`); from `rules/finding.ts`: `EVIDENCE_LEVEL`, `isActive(info): boolean`, `tagLabel(info): string`, `typeLabel(type: string): string`, `plural(n, one, many?)`, `finding(...)`.

- [ ] **Step 1: Write the failing tests**

`tests/foundation/gtm-audit-rules.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../../supabase/functions/_shared/gtm-audit/parse.ts';
import { tagInfos } from '../../supabase/functions/_shared/gtm-audit/info.ts';
import { runRules, duplicateGroups } from '../../supabase/functions/_shared/gtm-audit/rules/index.ts';
import { EVIDENCE_LEVEL } from '../../supabase/functions/_shared/gtm-audit/rules/finding.ts';
import { CHECK_KEYS } from '../../supabase/functions/_shared/gtm-audit/types.ts';
import {
  tag, tpl, needed, trigger, customEvent, variable, template, tplType, exportOf, ALL_PAGES, CONSENT_INIT,
} from '../../scripts/gtm-audit/fixture.mjs';

const OLD = Date.UTC(2023, 0, 1);
const run = (spec) => {
  const c = parse(exportOf(spec));
  const infos = tagInfos(c);
  return { infos, byKey: Object.fromEntries(runRules(c, infos).map((f) => [f.checkKey, f])) };
};
const liHtml = tpl('html', '<script src="https://snap.licdn.com/li.lms-analytics/insight.min.js"></script>');
const chatHtml = tpl('html', '<script>var s=document.createElement("script");s.src="https://cdn.example-chat.com/w.js";</script>');

test('every rule returns one GTM finding with the configuration evidence level', () => {
  const { byKey } = run({ tags: [tag(1, 'Inline', 'html', [tpl('html', '<script>1</script>')])] });
  assert.deepEqual(Object.keys(byKey), [...CHECK_KEYS]);
  for (const f of Object.values(byKey)) {
    assert.equal(f.scope, 'GTM');
    assert.equal(f.evidence.details[0], EVIDENCE_LEVEL);
    assert.deepEqual(f.evidence.pages, []);
    if (f.status === 'pass') { assert.equal(f.priority, null); assert.equal(f.fix, ''); }
  }
});

test('gtm.consent_missing: marketing tag and third-party Custom HTML without a consent condition', () => {
  const { byKey } = run({
    tags: [
      tag(1, 'LinkedIn', 'html', [liHtml]),
      tag(2, 'Chat widget', 'html', [chatHtml]),
      tag(3, 'LinkedIn gated', 'html', [liHtml], { consent: needed('ad_storage') }),
      tag(4, 'Inline push', 'html', [tpl('html', '<script>dataLayer.push({a:1})</script>')]),
      tag(5, 'GA4', 'gaawe'),
      tag(6, 'Paused LI', 'html', [liHtml], { paused: true }),
    ],
  });
  const f = byKey['gtm.consent_missing'];
  assert.deepEqual([f.status, f.priority, f.typicalOwner], ['fail', 'high', 'gtm']);
  assert.equal(f.evidence.details.length, 3);
  assert.match(f.evidence.details[1], /^LinkedIn \(LinkedIn Insight Tag\): No consent condition found/);
  assert.match(f.evidence.details[2], /^Chat widget \(Custom HTML\)/);
  assert.doesNotMatch(JSON.stringify(f), /fires without consent/i);
  assert.equal(run({ tags: [tag(3, 'LI', 'html', [liHtml], { consent: needed('ad_storage') })] }).byKey['gtm.consent_missing'].status, 'pass');
});

test('gtm.consent_inferred: consent read from the trigger name only', () => {
  const { byKey } = run({ tags: [tag(1, 'LI', 'html', [liHtml], { fire: [13] })], triggers: [trigger(13, 'Consent Analytics Trigger', 'PAGEVIEW')] });
  assert.deepEqual([byKey['gtm.consent_inferred'].status, byKey['gtm.consent_inferred'].priority], ['manual', 'medium']);
  assert.equal(byKey['gtm.consent_missing'].status, 'pass');
});

test('gtm.identifies_visitors: fail when not gated, warning when gated, owner legal', () => {
  const claydar = tpl('html', '<script src="https://static.claydar.com/t.js"></script>');
  const open = run({ tags: [tag(1, 'Clay', 'html', [claydar])] }).byKey['gtm.identifies_visitors'];
  assert.deepEqual([open.status, open.priority, open.typicalOwner], ['fail', 'high', 'legal']);
  const gated = run({
    tags: [tag(1, 'Clay', 'html', [claydar], { fire: [10] })], triggers: [customEvent(10, 'CE consent', 'cookie_consent_marketing')],
  }).byKey['gtm.identifies_visitors'];
  assert.deepEqual([gated.status, gated.priority], ['warning', 'high']);
  assert.equal(run({ tags: [tag(1, 'LI', 'html', [liHtml])] }).byKey['gtm.identifies_visitors'].status, 'pass');
});

test('gtm.consent_mode_default: Google tags need a default on Consent Initialization', () => {
  const missing = run({ tags: [tag(1, 'GA4', 'gaawe')] }).byKey['gtm.consent_mode_default'];
  assert.deepEqual([missing.status, missing.priority], ['warning', 'medium']);
  assert.match(missing.explanation, /page source/);
  const html = run({ tags: [tag(1, 'GA4', 'gaawe'), tag(2, 'Default', 'html', [tpl('html', "<script>gtag('consent', 'default', {ad_storage:'denied'})</script>")], { fire: [CONSENT_INIT] })] });
  assert.equal(html.byKey['gtm.consent_mode_default'].status, 'pass');
  const cmp = run({
    tags: [tag(1, 'GA4', 'gaawe'), tag(2, 'CMP', tplType(22), [], { fire: [CONSENT_INIT] })],
    templates: [template(22, 'CMP', { permissions: { access_consent: [] } })],
  });
  assert.equal(cmp.byKey['gtm.consent_mode_default'].status, 'pass');
  assert.equal(run({ tags: [tag(1, 'LI', 'html', [liHtml])] }).byKey['gtm.consent_mode_default'].status, 'pass');
});

test('gtm.unknown_custom_html and gtm.community_template_injects', () => {
  const { byKey } = run({
    tags: [
      tag(1, 'Chat widget', 'html', [chatHtml]),
      tag(2, 'HubSpot form listener', 'html', [tpl('html', "<script>window.addEventListener('message',function(e){if(e.data.eventName==='onFormSubmitted'){}})</script>")]),
      tag(3, 'Helper', tplType(23)),
    ],
    templates: [template(23, 'Visitor helper', { permissions: { inject_script: ['https://cdn.example-widgets.com/*'] }, gallery: ['example-dev', 'visitor-helper'] })],
  });
  const u = byKey['gtm.unknown_custom_html'];
  assert.deepEqual([u.status, u.priority, u.evidence.details.length], ['manual', 'medium', 2]);
  assert.match(u.evidence.details[1], /cdn\.example-chat\.com/);
  const c = byKey['gtm.community_template_injects'];
  assert.deepEqual([c.status, c.priority], ['manual', 'low']);
  assert.match(c.evidence.details[1], /cdn\.example-widgets\.com/);
});

test('gtm.duplicate: same vendor, ID and event on the same trigger', () => {
  const ev = (id) => tag(id, `GA4 lead ${id}`, 'gaawe', [tpl('eventName', 'generate_lead'), tpl('measurementIdOverride', '{{GA4 ID}}')], { fire: [15] });
  const spec = { tags: [ev(1), ev(2), tag(3, 'GA4 other', 'gaawe', [tpl('eventName', 'sign_up'), tpl('measurementIdOverride', '{{GA4 ID}}')], { fire: [15] })], triggers: [customEvent(15, 'CE lead', 'generate_lead')] };
  const { byKey, infos } = run(spec);
  assert.deepEqual([byKey['gtm.duplicate'].status, byKey['gtm.duplicate'].priority], ['warning', 'medium']);
  assert.deepEqual(duplicateGroups(infos).map((g) => g.map((i) => i.tag.id)), [['1', '2']]);
});

test('gtm.dead: paused tags, tags without triggers, unused triggers and variables', () => {
  const { byKey } = run({
    tags: [
      tag(1, 'Paused', 'html', [], { paused: true }),
      tag(2, 'No trigger', 'html', [], { fire: [] }),
      tag(3, 'Uses var', 'html', [tpl('html', '<script>var id = "{{Pixel ID}}"</script>')], { fire: [10] }),
    ],
    triggers: [customEvent(10, 'Used', 'x'), trigger(14, 'Old landing page', 'PAGEVIEW')],
    variables: [variable(30, 'Pixel ID', 'c', [tpl('value', '123')]), variable(31, 'DLV unused', 'v', [tpl('name', 'unused')])],
  });
  const f = byKey['gtm.dead'];
  assert.deepEqual([f.status, f.priority], ['warning', 'low']);
  assert.deepEqual(f.evidence.details.slice(1), ['Paused tag: Paused', 'Tag without a firing trigger: No trigger', 'Unused trigger: Old landing page', 'Unused variable: DLV unused']);
});

test('gtm.stale: active tags unchanged for more than 24 months before the export', () => {
  const { byKey } = run({ tags: [tag(1, 'Old', 'html', [], { modified: OLD }), tag(2, 'New', 'html'), tag(3, 'Old paused', 'html', [], { modified: OLD, paused: true })] });
  const f = byKey['gtm.stale'];
  assert.deepEqual([f.status, f.priority, f.typicalOwner, f.evidence.details.length], ['manual', 'low', 'marketing', 2]);
  assert.match(f.evidence.details[1], /2023-01-01/);
  // Without exportTime the newest tag's modifiedAt is the reference date.
  const raw = exportOf({ tags: [tag(1, 'Old', 'html', [], { modified: OLD }), tag(2, 'New', 'html')] });
  delete raw.exportTime;
  const c = parse(raw);
  assert.equal(runRules(c, tagInfos(c)).find((f) => f.checkKey === 'gtm.stale').status, 'manual');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/foundation/gtm-audit-rules.test.mjs`
Expected: FAIL — `Cannot find module .../gtm-audit/info.ts`.

- [ ] **Step 3: Implement `info.ts` and `covered.ts`**

`supabase/functions/_shared/gtm-audit/info.ts`:

```ts
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
```

`supabase/functions/_shared/gtm-audit/covered.ts`:

```ts
/** Tags whose job CortIQ already does. Facts about what exists today — never promises. */
import type { TagInfo } from './types.ts';

const UTM_RE = /utm_|gclid/i;
const STORE_RE = /localStorage|sessionStorage|document\.cookie/i;
const HUBSPOT_RE = /hsFormCallback|onFormSubmitted|hs-form-event|onFormReady/;

const UTM = 'UTM and click ID persistence: CortIQ captures UTM parameters and click IDs (click IDs only with marketing consent).';

export function coveredReason(info: TagInfo): string | null {
  if (info.ident.covers === 'utm') return UTM;
  const html = info.tag.type === 'html' && typeof info.tag.params.html === 'string' ? info.tag.params.html : '';
  if (html && UTM_RE.test(html) && STORE_RE.test(html)) return UTM;
  if (info.vendor?.id === 'clarity' || info.vendor?.id === 'hotjar') return 'Session replay and heatmaps: CortIQ includes both.';
  if (html && HUBSPOT_RE.test(html)) return 'HubSpot form listener: CortIQ detects HubSpot forms and can count submissions as goals.';
  return null;
}
```

- [ ] **Step 4: Implement the finding helper**

`supabase/functions/_shared/gtm-audit/rules/finding.ts`:

```ts
import type { Finding, FindingStatus, Owner, Priority } from '../../tracking-check/types.ts';
import type { CheckKey, TagInfo } from '../types.ts';
import { TYPE_LABEL } from '../tag-types.ts';

export const EVIDENCE_LEVEL = 'Evidence level: configuration (container export, not observed live)';
const MAX_DETAILS = 200;

export const isActive = (i: TagInfo): boolean => !i.tag.paused && i.tag.firingTriggerIds.length > 0;

export const typeLabel = (type: string): string =>
  (Object.prototype.hasOwnProperty.call(TYPE_LABEL, type) ? TYPE_LABEL[type] : type.startsWith('cvt_') ? 'Custom template' : type || 'Unknown type');

export const tagLabel = (i: TagInfo): string =>
  `${i.tag.name || 'Unnamed tag'} (${i.vendor?.name ?? (i.template?.name || typeLabel(i.tag.type))})`;

export const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

export function finding(
  checkKey: CheckKey, title: string, status: FindingStatus, priority: Priority, owner: Owner,
  explanation: string, fix: string, details: string[],
): Finding {
  const pass = status === 'pass';
  return {
    scope: 'GTM', checkKey, title, status,
    priority: pass ? null : priority, explanation, fix: pass ? '' : fix, typicalOwner: pass ? null : owner,
    evidence: { pages: [], details: [EVIDENCE_LEVEL, ...details.slice(0, MAX_DETAILS)] },
  };
}
```

- [ ] **Step 5: Implement the consent rules**

`supabase/functions/_shared/gtm-audit/rules/consent.ts`:

```ts
import type { Finding } from '../../tracking-check/types.ts';
import type { Container, TagInfo } from '../types.ts';
import { GOOGLE_TYPES } from '../tag-types.ts';
import { finding, isActive, plural, tagLabel } from './finding.ts';

const LOADS_SCRIPT = /<script[^>]+src\s*=|createElement\(\s*['"]script['"]\s*\)/i;

/** Analytics/marketing vendor tags, and unidentified Custom HTML that loads an external script. */
function needsConsent(i: TagInfo): boolean {
  if (i.vendor) return (i.vendor.category === 'analytics' || i.vendor.category === 'marketing') && i.vendor.kind !== 'cmp' && i.vendor.kind !== 'infrastructure';
  const html = typeof i.tag.params.html === 'string' ? i.tag.params.html : '';
  return i.tag.type === 'html' && i.ident.urls.length > 0 && LOADS_SCRIPT.test(html);
}

/** Active tags that need consent and have no consent condition. Shared with the audit summary. */
export const missingConsent = (infos: TagInfo[]): TagInfo[] =>
  infos.filter((i) => isActive(i) && i.consent === 'not_gated' && needsConsent(i));

export function consentMissing(infos: TagInfo[]): Finding {
  const hits = missingConsent(infos);
  if (!hits.length) {
    return finding('gtm.consent_missing', 'Every analytics and marketing tag has a consent condition', 'pass', 'high', 'gtm', 'Each analytics and marketing tag waits for a consent condition in its triggers or consent settings.', '', []);
  }
  return finding('gtm.consent_missing', `${plural(hits.length, 'tag')} with no consent condition found`, 'fail', 'high', 'gtm',
    'These analytics or marketing tags fire on triggers with no consent condition, and their consent settings require no consent type. A trigger can still depend on logic the audit cannot read (for example a Custom JavaScript variable), so check each tag before changing it.',
    "Fire each tag on your consent tool's consent event, or set Additional consent checks (ad_storage or analytics_storage) in the tag's consent settings.",
    hits.map((i) => `${tagLabel(i)}: ${i.consentEvidence}`));
}

export function consentInferred(infos: TagInfo[]): Finding {
  const hits = infos.filter((i) => isActive(i) && i.consent === 'likely_gated');
  if (!hits.length) return finding('gtm.consent_inferred', 'No consent read from trigger names alone', 'pass', 'medium', 'gtm', 'No tag relies on a trigger whose consent condition is only implied by its name.', '', []);
  return finding('gtm.consent_inferred', `${plural(hits.length, 'tag')} where consent is only implied by the trigger name`, 'manual', 'medium', 'gtm',
    'The trigger names suggest consent, but the triggers have no condition the audit can read. The consent check may live in a variable or in code outside the container.',
    'Open each trigger in GTM Preview and confirm that the tag waits for the visitor\'s choice.',
    hits.map((i) => `${tagLabel(i)}: ${i.consentEvidence}`));
}

export function identifiesVisitors(infos: TagInfo[]): Finding {
  const hits = infos.filter((i) => isActive(i) && i.vendor?.identifiesVisitors);
  if (!hits.length) return finding('gtm.identifies_visitors', 'No visitor identification tools found', 'pass', 'high', 'legal', 'No tag loads a tool that matches visits to companies or people.', '', []);
  const open = hits.some((i) => i.consent === 'not_gated');
  return finding('gtm.identifies_visitors', `${plural(hits.length, 'tag')} that identify visitors`, open ? 'fail' : 'warning', 'high', 'legal',
    'These tools match visits to companies or people (B2B visitor identification). That is processing of personal data, which usually needs consent and a mention in the privacy policy, also when the tag waits for consent.',
    'Confirm the legal basis with your data protection officer or lawyer, name each tool in the privacy policy and keep it behind marketing consent.',
    hits.map((i) => `${tagLabel(i)}: ${i.consentEvidence}`));
}

const DEFAULT_RE = /['"]consent['"]\s*,\s*['"]default['"]/;

export function consentModeDefault(container: Container, infos: TagInfo[]): Finding {
  const google = infos.filter((i) => isActive(i) && GOOGLE_TYPES.has(i.tag.type) && i.tag.type !== 'ua');
  if (!google.length) return finding('gtm.consent_mode_default', 'No Google tags, so no Consent Mode default is needed', 'pass', 'medium', 'gtm', 'The container has no active Google tags.', '', []);
  const initIds = new Set(container.triggers.filter((t) => t.type === 'CONSENT_INIT').map((t) => t.id));
  const setter = infos.find((i) => !i.tag.paused && i.tag.firingTriggerIds.some((id) => initIds.has(id)) && (
    i.vendor?.kind === 'cmp'
    || !!i.template?.permissions.includes('access_consent')
    || (typeof i.tag.params.html === 'string' && DEFAULT_RE.test(i.tag.params.html))
  ));
  if (setter) return finding('gtm.consent_mode_default', 'Consent Mode default is set on Consent Initialization', 'pass', 'medium', 'gtm', 'A tag on Consent Initialization sets the Consent Mode default before Google tags run.', '', [`Set by ${tagLabel(setter)}`]);
  return finding('gtm.consent_mode_default', 'No Consent Mode default found on Consent Initialization', 'warning', 'medium', 'gtm',
    'The container has Google tags but no tag on the Consent Initialization trigger that sets a Consent Mode default (a consent tool template or a gtag("consent", "default", …) tag). Without a default, Google tags may use storage before the visitor chooses. A default set in the page source before GTM loads also works — check the page if that is how this site does it.',
    'Add your consent tool\'s GTM template on Consent Initialization – All Pages, or a tag there that runs gtag("consent", "default", {…}).',
    google.map(tagLabel));
}
```

- [ ] **Step 6: Implement the hygiene rules**

`supabase/functions/_shared/gtm-audit/rules/hygiene.ts`:

```ts
import type { Finding } from '../../tracking-check/types.ts';
import type { Container, ParamValue, TagInfo } from '../types.ts';
import { coveredReason } from '../covered.ts';
import { finding, isActive, plural, tagLabel } from './finding.ts';

const DAY = 86_400_000;
const STALE_DAYS = 730;
const ID_KEYS = ['tagId', 'measurementIdOverride', 'measurementId', 'conversionId', 'pixelId', 'pixel_id', 'partnerId', 'trackingId'];
const EVENT_KEYS = ['eventName', 'standardEventName', 'event', 'conversionLabel', 'eventType'];
const text = (v: ParamValue | undefined): string => (typeof v === 'string' ? v : '');
const firstOf = (i: TagInfo, keys: string[]): string => keys.map((k) => text(i.tag.params[k])).find(Boolean) ?? '';
const hostsOf = (urls: string[]): string => [...new Set(urls.map((u) => { try { return new URL(u).hostname; } catch { return u; } }))].join(', ');

export function unknownCustomHtml(infos: TagInfo[]): Finding {
  const hits = infos.filter((i) => !i.tag.paused && i.tag.type === 'html' && !i.ident.vendorId && !coveredReason(i));
  if (!hits.length) return finding('gtm.unknown_custom_html', 'Every Custom HTML tag was identified', 'pass', 'medium', 'gtm', 'Each Custom HTML tag loads a known vendor or does something CortIQ covers.', '', []);
  return finding('gtm.unknown_custom_html', `${plural(hits.length, 'Custom HTML tag')} the audit could not identify`, 'manual', 'medium', 'gtm',
    'The audit could not match these Custom HTML tags to a known vendor. Check what each one loads and sends, and whether it needs consent.',
    'Name the vendor in the tag name, switch to a gallery template where one exists, or remove tags nobody owns.',
    hits.map((i) => `${tagLabel(i)}: ${i.ident.urls.length ? `loads ${hostsOf(i.ident.urls)}` : 'no external URL'}`));
}

export function communityTemplateInjects(infos: TagInfo[]): Finding {
  const hits = infos.filter((i) => !i.tag.paused && i.ident.templateOrigin === 'community' && !!i.template?.permissions.includes('inject_script'));
  if (!hits.length) return finding('gtm.community_template_injects', 'No community template injects scripts', 'pass', 'low', 'gtm', 'Every template that loads scripts is published by its vendor.', '', []);
  return finding('gtm.community_template_injects', `${plural(hits.length, 'community template')} that may load scripts`, 'manual', 'low', 'gtm',
    'These templates are not published by the vendor and may load scripts from the URLs listed in their permissions. Check who maintains each one and whether the URLs belong to the vendor.',
    "Prefer the vendor's own template; otherwise review the template's code and permission URLs before each update.",
    hits.map((i) => `${tagLabel(i)}: ${i.ident.urls.length ? hostsOf(i.ident.urls) : 'no URL listed'}`));
}

/** Tags with the same vendor, ID and event on a shared firing trigger. First tag of each group is the one to keep. */
export function duplicateGroups(infos: TagInfo[]): TagInfo[][] {
  const groups = new Map<string, TagInfo[]>();
  for (const i of infos) {
    if (i.tag.paused || !i.ident.vendorId) continue;
    const id = firstOf(i, ID_KEYS), ev = firstOf(i, EVENT_KEYS);
    if (!id && !ev) continue;
    for (const trig of i.tag.firingTriggerIds) {
      const key = `${i.ident.vendorId}|${id}|${ev}|${trig}`;
      groups.set(key, [...(groups.get(key) ?? []), i]);
    }
  }
  const seen = new Set<string>();
  const out: TagInfo[][] = [];
  for (const g of groups.values()) {
    const members = [...new Set(g)];
    const key = members.map((i) => i.tag.id).join(',');
    if (members.length > 1 && !seen.has(key)) { seen.add(key); out.push(members); }
  }
  return out;
}

export function duplicate(infos: TagInfo[]): Finding {
  const groups = duplicateGroups(infos);
  if (!groups.length) return finding('gtm.duplicate', 'No duplicate tags found', 'pass', 'medium', 'gtm', 'No two tags send the same vendor, ID and event on the same trigger.', '', []);
  return finding('gtm.duplicate', `${plural(groups.length, 'set')} of duplicate tags`, 'warning', 'medium', 'gtm',
    'These tags send the same vendor, ID and event on the same trigger, so the event is likely counted more than once.',
    'Keep one tag per event and pause or delete the others.',
    groups.map((g) => g.map(tagLabel).join(' = ')));
}

export function dead(container: Container, infos: TagInfo[]): Finding {
  const details: string[] = [];
  for (const i of infos) if (i.tag.paused) details.push(`Paused tag: ${i.tag.name}`);
  for (const i of infos) if (!i.tag.paused && !i.tag.firingTriggerIds.length) details.push(`Tag without a firing trigger: ${i.tag.name}`);
  const used = new Set([
    ...container.tags.flatMap((t) => [...t.firingTriggerIds, ...t.blockingTriggerIds]),
    ...container.triggers.flatMap((t) => t.groupTriggerIds),
  ]);
  for (const t of container.triggers) if (!t.builtIn && !used.has(t.id)) details.push(`Unused trigger: ${t.name}`);
  const haystack = JSON.stringify([container.tags.map((t) => t.params), container.triggers.map((t) => t.conditions)]);
  const bodies = container.variables.map((v) => JSON.stringify(v.params));
  container.variables.forEach((v, n) => {
    const ref = `{{${v.name}}}`;
    if (!haystack.includes(ref) && !bodies.some((b, m) => m !== n && b.includes(ref))) details.push(`Unused variable: ${v.name}`);
  });
  if (!details.length) return finding('gtm.dead', 'No paused or unused items', 'pass', 'low', 'gtm', 'Every tag has a trigger and every trigger and variable is used.', '', []);
  return finding('gtm.dead', `${plural(details.length, 'paused or unused item')}`, 'warning', 'low', 'gtm',
    'Paused tags, tags without a trigger and unused triggers and variables do nothing, but make the container harder to read and audit.',
    'Delete them in GTM, or move them to a folder named "Archive" if you need them later.',
    details);
}

export function stale(container: Container, infos: TagInfo[]): Finding {
  const times = container.tags.map((t) => t.modifiedAt).filter((t): t is number => t !== null);
  const ref = container.exportedAt ?? (times.length ? Math.max(...times) : null);
  const hits = ref === null ? [] : infos.filter((i) => !i.tag.paused && i.tag.modifiedAt !== null && ref - i.tag.modifiedAt > STALE_DAYS * DAY);
  if (!hits.length) return finding('gtm.stale', 'No tags older than two years', 'pass', 'low', 'marketing', 'Every active tag was changed within two years before the export.', '', []);
  return finding('gtm.stale', `${plural(hits.length, 'tag')} unchanged for more than two years`, 'manual', 'low', 'marketing',
    'Old tags often belong to campaigns, agencies or tools that are no longer used.',
    'Ask the owner whether each tag is still needed and remove the ones nobody claims.',
    hits.map((i) => `${tagLabel(i)}: last changed ${new Date(i.tag.modifiedAt as number).toISOString().slice(0, 10)}`));
}
```

`supabase/functions/_shared/gtm-audit/rules/index.ts`:

```ts
import type { Finding } from '../../tracking-check/types.ts';
import type { Container, TagInfo } from '../types.ts';
import { consentInferred, consentMissing, consentModeDefault, identifiesVisitors } from './consent.ts';
import { communityTemplateInjects, dead, duplicate, stale, unknownCustomHtml } from './hygiene.ts';

export { duplicateGroups } from './hygiene.ts';

/** One finding per CHECK_KEYS entry, in CHECK_KEYS order. */
export function runRules(container: Container, infos: TagInfo[]): Finding[] {
  return [
    consentMissing(infos),
    consentInferred(infos),
    identifiesVisitors(infos),
    consentModeDefault(container, infos),
    unknownCustomHtml(infos),
    communityTemplateInjects(infos),
    duplicate(infos),
    dead(container, infos),
    stale(container, infos),
  ];
}
```

- [ ] **Step 7: Run tests**

Run: `node --test tests/foundation/gtm-audit-rules.test.mjs`
Expected: PASS (9 tests).

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/_shared/gtm-audit/info.ts supabase/functions/_shared/gtm-audit/covered.ts supabase/functions/_shared/gtm-audit/rules tests/foundation/gtm-audit-rules.test.mjs
git commit -m "feat(gtm-audit): consent, identification, duplicate, dead and stale rules" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Migration classes and the `audit()` entry point

**Files:**
- Create: `supabase/functions/_shared/gtm-audit/migrate.ts`
- Create: `supabase/functions/_shared/gtm-audit/audit.ts`
- Test: `tests/foundation/gtm-audit-migrate.test.mjs`
- Test: `tests/foundation/gtm-audit-audit.test.mjs`

**Interfaces:**
- Consumes: `parse, isParseError` (Task 2); `tagInfos`, `coveredReason` (Task 5); `runRules, duplicateGroups` from `rules/index.ts`; `missingConsent` from `rules/consent.ts`; `isActive, typeLabel, plural` from `rules/finding.ts`; `isConsentTrigger` (Task 4); `GOOGLE_TYPES` (Task 2).
- Produces: `MIGRATION_LABEL: Record<MigrationClass, string>`; `migrate(info: TagInfo, ctx: MigrateContext): { migration: MigrationClass; reason: string }`; `migrationContext(container, infos): MigrateContext`; `ENGINE_VERSION = 1`; `audit(input: unknown): AuditResult | ParseError` (never throws).

- [ ] **Step 1: Write the failing migration tests**

`tests/foundation/gtm-audit-migrate.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../../supabase/functions/_shared/gtm-audit/parse.ts';
import { tagInfos } from '../../supabase/functions/_shared/gtm-audit/info.ts';
import { migrate, migrationContext, MIGRATION_LABEL } from '../../supabase/functions/_shared/gtm-audit/migrate.ts';
import { MIGRATION_CLASSES } from '../../supabase/functions/_shared/gtm-audit/types.ts';
import { tag, tpl, trigger, customEvent, template, tplType, exportOf, ALL_PAGES } from '../../scripts/gtm-audit/fixture.mjs';

const html = (src) => tpl('html', `<script src="${src}"></script>`);
const triggers = [
  customEvent(10, 'CE - marketing consent', 'cookie_consent_marketing'),
  customEvent(15, 'CE - lead', 'generate_lead'),
  trigger(12, 'Form submit - contact', 'FORM_SUBMISSION'),
];
const templates = [
  template(20, 'Meta Pixel', { permissions: { inject_script: ['https://connect.facebook.net/*'] }, gallery: ['facebookarchive', 'GoogleTagManager-WebTemplate-For-FacebookPixel'] }),
  template(22, 'Cookiebot CMP', { permissions: { inject_script: ['https://*.cookiebot.com/*'], access_consent: [] }, gallery: ['cybotcorp', 'gtm-templates'] }),
  template(25, 'Mystery template', { gallery: ['example-dev', 'mystery'] }),
];
const classes = (tags) => {
  const c = parse(exportOf({ tags, triggers, templates }));
  const infos = tagInfos(c);
  const ctx = migrationContext(c, infos);
  return Object.fromEntries(infos.map((i) => [i.tag.name, migrate(i, ctx)]));
};

test('every class has a label', () => {
  assert.deepEqual(Object.keys(MIGRATION_LABEL).sort(), [...MIGRATION_CLASSES].sort());
});

test('remove: paused, no trigger, duplicates after the first, Universal Analytics', () => {
  const ga = (id) => tag(id, `GA4 lead ${id}`, 'gaawe', [tpl('eventName', 'generate_lead'), tpl('measurementIdOverride', 'G-SAMPLE')], { fire: [15] });
  const m = classes([
    tag(1, 'Paused', 'html', [html('https://snap.licdn.com/li.lms-analytics/insight.min.js')], { paused: true }),
    tag(2, 'No trigger', 'html', [], { fire: [] }),
    ga(3), ga(4),
    tag(5, 'UA pageview', 'ua'),
  ]);
  assert.equal(m.Paused.migration, 'remove');
  assert.equal(m['No trigger'].migration, 'remove');
  assert.equal(m['GA4 lead 3'].migration, 'keep_google');
  assert.equal(m['GA4 lead 4'].migration, 'remove');
  assert.match(m['GA4 lead 4'].reason, /Duplicate of GA4 lead 3/);
  assert.equal(m['UA pageview'].migration, 'remove');
  assert.match(m['UA pageview'].reason, /no longer processes data/);
});

test('consent_tool and covered', () => {
  const m = classes([
    tag(1, 'Cookiebot', tplType(22), [], { fire: ['2147479572'] }),
    tag(2, 'UTM saver', 'html', [tpl('html', "<script>var p=new URLSearchParams(location.search);if(p.get('utm_source'))sessionStorage.setItem('utm',p.toString())</script>")]),
    tag(3, 'Clarity', 'html', [html('https://www.clarity.ms/tag/abc123')]),
    tag(4, 'HubSpot listener', 'html', [tpl('html', "<script>window.addEventListener('message',function(e){if(e.data.eventName==='onFormSubmitted'){dataLayer.push({event:'hs_submit'})}})</script>")]),
  ]);
  assert.equal(m.Cookiebot.migration, 'consent_tool');
  for (const name of ['UTM saver', 'Clarity', 'HubSpot listener']) assert.equal(m[name].migration, 'covered', name);
  assert.match(m.Clarity.reason, /Session replay/);
});

test('conversion vs pixel for Google Ads and pixel vendors', () => {
  const m = classes([
    tag(1, 'Ads conversion', 'awct'),
    tag(2, 'Ads remarketing', 'sp'),
    tag(3, 'Meta PageView', tplType(20), [tpl('eventName', 'standard'), tpl('standardEventName', 'PageView')], { fire: [10] }),
    tag(4, 'Meta Lead', tplType(20), [tpl('eventName', 'standard'), tpl('standardEventName', 'Lead')], { fire: [12] }),
    tag(5, 'LinkedIn insight', 'html', [html('https://snap.licdn.com/li.lms-analytics/insight.min.js')]),
    tag(6, 'LinkedIn on lead event', 'html', [tpl('html', '<img src="https://px.ads.linkedin.com/collect/?pid=1234&fmt=gif">')], { fire: [15] }),
    tag(7, 'Reddit custom', 'html', [tpl('html', "<script src=\"https://www.redditstatic.com/ads/pixel.js\"></script><script>rdt('track', 'SignUp')</script>")]),
  ]);
  assert.equal(m['Ads conversion'].migration, 'conversion');
  assert.equal(m['Ads remarketing'].migration, 'pixel');
  assert.equal(m['Meta PageView'].migration, 'pixel');
  assert.equal(m['Meta Lead'].migration, 'conversion');
  assert.equal(m['LinkedIn insight'].migration, 'pixel');
  assert.equal(m['LinkedIn on lead event'].migration, 'conversion');
  assert.equal(m['Reddit custom'].migration, 'conversion');
});

test('keep_google, third_party and review', () => {
  const m = classes([
    tag(1, 'Google tag', 'googtag', [tpl('tagId', 'G-SAMPLE')]),
    tag(2, 'Linker', 'gclidw'),
    tag(3, 'Clay', 'html', [html('https://static.claydar.com/t.js')]),
    tag(4, 'Chat', 'html', [html('https://cdn.example-chat.com/w.js')]),
    tag(5, 'Mystery', tplType(25)),
    tag(6, 'jsDelivr lib', 'html', [html('https://cdn.jsdelivr.net/npm/some-lib@1/x.js')]),
  ]);
  assert.equal(m['Google tag'].migration, 'keep_google');
  assert.equal(m.Linker.migration, 'keep_google');
  assert.equal(m.Clay.migration, 'third_party');
  assert.equal(m.Chat.migration, 'review');
  assert.equal(m.Mystery.migration, 'review');
  assert.equal(m['jsDelivr lib'].migration, 'review');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/foundation/gtm-audit-migrate.test.mjs`
Expected: FAIL — `Cannot find module .../gtm-audit/migrate.ts`.

- [ ] **Step 3: Implement `migrate.ts`**

`supabase/functions/_shared/gtm-audit/migrate.ts`:

```ts
/**
 * Migration class per tag: what the tag could become without GTM. Phrased as facts about what exists
 * today — never as promises of features CortIQ does not have.
 */
import type { Container, MigrationClass, ParamValue, TagInfo } from './types.ts';
import { GOOGLE_TYPES } from './tag-types.ts';
import { coveredReason } from './covered.ts';
import { isConsentTrigger } from './consent.ts';
import { duplicateGroups } from './rules/index.ts';

export const MIGRATION_LABEL: Record<MigrationClass, string> = {
  covered: 'Covered by CortIQ today',
  consent_tool: 'Consent tool — replaceable by the CortIQ banner',
  pixel: 'Pixel tag',
  conversion: 'Conversion tag — can be sent server-side',
  third_party: 'Third-party script',
  keep_google: 'Keep in Google',
  remove: 'Removal candidate',
  review: 'Review',
};

const PIXEL_VENDORS = new Set(['meta', 'linkedin', 'reddit', 'tiktok-pixel', 'pinterest-pixel', 'microsoft-ads', 'snap-pixel', 'x-pixel']);
const GOOGLE_CONVERSION = new Set(['awct', 'awcc', 'awud']);
const EVENT_KEYS = ['eventName', 'standardEventName', 'event', 'conversionLabel', 'eventType', 'customEventName'];
const CONVERSION_RE = /conversion|purchase|lead|signup|sign_up|submit|complete/i;
const PAGEVIEW_RE = /page_?view/i;
const PAGE_TYPES = new Set(['PAGEVIEW', 'DOM_READY', 'WINDOW_LOADED', 'INIT', 'CONSENT_INIT', 'HISTORY_CHANGE']);
const PIXEL_CALL_RE = /\b(?:fbq|rdt|twq|ttq|pintrk|snaptr|lintrk)\(([^)]{0,200})\)/g;

export interface MigrateContext {
  container: Container;
  /** Tag id → name of the tag it duplicates (every member of a duplicate group except the first). */
  duplicateOf: Map<string, string>;
}

export function migrationContext(container: Container, infos: TagInfo[]): MigrateContext {
  const duplicateOf = new Map<string, string>();
  for (const group of duplicateGroups(infos)) {
    for (const i of group.slice(1)) if (!duplicateOf.has(i.tag.id)) duplicateOf.set(i.tag.id, group[0].tag.name);
  }
  return { container, duplicateOf };
}

const text = (v: ParamValue | undefined): string => (typeof v === 'string' ? v : '');

/** Event names from template fields, plus the arguments of pixel calls in Custom HTML. */
function eventText(info: TagInfo): string {
  const parts = EVENT_KEYS.map((k) => text(info.tag.params[k]));
  const html = text(info.tag.params.html).slice(0, 200_000);
  for (const m of html.matchAll(PIXEL_CALL_RE)) parts.push(m[1]);
  return parts.join(' ');
}

function firesOnPageLoad(info: TagInfo, container: Container): boolean {
  return info.tag.firingTriggerIds.some((id) => {
    const t = container.triggers.find((x) => x.id === id);
    if (!t) return false;
    return PAGE_TYPES.has(t.type) || (t.type === 'CUSTOM_EVENT' && isConsentTrigger(id, container));
  });
}

type Result = { migration: MigrationClass; reason: string };
const out = (migration: MigrationClass, reason: string): Result => ({ migration, reason });

export function migrate(info: TagInfo, ctx: MigrateContext): Result {
  const { tag, vendor } = info;
  if (tag.paused) return out('remove', 'Paused: it does not run.');
  if (!tag.firingTriggerIds.length) return out('remove', 'No firing trigger: it never runs.');
  const dup = ctx.duplicateOf.get(tag.id);
  if (dup) return out('remove', `Duplicate of ${dup}: same vendor, ID and event on the same trigger.`);
  if (tag.type === 'ua') return out('remove', 'Universal Analytics no longer processes data.');

  if (vendor?.kind === 'cmp') return out('consent_tool', `${vendor.name}: the CortIQ consent banner can take its place.`);
  const covered = coveredReason(info);
  if (covered) return out('covered', covered);

  if (GOOGLE_CONVERSION.has(tag.type)) return out('conversion', 'Google Ads conversion: can be sent server-side as an offline or enhanced conversion.');
  if (tag.type === 'sp') return out('pixel', 'Google Ads remarketing tag: loads in the browser.');
  if (GOOGLE_TYPES.has(tag.type)) return out('keep_google', 'Google tag: keep it in Google\'s own setup (gtag.js or GTM).');

  if (vendor && PIXEL_VENDORS.has(vendor.id)) {
    const events = eventText(info);
    if (CONVERSION_RE.test(events)) return out('conversion', `${vendor.name} conversion event: can be sent server-side through the vendor's conversions API.`);
    if (PAGEVIEW_RE.test(events)) return out('pixel', `${vendor.name} page view: the pixel loads in the browser.`);
    if (!firesOnPageLoad(info, ctx.container)) return out('conversion', `${vendor.name} on an event trigger: likely a conversion that can be sent server-side.`);
    return out('pixel', `${vendor.name} on page load: the pixel loads in the browser.`);
  }
  if (vendor && vendor.kind !== 'infrastructure') return out('third_party', `${vendor.name}: a third-party script that can be loaded directly on the site, behind consent.`);
  return out('review', 'Not identified: check what it loads and sends.');
}
```

- [ ] **Step 4: Run migration tests**

Run: `node --test tests/foundation/gtm-audit-migrate.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 5: Write the failing audit tests**

`tests/foundation/gtm-audit-audit.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audit, ENGINE_VERSION } from '../../supabase/functions/_shared/gtm-audit/audit.ts';
import { CHECK_KEYS } from '../../supabase/functions/_shared/gtm-audit/types.ts';
import { tag, tpl, customEvent, variable, exportOf } from '../../scripts/gtm-audit/fixture.mjs';

const small = () => exportOf({
  tags: [
    tag(1, 'LinkedIn', 'html', [tpl('html', '<script src="https://snap.licdn.com/li.lms-analytics/insight.min.js"></script>')], { folder: 40 }),
    tag(2, 'Clay', 'html', [tpl('html', '<script src="https://static.claydar.com/t.js"></script>')], { fire: [10] }),
    tag(3, 'GA4 lead', 'gaawe', [tpl('eventName', 'generate_lead')], { fire: [15] }),
    tag(4, 'Old', 'html', [], { paused: true }),
  ],
  triggers: [customEvent(10, 'CE - marketing consent', 'cookie_consent_marketing'), customEvent(15, 'CE - lead', 'generate_lead')],
  variables: [variable(30, 'GA4 ID', 'c', [tpl('value', 'G-SAMPLE')])],
  folders: [{ folderId: '40', name: 'Marketing' }],
});

test('engine version is 1', () => assert.equal(ENGINE_VERSION, 1));

test('parse errors pass through unchanged', () => {
  assert.equal(audit('{').error, 'not_json');
  assert.equal(audit({}).error, 'not_gtm');
});

test('accepts the file text as well as the parsed object', () => {
  assert.equal(audit(JSON.stringify(small())).tags.length, 4);
});

test('rows, findings and summary', () => {
  const r = audit(small());
  assert.deepEqual(r.findings.map((f) => f.checkKey), [...CHECK_KEYS]);
  const li = r.tags.find((t) => t.name === 'LinkedIn');
  assert.deepEqual(
    [li.vendorId, li.vendorName, li.typeLabel, li.triggers, li.consent, li.migration, li.migrationLabel, li.folder],
    ['linkedin', 'LinkedIn Insight Tag', 'Custom HTML', ['All Pages'], 'not_gated', 'pixel', 'Pixel tag', 'Marketing'],
  );
  assert.equal(r.tags.find((t) => t.name === 'Old').migration, 'remove');
  assert.deepEqual([r.summary.tags, r.summary.noConsent, r.summary.identifies, r.summary.removal], [4, 1, 1, 1]);
  assert.equal(r.summary.headline, '1 of 4 tags has no consent condition · 1 identifies visitors · 1 removal candidate');
  assert.equal(Object.values(r.summary.counts).reduce((a, b) => a + b, 0), 4);
});

// Review Focus 1, end to end: random damage anywhere in a valid export never throws.
test('fuzz: damaged exports never throw', () => {
  let seed = 7;
  const rand = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const JUNK = [null, 0, -1, 1e308, '', 'x', [], {}, [null], { __proto__: { polluted: true } }, true, '{{_event}}', 'cvt_1_2'];
  const damage = (node, depth) => {
    if (!node || typeof node !== 'object' || depth > 6) return;
    const keys = Object.keys(node);
    if (!keys.length) return;
    const k = keys[rand(keys.length)];
    if (rand(3) === 0) node[k] = JUNK[rand(JUNK.length)];
    else damage(node[k], depth + 1);
  };
  for (let i = 0; i < 500; i += 1) {
    const doc = small();
    for (let j = 0; j < 1 + rand(5); j += 1) damage(doc, 0);
    const r = audit(doc);
    assert.ok(r && (typeof r.error === 'string' || Array.isArray(r.tags)), `iteration ${i}`);
  }
  assert.equal({}.polluted, undefined);
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `node --test tests/foundation/gtm-audit-audit.test.mjs`
Expected: FAIL — `Cannot find module .../gtm-audit/audit.ts`.

- [ ] **Step 7: Implement `audit.ts`**

`supabase/functions/_shared/gtm-audit/audit.ts`:

```ts
/**
 * audit — the one entry point the page and the tests call. Parses, identifies, runs the rules and
 * classifies every tag. Never throws: unexpected shapes become a ParseError.
 */
import type { AuditResult, AuditSummary, Container, MigrationClass, ParseError, TagInfo, TagRow } from './types.ts';
import { MIGRATION_CLASSES } from './types.ts';
import { isParseError, parse } from './parse.ts';
import { tagInfos } from './info.ts';
import { runRules } from './rules/index.ts';
import { missingConsent } from './rules/consent.ts';
import { isActive, plural, typeLabel } from './rules/finding.ts';
import { MIGRATION_LABEL, migrate, migrationContext } from './migrate.ts';

export const ENGINE_VERSION = 1;

function rows(container: Container, infos: TagInfo[]): TagRow[] {
  const ctx = migrationContext(container, infos);
  const triggerName = new Map(container.triggers.map((t) => [t.id, t.name]));
  const folderName = new Map(container.folders.map((f) => [f.id, f.name]));
  return infos.map((i) => {
    const { migration, reason } = migrate(i, ctx);
    return {
      id: i.tag.id,
      name: i.tag.name || 'Unnamed tag',
      typeLabel: i.template?.name || typeLabel(i.tag.type),
      vendorId: i.vendor?.id ?? null,
      vendorName: i.vendor?.name ?? 'Unidentified',
      triggers: i.tag.firingTriggerIds.map((id) => triggerName.get(id) || `Trigger ${id}`),
      consent: i.consent,
      consentEvidence: i.consentEvidence,
      modifiedAt: i.tag.modifiedAt,
      migration,
      migrationLabel: MIGRATION_LABEL[migration],
      migrationReason: reason,
      folder: (i.tag.folderId && folderName.get(i.tag.folderId)) || '',
      paused: i.tag.paused,
    };
  });
}

function summary(infos: TagInfo[], tags: TagRow[]): AuditSummary {
  const counts = Object.fromEntries(MIGRATION_CLASSES.map((c) => [c, 0])) as Record<MigrationClass, number>;
  for (const t of tags) counts[t.migration] += 1;
  const noConsent = missingConsent(infos).length;
  const identifies = infos.filter((i) => isActive(i) && i.vendor?.identifiesVisitors).length;
  const removal = counts.remove;
  const headline = [
    `${noConsent} of ${plural(tags.length, 'tag')} ${noConsent === 1 ? 'has' : 'have'} no consent condition`,
    `${identifies} ${identifies === 1 ? 'identifies' : 'identify'} visitors`,
    plural(removal, 'removal candidate'),
  ].join(' · ');
  return { headline, tags: tags.length, noConsent, identifies, removal, counts };
}

export function audit(input: unknown): AuditResult | ParseError {
  const parsed = parse(input);
  if (isParseError(parsed)) return parsed;
  try {
    const infos = tagInfos(parsed);
    const tags = rows(parsed, infos);
    return { container: parsed, tags, findings: runRules(parsed, infos), summary: summary(infos, tags) };
  } catch {
    return { error: 'not_gtm', message: 'The audit could not read this container. Export it again from GTM (Admin → Export container) and try once more.' };
  }
}
```

Note: the "Custom HTML" `typeLabel` assertion relies on `i.template` being null for `html` tags; template tags show the template's name (e.g. "Meta Pixel").

- [ ] **Step 8: Run all engine tests**

Run: `node --test tests/foundation/gtm-audit-migrate.test.mjs tests/foundation/gtm-audit-audit.test.mjs tests/foundation/gtm-audit-rules.test.mjs`
Expected: PASS (5 + 5 + 9 tests).

- [ ] **Step 9: Commit**

```bash
git add supabase/functions/_shared/gtm-audit/migrate.ts supabase/functions/_shared/gtm-audit/audit.ts tests/foundation/gtm-audit-migrate.test.mjs tests/foundation/gtm-audit-audit.test.mjs
git commit -m "feat(gtm-audit): migration class per tag and audit() entry point" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Anonymous usage counters (stats module, edge function, table)

**Files:**
- Create: `supabase/functions/_shared/gtm-audit/stats.ts`
- Create: `supabase/functions/gtm-audit-stats/index.ts`
- Create: `supabase/migrations/20261201000001_gtm_audit_stats.sql`
- Modify: `supabase/config.toml` (after the `[functions.csp-report]` block)
- Test: `tests/foundation/gtm-audit-stats.test.mjs`

**Interfaces:**
- Consumes: `AuditResult`, `CHECK_KEYS`, `MIGRATION_CLASSES` (Task 2); `KNOWN_TYPES` (Task 2); `ENGINE_VERSION` (Task 6); `TRACKING_VENDORS` from `../tracking-vendors.ts`.
- Produces: `AuditStats` type; `BUCKETS`; `bucketOf(n: number): Bucket`; `buildStats(result: AuditResult): AuditStats`; `validateStats(x: unknown): AuditStats | null`; `statsRows(s: AuditStats): { keys: string[]; counts: number[] }`; `MAX_COUNT = 500`; edge function `gtm-audit-stats` (POST JSON `AuditStats` → 204); RPC `ingest_gtm_audit_stats(p_keys text[], p_counts integer[])`.

- [ ] **Step 1: Write the failing tests**

`tests/foundation/gtm-audit-stats.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildStats, validateStats, statsRows, bucketOf, MAX_COUNT } from '../../supabase/functions/_shared/gtm-audit/stats.ts';
import { audit } from '../../supabase/functions/_shared/gtm-audit/audit.ts';
import { tag, tpl, template, tplType, exportOf } from '../../scripts/gtm-audit/fixture.mjs';
import { loadEdge, mockDatabase } from './edge-harness.mjs';

const result = () => audit(exportOf({
  tags: [
    tag(1, 'Secret campaign name', 'html', [tpl('html', '<script src="https://snap.licdn.com/li.lms-analytics/insight.min.js"></script>')]),
    tag(2, 'Private chat', 'html', [tpl('html', '<script src="https://cdn.example-chat.com/w.js"></script>')]),
    tag(3, 'GA4', 'gaawe', [tpl('eventName', 'purchase')]),
    tag(4, 'Mystery', tplType(25)),
    tag(5, 'Odd', 'zzz_unknown_type'),
  ],
  templates: [template(25, 'Mystery template')],
}));

test('buckets', () => {
  assert.deepEqual([1, 10, 11, 25, 26, 50, 51, 100, 101, 250, 251, 9999].map(bucketOf),
    ['1-10', '1-10', '11-25', '11-25', '26-50', '26-50', '51-100', '51-100', '101-250', '101-250', '250+', '250+']);
});

test('buildStats: whitelisted keys only, no names, URLs or container IDs', () => {
  const s = buildStats(result());
  assert.equal(s.v, 1);
  assert.equal(s.bucket, '1-10');
  assert.deepEqual(s.types, { html: 2, gaawe: 1, template: 1, other: 1 });
  assert.deepEqual(s.vendors, { linkedin: 1, ga4: 1, unknown: 3 });
  assert.equal(s.checks['gtm.consent_missing'], 1);
  assert.equal(s.checks['gtm.stale'], undefined);
  assert.equal(Object.values(s.migration).reduce((a, b) => a + b, 0), 5);
  const json = JSON.stringify(s);
  for (const secret of ['Secret', 'Private', 'example-chat', 'GTM-SAMPLE1', 'purchase', 'zzz_unknown', 'Mystery']) {
    assert.equal(json.includes(secret), false, secret);
  }
  assert.deepEqual(validateStats(JSON.parse(json)), s);
});

test('validateStats rejects free text, unknown keys and bad counts; caps large counts', () => {
  const ok = buildStats(result());
  assert.equal(validateStats(null), null);
  assert.equal(validateStats('x'), null);
  assert.equal(validateStats({ ...ok, extra: 1 }), null);
  assert.equal(validateStats({ ...ok, v: 99 }), null);
  assert.equal(validateStats({ ...ok, bucket: 'lots' }), null);
  assert.equal(validateStats({ ...ok, types: { 'my secret tag': 1 } }), null);
  assert.equal(validateStats({ ...ok, vendors: { 'example.com': 1 } }), null);
  assert.equal(validateStats({ ...ok, checks: { 'gtm.nope': 1 } }), null);
  assert.equal(validateStats({ ...ok, migration: { covered: 1.5 } }), null);
  assert.equal(validateStats({ ...ok, migration: { covered: -1 } }), null);
  assert.equal(validateStats({ ...ok, types: ['html'] }), null);
  assert.equal(validateStats({ ...ok, types: JSON.parse('{"__proto__": 1}') }), null);
  assert.equal(validateStats({ ...ok, types: { html: 1e9 } }).types.html, MAX_COUNT);
});

test('statsRows: one row per counter, keys match the table check', () => {
  const { keys, counts } = statsRows(buildStats(result()));
  assert.equal(keys.length, counts.length);
  assert.equal(keys[0], 'files');
  assert.ok(keys.includes('bucket:1-10'));
  assert.ok(keys.includes('type:gaawe'));
  assert.ok(keys.includes('vendor:linkedin'));
  assert.ok(keys.includes('check:gtm.consent_missing'));
  assert.ok(keys.every((k) => /^[a-z0-9:_.+-]{1,80}$/.test(k)), keys.join());
  assert.ok(counts.every((c) => Number.isInteger(c) && c > 0 && c <= MAX_COUNT));
});

test('migration: service-role-only table and RPC with the same key check', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/20261201000001_gtm_audit_stats.sql', import.meta.url), 'utf8');
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON public\.gtm_audit_stats_daily FROM anon, authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.ingest_gtm_audit_stats\(text\[\], integer\[\]\) TO service_role/);
  assert.ok(sql.includes("'^[a-z0-9:_.+-]{1,80}$'"));
  assert.match(readFileSync(new URL('../../supabase/config.toml', import.meta.url), 'utf8'), /\[functions\.gtm-audit-stats\]\s*\nverify_jwt = false/);
});

function setup({ rate = { data: true, error: null } } = {}) {
  const rpcCalls = [];
  const db = mockDatabase(() => ({ data: null, error: null }), async (name, args) => {
    rpcCalls.push({ name, args });
    return name === 'check_rate_limit' ? rate : { data: null, error: null };
  });
  return { rpcCalls, handler: loadEdge('gtm-audit-stats', db.client) };
}
const post = (body) => new Request('https://fn.test/gtm-audit-stats', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body),
});

test('function: valid stats → one ingest call, 204 with CORS', async () => {
  const { handler, rpcCalls } = setup();
  const s = buildStats(result());
  const res = await handler(post(s));
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  const ingest = rpcCalls.filter((c) => c.name === 'ingest_gtm_audit_stats');
  assert.equal(ingest.length, 1);
  assert.deepEqual(ingest[0].args, { p_keys: statsRows(s).keys, p_counts: statsRows(s).counts });
});

test('function: junk, unknown keys, oversized bodies and rate limits never reach the table', async () => {
  const s = buildStats(result());
  for (const [opts, body, status] of [
    [{}, 'not json', 400],
    [{}, { ...s, vendors: { 'secret.example.com': 1 } }, 400],
    [{}, 'x'.repeat(11 * 1024), 413],
    [{ rate: { data: false, error: null } }, s, 204],
  ]) {
    const { handler, rpcCalls } = setup(opts);
    assert.equal((await handler(post(body))).status, status);
    assert.equal(rpcCalls.some((c) => c.name === 'ingest_gtm_audit_stats'), false);
  }
  const { handler } = setup();
  assert.equal((await handler(new Request('https://fn.test/gtm-audit-stats', { method: 'GET' }))).status, 405);
  assert.equal((await handler(new Request('https://fn.test/gtm-audit-stats', { method: 'OPTIONS' }))).status, 200);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/foundation/gtm-audit-stats.test.mjs`
Expected: FAIL — `Cannot find module .../gtm-audit/stats.ts`.

- [ ] **Step 3: Implement `stats.ts`**

`supabase/functions/_shared/gtm-audit/stats.ts`:

```ts
/**
 * Anonymous usage counters for the public GTM audit. Built in the browser from a whitelist and
 * re-validated by the gtm-audit-stats edge function with the same code: engine version, a tag-count
 * bucket, and counts per GTM tag type, registry vendor id, check key and migration class.
 * Never names, container IDs, domains, URLs or HTML.
 */
import type { AuditResult } from './types.ts';
import { CHECK_KEYS, MIGRATION_CLASSES } from './types.ts';
import { KNOWN_TYPES } from './tag-types.ts';
import { ENGINE_VERSION } from './audit.ts';
import { TRACKING_VENDORS } from '../tracking-vendors.ts';

export const BUCKETS = ['1-10', '11-25', '26-50', '51-100', '101-250', '250+'] as const;
export type Bucket = typeof BUCKETS[number];
export const MAX_COUNT = 500;

export interface AuditStats {
  v: number;
  bucket: Bucket;
  types: Record<string, number>;
  vendors: Record<string, number>;
  checks: Record<string, number>;
  migration: Record<string, number>;
}

const ALLOWED = {
  types: new Set([...KNOWN_TYPES, 'template', 'other']),
  vendors: new Set([...TRACKING_VENDORS.map((v) => v.id), 'unknown']),
  checks: new Set<string>(CHECK_KEYS),
  migration: new Set<string>(MIGRATION_CLASSES),
};
const MAPS = ['types', 'vendors', 'checks', 'migration'] as const;

export function bucketOf(n: number): Bucket {
  if (n <= 10) return '1-10';
  if (n <= 25) return '11-25';
  if (n <= 50) return '26-50';
  if (n <= 100) return '51-100';
  if (n <= 250) return '101-250';
  return '250+';
}

const bump = (m: Record<string, number>, k: string) => { m[k] = Math.min((m[k] ?? 0) + 1, MAX_COUNT); };

export function buildStats(result: AuditResult): AuditStats {
  const s: AuditStats = { v: ENGINE_VERSION, bucket: bucketOf(result.tags.length), types: {}, vendors: {}, checks: {}, migration: {} };
  for (const t of result.container.tags) {
    bump(s.types, ALLOWED.types.has(t.type) ? t.type : t.type.startsWith('cvt_') ? 'template' : 'other');
  }
  for (const row of result.tags) {
    bump(s.vendors, row.vendorId && ALLOWED.vendors.has(row.vendorId) ? row.vendorId : 'unknown');
    bump(s.migration, row.migration);
  }
  for (const f of result.findings) if (f.status !== 'pass') bump(s.checks, f.checkKey);
  return s;
}

/** Same whitelist on both sides. Returns a clean copy (counts capped) or null. */
export function validateStats(x: unknown): AuditStats | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  const keys = Object.keys(o);
  if (keys.length !== 6 || !['v', 'bucket', ...MAPS].every((k) => keys.includes(k))) return null;
  if (!Number.isInteger(o.v) || (o.v as number) < 1 || (o.v as number) > ENGINE_VERSION) return null;
  if (!(BUCKETS as readonly unknown[]).includes(o.bucket)) return null;
  const out: AuditStats = { v: o.v as number, bucket: o.bucket as Bucket, types: {}, vendors: {}, checks: {}, migration: {} };
  for (const name of MAPS) {
    const m = o[name];
    if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
    for (const [k, c] of Object.entries(m as Record<string, unknown>)) {
      if (!ALLOWED[name].has(k) || !Number.isInteger(c) || (c as number) < 0) return null;
      if ((c as number) > 0) out[name][k] = Math.min(c as number, MAX_COUNT);
    }
  }
  return out;
}

const PREFIX = { types: 'type', vendors: 'vendor', checks: 'check', migration: 'migration' } as const;

/** Rows for gtm_audit_stats_daily: files, bucket:<b>, type:<t>, vendor:<id>, check:<key>, migration:<class>. */
export function statsRows(s: AuditStats): { keys: string[]; counts: number[] } {
  const keys = ['files', `bucket:${s.bucket}`];
  const counts = [1, 1];
  for (const name of MAPS) {
    for (const [k, c] of Object.entries(s[name])) { keys.push(`${PREFIX[name]}:${k}`); counts.push(c); }
  }
  return { keys, counts };
}
```


- [ ] **Step 4: Implement the edge function**

`supabase/functions/gtm-audit-stats/index.ts`:

```ts
/**
 * gtm-audit-stats — anonymous usage counters from the public GTM container audit (/gtm-audit).
 *
 * The page sends one JSON payload per analysed file, built by _shared/gtm-audit/stats.ts from a
 * whitelist (engine version, tag-count bucket, counts per tag type, registry vendor id, check key and
 * migration class). This function re-validates it with the same module and adds the counts to
 * gtm_audit_stats_daily. No IP address, User-Agent, name, domain or container ID is stored.
 */
import { createClient } from '../_shared/supabase.ts';
import { statsRows, validateStats } from '../_shared/gtm-audit/stats.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_BODY_BYTES = 10 * 1024;
const REQUESTS_PER_MINUTE = 120;

const reply = (status: number) => new Response(null, { status, headers: corsHeaders });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return reply(405);
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return reply(413);

  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) return reply(413);
  let body: unknown;
  try { body = JSON.parse(text); } catch { return reply(400); }
  const stats = validateStats(body);
  if (!stats) return reply(400);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  // One global bucket: the endpoint is public, and a flood must not inflate the counters.
  const { data: allowed, error: rlError } = await supabase.rpc('check_rate_limit', {
    p_key: 'gtm-audit-stats', p_max_count: REQUESTS_PER_MINUTE, p_window_sec: 60,
  });
  if (rlError || allowed === false) return reply(204);

  const { keys, counts } = statsRows(stats);
  const { error } = await supabase.rpc('ingest_gtm_audit_stats', { p_keys: keys, p_counts: counts });
  if (error) console.error('gtm-audit-stats: ingest failed:', error.message);
  return reply(204);
});
```

- [ ] **Step 5: Add the migration**

`supabase/migrations/20261201000001_gtm_audit_stats.sql`:

```sql
-- Anonymous usage counters from the public GTM container audit (gtm-audit-stats Edge Function),
-- summed per UTC day. Keys are whitelisted counter names (files, bucket:…, type:…, vendor:…, check:…,
-- migration:…): no names, container IDs, domains, URLs, IP addresses or User-Agents.
-- Service role only (RLS on, no policies). Aggregates only, so no retention job.

CREATE TABLE IF NOT EXISTS public.gtm_audit_stats_daily (
  day   date    NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  key   text    NOT NULL CHECK (key ~ '^[a-z0-9:_.+-]{1,80}$'),
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (day, key)
);

ALTER TABLE public.gtm_audit_stats_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gtm_audit_stats_daily FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.ingest_gtm_audit_stats(p_keys text[], p_counts integer[])
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.gtm_audit_stats_daily (key, count)
  SELECT u.k, least(sum(u.c), 500)::int
  FROM unnest(p_keys[1:200], p_counts[1:200]) AS u(k, c)
  WHERE u.k ~ '^[a-z0-9:_.+-]{1,80}$' AND u.c > 0
  GROUP BY u.k
  ON CONFLICT (day, key) DO UPDATE SET count = public.gtm_audit_stats_daily.count + EXCLUDED.count;
$$;

REVOKE ALL ON FUNCTION public.ingest_gtm_audit_stats(text[], integer[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_gtm_audit_stats(text[], integer[]) TO service_role;
```

- [ ] **Step 6: Register the function in `supabase/config.toml`**

Directly after the existing block

```toml
[functions.csp-report]
verify_jwt = false
```

add:

```toml

[functions.gtm-audit-stats]
verify_jwt = false
```

- [ ] **Step 7: Run tests**

Run: `node --test tests/foundation/gtm-audit-stats.test.mjs`
Expected: PASS (7 tests).

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/_shared/gtm-audit/stats.ts supabase/functions/gtm-audit-stats supabase/migrations/20261201000001_gtm_audit_stats.sql supabase/config.toml tests/foundation/gtm-audit-stats.test.mjs
git commit -m "feat(gtm-audit): anonymous whitelisted usage counters (gtm-audit-stats)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

Not part of this task: `supabase db push --remote --yes` and `supabase functions deploy gtm-audit-stats` run after merge, with Daniel's go-ahead.

---

### Task 8: Report data, synthetic sample container and committed sample report

**Files:**
- Create: `supabase/functions/_shared/gtm-audit/report.ts`
- Modify: `scripts/gtm-audit/fixture.mjs` (append `sampleExport()`)
- Create: `scripts/gtm-audit/sample-report.mjs`
- Create (generated): `src/data/gtmAuditSample.ts`
- Test: `tests/foundation/gtm-audit-sample.test.mjs`

**Interfaces:**
- Consumes: `audit` (Task 6); `AuditResult, TagRow, AuditSummary` (Task 2); `Finding` from `../tracking-check/types.ts`; fixture builders (Task 2).
- Produces: `TriggerRow { name: string; type: string; tags: number; folder: string; builtIn: boolean }`; `VariableRow { name: string; type: string }`; `ReportData { publicId: string; exportedAt: number | null; summary: AuditSummary; findings: Finding[]; tags: TagRow[]; triggers: TriggerRow[]; variables: VariableRow[] }`; `reportData(result: AuditResult): ReportData`; `sampleExport()`; `buildSample(): ReportData`; `render(sample): string`; `GTM_AUDIT_SAMPLE: ReportData` in `src/data/gtmAuditSample.ts`.

The UI (Task 10) and Excel export (Task 9) only ever see `ReportData` — never the raw container with its HTML.

- [ ] **Step 1: Write the failing tests**

`tests/foundation/gtm-audit-sample.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSample, render } from '../../scripts/gtm-audit/sample-report.mjs';

test('the /gtm-audit sample report is the current audit() output', () => {
  const committed = readFileSync(new URL('../../src/data/gtmAuditSample.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(committed, render(buildSample()), 'run: node scripts/gtm-audit/sample-report.mjs');
});

test('the sample shows every check result and every migration class', () => {
  const s = buildSample();
  const byKey = Object.fromEntries(s.findings.map((f) => [f.checkKey, f.status]));
  assert.deepEqual(byKey, {
    'gtm.consent_missing': 'fail',
    'gtm.consent_inferred': 'manual',
    'gtm.identifies_visitors': 'fail',
    'gtm.consent_mode_default': 'pass',
    'gtm.unknown_custom_html': 'manual',
    'gtm.community_template_injects': 'manual',
    'gtm.duplicate': 'warning',
    'gtm.dead': 'warning',
    'gtm.stale': 'manual',
  });
  for (const c of ['covered', 'consent_tool', 'pixel', 'conversion', 'third_party', 'keep_google', 'remove', 'review']) {
    assert.ok(s.summary.counts[c] > 0, c);
  }
  assert.equal(s.tags.length, 16);
  assert.equal(s.summary.headline, '3 of 16 tags have no consent condition · 1 identifies visitors · 3 removal candidates');
});

test('the sample is synthetic and carries no raw HTML', () => {
  const json = JSON.stringify(buildSample());
  assert.equal(json.includes('<script'), false);
  assert.ok(json.includes('GTM-SAMPLE1'));
});

test('trigger and variable rows', () => {
  const s = buildSample();
  const unused = s.triggers.find((t) => t.name === 'Old landing page');
  assert.deepEqual(unused, { name: 'Old landing page', type: 'PAGEVIEW', tags: 0, folder: '', builtIn: false });
  assert.equal(s.triggers.find((t) => t.name === 'All Pages').builtIn, true);
  assert.ok(s.variables.some((v) => v.name === 'DLV - unused'));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/foundation/gtm-audit-sample.test.mjs`
Expected: FAIL — `Cannot find module .../scripts/gtm-audit/sample-report.mjs`.

- [ ] **Step 3: Implement `report.ts`**

`supabase/functions/_shared/gtm-audit/report.ts`:

```ts
/** What the page, the Excel export and the committed sample see: rows only, never raw tag HTML. */
import type { Finding } from '../tracking-check/types.ts';
import type { AuditResult, AuditSummary, TagRow } from './types.ts';

export interface TriggerRow { name: string; type: string; tags: number; folder: string; builtIn: boolean }
export interface VariableRow { name: string; type: string }

export interface ReportData {
  publicId: string;
  exportedAt: number | null;
  summary: AuditSummary;
  findings: Finding[];
  tags: TagRow[];
  triggers: TriggerRow[];
  variables: VariableRow[];
}

export function reportData(result: AuditResult): ReportData {
  const c = result.container;
  const folderName = new Map(c.folders.map((f) => [f.id, f.name]));
  const uses = new Map<string, number>();
  for (const t of c.tags) for (const id of new Set([...t.firingTriggerIds, ...t.blockingTriggerIds])) uses.set(id, (uses.get(id) ?? 0) + 1);
  return {
    publicId: c.publicId,
    exportedAt: c.exportedAt,
    summary: result.summary,
    findings: result.findings,
    tags: result.tags,
    triggers: c.triggers.map((t) => ({
      name: t.name, type: t.type, tags: uses.get(t.id) ?? 0,
      folder: (t.folderId && folderName.get(t.folderId)) || '', builtIn: t.builtIn,
    })),
    variables: c.variables.map((v) => ({ name: v.name, type: v.type })),
  };
}
```

- [ ] **Step 4: Append the synthetic sample container to `scripts/gtm-audit/fixture.mjs`**

```js
// ---------------------------------------------------------------------------------------------
// Synthetic sample container for the /gtm-audit landing page. Invented names, IDs and hosts only.
// It is built to show every check result and every migration class at least once.
export function sampleExport() {
  const OLD_2023 = Date.UTC(2023, 2, 14);
  const OLD_2022 = Date.UTC(2022, 5, 1);
  const script = (src) => tpl('html', `<script src="${src}" async></script>`);
  return exportOf({
    exportTime: '2026-11-01 10:00:00',
    folders: [{ folderId: '40', name: 'Marketing' }, { folderId: '41', name: 'Analytics' }],
    triggers: [
      customEvent(10, 'CE - cookie_consent_marketing', 'cookie_consent_marketing', { folder: 40 }),
      customEvent(11, 'CE - cookie_consent_analytics', 'cookie_consent_analytics', { folder: 41 }),
      trigger(12, 'Form submit - contact', 'FORM_SUBMISSION', { filter: [cond('CONTAINS', '{{Page Path}}', '/contact')] }),
      trigger(13, 'Consent Analytics Trigger', 'PAGEVIEW'),
      trigger(14, 'Old landing page', 'PAGEVIEW', { filter: [cond('EQUALS', '{{Page Path}}', '/spring-offer')] }),
      customEvent(15, 'CE - generate_lead', 'generate_lead', { folder: 41 }),
    ],
    variables: [
      variable(30, 'Meta Pixel ID', 'c', [tpl('value', '1234567890')]),
      variable(31, 'DLV - unused', 'v', [tpl('name', 'unused_key')]),
      variable(32, 'GA4 ID', 'c', [tpl('value', 'G-SAMPLE123')]),
    ],
    templates: [
      template(20, 'Meta Pixel', { permissions: { inject_script: ['https://connect.facebook.net/*', 'https://cdn.jsdelivr.net/*'] }, gallery: ['facebookarchive', 'GoogleTagManager-WebTemplate-For-FacebookPixel'] }),
      template(21, 'LinkedIn Insight', { permissions: { inject_script: ['https://snap.licdn.com/*'] }, gallery: ['linkedin', 'linkedin-gtm-community-template'] }),
      template(22, 'Cookiebot CMP', { permissions: { inject_script: ['https://*.cookiebot.com/*'], access_consent: [] }, gallery: ['cybotcorp', 'gtm-templates-cookiebot-cmp'] }),
      template(23, 'Visitor helper', { permissions: { inject_script: ['https://cdn.example-widgets.com/*'] }, gallery: ['example-dev', 'visitor-helper'] }),
      template(24, 'Clay Web Intent', { permissions: { inject_script: ['https://static.claydar.com/*'] }, gallery: ['Jude-Nwachukwu', 'gtm-clay-web-intent-tag'] }),
    ],
    tags: [
      tag(1, 'Cookiebot - CMP', tplType(22), [tpl('cookiebotId', '00000000-0000-4000-8000-000000000000')], { fire: [CONSENT_INIT] }),
      tag(2, 'Google tag', 'googtag', [tpl('tagId', '{{GA4 ID}}')], { fire: [INIT], folder: 41 }),
      tag(3, 'GA4 - generate_lead', 'gaawe', [tpl('eventName', 'generate_lead'), tpl('measurementIdOverride', '{{GA4 ID}}')], { fire: [15], folder: 41 }),
      tag(4, 'GA4 - generate_lead (copy)', 'gaawe', [tpl('eventName', 'generate_lead'), tpl('measurementIdOverride', '{{GA4 ID}}')], { fire: [15], folder: 41 }),
      tag(5, 'Google Ads - contact conversion', 'awct', [tpl('conversionId', '000000000'), tpl('conversionLabel', 'SAMPLElabel')], { fire: [12], folder: 40 }),
      tag(6, 'Conversion Linker', 'gclidw', [], { folder: 40 }),
      tag(7, 'Meta - PageView', tplType(20), [tpl('pixelId', '{{Meta Pixel ID}}'), tpl('eventName', 'standard'), tpl('standardEventName', 'PageView')], { fire: [10], folder: 40 }),
      tag(8, 'Meta - Lead', tplType(20), [tpl('pixelId', '{{Meta Pixel ID}}'), tpl('eventName', 'standard'), tpl('standardEventName', 'Lead')], { fire: [12], folder: 40 }),
      tag(9, 'LinkedIn Insight', tplType(21), [tpl('partnerId', '0000000')], { fire: [13], folder: 40 }),
      tag(10, 'Microsoft Clarity', 'html', [script('https://www.clarity.ms/tag/sample123')], { consent: needed('analytics_storage'), folder: 41 }),
      tag(11, 'Clay - web intent', tplType(24), [], { folder: 40 }),
      tag(12, 'Chat widget', 'html', [tpl('html', '<script>(function(){var s=document.createElement("script");s.src="https://cdn.example-chat.com/widget.js";document.head.appendChild(s)})()</script>')]),
      tag(13, 'HubSpot form listener', 'html', [tpl('html', "<script>window.addEventListener('message',function(e){if(e.data.type==='hsFormCallback'&&e.data.eventName==='onFormSubmitted'){dataLayer.push({event:'generate_lead'})}})</script>")], { fire: [ALL_PAGES] }),
      tag(14, 'Reddit pixel', 'html', [script('https://www.redditstatic.com/ads/pixel.js')], { paused: true, modified: OLD_2023, folder: 40 }),
      tag(15, 'Visitor helper', tplType(23), [], { fire: [11] }),
      tag(16, 'UA - pageview', 'ua', [tpl('trackingId', 'UA-000000-1')], { modified: OLD_2022, folder: 41 }),
    ],
  });
}
```

Expected results (what the sample test pins):
- `gtm.consent_missing` fail: Meta - Lead (form trigger), Clay (All Pages), Chat widget (script loader on All Pages) = 3.
- `gtm.consent_inferred` manual: LinkedIn Insight on "Consent Analytics Trigger".
- `gtm.identifies_visitors` fail: Clay, not gated.
- `gtm.consent_mode_default` pass: Cookiebot template (cmp vendor, `access_consent`) on Consent Initialization.
- `gtm.unknown_custom_html` manual: Chat widget (HubSpot listener is covered, Clarity is identified).
- `gtm.community_template_injects` manual: Clay Web Intent and Visitor helper.
- `gtm.duplicate` warning: GA4 - generate_lead ×2.
- `gtm.dead` warning: paused Reddit pixel, unused trigger "Old landing page", unused variable "DLV - unused".
- `gtm.stale` manual: UA - pageview (2022). The Reddit pixel is paused, so it is not stale.
- Removal candidates: copy of GA4 lead, Reddit pixel (paused), UA = 3.

- [ ] **Step 5: Implement the sample script**

`scripts/gtm-audit/sample-report.mjs`:

```js
// Builds the sample report on the /gtm-audit landing page by running the real audit() on the synthetic
// container in fixture.mjs. Run `node scripts/gtm-audit/sample-report.mjs` after changing the engine;
// tests/foundation/gtm-audit-sample.test.mjs fails while the committed file is stale.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { audit } from '../../supabase/functions/_shared/gtm-audit/audit.ts';
import { reportData } from '../../supabase/functions/_shared/gtm-audit/report.ts';
import { sampleExport } from './fixture.mjs';

const OUT = fileURLToPath(new URL('../../src/data/gtmAuditSample.ts', import.meta.url));

export function buildSample() {
  const result = audit(sampleExport());
  if ('error' in result) throw new Error(`sample container failed to parse: ${result.message}`);
  return reportData(result);
}

export const render = (sample) => `// Generated by scripts/gtm-audit/sample-report.mjs from the real audit() output. Do not edit.
import type { ReportData } from '../../supabase/functions/_shared/gtm-audit/report.ts';

export const GTM_AUDIT_SAMPLE: ReportData = ${JSON.stringify(sample, null, 2)};
`;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(OUT, render(buildSample()));
  console.log(`Wrote ${OUT}`);
}
```

- [ ] **Step 6: Generate the sample and run the tests**

Run: `node scripts/gtm-audit/sample-report.mjs && node --test tests/foundation/gtm-audit-sample.test.mjs`
Expected: `Wrote …src/data/gtmAuditSample.ts`, then PASS (4 tests).

If a status in the second test differs, fix the engine or the fixture so the result matches the list in Step 4 — do not edit the expected values to match a wrong result.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/gtm-audit/report.ts scripts/gtm-audit/fixture.mjs scripts/gtm-audit/sample-report.mjs src/data/gtmAuditSample.ts tests/foundation/gtm-audit-sample.test.mjs
git commit -m "feat(gtm-audit): report rows and synthetic sample report for the landing page" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Excel export

**Files:**
- Create: `supabase/functions/_shared/gtm-audit/sheets.ts`
- Create: `src/lib/gtmAuditXlsx.ts`
- Test: `tests/foundation/gtm-audit-xlsx.test.mjs`

**Interfaces:**
- Consumes: `ReportData`, `reportData` (Task 8); `audit` (Task 6); `SHEET_COLUMNS`, `toSheetRows`, `FINDING_STATUS_LABEL` from `../tracking-check/report.ts`; `ConsentStatus`, `TagRow` (Task 2); `buildSample` (Task 8).
- Produces: `GTM_FINDING_COLUMNS: string[]`; `toGtmFindingRows(findings: Finding[]): (string | number)[][]`; `CONSENT_LABEL: Record<ConsentStatus, string>`; `TAG_COLUMNS: string[]`; `toTagRows(tags: TagRow[]): (string | number)[][]`; `ITEM_COLUMNS: string[]`; `toItemRows(r: ReportData): (string | number)[][]`; `gtmAuditXlsx(report: ReportData): Promise<Blob>`.

- [ ] **Step 1: Write the failing tests**

`tests/foundation/gtm-audit-xlsx.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { GTM_FINDING_COLUMNS, TAG_COLUMNS, ITEM_COLUMNS, toGtmFindingRows, toTagRows } from '../../supabase/functions/_shared/gtm-audit/sheets.ts';
import { audit } from '../../supabase/functions/_shared/gtm-audit/audit.ts';
import { reportData } from '../../supabase/functions/_shared/gtm-audit/report.ts';
import { gtmAuditXlsx } from '../../src/lib/gtmAuditXlsx.ts';
import { buildSample } from '../../scripts/gtm-audit/sample-report.mjs';
import { tag, tpl, exportOf } from '../../scripts/gtm-audit/fixture.mjs';

const load = async (blob) => { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await blob.arrayBuffer()); return wb; };

test('finding rows drop the page and manual-verification columns (no pages in a container export)', () => {
  assert.equal(GTM_FINDING_COLUMNS.includes('Pages'), false);
  assert.equal(GTM_FINDING_COLUMNS.includes('Verified manually'), false);
  const s = buildSample();
  const rows = toGtmFindingRows(s.findings);
  assert.equal(rows.length, 9);
  assert.ok(rows.every((r) => r.length === GTM_FINDING_COLUMNS.length));
  const evidence = rows[0][GTM_FINDING_COLUMNS.indexOf('Evidence')];
  assert.match(evidence, /^Evidence level: configuration/);
});

test('tag rows: one per tag with consent and migration in words', () => {
  const s = buildSample();
  const rows = toTagRows(s.tags);
  assert.equal(rows.length, 16);
  const col = (n) => TAG_COLUMNS.indexOf(n);
  const lead = rows.find((r) => r[col('Tag')] === 'Meta - Lead');
  assert.equal(lead[col('Consent')], 'No consent condition');
  assert.equal(lead[col('Plan')], 'Conversion tag — can be sent server-side');
  const ua = rows.find((r) => r[col('Tag')] === 'UA - pageview');
  assert.equal(ua[col('Last changed')], '2022-06-01');
  assert.equal(rows.find((r) => r[col('Tag')] === 'Reddit pixel')[col('Paused')], 'Yes');
});

test('the workbook has four sheets; names that look like formulas stay text', async () => {
  const r = audit(exportOf({ tags: [tag(1, '=HYPERLINK("https://evil.example")', 'html', [tpl('html', '<script src="https://cdn.example-chat.com/w.js"></script>')])] }));
  const wb = await load(await gtmAuditXlsx(reportData(r)));
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['Summary', 'Findings', 'Tags', 'Triggers & variables']);
  const tags = wb.getWorksheet('Tags');
  assert.deepEqual(tags.getRow(1).values.slice(1), TAG_COLUMNS);
  assert.equal(tags.getCell('A2').value, '=HYPERLINK("https://evil.example")');
  assert.equal(tags.getCell('A2').formula, undefined);
  assert.equal(wb.getWorksheet('Summary').getCell('B1').value, 'GTM-SAMPLE1');
});

test('the sample workbook lists every trigger and variable', async () => {
  const s = buildSample();
  const wb = await load(await gtmAuditXlsx(s));
  const items = wb.getWorksheet('Triggers & variables');
  assert.deepEqual(items.getRow(1).values.slice(1), ITEM_COLUMNS);
  assert.equal(items.rowCount, 1 + s.triggers.length + s.variables.length);
  const names = items.getColumn(2).values.slice(2);
  assert.ok(names.includes('Old landing page'));
  assert.ok(names.includes('DLV - unused'));
});
```

The `Plan` value is `MIGRATION_LABEL.conversion` from Task 6.

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/foundation/gtm-audit-xlsx.test.mjs`
Expected: FAIL — `Cannot find module .../gtm-audit/sheets.ts`.

- [ ] **Step 3: Implement `sheets.ts`**

`supabase/functions/_shared/gtm-audit/sheets.ts`:

```ts
/** Spreadsheet rows for the GTM audit export. Shared by the browser export and the tests. */
import type { Finding } from '../tracking-check/types.ts';
import { SHEET_COLUMNS, toSheetRows } from '../tracking-check/report.ts';
import type { ConsentStatus, TagRow } from './types.ts';
import type { ReportData } from './report.ts';

const DROPPED = ['Pages', 'Verified manually'];
export const GTM_FINDING_COLUMNS = SHEET_COLUMNS.filter((c) => !DROPPED.includes(c));
const KEEP = SHEET_COLUMNS.map((c, i) => (DROPPED.includes(c) ? -1 : i)).filter((i) => i >= 0);

export function toGtmFindingRows(findings: Finding[]): (string | number)[][] {
  return toSheetRows(findings).map((row) => KEEP.map((i) => row[i]));
}

export const CONSENT_LABEL: Record<ConsentStatus, string> = {
  gated: 'Waits for consent',
  likely_gated: 'Probably waits (trigger name only)',
  not_gated: 'No consent condition',
  google_consent_mode: 'Google Consent Mode',
};

export const TAG_COLUMNS = ['Tag', 'Type', 'Vendor', 'Triggers', 'Consent', 'Consent evidence', 'Plan', 'Why', 'Folder', 'Last changed', 'Paused'];

const day = (ms: number | null): string => (ms === null ? '' : new Date(ms).toISOString().slice(0, 10));

export function toTagRows(tags: TagRow[]): (string | number)[][] {
  return tags.map((t) => [
    t.name, t.typeLabel, t.vendorName, t.triggers.join('\n'), CONSENT_LABEL[t.consent], t.consentEvidence,
    t.migrationLabel, t.migrationReason, t.folder, day(t.modifiedAt), t.paused ? 'Yes' : '',
  ]);
}

export const ITEM_COLUMNS = ['Kind', 'Name', 'Type', 'Used by tags', 'Folder'];

export function toItemRows(r: ReportData): (string | number)[][] {
  return [
    ...r.triggers.map((t) => [t.builtIn ? 'Built-in trigger' : 'Trigger', t.name, t.type, t.tags, t.folder]),
    ...r.variables.map((v) => ['Variable', v.name, v.type, '', '']),
  ];
}
```

- [ ] **Step 4: Implement `src/lib/gtmAuditXlsx.ts`**

```ts
// GTM container audit as an Excel workbook: summary, findings, one row per tag, triggers and variables.
// Built in the browser from ReportData; exceljs is loaded on demand so it stays out of the page bundle.
import type { FindingStatus } from '../../supabase/functions/_shared/tracking-check/types.ts';
import { FINDING_STATUS_LABEL } from '../../supabase/functions/_shared/tracking-check/report.ts';
import { MIGRATION_CLASSES } from '../../supabase/functions/_shared/gtm-audit/types.ts';
import { MIGRATION_LABEL } from '../../supabase/functions/_shared/gtm-audit/migrate.ts';
import type { ReportData } from '../../supabase/functions/_shared/gtm-audit/report.ts';
import { GTM_FINDING_COLUMNS, ITEM_COLUMNS, TAG_COLUMNS, toGtmFindingRows, toItemRows, toTagRows } from '../../supabase/functions/_shared/gtm-audit/sheets.ts';

const FINDING_WIDTHS: Record<string, number> = { '#': 5, Status: 14, Priority: 10, Area: 8, Finding: 45, Explanation: 60, 'What to do': 60, Owner: 20, Evidence: 60 };
const TAG_WIDTHS: Record<string, number> = { Tag: 36, Type: 22, Vendor: 22, Triggers: 30, Consent: 24, 'Consent evidence': 50, Plan: 40, Why: 60, Folder: 16, 'Last changed': 12, Paused: 8 };
const STATUS_FILL: Record<FindingStatus, string> = {
  fail: 'FFFDE2E2', warning: 'FFFEF3C7', manual: 'FFDBEAFE', untestable: 'FFF3F4F6', pass: 'FFDCFCE7',
};

type Sheet = import('exceljs').Worksheet;

function table(ws: Sheet, columns: string[], widths: Record<string, number>, rows: (string | number)[][]) {
  ws.columns = columns.map((header) => ({ header, width: widths[header] ?? 18 }));
  rows.forEach((r) => ws.addRow(r));
  ws.columns.forEach((c) => { c.alignment = { wrapText: true, vertical: 'top' }; });
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
}

export async function gtmAuditXlsx(report: ReportData): Promise<Blob> {
  // Node (tests) exposes the CommonJS module as default; Vite flattens it.
  const mod = await import('exceljs');
  const ExcelJS = (mod as unknown as { default?: typeof mod }).default ?? mod;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CortIQ GTM audit';

  const info = wb.addWorksheet('Summary');
  info.columns = [{ width: 26 }, { width: 80 }];
  const rows: [string, string | number][] = [
    ['Container', report.publicId],
    ['Exported', report.exportedAt === null ? '' : new Date(report.exportedAt).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'],
    ['Result', report.summary.headline],
    ['Evidence level', 'Configuration (container export, not observed live)'],
    ...(['fail', 'warning', 'manual', 'pass'] as FindingStatus[]).map((s): [string, number] => [FINDING_STATUS_LABEL[s], report.findings.filter((f) => f.status === s).length]),
    ...MIGRATION_CLASSES.map((c): [string, number] => [MIGRATION_LABEL[c], report.summary.counts[c]]),
  ];
  for (const r of rows) info.addRow(r);
  info.getColumn(1).font = { bold: true };
  info.getColumn(2).alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };

  const fs = wb.addWorksheet('Findings', { views: [{ state: 'frozen', ySplit: 1 }] });
  table(fs, GTM_FINDING_COLUMNS, FINDING_WIDTHS, toGtmFindingRows(report.findings));
  report.findings.forEach((f, i) => {
    fs.getRow(i + 2).getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STATUS_FILL[f.status] } };
  });

  table(wb.addWorksheet('Tags', { views: [{ state: 'frozen', ySplit: 1, xSplit: 1 }] }), TAG_COLUMNS, TAG_WIDTHS, toTagRows(report.tags));
  table(wb.addWorksheet('Triggers & variables', { views: [{ state: 'frozen', ySplit: 1 }] }), ITEM_COLUMNS, { Name: 40, Type: 22 }, toItemRows(report));

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
```

- [ ] **Step 5: Run tests**

Run: `node --test tests/foundation/gtm-audit-xlsx.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/gtm-audit/sheets.ts src/lib/gtmAuditXlsx.ts tests/foundation/gtm-audit-xlsx.test.mjs
git commit -m "feat(gtm-audit): Excel export (summary, findings, tags, triggers and variables)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Public page `/gtm-audit/`

**Files:**
- Create: `src/lib/gtmAuditStats.ts`
- Create: `src/components/gtm-audit/Dropzone.tsx`
- Create: `src/components/gtm-audit/GtmAuditReport.tsx`
- Create: `src/pages/GtmAudit.tsx`
- Modify: `src/marketing-routes.ts` (new entry after `/tracking-check/`)
- Modify: `src/entry-server.tsx` (import + `PAGES` entry after `'/tracking-check/'`)
- Modify: `src/App.tsx` (import + `<Route path="/gtm-audit" …>` after `/cookie-consent-checker`)
- Test: `tests/foundation/gtm-audit-page.test.mjs`

**Interfaces:**
- Consumes: `audit` (Task 6); `isParseError`, `MAX_FILE_BYTES` (Task 2); `buildStats` (Task 7); `reportData`, `ReportData` (Task 8); `CONSENT_LABEL` (Task 9); `gtmAuditXlsx` (Task 9); `GTM_AUDIT_SAMPLE` (Task 8); `MIGRATION_LABEL` (Task 6); `PublicLayout`, `useSEO`, `seoFor`, shadcn `Button`, `Card`, `Badge`.
- Produces: `sendAuditStats(stats: AuditStats, endpoint?: string | null): Promise<void>`; `STATS_ENDPOINT: string | null`; `<Dropzone onFile(file: File) busy />`; `<GtmAuditReport report sample? />`; default export page `GtmAudit`; route `/gtm-audit/`.

The privacy promise on this page — "the file never leaves your browser" — is enforced by a test: no file under `src/components/gtm-audit/` or `src/pages/GtmAudit.tsx` may call `fetch`, `sendBeacon` or `XMLHttpRequest`. The only network call is `sendAuditStats`, which sends the whitelisted counters from Task 7.

- [ ] **Step 1: Write the failing tests**

`tests/foundation/gtm-audit-page.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { sendAuditStats } from '../../src/lib/gtmAuditStats.ts';
import { buildStats } from '../../supabase/functions/_shared/gtm-audit/stats.ts';
import { audit } from '../../supabase/functions/_shared/gtm-audit/audit.ts';
import { sampleExport } from '../../scripts/gtm-audit/fixture.mjs';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('sendAuditStats posts only the counters, with keepalive', async () => {
  const stats = buildStats(audit(sampleExport()));
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return new Response(null, { status: 204 }); };
  await sendAuditStats(stats, 'https://fn.test/functions/v1/gtm-audit-stats');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://fn.test/functions/v1/gtm-audit-stats');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.keepalive, true);
  assert.deepEqual(JSON.parse(calls[0].init.body), stats);
  assert.equal(calls[0].init.body.includes('GTM-SAMPLE1'), false);
});

test('sendAuditStats never throws and skips without an endpoint', async () => {
  let n = 0;
  globalThis.fetch = async () => { n += 1; throw new Error('offline'); };
  const stats = buildStats(audit(sampleExport()));
  await sendAuditStats(stats, 'https://fn.test/x');
  await sendAuditStats(stats, null);
  assert.equal(n, 1);
});

test('the page UI makes no network calls of its own', () => {
  const files = [
    'src/pages/GtmAudit.tsx',
    ...readdirSync(new URL('../../src/components/gtm-audit/', import.meta.url)).map((f) => `src/components/gtm-audit/${f}`),
  ];
  for (const f of files) {
    assert.doesNotMatch(read(f), /\bfetch\s*\(|sendBeacon|XMLHttpRequest|supabase\./, f);
  }
});

test('the page states where the file goes', () => {
  const page = read('src/pages/GtmAudit.tsx');
  assert.match(page, /never leaves your browser/);
  assert.match(page, /seoFor\("\/gtm-audit\/"\)/);
});
```

Route registration is covered by the existing `tests/foundation/marketing-routes.test.mjs` (unique path, page file exists, `entry-server` renders it, title 40–58 chars, description ≤157, published date not in the future).

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/foundation/gtm-audit-page.test.mjs`
Expected: FAIL — `Cannot find module .../src/lib/gtmAuditStats.ts`.

- [ ] **Step 3: Implement `src/lib/gtmAuditStats.ts`**

```ts
// Sends the anonymous, whitelisted counters from one GTM audit to the gtm-audit-stats edge function.
// Fire and forget: a failure never reaches the page. The container file itself is never sent.
import type { AuditStats } from '../../supabase/functions/_shared/gtm-audit/stats.ts';

const base = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_SUPABASE_URL;
export const STATS_ENDPOINT: string | null = base ? `${base}/functions/v1/gtm-audit-stats` : null;

export async function sendAuditStats(stats: AuditStats, endpoint: string | null = STATS_ENDPOINT): Promise<void> {
  if (!endpoint) return;
  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(stats),
      keepalive: true,
    });
  } catch {
    // Counters are best effort.
  }
}
```

- [ ] **Step 4: Implement `src/components/gtm-audit/Dropzone.tsx`**

```tsx
import { useRef, useState } from "react";
import { FileJson, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  onFile: (file: File) => void;
  busy?: boolean;
}

/** Drop target and file picker for a GTM container export (.json). Reading happens in the parent. */
export function Dropzone({ onFile, busy }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const pick = (files: FileList | null) => { if (files?.[0]) onFile(files[0]); };
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files); }}
      className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-colors ${over ? "border-primary bg-primary/5" : "border-border"}`}
    >
      <FileJson className="h-10 w-10 text-primary" aria-hidden />
      <p className="font-medium">Drop your GTM container export here</p>
      <p className="text-sm text-muted-foreground">
        In Google Tag Manager: Admin → Export container → choose a version → Export. JSON, up to 5 MB.
      </p>
      <input ref={input} type="file" accept=".json,application/json" className="sr-only" onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
      <Button onClick={() => input.current?.click()} disabled={busy}>
        <Upload className="mr-2 h-4 w-4" aria-hidden /> {busy ? "Reading…" : "Choose file"}
      </Button>
    </div>
  );
}
```

- [ ] **Step 5: Implement `src/components/gtm-audit/GtmAuditReport.tsx`**

```tsx
import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ReportData } from "../../../supabase/functions/_shared/gtm-audit/report";
import type { ConsentStatus, MigrationClass } from "../../../supabase/functions/_shared/gtm-audit/types";
import { MIGRATION_CLASSES } from "../../../supabase/functions/_shared/gtm-audit/types";
import { MIGRATION_LABEL } from "../../../supabase/functions/_shared/gtm-audit/migrate";
import { CONSENT_LABEL } from "../../../supabase/functions/_shared/gtm-audit/sheets";

type Shown = "fail" | "warning" | "manual" | "pass";
const STATUS: Record<Shown, { label: string; className: string }> = {
  fail: { label: "Problem", className: "bg-red-500/10 text-red-700 dark:text-red-400" },
  warning: { label: "Review", className: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  manual: { label: "Verify", className: "bg-blue-500/10 text-blue-700 dark:text-blue-400" },
  pass: { label: "OK", className: "bg-green-500/10 text-green-700 dark:text-green-400" },
};
const CONSENT_CLASS: Record<ConsentStatus, string> = {
  gated: STATUS.pass.className, google_consent_mode: STATUS.manual.className,
  likely_gated: STATUS.warning.className, not_gated: STATUS.fail.className,
};

interface Props {
  report: ReportData;
  /** Sample data: shows a label and hides the export. */
  sample?: boolean;
}

export function GtmAuditReport({ report, sample }: Props) {
  const [consent, setConsent] = useState<ConsentStatus | "all">("all");
  const [plan, setPlan] = useState<MigrationClass | "all">("all");
  const [exporting, setExporting] = useState(false);
  const tags = useMemo(
    () => report.tags.filter((t) => (consent === "all" || t.consent === consent) && (plan === "all" || t.migration === plan)),
    [report.tags, consent, plan],
  );
  const findings = report.findings.filter((f) => f.status !== "pass");
  const passed = report.findings.filter((f) => f.status === "pass");

  const download = async () => {
    setExporting(true);
    try {
      const { gtmAuditXlsx } = await import("@/lib/gtmAuditXlsx");
      const url = URL.createObjectURL(await gtmAuditXlsx(report));
      const a = document.createElement("a");
      a.href = url;
      a.download = `gtm-audit-${report.publicId || "container"}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            {report.publicId}{sample ? " · sample data" : ""} · evidence level: configuration (container export, not observed live)
          </p>
          <h2 className="text-xl font-semibold">{report.summary.headline}</h2>
        </div>
        {!sample && (
          <Button variant="outline" onClick={download} disabled={exporting}>
            <Download className="mr-2 h-4 w-4" aria-hidden /> {exporting ? "Building…" : "Download Excel"}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {MIGRATION_CLASSES.filter((c) => report.summary.counts[c] > 0).map((c) => (
          <button key={c} type="button" onClick={() => setPlan(plan === c ? "all" : c)}
            className={`rounded-lg border p-3 text-left transition-colors ${plan === c ? "border-primary bg-primary/5" : ""}`}>
            <div className="text-2xl font-bold">{report.summary.counts[c]}</div>
            <div className="text-xs text-muted-foreground">{MIGRATION_LABEL[c]}</div>
          </button>
        ))}
      </div>

      <section aria-labelledby="gtm-findings" className="space-y-3">
        <h3 id="gtm-findings" className="font-semibold">Findings</h3>
        {findings.map((f) => (
          <Card key={f.checkKey}>
            <CardContent className="space-y-2 p-4">
              <div className="flex items-start gap-3">
                <span className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold uppercase ${STATUS[f.status as Shown].className}`}>{STATUS[f.status as Shown].label}</span>
                <p className="font-medium leading-snug">{f.title}</p>
              </div>
              <p className="text-sm text-muted-foreground">{f.explanation}</p>
              {f.fix && <p className="text-sm"><strong>What to do:</strong> {f.fix}</p>}
              <ul className="ml-4 list-disc text-sm text-muted-foreground">
                {f.evidence.details.slice(1, 11).map((d) => <li key={d} className="break-words">{d}</li>)}
              </ul>
            </CardContent>
          </Card>
        ))}
        {passed.length > 0 && (
          <p className="text-sm text-muted-foreground">OK: {passed.map((f) => f.title).join(" · ")}</p>
        )}
      </section>

      <section aria-labelledby="gtm-tags" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="gtm-tags" className="font-semibold">Tags ({tags.length} of {report.tags.length})</h3>
          <div className="flex flex-wrap gap-1">
            {(["all", "not_gated", "likely_gated", "gated", "google_consent_mode"] as const).map((c) => (
              <Button key={c} size="sm" variant={consent === c ? "default" : "outline"} onClick={() => setConsent(c)}>
                {c === "all" ? "All" : CONSENT_LABEL[c]}
              </Button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/50 text-left">
              <tr><th className="p-2">Tag</th><th className="p-2">Vendor</th><th className="p-2">Triggers</th><th className="p-2">Consent</th><th className="p-2">Plan</th></tr>
            </thead>
            <tbody className="divide-y">
              {tags.map((t) => (
                <tr key={t.id} className={t.paused ? "opacity-60" : ""}>
                  <td className="p-2 align-top"><div className="font-medium">{t.name}</div><div className="text-xs text-muted-foreground">{t.typeLabel}{t.paused ? " · paused" : ""}</div></td>
                  <td className="p-2 align-top">{t.vendorName}</td>
                  <td className="p-2 align-top text-xs">{t.triggers.join(", ") || "—"}</td>
                  <td className="p-2 align-top"><Badge variant="outline" className={CONSENT_CLASS[t.consent]} title={t.consentEvidence}>{CONSENT_LABEL[t.consent]}</Badge></td>
                  <td className="p-2 align-top"><div>{t.migrationLabel}</div><div className="text-xs text-muted-foreground">{t.migrationReason}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 6: Implement `src/pages/GtmAudit.tsx`**

```tsx
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import PublicLayout from "@/components/PublicLayout";
import { Dropzone } from "@/components/gtm-audit/Dropzone";
import { GtmAuditReport } from "@/components/gtm-audit/GtmAuditReport";
import { GTM_AUDIT_SAMPLE } from "@/data/gtmAuditSample";
import { sendAuditStats } from "@/lib/gtmAuditStats";
import { useSEO } from "@/hooks/useSEO";
import { seoFor } from "@/marketing-routes";
import { audit } from "../../supabase/functions/_shared/gtm-audit/audit";
import { MAX_FILE_BYTES } from "../../supabase/functions/_shared/gtm-audit/parse";
import { buildStats } from "../../supabase/functions/_shared/gtm-audit/stats";
import { reportData, type ReportData } from "../../supabase/functions/_shared/gtm-audit/report";

export default function GtmAudit() {
  useSEO(seoFor("/gtm-audit/"));
  const [report, setReport] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File) => {
    setError(null);
    if (file.size > MAX_FILE_BYTES) { setError("The file is larger than 5 MB. Export a single container version from GTM."); return; }
    setBusy(true);
    try {
      const result = audit(await file.text());
      if ("error" in result) { setError(result.message); setReport(null); return; }
      setReport(reportData(result));
      void sendAuditStats(buildStats(result));
    } catch {
      setError("The file could not be read.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PublicLayout>
      <section className="container mx-auto max-w-5xl px-4 py-12 sm:py-16">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">GTM container audit</h1>
        <p className="mt-3 max-w-3xl text-lg text-muted-foreground">
          See which tags fire without a consent condition, which tools identify visitors, what is duplicated, paused or
          years old — and which tags CortIQ already covers if you want to measure without Google Tag Manager.
        </p>
        <p className="mt-3 flex max-w-3xl items-start gap-2 text-sm text-muted-foreground">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            The file never leaves your browser: the audit runs on this page. We count anonymous totals — how many files,
            tag types, known vendors and findings — never tag names, container IDs, domains or URLs.
          </span>
        </p>
        <div className="mt-8">
          <Dropzone onFile={onFile} busy={busy} />
          {error && <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">{error}</p>}
        </div>
      </section>

      <section id="report" className="container mx-auto max-w-5xl px-4 pb-12">
        {report ? (
          <GtmAuditReport report={report} />
        ) : (
          <>
            <h2 className="mb-4 text-lg font-semibold text-muted-foreground">Sample report (synthetic container)</h2>
            <GtmAuditReport report={GTM_AUDIT_SAMPLE} sample />
          </>
        )}
      </section>

      <section className="container mx-auto max-w-5xl px-4 pb-16">
        <div className="rounded-xl border bg-muted/30 p-6">
          <h2 className="text-xl font-semibold">What the audit can and cannot see</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            It reads the container configuration. A consent check inside a Custom JavaScript variable, or a tag the site
            loads outside GTM, does not show up here. To see what actually loads before and after the banner, run the{" "}
            <Link to="/tracking-check/" className="underline">Tracking Check</Link> on the live site.
          </p>
          <Button asChild className="mt-4">
            <Link to="/auth">Measure without GTM with CortIQ <ArrowRight className="ml-2 h-4 w-4" aria-hidden /></Link>
          </Button>
        </div>
      </section>
    </PublicLayout>
  );
}
```

`audit()` takes the file text as is: `parse()` (Task 2) accepts a string and returns `not_json` for invalid JSON.

- [ ] **Step 7: Register the route**

`src/marketing-routes.ts`, after the `/tracking-check/` entry:

```ts
  {
    path: '/gtm-audit/',
    title: 'Free GTM Container Audit: Consent & Cleanup — CortIQ',
    description: 'Upload your Google Tag Manager export and see which tags fire without consent, which identify visitors and which CortIQ can replace. Runs in your browser.',
    published: '2026-11-17',
    changefreq: 'monthly',
    priority: 0.7,
    source: 'src/pages/GtmAudit.tsx',
    footer: { group: 'product', label: 'GTM container audit' },
  },
```

`src/entry-server.tsx`: add `import GtmAudit from './pages/GtmAudit';` after the `TrackingCheckLanding` import, and `'/gtm-audit/': GtmAudit,` after `'/tracking-check/': TrackingCheckLanding,` in `PAGES`.

`src/App.tsx`: add `import GtmAudit from "./pages/GtmAudit";` after the `CookieConsentChecker` import, and after the `/cookie-consent-checker` route:

```tsx
              <Route path="/gtm-audit" element={<GtmAudit />} />
```

- [ ] **Step 8: Run tests and type-check the new files**

Run: `node --test tests/foundation/gtm-audit-page.test.mjs tests/foundation/marketing-routes.test.mjs && npx tsc --noEmit -p tsconfig.app.json`
Expected: PASS; `tsc` reports no errors in `src/pages/GtmAudit.tsx`, `src/components/gtm-audit/*` or `src/lib/gtmAudit*.ts` (the build skips `tsc`, so pre-existing errors elsewhere may appear — only the new files must be clean).

- [ ] **Step 9: Check the page in the browser**

Run: `npm run dev`, open `http://localhost:8080/gtm-audit`.
First write the synthetic sample container to a file you can drop on the page:

```bash
node -e "import('./scripts/gtm-audit/fixture.mjs').then((m) => require('fs').writeFileSync('sample-gtm.json', JSON.stringify(m.sampleExport())))"
```

Expected:
- Before any upload, the sample report renders with the "sample data" label and no export button.
- Dropping `sample-gtm.json` shows the same report without the label and with "Download Excel"; the workbook opens with four sheets.
- Dropping any non-JSON file shows the parse error message.
- DevTools → Network shows one POST to `gtm-audit-stats` and no request carrying the file.

Delete `sample-gtm.json` afterwards.

- [ ] **Step 10: Commit**

```bash
git add src/lib/gtmAuditStats.ts src/components/gtm-audit src/pages/GtmAudit.tsx src/marketing-routes.ts src/entry-server.tsx src/App.tsx tests/foundation/gtm-audit-page.test.mjs
git commit -m "feat(gtm-audit): public /gtm-audit/ page with in-browser audit and sample report" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Privacy policy, project notes and full check

**Files:**
- Modify: `src/pages/Privacy.tsx` (`LAST_UPDATED` line 11; new paragraph at the end of section 3B, before its closing `</CardContent>` ~line 194)
- Modify: `CLAUDE.md` (new section after "Uptime monitoring")

**Interfaces:**
- Consumes: everything above.
- Produces: no code.

- [ ] **Step 1: Update the privacy policy**

`src/pages/Privacy.tsx` line 11:

```tsx
const LAST_UPDATED = "November 17, 2026";
```

In section 3B, after the closing `</div>` of the "Data in a log entry" box and before `</CardContent>`, add:

```tsx
              <div className="bg-primary/10 p-4 rounded-lg">
                <h4 className="font-semibold mb-2 text-foreground">GTM container audit</h4>
                <p className="text-sm text-muted-foreground">
                  The GTM container audit at /gtm-audit/ runs in the visitor&apos;s browser; the uploaded file is not sent
                  to CortIQ. After each audit the page sends anonymous totals — the number of tags in a range, counts per
                  tag type, known vendor, finding and migration class — which CortIQ adds to daily counters. No tag
                  names, container IDs, domains, URLs, IP addresses or User-Agents are stored, and nothing is stored on
                  the visitor&apos;s device.
                </p>
              </div>
```

- [ ] **Step 2: Add the project notes to `CLAUDE.md`**

After the "Uptime monitoring (added 2026-11-17)" section:

```markdown
## GTM container audit (added 2026-11-17)

Spec: `docs/superpowers/specs/2026-11-17-gtm-container-audit-design.md`.

- Public page `/gtm-audit/`: the visitor drops a GTM export (JSON, ≤5 MB) and `_shared/gtm-audit/audit.ts` runs **in the
  browser**. The file is never sent anywhere; `tests/foundation/gtm-audit-page.test.mjs` fails if the page UI calls
  `fetch`/`sendBeacon`.
- Engine: `parse` → `tagInfos` (vendor via the tracking-vendors registry, `gallery-map.ts`, template permissions,
  Custom HTML URLs; consent from triggers and consent settings) → 9 rules (`gtm.*`) + a migration class per tag.
  Evidence level is always "configuration" — never claim a tag fires.
- Counters: `stats.ts` whitelist → `gtm-audit-stats` (public, rate-limited) → `gtm_audit_stats_daily` (service role only).
  New keys must go through `validateStats`; never add names, IDs, domains or URLs.
- Sample report: `node scripts/gtm-audit/sample-report.mjs` after any engine change (freshness test). The sample
  container is synthetic — never use a real customer's export in fixtures, samples or tests.
- New vendor in GTM: add it to `_shared/tracking-vendors.ts` (and `gallery-map.ts` for a gallery template).
```

- [ ] **Step 3: Run the full check**

Run: `npm run test:foundation`
Expected: all tests pass, including the 9 new `gtm-audit-*` files.

Run: `npm run build`
Expected: build succeeds; `dist/gtm-audit/index.html` exists (prerendered) and the sitemap lists `/gtm-audit/`. The CSP hash step and pinned-tracker step pass unchanged (no inline script added, `cortiq.js` untouched).

Run: `git status --short`
Expected: no changes to `public/v/`, `src/lib/sri-manifest.json` or the WP plugin zip. If the build rewrote the plugin zip with line-ending-only changes, revert it: `git checkout -- <zip path>`.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Privacy.tsx CLAUDE.md
git commit -m "docs(gtm-audit): privacy policy section 3B and project notes" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

**After merge (Daniel's go-ahead, not part of the plan run):** `supabase db push --remote --yes` (migration `20261201000001`), `supabase functions deploy gtm-audit-stats`, FTP of `dist/`, then load `https://cortiq.se/gtm-audit/` and check `select * from csp_reports order by last_seen desc` and `select * from gtm_audit_stats_daily`.

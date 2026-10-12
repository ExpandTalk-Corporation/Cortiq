# Tracking Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Tracking Check — an internal CortIQ tool that verifies marketing tracking (UTM/click IDs, tags, CSP, consent behaviour, forms) on a client site, either against the current live site (Comparison) or against declared consent commitments (Policy), and produces a plain-language report, share link and tracker-compatible CSV.

**Architecture:** One engine. A Supabase job queue (runs → tasks) is drained by a self-re-invoking edge worker. Each task runs either a fetch probe (redirects, parameters, CSP header) or one Browserless `/function` call that observes the page in several fresh consent states. A pure `assess()` turns observations plus the expected behaviour (baseline site or policy template) into findings; `report.ts` turns findings into summary lines and CSV.

**Tech Stack:** Deno edge functions (Supabase), PostgreSQL + RLS, Browserless (Puppeteer) `/function` API, React 18 + TanStack Query + shadcn/ui, Node 24 `node --test` with native TypeScript stripping, PGlite for SQL tests.

**Spec:** `docs/superpowers/specs/2026-10-12-tracking-check-design.md`

## Global Constraints

- Shared code under `supabase/functions/_shared/` uses **erasable TypeScript only** (no `enum`, `namespace`, parameter properties) and **explicit `.ts`/`.js` import extensions**. It runs in Deno and in Node 24 tests via type stripping.
- Tests: `npm run test:foundation` (`node --test tests/foundation/*.test.mjs`). No network access in tests. Edge handlers are tested through `tests/foundation/edge-harness.mjs`.
- UI copy is English (CortIQ convention).
- **Never report `pass` for something that was not verified.** Consent states that could not be automated produce `manual`; pages that could not be loaded produce `untestable` and are excluded from other checks.
- Legal wording states facts. Cookieless findings say: "may require consent under ePrivacy rules (in Sweden: LEK 9 kap. 28 §); this is assessed by the controller."
- Limits: 25 pages per Comparison run, 15 per Policy run, 25 legacy URLs, 10 runs per user per 24 h, basic auth kept max 2 h, observations kept 90 days.
- RLS: `user_id = auth.uid()` on runs; child tables through run ownership. Edge functions write with the service role. `auth_ciphertext` is never selectable by `authenticated`.
- Work on branch `feat/tracking-check`, created from `docs/tracking-check-spec`. Commit after every task. **Do not push, deploy, set secrets or run SQL against the remote project without the user's explicit OK.**
- Remote migrations are applied through the Supabase dashboard SQL editor (`supabase db push` is blocked by migration-history drift). Never run `supabase migration repair`.
- CSV status mapping: pass → `Completed`, warning → `Pending Review`, fail/manual/untestable → `Not Started`.

## Review Focus

1. **Staging behind bot protection or basic auth with a wrong/expired password** → pages are `untestable` (never fail or pass). Pinned in Task 6 (`finalStatus` 401 and challenge pages).
2. **Cookie banner the probe cannot click** (unknown CMP, unusual button text) → reject checks become `manual`, and missing consented tags become `manual` instead of "missing". Pinned in Tasks 7 and 8.
3. **Trailing-slash/temporary redirects on normal pages** (`/glossary` → 307 `/glossary/`) → parameter check still passes; redirect-quality warnings only apply to listed legacy URLs. Pinned in Tasks 4 and 6.
4. **Worker crash or timeout mid-run** → stuck tasks are recovered, retried, finally failed; the run still finishes and the page shows as `untestable`. Pinned in Tasks 11 and 12.
5. **Share link leaking staging tokens or personal data** → evidence carries parameter names only, never values; shared payload omits `verified_by`. Pinned in Tasks 6 and 13.

## File Structure

```
supabase/functions/_shared/
  safe-url.ts                        SSRF guard (moved from form-detector, DNS check fixed)
  form-detection.ts                  detectForms(html) (moved from form-detector)
  tracking-vendors.ts                Vendor registry: matchers, cookies, IDs, CSP domains, impact
  tracking-check/
    types.ts                         All shared types + tracking test parameters
    fetch-probe.ts                   safeGet(), fetchProbe(), parseCsp(), cspAllows()
    pages.ts                         parseSitemap(), fetchSitemapUrls(), suggestPages()
    instructions.ts                  Manual verification steps (plain text)
    assess/util.ts                   Shared helpers for assess modules
    assess/parameters.ts             Parameters + legacy redirects + coverage
    assess/tags.ts                   Tags, IDs, CSP, forms
    assess/consent.ts                Consent defaults, before/after choice, categories, EC, manual items
    assess/index.ts                  assess() = all modules, sorted
    report.ts                        summarize(), toCsv()
    browser-probe.js                 Puppeteer script source for Browserless + in-page helpers
    browserless.ts                   runBrowserProbe() HTTP client
    secret-box.ts                    seal()/open() AES-GCM, randomToken()
    kick.ts                          kickWorker()
    worker-core.ts                   processBatch(), finalizeRun(), buildSites()
supabase/functions/tracking-check-start/index.ts     access, suggest, create, status, share, revoke
supabase/functions/tracking-check-worker/index.ts    secret-guarded batch processor
supabase/functions/tracking-check-worker/store.ts    TrackingCheckStore on supabase-js
supabase/functions/tracking-check-report/index.ts    public read by share token
supabase/migrations/20261012000001_tracking_check.sql
scripts/tracking-check/browserless-smoke.mjs         Task 1 contract check
scripts/tracking-check/probe-smoke.mjs               live probe against a real URL
src/hooks/useTrackingCheck.ts
src/components/tracking-check/{StartForm,RunProgress,ReportView}.tsx
src/pages/{TrackingCheck,TrackingCheckRun,TrackingCheckShared}.tsx
tests/foundation/tracking-check-*.test.mjs, tracking-check-fixtures.mjs
```

---

### Task 1: Verify the Browserless contract (gate)

Everything browser-based depends on this. `take-screenshot` still calls the legacy `chrome.browserless.io`; Browserless v2 uses regional hosts such as `https://production-sfo.browserless.io`. This task confirms the key, host and the exact Puppeteer APIs the probe will use.

**Files:**
- Create: `scripts/tracking-check/browserless-smoke.mjs`

**Interfaces:**
- Produces: confirmed values for `BROWSERLESS_URL` (default `https://production-sfo.browserless.io`) and the `/function` request/response shape used in Task 10. Record results at the bottom of this task (edit the plan) before moving on.

- [ ] **Step 1: Create the branch**

```bash
git checkout docs/tracking-check-spec
git checkout -b feat/tracking-check
```

- [ ] **Step 2: Write the smoke script**

```js
// Verifies the Browserless /function contract Tracking Check relies on.
// Usage: BROWSERLESS_API_KEY=... [BROWSERLESS_URL=...] node scripts/tracking-check/browserless-smoke.mjs
const token = process.env.BROWSERLESS_API_KEY;
const base = process.env.BROWSERLESS_URL ?? 'https://production-sfo.browserless.io';
if (!token) { console.error('Set BROWSERLESS_API_KEY'); process.exit(1); }

const code = `
export default async function ({ page, context }) {
  const browser = page.browser();
  const create = browser.createBrowserContext ? 'createBrowserContext' : 'createIncognitoBrowserContext';
  const ctx = await browser[create]();
  const p = await ctx.newPage();
  const requests = [];
  p.on('request', r => requests.push(r.url()));
  await p.evaluateOnNewDocument(() => { window.__probe = true; });
  const res = await p.goto(context.url, { waitUntil: 'load', timeout: 30000 });
  await p.waitForNetworkIdle({ idleTime: 1000, timeout: 10000 }).catch(() => {});
  const cdp = await p.createCDPSession();
  const { cookies } = await cdp.send('Network.getAllCookies');
  const flag = await p.evaluate(() => window.__probe === true);
  await ctx.close();
  return { data: { status: res && res.status(), create, requests: requests.length, cookies: cookies.length, evaluateOnNewDocument: flag, puppeteerHasAuthenticate: typeof p.authenticate === 'function' }, type: 'application/json' };
}`;

const res = await fetch(`${base}/function?token=${encodeURIComponent(token)}&timeout=60000`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code, context: { url: 'https://example.com/' } }),
});
console.log('HTTP', res.status, res.headers.get('content-type'));
console.log(await res.text());
```

- [ ] **Step 3: Run it**

Ask the user to provide the key in their shell (the deployed secret value cannot be read back): `! $env:BROWSERLESS_API_KEY="..."; node scripts/tracking-check/browserless-smoke.mjs`

Expected: `HTTP 200 application/json` and a JSON body with `status: 200`, `create` set, `requests >= 1`, `evaluateOnNewDocument: true`, `puppeteerHasAuthenticate: true`.

If HTTP 401/403: the key is invalid or expired — **stop and ask the user** to create/renew a Browserless key. If HTTP 404: try `https://production-lon.browserless.io` and `https://production-ams.browserless.io`. If the body is not the `data` object but `{ data, type }`, note it: Task 10's client must unwrap it.

- [ ] **Step 4: Record results and commit**

Append to this task in the plan: working host, whether the response is unwrapped, which context-creation method exists. Then:

```bash
git add scripts/tracking-check/browserless-smoke.mjs docs/superpowers/plans/2026-10-12-tracking-check.md
git commit -m "chore(tracking-check): Browserless contract smoke script"
```

---

### Task 2: Shared types, SSRF guard, harness globals

**Files:**
- Create: `supabase/functions/_shared/tracking-check/types.ts`
- Create: `supabase/functions/_shared/safe-url.ts`
- Modify: `supabase/functions/form-detector/index.ts:15-37` (remove local guard, import shared)
- Modify: `tests/foundation/edge-harness.mjs` (expose `crypto`, `TextEncoder`, `TextDecoder`, `AbortSignal`, `btoa`, `atob`, `setTimeout`, `Headers` to the sandbox)
- Test: `tests/foundation/tracking-check-safe-url.test.mjs`

**Interfaces:**
- Produces: every type in `types.ts` below (used by all later tasks); `assertSafeUrl(raw: string, resolve?: Resolver | null): Promise<URL>`; `isPrivateAddress(host: string): boolean`; `type Resolver = (host: string, type: 'A' | 'AAAA') => Promise<string[]>`.

Note the bug being fixed: in the current `form-detector`, the "resolved to private IP" `throw` sits inside a `try` whose `catch` swallows it, so the DNS check never blocks anything.

- [ ] **Step 1: Write `types.ts`**

```ts
// Shared Tracking Check types. Erasable TypeScript only: runs in Deno and in Node tests.
export type Mode = 'comparison' | 'policy';
export type SiteRole = 'baseline' | 'target';
export type ConsentState = 'none' | 'reject' | 'accept' | 'analytics_only' | 'marketing_only';
export type ConsentCategory = 'necessary' | 'analytics' | 'marketing' | 'preferences';
/** How a consent state was reached. `not_needed`: no interaction required (state `none`, or no banner on the page). */
export type ConsentMethod = 'adapter' | 'text' | 'not_automated' | 'not_needed';

export interface RedirectHop { url: string; status: number }

export interface FetchObservation {
  requestedUrl: string;
  hops: RedirectHop[];               // every response in order; the last one is the final response
  finalUrl: string;
  finalStatus: number;
  paramsLost: string[];              // tracking params sent but missing from the final URL
  csp: Record<string, string[]> | null;
  challenge: boolean;                // bot-protection challenge page
  error: string | null;
}

export interface ObservedRequest { url: string; type: string }

export interface StateObservation {
  state: ConsentState;
  method: ConsentMethod;
  requests: ObservedRequest[];
  cookies: { name: string; domain: string }[];   // new since the consent action (all cookies for `none`)
  storageKeys: string[];                          // new since the consent action, without the local:/session: prefix
  cspViolations: { blockedUrl: string; directive: string }[];
  consentCommands: { kind: 'default' | 'update'; params: Record<string, string> }[];
  enhancedConversions: boolean;
  challenge: boolean;
  error: string | null;
}

export interface FormHit { provider: 'hubspot' | 'gravity_forms'; formId: string }

export interface BrowserObservation {
  url: string;
  cmp: string | null;
  states: StateObservation[];
  forms: FormHit[];
}

export interface PageObservation {
  path: string;
  legacy: boolean;
  fetch: FetchObservation | null;
  browser: BrowserObservation | null;
  failed: string | null;             // task failed all attempts
}

export interface SiteObservation { role: SiteRole; origin: string; pages: PageObservation[] }

export interface PolicyTemplate {
  noGoogleBeforeConsent: boolean;
  consentDefaultsDenied: boolean;
  ga4RequiresAnalytics: boolean;
  adsRequiresMarketing: boolean;
  enhancedConversionsOff: boolean;
  noUnknownVendorsAfterReject: boolean;
  expectedIds: string[];
  manualItems: { key: string; label: string }[];
}

export type Scope = 'Parameters' | 'Tags' | 'CSP' | 'Consent' | 'Forms' | 'Ads/GA4' | 'Manual' | 'Coverage';
export type FindingStatus = 'pass' | 'fail' | 'warning' | 'manual' | 'untestable';
export type Priority = 'high' | 'medium' | 'low';
export type Owner = 'developer' | 'gtm' | 'cmp' | 'marketing' | 'legal';

export interface Finding {
  scope: Scope;
  checkKey: string;
  title: string;
  status: FindingStatus;
  priority: Priority | null;
  explanation: string;
  fix: string;
  typicalOwner: Owner | null;
  evidence: { pages: string[]; details: string[] };
}

export interface AssessInput {
  mode: Mode;
  target: SiteObservation;
  baseline: SiteObservation | null;
  policy: PolicyTemplate | null;
}

export interface BasicAuth { username: string; password: string }

/** Values appended to every tested URL. Distinct values make lost parameters easy to spot. */
export const TRACKING_TEST_VALUES: Record<string, string> = {
  utm_source: 'cortiq_check',
  utm_medium: 'test',
  utm_campaign: 'tracking_check',
  gclid: 'TC_GCLID_TEST',
  gbraid: 'TC_GBRAID_TEST',
  wbraid: 'TC_WBRAID_TEST',
  fbclid: 'TC_FBCLID_TEST',
  msclkid: 'TC_MSCLKID_TEST',
  _gl: '1*tc*test',
};
export const TRACKING_PARAMS: string[] = Object.keys(TRACKING_TEST_VALUES);
```

- [ ] **Step 2: Write the failing SSRF test**

`tests/foundation/tracking-check-safe-url.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertSafeUrl, isPrivateAddress } from '../../supabase/functions/_shared/safe-url.ts';

test('blocks private, loopback, metadata and non-http targets', async () => {
  for (const url of ['http://localhost/', 'http://127.0.0.1/', 'http://10.1.2.3/', 'http://172.20.0.1/',
    'http://192.168.1.1/', 'http://169.254.169.254/latest', 'http://[::1]/', 'http://2130706433/',
    'http://100.64.0.1/', 'http://printer.local/', 'ftp://example.com/']) {
    await assert.rejects(assertSafeUrl(url, null), undefined, url);
  }
});

test('blocks public names that resolve to private addresses', async () => {
  const resolve = async (_host, type) => (type === 'A' ? ['10.0.0.5'] : []);
  await assert.rejects(assertSafeUrl('https://evil.example/', resolve), /resolved to private/);
});

test('allows public hosts and survives resolver failures', async () => {
  assert.equal((await assertSafeUrl('https://example.com/a?b=1', async () => ['93.184.215.14'])).hostname, 'example.com');
  await assertSafeUrl('https://example.com/', async () => { throw new Error('resolver unavailable'); });
});

test('isPrivateAddress handles bracketed IPv6 and public addresses', () => {
  assert.equal(isPrivateAddress('[fd00::1]'), true);
  assert.equal(isPrivateAddress('8.8.8.8'), false);
  assert.equal(isPrivateAddress('fcbarcelona.com'), false);
  assert.equal(isPrivateAddress('fd.example.com'), false);
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `node --test tests/foundation/tracking-check-safe-url.test.mjs`
Expected: FAIL — `Cannot find module .../safe-url.ts`

- [ ] **Step 4: Write `safe-url.ts`**

```ts
// SSRF guard for server-side fetches: blocks non-http(s) schemes and hosts that are, or
// resolve to, private / loopback / link-local / carrier-grade NAT / metadata addresses.
export type Resolver = (host: string, type: 'A' | 'AAAA') => Promise<string[]>;

const PRIVATE_V4 = /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/;
const PRIVATE_172 = /^172\.(1[6-9]|2\d|3[01])\./;
const CGNAT = /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./;
const PRIVATE_V6 = /^(::1?$|fe80:|fc|fd|::ffff:)/i;

export function isPrivateAddress(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local')) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return PRIVATE_V4.test(h) || PRIVATE_172.test(h) || CGNAT.test(h);
  // Only IPv6 literals contain ':' — prevents names like "fcbarcelona.com" matching the fc/fd prefixes.
  return h.includes(':') && PRIVATE_V6.test(h);
}

// deno-lint-ignore no-explicit-any
const deno = (globalThis as any).Deno;
const denoResolver: Resolver | null = typeof deno?.resolveDns === 'function'
  ? (host, type) => deno.resolveDns(host, type)
  : null;

export async function assertSafeUrl(raw: string, resolve: Resolver | null = denoResolver): Promise<URL> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('Invalid URL'); }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Only http(s) URLs allowed');
  if (isPrivateAddress(url.hostname)) throw new Error('Blocked host');
  if (resolve) {
    let ips: string[] = [];
    for (const type of ['A', 'AAAA'] as const) {
      try { ips = ips.concat(await resolve(url.hostname, type)); } catch { /* no records or resolver unavailable */ }
    }
    if (ips.some(isPrivateAddress)) throw new Error('Blocked host (resolved to private IP)');
  }
  return url;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test tests/foundation/tracking-check-safe-url.test.mjs`
Expected: PASS (4 tests)

- [ ] **Step 6: Switch `form-detector` to the shared guard**

In `supabase/functions/form-detector/index.ts`, delete the block from the comment `// SSRF guard: block non-http(s) schemes…` through the end of the local `assertSafeUrl` function (lines 15–37), and add after the existing imports:

```ts
import { assertSafeUrl } from '../_shared/safe-url.ts';
```

- [ ] **Step 7: Expose Web APIs in the edge harness**

In `tests/foundation/edge-harness.mjs`, change the `runInNewContext(code, { … })` globals object to also include:

```js
      crypto: globalThis.crypto, TextEncoder, TextDecoder, AbortSignal, Headers, btoa, atob, setTimeout,
```

(on the line after `exports, Request, Response, URL, fetch,`).

- [ ] **Step 8: Run the whole suite and commit**

Run: `npm run test:foundation`
Expected: all tests PASS (existing + 4 new).

```bash
git add supabase/functions/_shared/tracking-check/types.ts supabase/functions/_shared/safe-url.ts supabase/functions/form-detector/index.ts tests/foundation/edge-harness.mjs tests/foundation/tracking-check-safe-url.test.mjs
git commit -m "feat(tracking-check): shared types and SSRF guard (fixes swallowed DNS check)"
```

---

### Task 3: Vendor registry

**Files:**
- Create: `supabase/functions/_shared/tracking-vendors.ts`
- Test: `tests/foundation/tracking-check-vendors.test.mjs`

**Interfaces:**
- Consumes: `ConsentCategory` from `types.ts`.
- Produces:
  - `interface Vendor { id; name; category: ConsentCategory; googleTag: boolean; requests: VendorMatcher[]; cookies: RegExp[]; idFrom?: (url: URL) => string | null; csp: Partial<Record<CspDirective, string[]>>; impact: string }`
  - `type CspDirective = 'script-src' | 'connect-src' | 'img-src' | 'frame-src'`
  - `TRACKING_VENDORS: Vendor[]`, `vendorById(id): Vendor | undefined`, `vendorForUrl(raw: string): Vendor | null`, `vendorForName(name: string): Vendor | null` (cookie or storage key), `cookieCategory(name: string): ConsentCategory | null`, `extractVendorIds(urls: string[]): Map<string, Set<string>>`.

`googleTag` means "Google advertising/analytics tag" (GTM, GA4, Google Ads). Google Fonts and reCAPTCHA are registered as `necessary` infrastructure with `googleTag: false` so they are neither flagged as Google tags nor reported as unknown third parties.

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRACKING_VENDORS, vendorForUrl, vendorForName, cookieCategory, extractVendorIds } from '../../supabase/functions/_shared/tracking-vendors.ts';

test('every vendor is complete and ids are unique', () => {
  const ids = new Set();
  for (const v of TRACKING_VENDORS) {
    assert.ok(!ids.has(v.id), `duplicate ${v.id}`); ids.add(v.id);
    assert.ok(['necessary', 'analytics', 'marketing', 'preferences'].includes(v.category), v.id);
    assert.ok(v.requests.length > 0, `${v.id} needs a request matcher`);
    assert.ok(v.impact.length > 10, `${v.id} needs an impact sentence`);
    if (v.category !== 'necessary') assert.ok(Object.keys(v.csp).length > 0, `${v.id} needs CSP domains`);
  }
});

test('classifies request URLs, including gtag by ID prefix', () => {
  const cases = {
    'https://js.hs-scripts.com/7117856.js': 'hubspot',
    'https://js-eu1.hs-analytics.net/analytics/1/7117856.js': 'hubspot',
    'https://forms.hsforms.com/submissions/v3': 'hubspot-forms',
    'https://www.googletagmanager.com/gtm.js?id=GTM-ABC123': 'gtm',
    'https://www.googletagmanager.com/gtag/js?id=G-6J9DFZLXNL': 'ga4',
    'https://www.googletagmanager.com/gtag/js?id=AW-18424645060': 'google-ads',
    'https://region1.google-analytics.com/g/collect?v=2&tid=G-6J9DFZLXNL': 'ga4',
    'https://www.google.com/pagead/1p-conversion/18424645060/': 'google-ads',
    'https://www.google.com/recaptcha/api.js': 'recaptcha',
    'https://connect.facebook.net/en_US/fbevents.js': 'meta',
    'https://cdn-cookieyes.com/client_data/abc/script.js': 'cookieyes',
    'https://example.com/app.js': null,
  };
  for (const [url, id] of Object.entries(cases)) assert.equal(vendorForUrl(url)?.id ?? null, id, url);
});

test('attributes cookies and storage keys and falls back to the cookie-scanner list', () => {
  assert.equal(vendorForName('__hstc')?.id, 'hubspot');
  assert.equal(vendorForName('_ga_6J9DFZLXNL')?.id, 'ga4');
  assert.equal(cookieCategory('_gcl_aw'), 'marketing');
  assert.equal(cookieCategory('wp-settings-1'), 'necessary');
  assert.equal(cookieCategory('totally_unknown'), null);
});

test('extracts account and container IDs', () => {
  const ids = extractVendorIds([
    'https://js.hs-scripts.com/7117856.js',
    'https://www.googletagmanager.com/gtm.js?id=GTM-ABC123',
    'https://www.googletagmanager.com/gtag/js?id=G-6J9DFZLXNL',
    'https://www.googletagmanager.com/gtag/js?id=AW-18424645060',
  ]);
  assert.deepEqual([...ids.get('hubspot')], ['7117856']);
  assert.deepEqual([...ids.get('gtm')], ['GTM-ABC123']);
  assert.deepEqual([...ids.get('ga4')], ['G-6J9DFZLXNL']);
  assert.deepEqual([...ids.get('google-ads')], ['AW-18424645060']);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/foundation/tracking-check-vendors.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `tracking-vendors.ts`**

```ts
// Canonical list of tracking vendors Tracking Check recognises. Same principle as
// ai-bot-registry.ts: one list, imported wherever vendors are classified.
import type { ConsentCategory } from './tracking-check/types.ts';

export type CspDirective = 'script-src' | 'connect-src' | 'img-src' | 'frame-src';
export interface VendorMatcher { host: RegExp; path?: RegExp; query?: RegExp }
export interface Vendor {
  id: string;
  name: string;
  category: ConsentCategory;
  /** Google advertising/analytics tag (GTM, GA4, Google Ads). */
  googleTag: boolean;
  requests: VendorMatcher[];
  cookies: RegExp[];
  idFrom?: (url: URL) => string | null;
  csp: Partial<Record<CspDirective, string[]>>;
  impact: string;
}

const param = (name: string, prefix: string) => (u: URL): string | null => {
  const v = u.searchParams.get(name);
  return v && v.startsWith(prefix) ? v : null;
};
const ANY = /./;

export const TRACKING_VENDORS: Vendor[] = [
  {
    id: 'gtm', name: 'Google Tag Manager', category: 'necessary', googleTag: true,
    requests: [{ host: /^www\.googletagmanager\.com$/, path: /^\/gtm\.js/ }],
    cookies: [], idFrom: param('id', 'GTM-'),
    csp: { 'script-src': ['*.googletagmanager.com'], 'img-src': ['*.googletagmanager.com'], 'connect-src': ['*.googletagmanager.com'] },
    impact: 'Tags managed in GTM (for example GA4, Google Ads and Meta) do not run.',
  },
  {
    id: 'ga4', name: 'Google Analytics 4', category: 'analytics', googleTag: true,
    requests: [
      { host: /^www\.googletagmanager\.com$/, path: /^\/gtag\/js/, query: /[?&]id=(G|GT)-/ },
      { host: /^((region\d+|www)\.)?google-analytics\.com$|^analytics\.google\.com$/, path: /^\/(g|j)\/collect/ },
    ],
    cookies: [/^_ga$/, /^_ga_/, /^_gid$/, /^_gat/],
    idFrom: (u) => param('id', 'G-')(u) ?? param('tid', 'G-')(u),
    csp: { 'script-src': ['*.googletagmanager.com'], 'img-src': ['*.google-analytics.com', '*.googletagmanager.com'], 'connect-src': ['*.google-analytics.com', '*.analytics.google.com', '*.googletagmanager.com'] },
    impact: 'Google Analytics records no visits or conversions from these pages.',
  },
  {
    id: 'google-ads', name: 'Google Ads', category: 'marketing', googleTag: true,
    requests: [
      { host: /^www\.googletagmanager\.com$/, path: /^\/gtag\/js/, query: /[?&]id=AW-/ },
      { host: /^(googleads\.g\.doubleclick\.net|www\.googleadservices\.com|ad\.doubleclick\.net)$/ },
      { host: /^www\.google\.com$/, path: /^\/(pagead|ccm|rmkt)\// },
    ],
    cookies: [/^_gcl_/, /^IDE$/, /^test_cookie$/],
    idFrom: (u) => {
      const id = param('id', 'AW-')(u);
      if (id) return id;
      const m = u.pathname.match(/\/(?:pagead\/(?:1p-)?conversion|pagead\/viewthroughconversion)\/(\d+)/);
      return m ? `AW-${m[1]}` : null;
    },
    csp: { 'script-src': ['*.googletagmanager.com', 'www.googleadservices.com', 'googleads.g.doubleclick.net'], 'img-src': ['www.google.com', 'googleads.g.doubleclick.net', 'www.googleadservices.com'], 'connect-src': ['www.google.com', 'googleads.g.doubleclick.net', 'www.googleadservices.com'], 'frame-src': ['td.doubleclick.net', 'bid.g.doubleclick.net'] },
    impact: 'Google Ads cannot attribute conversions to ad clicks, so Smart Bidding optimises on incomplete data.',
  },
  {
    id: 'hubspot', name: 'HubSpot tracking code', category: 'analytics', googleTag: false,
    requests: [{ host: /^(js(-eu1)?\.hs-(scripts|analytics|banner)\.(com|net)|js\.hscollectedforms\.net|js\.hsadspixel\.net|track(-eu1)?\.hubspot\.com|js(-eu1)?\.usemessages\.com)$/ }],
    cookies: [/^__hstc$/, /^hubspotutk$/, /^__hssc$/, /^__hssrc$/],
    idFrom: (u) => (/^js(-eu1)?\.hs-scripts\.com$/.test(u.hostname) ? u.pathname.match(/^\/(\d+)\.js/)?.[1] ?? null : null),
    csp: { 'script-src': ['js.hs-scripts.com', 'js.hs-analytics.net', 'js.hs-banner.com', 'js.hscollectedforms.net', 'js.hsadspixel.net', 'js.usemessages.com'], 'connect-src': ['*.hubspot.com', 'forms.hscollectedforms.net'], 'img-src': ['track.hubspot.com'] },
    impact: 'HubSpot cannot link form submissions to page views or traffic source (Original Source falls back to Direct or Offline), and cannot capture gclid for Google Ads offline conversions.',
  },
  {
    id: 'hubspot-forms', name: 'HubSpot forms', category: 'necessary', googleTag: false,
    requests: [{ host: /^(js(-eu1)?\.hsforms\.net|forms(-eu1)?\.hsforms\.com|forms(-eu1)?\.hubspot\.com)$/ }],
    cookies: [],
    csp: { 'script-src': ['js.hsforms.net'], 'connect-src': ['forms.hsforms.com', 'forms.hubspot.com'], 'frame-src': ['forms.hsforms.com'], 'img-src': ['forms.hsforms.com'] },
    impact: 'HubSpot forms do not render or cannot be submitted.',
  },
  {
    id: 'meta', name: 'Meta Pixel', category: 'marketing', googleTag: false,
    requests: [{ host: /^connect\.facebook\.net$/ }, { host: /^www\.facebook\.com$/, path: /^\/tr/ }],
    cookies: [/^_fbp$/, /^_fbc$/, /^fr$/],
    idFrom: (u) => (u.hostname === 'www.facebook.com' ? u.searchParams.get('id') : null),
    csp: { 'script-src': ['connect.facebook.net'], 'connect-src': ['www.facebook.com', 'connect.facebook.net'], 'img-src': ['www.facebook.com'], 'frame-src': ['www.facebook.com'] },
    impact: 'Meta Ads cannot attribute conversions to ads.',
  },
  {
    id: 'linkedin', name: 'LinkedIn Insight Tag', category: 'marketing', googleTag: false,
    requests: [{ host: /^(snap\.licdn\.com|px\.ads\.linkedin\.com|dc\.ads\.linkedin\.com)$/ }],
    cookies: [/^li_fat_id$/, /^li_sugr$/, /^bcookie$/, /^lidc$/, /^UserMatchHistory$/, /^AnalyticsSyncHistory$/, /^ln_or$/],
    idFrom: (u) => (u.hostname === 'px.ads.linkedin.com' ? u.searchParams.get('pid') : null),
    csp: { 'script-src': ['snap.licdn.com'], 'connect-src': ['px.ads.linkedin.com'], 'img-src': ['px.ads.linkedin.com'] },
    impact: 'LinkedIn Ads cannot attribute conversions or build retargeting audiences.',
  },
  {
    id: 'reddit', name: 'Reddit Pixel', category: 'marketing', googleTag: false,
    requests: [{ host: /^www\.redditstatic\.com$/, path: /^\/ads\// }, { host: /^(alb|pixel-config)\.reddit\.com$/ }],
    cookies: [/^_rdt_uuid$/, /^_rdt_cid$/],
    idFrom: (u) => (u.hostname === 'alb.reddit.com' ? u.searchParams.get('id') : null),
    csp: { 'script-src': ['www.redditstatic.com'], 'connect-src': ['alb.reddit.com', 'pixel-config.reddit.com'], 'img-src': ['alb.reddit.com'] },
    impact: 'Reddit Ads cannot attribute conversions.',
  },
  {
    id: 'microsoft-ads', name: 'Microsoft Advertising (UET)', category: 'marketing', googleTag: false,
    requests: [{ host: /^bat\.bing\.com$/ }],
    cookies: [/^_uetsid$/, /^_uetvid$/, /^MUID$/],
    idFrom: (u) => u.searchParams.get('ti'),
    csp: { 'script-src': ['bat.bing.com'], 'connect-src': ['bat.bing.com'], 'img-src': ['bat.bing.com'] },
    impact: 'Microsoft Advertising cannot attribute conversions.',
  },
  {
    id: 'clarity', name: 'Microsoft Clarity', category: 'analytics', googleTag: false,
    requests: [{ host: /(^|\.)clarity\.ms$/ }],
    cookies: [/^_clck$/, /^_clsk$/, /^CLID$/],
    idFrom: (u) => u.pathname.match(/^\/tag\/(\w+)/)?.[1] ?? null,
    csp: { 'script-src': ['*.clarity.ms'], 'connect-src': ['*.clarity.ms'], 'img-src': ['*.clarity.ms'] },
    impact: 'Clarity records no sessions or heatmaps.',
  },
  {
    // Host and cookie patterns confirmed against pretec.se in Step 4.
    id: 'extellio', name: 'Extellio', category: 'analytics', googleTag: false,
    requests: [{ host: /(^|\.)extellio\.com$/ }],
    cookies: [/^_?extellio/i],
    csp: { 'script-src': ['*.extellio.com'], 'connect-src': ['*.extellio.com'] },
    impact: 'Extellio records no visits.',
  },
  {
    id: 'cloudflare-insights', name: 'Cloudflare Web Analytics', category: 'analytics', googleTag: false,
    requests: [{ host: /^static\.cloudflareinsights\.com$/ }, { host: ANY, path: /^\/cdn-cgi\/rum/ }],
    cookies: [],
    csp: { 'script-src': ['static.cloudflareinsights.com'], 'connect-src': ['cloudflareinsights.com'] },
    impact: 'Cloudflare Web Analytics records no visits.',
  },
  {
    id: 'cortiq', name: 'CortIQ', category: 'analytics', googleTag: false,
    requests: [
      { host: /\.supabase\.co$/, path: /^\/functions\/v1\/(track-event|track-navigation|visitor-identification|link-click-counter|track-web-vitals|ai-bot-tracker|record-conversion|pixel-tracking)/ },
      { host: ANY, path: /\/(cortiq|spa-tracking)(\.min)?\.js$/ },
    ],
    cookies: [/^cortiq_/, /^heatmap_/],
    csp: { 'connect-src': ['*.supabase.co'] },
    impact: 'CortIQ records no visits.',
  },
  // Consent management platforms
  {
    id: 'cookieyes', name: 'CookieYes', category: 'necessary', googleTag: false,
    requests: [{ host: /^(cdn-cookieyes\.com|log\.cookieyes\.com|directory\.cookieyes\.com)$/ }],
    cookies: [/^cookieyes-consent$/],
    csp: { 'script-src': ['cdn-cookieyes.com'], 'connect-src': ['log.cookieyes.com', 'directory.cookieyes.com'] },
    impact: 'The cookie banner does not appear, so consent cannot be collected.',
  },
  {
    id: 'cookiebot', name: 'Cookiebot', category: 'necessary', googleTag: false,
    requests: [{ host: /^(consent|consentcdn|imgsct)\.cookiebot\.com$/ }],
    cookies: [/^CookieConsent$/],
    csp: { 'script-src': ['consent.cookiebot.com', 'consentcdn.cookiebot.com'], 'connect-src': ['consentcdn.cookiebot.com'], 'img-src': ['imgsct.cookiebot.com'] },
    impact: 'The cookie banner does not appear, so consent cannot be collected.',
  },
  {
    id: 'onetrust', name: 'OneTrust', category: 'necessary', googleTag: false,
    requests: [{ host: /^(cdn\.cookielaw\.org|geolocation\.onetrust\.com|cdn-ukwest\.onetrust\.com)$/ }],
    cookies: [/^OptanonConsent$/, /^OptanonAlertBoxClosed$/],
    csp: { 'script-src': ['cdn.cookielaw.org'], 'connect-src': ['geolocation.onetrust.com', 'cdn.cookielaw.org'] },
    impact: 'The cookie banner does not appear, so consent cannot be collected.',
  },
  {
    id: 'complianz', name: 'Complianz', category: 'necessary', googleTag: false,
    requests: [{ host: ANY, path: /\/wp-content\/plugins\/complianz/ }],
    cookies: [/^cmplz_/],
    csp: {},
    impact: 'The cookie banner does not appear, so consent cannot be collected.',
  },
  // Infrastructure that is neither a tag nor an unknown third party
  {
    id: 'google-fonts', name: 'Google Fonts', category: 'necessary', googleTag: false,
    requests: [{ host: /^fonts\.(googleapis|gstatic)\.com$/ }], cookies: [], csp: {},
    impact: 'Web fonts fall back to system fonts.',
  },
  {
    id: 'recaptcha', name: 'Google reCAPTCHA', category: 'necessary', googleTag: false,
    requests: [{ host: /^www\.(google|gstatic)\.com$/, path: /^\/recaptcha\// }], cookies: [], csp: {},
    impact: 'Forms protected by reCAPTCHA cannot be submitted.',
  },
];

// Copied from cookie-scanner's database: cookies with no vendor above.
const FALLBACK_COOKIES: [RegExp, ConsentCategory][] = [
  [/^wordpress_/, 'necessary'], [/^wp-settings-/, 'necessary'], [/^PHPSESSID$/, 'necessary'],
  [/^cookieconsent_status$/, 'preferences'], [/^heatmap_consent$/, 'preferences'],
];

const byId = new Map(TRACKING_VENDORS.map((v) => [v.id, v]));
export const vendorById = (id: string): Vendor | undefined => byId.get(id);

export function vendorForUrl(raw: string): Vendor | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  for (const v of TRACKING_VENDORS) {
    if (v.requests.some((m) => m.host.test(u.hostname) && (!m.path || m.path.test(u.pathname)) && (!m.query || m.query.test(u.search)))) return v;
  }
  return null;
}

export function vendorForName(name: string): Vendor | null {
  return TRACKING_VENDORS.find((v) => v.cookies.some((re) => re.test(name))) ?? null;
}

export function cookieCategory(name: string): ConsentCategory | null {
  return vendorForName(name)?.category ?? FALLBACK_COOKIES.find(([re]) => re.test(name))?.[1] ?? null;
}

export function extractVendorIds(urls: string[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const raw of urls) {
    const v = vendorForUrl(raw);
    if (!v?.idFrom) continue;
    const id = v.idFrom(new URL(raw));
    if (!id) continue;
    if (!out.has(v.id)) out.set(v.id, new Set());
    out.get(v.id)!.add(id);
  }
  return out;
}
```

- [ ] **Step 4: Run the test, then confirm the Extellio patterns**

Run: `node --test tests/foundation/tracking-check-vendors.test.mjs`
Expected: PASS (4 tests).

Then open `https://www.pretec.se/` in Chrome with DevTools → Network, accept cookies, filter on `extellio`. If the request host or cookie names differ from `*.extellio.com` / `extellio*`, update the Extellio entry and add the observed URL to the "classifies request URLs" test cases. Also check HubSpot's current CSP list (knowledge base article "Use Content Security Policy with HubSpot") and Google's tag CSP guide; adjust `csp` domains if they changed.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/tracking-vendors.ts tests/foundation/tracking-check-vendors.test.mjs
git commit -m "feat(tracking-check): vendor registry"
```

---

### Task 4: Fetch probe and CSP helpers

**Files:**
- Create: `supabase/functions/_shared/tracking-check/fetch-probe.ts`
- Test: `tests/foundation/tracking-check-fetch-probe.test.mjs`

**Interfaces:**
- Consumes: `assertSafeUrl`, `Resolver` (Task 2); `FetchObservation`, `RedirectHop`, `BasicAuth`, `TRACKING_TEST_VALUES`, `TRACKING_PARAMS` (Task 2).
- Produces:
  - `interface ProbeOptions { basicAuth?: BasicAuth | null; fetchImpl?: typeof fetch; resolve?: Resolver | null; maxHops?: number }`
  - `safeGet(url: string, opts?: ProbeOptions): Promise<{ hops: RedirectHop[]; finalUrl: string; status: number; headers: Headers; body: string }>` — follows redirects manually, SSRF check per hop, credentials only to the starting origin. Throws on blocked host, timeout or > `maxHops` (default 10).
  - `withTestParams(pageUrl: string): string`
  - `fetchProbe(pageUrl: string, opts?: ProbeOptions): Promise<FetchObservation>` — never throws; errors go in `error`.
  - `parseCsp(header: string | null): Record<string, string[]> | null`
  - `cspAllows(csp: Record<string, string[]>, directive: string, host: string): boolean`

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchProbe, safeGet, parseCsp, cspAllows } from '../../supabase/functions/_shared/tracking-check/fetch-probe.ts';

const resolve = async () => ['93.184.215.14'];
// Fake fetch: routes maps "pathname" -> (url, init) => Response
function fakeFetch(routes, seen = []) {
  return async (url, init) => {
    const u = new URL(url);
    seen.push({ url, auth: init.headers.Authorization ?? null });
    const route = routes[u.origin + u.pathname] ?? routes[u.pathname];
    if (!route) return new Response('not found', { status: 404 });
    return route(u);
  };
}
const redirect = (location, status = 301) => () => new Response(null, { status, headers: { location } });
const ok = (body = '<html></html>', headers = {}) => () => new Response(body, { status: 200, headers });

test('parameters survive a redirect chain that keeps the query string', async () => {
  const obs = await fetchProbe('https://new.example/product/', { resolve, fetchImpl: fakeFetch({
    '/product/': (u) => new Response(null, { status: 301, headers: { location: '/products/' + u.search } }),
    '/products/': ok(),
  }) });
  assert.equal(obs.error, null);
  assert.deepEqual(obs.paramsLost, []);
  assert.deepEqual(obs.hops.map((h) => h.status), [301, 200]);
  assert.equal(obs.finalStatus, 200);
});

test('a 307 trailing-slash redirect that keeps the query still passes', async () => {
  const obs = await fetchProbe('https://new.example/glossary', { resolve, fetchImpl: fakeFetch({
    '/glossary': (u) => new Response(null, { status: 307, headers: { location: '/glossary/' + u.search } }),
    '/glossary/': ok(),
  }) });
  assert.deepEqual(obs.paramsLost, []);
});

test('a redirect that drops the query loses every tracking parameter', async () => {
  const obs = await fetchProbe('https://new.example/old', { resolve, fetchImpl: fakeFetch({ '/old': redirect('/new'), '/new': ok() }) });
  assert.ok(obs.paramsLost.includes('gclid'));
  assert.ok(obs.paramsLost.includes('utm_source'));
});

test('a redirect into private address space is blocked', async () => {
  const obs = await fetchProbe('https://new.example/x', { resolve, fetchImpl: fakeFetch({ '/x': redirect('http://169.254.169.254/latest') }) });
  assert.match(obs.error, /Blocked host/);
});

test('basic auth is only sent to the starting origin', async () => {
  const seen = [];
  await fetchProbe('https://staging.example/a', { resolve, basicAuth: { username: 'u', password: 'p' }, fetchImpl: fakeFetch({
    'https://staging.example/a': redirect('https://cdn.example/b'),
    'https://cdn.example/b': ok(),
  }, seen) });
  assert.match(seen[0].auth, /^Basic /);
  assert.equal(seen[1].auth, null);
});

test('detects bot-protection challenges and redirect loops', async () => {
  const challenge = await fetchProbe('https://new.example/', { resolve, fetchImpl: fakeFetch({ '/': () => new Response('<title>Just a moment...</title>', { status: 403 }) }) });
  assert.equal(challenge.challenge, true);
  const loop = await fetchProbe('https://new.example/a', { resolve, fetchImpl: fakeFetch({ '/a': redirect('/b'), '/b': redirect('/a') }) });
  assert.match(loop.error, /Too many redirects/);
});

test('safeGet returns the body without test parameters', async () => {
  const res = await safeGet('https://new.example/sitemap.xml', { resolve, fetchImpl: fakeFetch({ '/sitemap.xml': ok('<urlset/>') }) });
  assert.equal(res.body, '<urlset/>');
  assert.equal(new URL(res.finalUrl).search, '');
});

test('parses CSP headers and evaluates sources', () => {
  const csp = parseCsp("default-src 'self'; script-src 'self' js.hsforms.net *.googletagmanager.com; connect-src https:");
  assert.deepEqual(csp['script-src'], ["'self'", 'js.hsforms.net', '*.googletagmanager.com']);
  assert.equal(cspAllows(csp, 'script-src', 'js.hsforms.net'), true);
  assert.equal(cspAllows(csp, 'script-src', 'js.hs-scripts.com'), false);
  assert.equal(cspAllows(csp, 'script-src', 'www.googletagmanager.com'), true);
  assert.equal(cspAllows(csp, 'script-src', '*.googletagmanager.com'), true);
  assert.equal(cspAllows(csp, 'connect-src', 'track.hubspot.com'), true);   // https: allows any https host
  assert.equal(cspAllows(csp, 'img-src', 'track.hubspot.com'), false);      // falls back to default-src 'self'
  assert.equal(parseCsp(null), null);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/foundation/tracking-check-fetch-probe.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `fetch-probe.ts`**

```ts
// Browser-less checks: follow redirects hop by hop (SSRF-checked), see whether tracking
// parameters survive, and read the Content-Security-Policy header.
import { assertSafeUrl, type Resolver } from '../safe-url.ts';
import { TRACKING_PARAMS, TRACKING_TEST_VALUES, type BasicAuth, type FetchObservation, type RedirectHop } from './types.ts';

export interface ProbeOptions {
  basicAuth?: BasicAuth | null;
  fetchImpl?: typeof fetch;
  resolve?: Resolver | null;
  maxHops?: number;
}

const USER_AGENT = 'Mozilla/5.0 (compatible; CortIQ-TrackingCheck/1.0)';
const MAX_BODY = 2_000_000;
const CHALLENGE = /cf-chl|challenges\.cloudflare\.com|Just a moment\.\.\.|Attention Required! \| Cloudflare|captcha-delivery\.com|verify you are human/i;

export function withTestParams(pageUrl: string): string {
  const u = new URL(pageUrl);
  for (const [k, v] of Object.entries(TRACKING_TEST_VALUES)) u.searchParams.set(k, v);
  return u.toString();
}

export async function safeGet(url: string, opts: ProbeOptions = {}) {
  const doFetch = opts.fetchImpl ?? fetch;
  const origin = new URL(url).origin;
  const authHeader = opts.basicAuth ? 'Basic ' + btoa(`${opts.basicAuth.username}:${opts.basicAuth.password}`) : null;
  const hops: RedirectHop[] = [];
  let current = url;
  for (let i = 0; i <= (opts.maxHops ?? 10); i++) {
    await assertSafeUrl(current, opts.resolve);
    const headers: Record<string, string> = { 'User-Agent': USER_AGENT };
    if (authHeader && new URL(current).origin === origin) headers.Authorization = authHeader;
    const res = await doFetch(current, { redirect: 'manual', headers, signal: AbortSignal.timeout(8000) });
    hops.push({ url: current, status: res.status });
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel();
      current = new URL(location, current).toString();
      continue;
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    return { hops, finalUrl: current, status: res.status, headers: res.headers, body: new TextDecoder().decode(bytes.slice(0, MAX_BODY)) };
  }
  throw new Error('Too many redirects');
}

export async function fetchProbe(pageUrl: string, opts: ProbeOptions = {}): Promise<FetchObservation> {
  const requestedUrl = withTestParams(pageUrl);
  try {
    const res = await safeGet(requestedUrl, opts);
    const finalUrl = new URL(res.finalUrl);
    return {
      requestedUrl,
      hops: res.hops,
      finalUrl: res.finalUrl,
      finalStatus: res.status,
      paramsLost: TRACKING_PARAMS.filter((p) => !finalUrl.searchParams.has(p)),
      csp: parseCsp(res.headers.get('content-security-policy')),
      challenge: res.headers.get('cf-mitigated') === 'challenge' || ([403, 429, 503].includes(res.status) && CHALLENGE.test(res.body)),
      error: null,
    };
  } catch (e) {
    return { requestedUrl, hops: [], finalUrl: requestedUrl, finalStatus: 0, paramsLost: [], csp: null, challenge: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function parseCsp(header: string | null): Record<string, string[]> | null {
  if (!header) return null;
  const out: Record<string, string[]> = {};
  for (const part of header.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name && !(name.toLowerCase() in out)) out[name.toLowerCase()] = sources;
  }
  return out;
}

/** Does the policy allow `host` for `directive`? `host` may itself be a wildcard like "*.example.com". */
export function cspAllows(csp: Record<string, string[]>, directive: string, host: string): boolean {
  const sources = csp[directive] ?? csp['default-src'];
  if (!sources) return true;
  const want = host.toLowerCase();
  return sources.some((raw) => {
    const src = raw.toLowerCase();
    if (src === '*' || src === 'https:' || src === 'http:') return true;
    if (src.startsWith("'")) return false;
    const s = src.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '');
    if (s === want) return true;
    if (s.startsWith('*.') && !want.startsWith('*.')) return want.endsWith(s.slice(1));
    return false;
  });
}
```

Note: `cspAllows(csp, 'script-src', '*.googletagmanager.com')` is true because the source is exactly `*.googletagmanager.com` (`s === want`).

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/foundation/tracking-check-fetch-probe.test.mjs`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/tracking-check/fetch-probe.ts tests/foundation/tracking-check-fetch-probe.test.mjs
git commit -m "feat(tracking-check): fetch probe with per-hop SSRF checks and CSP helpers"
```

---

### Task 5: Sitemap parsing and page suggestions

**Files:**
- Create: `supabase/functions/_shared/tracking-check/pages.ts`
- Test: `tests/foundation/tracking-check-pages.test.mjs`

**Interfaces:**
- Consumes: `safeGet`, `ProbeOptions` (Task 4).
- Produces:
  - `interface SuggestedPage { path: string; reason: 'home' | 'form' | 'sitemap'; selected: boolean }`
  - `parseSitemap(xml: string): { pages: string[]; sitemaps: string[] }`
  - `fetchSitemapUrls(origin: string, opts?: ProbeOptions): Promise<string[]>` — tries `/sitemap.xml`, `/sitemap_index.xml`, `/wp-sitemap.xml`; follows an index to at most 5 child sitemaps; max 5000 URLs; returns `[]` when nothing is found.
  - `suggestPages(urls: string[], origin: string, limit?: number): SuggestedPage[]` — `/` first, then likely form pages, then shallow pages; `selected` true for the first `limit` (default 12); max 200 entries; ignores other hosts (treats `www.` as the same host).

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSitemap, suggestPages, fetchSitemapUrls } from '../../supabase/functions/_shared/tracking-check/pages.ts';

test('parses url sets and sitemap indexes', () => {
  assert.deepEqual(parseSitemap('<urlset><url><loc> https://a.example/x?a=1&amp;b=2 </loc></url></urlset>'),
    { pages: ['https://a.example/x?a=1&b=2'], sitemaps: [] });
  assert.deepEqual(parseSitemap('<sitemapindex><sitemap><loc>https://a.example/s1.xml</loc></sitemap></sitemapindex>'),
    { pages: [], sitemaps: ['https://a.example/s1.xml'] });
});

test('suggests home, then form pages, then shallow pages, capped by limit', () => {
  const urls = ['https://www.a.example/blog/2020/long-post/', 'https://a.example/pricing/', 'https://a.example/about/',
    'https://a.example/get-started/', 'https://other.example/contact/', 'https://a.example/blog/'];
  const pages = suggestPages(urls, 'https://a.example', 4);
  assert.deepEqual(pages.map((p) => p.path), ['/', '/pricing/', '/get-started/', '/blog/', '/about/', '/blog/2020/long-post/']);
  assert.deepEqual(pages.filter((p) => p.selected).map((p) => p.path), ['/', '/pricing/', '/get-started/', '/blog/']);
  assert.equal(pages[1].reason, 'form');
  assert.ok(!pages.some((p) => p.path === '/contact/'), 'other hosts are ignored');
});

test('follows a sitemap index and tolerates missing sitemaps', async () => {
  const fetchImpl = async (url) => {
    const p = new URL(url).pathname;
    if (p === '/sitemap.xml') return new Response('<sitemapindex><sitemap><loc>https://a.example/s1.xml</loc></sitemap></sitemapindex>');
    if (p === '/s1.xml') return new Response('<urlset><url><loc>https://a.example/pricing/</loc></url></urlset>');
    return new Response('', { status: 404 });
  };
  assert.deepEqual(await fetchSitemapUrls('https://a.example', { fetchImpl, resolve: async () => ['93.184.215.14'] }), ['https://a.example/pricing/']);
  const none = async () => new Response('', { status: 404 });
  assert.deepEqual(await fetchSitemapUrls('https://a.example', { fetchImpl: none, resolve: async () => ['93.184.215.14'] }), []);
});
```

Note: the ordering in the second test — `/blog/` (depth 1, length 6) sorts before `/about/` (depth 1, length 7).

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/foundation/tracking-check-pages.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `pages.ts`**

```ts
// Page suggestions for a new run, from the site's sitemap.
import { safeGet, type ProbeOptions } from './fetch-probe.ts';

export interface SuggestedPage { path: string; reason: 'home' | 'form' | 'sitemap'; selected: boolean }

const FORM_HINT = /(contact|kontakt|demo|get-started|trial|signup|sign-up|register|quote|offert|pricing|price|priser|book|boka|request)/i;
const CANDIDATES = ['/sitemap.xml', '/sitemap_index.xml', '/wp-sitemap.xml'];

export function parseSitemap(xml: string): { pages: string[]; sitemaps: string[] } {
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].replace(/&amp;/g, '&'));
  return /<sitemapindex/i.test(xml) ? { pages: [], sitemaps: locs } : { pages: locs, sitemaps: [] };
}

export async function fetchSitemapUrls(origin: string, opts: ProbeOptions = {}): Promise<string[]> {
  const get = async (url: string) => {
    try {
      const res = await safeGet(url, opts);
      return res.status === 200 ? res.body : null;
    } catch { return null; }
  };
  for (const candidate of CANDIDATES) {
    const xml = await get(new URL(candidate, origin).toString());
    if (!xml || !/<(urlset|sitemapindex)/i.test(xml)) continue;
    const first = parseSitemap(xml);
    const urls = [...first.pages];
    for (const child of first.sitemaps.slice(0, 5)) {
      const childXml = await get(child);
      if (childXml) urls.push(...parseSitemap(childXml).pages);
      if (urls.length >= 5000) break;
    }
    return urls.slice(0, 5000);
  }
  return [];
}

const bareHost = (h: string) => h.toLowerCase().replace(/^www\./, '');
const depth = (p: string) => p.split('/').filter(Boolean).length;
const byDepthThenLength = (a: string, b: string) => depth(a) - depth(b) || a.length - b.length || a.localeCompare(b);

export function suggestPages(urls: string[], origin: string, limit = 12): SuggestedPage[] {
  const host = bareHost(new URL(origin).hostname);
  const paths = new Set<string>();
  for (const raw of urls) {
    try {
      const u = new URL(raw);
      if (bareHost(u.hostname) === host && u.pathname !== '/') paths.add(u.pathname);
    } catch { /* skip malformed entries */ }
  }
  const all = [...paths];
  const ordered = [
    ...all.filter((p) => FORM_HINT.test(p)).sort(byDepthThenLength).map((path) => ({ path, reason: 'form' as const })),
    ...all.filter((p) => !FORM_HINT.test(p)).sort(byDepthThenLength).map((path) => ({ path, reason: 'sitemap' as const })),
  ];
  return [{ path: '/', reason: 'home' as const }, ...ordered]
    .slice(0, 200)
    .map((p, i) => ({ ...p, selected: i < limit }));
}
```

Check against the test: form pages sorted by depth then length → `/pricing/` (9) before `/get-started/` (13). Then sitemap pages: `/blog/`, `/about/`, `/blog/2020/long-post/`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/foundation/tracking-check-pages.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/tracking-check/pages.ts tests/foundation/tracking-check-pages.test.mjs
git commit -m "feat(tracking-check): sitemap parsing and page suggestions"
```

---

### Task 6: Assess — helpers, coverage, parameters, legacy redirects

**Files:**
- Create: `supabase/functions/_shared/tracking-check/instructions.ts`
- Create: `supabase/functions/_shared/tracking-check/assess/util.ts`
- Create: `supabase/functions/_shared/tracking-check/assess/parameters.ts`
- Create: `supabase/functions/_shared/tracking-check/assess/index.ts`
- Create: `tests/foundation/tracking-check-fixtures.mjs`
- Test: `tests/foundation/tracking-check-assess-parameters.test.mjs`

**Interfaces:**
- Consumes: types (Task 2), `vendorForUrl`, `Vendor` (Task 3).
- Produces (later tasks import these exact names):
  - `util.ts`: `isTestable(page: PageObservation): boolean`, `testablePages(site: SiteObservation): PageObservation[]` (non-legacy, testable), `stateOf(page, state: ConsentState): StateObservation | undefined`, `requestVendors(st: StateObservation): Map<string, Vendor>`, `attemptedVendors(site: SiteObservation): Map<string, { vendor: Vendor; pages: Set<string> }>` (requests + CSP violations, all states, testable pages), `allRequestUrls(site): string[]`, `stripQueryValues(url: string): string`, `plural(n: number, one: string, many: string): string`, `finding(f: Omit<Finding, 'evidence'> & { evidence?: Partial<Finding['evidence']> }): Finding`, `siteKey(host: string): string`, `fullLoadReliable(site): boolean`.
  - `instructions.ts`: `MANUAL_STEPS: { generic: string; reject: string; granular: string; tags: string }`.
  - `parameters.ts`: `assessCoverage(input: AssessInput): Finding[]`, `assessParameters(input: AssessInput): Finding[]`.
  - `assess/index.ts`: `assess(input: AssessInput): Finding[]` — concatenates modules and sorts by status (fail, warning, manual, untestable, pass) then priority (high, medium, low, none).
  - Fixture builders in `tracking-check-fixtures.mjs`: `fetchOk(path, extra?)`, `st(state, extra?)`, `page(path, opts?)`, `site(role, pages)`, `req(url)`, `POLICY`.

- [ ] **Step 1: Write the fixtures**

`tests/foundation/tracking-check-fixtures.mjs`:

```js
// Builders for Tracking Check observations used by the assess tests.
export const req = (url, type = 'script') => ({ url, type });

export const fetchOk = (path, extra = {}) => ({
  requestedUrl: `https://new.example${path}?gclid=TC_GCLID_TEST`,
  hops: [{ url: `https://new.example${path}?gclid=TC_GCLID_TEST`, status: 200 }],
  finalUrl: `https://new.example${path}?gclid=TC_GCLID_TEST`,
  finalStatus: 200, paramsLost: [], csp: null, challenge: false, error: null, ...extra,
});

export const st = (state, extra = {}) => ({
  state, method: state === 'none' ? 'not_needed' : 'adapter',
  requests: [], cookies: [], storageKeys: [], cspViolations: [], consentCommands: [],
  enhancedConversions: false, challenge: false, error: null, ...extra,
});

/** opts.states: array of st(...) (default none/reject/accept with no activity); null = no browser observation. */
export const page = (path, { fetch, states, forms = [], legacy = false, failed = null, cmp = 'cookieyes' } = {}) => ({
  path, legacy, failed,
  fetch: fetch === undefined ? fetchOk(path) : fetch,
  browser: states === null || legacy ? null : { url: `https://new.example${path}`, cmp, states: states ?? [st('none'), st('reject'), st('accept')], forms },
});

export const site = (role, pages) => ({ role, origin: role === 'baseline' ? 'https://old.example' : 'https://new.example', pages });

export const POLICY = {
  noGoogleBeforeConsent: true, consentDefaultsDenied: true, ga4RequiresAnalytics: true, adsRequiresMarketing: true,
  enhancedConversionsOff: true, noUnknownVendorsAfterReject: true, expectedIds: [], manualItems: [],
};
```

- [ ] **Step 2: Write the failing test**

`tests/foundation/tracking-check-assess-parameters.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assess } from '../../supabase/functions/_shared/tracking-check/assess/index.ts';
import { stripQueryValues } from '../../supabase/functions/_shared/tracking-check/assess/util.ts';
import { fetchOk, page, site } from './tracking-check-fixtures.mjs';

const run = (targetPages, mode = 'comparison') => assess({ mode, target: site('target', targetPages), baseline: mode === 'comparison' ? site('baseline', []) : null, policy: null });
const byKey = (findings, key) => findings.filter((f) => f.checkKey === key);

test('parameters pass when every page keeps them', () => {
  const [f] = byKey(run([page('/'), page('/pricing/')]), 'params.survive');
  assert.equal(f.status, 'pass');
  assert.match(f.title, /all 2 tested pages/);
});

test('parameters fail and name the lost parameters per page', () => {
  const [f] = byKey(run([page('/'), page('/pricing/', { fetch: fetchOk('/pricing/', { paramsLost: ['gclid', 'utm_source'] }) })]), 'params.survive');
  assert.equal(f.status, 'fail');
  assert.equal(f.priority, 'high');
  assert.deepEqual(f.evidence.pages, ['/pricing/']);
  assert.match(f.evidence.details[0], /gclid, utm_source/);
});

test('legacy URLs: error is a fail, 302/307 or long chains are warnings, single 301 passes', () => {
  const hops = (...codes) => codes.map((status, i) => ({ url: `https://new.example/h${i}?gclid=SECRET`, status }));
  const legacy = (path, codes) => page(path, { legacy: true, fetch: fetchOk(path, { hops: hops(...codes), finalStatus: codes.at(-1) }) });
  const findings = run([page('/'), legacy('/gone/', [301, 404]), legacy('/temp/', [302, 200]), legacy('/chain/', [301, 301, 301, 200]), legacy('/fine/', [301, 200])]);
  assert.equal(byKey(findings, 'redirects.legacy')[0].status, 'fail');
  assert.deepEqual(byKey(findings, 'redirects.legacy')[0].evidence.pages, ['/gone/']);
  const quality = byKey(findings, 'redirects.legacy_quality')[0];
  assert.equal(quality.status, 'warning');
  assert.deepEqual(quality.evidence.pages, ['/temp/', '/chain/']);
  assert.ok(!quality.evidence.details.join(' ').includes('SECRET'), 'evidence must not contain parameter values');
});

test('legacy redirect checks only run in comparison mode', () => {
  const findings = run([page('/'), page('/old/', { legacy: true })], 'policy');
  assert.equal(byKey(findings, 'redirects.legacy').length + byKey(findings, 'redirects.legacy_quality').length, 0);
});

test('challenge, 401 and failed pages are untestable and excluded from other checks', () => {
  const findings = run([
    page('/a/', { fetch: fetchOk('/a/', { challenge: true, paramsLost: ['gclid'] }) }),
    page('/b/', { fetch: fetchOk('/b/', { finalStatus: 401, paramsLost: ['gclid'] }) }),
    page('/c/', { failed: 'Browserless 500' }),
  ]);
  const [coverage] = byKey(findings, 'coverage.untestable');
  assert.equal(coverage.status, 'untestable');
  assert.deepEqual(coverage.evidence.pages, ['new /a/', 'new /b/', 'new /c/']);
  assert.equal(byKey(findings, 'params.survive').length, 0, 'no pass or fail from untestable pages');
});

test('findings are sorted fail, warning, manual, untestable, pass', () => {
  const findings = run([page('/'), page('/x/', { failed: 'boom' }), page('/old/', { legacy: true, fetch: fetchOk('/old/', { hops: [{ url: 'https://new.example/old/', status: 404 }], finalStatus: 404 }) })]);
  const order = { fail: 0, warning: 1, manual: 2, untestable: 3, pass: 4 };
  const ranks = findings.map((f) => order[f.status]);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
});

test('stripQueryValues keeps parameter names only', () => {
  assert.equal(stripQueryValues('https://s.example/p?token=abc&gclid=1&token=2'), 'https://s.example/p?token&gclid');
  assert.equal(stripQueryValues('https://s.example/p'), 'https://s.example/p');
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `node --test tests/foundation/tracking-check-assess-parameters.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 4: Write `instructions.ts`**

```ts
// Step-by-step instructions shown on manual and untestable findings.
export const MANUAL_STEPS = {
  generic:
    'Open the page in Chrome with Tag Assistant (tagassistant.google.com) connected, or with DevTools open. ' +
    '1) Network tab: check which tracking requests are sent. 2) Console: look for "Content Security Policy" errors. ' +
    '3) Application → Cookies: check which cookies are set. Repeat in a fresh incognito window after accepting, and again after rejecting, cookies.',
  reject:
    'Open the page in a fresh incognito window with DevTools → Network open. Click the cookie banner\'s reject option, then reload. ' +
    'Filter the Network tab for google, facebook, hubspot, linkedin and other tracking domains: there should be no requests. ' +
    'Application → Cookies should show no analytics or marketing cookies.',
  granular:
    'In a fresh incognito window, accept only the Statistics/Analytics category and reload. Google Analytics requests (google-analytics.com/g/collect) may appear; ' +
    'Google Ads requests (googleads.g.doubleclick.net, google.com/pagead, google.com/ccm) must not. Repeat with only Marketing accepted: Google Analytics requests must not appear.',
  tags:
    'Open both sites with Tag Assistant connected and accept cookies. Compare the Google tags listed for each site. ' +
    'For other tools, compare DevTools → Network requests to the vendor domains on both sites.',
};
```

- [ ] **Step 5: Write `assess/util.ts`**

```ts
import type { ConsentState, Finding, PageObservation, SiteObservation, StateObservation } from '../types.ts';
import { vendorForUrl, type Vendor } from '../../tracking-vendors.ts';

export function isTestable(page: PageObservation): boolean {
  if (page.failed) return false;
  const f = page.fetch;
  if (f && (f.error || f.challenge || f.finalStatus === 401)) return false;
  if (page.browser && page.browser.states.some((s) => s.challenge || s.error)) return false;
  return true;
}

export const testablePages = (site: SiteObservation): PageObservation[] => site.pages.filter((p) => !p.legacy && isTestable(p));

export const stateOf = (page: PageObservation, state: ConsentState): StateObservation | undefined =>
  page.browser?.states.find((s) => s.state === state);

export function requestVendors(st: StateObservation): Map<string, Vendor> {
  const out = new Map<string, Vendor>();
  for (const r of st.requests) {
    const v = vendorForUrl(r.url);
    if (v) out.set(v.id, v);
  }
  return out;
}

/** Vendors that loaded or tried to load (blocked by CSP) in any state on any testable page. */
export function attemptedVendors(site: SiteObservation): Map<string, { vendor: Vendor; pages: Set<string> }> {
  const out = new Map<string, { vendor: Vendor; pages: Set<string> }>();
  for (const p of testablePages(site)) {
    for (const st of p.browser?.states ?? []) {
      const urls = [...st.requests.map((r) => r.url), ...st.cspViolations.map((v) => v.blockedUrl)];
      for (const url of urls) {
        const v = vendorForUrl(url);
        if (!v) continue;
        if (!out.has(v.id)) out.set(v.id, { vendor: v, pages: new Set() });
        out.get(v.id)!.pages.add(p.path);
      }
    }
  }
  return out;
}

export function allRequestUrls(site: SiteObservation): string[] {
  return testablePages(site).flatMap((p) => (p.browser?.states ?? []).flatMap((s) => s.requests.map((r) => r.url)));
}

/** True when at least one testable page was observed with all cookies accepted (or had no banner). */
export function fullLoadReliable(site: SiteObservation): boolean {
  return testablePages(site).some((p) => {
    const a = stateOf(p, 'accept');
    return !!a && a.method !== 'not_automated';
  });
}

export function stripQueryValues(url: string): string {
  try {
    const u = new URL(url);
    const names = [...new Set(u.searchParams.keys())];
    return u.origin + u.pathname + (names.length ? '?' + names.join('&') : '');
  } catch {
    return url.replace(/=[^&\s]*/g, '');
  }
}

export const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export function finding(f: Omit<Finding, 'evidence'> & { evidence?: Partial<Finding['evidence']> }): Finding {
  return { ...f, evidence: { pages: f.evidence?.pages ?? [], details: f.evidence?.details ?? [] } };
}

const SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'ac', 'gov', 'edu']);
/** Approximate registrable domain: "www.shop.example.co.uk" → "example.co.uk". */
export function siteKey(host: string): string {
  const labels = host.toLowerCase().split('.');
  const n = labels.length >= 3 && labels.at(-1)!.length === 2 && SECOND_LEVEL.has(labels.at(-2)!) ? 3 : 2;
  return labels.slice(-n).join('.');
}
```

- [ ] **Step 6: Write `assess/parameters.ts`**

```ts
import type { AssessInput, Finding, PageObservation, SiteObservation } from '../types.ts';
import { MANUAL_STEPS } from '../instructions.ts';
import { finding, isTestable, plural, stripQueryValues } from './util.ts';

function untestableReason(p: PageObservation): string {
  if (p.failed) return p.failed;
  if (p.fetch?.error) return p.fetch.error;
  if (p.fetch?.challenge) return 'bot protection challenge';
  if (p.fetch?.finalStatus === 401) return 'password required (basic auth missing, wrong or expired)';
  const st = p.browser?.states.find((s) => s.challenge || s.error);
  return st?.challenge ? 'bot protection challenge in the browser' : st?.error ?? 'unknown error';
}

export function assessCoverage({ target, baseline }: AssessInput): Finding[] {
  const sites = [target, baseline].filter((s): s is SiteObservation => !!s);
  const bad = sites.flatMap((s) => s.pages.filter((p) => !isTestable(p)).map((p) => ({ s, p })));
  if (!bad.length) return [];
  return [finding({
    scope: 'Coverage', checkKey: 'coverage.untestable', status: 'untestable', priority: 'medium',
    title: `${plural(bad.length, 'page', 'pages')} could not be tested automatically`,
    explanation: 'These pages blocked the automated browser (bot protection or a login), timed out or returned an error. They are left out of every other check in this report.',
    fix: MANUAL_STEPS.generic, typicalOwner: 'developer',
    evidence: {
      pages: bad.map(({ s, p }) => `${s.role === 'baseline' ? 'current' : 'new'} ${p.path}`),
      details: bad.map(({ p }) => `${p.path}: ${untestableReason(p)}`),
    },
  })];
}

export function assessParameters({ mode, target }: AssessInput): Finding[] {
  const out: Finding[] = [];
  const probed = target.pages.filter((p) => p.fetch && isTestable(p));
  if (probed.length) {
    const lost = probed.filter((p) => p.fetch!.paramsLost.length);
    out.push(lost.length
      ? finding({
        scope: 'Parameters', checkKey: 'params.survive', status: 'fail', priority: 'high',
        title: `Ad and campaign parameters are lost on ${plural(lost.length, 'page', 'pages')}`,
        explanation: 'UTM parameters and click IDs (gclid, gbraid, wbraid, fbclid, msclkid) are removed before the page loads. Analytics and ad platforms then cannot attribute the visit to the campaign or ad click.',
        fix: 'Keep the query string on every redirect, and remove tracking parameters from any URL-cleaning or "noise parameter" list.',
        typicalOwner: 'developer',
        evidence: { pages: lost.map((p) => p.path), details: lost.map((p) => `${p.path}: lost ${p.fetch!.paramsLost.join(', ')}`) },
      })
      : finding({
        scope: 'Parameters', checkKey: 'params.survive', status: 'pass', priority: null,
        title: `Ad and campaign parameters survive on all ${plural(probed.length, 'tested page', 'tested pages')}`,
        explanation: 'UTM parameters and click IDs stay in the URL, including through redirects.',
        fix: '', typicalOwner: null, evidence: { pages: probed.map((p) => p.path) },
      }));
  }
  if (mode === 'comparison') out.push(...assessLegacyRedirects(target));
  return out;
}

function assessLegacyRedirects(target: SiteObservation): Finding[] {
  const legacy = target.pages.filter((p) => p.legacy && p.fetch && isTestable(p));
  if (!legacy.length) return [];
  const chain = (p: PageObservation) => p.fetch!.hops.map((h) => `${h.status} ${stripQueryValues(h.url)}`).join(' → ');
  const broken = legacy.filter((p) => p.fetch!.finalStatus >= 400);
  const weak = legacy.filter((p) => {
    if (p.fetch!.finalStatus >= 400) return false;
    const redirects = p.fetch!.hops.slice(0, -1);
    return redirects.length === 0 || redirects.length > 2 || redirects.some((h) => h.status !== 301 && h.status !== 308);
  });
  const out: Finding[] = [];
  if (broken.length) out.push(finding({
    scope: 'Parameters', checkKey: 'redirects.legacy', status: 'fail', priority: 'high',
    title: `${plural(broken.length, 'old URL returns', 'old URLs return')} an error on the new site`,
    explanation: 'Visitors and ads that use these old URLs land on an error page, and search engines drop them.',
    fix: 'Add a permanent (301) redirect from each old URL to its new equivalent, keeping the query string.',
    typicalOwner: 'developer', evidence: { pages: broken.map((p) => p.path), details: broken.map((p) => `${p.path}: ${chain(p)}`) },
  }));
  if (weak.length) out.push(finding({
    scope: 'Parameters', checkKey: 'redirects.legacy_quality', status: 'warning', priority: 'medium',
    title: `${plural(weak.length, 'old URL does', 'old URLs do')} not use a single permanent redirect`,
    explanation: 'Temporary redirects (302/307), chains of several redirects or old URLs that no longer redirect weaken search signals and slow the first page view.',
    fix: 'Use one permanent (301 or 308) redirect straight to the final URL.',
    typicalOwner: 'developer', evidence: { pages: weak.map((p) => p.path), details: weak.map((p) => `${p.path}: ${chain(p)}`) },
  }));
  if (!out.length) out.push(finding({
    scope: 'Parameters', checkKey: 'redirects.legacy', status: 'pass', priority: null,
    title: `All ${plural(legacy.length, 'old URL redirects', 'old URLs redirect')} permanently to a working page`,
    explanation: 'Each old URL uses one permanent redirect to a page that loads.', fix: '', typicalOwner: null,
    evidence: { pages: legacy.map((p) => p.path) },
  }));
  return out;
}
```

- [ ] **Step 7: Write `assess/index.ts`**

```ts
import type { AssessInput, Finding, FindingStatus, Priority } from '../types.ts';
import { assessCoverage, assessParameters } from './parameters.ts';

const STATUS_ORDER: Record<FindingStatus, number> = { fail: 0, warning: 1, manual: 2, untestable: 3, pass: 4 };
const PRIORITY_ORDER: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

export function assess(input: AssessInput): Finding[] {
  const findings = [
    ...assessCoverage(input),
    ...assessParameters(input),
  ];
  return findings
    .map((f, i) => ({ f, i }))
    .sort((a, b) => STATUS_ORDER[a.f.status] - STATUS_ORDER[b.f.status]
      || (a.f.priority ? PRIORITY_ORDER[a.f.priority] : 3) - (b.f.priority ? PRIORITY_ORDER[b.f.priority] : 3)
      || a.i - b.i)
    .map(({ f }) => f);
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `node --test tests/foundation/tracking-check-assess-parameters.test.mjs`
Expected: PASS (7 tests).

- [ ] **Step 9: Commit**

```bash
git add supabase/functions/_shared/tracking-check/instructions.ts supabase/functions/_shared/tracking-check/assess tests/foundation/tracking-check-fixtures.mjs tests/foundation/tracking-check-assess-parameters.test.mjs
git commit -m "feat(tracking-check): assess coverage, parameters and legacy redirects"
```

---

### Task 7: Assess — tags, IDs, CSP, forms

**Files:**
- Create: `supabase/functions/_shared/form-detection.ts`
- Modify: `supabase/functions/_shared/tracking-check/types.ts` (`FormHit` gains `method`)
- Modify: `supabase/functions/form-detector/index.ts` (HubSpot + Gravity Forms blocks use `detectForms`)
- Create: `supabase/functions/_shared/tracking-check/assess/tags.ts`
- Modify: `supabase/functions/_shared/tracking-check/assess/index.ts`
- Test: `tests/foundation/tracking-check-assess-tags.test.mjs`

**Interfaces:**
- Consumes: util helpers, `MANUAL_STEPS` (Task 6); `vendorForUrl`, `vendorById`, `extractVendorIds`, `Vendor`, `CspDirective` (Task 3); `cspAllows` (Task 4).
- Produces:
  - `FormHit { provider: 'hubspot' | 'gravity_forms'; formId: string; method: 'hs_context' | 'data_form_id' | 'embed_script' | 'gravity_class' }`
  - `detectForms(html: string): FormHit[]` (deduplicated by provider + formId)
  - `assessTags(input): Finding[]`, `assessCsp(input): Finding[]`, `assessForms(input): Finding[]`
  - `cspFixLines(vendor: Vendor, csp: Record<string, string[]> | null, extra?: Map<string, Set<string>>): string[]` — e.g. `["script-src: add js.hs-scripts.com js.hs-analytics.net", "connect-src: add *.hubspot.com"]`; only domains the policy does not already allow.

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assess } from '../../supabase/functions/_shared/tracking-check/assess/index.ts';
import { detectForms } from '../../supabase/functions/_shared/form-detection.ts';
import { fetchOk, page, site, st, req, POLICY } from './tracking-check-fixtures.mjs';

const HS = 'https://js.hs-scripts.com/7117856.js';
const GA = 'https://www.googletagmanager.com/gtag/js?id=G-6J9DFZLXNL';
const acceptWith = (...urls) => [st('none'), st('reject'), st('accept', { requests: urls.map((u) => req(u)) })];
const compare = (basePages, targetPages) => assess({ mode: 'comparison', baseline: site('baseline', basePages), target: site('target', targetPages), policy: null });
const byKey = (findings, key) => findings.filter((f) => f.checkKey === key);

test('Paligo case: HubSpot missing on the new site, and its CSP would block it', () => {
  const csp = { 'script-src': ["'self'", 'js.hsforms.net'], 'connect-src': ["'self'", 'forms.hsforms.com'] };
  const findings = compare(
    [page('/pricing/', { states: acceptWith(HS, GA) })],
    [page('/pricing/', { states: acceptWith(GA), fetch: fetchOk('/pricing/', { csp }) })],
  );
  const [missing] = byKey(findings, 'tags.missing.hubspot');
  assert.equal(missing.status, 'fail');
  assert.equal(missing.priority, 'high');
  assert.match(missing.explanation, /Original Source/);
  assert.match(missing.fix, /script-src: add js\.hs-scripts\.com/);
  assert.equal(byKey(findings, 'tags.missing.ga4').length, 0);
});

test('tools only on the new site are warnings; all present gives a pass', () => {
  const findings = compare([page('/', { states: acceptWith(GA) })], [page('/', { states: acceptWith(GA, HS) })]);
  assert.equal(byKey(findings, 'tags.new.hubspot')[0].status, 'warning');
  assert.equal(byKey(findings, 'tags.present')[0].status, 'pass');
});

test('missing consented tags are manual, not fail, when accept could not be automated', () => {
  const notAutomated = [st('none'), st('reject', { method: 'not_automated' }), st('accept', { method: 'not_automated' })];
  const findings = compare([page('/', { states: acceptWith(HS) })], [page('/', { states: notAutomated })]);
  assert.equal(byKey(findings, 'tags.missing.hubspot')[0].status, 'manual');
});

test('a different ID for the same tool is a fail', () => {
  const findings = compare([page('/', { states: acceptWith(GA) })], [page('/', { states: acceptWith('https://www.googletagmanager.com/gtag/js?id=G-OTHER') })]);
  const [ids] = byKey(findings, 'tags.ids.ga4');
  assert.equal(ids.status, 'fail');
  assert.match(ids.evidence.details[0], /G-6J9DFZLXNL/);
});

test('policy expected IDs: a missing ID fails, all found passes', () => {
  const run = (expectedIds) => assess({ mode: 'policy', baseline: null, policy: { ...POLICY, expectedIds },
    target: site('target', [page('/', { states: acceptWith(GA) })]) });
  const partial = run(['G-6J9DFZLXNL', 'AW-18424645060']);
  assert.equal(byKey(partial, 'tags.expected.AW-18424645060')[0].status, 'fail');
  assert.equal(byKey(partial, 'tags.expected').length, 0, 'no pass while an ID is missing');
  assert.equal(byKey(run(['g-6j9dfzlxnl']), 'tags.expected')[0].status, 'pass');
});

test('CSP violations name the vendor and the exact directive to extend', () => {
  const states = [st('none'), st('reject'), st('accept', { cspViolations: [{ blockedUrl: HS, directive: 'script-src-elem' }, { blockedUrl: 'https://cdn.unknown.example/x.js', directive: 'script-src' }] })];
  const findings = assess({ mode: 'policy', baseline: null, policy: POLICY, target: site('target', [page('/pricing/', { states })]) });
  const [blocked] = byKey(findings, 'csp.blocked.hubspot');
  assert.equal(blocked.status, 'fail');
  assert.match(blocked.fix, /script-src: add .*js\.hs-scripts\.com/);
  assert.equal(byKey(findings, 'csp.blocked.host.cdn.unknown.example')[0].status, 'warning');
});

test('no CSP violations gives a pass', () => {
  const findings = assess({ mode: 'policy', baseline: null, policy: POLICY, target: site('target', [page('/')]) });
  assert.equal(byKey(findings, 'csp.ok')[0].status, 'pass');
});

test('forms from the current site missing on the new site fail', () => {
  const guid = '11111111-2222-3333-4444-555555555555';
  const findings = compare(
    [page('/get-started/', { forms: [{ provider: 'hubspot', formId: guid, method: 'data_form_id' }] })],
    [page('/get-started/', { forms: [] })],
  );
  const [f] = byKey(findings, 'forms.missing');
  assert.equal(f.status, 'fail');
  assert.match(f.evidence.details[0], new RegExp(guid));
});

test('detectForms finds HubSpot (attribute, hs_context, embed script) and Gravity Forms', () => {
  const g1 = 'aaaaaaaa-1111-2222-3333-444444444444', g2 = 'bbbbbbbb-1111-2222-3333-444444444444', g3 = 'cccccccc-1111-2222-3333-444444444444';
  const html = `<form data-form-id="${g1}"></form>
    <input name="hs_context" value="${encodeURIComponent(JSON.stringify({ formGuid: g2 }))}">
    <script>hbspt.forms.create({ portalId: "7117856", formId: "${g3}" });</script>
    <div class="gform_wrapper" id="gform_wrapper_4"></div><form data-form-id="${g1}"></form>`;
  assert.deepEqual(detectForms(html).map((f) => `${f.provider}:${f.formId}:${f.method}`).sort(), [
    `gravity_forms:4:gravity_class`, `hubspot:${g1}:data_form_id`, `hubspot:${g2}:hs_context`, `hubspot:${g3}:embed_script`,
  ].sort());
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/foundation/tracking-check-assess-tags.test.mjs`
Expected: FAIL — module `form-detection.ts` not found.

- [ ] **Step 3: Update `FormHit` in `types.ts`**

Replace the `FormHit` line with:

```ts
export interface FormHit {
  provider: 'hubspot' | 'gravity_forms';
  formId: string;
  method: 'hs_context' | 'data_form_id' | 'embed_script' | 'gravity_class';
}
```

- [ ] **Step 4: Write `form-detection.ts`**

```ts
// Form discovery from HTML, shared by form-detector and Tracking Check.
import type { FormHit } from './tracking-check/types.ts';

const GUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

export function detectForms(html: string): FormHit[] {
  const hits = new Map<string, FormHit>();
  const add = (hit: FormHit) => { const key = `${hit.provider}:${hit.formId}`; if (!hits.has(key)) hits.set(key, hit); };

  for (const m of html.matchAll(/name=["']hs_context["'][^>]*value=["']([^"']+)["']/gi)) {
    try {
      const ctx = JSON.parse(decodeURIComponent(m[1]));
      if (typeof ctx.formGuid === 'string') add({ provider: 'hubspot', formId: ctx.formGuid, method: 'hs_context' });
    } catch { /* not JSON */ }
  }
  for (const m of html.matchAll(new RegExp(`data-form-id=["'](${GUID})["']`, 'gi'))) {
    add({ provider: 'hubspot', formId: m[1].toLowerCase(), method: 'data_form_id' });
  }
  for (const m of html.matchAll(new RegExp(`formId["']?\\s*:\\s*["'](${GUID})["']`, 'gi'))) {
    add({ provider: 'hubspot', formId: m[1].toLowerCase(), method: 'embed_script' });
  }
  for (const m of html.matchAll(/class=["'][^"']*gform_wrapper[^"']*["'][^>]*id=["'][^"']*gform_wrapper_(\d+)/gi)) {
    add({ provider: 'gravity_forms', formId: m[1], method: 'gravity_class' });
  }
  return [...hits.values()];
}
```

- [ ] **Step 5: Use `detectForms` in `form-detector`**

In `supabase/functions/form-detector/index.ts`, add the import `import { detectForms } from '../_shared/form-detection.ts';` and replace the three blocks from `// Detect HubSpot forms — look for hs_context…` through the end of the Gravity Forms block (the `if (gfMatches) { … }` closing brace, just before `// Detektera Contact Form 7`) with:

```ts
    // HubSpot and Gravity Forms detection is shared with Tracking Check.
    const METHOD_LABEL = { hs_context: 'hs_context_scan', data_form_id: 'data-form-id_scan', embed_script: 'embed_script_scan', gravity_class: 'gravity_class_scan' } as const;
    for (const hit of detectForms(html)) {
      const isHubSpot = hit.provider === 'hubspot';
      const formId = isHubSpot ? hit.formId : `gf_${hit.formId}`;
      detectedForms.push({
        form_id: formId,
        form_guid: formId,
        form_name: isHubSpot ? `HubSpot Form (${hit.formId.slice(0, 8)}...)` : `Gravity Form ${hit.formId}`,
        form_type: isHubSpot ? 'hubspot' : 'gravity',
        form_url: url,
        site_id: siteId,
        detection_method: METHOD_LABEL[hit.method],
        last_detected: new Date().toISOString(),
      });
    }
```

- [ ] **Step 6: Write `assess/tags.ts`**

```ts
import type { AssessInput, Finding, FormHit, SiteObservation } from '../types.ts';
import { vendorForUrl, extractVendorIds, vendorById, type CspDirective, type Vendor } from '../../tracking-vendors.ts';
import { cspAllows } from '../fetch-probe.ts';
import { MANUAL_STEPS } from '../instructions.ts';
import { allRequestUrls, attemptedVendors, finding, fullLoadReliable, plural, testablePages } from './util.ts';

const firstCsp = (site: SiteObservation) => testablePages(site).find((p) => p.fetch?.csp)?.fetch?.csp ?? null;
const pageList = (pages: Iterable<string>) => [...pages].join(', ');

export function cspFixLines(vendor: Vendor, csp: Record<string, string[]> | null, extra: Map<string, Set<string>> = new Map()): string[] {
  const directives = new Map<string, Set<string>>();
  for (const [d, domains] of Object.entries(vendor.csp) as [CspDirective, string[]][]) directives.set(d, new Set(domains));
  for (const [d, hosts] of extra) {
    if (!directives.has(d)) directives.set(d, new Set());
    for (const h of hosts) directives.get(d)!.add(h);
  }
  const lines: string[] = [];
  for (const [d, domains] of directives) {
    const missing = [...domains].filter((h) => !csp || !cspAllows(csp, d, h));
    if (missing.length) lines.push(`${d}: add ${missing.join(' ')}`);
  }
  return lines;
}

export function assessTags({ mode, target, baseline, policy }: AssessInput): Finding[] {
  const out: Finding[] = [];
  const tgt = attemptedVendors(target);

  if (mode === 'comparison' && baseline) {
    const base = attemptedVendors(baseline);
    const reliable = fullLoadReliable(baseline) && fullLoadReliable(target);
    const targetCsp = firstCsp(target);
    let missingCount = 0;
    for (const [id, { vendor, pages }] of base) {
      if (tgt.has(id)) continue;
      missingCount++;
      if (!reliable && vendor.category !== 'necessary') {
        out.push(finding({
          scope: 'Tags', checkKey: `tags.missing.${id}`, status: 'manual', priority: 'high',
          title: `Check whether ${vendor.name} loads on the new site`,
          explanation: `${vendor.name} loads on the current site (${pageList(pages)}), but the cookie banner on one of the sites could not be accepted automatically, so its absence on the new site is not confirmed.`,
          fix: MANUAL_STEPS.tags, typicalOwner: 'marketing', evidence: { pages: [...pages] },
        }));
        continue;
      }
      const csp = targetCsp ? cspFixLines(vendor, targetCsp) : [];
      out.push(finding({
        scope: 'Tags', checkKey: `tags.missing.${id}`, status: 'fail', priority: 'high',
        title: `${vendor.name} is missing on the new site`,
        explanation: `${vendor.name} loads on the current site (${pageList(pages)}) but not on the new site. ${vendor.impact}`,
        fix: [`Add ${vendor.name} to the new site, in the base layout or through GTM, gated by the cookie banner.`,
          ...(csp.length ? ["The new site's Content-Security-Policy would also block it. Extend it:", ...csp] : [])].join('\n'),
        typicalOwner: 'developer', evidence: { pages: [...pages] },
      }));
    }
    for (const [id, { vendor, pages }] of tgt) {
      if (base.has(id)) continue;
      out.push(finding({
        scope: 'Tags', checkKey: `tags.new.${id}`, status: 'warning', priority: 'low',
        title: `${vendor.name} is new on the new site`,
        explanation: `${vendor.name} loads on the new site (${pageList(pages)}) but not on the current site.`,
        fix: 'Confirm it is intended, assigned to the right cookie-banner category and covered by the privacy policy.',
        typicalOwner: 'marketing', evidence: { pages: [...pages] },
      }));
    }
    if (!missingCount && base.size) out.push(finding({
      scope: 'Tags', checkKey: 'tags.present', status: 'pass', priority: null,
      title: `All ${plural(base.size, 'tool', 'tools')} from the current site load on the new site`,
      explanation: [...base.values()].map((b) => b.vendor.name).join(', '), fix: '', typicalOwner: null,
    }));

    const baseIds = extractVendorIds(allRequestUrls(baseline));
    const tgtIds = extractVendorIds(allRequestUrls(target));
    for (const [vendorId, ids] of baseIds) {
      const now = tgtIds.get(vendorId);
      if (!now) continue;
      const same = ids.size === now.size && [...ids].every((i) => now.has(i));
      if (same) continue;
      const name = vendorById(vendorId)?.name ?? vendorId;
      out.push(finding({
        scope: 'Tags', checkKey: `tags.ids.${vendorId}`, status: 'fail', priority: 'high',
        title: `${name} uses a different ID on the new site`,
        explanation: 'Data from the new site goes to a different account, container or property than today.',
        fix: 'Use the same ID as the current site, unless the change is intended and reporting has been updated.',
        typicalOwner: 'gtm', evidence: { details: [`current: ${[...ids].join(', ')}; new: ${[...now].join(', ')}`] },
      }));
    }
  }

  if (mode === 'policy' && policy?.expectedIds.length) {
    const found = new Set([...extractVendorIds(allRequestUrls(target)).values()].flatMap((s) => [...s].map((i) => i.toUpperCase())));
    const reliable = fullLoadReliable(target);
    const ok: string[] = [];
    for (const raw of policy.expectedIds) {
      const id = raw.trim();
      if (found.has(id.toUpperCase())) { ok.push(id); continue; }
      out.push(finding({
        scope: 'Tags', checkKey: `tags.expected.${id}`, status: reliable ? 'fail' : 'manual', priority: 'high',
        title: reliable ? `Expected ID ${id} was not found` : `Check manually that ${id} loads after consent`,
        explanation: reliable
          ? 'No request with this ID was seen in any consent state, including after accepting all cookies.'
          : 'The cookie banner could not be accepted automatically, so tags that wait for consent were not observed.',
        fix: reliable ? 'Check that the tag is installed with this ID and fires after consent.' : MANUAL_STEPS.tags,
        typicalOwner: 'gtm',
      }));
    }
    if (ok.length === policy.expectedIds.length) out.push(finding({
      scope: 'Tags', checkKey: 'tags.expected', status: 'pass', priority: null,
      title: 'All expected IDs were found', explanation: ok.join(', '), fix: '', typicalOwner: null,
    }));
  }
  return out;
}

export function assessCsp({ target }: AssessInput): Finding[] {
  const pages = testablePages(target).filter((p) => p.browser);
  if (!pages.length) return [];
  const csp = firstCsp(target);
  const byVendor = new Map<string, { vendor: Vendor; pages: Set<string>; count: number; extra: Map<string, Set<string>> }>();
  const byHost = new Map<string, { directive: string; pages: Set<string> }>();
  for (const p of pages) {
    for (const st of p.browser!.states) {
      for (const v of st.cspViolations) {
        if (!/^https?:/.test(v.blockedUrl)) continue;          // inline/eval violations are not tracking requests
        const directive = v.directive.replace(/-(elem|attr)$/, '');
        const host = new URL(v.blockedUrl).hostname;
        const vendor = vendorForUrl(v.blockedUrl);
        if (vendor) {
          const e = byVendor.get(vendor.id) ?? { vendor, pages: new Set(), count: 0, extra: new Map() };
          e.pages.add(p.path); e.count++;
          if (!e.extra.has(directive)) e.extra.set(directive, new Set());
          e.extra.get(directive)!.add(host);
          byVendor.set(vendor.id, e);
        } else {
          const e = byHost.get(host) ?? { directive, pages: new Set() };
          e.pages.add(p.path);
          byHost.set(host, e);
        }
      }
    }
  }
  const out: Finding[] = [];
  for (const [id, e] of byVendor) {
    out.push(finding({
      scope: 'CSP', checkKey: `csp.blocked.${id}`, status: 'fail', priority: 'high',
      title: `The Content-Security-Policy blocks ${e.vendor.name}`,
      explanation: `${plural(e.count, 'request', 'requests')} to ${e.vendor.name} were blocked on ${pageList(e.pages)}. ${e.vendor.impact}`,
      fix: ['Extend the Content-Security-Policy:', ...cspFixLines(e.vendor, csp, e.extra)].join('\n'),
      typicalOwner: 'developer', evidence: { pages: [...e.pages] },
    }));
  }
  for (const [host, e] of byHost) {
    out.push(finding({
      scope: 'CSP', checkKey: `csp.blocked.host.${host}`, status: 'warning', priority: 'medium',
      title: `The Content-Security-Policy blocks requests to ${host}`,
      explanation: `Requests to ${host} were blocked on ${pageList(e.pages)}. It is not a tool CortIQ recognises.`,
      fix: `If ${host} is intended, add it to ${e.directive}.`, typicalOwner: 'developer', evidence: { pages: [...e.pages] },
    }));
  }
  if (!out.length) out.push(finding({
    scope: 'CSP', checkKey: 'csp.ok', status: 'pass', priority: null,
    title: 'No requests are blocked by the Content-Security-Policy', explanation: 'No CSP violations were reported in any consent state.',
    fix: '', typicalOwner: null, evidence: { pages: pages.map((p) => p.path) },
  }));
  return out;
}

export function assessForms({ mode, target, baseline }: AssessInput): Finding[] {
  if (mode !== 'comparison' || !baseline) return [];
  const collect = (site: SiteObservation) => {
    const m = new Map<string, { hit: FormHit; pages: Set<string> }>();
    for (const p of testablePages(site)) for (const hit of p.browser?.forms ?? []) {
      const key = `${hit.provider}:${hit.formId}`;
      if (!m.has(key)) m.set(key, { hit, pages: new Set() });
      m.get(key)!.pages.add(p.path);
    }
    return m;
  };
  const base = collect(baseline), tgt = collect(target);
  if (!base.size) return [];
  const label = (h: FormHit) => (h.provider === 'hubspot' ? `HubSpot form ${h.formId}` : `Gravity Form ${h.formId}`);
  const missing = [...base.entries()].filter(([k]) => !tgt.has(k)).map(([, v]) => v);
  if (!missing.length) return [finding({
    scope: 'Forms', checkKey: 'forms.present', status: 'pass', priority: null,
    title: `All ${plural(base.size, 'form', 'forms')} from the current site are on the new site`,
    explanation: [...base.values()].map((v) => label(v.hit)).join(', '), fix: '', typicalOwner: null,
  })];
  return [finding({
    scope: 'Forms', checkKey: 'forms.missing', status: 'fail', priority: 'high',
    title: `${plural(missing.length, 'form', 'forms')} from the current site ${missing.length === 1 ? 'is' : 'are'} missing on the new site`,
    explanation: 'Leads from these forms will stop arriving, or arrive through a different form that workflows and reports do not expect.',
    fix: 'Embed the same forms on the new site, or update workflows, lists and reports that depend on these form IDs.',
    typicalOwner: 'marketing',
    evidence: { pages: missing.flatMap((m) => [...m.pages]), details: missing.map((m) => `${label(m.hit)} (on ${pageList(m.pages)})`) },
  })];
}
```

- [ ] **Step 7: Register the modules in `assess/index.ts`**

Add the import and include the three functions in the `findings` array after `assessParameters(input)`:

```ts
import { assessCsp, assessForms, assessTags } from './tags.ts';
```

```ts
    ...assessTags(input),
    ...assessCsp(input),
    ...assessForms(input),
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `node --test tests/foundation/tracking-check-assess-tags.test.mjs tests/foundation/tracking-check-assess-parameters.test.mjs`
Expected: PASS (9 + 7 tests).

- [ ] **Step 9: Commit**

```bash
git add supabase/functions/_shared/form-detection.ts supabase/functions/_shared/tracking-check supabase/functions/form-detector/index.ts tests/foundation/tracking-check-assess-tags.test.mjs
git commit -m "feat(tracking-check): assess tags, IDs, CSP and forms; share form detection"
```

---

### Task 8: Assess — consent

**Files:**
- Create: `supabase/functions/_shared/tracking-check/assess/consent.ts`
- Modify: `supabase/functions/_shared/tracking-check/assess/index.ts`
- Test: `tests/foundation/tracking-check-assess-consent.test.mjs`

**Interfaces:**
- Consumes: util helpers, `MANUAL_STEPS` (Task 6); `vendorForUrl`, `vendorForName`, `Vendor` (Task 3).
- Produces: `assessConsent(input: AssessInput): Finding[]` with check keys `consent.defaults`, `consent.before_choice[.<vendor>|.cookieless.<vendor>]`, `consent.after_reject[.<vendor>|.cookieless.<vendor>|.manual]`, `consent.category[.<vendor>|.manual]`, `consent.unknown_after_reject`, `ads.enhanced_conversions`, `manual.<key>`.

Rules (from spec §5.3):
- Analytics/marketing vendor that **stores** cookies/local storage in `none` or `reject` → fail, high.
- Requests **without** storage → warning "cookieless" (factual legal wording), except Google tags under a Policy with `noGoogleBeforeConsent` → fail. In Policy strict mode GTM counts as a Google tag too.
- `reject` not automated → `manual`, and no pass. Pages without any banner (`not_needed` on reject) are skipped for the reject check; the `none` check covers them.
- Enhanced Conversions: seen → fail; not seen → `manual` (page loads alone cannot prove it is off).

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assess } from '../../supabase/functions/_shared/tracking-check/assess/index.ts';
import { page, site, st, req, POLICY } from './tracking-check-fixtures.mjs';

const DENIED = { kind: 'default', params: { ad_storage: 'denied', analytics_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' } };
const GA = 'https://www.googletagmanager.com/gtag/js?id=G-6J9DFZLXNL';
const GA_HIT = 'https://region1.google-analytics.com/g/collect?v=2&tid=G-6J9DFZLXNL&gcs=G100';
const ADS = 'https://www.googletagmanager.com/gtag/js?id=AW-18424645060';
const GTM = 'https://www.googletagmanager.com/gtm.js?id=GTM-ABC123';
const EXT = 'https://cdn.extellio.com/tracker.js';
const policyRun = (states, policy = POLICY) => assess({ mode: 'policy', baseline: null, policy, target: site('target', [page('/', { states })]) });
const compareRun = (states) => assess({ mode: 'comparison', baseline: site('baseline', [page('/')]), policy: null, target: site('target', [page('/', { states })]) });
const byKey = (findings, key) => findings.filter((f) => f.checkKey === key);
const granular = [st('analytics_only', { requests: [req(GA)] }), st('marketing_only', { requests: [req(ADS)] })];

test('Pretec case: nothing to Google after reject passes; Extellio cookieless pings are a factual warning', () => {
  const findings = policyRun([
    st('none', { consentCommands: [DENIED] }),
    st('reject', { requests: [req(EXT), req('https://cdn.extellio.com/ping?id=1')] }),
    st('accept', { requests: [req(GA), req(ADS)], cookies: [{ name: '_ga', domain: '.pretec.se' }] }),
    ...granular,
  ]);
  const [ext] = byKey(findings, 'consent.after_reject.cookieless.extellio');
  assert.equal(ext.status, 'warning');
  assert.match(ext.explanation, /LEK 9 kap\. 28 §/);
  assert.match(ext.explanation, /assessed by the controller/);
  assert.equal(byKey(findings, 'consent.before_choice')[0].status, 'pass');
  assert.equal(byKey(findings, 'consent.defaults')[0].status, 'pass');
  assert.equal(byKey(findings, 'consent.category')[0].status, 'pass');
  assert.equal(byKey(findings, 'consent.after_reject').length, 0, 'no pass while a warning exists');
});

test('an analytics tool that stores cookies after reject fails', () => {
  const findings = compareRun([st('none'), st('reject', { requests: [req(GA_HIT)], cookies: [{ name: '_ga', domain: '.new.example' }] }), st('accept')]);
  const [f] = byKey(findings, 'consent.after_reject.ga4');
  assert.equal(f.status, 'fail');
  assert.match(f.explanation, /_ga/);
});

test('cookieless Google pings after reject: warning in comparison, fail under a strict policy', () => {
  const states = [st('none', { consentCommands: [DENIED] }), st('reject', { requests: [req(GA_HIT)] }), st('accept'), ...granular];
  assert.equal(byKey(compareRun(states.slice(0, 3)), 'consent.after_reject.cookieless.ga4')[0].status, 'warning');
  assert.equal(byKey(policyRun(states), 'consent.after_reject.ga4')[0].status, 'fail');
});

test('GTM before choice: ignored in comparison, fail under a strict Google policy', () => {
  const states = [st('none', { requests: [req(GTM)], consentCommands: [DENIED] }), st('reject'), st('accept')];
  assert.equal(byKey(compareRun(states), 'consent.before_choice')[0].status, 'pass');
  assert.equal(byKey(policyRun([...states, ...granular]), 'consent.before_choice.gtm')[0].status, 'fail');
});

test('reject that could not be automated is manual and never passes', () => {
  const findings = compareRun([st('none'), st('reject', { method: 'not_automated' }), st('accept')]);
  assert.equal(byKey(findings, 'consent.after_reject.manual')[0].status, 'manual');
  assert.equal(byKey(findings, 'consent.after_reject').length, 0);
});

test('Consent Mode defaults: required when Google is present, skipped otherwise', () => {
  const withGoogle = compareRun([st('none'), st('reject'), st('accept', { requests: [req(GA)] })]);
  const [f] = byKey(withGoogle, 'consent.defaults');
  assert.equal(f.status, 'fail');
  assert.match(f.evidence.details[0], /no consent default/);
  const partial = compareRun([st('none', { consentCommands: [{ kind: 'default', params: { ad_storage: 'denied', analytics_storage: 'granted' } }] }), st('reject'), st('accept', { requests: [req(GA)] })]);
  assert.match(byKey(partial, 'consent.defaults')[0].evidence.details[0], /analytics_storage=granted, ad_user_data=missing/);
  assert.equal(byKey(compareRun([st('none'), st('reject'), st('accept')]), 'consent.defaults').length, 0);
});

test('category check: Ads with only Statistics fails; unsupported granular consent is manual', () => {
  const base = [st('none', { consentCommands: [DENIED] }), st('reject'), st('accept')];
  const wrong = policyRun([...base, st('analytics_only', { requests: [req(GA), req(ADS)] }), st('marketing_only', { requests: [req(ADS)] })]);
  assert.equal(byKey(wrong, 'consent.category.google-ads')[0].status, 'fail');
  const unsupported = policyRun([...base, st('analytics_only', { method: 'not_automated' }), st('marketing_only', { method: 'not_automated' })]);
  assert.equal(byKey(unsupported, 'consent.category.manual')[0].status, 'manual');
  assert.equal(byKey(unsupported, 'consent.category').length, 0);
});

test('unknown third parties after reject are a warning; own site and known tools are ignored', () => {
  const findings = policyRun([st('none', { consentCommands: [DENIED] }),
    st('reject', { requests: [req('https://cdn.new.example/app.js'), req('https://fonts.googleapis.com/css'), req('https://px.unknown-tracker.example/p.gif')] }),
    st('accept'), ...granular]);
  const [f] = byKey(findings, 'consent.unknown_after_reject');
  assert.equal(f.status, 'warning');
  assert.deepEqual(f.evidence.details, ['px.unknown-tracker.example (on /)']);
});

test('Enhanced Conversions: seen is a fail, not seen is manual', () => {
  const base = [st('none', { consentCommands: [DENIED] }), st('reject'), ...granular];
  assert.equal(byKey(policyRun([...base, st('accept', { enhancedConversions: true })]), 'ads.enhanced_conversions')[0].status, 'fail');
  assert.equal(byKey(policyRun([...base, st('accept')]), 'ads.enhanced_conversions')[0].status, 'manual');
});

test('policy manual items become manual findings', () => {
  const findings = policyRun([st('none', { consentCommands: [DENIED] }), st('reject'), st('accept'), ...granular],
    { ...POLICY, manualItems: [{ key: 'ga4_retention', label: 'GA4 data retention is 2 months' }] });
  const [f] = byKey(findings, 'manual.ga4_retention');
  assert.equal(f.status, 'manual');
  assert.equal(f.scope, 'Manual');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/foundation/tracking-check-assess-consent.test.mjs`
Expected: FAIL — the consent keys are not produced (assertions on `undefined`).

- [ ] **Step 3: Write `assess/consent.ts`**

```ts
import type { AssessInput, Finding, PageObservation, StateObservation } from '../types.ts';
import { vendorForName, vendorForUrl, type Vendor } from '../../tracking-vendors.ts';
import { MANUAL_STEPS } from '../instructions.ts';
import { finding, plural, requestVendors, siteKey, stateOf, testablePages } from './util.ts';

const REQUIRED_DEFAULTS = ['ad_storage', 'analytics_storage', 'ad_user_data', 'ad_personalization'];
const needsConsent = (v: Vendor) => v.category === 'analytics' || v.category === 'marketing';
const automated = (st?: StateObservation) => !!st && st.method !== 'not_automated';
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const paths = (pages: Iterable<PageObservation | string>) => [...pages].map((p) => (typeof p === 'string' ? p : p.path));

function pass(checkKey: string, title: string, explanation: string, pages: PageObservation[]): Finding {
  return finding({ scope: checkKey.startsWith('ads.') ? 'Ads/GA4' : 'Consent', checkKey, status: 'pass', priority: null,
    title, explanation, fix: '', typicalOwner: null, evidence: { pages: paths(pages) } });
}

export function assessConsent(input: AssessInput): Finding[] {
  const pages = testablePages(input.target).filter((p) => p.browser);
  if (!pages.length) return [];
  return [
    ...consentDefaults(input, pages),
    ...choiceCheck(input, pages, 'none'),
    ...choiceCheck(input, pages, 'reject'),
    ...categoryCheck(input, pages),
    ...unknownAfterReject(input, pages),
    ...enhancedConversions(input, pages),
    ...manualItems(input),
  ];
}

function consentDefaults({ mode, policy }: AssessInput, pages: PageObservation[]): Finding[] {
  const googleSeen = pages.some((p) => p.browser!.states.some((st) => [...requestVendors(st).values()].some((v) => v.googleTag)));
  if (mode === 'policy' ? !policy?.consentDefaultsDenied : !googleSeen) return [];
  const details: string[] = [];
  const affected: string[] = [];
  for (const p of pages) {
    const none = stateOf(p, 'none');
    if (!none) continue;
    const def = none.consentCommands.find((c) => c.kind === 'default');
    if (!def) { details.push(`${p.path}: no consent default is set`); affected.push(p.path); continue; }
    const wrong = REQUIRED_DEFAULTS.filter((k) => def.params[k] !== 'denied');
    if (wrong.length) {
      details.push(`${p.path}: ${wrong.map((k) => `${k}=${def.params[k] ?? 'missing'}`).join(', ')}`);
      affected.push(p.path);
    }
  }
  if (!details.length) {
    return [pass('consent.defaults', 'Consent Mode v2 defaults are "denied" before the visitor chooses',
      'ad_storage, analytics_storage, ad_user_data and ad_personalization all default to denied.', pages)];
  }
  return [finding({
    scope: 'Consent', checkKey: 'consent.defaults', status: 'fail', priority: 'high',
    title: 'Consent Mode v2 defaults are missing or not "denied"',
    explanation: 'Google tags need a consent default of "denied" before they load. Without it they behave as if consent was given, and Google Ads needs Consent Mode signals for EEA traffic.',
    fix: "Set gtag('consent', 'default', { ad_storage: 'denied', analytics_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' }) before GTM or the Google tag loads. Most cookie banners (CookieYes, Cookiebot, OneTrust) have a Consent Mode v2 setting that does this.",
    typicalOwner: 'cmp', evidence: { pages: affected, details },
  })];
}

function choiceCheck({ mode, policy }: AssessInput, pages: PageObservation[], state: 'none' | 'reject'): Finding[] {
  const label = state === 'none' ? 'before the visitor chooses' : 'after "Reject all"';
  const key = state === 'none' ? 'consent.before_choice' : 'consent.after_reject';
  const strictGoogle = mode === 'policy' && !!policy?.noGoogleBeforeConsent;
  const notAutomated = pages.filter((p) => stateOf(p, state)?.method === 'not_automated');
  const evaluated = pages.filter((p) => {
    const st = stateOf(p, state);
    return !!st && st.method !== 'not_automated' && !(state === 'reject' && st.method === 'not_needed');
  });

  const hits = new Map<string, { vendor: Vendor; pages: Set<string>; stored: Set<string>; hosts: Set<string> }>();
  const hit = (v: Vendor) => {
    if (!hits.has(v.id)) hits.set(v.id, { vendor: v, pages: new Set(), stored: new Set(), hosts: new Set() });
    return hits.get(v.id)!;
  };
  for (const p of evaluated) {
    const st = stateOf(p, state)!;
    for (const r of st.requests) {
      const v = vendorForUrl(r.url);
      if (!v || !(needsConsent(v) || (strictGoogle && v.googleTag))) continue;
      const h = hit(v); h.pages.add(p.path); h.hosts.add(new URL(r.url).hostname);
    }
    for (const name of [...st.cookies.map((c) => c.name), ...st.storageKeys]) {
      const v = vendorForName(name);
      if (!v || !needsConsent(v)) continue;
      const h = hit(v); h.pages.add(p.path); h.stored.add(name);
    }
  }

  const out: Finding[] = [];
  for (const [id, h] of hits) {
    const v = h.vendor;
    const where = [...h.pages].join(', ');
    const hosts = [...h.hosts].join(', ') || v.name;
    const evidence = { pages: [...h.pages], details: [...[...h.hosts].map((x) => `requests to ${x}`), ...[...h.stored].map((n) => `stored ${n}`)] };
    if (h.stored.size) {
      out.push(finding({
        scope: 'Consent', checkKey: `${key}.${id}`, status: 'fail', priority: 'high',
        title: `${v.name} stores data on the device ${label}`,
        explanation: `${v.name} set ${[...h.stored].join(', ')} ${label} on ${where}. ${cap(v.category)} tools need consent before they store or read data on the visitor's device.`,
        fix: `Load ${v.name} only after consent for the "${v.category}" category: block it in the cookie banner, or give its GTM tag a consent requirement.`,
        typicalOwner: 'cmp', evidence,
      }));
    } else if (v.googleTag && strictGoogle) {
      out.push(finding({
        scope: 'Consent', checkKey: `${key}.${id}`, status: 'fail', priority: 'high',
        title: `${v.name} sends requests to Google ${label}`,
        explanation: `${v.name} contacted ${hosts} ${label} on ${where}, without setting cookies. The agreed setup is that nothing is sent to Google before consent (Consent Mode basic).`,
        fix: id === 'gtm'
          ? 'Load the GTM container only after consent, or record the container request as an accepted exception (the container itself sets no cookies).'
          : `Block ${v.name} until consent (Consent Mode basic) instead of letting it send cookieless pings (Consent Mode advanced).`,
        typicalOwner: 'gtm', evidence,
      }));
    } else {
      out.push(finding({
        scope: 'Consent', checkKey: `${key}.cookieless.${id}`, status: 'warning', priority: 'medium',
        title: `${v.name} sends requests ${label} without cookies`,
        explanation: `${v.name} contacted ${hosts} ${label} on ${where}, without setting cookies or local storage. Cookieless measurement may require consent under ePrivacy rules (in Sweden: LEK 9 kap. 28 §); this is assessed by the controller.`,
        fix: `Check ${v.name}'s settings (for example a "track visitors always" option) and decide with the controller whether measuring visitors ${state === 'none' ? 'before they choose' : 'who rejected cookies'} is acceptable.`,
        typicalOwner: 'legal', evidence,
      }));
    }
  }
  if (notAutomated.length) {
    out.push(finding({
      scope: 'Consent', checkKey: `${key}.manual`, status: 'manual', priority: 'high',
      title: 'Check manually that nothing is tracked after "Reject all"',
      explanation: `The automated browser could not find or click the cookie banner's reject option on ${paths(notAutomated).join(', ')}.`,
      fix: MANUAL_STEPS.reject, typicalOwner: 'cmp', evidence: { pages: paths(notAutomated) },
    }));
  }
  if (!out.length && evaluated.length) {
    const title = state === 'none'
      ? (strictGoogle ? 'Nothing is tracked or sent to Google before the visitor chooses' : 'No analytics or marketing tools run before the visitor chooses')
      : (strictGoogle ? 'Nothing is tracked or sent to Google after "Reject all"' : 'Nothing is tracked after "Reject all"');
    out.push(pass(key, title, `Checked on ${plural(evaluated.length, 'page', 'pages')}: no analytics or marketing requests, cookies or local storage${strictGoogle ? ', and no requests from Google tags' : ''}.`, evaluated));
  }
  return out;
}

function categoryCheck({ mode, policy }: AssessInput, pages: PageObservation[]): Finding[] {
  if (mode !== 'policy' || !(policy?.ga4RequiresAnalytics || policy?.adsRequiresMarketing)) return [];
  const unsupported = pages.filter((p) => !automated(stateOf(p, 'analytics_only')) || !automated(stateOf(p, 'marketing_only')));
  const wrong = new Map<string, { vendor: Vendor; only: string; pages: Set<string> }>();
  for (const p of pages) {
    for (const [state, forbidden, only] of [['analytics_only', 'marketing', 'Statistics'], ['marketing_only', 'analytics', 'Marketing']] as const) {
      const st = stateOf(p, state);
      if (!automated(st)) continue;
      for (const v of requestVendors(st!).values()) {
        if (v.category !== forbidden) continue;
        if (!wrong.has(v.id)) wrong.set(v.id, { vendor: v, only, pages: new Set() });
        wrong.get(v.id)!.pages.add(p.path);
      }
    }
  }
  const out: Finding[] = [];
  for (const [id, w] of wrong) {
    out.push(finding({
      scope: 'Consent', checkKey: `consent.category.${id}`, status: 'fail', priority: 'high',
      title: `${w.vendor.name} runs with only ${w.only} accepted`,
      explanation: `${w.vendor.name} is a ${w.vendor.category} tool but sent requests when only the ${w.only} category was accepted, on ${[...w.pages].join(', ')}.`,
      fix: `Assign ${w.vendor.name} to the ${cap(w.vendor.category)} category in the cookie banner, or require ${w.vendor.category === 'marketing' ? 'ad_storage' : 'analytics_storage'} in its GTM consent settings.`,
      typicalOwner: 'cmp', evidence: { pages: [...w.pages] },
    }));
  }
  if (unsupported.length) {
    out.push(finding({
      scope: 'Consent', checkKey: 'consent.category.manual', status: 'manual', priority: 'high',
      title: 'Check consent categories manually',
      explanation: `The cookie banner on ${paths(unsupported).join(', ')} offers no supported way to accept a single category automatically.`,
      fix: MANUAL_STEPS.granular, typicalOwner: 'cmp', evidence: { pages: paths(unsupported) },
    }));
  } else if (!out.length) {
    out.push(pass('consent.category', 'Each tool only runs when its own consent category is accepted',
      'With only Statistics accepted no marketing tools ran, and with only Marketing accepted no analytics tools ran.', pages));
  }
  return out;
}

function unknownAfterReject({ mode, policy, target }: AssessInput, pages: PageObservation[]): Finding[] {
  if (mode !== 'policy' || !policy?.noUnknownVendorsAfterReject) return [];
  const own = siteKey(new URL(target.origin).hostname);
  const hosts = new Map<string, Set<string>>();
  const evaluated: PageObservation[] = [];
  for (const p of pages) {
    const st = stateOf(p, 'reject');
    if (!st || st.method === 'not_automated' || st.method === 'not_needed') continue;
    evaluated.push(p);
    for (const r of st.requests) {
      let host = '';
      try { host = new URL(r.url).hostname; } catch { continue; }
      if (!host || siteKey(host) === own || vendorForUrl(r.url)) continue;
      if (!hosts.has(host)) hosts.set(host, new Set());
      hosts.get(host)!.add(p.path);
    }
  }
  if (!evaluated.length) return [];
  if (!hosts.size) {
    return [pass('consent.unknown_after_reject', 'No unknown third parties are contacted after "Reject all"',
      'Every third-party request after rejection went to a tool CortIQ recognises as necessary.', evaluated)];
  }
  return [finding({
    scope: 'Consent', checkKey: 'consent.unknown_after_reject', status: 'warning', priority: 'medium',
    title: `${plural(hosts.size, 'unknown third party is', 'unknown third parties are')} contacted after "Reject all"`,
    explanation: "These domains are not in CortIQ's list of known tools. They may be harmless (CDNs, video, fonts) or tracking tools.",
    fix: 'Identify each domain. If it is a tracking or marketing tool, block it until consent in the cookie banner.',
    typicalOwner: 'marketing',
    evidence: { pages: [...new Set([...hosts.values()].flatMap((s) => [...s]))], details: [...hosts].map(([h, ps]) => `${h} (on ${[...ps].join(', ')})`) },
  })];
}

function enhancedConversions({ mode, policy }: AssessInput, pages: PageObservation[]): Finding[] {
  if (mode !== 'policy' || !policy?.enhancedConversionsOff) return [];
  const seen = pages.filter((p) => p.browser!.states.some((s) => s.enhancedConversions));
  if (seen.length) {
    return [finding({
      scope: 'Ads/GA4', checkKey: 'ads.enhanced_conversions', status: 'fail', priority: 'high',
      title: 'Enhanced Conversions appears to be switched on',
      explanation: 'The Google tag configuration or its requests include user data for Enhanced Conversions (hashed email), which the agreed setup excludes.',
      fix: 'Turn off Enhanced Conversions in Google Ads (Goals → Settings), and remove user_data and allow_enhanced_conversions from the Google tag or GTM.',
      typicalOwner: 'gtm', evidence: { pages: paths(seen) },
    })];
  }
  return [finding({
    scope: 'Ads/GA4', checkKey: 'ads.enhanced_conversions', status: 'manual', priority: 'medium',
    title: 'Confirm Enhanced Conversions is off in Google Ads',
    explanation: 'No Enhanced Conversions data was seen while loading pages. It is normally sent when a form is submitted, which is not tested automatically.',
    fix: 'In Google Ads, open Goals → Settings → Enhanced conversions and confirm it is off. Optionally submit a test form with Tag Assistant connected and check that no user_data is sent.',
    typicalOwner: 'gtm',
  })];
}

function manualItems({ mode, policy }: AssessInput): Finding[] {
  if (mode !== 'policy' || !policy) return [];
  return policy.manualItems.map((item) => finding({
    scope: 'Manual', checkKey: `manual.${item.key}`, status: 'manual', priority: 'medium', title: item.label,
    explanation: 'This cannot be verified from outside the site. Check it in the relevant admin tool and mark it as verified.',
    fix: '', typicalOwner: 'marketing',
  }));
}
```

- [ ] **Step 4: Register in `assess/index.ts`**

```ts
import { assessConsent } from './consent.ts';
```

and add `...assessConsent(input),` as the last entry of the `findings` array.

- [ ] **Step 5: Run all assess tests**

Run: `node --test tests/foundation/tracking-check-assess-*.test.mjs`
Expected: PASS (7 + 9 + 10 tests).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/tracking-check/assess tests/foundation/tracking-check-assess-consent.test.mjs
git commit -m "feat(tracking-check): assess consent defaults, choices, categories and policy items"
```

---

### Task 9: Report — summary and CSV

**Files:**
- Create: `supabase/functions/_shared/tracking-check/report.ts`
- Test: `tests/foundation/tracking-check-report.test.mjs`

**Interfaces:**
- Consumes: `Finding`, `FindingStatus`, `Mode` (Task 2).
- Produces:
  - `interface SummaryLine { status: FindingStatus; text: string; checkKey: string }`
  - `interface ReportSummary { headline: string; counts: Record<FindingStatus, number>; blocking: number; lines: SummaryLine[] }`
  - `summarize(findings: Finding[], mode: Mode): ReportSummary` — expects findings already sorted by `assess()`.
  - `CSV_COLUMNS: string[]`, `toCsv(findings: Finding[]): string`

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, toCsv, CSV_COLUMNS } from '../../supabase/functions/_shared/tracking-check/report.ts';

const f = (status, priority, scope, title, extra = {}) => ({ scope, checkKey: title.toLowerCase().replace(/\W+/g, '.'), title, status, priority,
  explanation: `${title} explained.`, fix: status === 'pass' ? '' : `Fix ${title}. Then verify.`, typicalOwner: null, evidence: { pages: ['/'], details: [] }, ...extra });

test('comparison headline counts blocking problems and lines lead with issues', () => {
  const s = summarize([f('fail', 'high', 'Tags', 'HubSpot is missing'), f('fail', 'high', 'CSP', 'CSP blocks HubSpot'),
    f('warning', 'low', 'Tags', 'Reddit is new'), f('manual', 'high', 'Consent', 'Check reject'),
    f('pass', null, 'Parameters', 'Parameters survive'), f('pass', null, 'Consent', 'Nothing before choice')], 'comparison');
  assert.equal(s.headline, '2 problems block go-live · 2 OK · 1 to review · 1 to test manually');
  assert.equal(s.blocking, 2);
  assert.deepEqual(s.lines.map((l) => l.text), ['HubSpot is missing', 'CSP blocks HubSpot', 'Reddit is new', 'Parameters survive', 'Nothing before choice']);
});

test('policy headline and pass lines skip scopes that have failures', () => {
  const ok = summarize([f('manual', 'medium', 'Manual', 'GA4 retention'), f('pass', null, 'Consent', 'Nothing after reject')], 'policy');
  assert.equal(ok.headline, 'All tested commitments are met · 1 OK · 1 to test manually');
  const bad = summarize([f('fail', 'high', 'Consent', 'Google after reject'), f('pass', null, 'Consent', 'Defaults denied')], 'policy');
  assert.equal(bad.headline, '1 commitment is not met · 1 OK');
  assert.deepEqual(bad.lines.map((l) => l.text), ['Google after reject']);
});

test('CSV matches the tracker columns, maps statuses and escapes safely', () => {
  const csv = toCsv([
    f('fail', 'high', 'Tags', 'HubSpot is missing'),
    f('warning', 'medium', 'Consent', 'Extellio, cookieless', { explanation: 'Says "hello"\nline two' }),
    f('pass', null, 'Parameters', '=HYPERLINK("x")'),
  ]);
  assert.ok(csv.startsWith('﻿'));
  const lines = csv.slice(1).trimEnd().split('\r\n');
  assert.equal(lines[0], CSV_COLUMNS.map((c) => `"${c}"`).join(','));
  assert.deepEqual(CSV_COLUMNS, ['Scope', 'Details', 'Deliverable', 'Owner', 'Status', 'Priority', 'Double Check / Blocker', 'Notes']);
  assert.match(lines[1], /^"Tags","HubSpot is missing","Fix HubSpot is missing\.","","Not Started","High","Yes",/);
  assert.match(csv, /"Pending Review","Medium",""/);
  assert.match(csv, /"Says ""hello""\nline two/);
  assert.match(csv, /"'=HYPERLINK\(""x""\)","No action needed","","Completed"/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/foundation/tracking-check-report.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `report.ts`**

```ts
// Turns findings into the report headline, summary lines and tracker-compatible CSV.
import type { Finding, FindingStatus, Mode } from './types.ts';

export interface SummaryLine { status: FindingStatus; text: string; checkKey: string }
export interface ReportSummary { headline: string; counts: Record<FindingStatus, number>; blocking: number; lines: SummaryLine[] }

export function summarize(findings: Finding[], mode: Mode): ReportSummary {
  const counts: Record<FindingStatus, number> = { pass: 0, fail: 0, warning: 0, manual: 0, untestable: 0 };
  for (const f of findings) counts[f.status]++;
  const blocking = findings.filter((f) => f.status === 'fail' && f.priority === 'high').length;
  const lead = mode === 'comparison'
    ? (blocking ? `${blocking} ${blocking === 1 ? 'problem blocks' : 'problems block'} go-live`
      : counts.fail ? `${counts.fail} ${counts.fail === 1 ? 'problem' : 'problems'} to fix` : 'No blocking problems')
    : (counts.fail ? `${counts.fail} ${counts.fail === 1 ? 'commitment is' : 'commitments are'} not met` : 'All tested commitments are met');
  const parts = [lead, `${counts.pass} OK`];
  if (counts.warning) parts.push(`${counts.warning} to review`);
  const manual = counts.manual + counts.untestable;
  if (manual) parts.push(`${manual} to test manually`);

  const lines: SummaryLine[] = [
    ...findings.filter((f) => f.status === 'fail').slice(0, 3),
    ...findings.filter((f) => f.status === 'warning').slice(0, 2),
  ].map((f) => ({ status: f.status, text: f.title, checkKey: f.checkKey }));
  for (const scope of ['Parameters', 'Consent', 'Tags'] as const) {
    if (lines.length >= 5) break;
    if (findings.some((f) => f.scope === scope && f.status === 'fail')) continue;
    const p = findings.find((f) => f.scope === scope && f.status === 'pass');
    if (p) lines.push({ status: 'pass', text: p.title, checkKey: p.checkKey });
  }
  return { headline: parts.join(' · '), counts, blocking, lines };
}

export const CSV_COLUMNS = ['Scope', 'Details', 'Deliverable', 'Owner', 'Status', 'Priority', 'Double Check / Blocker', 'Notes'];
const STATUS_LABEL: Record<FindingStatus, string> = { pass: 'Completed', warning: 'Pending Review', fail: 'Not Started', manual: 'Not Started', untestable: 'Not Started' };

const firstSentence = (text: string) => {
  const line = text.split('\n')[0];
  return (line.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? line).trim();
};
// Quote every cell; neutralise spreadsheet formulas.
const cell = (value: string) => `"${(/^[=+\-@\t\r]/.test(value) ? `'${value}` : value).replace(/"/g, '""')}"`;

export function toCsv(findings: Finding[]): string {
  const rows = findings.map((f) => [
    f.scope,
    f.title,
    f.status === 'pass' ? 'No action needed' : firstSentence(f.fix || f.explanation),
    '',
    STATUS_LABEL[f.status],
    f.priority ? f.priority.charAt(0).toUpperCase() + f.priority.slice(1) : '',
    f.status === 'fail' && f.priority === 'high' ? 'Yes' : '',
    [f.explanation, f.evidence.pages.length ? `Pages: ${f.evidence.pages.join(', ')}` : ''].filter(Boolean).join(' '),
  ]);
  return '﻿' + [CSV_COLUMNS, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/foundation/tracking-check-report.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/tracking-check/report.ts tests/foundation/tracking-check-report.test.mjs
git commit -m "feat(tracking-check): report summary and tracker-compatible CSV"
```

---

### Task 10: Browser probe, Browserless client and CMP adapter verification

**Files:**
- Create: `supabase/functions/_shared/tracking-check/browser-probe.js`
- Create: `supabase/functions/_shared/tracking-check/browserless.ts`
- Create: `scripts/tracking-check/probe-smoke.mjs`
- Create: `docs/superpowers/plans/notes/2026-10-12-tracking-check-cmp-verification.md`
- Test: `tests/foundation/tracking-check-browser-probe.test.mjs`

**Interfaces:**
- Consumes: Task 1 results (host, response wrapping, context-creation method); `assertSafeUrl` (Task 2); types (Task 2); `vendorForUrl` (Task 3, smoke script only).
- Produces:
  - `browser-probe.js`: `buildProbeSource(): string`, `pickConsentButton(candidates: {index: number; text: string}[], action: 'accept' | 'reject'): number | null`, `inPageCollect(withHtml: boolean)`, plus the other `inPage*` helpers.
  - `browserless.ts`: `DEFAULT_BROWSERLESS_URL`, `type BrowserProbeResult = Omit<BrowserObservation, 'forms'> & { html: string }`, `runBrowserProbe(opts: { endpoint: string; token: string; url: string; states: ConsentState[]; basicAuth: BasicAuth | null; fetchImpl?: typeof fetch }): Promise<BrowserProbeResult>`.

How a state is observed (each state in its own fresh browser context, all states in parallel):
1. Load the page, wait for network idle, inject the in-page helpers, detect challenge pages and the CMP.
2. For `none`: collect immediately.
3. Otherwise snapshot cookies and storage keys, apply the choice (adapter first, then text match for accept/reject), wait, **clear the request log and reload** so the observation is the next page view after the choice, then collect only cookies/storage that are new since the snapshot.
4. No adapter and no matching button: `not_needed` if no banner is visible at all, else `not_automated`.

Note on regression fixtures: the spec asks for saved DOM snapshots per CMP. The repository has no DOM test environment (no jsdom), so adapter behaviour is pinned by the live verification notes in Step 7 instead, re-run with `probe-smoke.mjs` whenever an adapter changes.

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProbeSource, pickConsentButton, inPageCollect } from '../../supabase/functions/_shared/tracking-check/browser-probe.js';
import { runBrowserProbe } from '../../supabase/functions/_shared/tracking-check/browserless.ts';

test('picks reject and accept buttons in Swedish and English', () => {
  const c = (...texts) => texts.map((text, index) => ({ index, text }));
  assert.equal(pickConsentButton(c('Inställningar', 'Neka alla', 'Acceptera alla'), 'reject'), 1);
  assert.equal(pickConsentButton(c('Inställningar', 'Neka alla', 'Acceptera alla'), 'accept'), 2);
  assert.equal(pickConsentButton(c('Customize', 'Only necessary cookies', 'Accept all cookies'), 'reject'), 1);
  assert.equal(pickConsentButton(c('Read more', 'Settings'), 'reject'), null);
});

test('collects consent commands, Enhanced Conversions config and storage keys from the page', () => {
  const store = (keys) => ({ length: keys.length, key: (i) => keys[i] });
  globalThis.window = {
    dataLayer: [{ event: 'gtm.js' }, ['consent', 'default', { ad_storage: 'denied', wait_for_update: 500 }], ['config', 'AW-1', { allow_enhanced_conversions: true }]],
    __tcCsp: [{ blockedUrl: 'https://js.hs-scripts.com/1.js', directive: 'script-src-elem' }],
    localStorage: store(['_hjSession']), sessionStorage: store([]),
    document: { documentElement: { outerHTML: '<html></html>' } },
  };
  try {
    const out = inPageCollect(true);
    assert.deepEqual(out.consentCommands, [{ kind: 'default', params: { ad_storage: 'denied', wait_for_update: '500' } }]);
    assert.equal(out.ec, true);
    assert.deepEqual(out.storageKeys, ['_hjSession']);
    assert.equal(out.csp.length, 1);
    assert.equal(out.html, '<html></html>');
  } finally {
    delete globalThis.window;
  }
});

test('the probe source is a valid ES module with a default export', async () => {
  const mod = await import('data:text/javascript,' + encodeURIComponent(buildProbeSource()));
  assert.equal(typeof mod.default, 'function');
});

test('runBrowserProbe posts code and context, unwraps the response and reports errors', async () => {
  let sent;
  const observation = { url: 'https://new.example/', cmp: 'cookieyes', states: [], html: '' };
  const ok = async (url, init) => { sent = { url, body: JSON.parse(init.body) }; return Response.json({ data: observation, type: 'application/json' }); };
  const result = await runBrowserProbe({ endpoint: 'https://bl.example/', token: 't k', url: 'https://new.example/', states: ['none'], basicAuth: null, fetchImpl: ok });
  assert.equal(result.cmp, 'cookieyes');
  assert.equal(sent.url, 'https://bl.example/function?token=t%20k&timeout=90000');
  assert.deepEqual(sent.body.context, { url: 'https://new.example/', states: ['none'], basicAuth: null });
  assert.match(sent.body.code, /export default async function/);

  const denied = async () => new Response('bad token', { status: 401 });
  await assert.rejects(runBrowserProbe({ endpoint: 'https://bl.example', token: 't', url: 'https://new.example/', states: ['none'], basicAuth: null, fetchImpl: denied }), /Browserless 401/);
  await assert.rejects(runBrowserProbe({ endpoint: 'https://bl.example', token: 't', url: 'http://10.0.0.1/', states: ['none'], basicAuth: null, fetchImpl: ok }), /Blocked host/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/foundation/tracking-check-browser-probe.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `browser-probe.js`**

```js
// Browser probe for Tracking Check. buildProbeSource() returns the ES module sent to
// Browserless /function. In-page helpers (inPage*, pickConsentButton) are serialised with
// toString() and run inside the tested page, so they must not reference anything outside
// their own body. observeState/probeMain run in Browserless' Node context with Puppeteer.

/** in-page: which consent management platform is on the page. */
export function inPageDetectCmp() {
  const w = window;
  if (w.Cookiebot) return 'cookiebot';
  if (w.OneTrust || w.Optanon) return 'onetrust';
  if (w.getCkyConsent || document.querySelector('.cky-consent-container, [data-cky-tag]')) return 'cookieyes';
  if (w.cmplz_set_category || document.querySelector('.cmplz-cookiebanner')) return 'complianz';
  if (document.getElementById('crtq-consent-banner')) return 'cortiq';
  return null;
}

/** in-page: apply a consent choice through a known CMP. Returns true when the choice was made. */
export function inPageApplyAdapter(cmp, action) {
  const w = window;
  const click = (selector) => {
    const el = document.querySelector(selector);
    if (!el) return false;
    el.click();
    return true;
  };
  if (cmp === 'cookiebot' && w.Cookiebot && typeof w.Cookiebot.submitCustomConsent === 'function') {
    const flags = { accept: [true, true, true], reject: [false, false, false], analytics_only: [false, true, false], marketing_only: [false, false, true] }[action];
    w.Cookiebot.submitCustomConsent(flags[0], flags[1], flags[2]);   // preferences, statistics, marketing
    return true;
  }
  if (cmp === 'onetrust' && w.OneTrust) {
    if (action === 'accept' && typeof w.OneTrust.AllowAll === 'function') { w.OneTrust.AllowAll(); return true; }
    if (action === 'reject' && typeof w.OneTrust.RejectAll === 'function') { w.OneTrust.RejectAll(); return true; }
    return false;
  }
  if (cmp === 'cookieyes') {
    if (action === 'accept') return click('.cky-btn-accept');
    if (action === 'reject') return click('.cky-btn-reject');
    return false;
  }
  if (cmp === 'complianz') {
    if (action === 'accept') return click('.cmplz-accept');
    if (action === 'reject') return click('.cmplz-deny');
    return false;
  }
  if (cmp === 'cortiq') {
    if (action === 'accept') return click('#crtq-cb-accept');
    if (action === 'reject') return click('#crtq-cb-necessary');
    const analytics = document.getElementById('crtq-toggle-analytics');
    const marketing = document.getElementById('crtq-toggle-marketing');
    const preferences = document.getElementById('crtq-toggle-preferences');
    if (!analytics || !marketing || !document.getElementById('crtq-cb-save')) return false;
    analytics.checked = action === 'analytics_only';
    marketing.checked = action === 'marketing_only';
    if (preferences) preferences.checked = false;
    return click('#crtq-cb-save');
  }
  return false;
}

/** in-page: visible clickable elements and their text. */
export function inPageCandidates() {
  const els = Array.from(document.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"]'));
  return els.map((el, index) => {
    const r = el.getBoundingClientRect();
    return { index, visible: r.width > 0 && r.height > 0, text: (el.innerText || el.value || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 80) };
  }).filter((c) => c.visible && c.text);
}

/** in-page: click the candidate with this index (same element order as inPageCandidates). */
export function inPageClickCandidate(index) {
  const el = Array.from(document.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"]'))[index];
  if (el) el.click();
  return !!el;
}

/** in-page: is anything that looks like a cookie banner visible? */
export function inPageBannerVisible() {
  return Array.from(document.querySelectorAll('[id*="cookie" i], [class*="cookie" i], [id*="consent" i], [class*="consent" i], [id*="gdpr" i], [class*="cmp" i]'))
    .some((el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 50 && r.height > 20 && s.display !== 'none' && s.visibility !== 'hidden';
    });
}

/** Text-based fallback: index of the best matching consent button, or null. Self-contained (runs in-page). */
export function pickConsentButton(candidates, action) {
  const labels = {
    reject: [
      /^(neka|avvisa|avböj|avslå)( alla)?( cookies| kakor)?$/i,
      /^(reject|decline|deny|refuse)( all)?( cookies)?$/i,
      /^(endast|bara|tillåt endast|acceptera endast|godkänn endast) nödvändiga( cookies| kakor)?$/i,
      /^(only|use|allow|accept) (necessary|essential)( cookies)?( only)?$/i,
      /^necessary (cookies )?only$/i,
    ],
    accept: [
      /^(acceptera|godkänn|tillåt)( alla)?( cookies| kakor)?$/i,
      /^jag (godkänner|accepterar)$/i,
      /^(accept|allow|agree to)( all)?( cookies)?$/i,
      /^i (agree|accept)$/i,
    ],
  };
  for (const re of labels[action] || []) {
    const hit = candidates.find((c) => re.test(c.text));
    if (hit) return hit.index;
  }
  return null;
}

/** in-page: storage keys, gtag consent commands, Enhanced Conversions config, CSP violations, optional HTML. */
export function inPageCollect(withHtml) {
  const keys = [];
  // window.* everywhere so the function also runs in Node tests with a stubbed window.
  try { for (let i = 0; i < window.localStorage.length; i++) keys.push(window.localStorage.key(i)); } catch (e) { /* storage blocked */ }
  try { for (let i = 0; i < window.sessionStorage.length; i++) keys.push(window.sessionStorage.key(i)); } catch (e) { /* storage blocked */ }
  const consentCommands = [];
  let ec = false;
  for (const entry of (window.dataLayer || [])) {
    if (!entry || typeof entry !== 'object' || typeof entry.length !== 'number') continue;   // gtag pushes Arguments objects
    const a = Array.prototype.slice.call(entry);
    if (a[0] === 'consent' && (a[1] === 'default' || a[1] === 'update') && a[2] && typeof a[2] === 'object') {
      const params = {};
      for (const k of Object.keys(a[2])) params[k] = String(a[2][k]);
      consentCommands.push({ kind: a[1], params });
    }
    if ((a[0] === 'config' && a[2] && a[2].allow_enhanced_conversions) || (a[0] === 'set' && a[1] === 'user_data')) ec = true;
  }
  return {
    storageKeys: keys,
    consentCommands,
    ec,
    csp: (window.__tcCsp || []).slice(0, 500),
    html: withHtml ? window.document.documentElement.outerHTML.slice(0, 1000000) : '',
  };
}

async function observeState(browser, state, context, inPageSource) {
  const ctx = await (browser.createBrowserContext ? browser.createBrowserContext() : browser.createIncognitoBrowserContext());
  const p = await ctx.newPage();
  const out = { state, method: state === 'none' ? 'not_needed' : 'not_automated', requests: [], cookies: [], storageKeys: [], cspViolations: [], consentCommands: [], enhancedConversions: false, challenge: false, error: null };
  let cmp = null;
  let html = '';
  const userData = /[?&;]em=|"em"\s*:|user_data/;
  const cookieKey = (c) => `${c.name}|${c.domain}|${c.value}`;
  p.on('request', (r) => {
    const url = r.url();
    if (out.requests.length >= 2000 || !/^https?:/.test(url)) return;
    if (userData.test(url) || userData.test(r.postData() || '')) out.enhancedConversions = true;
    out.requests.push({ url, type: r.resourceType() });
  });
  try {
    if (context.basicAuth) await p.authenticate(context.basicAuth);
    await p.setViewport({ width: 1366, height: 900 });
    await p.evaluateOnNewDocument(() => {
      window.__tcCsp = [];
      document.addEventListener('securitypolicyviolation', (e) => window.__tcCsp.push({ blockedUrl: e.blockedURI, directive: e.effectiveDirective }));
    });
    const res = await p.goto(context.url, { waitUntil: 'load', timeout: 30000 });
    await p.waitForNetworkIdle({ idleTime: 1500, timeout: 10000 }).catch(() => {});
    await p.evaluate(inPageSource);
    const status = res ? res.status() : 0;
    const text = await p.evaluate(() => document.title + ' ' + (document.body ? document.body.innerText.slice(0, 3000) : ''));
    if ([403, 429, 503].includes(status) && /just a moment|attention required|captcha|verify you are human/i.test(text)) {
      out.challenge = true;
      return { out, cmp, html };
    }
    cmp = await p.evaluate(() => window.__tc.detect());
    const cdp = await p.createCDPSession();
    let before = new Set();
    let beforeKeys = new Set();
    if (state !== 'none') {
      before = new Set((await cdp.send('Network.getAllCookies')).cookies.map(cookieKey));
      beforeKeys = new Set((await p.evaluate(() => window.__tc.collect(false))).storageKeys);
      let done = cmp ? await p.evaluate((c, a) => window.__tc.apply(c, a), cmp, state) : false;
      if (done) out.method = 'adapter';
      else if (state === 'accept' || state === 'reject') {
        const idx = await p.evaluate((a) => window.__tc.pick(window.__tc.candidates(), a), state);
        if (idx !== null && await p.evaluate((i) => window.__tc.click(i), idx)) { done = true; out.method = 'text'; }
        else if (!cmp && !(await p.evaluate(() => window.__tc.bannerVisible()))) out.method = 'not_needed';
      }
      if (done) {
        await p.waitForNetworkIdle({ idleTime: 1000, timeout: 8000 }).catch(() => {});
        out.requests.length = 0;   // observe the next page view after the choice
        out.enhancedConversions = false;
        await p.reload({ waitUntil: 'load', timeout: 30000 });
        await p.waitForNetworkIdle({ idleTime: 1500, timeout: 10000 }).catch(() => {});
        await p.evaluate(inPageSource);
      }
    }
    const cookies = (await cdp.send('Network.getAllCookies')).cookies;
    const collected = await p.evaluate((h) => window.__tc.collect(h), state === 'accept' || (state === 'none' && !context.states.includes('accept')));
    out.cookies = cookies.filter((c) => !before.has(cookieKey(c))).map((c) => ({ name: c.name, domain: c.domain }));
    out.storageKeys = collected.storageKeys.filter((k) => !beforeKeys.has(k));
    out.cspViolations = collected.csp;
    out.consentCommands = collected.consentCommands;
    out.enhancedConversions = out.enhancedConversions || collected.ec;
    html = collected.html;
  } catch (e) {
    out.error = (e && e.message) || String(e);
  } finally {
    await ctx.close().catch(() => {});
  }
  return { out, cmp, html };
}

async function probeMain({ page, context, inPageSource }) {
  const browser = page.browser();
  const results = await Promise.all(context.states.map((s) => observeState(browser, s, context, inPageSource)));
  return {
    data: {
      url: context.url,
      cmp: results.map((r) => r.cmp).find(Boolean) || null,
      states: results.map((r) => r.out),
      html: results.map((r) => r.html).find(Boolean) || '',
    },
    type: 'application/json',
  };
}

export function buildProbeSource() {
  const inPage = `window.__tc = { detect: ${inPageDetectCmp}, apply: ${inPageApplyAdapter}, candidates: ${inPageCandidates}, click: ${inPageClickCandidate}, bannerVisible: ${inPageBannerVisible}, pick: ${pickConsentButton}, collect: ${inPageCollect} };`;
  return [
    `const IN_PAGE = ${JSON.stringify(inPage)};`,
    observeState.toString(),
    probeMain.toString(),
    'export default async function ({ page, context }) { return probeMain({ page, context, inPageSource: IN_PAGE }); }',
  ].join('\n');
}
```

If Task 1 showed that `/function` returns the `data` object directly (unwrapped), nothing changes here — `runBrowserProbe` handles both shapes.

- [ ] **Step 4: Write `browserless.ts`**

```ts
// HTTP client for the Browserless /function API.
import { buildProbeSource } from './browser-probe.js';
import { assertSafeUrl } from '../safe-url.ts';
import type { BasicAuth, BrowserObservation, ConsentState } from './types.ts';

export const DEFAULT_BROWSERLESS_URL = 'https://production-sfo.browserless.io';
export type BrowserProbeResult = Omit<BrowserObservation, 'forms'> & { html: string };

export async function runBrowserProbe(opts: {
  endpoint: string; token: string; url: string; states: ConsentState[]; basicAuth: BasicAuth | null; fetchImpl?: typeof fetch;
}): Promise<BrowserProbeResult> {
  await assertSafeUrl(opts.url);
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(`${opts.endpoint.replace(/\/$/, '')}/function?token=${encodeURIComponent(opts.token)}&timeout=90000`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: buildProbeSource(), context: { url: opts.url, states: opts.states, basicAuth: opts.basicAuth } }),
    signal: AbortSignal.timeout(100_000),
  });
  if (!res.ok) throw new Error(`Browserless ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  const data = body && body.type === 'application/json' && body.data ? body.data : body;
  if (!data || !Array.isArray(data.states)) throw new Error('Browserless returned no observation');
  return data as BrowserProbeResult;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test tests/foundation/tracking-check-browser-probe.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 6: Write the live smoke script**

`scripts/tracking-check/probe-smoke.mjs`:

```js
// Runs the real browser probe against a URL and prints what each consent state saw.
// Usage: BROWSERLESS_API_KEY=... node scripts/tracking-check/probe-smoke.mjs https://example.com/ [none,reject,accept]
import { runBrowserProbe, DEFAULT_BROWSERLESS_URL } from '../../supabase/functions/_shared/tracking-check/browserless.ts';
import { vendorForUrl, vendorForName } from '../../supabase/functions/_shared/tracking-vendors.ts';

const [url, states = 'none,reject,accept'] = process.argv.slice(2);
if (!url || !process.env.BROWSERLESS_API_KEY) { console.error('Usage: BROWSERLESS_API_KEY=... node scripts/tracking-check/probe-smoke.mjs <url> [states]'); process.exit(1); }
const obs = await runBrowserProbe({ endpoint: process.env.BROWSERLESS_URL ?? DEFAULT_BROWSERLESS_URL, token: process.env.BROWSERLESS_API_KEY, url, states: states.split(','), basicAuth: null });
console.log(`CMP: ${obs.cmp ?? 'none detected'}`);
for (const s of obs.states) {
  const vendors = [...new Set(s.requests.map((r) => vendorForUrl(r.url)?.id).filter(Boolean))];
  console.log(`\n[${s.state}] method=${s.method}${s.error ? ` error=${s.error}` : ''}${s.challenge ? ' CHALLENGE' : ''}`);
  console.log(`  requests: ${s.requests.length}  vendors: ${vendors.join(', ') || '-'}`);
  console.log(`  new cookies: ${s.cookies.map((c) => `${c.name}${vendorForName(c.name) ? `(${vendorForName(c.name).id})` : ''}`).join(', ') || '-'}`);
  console.log(`  storage: ${s.storageKeys.join(', ') || '-'}  csp violations: ${s.cspViolations.length}  consent: ${JSON.stringify(s.consentCommands)}`);
}
```

- [ ] **Step 7: Verify each CMP adapter against a real site**

With the user's key in the shell, run the script for each site and record the output in `docs/superpowers/plans/notes/2026-10-12-tracking-check-cmp-verification.md` (date, URL, CMP detected, method per state, vendors per state):

| CMP | Site | Expect |
|---|---|---|
| CookieYes | `https://paligo.net/` | `cmp: cookieyes`; `reject` and `accept` method `adapter`; HubSpot in `accept` |
| Cookiebot | `https://www.cookiebot.com/` | `cookiebot`; all five states `adapter` (run with `none,reject,accept,analytics_only,marketing_only`) |
| OneTrust | `https://www.onetrust.com/` | `onetrust`; `reject`/`accept` `adapter`; granular `not_automated` |
| Complianz | `https://complianz.io/` | `complianz`; `reject`/`accept` `adapter` |
| CortIQ | `https://cortiq.se/` | `cortiq`; all five states `adapter` |
| Text fallback | `https://www.pretec.se/` | a CMP or `text` method on reject/accept; note which |

If a site's adapter fails (method `not_automated` although a banner is visible), inspect the banner in Chrome DevTools, fix the selector or API call in `inPageApplyAdapter`, re-run, and record the fix. Do not mark a CMP as supported without a successful run.

- [ ] **Step 8: Run the suite and commit**

Run: `npm run test:foundation`
Expected: all PASS.

```bash
git add supabase/functions/_shared/tracking-check/browser-probe.js supabase/functions/_shared/tracking-check/browserless.ts scripts/tracking-check/probe-smoke.mjs docs/superpowers/plans/notes tests/foundation/tracking-check-browser-probe.test.mjs
git commit -m "feat(tracking-check): browser probe with CMP adapters, verified against live sites"
```

---

### Task 11: Secret box and database migration

**Files:**
- Create: `supabase/functions/_shared/tracking-check/secret-box.ts`
- Create: `supabase/migrations/20261012000001_tracking_check.sql`
- Test: `tests/foundation/tracking-check-secret-box.test.mjs`
- Test: `tests/foundation/tracking-check-db.test.mjs`

**Interfaces:**
- Produces:
  - `seal(plain: string, keyB64: string): Promise<string>`, `open(sealed: string, keyB64: string): Promise<string>`, `randomToken(bytes?: number): string` (base64url, 43 chars for 32 bytes).
  - Tables `tracking_check_runs`, `tracking_check_tasks`, `tracking_check_observations` (unique `task_id`), `tracking_check_findings`.
  - SQL functions (service role only): `tracking_check_claim_tasks(p_kind text, p_limit integer) RETURNS SETOF tracking_check_tasks`, `tracking_check_recover_stale(p_seconds integer) RETURNS void`, `tracking_check_runs_to_finalize() RETURNS SETOF uuid`, `tracking_check_retention() RETURNS void`.
  - Client-readable run columns: `id, user_id, mode, baseline_url, target_url, policy, pages, status, error, summary, share_token, share_expires_at, created_at, finished_at` (**not** `auth_ciphertext`, `auth_expires_at`). Clients must select explicit columns (`select('*')` fails on runs).

- [ ] **Step 1: Write the failing secret-box test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seal, open, randomToken } from '../../supabase/functions/_shared/tracking-check/secret-box.ts';

const key = Buffer.alloc(32, 7).toString('base64');
const otherKey = Buffer.alloc(32, 9).toString('base64');

test('seal and open round-trip with a fresh IV every time', async () => {
  const a = await seal('{"username":"u","password":"p"}', key);
  const b = await seal('{"username":"u","password":"p"}', key);
  assert.notEqual(a, b);
  assert.ok(!a.includes('password'));
  assert.equal(await open(a, key), '{"username":"u","password":"p"}');
});

test('a wrong or malformed key fails', async () => {
  const sealed = await seal('secret', key);
  await assert.rejects(open(sealed, otherKey));
  await assert.rejects(seal('secret', Buffer.alloc(16).toString('base64')), /32 bytes/);
});

test('random tokens are 43 url-safe characters', () => {
  const t = randomToken();
  assert.match(t, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(t, randomToken());
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/foundation/tracking-check-secret-box.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `secret-box.ts`**

```ts
// AES-GCM encryption for short-lived secrets (staging basic auth) and random share tokens.
const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function importKey(keyB64: string) {
  const raw = fromB64(keyB64);
  if (raw.length !== 32) throw new Error('TRACKING_CHECK_AUTH_KEY must be 32 bytes, base64-encoded');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function seal(plain: string, keyB64: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await importKey(keyB64), new TextEncoder().encode(plain)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return toB64(out);
}

export async function open(sealed: string, keyB64: string): Promise<string> {
  const buf = fromB64(sealed);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, await importKey(keyB64), buf.slice(12));
  return new TextDecoder().decode(pt);
}

export function randomToken(bytes = 32): string {
  return toB64(crypto.getRandomValues(new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test tests/foundation/tracking-check-secret-box.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing database test**

`tests/foundation/tracking-check-db.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

// Executes the real migration in PGlite with the Supabase roles and auth.uid() stubbed.
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const migration = readFileSync(new URL('../../supabase/migrations/20261012000001_tracking_check.sql', import.meta.url), 'utf8');

async function setup() {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;`);
  await db.exec(migration);
  return db;
}
async function as(db, role, user, fn) {
  await db.exec(`SET ROLE ${role}; SELECT set_config('request.jwt.claim.sub', '${user ?? ''}', false);`);
  try { return await fn(); } finally { await db.exec('RESET ROLE'); }
}
async function newRun(db, user, status = 'running') {
  const { rows } = await db.query(`INSERT INTO tracking_check_runs (user_id, mode, target_url, status, auth_ciphertext, auth_expires_at)
    VALUES ($1, 'policy', 'https://t.example', $2, 'sealed', now() + interval '1 hour') RETURNING id`, [user, status]);
  return rows[0].id;
}
async function newTask(db, runId, kind = 'fetch', path = '/') {
  const { rows } = await db.query(`INSERT INTO tracking_check_tasks (run_id, site_role, path, kind) VALUES ($1, 'target', $2, $3) RETURNING id`, [runId, path, kind]);
  return rows[0].id;
}

test('users only see their own runs, never the encrypted credentials, and anon sees nothing', async () => {
  const db = await setup();
  const runA = await newRun(db, A);
  await newRun(db, B);
  const own = await as(db, 'authenticated', A, () => db.query('SELECT id FROM tracking_check_runs'));
  assert.deepEqual(own.rows.map((r) => r.id), [runA]);
  await assert.rejects(as(db, 'authenticated', A, () => db.query('SELECT auth_ciphertext FROM tracking_check_runs')), /permission denied/);
  await assert.rejects(as(db, 'anon', null, () => db.query('SELECT id FROM tracking_check_runs')), /permission denied/);
});

test('claiming is atomic and ordered; finished runs are reported for finalising', async () => {
  const db = await setup();
  const run = await newRun(db, A);
  for (const p of ['/a', '/b', '/c']) await newTask(db, run, 'fetch', p);
  await newTask(db, run, 'browser');
  const first = await db.query(`SELECT * FROM tracking_check_claim_tasks('fetch', 2)`);
  assert.deepEqual(first.rows.map((r) => [r.path, r.status, r.attempts]), [['/a', 'running', 1], ['/b', 'running', 1]]);
  assert.equal((await db.query(`SELECT * FROM tracking_check_claim_tasks('fetch', 2)`)).rows.length, 1);
  assert.equal((await db.query('SELECT * FROM tracking_check_runs_to_finalize()')).rows.length, 0);
  await db.exec(`UPDATE tracking_check_tasks SET status = 'done'`);
  assert.deepEqual((await db.query('SELECT tracking_check_runs_to_finalize AS id FROM tracking_check_runs_to_finalize()')).rows.map((r) => r.id), [run]);
});

test('stale running tasks go back to pending, or fail after three attempts', async () => {
  const db = await setup();
  const run = await newRun(db, A);
  const retry = await newTask(db, run, 'browser', '/retry');
  const giveUp = await newTask(db, run, 'browser', '/give-up');
  await db.query(`UPDATE tracking_check_tasks SET status = 'running', claimed_at = now() - interval '10 minutes', attempts = CASE WHEN id = $1 THEN 1 ELSE 3 END`, [retry]);
  await db.query('SELECT tracking_check_recover_stale(300)');
  const { rows } = await db.query('SELECT id, status, error FROM tracking_check_tasks ORDER BY path');
  assert.deepEqual(rows.map((r) => [r.id, r.status]), [[giveUp, 'failed'], [retry, 'pending']]);
  assert.match(rows[0].error, /timed out/);
});

test('retention deletes old observations and clears finished or expired credentials', async () => {
  const db = await setup();
  const done = await newRun(db, A, 'done');
  const running = await newRun(db, A);
  const task = await newTask(db, done);
  await db.query(`INSERT INTO tracking_check_observations (run_id, task_id, data, created_at) VALUES ($1, $2, '{}', now() - interval '91 days')`, [done, task]);
  await db.query('SELECT tracking_check_retention()');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM tracking_check_observations')).rows[0].n, 0);
  const { rows } = await db.query('SELECT id, auth_ciphertext FROM tracking_check_runs');
  assert.equal(rows.find((r) => r.id === done).auth_ciphertext, null);
  assert.equal(rows.find((r) => r.id === running).auth_ciphertext, 'sealed');
});

test('owners can only mark findings as verified; other users cannot touch them', async () => {
  const db = await setup();
  const run = await newRun(db, A);
  const { rows: [f] } = await db.query(`INSERT INTO tracking_check_findings (run_id, sort_order, scope, check_key, title, status) VALUES ($1, 0, 'Manual', 'manual.x', 'X', 'manual') RETURNING id`, [run]);
  await as(db, 'authenticated', A, () => db.query(`UPDATE tracking_check_findings SET verified_by = 'a@example.com', verified_at = now() WHERE id = $1`, [f.id]));
  await assert.rejects(as(db, 'authenticated', A, () => db.query(`UPDATE tracking_check_findings SET status = 'pass' WHERE id = $1`, [f.id])), /permission denied/);
  const other = await as(db, 'authenticated', B, () => db.query(`UPDATE tracking_check_findings SET verified_by = 'b' WHERE id = $1`, [f.id]));
  assert.equal(other.affectedRows, 0);
  assert.equal((await db.query('SELECT verified_by FROM tracking_check_findings')).rows[0].verified_by, 'a@example.com');
});

test('the queue functions are not executable by clients', async () => {
  const db = await setup();
  await assert.rejects(as(db, 'authenticated', A, () => db.query(`SELECT * FROM tracking_check_claim_tasks('fetch', 1)`)), /permission denied/);
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `node --test tests/foundation/tracking-check-db.test.mjs`
Expected: FAIL — `ENOENT` for the migration file.

- [ ] **Step 7: Write the migration**

`supabase/migrations/20261012000001_tracking_check.sql`:

```sql
-- Tracking Check (docs/superpowers/specs/2026-10-12-tracking-check-design.md).
-- Runs belong to the user who created them and are not tied to sites: the checked site
-- does not need CortIQ installed. Edge functions write with the service role. Clients only
-- read their own rows, delete their runs and mark manual findings as verified.

CREATE TABLE public.tracking_check_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  mode text NOT NULL CHECK (mode IN ('comparison', 'policy')),
  baseline_url text,
  target_url text NOT NULL,
  policy jsonb,
  pages jsonb NOT NULL DEFAULT '{"pages":[],"legacy":[]}'::jsonb,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'assessing', 'done', 'failed')),
  error text,
  summary jsonb,
  auth_ciphertext text,
  auth_expires_at timestamptz,
  share_token text UNIQUE,
  share_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CONSTRAINT tracking_check_runs_baseline CHECK ((mode = 'comparison') = (baseline_url IS NOT NULL))
);
CREATE INDEX tracking_check_runs_user_idx ON public.tracking_check_runs (user_id, created_at DESC);

CREATE TABLE public.tracking_check_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.tracking_check_runs(id) ON DELETE CASCADE,
  site_role text NOT NULL CHECK (site_role IN ('baseline', 'target')),
  path text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('fetch', 'browser')),
  legacy boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  error text,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX tracking_check_tasks_pending_idx ON public.tracking_check_tasks (kind, created_at) WHERE status = 'pending';
CREATE INDEX tracking_check_tasks_run_idx ON public.tracking_check_tasks (run_id);

CREATE TABLE public.tracking_check_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.tracking_check_runs(id) ON DELETE CASCADE,
  task_id uuid NOT NULL UNIQUE REFERENCES public.tracking_check_tasks(id) ON DELETE CASCADE,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tracking_check_observations_run_idx ON public.tracking_check_observations (run_id);

CREATE TABLE public.tracking_check_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.tracking_check_runs(id) ON DELETE CASCADE,
  sort_order integer NOT NULL,
  scope text NOT NULL,
  check_key text NOT NULL,
  title text NOT NULL,
  status text NOT NULL CHECK (status IN ('pass', 'fail', 'warning', 'manual', 'untestable')),
  priority text CHECK (priority IN ('high', 'medium', 'low')),
  explanation text NOT NULL DEFAULT '',
  fix text NOT NULL DEFAULT '',
  typical_owner text,
  evidence jsonb NOT NULL DEFAULT '{"pages":[],"details":[]}'::jsonb,
  verified_by text,
  verified_at timestamptz
);
CREATE INDEX tracking_check_findings_run_idx ON public.tracking_check_findings (run_id, sort_order);

-- ── Privileges and RLS ─────────────────────────────────────────────────────────
ALTER TABLE public.tracking_check_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_check_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_check_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_check_findings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.tracking_check_runs, public.tracking_check_tasks, public.tracking_check_observations, public.tracking_check_findings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.tracking_check_runs, public.tracking_check_tasks, public.tracking_check_observations, public.tracking_check_findings TO service_role;

-- auth_ciphertext and auth_expires_at are deliberately not granted.
GRANT SELECT (id, user_id, mode, baseline_url, target_url, policy, pages, status, error, summary, share_token, share_expires_at, created_at, finished_at)
  ON public.tracking_check_runs TO authenticated;
GRANT DELETE ON public.tracking_check_runs TO authenticated;
GRANT SELECT ON public.tracking_check_tasks, public.tracking_check_observations, public.tracking_check_findings TO authenticated;
GRANT UPDATE (verified_by, verified_at) ON public.tracking_check_findings TO authenticated;

CREATE POLICY tracking_check_runs_select_own ON public.tracking_check_runs
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY tracking_check_runs_delete_own ON public.tracking_check_runs
  FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY tracking_check_tasks_select_own ON public.tracking_check_tasks
  FOR SELECT TO authenticated USING (run_id IN (SELECT id FROM public.tracking_check_runs WHERE user_id = auth.uid()));
CREATE POLICY tracking_check_observations_select_own ON public.tracking_check_observations
  FOR SELECT TO authenticated USING (run_id IN (SELECT id FROM public.tracking_check_runs WHERE user_id = auth.uid()));
CREATE POLICY tracking_check_findings_select_own ON public.tracking_check_findings
  FOR SELECT TO authenticated USING (run_id IN (SELECT id FROM public.tracking_check_runs WHERE user_id = auth.uid()));
CREATE POLICY tracking_check_findings_verify_own ON public.tracking_check_findings
  FOR UPDATE TO authenticated
  USING (run_id IN (SELECT id FROM public.tracking_check_runs WHERE user_id = auth.uid()))
  WITH CHECK (run_id IN (SELECT id FROM public.tracking_check_runs WHERE user_id = auth.uid()));

-- ── Queue functions (service role only) ────────────────────────────────────────
CREATE FUNCTION public.tracking_check_claim_tasks(p_kind text, p_limit integer)
RETURNS SETOF public.tracking_check_tasks LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.tracking_check_tasks t
     SET status = 'running', attempts = t.attempts + 1, claimed_at = now()
   WHERE t.id IN (
     SELECT id FROM public.tracking_check_tasks
      WHERE status = 'pending' AND kind = p_kind
      ORDER BY created_at
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED)
  RETURNING t.*;
$$;

CREATE FUNCTION public.tracking_check_recover_stale(p_seconds integer)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.tracking_check_tasks
     SET status = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'pending' END,
         error = coalesce(error, 'Worker timed out')
   WHERE status = 'running' AND claimed_at < now() - make_interval(secs => p_seconds);
$$;

CREATE FUNCTION public.tracking_check_runs_to_finalize()
RETURNS SETOF uuid LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id FROM public.tracking_check_runs r
   WHERE r.status = 'running'
     AND NOT EXISTS (SELECT 1 FROM public.tracking_check_tasks t WHERE t.run_id = r.id AND t.status IN ('pending', 'running'));
$$;

CREATE FUNCTION public.tracking_check_retention()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.tracking_check_observations WHERE created_at < now() - interval '90 days';
  UPDATE public.tracking_check_runs
     SET auth_ciphertext = NULL, auth_expires_at = NULL
   WHERE auth_ciphertext IS NOT NULL AND (status IN ('done', 'failed') OR auth_expires_at < now());
$$;

REVOKE ALL ON FUNCTION public.tracking_check_claim_tasks(text, integer), public.tracking_check_recover_stale(integer),
  public.tracking_check_runs_to_finalize(), public.tracking_check_retention() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tracking_check_claim_tasks(text, integer), public.tracking_check_recover_stale(integer),
  public.tracking_check_runs_to_finalize(), public.tracking_check_retention() TO service_role;

-- Hourly retention (credentials expire after 2 hours). pg_cron is not available in every environment.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('tracking-check-retention', '17 * * * *', 'select public.tracking_check_retention()');
  END IF;
END $$;
```

`created_at` on tasks uses `clock_timestamp()` so tasks inserted in one statement keep their insertion order for `ORDER BY created_at`.

- [ ] **Step 8: Run the database test**

Run: `node --test tests/foundation/tracking-check-db.test.mjs`
Expected: PASS (6 tests). If PGlite reports `affectedRows` under another name, print the result object once and use the field it returns.

- [ ] **Step 9: Commit**

```bash
git add supabase/functions/_shared/tracking-check/secret-box.ts supabase/migrations/20261012000001_tracking_check.sql tests/foundation/tracking-check-secret-box.test.mjs tests/foundation/tracking-check-db.test.mjs
git commit -m "feat(tracking-check): schema, RLS, queue functions and credential encryption"
```

---

### Task 12: Worker core

**Files:**
- Create: `supabase/functions/_shared/tracking-check/worker-core.ts`
- Test: `tests/foundation/tracking-check-worker-core.test.mjs`

**Interfaces:**
- Consumes: `assess` (Tasks 6–8), `summarize`, `ReportSummary` (Task 9), types (Task 2).
- Produces:
  - `interface TaskRow { id: string; run_id: string; site_role: SiteRole; path: string; kind: 'fetch' | 'browser'; legacy: boolean; attempts: number; status: 'pending' | 'running' | 'done' | 'failed'; error: string | null }`
  - `interface RunRow { id: string; mode: Mode; baseline_url: string | null; target_url: string; policy: PolicyTemplate | null; auth_ciphertext: string | null }`
  - `interface TaskResult { task: TaskRow; data: FetchObservation | BrowserObservation | null }`
  - `interface TrackingCheckStore { recoverStale(s: number); claimTasks(kind, limit): Promise<TaskRow[]>; getRun(id): Promise<RunRow>; saveObservation(task, data); completeTask(id); failTask(id, error, retry: boolean); runsToFinalize(): Promise<string[]>; beginAssessing(id): Promise<boolean>; loadResults(id): Promise<TaskResult[]>; saveResults(id, findings, summary); failRun(id, error); hasPendingWork(): Promise<boolean> }` (all methods async)
  - `interface Probes { fetchProbe(url, auth): Promise<FetchObservation>; browserProbe(url, states, auth): Promise<BrowserObservation>; openAuth(ciphertext): Promise<BasicAuth> }`
  - `MAX_ATTEMPTS = 3`, `statesFor(mode): ConsentState[]`, `pageUrl(run, task): string`, `buildSites(run, results): { target: SiteObservation; baseline: SiteObservation | null }`, `processBatch(store, probes, limits?): Promise<{ processed: number; finalized: string[]; more: boolean }>`.

Behaviour: claim up to 8 fetch tasks; if none, claim 1 browser task. A probe error retries the task (back to `pending`) until `attempts` reaches 3, then marks it `failed` (no observation). After the batch, every run with no open tasks is finalised once (`beginAssessing` is atomic). A finalisation error marks the run `failed`.

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processBatch, buildSites, statesFor } from '../../supabase/functions/_shared/tracking-check/worker-core.ts';
import { fetchOk, st, req } from './tracking-check-fixtures.mjs';

function fakeStore(run, tasks) {
  const s = { run: { ...run }, tasks: tasks.map((t, i) => ({ id: `t${i}`, run_id: run.id, legacy: false, attempts: 0, status: 'pending', error: null, ...t })),
    observations: new Map(), results: null, failed: null, assessing: false };
  return Object.assign(s, {
    async recoverStale() {},
    async claimTasks(kind, limit) {
      const picked = s.tasks.filter((t) => t.status === 'pending' && t.kind === kind).slice(0, limit);
      for (const t of picked) { t.status = 'running'; t.attempts++; }
      return picked.map((t) => ({ ...t }));
    },
    async getRun() { return { ...s.run }; },
    async saveObservation(task, data) { s.observations.set(task.id, data); },
    async completeTask(id) { s.tasks.find((t) => t.id === id).status = 'done'; },
    async failTask(id, error, retry) { const t = s.tasks.find((x) => x.id === id); t.status = retry ? 'pending' : 'failed'; t.error = error; },
    async runsToFinalize() { return !s.assessing && s.tasks.every((t) => t.status === 'done' || t.status === 'failed') ? [s.run.id] : []; },
    async beginAssessing() { if (s.assessing) return false; s.assessing = true; return true; },
    async loadResults() { return s.tasks.map((t) => ({ task: { ...t }, data: s.observations.get(t.id) ?? null })); },
    async saveResults(id, findings, summary) { s.results = { findings, summary }; s.run.status = 'done'; },
    async failRun(id, error) { s.failed = error; s.run.status = 'failed'; },
    async hasPendingWork() { return s.tasks.some((t) => t.status === 'pending' || t.status === 'running'); },
  });
}
const browserObs = (url) => ({ url, cmp: 'cookieyes', states: [st('none'), st('reject'), st('accept', { requests: [req('https://js.hs-scripts.com/1.js')] })], forms: [] });
async function drain(store, probes) { for (let i = 0; i < 20; i++) { const r = await processBatch(store, probes); if (!r.more) return r; } throw new Error('did not finish'); }

test('drains a comparison run: fetch tasks first, then browser tasks, then assesses once', async () => {
  const run = { id: 'r1', mode: 'comparison', baseline_url: 'https://old.example', target_url: 'https://new.example', policy: null, auth_ciphertext: null };
  const store = fakeStore(run, [
    { site_role: 'baseline', path: '/pricing/', kind: 'fetch' }, { site_role: 'target', path: '/pricing/', kind: 'fetch' },
    { site_role: 'baseline', path: '/pricing/', kind: 'browser' }, { site_role: 'target', path: '/pricing/', kind: 'browser' },
  ]);
  const calls = [];
  const probes = {
    fetchProbe: async (url) => { calls.push(['fetch', url]); return fetchOk('/pricing/'); },
    browserProbe: async (url, states) => { calls.push(['browser', url, states.join(',')]); return browserObs(url); },
    openAuth: async () => { throw new Error('no auth expected'); },
  };
  const first = await processBatch(store, probes);
  assert.equal(first.processed, 2);
  assert.deepEqual(calls.map((c) => c[0]), ['fetch', 'fetch']);
  await drain(store, probes);
  assert.deepEqual(calls.slice(2), [['browser', 'https://old.example/pricing/', 'none,reject,accept'], ['browser', 'https://new.example/pricing/', 'none,reject,accept']]);
  assert.equal(store.run.status, 'done');
  assert.ok(store.results.findings.some((f) => f.checkKey === 'tags.present' && f.status === 'pass'));
  assert.match(store.results.summary.headline, /No blocking problems/);
});

test('retries a failing probe and marks the page untestable after three attempts', async () => {
  const run = { id: 'r2', mode: 'policy', baseline_url: null, target_url: 'https://new.example', policy: null, auth_ciphertext: 'sealed' };
  const store = fakeStore(run, [{ site_role: 'target', path: '/', kind: 'fetch' }, { site_role: 'target', path: '/', kind: 'browser' }]);
  let opened = 0;
  const probes = {
    fetchProbe: async (_url, auth) => { assert.deepEqual(auth, { username: 'u', password: 'p' }); return fetchOk('/'); },
    browserProbe: async () => { throw new Error('Browserless 500'); },
    openAuth: async () => { opened++; return { username: 'u', password: 'p' }; },
  };
  await drain(store, probes);
  assert.equal(store.tasks[1].attempts, 3);
  assert.equal(store.tasks[1].status, 'failed');
  assert.ok(opened >= 1);
  const coverage = store.results.findings.find((f) => f.checkKey === 'coverage.untestable');
  assert.match(coverage.evidence.details[0], /Browserless 500/);
});

test('a finalisation error marks the run failed instead of leaving it running', async () => {
  const run = { id: 'r3', mode: 'policy', baseline_url: null, target_url: 'https://new.example', policy: null, auth_ciphertext: null };
  const store = fakeStore(run, [{ site_role: 'target', path: '/', kind: 'browser' }]);
  const probes = { fetchProbe: async () => fetchOk('/'), browserProbe: async () => ({ url: 'x', cmp: null, states: null, forms: [] }), openAuth: async () => null };
  await drain(store, probes);
  assert.equal(store.run.status, 'failed');
  assert.ok(store.failed);
});

test('buildSites groups tasks by role and path and keeps legacy pages separate', () => {
  const run = { id: 'r', mode: 'comparison', baseline_url: 'https://old.example', target_url: 'https://new.example', policy: null, auth_ciphertext: null };
  const t = (id, site_role, path, kind, extra = {}) => ({ id, run_id: 'r', site_role, path, kind, legacy: false, attempts: 1, status: 'done', error: null, ...extra });
  const { target, baseline } = buildSites(run, [
    { task: t('1', 'target', '/', 'fetch'), data: fetchOk('/') },
    { task: t('2', 'target', '/', 'browser', { status: 'failed', error: 'timeout' }), data: null },
    { task: t('3', 'target', '/', 'fetch', { legacy: true }), data: fetchOk('/') },
    { task: t('4', 'baseline', '/', 'fetch'), data: fetchOk('/') },
  ]);
  assert.equal(target.pages.length, 2);
  const home = target.pages.find((p) => !p.legacy);
  assert.equal(home.failed, 'timeout');
  assert.ok(home.fetch);
  assert.equal(baseline.origin, 'https://old.example');
  assert.deepEqual(statesFor('policy'), ['none', 'reject', 'accept', 'analytics_only', 'marketing_only']);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/foundation/tracking-check-worker-core.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `worker-core.ts`**

```ts
// Queue processing for Tracking Check, independent of Supabase so it can be tested with a fake store.
import { assess } from './assess/index.ts';
import { summarize, type ReportSummary } from './report.ts';
import type {
  BasicAuth, BrowserObservation, ConsentState, FetchObservation, Finding, Mode, PageObservation, PolicyTemplate, SiteObservation, SiteRole,
} from './types.ts';

export interface TaskRow {
  id: string; run_id: string; site_role: SiteRole; path: string; kind: 'fetch' | 'browser'; legacy: boolean;
  attempts: number; status: 'pending' | 'running' | 'done' | 'failed'; error: string | null;
}
export interface RunRow { id: string; mode: Mode; baseline_url: string | null; target_url: string; policy: PolicyTemplate | null; auth_ciphertext: string | null }
export interface TaskResult { task: TaskRow; data: FetchObservation | BrowserObservation | null }

export interface TrackingCheckStore {
  recoverStale(olderThanSeconds: number): Promise<void>;
  claimTasks(kind: 'fetch' | 'browser', limit: number): Promise<TaskRow[]>;
  getRun(runId: string): Promise<RunRow>;
  saveObservation(task: TaskRow, data: FetchObservation | BrowserObservation): Promise<void>;
  completeTask(taskId: string): Promise<void>;
  failTask(taskId: string, error: string, retry: boolean): Promise<void>;
  runsToFinalize(): Promise<string[]>;
  beginAssessing(runId: string): Promise<boolean>;
  loadResults(runId: string): Promise<TaskResult[]>;
  saveResults(runId: string, findings: Finding[], summary: ReportSummary): Promise<void>;
  failRun(runId: string, error: string): Promise<void>;
  hasPendingWork(): Promise<boolean>;
}

export interface Probes {
  fetchProbe(url: string, auth: BasicAuth | null): Promise<FetchObservation>;
  browserProbe(url: string, states: ConsentState[], auth: BasicAuth | null): Promise<BrowserObservation>;
  openAuth(ciphertext: string): Promise<BasicAuth>;
}

export const MAX_ATTEMPTS = 3;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function statesFor(mode: Mode): ConsentState[] {
  return mode === 'policy' ? ['none', 'reject', 'accept', 'analytics_only', 'marketing_only'] : ['none', 'reject', 'accept'];
}

export function pageUrl(run: RunRow, task: TaskRow): string {
  return new URL(task.path, task.site_role === 'baseline' ? run.baseline_url! : run.target_url).toString();
}

export async function processBatch(store: TrackingCheckStore, probes: Probes, limits = { fetch: 8, browser: 1 }) {
  await store.recoverStale(300);
  let tasks = await store.claimTasks('fetch', limits.fetch);
  if (!tasks.length) tasks = await store.claimTasks('browser', limits.browser);

  const runs = new Map<string, RunRow>();
  const auths = new Map<string, BasicAuth | null>();
  for (const task of tasks) {
    try {
      let run = runs.get(task.run_id);
      if (!run) { run = await store.getRun(task.run_id); runs.set(run.id, run); }
      if (!auths.has(run.id)) auths.set(run.id, run.auth_ciphertext ? await probes.openAuth(run.auth_ciphertext) : null);
      const auth = auths.get(run.id) ?? null;
      const url = pageUrl(run, task);
      const data = task.kind === 'fetch' ? await probes.fetchProbe(url, auth) : await probes.browserProbe(url, statesFor(run.mode), auth);
      await store.saveObservation(task, data);
      await store.completeTask(task.id);
    } catch (e) {
      await store.failTask(task.id, message(e), task.attempts < MAX_ATTEMPTS);
    }
  }

  const finalized: string[] = [];
  for (const runId of await store.runsToFinalize()) {
    if (!(await store.beginAssessing(runId))) continue;
    try {
      const run = await store.getRun(runId);
      const { target, baseline } = buildSites(run, await store.loadResults(runId));
      const findings = assess({ mode: run.mode, target, baseline, policy: run.policy });
      await store.saveResults(runId, findings, summarize(findings, run.mode));
      finalized.push(runId);
    } catch (e) {
      await store.failRun(runId, message(e));
    }
  }
  return { processed: tasks.length, finalized, more: await store.hasPendingWork() };
}

export function buildSites(run: RunRow, results: TaskResult[]): { target: SiteObservation; baseline: SiteObservation | null } {
  const byRole = new Map<SiteRole, Map<string, PageObservation>>();
  for (const { task, data } of results) {
    if (!byRole.has(task.site_role)) byRole.set(task.site_role, new Map());
    const pages = byRole.get(task.site_role)!;
    const key = `${task.legacy ? 'legacy:' : ''}${task.path}`;
    const page = pages.get(key) ?? { path: task.path, legacy: task.legacy, fetch: null, browser: null, failed: null };
    if (!data) page.failed = task.error ?? 'No result';
    else if (task.kind === 'fetch') page.fetch = data as FetchObservation;
    else page.browser = data as BrowserObservation;
    pages.set(key, page);
  }
  const site = (role: SiteRole, url: string): SiteObservation => ({ role, origin: new URL(url).origin, pages: [...(byRole.get(role)?.values() ?? [])] });
  return {
    target: site('target', run.target_url),
    baseline: run.mode === 'comparison' && run.baseline_url ? site('baseline', run.baseline_url) : null,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/foundation/tracking-check-worker-core.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/tracking-check/worker-core.ts tests/foundation/tracking-check-worker-core.test.mjs
git commit -m "feat(tracking-check): worker core with retries and single finalisation"
```

---

### Task 13: Edge functions (start, worker, report)

**Files:**
- Create: `supabase/functions/_shared/tracking-check/kick.ts`
- Create: `supabase/functions/tracking-check-start/index.ts`
- Create: `supabase/functions/tracking-check-worker/index.ts`
- Create: `supabase/functions/tracking-check-worker/store.ts`
- Create: `supabase/functions/tracking-check-report/index.ts`
- Modify: `supabase/config.toml` (three `[functions.*]` entries)
- Test: `tests/foundation/tracking-check-edge.test.mjs`

**Interfaces:**
- Consumes: everything above.
- Produces (HTTP):
  - `POST tracking-check-start` (JWT) body `{ action, ... }`:
    - `access` → `{ allowed: boolean }`
    - `suggest { url }` → `{ pages: SuggestedPage[] }`
    - `create { mode, baselineUrl?, targetUrl, pages: string[], legacyPaths?: string[], policy?, basicAuth?: { username, password } }` → `{ runId }` (400 invalid input, 403 not allowlisted, 429 daily limit)
    - `status { runId }` → `{ status, progress: { total, done, failed, running, pending } }` (re-kicks a stalled worker)
    - `share { runId, expiresInDays?: number | null }` → `{ token }`; `revoke { runId }` → `{ ok: true }`
  - `POST tracking-check-worker` (header `x-worker-secret`) → 202 in production (work continues in `EdgeRuntime.waitUntil`), or the batch result when `EdgeRuntime` is absent (tests).
  - `GET tracking-check-report?token=…` (public) → `{ run: { mode, baselineUrl, targetUrl, finishedAt, summary }, findings: [{ scope, checkKey, title, status, priority, explanation, fix, typicalOwner, evidence, verified, verifiedAt }] }`; 404 for unknown, revoked, expired or unfinished.
  - `kickWorker(): void` in `kick.ts`.

Worker lifetime: one invocation runs batches for up to 30 s of wall time (then at most one more browser task of ≤ 100 s fits under Supabase's 150 s limit), then re-kicks itself if work remains. The worker answers 202 immediately and works in `EdgeRuntime.waitUntil`, so a kick's `fetch` resolves quickly. The `status` action re-kicks the worker when no task has been claimed for 2 minutes — the safety net if a chain breaks.

- [ ] **Step 1: Write the failing edge tests**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEdge } from './edge-harness.mjs';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ENV = {
  SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service',
  TRACKING_CHECK_ALLOWED_EMAILS: 'Daniel@Expandtalk.se, other@example.com', TRACKING_CHECK_WORKER_SECRET: 's3cret',
  TRACKING_CHECK_AUTH_KEY: Buffer.alloc(32, 7).toString('base64'), BROWSERLESS_API_KEY: 'bl', BROWSERLESS_URL: 'https://bl.example',
};

function mockClient({ user = { id: A, email: 'daniel@expandtalk.se' }, runsToday = 0, run = null, tasks = [], findings = [] } = {}) {
  const calls = { inserts: [], updates: [], rpc: [] };
  const client = {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    rpc: async (name, args) => { calls.rpc.push([name, args]); return { data: [], error: null }; },
    from(table) {
      const op = { table, type: 'select', head: false, filters: [] };
      const result = () => {
        if (op.head) return { count: table === 'tracking_check_runs' ? runsToday : 0, error: null };
        if (op.type !== 'select') return { data: op.returning ? [{ id: 'x' }] : null, error: null };
        if (table === 'tracking_check_tasks') return { data: tasks, error: null };
        if (table === 'tracking_check_findings') return { data: findings, error: null };
        return { data: [], error: null };
      };
      const q = {
        select(_cols, opts) { if (opts?.head) op.head = true; if (op.type !== 'select') op.returning = true; return q; },
        insert(payload) { op.type = 'insert'; calls.inserts.push({ table, payload }); return q; },
        update(payload) { op.type = 'update'; calls.updates.push({ table, payload, filters: op.filters }); return q; },
        upsert(payload) { op.type = 'upsert'; calls.inserts.push({ table, payload }); return q; },
        eq(k, v) { op.filters.push([k, v]); return q; },
        gte() { return q; }, in() { return q; }, order() { return q; }, limit() { return q; },
        single: async () => ({ data: op.type === 'insert' ? { id: 'run-1' } : run, error: null }),
        maybeSingle: async () => ({ data: run, error: null }),
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
      };
      return q;
    },
  };
  return { client, calls };
}

function edge(name, db, { env = ENV } = {}) {
  const fetches = [];
  const fetch = async (url, init = {}) => { fetches.push({ url: String(url), headers: init.headers ?? {} }); return new Response(null, { status: 202 }); };
  return { handler: loadEdge(name, db.client, { env, fetch }), fetches };
}
const post = (handler, body) => handler(new Request('https://x.example/', { method: 'POST', headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
const createBody = (extra = {}) => ({ action: 'create', mode: 'comparison', baselineUrl: 'https://old.example/some/path', targetUrl: 'https://new.example', pages: ['/', 'pricing/'], legacyPaths: ['/product/'], ...extra });

test('start: requires a user and the allowlist', async () => {
  assert.equal((await post(edge('tracking-check-start', mockClient({ user: null })).handler, { action: 'access' })).status, 401);
  assert.deepEqual(await (await post(edge('tracking-check-start', mockClient()).handler, { action: 'access' })).json(), { allowed: true });
  const outsider = mockClient({ user: { id: A, email: 'someone@else.com' } });
  assert.deepEqual(await (await post(edge('tracking-check-start', outsider).handler, { action: 'access' })).json(), { allowed: false });
  assert.equal((await post(edge('tracking-check-start', outsider).handler, createBody())).status, 403);
});

test('start: validates URLs, page caps and the daily limit', async () => {
  const { handler } = edge('tracking-check-start', mockClient());
  const blocked = await post(handler, createBody({ targetUrl: 'http://169.254.169.254' }));
  assert.equal(blocked.status, 400);
  assert.match((await blocked.json()).error, /Blocked host/);
  assert.equal((await post(handler, createBody({ pages: Array.from({ length: 26 }, (_, i) => `/p${i}`) }))).status, 400);
  assert.equal((await post(handler, createBody({ mode: 'policy', baselineUrl: undefined, pages: Array.from({ length: 16 }, (_, i) => `/p${i}`) }))).status, 400);
  assert.equal((await post(handler, createBody({ pages: [] }))).status, 400);
  assert.equal((await post(edge('tracking-check-start', mockClient({ runsToday: 10 })).handler, createBody())).status, 429);
});

test('start: create stores the run, one task per page/site/kind plus legacy, seals credentials and kicks the worker', async () => {
  const db = mockClient();
  const { handler, fetches } = edge('tracking-check-start', db);
  const res = await post(handler, createBody({ basicAuth: { username: 'stage', password: 'pw-secret' } }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { runId: 'run-1' });
  const run = db.calls.inserts.find((i) => i.table === 'tracking_check_runs').payload;
  assert.equal(run.baseline_url, 'https://old.example');
  assert.equal(run.user_id, A);
  assert.ok(run.auth_ciphertext && !run.auth_ciphertext.includes('pw-secret'));
  assert.deepEqual(run.pages, { pages: ['/', '/pricing/'], legacy: ['/product/'] });
  const tasks = db.calls.inserts.find((i) => i.table === 'tracking_check_tasks').payload;
  assert.equal(tasks.length, 2 * 2 * 2 + 1);
  assert.equal(tasks.filter((t) => t.legacy).length, 1);
  assert.equal(fetches[0].url, 'https://proj.supabase.co/functions/v1/tracking-check-worker');
  assert.equal(fetches[0].headers['x-worker-secret'], 's3cret');
});

test('start: status hides other users runs and re-kicks a stalled worker', async () => {
  const foreign = edge('tracking-check-start', mockClient({ run: { id: 'r', status: 'running', user_id: 'someone-else' } }));
  assert.equal((await post(foreign.handler, { action: 'status', runId: 'r' })).status, 404);
  const stalled = edge('tracking-check-start', mockClient({ run: { id: 'r', status: 'running', user_id: A },
    tasks: [{ status: 'pending', claimed_at: null }, { status: 'done', claimed_at: new Date(Date.now() - 600000).toISOString() }] }));
  const body = await (await post(stalled.handler, { action: 'status', runId: 'r' })).json();
  assert.deepEqual(body, { status: 'running', progress: { total: 2, done: 1, failed: 0, running: 0, pending: 1 } });
  assert.equal(stalled.fetches.length, 1);
});

test('worker: rejects calls without the secret and processes an empty queue', async () => {
  const db = mockClient();
  const { handler } = edge('tracking-check-worker', db);
  assert.equal((await handler(new Request('https://x.example/', { method: 'POST' }))).status, 401);
  assert.equal((await edge('tracking-check-worker', db, { env: { ...ENV, TRACKING_CHECK_WORKER_SECRET: '' } }).handler(
    new Request('https://x.example/', { method: 'POST', headers: { 'x-worker-secret': '' } }))).status, 401);
  const ok = await handler(new Request('https://x.example/', { method: 'POST', headers: { 'x-worker-secret': 's3cret' } }));
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).processed, 0);
  assert.ok(db.calls.rpc.some(([name]) => name === 'tracking_check_claim_tasks'));
});

test('report: 404 for malformed, unknown or expired tokens; shared findings omit who verified them', async () => {
  const token = 'A'.repeat(43);
  const get = (h, t) => h(new Request(`https://x.example/?token=${t}`));
  assert.equal((await get(edge('tracking-check-report', mockClient()).handler, 'short')).status, 404);
  assert.equal((await get(edge('tracking-check-report', mockClient({ run: null })).handler, token)).status, 404);
  const expired = mockClient({ run: { id: 'r', status: 'done', share_expires_at: '2000-01-01T00:00:00Z' } });
  assert.equal((await get(edge('tracking-check-report', expired).handler, token)).status, 404);
  const ok = mockClient({
    run: { id: 'r', mode: 'policy', baseline_url: null, target_url: 'https://new.example', status: 'done', summary: { headline: 'h' }, finished_at: '2026-10-12T10:00:00Z', share_expires_at: null },
    findings: [{ scope: 'Manual', check_key: 'manual.x', title: 'X', status: 'manual', priority: 'medium', explanation: '', fix: '', typical_owner: null, evidence: { pages: [], details: [] }, verified_at: '2026-10-12T11:00:00Z', verified_by: 'daniel@expandtalk.se' }],
  });
  const body = await (await get(edge('tracking-check-report', ok).handler, token)).json();
  assert.equal(body.run.targetUrl, 'https://new.example');
  assert.equal(body.findings[0].verified, true);
  assert.equal(body.findings[0].checkKey, 'manual.x');
  assert.ok(!JSON.stringify(body).includes('daniel@'));
});
```

Note: the report handler must select explicit columns **without** `verified_by`; the mock returns it anyway, so the handler must also map rows to the public shape (it does, below).

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/foundation/tracking-check-edge.test.mjs`
Expected: FAIL — `ENOENT` for `tracking-check-start/index.ts`.

- [ ] **Step 3: Write `kick.ts`**

```ts
// Starts or continues the Tracking Check worker without waiting for its work to finish.
// The worker answers 202 at once and continues in EdgeRuntime.waitUntil.
export function kickWorker(): void {
  const pending = fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/tracking-check-worker`, {
    method: 'POST',
    headers: { 'x-worker-secret': Deno.env.get('TRACKING_CHECK_WORKER_SECRET') ?? '' },
  })
    .then((res) => res.body?.cancel())
    .catch((e) => console.error('tracking-check: worker kick failed', e));
  // deno-lint-ignore no-explicit-any
  (globalThis as any).EdgeRuntime?.waitUntil?.(pending);
}
```

- [ ] **Step 4: Write `tracking-check-start/index.ts`**

```ts
// Internal Tracking Check API: access check, page suggestions, run creation, status and sharing.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { assertSafeUrl } from '../_shared/safe-url.ts';
import { fetchSitemapUrls, suggestPages } from '../_shared/tracking-check/pages.ts';
import { randomToken, seal } from '../_shared/tracking-check/secret-box.ts';
import { kickWorker } from '../_shared/tracking-check/kick.ts';
import type { Mode, PolicyTemplate } from '../_shared/tracking-check/types.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

export const LIMITS = { comparisonPages: 25, policyPages: 15, legacyPaths: 25, runsPerDay: 10, authHours: 2 };
class InputError extends Error {}

// deno-lint-ignore no-explicit-any
type Db = any;
// deno-lint-ignore no-explicit-any
type Body = Record<string, any>;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
  const { data } = await userClient.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
  const user = data?.user;
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const allowlist = (Deno.env.get('TRACKING_CHECK_ALLOWED_EMAILS') ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const allowed = !!user.email && allowlist.includes(user.email.toLowerCase());

  let body: Body;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (body?.action === 'access') return json({ allowed });
  if (!allowed) return json({ error: 'Forbidden' }, 403);

  const service: Db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  try {
    switch (body.action) {
      case 'suggest': return json(await suggest(body));
      case 'create': return await create(body, user.id, service);
      case 'status': return await status(body, user.id, service);
      case 'share': return await share(body, user.id, service);
      case 'revoke': return await revoke(body, user.id, service);
      default: return json({ error: 'Unknown action' }, 400);
    }
  } catch (e) {
    if (e instanceof InputError) return json({ error: e.message }, 400);
    console.error('tracking-check-start', e);
    return json({ error: 'Internal error' }, 500);
  }
});

async function siteOrigin(raw: unknown): Promise<string> {
  if (typeof raw !== 'string' || !raw.trim()) throw new InputError('Site URL is required');
  try { return (await assertSafeUrl(raw.trim())).origin; } catch (e) { throw new InputError(e instanceof Error ? e.message : 'Invalid URL'); }
}

function cleanPaths(list: unknown, max: number, label: string): string[] {
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list)) throw new InputError(`${label} must be a list`);
  const paths = [...new Set(list.map((p) => String(p).trim()).filter(Boolean).map((p) => (p.startsWith('/') ? p : `/${p}`)))];
  if (paths.some((p) => p.length > 500 || /\s/.test(p))) throw new InputError(`Invalid ${label}`);
  if (paths.length > max) throw new InputError(`At most ${max} ${label} per run`);
  return paths;
}

function parsePolicy(raw: unknown): PolicyTemplate {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Body;
  const flag = (k: string) => p[k] === true;
  const ids = Array.isArray(p.expectedIds) ? p.expectedIds.map((s: unknown) => String(s).trim()).filter(Boolean) : [];
  if (ids.length > 20 || ids.some((id: string) => !/^[A-Za-z0-9-]{3,40}$/.test(id))) throw new InputError('Invalid expected IDs');
  const items = Array.isArray(p.manualItems) ? p.manualItems : [];
  if (items.length > 10) throw new InputError('At most 10 manual items');
  const manualItems = items.map((i: Body) => ({ key: String(i?.key ?? ''), label: String(i?.label ?? '').slice(0, 200) }));
  if (manualItems.some((i: { key: string; label: string }) => !/^[a-z0-9_]{1,40}$/.test(i.key) || !i.label)) throw new InputError('Invalid manual items');
  return {
    noGoogleBeforeConsent: flag('noGoogleBeforeConsent'), consentDefaultsDenied: flag('consentDefaultsDenied'),
    ga4RequiresAnalytics: flag('ga4RequiresAnalytics'), adsRequiresMarketing: flag('adsRequiresMarketing'),
    enhancedConversionsOff: flag('enhancedConversionsOff'), noUnknownVendorsAfterReject: flag('noUnknownVendorsAfterReject'),
    expectedIds: ids, manualItems,
  };
}

async function suggest(body: Body) {
  const origin = await siteOrigin(body.url);
  return { pages: suggestPages(await fetchSitemapUrls(origin), origin) };
}

async function create(body: Body, userId: string, service: Db) {
  const mode: Mode = body.mode === 'policy' ? 'policy' : body.mode === 'comparison' ? 'comparison' : (() => { throw new InputError('mode must be comparison or policy'); })();
  const target = await siteOrigin(body.targetUrl);
  const baseline = mode === 'comparison' ? await siteOrigin(body.baselineUrl) : null;
  const pages = cleanPaths(body.pages, mode === 'policy' ? LIMITS.policyPages : LIMITS.comparisonPages, 'pages');
  if (!pages.length) throw new InputError('Select at least one page');
  const legacy = mode === 'comparison' ? cleanPaths(body.legacyPaths, LIMITS.legacyPaths, 'legacy URLs') : [];
  const policy = mode === 'policy' ? parsePolicy(body.policy) : null;

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await service.from('tracking_check_runs').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', since);
  if ((count ?? 0) >= LIMITS.runsPerDay) return json({ error: `Daily limit of ${LIMITS.runsPerDay} runs reached` }, 429);

  let auth_ciphertext: string | null = null;
  let auth_expires_at: string | null = null;
  if (body.basicAuth?.username) {
    auth_ciphertext = await seal(JSON.stringify({ username: String(body.basicAuth.username), password: String(body.basicAuth.password ?? '') }), Deno.env.get('TRACKING_CHECK_AUTH_KEY')!);
    auth_expires_at = new Date(Date.now() + LIMITS.authHours * 3600 * 1000).toISOString();
  }

  const { data: run, error } = await service.from('tracking_check_runs')
    .insert({ user_id: userId, mode, baseline_url: baseline, target_url: target, policy, pages: { pages, legacy }, auth_ciphertext, auth_expires_at })
    .select('id').single();
  if (error) throw error;

  const roles = mode === 'comparison' ? ['baseline', 'target'] : ['target'];
  const tasks: Body[] = [];
  for (const path of pages) for (const site_role of roles) for (const kind of ['fetch', 'browser']) tasks.push({ run_id: run.id, site_role, path, kind, legacy: false });
  for (const path of legacy) tasks.push({ run_id: run.id, site_role: 'target', path, kind: 'fetch', legacy: true });
  const { error: taskError } = await service.from('tracking_check_tasks').insert(tasks);
  if (taskError) throw taskError;

  kickWorker();
  return json({ runId: run.id });
}

async function ownRun(runId: unknown, userId: string, service: Db) {
  if (typeof runId !== 'string') return null;
  const { data } = await service.from('tracking_check_runs').select('id, status, user_id').eq('id', runId).maybeSingle();
  return data && data.user_id === userId ? data : null;
}

async function status(body: Body, userId: string, service: Db) {
  const run = await ownRun(body.runId, userId, service);
  if (!run) return json({ error: 'Not found' }, 404);
  const { data: tasks } = await service.from('tracking_check_tasks').select('status, claimed_at').eq('run_id', run.id);
  const list: { status: string; claimed_at: string | null }[] = tasks ?? [];
  const progress = { total: list.length, done: 0, failed: 0, running: 0, pending: 0 };
  for (const t of list) progress[t.status as 'done' | 'failed' | 'running' | 'pending']++;
  if (run.status === 'running') {
    const lastClaim = Math.max(0, ...list.map((t) => (t.claimed_at ? Date.parse(t.claimed_at) : 0)));
    if (Date.now() - lastClaim > 120_000) kickWorker();
  }
  return json({ status: run.status, progress });
}

async function share(body: Body, userId: string, service: Db) {
  const run = await ownRun(body.runId, userId, service);
  if (!run) return json({ error: 'Not found' }, 404);
  const days = typeof body.expiresInDays === 'number' && body.expiresInDays > 0 ? Math.min(body.expiresInDays, 365) : null;
  const token = randomToken();
  const { error } = await service.from('tracking_check_runs')
    .update({ share_token: token, share_expires_at: days ? new Date(Date.now() + days * 86400000).toISOString() : null }).eq('id', run.id);
  if (error) throw error;
  return json({ token });
}

async function revoke(body: Body, userId: string, service: Db) {
  const run = await ownRun(body.runId, userId, service);
  if (!run) return json({ error: 'Not found' }, 404);
  const { error } = await service.from('tracking_check_runs').update({ share_token: null, share_expires_at: null }).eq('id', run.id);
  if (error) throw error;
  return json({ ok: true });
}
```

- [ ] **Step 5: Write `tracking-check-worker/store.ts`**

```ts
// TrackingCheckStore backed by supabase-js with the service role.
import type { TaskRow, TrackingCheckStore } from '../_shared/tracking-check/worker-core.ts';

// deno-lint-ignore no-explicit-any
type Db = any;
const check = <T>(res: { data: T; error: unknown }): T => { if (res.error) throw res.error; return res.data; };
const TASK_COLUMNS = 'id, run_id, site_role, path, kind, legacy, attempts, status, error';

export function createStore(db: Db): TrackingCheckStore {
  return {
    async recoverStale(seconds) { check(await db.rpc('tracking_check_recover_stale', { p_seconds: seconds })); },
    async claimTasks(kind, limit) { return (check(await db.rpc('tracking_check_claim_tasks', { p_kind: kind, p_limit: limit })) ?? []) as TaskRow[]; },
    async getRun(runId) {
      const run = check(await db.from('tracking_check_runs').select('id, mode, baseline_url, target_url, policy, auth_ciphertext, auth_expires_at').eq('id', runId).single());
      const expired = run.auth_expires_at && Date.parse(run.auth_expires_at) < Date.now();
      return { id: run.id, mode: run.mode, baseline_url: run.baseline_url, target_url: run.target_url, policy: run.policy, auth_ciphertext: expired ? null : run.auth_ciphertext };
    },
    async saveObservation(task, data) {
      check(await db.from('tracking_check_observations').upsert({ run_id: task.run_id, task_id: task.id, data }, { onConflict: 'task_id' }));
    },
    async completeTask(id) { check(await db.from('tracking_check_tasks').update({ status: 'done', error: null }).eq('id', id)); },
    async failTask(id, error, retry) {
      check(await db.from('tracking_check_tasks').update({ status: retry ? 'pending' : 'failed', error: error.slice(0, 500) }).eq('id', id));
    },
    async runsToFinalize() {
      const rows: unknown[] = check(await db.rpc('tracking_check_runs_to_finalize')) ?? [];
      return rows.map((r) => (typeof r === 'string' ? r : (r as Record<string, string>).tracking_check_runs_to_finalize));
    },
    async beginAssessing(runId) {
      const rows = check(await db.from('tracking_check_runs').update({ status: 'assessing' }).eq('id', runId).eq('status', 'running').select('id'));
      return (rows ?? []).length === 1;
    },
    async loadResults(runId) {
      const tasks: TaskRow[] = check(await db.from('tracking_check_tasks').select(TASK_COLUMNS).eq('run_id', runId)) ?? [];
      const obs: { task_id: string; data: unknown }[] = check(await db.from('tracking_check_observations').select('task_id, data').eq('run_id', runId)) ?? [];
      const byTask = new Map(obs.map((o) => [o.task_id, o.data]));
      // deno-lint-ignore no-explicit-any
      return tasks.map((task) => ({ task, data: task.status === 'done' ? (byTask.get(task.id) as any) ?? null : null }));
    },
    async saveResults(runId, findings, summary) {
      if (findings.length) {
        check(await db.from('tracking_check_findings').insert(findings.map((f, i) => ({
          run_id: runId, sort_order: i, scope: f.scope, check_key: f.checkKey, title: f.title, status: f.status, priority: f.priority,
          explanation: f.explanation, fix: f.fix, typical_owner: f.typicalOwner, evidence: f.evidence,
        }))));
      }
      check(await db.from('tracking_check_runs').update({ status: 'done', summary, finished_at: new Date().toISOString(), auth_ciphertext: null, auth_expires_at: null }).eq('id', runId));
    },
    async failRun(runId, error) {
      check(await db.from('tracking_check_runs').update({ status: 'failed', error: error.slice(0, 500), finished_at: new Date().toISOString(), auth_ciphertext: null, auth_expires_at: null }).eq('id', runId));
    },
    async hasPendingWork() {
      const { count, error } = await db.from('tracking_check_tasks').select('id', { count: 'exact', head: true }).in('status', ['pending', 'running']);
      if (error) throw error;
      return (count ?? 0) > 0;
    },
  };
}
```

- [ ] **Step 6: Write `tracking-check-worker/index.ts`**

```ts
// Drains the Tracking Check queue. Called by tracking-check-start, by itself and by the status nudge.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { processBatch, type Probes } from '../_shared/tracking-check/worker-core.ts';
import { fetchProbe } from '../_shared/tracking-check/fetch-probe.ts';
import { DEFAULT_BROWSERLESS_URL, runBrowserProbe } from '../_shared/tracking-check/browserless.ts';
import { detectForms } from '../_shared/form-detection.ts';
import { open } from '../_shared/tracking-check/secret-box.ts';
import { kickWorker } from '../_shared/tracking-check/kick.ts';
import { createStore } from './store.ts';

const BATCH_WINDOW_MS = 30_000;   // start new batches for 30 s; one browser task (≤ 100 s) still fits in 150 s

Deno.serve(async (req) => {
  const secret = Deno.env.get('TRACKING_CHECK_WORKER_SECRET');
  if (!secret || req.headers.get('x-worker-secret') !== secret) return new Response('Unauthorized', { status: 401 });

  const store = createStore(createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!));
  const probes: Probes = {
    fetchProbe: (url, auth) => fetchProbe(url, { basicAuth: auth }),
    browserProbe: async (url, states, auth) => {
      const { html, ...obs } = await runBrowserProbe({
        endpoint: Deno.env.get('BROWSERLESS_URL') || DEFAULT_BROWSERLESS_URL,
        token: Deno.env.get('BROWSERLESS_API_KEY') ?? '', url, states, basicAuth: auth,
      });
      return { ...obs, forms: detectForms(html) };
    },
    openAuth: async (ciphertext) => JSON.parse(await open(ciphertext, Deno.env.get('TRACKING_CHECK_AUTH_KEY')!)),
  };

  const work = (async () => {
    const started = Date.now();
    let total = { processed: 0, finalized: [] as string[], more: false };
    try {
      do {
        const r = await processBatch(store, probes);
        total = { processed: total.processed + r.processed, finalized: [...total.finalized, ...r.finalized], more: r.more };
        if (!r.processed && !r.finalized.length) break;   // nothing claimable right now (e.g. tasks running elsewhere)
      } while (total.more && Date.now() - started < BATCH_WINDOW_MS);
      if (total.more) kickWorker();
    } catch (e) {
      console.error('tracking-check-worker', e);
    }
    return total;
  })();

  // deno-lint-ignore no-explicit-any
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) {
    runtime.waitUntil(work);
    return new Response(JSON.stringify({ accepted: true }), { status: 202, headers: { 'Content-Type': 'application/json' } });
  }
  return Response.json(await work);
});
```

- [ ] **Step 7: Write `tracking-check-report/index.ts`**

```ts
// Public, read-only Tracking Check report addressed by an unguessable share token.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'apikey, content-type', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  const token = new URL(req.url).searchParams.get('token') ?? '';
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return json({ error: 'Not found' }, 404);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: run } = await db.from('tracking_check_runs')
    .select('id, mode, baseline_url, target_url, status, summary, finished_at, share_expires_at')
    .eq('share_token', token).maybeSingle();
  if (!run || run.status !== 'done' || (run.share_expires_at && Date.parse(run.share_expires_at) < Date.now())) return json({ error: 'Not found' }, 404);

  const { data: rows } = await db.from('tracking_check_findings')
    .select('scope, check_key, title, status, priority, explanation, fix, typical_owner, evidence, verified_at')
    .eq('run_id', run.id).order('sort_order');
  // deno-lint-ignore no-explicit-any
  const findings = (rows ?? []).map((f: any) => ({
    scope: f.scope, checkKey: f.check_key, title: f.title, status: f.status, priority: f.priority, explanation: f.explanation,
    fix: f.fix, typicalOwner: f.typical_owner, evidence: f.evidence, verified: !!f.verified_at, verifiedAt: f.verified_at,
  }));
  return json({ run: { mode: run.mode, baselineUrl: run.baseline_url, targetUrl: run.target_url, finishedAt: run.finished_at, summary: run.summary }, findings });
});
```

- [ ] **Step 8: Register the functions in `supabase/config.toml`**

Append:

```toml
[functions.tracking-check-start]
verify_jwt = true

[functions.tracking-check-worker]
verify_jwt = false

[functions.tracking-check-report]
verify_jwt = false
```

- [ ] **Step 9: Run the edge tests and the full suite**

Run: `node --test tests/foundation/tracking-check-edge.test.mjs`
Expected: PASS (6 tests).

Run: `npm run test:foundation`
Expected: all PASS.

If the harness fails on `import type` lines or on `Response.json`, check that `edge-harness.mjs` (Task 2, Step 7) passes `Response` from Node; `ts.transpileModule` removes type-only imports.

- [ ] **Step 10: Commit**

```bash
git add supabase/functions/_shared/tracking-check/kick.ts supabase/functions/tracking-check-start supabase/functions/tracking-check-worker supabase/functions/tracking-check-report supabase/config.toml tests/foundation/tracking-check-edge.test.mjs
git commit -m "feat(tracking-check): start, worker and public report edge functions"
```

---

### Task 14: Deploy the backend (requires the user's explicit OK)

Outward-facing and touches the shared Supabase project (`cxmkdtgfocgbfizawlwa`, also used by other apps). **Stop and ask the user before each of Steps 2–4.**

**Files:** none changed (record outcomes in the PR description later).

- [ ] **Step 1: Prepare the values**

Generate locally (do not commit, do not print secrets into files):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"     # TRACKING_CHECK_WORKER_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"  # TRACKING_CHECK_AUTH_KEY
```

- [ ] **Step 2: Apply the migration (user runs it)**

`supabase db push` is blocked by migration-history drift; never run `supabase migration repair`. Ask the user to paste `supabase/migrations/20261012000001_tracking_check.sql` into the dashboard SQL editor (`https://supabase.com/dashboard/project/cxmkdtgfocgbfizawlwa/sql/new`) and run it. Then verify (SQL editor or Supabase MCP, read-only):

```sql
select to_regclass('public.tracking_check_runs'), to_regclass('public.tracking_check_findings');
select proname from pg_proc where proname like 'tracking_check_%' order by 1;
select jobname from cron.job where jobname = 'tracking-check-retention';
```

Expected: both tables, four functions, one cron job.

- [ ] **Step 3: Set secrets (after OK)**

```bash
npx supabase secrets set --project-ref cxmkdtgfocgbfizawlwa \
  TRACKING_CHECK_ALLOWED_EMAILS=daniel.larsson@expandtalk.se \
  TRACKING_CHECK_WORKER_SECRET=<from step 1> \
  TRACKING_CHECK_AUTH_KEY=<from step 1> \
  BROWSERLESS_URL=<host confirmed in Task 1>
```

`BROWSERLESS_API_KEY` already exists for `take-screenshot`; if Task 1 needed a new key, set it here too. Confirm with `npx supabase secrets list --project-ref cxmkdtgfocgbfizawlwa` (names only).

- [ ] **Step 4: Deploy functions (after OK)**

```bash
npx supabase functions deploy tracking-check-start tracking-check-worker tracking-check-report form-detector --project-ref cxmkdtgfocgbfizawlwa
```

(`form-detector` changed in Tasks 2 and 7.)

- [ ] **Step 5: Smoke-test the deployed functions**

```bash
BASE=https://cxmkdtgfocgbfizawlwa.supabase.co/functions/v1
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/tracking-check-report?token=short"                  # 404
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/tracking-check-worker"                      # 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/tracking-check-start" -H "Content-Type: application/json" -d '{"action":"access"}'   # 401
```

Also run a form-detector request from the dashboard Forms tab once to confirm it still works after the refactor.

---

### Task 15: Frontend — hook, components, pages, routes

**Files:**
- Create: `src/hooks/useTrackingCheck.ts`
- Create: `src/components/tracking-check/ReportView.tsx`
- Create: `src/components/tracking-check/RunProgress.tsx`
- Create: `src/components/tracking-check/StartForm.tsx`
- Create: `src/pages/TrackingCheck.tsx`, `src/pages/TrackingCheckRun.tsx`, `src/pages/TrackingCheckShared.tsx`
- Modify: `src/App.tsx` (imports + three routes)

**Interfaces:**
- Consumes: HTTP API (Task 13); `toCsv` (Task 9); types from `supabase/functions/_shared/tracking-check/*` (imported with relative paths and `.ts` extensions, like `src/lib/aiBotRegistry.ts`).
- Produces: routes `/tracking-check` (protected: start + recent runs), `/tracking-check/:runId` (protected: progress → report), `/tracking-check/r/:token` (public shared report, `noindex`). These routes are **not** added to `src/marketing-routes.ts` (not prerendered, not in the sitemap).

There is no frontend test runner in this repo; verification is `npm run build` plus the manual walkthrough in Step 9.

- [ ] **Step 1: Write `src/hooks/useTrackingCheck.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '@/integrations/supabase/client';
import type { Finding, Mode, PolicyTemplate } from '../../supabase/functions/_shared/tracking-check/types.ts';
import type { ReportSummary } from '../../supabase/functions/_shared/tracking-check/report.ts';
import type { SuggestedPage } from '../../supabase/functions/_shared/tracking-check/pages.ts';

// The generated Supabase types do not include the tracking_check_* tables yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (table: string) => any };

export type RunStatus = 'running' | 'assessing' | 'done' | 'failed';
export interface RunRow {
  id: string; mode: Mode; baseline_url: string | null; target_url: string; status: RunStatus; error: string | null;
  summary: ReportSummary | null; pages: { pages: string[]; legacy: string[] }; policy: PolicyTemplate | null;
  share_token: string | null; share_expires_at: string | null; created_at: string; finished_at: string | null;
}
export interface FindingRow extends Finding { id?: string; verifiedAt: string | null }
export interface Progress { total: number; done: number; failed: number; running: number; pending: number }
export interface CreateRunInput {
  mode: Mode; baselineUrl?: string; targetUrl: string; pages: string[]; legacyPaths: string[];
  policy?: PolicyTemplate; basicAuth?: { username: string; password: string } | null;
}
export interface SharedReport {
  run: { mode: Mode; baselineUrl: string | null; targetUrl: string; finishedAt: string; summary: ReportSummary };
  findings: FindingRow[];
}

// Explicit columns: auth_ciphertext is not readable by clients, so select('*') fails.
const RUN_COLUMNS = 'id, mode, baseline_url, target_url, status, error, summary, pages, policy, share_token, share_expires_at, created_at, finished_at';
const FINDING_COLUMNS = 'id, scope, check_key, title, status, priority, explanation, fix, typical_owner, evidence, verified_at, sort_order';

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('tracking-check-start', { body });
  if (error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const detail = await (error as any).context?.json?.().catch(() => null);
    throw new Error(detail?.error ?? error.message);
  }
  return data as T;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toFinding = (r: any): FindingRow => ({
  id: r.id, scope: r.scope, checkKey: r.check_key, title: r.title, status: r.status, priority: r.priority,
  explanation: r.explanation, fix: r.fix, typicalOwner: r.typical_owner, evidence: r.evidence, verifiedAt: r.verified_at,
});

export const useTrackingCheckAccess = () =>
  useQuery({ queryKey: ['tracking-check', 'access'], queryFn: () => call<{ allowed: boolean }>({ action: 'access' }), staleTime: 5 * 60_000 });

export const useSuggestPages = () =>
  useMutation({ mutationFn: (url: string) => call<{ pages: SuggestedPage[] }>({ action: 'suggest', url }) });

export function useCreateRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRunInput) => call<{ runId: string }>({ action: 'create', ...input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tracking-check', 'runs'] }),
  });
}

export const useRuns = () => useQuery({
  queryKey: ['tracking-check', 'runs'],
  queryFn: async (): Promise<RunRow[]> => {
    const { data, error } = await db.from('tracking_check_runs').select(RUN_COLUMNS).order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    return data ?? [];
  },
});

export const useRun = (runId: string) => useQuery({
  queryKey: ['tracking-check', 'run', runId],
  queryFn: async (): Promise<RunRow> => {
    const { data, error } = await db.from('tracking_check_runs').select(RUN_COLUMNS).eq('id', runId).single();
    if (error) throw error;
    return data;
  },
});

export function useRunStatus(runId: string, enabled: boolean) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ['tracking-check', 'status', runId],
    enabled,
    queryFn: async () => {
      const s = await call<{ status: RunStatus; progress: Progress }>({ action: 'status', runId });
      if (s.status === 'done' || s.status === 'failed') await qc.invalidateQueries({ queryKey: ['tracking-check', 'run', runId] });
      return s;
    },
    refetchInterval: (q) => (q.state.data && (q.state.data.status === 'done' || q.state.data.status === 'failed') ? false : 3000),
  });
}

export const useFindings = (runId: string, enabled: boolean) => useQuery({
  queryKey: ['tracking-check', 'findings', runId],
  enabled,
  queryFn: async (): Promise<FindingRow[]> => {
    const { data, error } = await db.from('tracking_check_findings').select(FINDING_COLUMNS).eq('run_id', runId).order('sort_order');
    if (error) throw error;
    return (data ?? []).map(toFinding);
  },
});

export function useShareRun(runId: string) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['tracking-check', 'run', runId] });
  return {
    share: useMutation({ mutationFn: (expiresInDays: number | null) => call<{ token: string }>({ action: 'share', runId, expiresInDays }), onSuccess: refresh }),
    revoke: useMutation({ mutationFn: () => call<{ ok: true }>({ action: 'revoke', runId }), onSuccess: refresh }),
  };
}

export function useVerifyFinding(runId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, verified, email }: { id: string; verified: boolean; email: string | null }) => {
      const { error } = await db.from('tracking_check_findings')
        .update(verified ? { verified_by: email, verified_at: new Date().toISOString() } : { verified_by: null, verified_at: null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tracking-check', 'findings', runId] }),
  });
}

export async function fetchSharedReport(token: string): Promise<SharedReport> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/tracking-check-report?token=${encodeURIComponent(token)}`, { headers: { apikey: SUPABASE_PUBLISHABLE_KEY } });
  if (!res.ok) throw new Error('This report link is invalid or has expired.');
  return res.json();
}

export const shareUrl = (token: string) => `${window.location.origin}/tracking-check/r/${token}`;
```

- [ ] **Step 2: Write `src/components/tracking-check/ReportView.tsx`**

```tsx
import { useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Copy, Hand, HelpCircle, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { FindingStatus, Mode, Owner } from '../../../supabase/functions/_shared/tracking-check/types.ts';
import type { ReportSummary } from '../../../supabase/functions/_shared/tracking-check/report.ts';
import type { FindingRow } from '@/hooks/useTrackingCheck';

const STATUS: Record<FindingStatus, { label: string; icon: typeof XCircle; className: string }> = {
  fail: { label: 'Problem', icon: XCircle, className: 'text-red-600 dark:text-red-400' },
  warning: { label: 'Review', icon: AlertTriangle, className: 'text-amber-600 dark:text-amber-400' },
  manual: { label: 'Test manually', icon: Hand, className: 'text-blue-600 dark:text-blue-400' },
  untestable: { label: 'Not tested', icon: HelpCircle, className: 'text-muted-foreground' },
  pass: { label: 'OK', icon: CheckCircle2, className: 'text-green-600 dark:text-green-400' },
};
const OWNER: Record<Owner, string> = {
  developer: 'Developer', gtm: 'Tag manager (GTM)', cmp: 'Cookie banner (CMP)', marketing: 'Marketing', legal: 'Controller / legal',
};
const anchor = (checkKey: string) => `finding-${checkKey.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

interface ReportViewProps {
  summary: ReportSummary;
  findings: FindingRow[];
  mode: Mode;
  baselineUrl: string | null;
  targetUrl: string;
  finishedAt: string | null;
  actions?: ReactNode;
  onVerify?: (finding: FindingRow, verified: boolean) => void;
}

export function ReportView({ summary, findings, mode, baselineUrl, targetUrl, finishedAt, actions, onVerify }: ReportViewProps) {
  const [open, setOpen] = useState<string | null>(null);
  const showFix = (checkKey: string) => {
    setOpen(checkKey);
    requestAnimationFrame(() => document.getElementById(anchor(checkKey))?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <p className="text-sm text-muted-foreground">
            {mode === 'comparison' ? `${baselineUrl} → ${targetUrl}` : `${targetUrl} · consent policy`}
            {finishedAt && ` · ${new Date(finishedAt).toLocaleString()}`}
          </p>
          <CardTitle className="text-2xl">{summary.headline}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {summary.lines.map((line) => {
            const s = STATUS[line.status];
            const Icon = s.icon;
            return (
              <div key={line.checkKey} className="flex items-start gap-3">
                <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${s.className}`} aria-label={s.label} />
                <p className="flex-1">{line.text}</p>
                {line.status !== 'pass' && (
                  <Button variant="link" className="h-auto p-0" onClick={() => showFix(line.checkKey)}>Show fix</Button>
                )}
              </div>
            );
          })}
          {actions && <div className="flex flex-wrap gap-2 pt-2">{actions}</div>}
        </CardContent>
      </Card>

      <Collapsible defaultOpen>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="gap-2 px-0"><ChevronDown className="h-4 w-4" aria-hidden />All {findings.length} checks</Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 divide-y rounded-md border">
          {findings.map((f) => (
            <FindingItem key={f.id ?? f.checkKey} finding={f} open={open === f.checkKey}
              onToggle={() => setOpen(open === f.checkKey ? null : f.checkKey)} onVerify={onVerify} />
          ))}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

interface FindingItemProps { finding: FindingRow; open: boolean; onToggle: () => void; onVerify?: (finding: FindingRow, verified: boolean) => void }

function FindingItem({ finding: f, open, onToggle, onVerify }: FindingItemProps) {
  const s = STATUS[f.status];
  const Icon = s.icon;
  return (
    <div id={anchor(f.checkKey)} className="p-4">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-start gap-3 text-left">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${s.className}`} aria-label={s.label} />
        <span className="flex-1 font-medium">{f.title}</span>
        <Badge variant="outline">{f.scope}</Badge>
        {f.priority && f.status !== 'pass' && <Badge variant={f.priority === 'high' ? 'destructive' : 'secondary'}>{f.priority}</Badge>}
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <div className="mt-3 space-y-3 pl-8 text-sm">
          {f.explanation && <p>{f.explanation}</p>}
          {f.fix && (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="font-medium">What to do</span>
                <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(f.fix)}><Copy className="mr-1 h-3 w-3" aria-hidden />Copy</Button>
              </div>
              <pre className="whitespace-pre-wrap rounded bg-muted p-3 font-mono text-xs">{f.fix}</pre>
            </div>
          )}
          {f.typicalOwner && <p className="text-muted-foreground">Usually owned by: {OWNER[f.typicalOwner]}</p>}
          {(f.evidence.pages.length > 0 || f.evidence.details.length > 0) && (
            <div className="text-muted-foreground">
              <p className="font-medium text-foreground">Evidence</p>
              {f.evidence.pages.length > 0 && <p>Pages: {f.evidence.pages.join(', ')}</p>}
              {f.evidence.details.length > 0 && <ul className="list-disc pl-5">{f.evidence.details.map((d) => <li key={d}>{d}</li>)}</ul>}
            </div>
          )}
          {f.status === 'manual' && onVerify && (
            <label className="flex items-center gap-2">
              <Checkbox checked={!!f.verifiedAt} onCheckedChange={(v) => onVerify(f, v === true)} />
              Verified manually{f.verifiedAt && ` (${new Date(f.verifiedAt).toLocaleDateString()})`}
            </label>
          )}
          {f.status === 'manual' && !onVerify && f.verifiedAt && <p>Verified manually on {new Date(f.verifiedAt).toLocaleDateString()}</p>}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Write `src/components/tracking-check/RunProgress.tsx`**

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress as ProgressBar } from '@/components/ui/progress';
import type { Progress, RunStatus } from '@/hooks/useTrackingCheck';

export function RunProgress({ status, progress }: { status: RunStatus | undefined; progress: Progress | undefined }) {
  const finished = progress ? progress.done + progress.failed : 0;
  const pct = progress?.total ? Math.round((finished / progress.total) * 100) : 0;
  return (
    <Card>
      <CardHeader><CardTitle>{status === 'assessing' ? 'Building the report…' : 'Checking the site…'}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <ProgressBar value={pct} aria-label="Progress" />
        <p className="text-sm text-muted-foreground">
          {progress ? `${finished} of ${progress.total} checks done${progress.failed ? ` · ${progress.failed} could not be loaded` : ''}` : 'Starting…'}
        </p>
        <p className="text-sm text-muted-foreground">You can close this tab. The report is saved and listed under Recent runs.</p>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Write `src/components/tracking-check/StartForm.tsx`**

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useCreateRun, useSuggestPages, type RunRow } from '@/hooks/useTrackingCheck';
import type { Mode, PolicyTemplate } from '../../../supabase/functions/_shared/tracking-check/types.ts';

type Flag = Exclude<keyof PolicyTemplate, 'expectedIds' | 'manualItems'>;
const FLAGS: { key: Flag; label: string }[] = [
  { key: 'noGoogleBeforeConsent', label: 'Nothing is sent to Google before consent or after "Reject all"' },
  { key: 'consentDefaultsDenied', label: 'Consent Mode v2 defaults are "denied"' },
  { key: 'ga4RequiresAnalytics', label: 'Google Analytics only runs with Statistics consent' },
  { key: 'adsRequiresMarketing', label: 'Google Ads only runs with Marketing consent' },
  { key: 'enhancedConversionsOff', label: 'Enhanced Conversions is off' },
  { key: 'noUnknownVendorsAfterReject', label: 'No unknown third parties after "Reject all"' },
];
const MANUAL_ITEMS = [
  { key: 'ga4_retention', label: 'GA4 data retention is set to the agreed period (Admin → Data collection and modification → Data retention)' },
  { key: 'google_terms', label: 'Google Ads and GA4 data processing terms are accepted' },
  { key: 'conversion_on_submit', label: 'The conversion fires when the form is submitted (test with Tag Assistant)' },
];
const LIMIT = { comparison: 25, policy: 15 };
const allFlags = () => Object.fromEntries(FLAGS.map((f) => [f.key, true])) as Record<Flag, boolean>;

interface PageChoice { path: string; selected: boolean; note?: string }

export function StartForm({ prefill }: { prefill?: RunRow }) {
  const navigate = useNavigate();
  const suggest = useSuggestPages();
  const create = useCreateRun();
  const [mode, setMode] = useState<Mode>(prefill?.mode ?? 'comparison');
  const [baselineUrl, setBaselineUrl] = useState(prefill?.baseline_url ?? '');
  const [targetUrl, setTargetUrl] = useState(prefill?.target_url ?? '');
  const [pages, setPages] = useState<PageChoice[]>((prefill?.pages.pages ?? []).map((path) => ({ path, selected: true })));
  const [extraPath, setExtraPath] = useState('');
  const [legacy, setLegacy] = useState((prefill?.pages.legacy ?? []).join('\n'));
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [flags, setFlags] = useState<Record<Flag, boolean>>(prefill?.policy ? (Object.fromEntries(FLAGS.map((f) => [f.key, prefill.policy![f.key]])) as Record<Flag, boolean>) : allFlags());
  const [expectedIds, setExpectedIds] = useState((prefill?.policy?.expectedIds ?? []).join(', '));
  const [manual, setManual] = useState<string[]>(prefill?.policy?.manualItems.map((i) => i.key) ?? MANUAL_ITEMS.map((i) => i.key));

  const selected = pages.filter((p) => p.selected).map((p) => p.path);
  const limit = LIMIT[mode];
  const browserLoads = selected.length * (mode === 'comparison' ? 2 : 1);
  const minutes = Math.max(1, Math.ceil((browserLoads * 40) / 60));
  const sourceUrl = mode === 'comparison' ? baselineUrl : targetUrl;

  const loadPages = () => suggest.mutate(sourceUrl, {
    onSuccess: ({ pages: found }) => {
      if (!found.length) toast.info('No sitemap found. Add the pages to test below.');
      setPages(found.map((p) => ({ path: p.path, selected: p.selected && found.indexOf(p) < limit, note: p.reason === 'form' ? 'likely form' : undefined })));
    },
    onError: (e) => toast.error(e.message),
  });

  const toggle = (path: string) => setPages((list) => list.map((p) => (p.path === path ? { ...p, selected: !p.selected } : p)));
  const addPath = () => {
    const path = extraPath.trim();
    if (!path) return;
    const normalised = path.startsWith('/') ? path : `/${path}`;
    setPages((list) => (list.some((p) => p.path === normalised) ? list : [...list, { path: normalised, selected: true }]));
    setExtraPath('');
  };

  const submit = () => {
    if (selected.length > limit) { toast.error(`Select at most ${limit} pages.`); return; }
    create.mutate({
      mode,
      baselineUrl: mode === 'comparison' ? baselineUrl : undefined,
      targetUrl,
      pages: selected,
      legacyPaths: mode === 'comparison' ? legacy.split('\n').map((l) => l.trim()).filter(Boolean) : [],
      policy: mode === 'policy' ? {
        ...flags,
        expectedIds: expectedIds.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean),
        manualItems: MANUAL_ITEMS.filter((i) => manual.includes(i.key)),
      } : undefined,
      basicAuth: username ? { username, password } : null,
    }, {
      onSuccess: ({ runId }) => navigate(`/tracking-check/${runId}`),
      onError: (e) => toast.error(e.message),
    });
  };

  return (
    <Card>
      <CardHeader><CardTitle>New Tracking Check</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Check type">
          {(['comparison', 'policy'] as const).map((m) => (
            <Button key={m} type="button" role="radio" aria-checked={mode === m} variant={mode === m ? 'default' : 'outline'} className="h-auto flex-col items-start py-3" onClick={() => setMode(m)}>
              <span className="font-semibold">{m === 'comparison' ? 'Comparison' : 'Consent policy'}</span>
              <span className="text-xs font-normal opacity-80">{m === 'comparison' ? 'Current site vs new site' : 'One site vs agreed commitments'}</span>
            </Button>
          ))}
        </div>

        {mode === 'comparison' && (
          <div className="space-y-2">
            <Label htmlFor="tc-baseline">Current site (expected behaviour)</Label>
            <Input id="tc-baseline" placeholder="https://www.example.com" value={baselineUrl} onChange={(e) => setBaselineUrl(e.target.value)} />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="tc-target">{mode === 'comparison' ? 'New site' : 'Site to check'}</Label>
          <Input id="tc-target" placeholder="https://staging.example.com" value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} />
        </div>

        <Collapsible>
          <CollapsibleTrigger asChild><Button variant="link" className="h-auto p-0">Does the site need a password? (basic auth)</Button></CollapsibleTrigger>
          <CollapsibleContent className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="tc-user">Username</Label><Input id="tc-user" autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="tc-pass">Password</Label><Input id="tc-pass" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            <p className="text-xs text-muted-foreground sm:col-span-2">Stored encrypted only while the check runs, deleted after at most 2 hours.</p>
          </CollapsibleContent>
        </Collapsible>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <Label>Pages to test ({selected.length} of max {limit})</Label>
            <Button type="button" variant="outline" size="sm" disabled={!sourceUrl || suggest.isPending} onClick={loadPages}>
              {suggest.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}Suggest from sitemap
            </Button>
          </div>
          {pages.length > 0 && (
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-3">
              {pages.map((p) => (
                <label key={p.path} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={p.selected} onCheckedChange={() => toggle(p.path)} />
                  <span className="font-mono">{p.path}</span>
                  {p.note && <span className="text-xs text-muted-foreground">({p.note})</span>}
                </label>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input aria-label="Add a page path" placeholder="/pricing/" value={extraPath} onChange={(e) => setExtraPath(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPath(); } }} />
            <Button type="button" variant="outline" onClick={addPath}>Add</Button>
          </div>
        </div>

        {mode === 'comparison' && (
          <div className="space-y-2">
            <Label htmlFor="tc-legacy">Old URLs that should redirect on the new site (one per line)</Label>
            <Textarea id="tc-legacy" rows={3} placeholder={'/product/\n/in-depth/'} value={legacy} onChange={(e) => setLegacy(e.target.value)} />
          </div>
        )}

        {mode === 'policy' && (
          <div className="space-y-3">
            <Label>Commitments to check</Label>
            {FLAGS.map((f) => (
              <label key={f.key} className="flex items-start gap-2 text-sm">
                <Checkbox checked={flags[f.key]} onCheckedChange={(v) => setFlags({ ...flags, [f.key]: v === true })} />{f.label}
              </label>
            ))}
            <div className="space-y-2">
              <Label htmlFor="tc-ids">Expected IDs (optional)</Label>
              <Input id="tc-ids" placeholder="G-XXXXXXX, AW-123456789, GTM-XXXX" value={expectedIds} onChange={(e) => setExpectedIds(e.target.value)} />
            </div>
            <Label>Checked manually (added to the report as to-dos)</Label>
            {MANUAL_ITEMS.map((i) => (
              <label key={i.key} className="flex items-start gap-2 text-sm">
                <Checkbox checked={manual.includes(i.key)} onCheckedChange={(v) => setManual(v === true ? [...manual, i.key] : manual.filter((k) => k !== i.key))} />{i.label}
              </label>
            ))}
          </div>
        )}

        <Button className="w-full" disabled={!targetUrl || (mode === 'comparison' && !baselineUrl) || !selected.length || create.isPending} onClick={submit}>
          {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
          Start check · about {minutes} min
        </Button>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Write the pages**

`src/pages/TrackingCheck.tsx`:

```tsx
import { Link, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StartForm } from '@/components/tracking-check/StartForm';
import { useRuns, useTrackingCheckAccess, type RunRow } from '@/hooks/useTrackingCheck';

export default function TrackingCheck() {
  const access = useTrackingCheckAccess();
  const runs = useRuns();
  const prefill = (useLocation().state as { prefill?: RunRow } | null)?.prefill;

  if (access.isLoading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" aria-label="Loading" /></div>;
  if (!access.data?.allowed) {
    return <main className="container mx-auto max-w-2xl px-4 py-16"><h1 className="text-2xl font-semibold">Tracking Check</h1><p className="mt-2 text-muted-foreground">Tracking Check is an internal tool. Ask an administrator for access.</p></main>;
  }
  return (
    <main className="container mx-auto max-w-4xl space-y-8 px-4 py-10">
      <div>
        <h1 className="text-3xl font-semibold">Tracking Check</h1>
        <p className="mt-1 text-muted-foreground">Verify UTM and click IDs, tags, CSP and consent behaviour before a site goes live.</p>
      </div>
      <StartForm key={prefill?.id ?? 'new'} prefill={prefill} />
      <Card>
        <CardHeader><CardTitle>Recent runs</CardTitle></CardHeader>
        <CardContent className="divide-y">
          {runs.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {runs.data?.length === 0 && <p className="text-sm text-muted-foreground">No runs yet.</p>}
          {runs.data?.map((r) => (
            <Link key={r.id} to={`/tracking-check/${r.id}`} className="flex flex-wrap items-center gap-3 py-3 hover:underline">
              <span className="text-sm text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
              <Badge variant="outline">{r.mode === 'comparison' ? 'Comparison' : 'Policy'}</Badge>
              <span className="flex-1 truncate">{r.mode === 'comparison' ? `${r.baseline_url} → ${r.target_url}` : r.target_url}</span>
              <span className="text-sm">{r.status === 'done' ? r.summary?.headline : r.status === 'failed' ? 'Failed' : 'Running…'}</span>
            </Link>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}
```

`src/pages/TrackingCheckRun.tsx`:

```tsx
import { useNavigate, useParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Download, Link2, Loader2, RotateCcw, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ReportView } from '@/components/tracking-check/ReportView';
import { RunProgress } from '@/components/tracking-check/RunProgress';
import { useAuth } from '@/hooks/useAuth';
import { shareUrl, useFindings, useRun, useRunStatus, useShareRun, useVerifyFinding } from '@/hooks/useTrackingCheck';
import { toCsv } from '../../supabase/functions/_shared/tracking-check/report.ts';

export default function TrackingCheckRun() {
  const { runId = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const run = useRun(runId);
  const active = run.data?.status === 'running' || run.data?.status === 'assessing';
  const status = useRunStatus(runId, !!active);
  const findings = useFindings(runId, run.data?.status === 'done');
  const { share, revoke } = useShareRun(runId);
  const verify = useVerifyFinding(runId);

  if (run.isLoading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" aria-label="Loading" /></div>;
  if (!run.data) return <main className="container mx-auto px-4 py-16"><p>Run not found.</p><Link to="/tracking-check" className="underline">Back</Link></main>;
  const r = run.data;

  const downloadCsv = () => {
    const blob = new Blob([toCsv(findings.data ?? [])], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tracking-check-${new URL(r.target_url).hostname}-${r.created_at.slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const copyShare = async () => {
    const token = r.share_token ?? (await share.mutateAsync(null)).token;
    await navigator.clipboard.writeText(shareUrl(token));
    toast.success('Share link copied');
  };

  return (
    <main className="container mx-auto max-w-4xl space-y-6 px-4 py-10">
      <Link to="/tracking-check" className="text-sm text-muted-foreground hover:underline">← Tracking Check</Link>
      {active && <RunProgress status={status.data?.status ?? r.status} progress={status.data?.progress} />}
      {r.status === 'failed' && <p className="rounded-md border border-destructive p-4">The check failed: {r.error ?? 'unknown error'}. Start it again from the Tracking Check page.</p>}
      {r.status === 'done' && r.summary && findings.data && (
        <ReportView
          summary={r.summary} findings={findings.data} mode={r.mode} baselineUrl={r.baseline_url} targetUrl={r.target_url} finishedAt={r.finished_at}
          onVerify={(f, verified) => f.id && verify.mutate({ id: f.id, verified, email: user?.email ?? null })}
          actions={<>
            <Button variant="outline" onClick={downloadCsv}><Download className="mr-2 h-4 w-4" aria-hidden />Export CSV</Button>
            <Button variant="outline" onClick={copyShare} disabled={share.isPending}><Link2 className="mr-2 h-4 w-4" aria-hidden />{r.share_token ? 'Copy share link' : 'Create share link'}</Button>
            {r.share_token && <Button variant="ghost" onClick={() => revoke.mutate()}><Unlink className="mr-2 h-4 w-4" aria-hidden />Revoke link</Button>}
            <Button variant="ghost" onClick={() => navigate('/tracking-check', { state: { prefill: r } })}><RotateCcw className="mr-2 h-4 w-4" aria-hidden />Run again</Button>
          </>}
        />
      )}
    </main>
  );
}
```

`src/pages/TrackingCheckShared.tsx`:

```tsx
import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { ReportView } from '@/components/tracking-check/ReportView';
import { fetchSharedReport } from '@/hooks/useTrackingCheck';

export default function TrackingCheckShared() {
  const { token = '' } = useParams();
  const report = useQuery({ queryKey: ['tracking-check', 'shared', token], queryFn: () => fetchSharedReport(token), retry: false });

  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => { meta.remove(); };
  }, []);

  return (
    <main className="container mx-auto max-w-4xl space-y-6 px-4 py-10">
      <h1 className="text-xl font-semibold">Tracking Check report</h1>
      {report.isLoading && <Loader2 className="h-8 w-8 animate-spin" aria-label="Loading" />}
      {report.error && <p>{(report.error as Error).message}</p>}
      {report.data && (
        <ReportView summary={report.data.run.summary} findings={report.data.findings} mode={report.data.run.mode}
          baselineUrl={report.data.run.baselineUrl} targetUrl={report.data.run.targetUrl} finishedAt={report.data.run.finishedAt} />
      )}
      <p className="text-xs text-muted-foreground">Generated by CortIQ Tracking Check. Results describe what an automated browser observed; legal assessments are made by the controller.</p>
    </main>
  );
}
```

- [ ] **Step 6: Register routes in `src/App.tsx`**

Add with the other page imports:

```tsx
import TrackingCheck from "./pages/TrackingCheck";
import TrackingCheckRun from "./pages/TrackingCheckRun";
import TrackingCheckShared from "./pages/TrackingCheckShared";
```

Add before `<Route path="*" element={<NotFound />} />`:

```tsx
              <Route path="/tracking-check" element={
                <ProtectedRoute>
                  <TrackingCheck />
                </ProtectedRoute>
              } />
              <Route path="/tracking-check/r/:token" element={<TrackingCheckShared />} />
              <Route path="/tracking-check/:runId" element={
                <ProtectedRoute>
                  <TrackingCheckRun />
                </ProtectedRoute>
              } />
```

- [ ] **Step 7: Build and run the foundation suite**

Run: `npm run build`
Expected: client, SSR and prerender complete without errors. `tests/foundation/marketing-routes.test.mjs` must still pass (the new routes are not marketing routes).

Run: `npm run test:foundation`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add src/hooks/useTrackingCheck.ts src/components/tracking-check src/pages/TrackingCheck.tsx src/pages/TrackingCheckRun.tsx src/pages/TrackingCheckShared.tsx src/App.tsx
git commit -m "feat(tracking-check): internal UI, report view and public shared report"
```

- [ ] **Step 9: Manual walkthrough (after Task 14 is deployed)**

`npm run dev`, sign in, open `http://localhost:8080/tracking-check`:
1. Start a Policy run against `https://cortiq.se` with 2 pages; watch progress reach 100 %.
2. Report: headline, summary lines, "Show fix" scrolls to and opens the row, Copy works, manual rows can be ticked.
3. Export CSV and open it in Google Sheets: columns match the tracker, no formula execution.
4. Create a share link, open it in a private window: report renders without login, no "verified by" email, page has `noindex`. Revoke and reload: error message.
5. Check light and dark mode, and a 375 px wide viewport.

---

### Task 16: Acceptance runs and documentation

**Files:**
- Modify: `tests/foundation/README.md` (describe the Tracking Check tests)
- Create: `docs/superpowers/plans/notes/2026-10-12-tracking-check-acceptance.md`

- [ ] **Step 1: Paligo Comparison run**

From `/tracking-check`: Comparison, current `https://paligo.net`, new = the staging URL the user provides (basic auth if needed), pages `/`, `/pricing/`, `/get-started/`, `/free-trial/`, `/blog/`, `/whitepapers/` and one CCMS page; legacy URLs `/product/`, `/in-depth/`, `/glossary`.

Success criterion (spec §2.1): findings include `tags.missing.hubspot` (fail, with CSP lines in the fix), `params.survive` pass, and redirects for `/product/` and `/in-depth/` with parameters kept. If the staging site has since been fixed, record that and confirm the report shows HubSpot present instead.

- [ ] **Step 2: Pretec Policy run**

Policy, `https://www.pretec.se` (or the staging URL if available), all commitments ticked, expected IDs `AW-18424645060, G-6J9DFZLXNL`.

Success criterion (spec §2.2): no Google requests after "Reject all" (`consent.after_reject` without Google findings), and `consent.after_reject.cookieless.extellio` as a warning. Expected-ID findings reflect whether Capo has installed the tags yet — record which.

- [ ] **Step 3: Record and investigate deviations**

Write both outcomes (date, URLs, headline, key findings, anything unexpected) to `docs/superpowers/plans/notes/2026-10-12-tracking-check-acceptance.md`. Any deviation from the manual reports is investigated and either fixed (new test + fix) or documented with the reason. Do not explain deviations away.

- [ ] **Step 4: Document the tests**

Add to `tests/foundation/README.md`, after the existing bullet list:

```markdown
- `tracking-check-*.test.mjs` cover Tracking Check: the SSRF guard, vendor registry, fetch probe, page suggestions, every assess module (with Paligo- and Pretec-shaped fixtures), report/CSV, browser-probe helpers, credential encryption, the migration (RLS, column grants, queue functions, retention) in PGlite, the worker core with a fake store, and the three edge functions through `edge-harness.mjs`. The real browser probe is not run in tests; `scripts/tracking-check/probe-smoke.mjs` runs it against a live URL with a Browserless key.
```

- [ ] **Step 5: Final verification and commit**

Run: `npm run test:foundation` and `npm run build`
Expected: all PASS / build succeeds.

```bash
git add tests/foundation/README.md docs/superpowers/plans/notes
git commit -m "docs(tracking-check): acceptance results and test documentation"
```

Then ask the user whether to push the branch and open a PR.

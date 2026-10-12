# Tracking Check — Design

**Date:** 2026-10-12
**Status:** Approved in brainstorming, awaiting spec review
**Owner:** Daniel Larsson (Expandtalk)

## 1. Purpose

Marketing tracking breaks silently when a site changes platform or adds tags. It depends on a chain of 5–6 links (redirects, tag loading, CSP, consent tool, forms, ad-platform feedback) owned by different people. When a link breaks there is no error, only degraded data (HubSpot Original Source falls back to Direct/Offline, Google Ads loses gclid-based offline conversions).

Tracking Check automates the verification that consultants and martech teams today do by hand with Tag Assistant and DevTools, and produces evidence that non-technical decision makers (marketing leads, DPOs, legal advisors) can act on.

**Two real cases drive the design:**

- **Paligo (migration):** WordPress → new static site. Manual check found UTM/gclid OK, but the HubSpot tracking code missing and blocked by CSP. Their migration tracker (Google Sheet) has rows like "Retest all 25 tags with GTM preview / tag assistant" and a "Trackers Now-vs-DEV" tab.
- **Pretec (consent policy):** Expandtalk proposed six testable commitments for the Google tag ("nothing is sent to Google after Reject all", "GA4 only with Statistics consent", "Enhanced Conversions off", …). The legal advisor explicitly does not decide; the controller (Pretec) does. They need neutral technical evidence. A third-party tool (Extellio) was found sending cookieless requests after rejection.

**Audience:** internal tool for Expandtalk consulting first (v1); public free tool later, as a lead source for CortIQ.

## 2. Success criteria

1. A Comparison run on Paligo (live vs staging) reproduces the conclusions of the manual 2026-10-12 report: HubSpot tag missing on new site, CSP blocks HubSpot domains, UTM/gclid survive all tested pages and 301/307 redirects.
2. A Policy run on Pretec reproduces: no Google requests after "Reject all"; Extellio requests after rejection flagged as a warning.
3. A non-technical recipient understands the top of the report without reading the table.
4. No check reports "pass" when it could not actually be verified.

## 3. Modes

One engine, two sources of truth:

| Mode | Input | Expected behaviour comes from |
|---|---|---|
| **Comparison** | Current site URL + new site URL | The current site's observation |
| **Policy** | One site URL + policy template | A checklist of commitments (template) |

Comparison is technically "observe two sites and diff"; Policy is "observe one site and assert".

## 4. Architecture

```
UI (internal view) ──create run──▶ tracking-check-start  (edge, JWT + email allowlist)
                                       │ creates run + tasks
                                       ▼
                              tracking-check-worker  (edge, re-invokes itself in batches)
                                 │                       │
                     fetch-probe (redirects,       Browserless /function
                     params, CSP headers)          (Puppeteer: N consent states per page)
                                 │                       │
                                 └──▶ observations ◀─────┘
                                            │
                                 assess (pure function)
                                 expected = baseline site OR policy template
                                            │
                                            ▼
                                  findings ──▶ report view / share link / CSV
```

### 4.1 Units

Each unit has one purpose and a typed input/output contract.

1. **`fetch-probe`** (`supabase/functions/_shared/tracking-check/fetch-probe.ts`)
   - In: URL, test query string, optional basic auth.
   - Follows redirects manually (`redirect: 'manual'`), calling `assertSafeUrl` on every hop, max 10 hops, 5 s timeout per hop, 2 MB body cap.
   - Out: redirect chain (status, location per hop), final URL, whether each tracking param survived, response CSP header (parsed into directives), HTTP status, bot-challenge detection.
   - No browser.

2. **`browser-probe`** (`supabase/functions/_shared/tracking-check/browser-probe.js` — the Puppeteer script body sent to Browserless `/function`)
   - In: URL, list of consent states, optional basic auth, CMP adapter hints.
   - For each consent state: fresh incognito context → load → apply consent action → wait for network idle (max 10 s) → capture.
   - Out per state: requests (`host`, `path`, `resourceType`, `hasUserData` flag), cookies (name, domain), localStorage/sessionStorage keys, CSP violations (`securitypolicyviolation` events), `dataLayer` consent commands (default/update), detected CMP + method used, final URL.
   - Knows nothing about vendors or rules.

3. **`vendor-registry`** (`supabase/functions/_shared/tracking-vendors.ts`)
   - Per vendor: id, display name, consent category (`necessary | analytics | marketing | preferences`), script/request host patterns, cookie patterns, global variable names, ID extraction regex (e.g. HubSpot portal from `js.hs-scripts.com/{id}.js`, GTM container, GA4 `G-…`, Ads `AW-…`), required CSP domains per directive.
   - v1 vendors: Google Tag Manager, GA4, Google Ads, HubSpot (tracking + forms), Meta Pixel, LinkedIn Insight, Reddit Pixel, Microsoft Ads/Clarity, Extellio, CortIQ, CookieYes, Cookiebot, OneTrust, Complianz.
   - Seeds cookie patterns from the existing `cookie-scanner` database (move the shared part out of `cookie-scanner/index.ts`; `cookie-scanner` imports it).
   - Single canonical list, same principle as `_shared/ai-bot-registry.ts`.

4. **`assess`** (`supabase/functions/_shared/tracking-check/assess.ts`)
   - Pure function: `(observations, expected, mode) → Finding[]`.
   - All decision logic lives here. No I/O.

5. **`report`** (`supabase/functions/_shared/tracking-check/report.ts` + UI)
   - Findings → summary lines, table rows, CSV, sanitised share payload.

6. **CMP adapters** (`supabase/functions/_shared/tracking-check/cmp-adapters.js`, bundled into the browser-probe script)
   - See §5.2.

### 4.2 Edge Functions

| Function | `verify_jwt` | Role |
|---|---|---|
| `tracking-check-start` | true | Auth + allowlist, validate input, fetch sitemap and suggest pages (`action: 'suggest'`), create run + tasks (`action: 'create'`), kick off worker |
| `tracking-check-worker` | false (internal secret header) | Claim up to N pending tasks, run probes, store observations, re-invoke itself until no tasks remain, then run `assess` and write findings |
| `tracking-check-report` | false | Public read of a run by share token (sanitised) |

The worker authenticates calls with a shared secret header (`TRACKING_CHECK_WORKER_SECRET`), not JWT, because it re-invokes itself. Each invocation processes a batch sized to stay well under the Edge Function wall-clock limit (start with 3 tasks per invocation, tune after measuring). Tasks are claimed with an atomic `UPDATE … WHERE status = 'pending' … RETURNING` to avoid double processing. Failed tasks retry up to 2 times, then become `failed` and produce a "could not be tested" finding.

### 4.3 Data model

New tables, all with RLS enabled. Runs are **not** tied to `sites` — the client's site does not need CortIQ installed.

**`tracking_check_runs`**
| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `user_id` | uuid | `auth.uid()` of creator |
| `mode` | text | `comparison` \| `policy` |
| `baseline_url` | text | Comparison only |
| `target_url` | text | |
| `policy` | jsonb | Policy template selections + expected IDs |
| `pages` | jsonb | Selected paths + legacy redirect paths |
| `status` | text | `queued` \| `running` \| `assessing` \| `done` \| `failed` |
| `progress` | jsonb | `{ total, done, failed, current_step }` |
| `summary` | jsonb | Computed headline counts + summary lines |
| `auth_ciphertext` | text null | AES-GCM encrypted basic auth, see §6.3 |
| `auth_expires_at` | timestamptz null | |
| `share_token` | text null unique | |
| `share_expires_at` | timestamptz null | |
| `created_at`, `finished_at` | timestamptz | |

**`tracking_check_tasks`**: `id`, `run_id` fk, `site_role` (`baseline` \| `target`), `path`, `kind` (`fetch` \| `browser`), `status`, `attempts`, `error`, `claimed_at`.

**`tracking_check_observations`**: `id`, `task_id` fk, `run_id` fk, `consent_state` (`none` \| `reject` \| `accept` \| `analytics_only` \| `marketing_only` \| null for fetch), `data` jsonb, `created_at`. Raw evidence.

**`tracking_check_findings`**: `id`, `run_id` fk, `scope`, `check_key`, `title`, `status` (`pass` \| `fail` \| `warning` \| `manual` \| `untestable`), `priority` (`high` \| `medium` \| `low` \| null), `explanation` (plain language), `fix` (text, may contain copyable snippet), `typical_owner` (`developer` \| `gtm` \| `cmp` \| `marketing` \| `legal`), `evidence` jsonb (refs to observations + sanitised excerpts), `verified_by`, `verified_at` (manual rows), `sort_order`.

**RLS:** `user_id = auth.uid()` on runs; child tables via `run_id IN (SELECT id FROM tracking_check_runs WHERE user_id = auth.uid())`. Worker and public report use the service role.

**Retention:** a scheduled job deletes observations older than 90 days and nulls expired `auth_ciphertext`. Runs and findings are kept until deleted by the user.

## 5. Checks

### 5.1 Consent states per page

| State | How |
|---|---|
| `none` | Load, no interaction |
| `reject` | Click "reject all" |
| `accept` | Click "accept all" |
| `analytics_only`, `marketing_only` | Only when the CMP adapter supports granular consent via the CMP's JS API; otherwise the dependent checks become `manual` |

Page caps: 25 pages per run in Comparison (3 states × 2 sites), 15 in Policy (up to 5 states × 1 site).

### 5.2 Consent automation

1. **CMP adapter** — detects the CMP from globals/scripts and uses its API or known buttons. v1: CookieYes, Cookiebot, OneTrust, Complianz, CortIQ banner. Each adapter is verified against a real site when built; selectors are never guessed.
2. **Text-match fallback** — buttons/links matching Swedish and English variants ("Neka alla", "Avvisa alla", "Reject all", "Decline all", "Acceptera alla", "Godkänn alla", "Accept all", "Allow all").
3. **Neither works** → that state is `not_automated`. Every check depending on it becomes `manual` with step-by-step Tag Assistant/DevTools instructions. Never `pass`.

The run shows which CMP was detected and which method was used.

### 5.3 Check catalogue

| Scope | Check | Comparison | Policy | Fail rule |
|---|---|---|---|---|
| Parameters | `utm_*`, `gclid`, `gbraid`, `wbraid`, `fbclid`, `msclkid`, `_gl` survive on final URL, including through redirects | ✓ | ✓ | Any param lost → fail, high |
| Parameters | Legacy URLs redirect to a 2xx target in ≤ 2 hops with 301/308 | ✓ | – | Chain > 2 or 302/307 → warning; 4xx/5xx → fail |
| Tags | Vendor present on baseline but absent on target | ✓ | – | fail, high |
| Tags | Vendor present on target but not on baseline | ✓ | – | warning |
| Tags | Same IDs (GTM container, GA4, Ads, HubSpot portal) | ✓ (vs baseline) | ✓ (vs declared IDs) | Mismatch → fail, high |
| CSP | Requests for a detected vendor blocked by CSP | ✓ | ✓ | fail, high; fix = exact directive line |
| Consent | Consent Mode v2 default is `denied` for `ad_storage`, `analytics_storage`, `ad_user_data`, `ad_personalization` before choice | ✓ | ✓ (if template requires) | fail, high |
| Consent | Vendor of a consent-requiring category sends requests or writes cookies/storage in `none` or `reject` | ✓ | ✓ | fail, high |
| Consent | Vendor loads under the wrong category (e.g. Ads with analytics only) | if granular | if granular | fail, high |
| Consent | Cookieless requests after `reject` (no cookies, no storage) | ✓ | ✓ | warning — worded as fact, "may require consent under LEK 9 kap. 28 §; assessed by the controller" |
| Forms | Forms and HubSpot GUIDs on baseline vs target (reusing `form-detector` parsing) | ✓ | – | Missing form → fail, high |
| Ads/GA4 | `user_data` present in Google requests (Enhanced Conversions) vs policy | – | ✓ | Mismatch → fail |
| Manual | GA4 data retention, Google data processing terms accepted, conversion fires on form submit | – | ✓ (from template) | Always `manual`, with `verified_by`/`verified_at` |
| Any | Page blocked by bot protection / challenge / timeout | ✓ | ✓ | `untestable` with manual instructions |

### 5.4 Policy template (v1)

Checkboxes, stored on the run and reusable as a starting point for new runs:

- Nothing is sent to Google before consent or after "Reject all"
- Consent Mode v2 defaults are `denied`
- GA4 requires Statistics/Analytics consent
- Google Ads requires Marketing consent
- Enhanced Conversions off
- No unknown vendors send requests after "Reject all"
- Expected IDs: free-text list (`AW-…`, `G-…`, `GTM-…`, HubSpot portal)
- Manual items: GA4 retention period (value), Google data processing terms, conversion on form submit

### 5.5 Out of scope for v1

Automatic form submission, logged-in pages, consent button languages other than Swedish/English, scheduled re-runs, public anonymous mode (see §8).

## 6. Security and access

### 6.1 Access (v1)

`tracking-check-start` requires a valid JWT **and** the user's email in `TRACKING_CHECK_ALLOWED_EMAILS` (comma-separated edge secret). It exposes `action: 'access'` so the UI only shows the menu entry for allowed users. The allowlist is the only gate to replace when going public.

### 6.2 SSRF and abuse

- Move `assertSafeUrl` from `form-detector/index.ts` to `_shared/safe-url.ts`; `form-detector` imports it.
- `fetch-probe` validates every redirect hop.
- Target URLs are validated before being sent to Browserless so our account cannot be pointed at private addresses.
- Limits: page caps per run (§5.1) and max 10 runs per user per day (constant, adjustable).

### 6.3 Basic auth credentials

Encrypted with AES-GCM using a key from the edge secret `TRACKING_CHECK_AUTH_KEY`, stored in `auth_ciphertext` only while the run is active. Cleared when the run reaches `done`/`failed`, and at the latest after 2 hours (`auth_expires_at`, enforced by worker and retention job). Never logged, never returned by any endpoint, never included in observations.

### 6.4 Share link

- 32-byte random token, URL `/tracking-check/r/{token}`.
- `tracking-check-report` reads with the service role and returns summary + findings + sanitised evidence only.
- Sanitisation: hosts, paths and query parameter **names** kept; query parameter **values**, cookie values and storage values removed.
- Revocable (null the token) with optional expiry.

### 6.5 Data protection

No visitor data from the client's site is collected — the probe is the only visitor. Observations contain no personal data beyond what the tested site sends to an anonymous headless browser.

## 7. User experience

Validated with mockups in brainstorming (`.superpowers/brainstorm/…/report-layout-v2.html`).

### 7.1 Start

Mode toggle (Comparison / Policy) → URL field(s) → optional "Staging has a password?" (basic auth) → page suggestions from the baseline sitemap (pre-ticked ~10–15: home, pricing, pages with forms, top pages if the site has CortIQ) with add/remove → separate field for legacy URLs to redirect-test → Policy template (policy mode) → "Start check · approx. N min".

### 7.2 Progress

Progress bar with plain-language steps ("Parameters and redirects: done", "Cookie banner found: CookieYes (automated via adapter)"). Run continues server-side; the tab can be closed.

### 7.3 Report (layout B: summary first)

1. **Headline:** "2 problems block go-live · 9 OK · 1 to test manually".
2. **3–5 summary lines** in plain language, one per failed/warning theme, each with "Show fix".
3. **Full table** (collapsible), columns matching the client tracker.
4. **Expanded row:** explanation, copyable fix (e.g. CSP directive line), typical owner, evidence (which pages, how many requests, per consent state).
5. Actions: Export CSV, copy share link, view evidence, re-run with same settings.

Wording rules: plain language ("HubSpot cannot link leads to their source"), facts not legal verdicts, honest about what was not verified.

### 7.4 CSV export

Columns match the Paligo migration tracker so rows paste straight in: `Scope, Details, Deliverable, Owner, Status, Priority, Double Check / Blocker, Notes`. Mapping: Scope = scope; Details = short check name (e.g. "HubSpot tag"); Deliverable = finding title + fix summary; Owner = empty (client fills in); Status = `Completed` for pass, `Not Started` for fail/manual/untestable; Priority = High/Medium/Low; Double Check / Blocker = `Yes` for high-priority fails; Notes = explanation + evidence summary.

### 7.5 UI location

Internal dashboard route, not a site tab (runs are not tied to a site): `src/pages/TrackingCheck.tsx` (start + list of runs), `src/pages/TrackingCheckRun.tsx` (progress + report), public `src/pages/TrackingCheckShared.tsx` (share link). Data hooks in `src/hooks/useTrackingCheck.ts`. UI copy is English (CortIQ convention); Swedish report wording is a later localisation.

## 8. Path to public tool (not built in v1)

Replace the allowlist with anonymous runs gated by Cloudflare Turnstile, Policy mode with a fixed template ("Does your site send data to Google after Reject all?"), lower page cap, IP-based rate limit, and a CTA to install CortIQ for continuous monitoring. The start function's access check is the only seam that changes.

## 9. Testing

**Unit (`node --test`, `tests/foundation/`):**
- `assess`: fixture observations → expected findings. Cases: vendor missing on target; CSP block; requests after reject; cookieless warning; `user_data` vs policy; `not_automated` consent → `manual`, never `pass`; untestable page.
- `vendor-registry`: every vendor has a category and at least one detection pattern.
- CSV: column order matches tracker; quotes, commas and newlines escaped.
- `fetch-probe`: params survive redirect chain; SSRF guard rejects a private IP on hop 2.
- Share sanitisation: parameter values stripped; revoked/expired token → 404.

**CMP adapters:** each verified against a real site when built; DOM snapshots saved as fixtures so adapter changes cannot regress silently.

**Acceptance:** Paligo Comparison run and Pretec Policy run match the success criteria in §2. Deviations are investigated, not explained away.

## 10. Dependencies and risks

| Item | Risk | Mitigation |
|---|---|---|
| Browserless | `take-screenshot` uses the legacy `chrome.browserless.io` endpoint; key validity unknown | **First plan step:** verify key and current regional endpoint with a minimal `/function` call |
| Edge wall-clock limits | Long browser calls time out | Small batches, self re-invocation, per-task retries |
| Bot protection on staging | Browserless blocked | Detect challenge → `untestable`, never false fail |
| CMP variation | Adapters break when CMPs change markup | API-first adapters, text fallback, `not_automated` → manual |
| CortIQ cookieless mode | Tool flags CortIQ itself after reject, like Extellio | Consistent reporting; CortIQ needs a documented answer for why its cookieless mode does not read or store on the device |
| Legal wording | Report read as legal advice | Facts only; legal references phrased as "may require … assessed by the controller"; have the `jurist` agent review help texts before public launch |

## 11. Related small changes (separate from this spec)

- Add `gbraid` / `wbraid` to click ID capture in `public/spa-tracking.js` and `visitor-identification`.
- First-touch UTM + click ID into hidden HubSpot form fields (consent-gated).
- Help articles in `src/content/docs.ts` that each check links to (migration checklist, Tag Assistant guide, CSP cheat sheet per vendor, Google Ads conversions basics).

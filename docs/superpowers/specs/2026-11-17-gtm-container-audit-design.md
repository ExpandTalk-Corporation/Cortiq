# GTM Container Audit — design

Date: 2026-11-17 · Status: approved design, plan not written · Phase 1 of 2

## Goal

A public page, `/gtm-audit`, where anyone drops a Google Tag Manager container export (JSON) and gets a
report: which tags fire without a consent condition, which tags identify visitors, what is stale,
duplicated or unused, and what each tag could become without GTM. The file is parsed in the browser and
never leaves it.

Why: many sites run large GTM containers that nobody fully understands. The audit is a lead tool (like
Tracking Check) and the evidence base for what CortIQ should build next (tag templates, server-side
conversions). The anonymous usage counters tell us which vendors and tag types real containers contain.

## Decisions

| Question | Decision |
|---|---|
| Audience | Public first (no account). Dashboard version tied to a site later, same engine. |
| Where it runs | In the browser only. The container is never uploaded. |
| Live verification | Phase 2: optional "check live" that runs Tracking Check on the domain (only the domain is sent) and upgrades findings from "configuration" to "confirmed live". |
| Leads / measurement | Report fully open, export free. Anonymous aggregate counters only (no names, IDs, domains, HTML). |
| Engine location | `supabase/functions/_shared/gtm-audit/` — pure functions, imported by `src/` (same pattern as `_shared/tracking-check/report.ts`), reusable by the Tracking Check worker in phase 2. |

## Out of scope (phase 1)

Live link to Tracking Check, dashboard version, tag template engine, server-side conversions (CAPI),
importing via the GTM API (OAuth), auditing server-side (sGTM) containers.

## Architecture

```
/gtm-audit (public, prerendered)
  └ drop .json → FileReader (no network)
      └ _shared/gtm-audit/parse.ts      → normalized model
      └ _shared/gtm-audit/identify.ts   → vendor per tag
      └ _shared/gtm-audit/consent.ts    → consent status per tag
      └ _shared/gtm-audit/rules/*.ts    → Finding[] (Tracking Check's Finding type)
      └ _shared/gtm-audit/migrate.ts    → migration class per tag
      └ _shared/gtm-audit/stats.ts      → whitelisted aggregate payload
  └ report on screen + Excel export (exceljs, lazy-loaded)
  └ POST stats → gtm-audit-stats edge function → gtm_audit_stats_daily
```

Units and their contracts:

- **`parse(json: unknown): Container | ParseError`** — accepts export format v2
  (`exportFormatVersion: 2`, `containerVersion.{tag,trigger,variable,folder,customTemplate,builtInVariable}`).
  Output: `Container { exportedAt, publicId, tags[], triggers[], variables[], folders[], templates[] }`.
  Each tag keeps `id, name, type, params (flattened key→value/list/map), firingTriggerIds, blockingTriggerIds,
  consentSettings, paused, folderId, modifiedAt` (from `fingerprint`, ms epoch). Built-in triggers that are
  absent from `trigger[]` (All Pages, Initialization, Consent Initialization) are recognized by their fixed
  IDs and added as synthetic triggers. The exact IDs are verified against a real export during planning.
  Errors: not JSON, wrong format version, no `containerVersion`, empty container, file > 5 MB.
- **`identify(tag, container): Identification`** — `{ vendorId | null, source, templateOrigin }`, where
  `source` is one of `builtin-type | template-permissions | gallery-reference | custom-html-url | none`.
  Order:
  1. Built-in GTM tag types (`gaawe`, `googtag`, `awct`, `awcc`, `sp`, `flc`, `fls`, `img`, `html`, …) map
     to registry vendors where applicable.
  2. Custom templates (`cvt_*`): URLs in the template's permissions (`inject_script`, `send_pixel`,
     `send_beacon`) → `vendorForUrl`. Works for unofficial templates.
  3. `galleryReference` fallback via `gallery-map.ts` (`owner/repository → vendorId`), seeded with the most
     common gallery templates (official owners: linkedin, meta, microsoft, reddit, tiktok, pinterest,
     Snapchat, twitter, criteo, Leadfeeder, capterra-public (G2), wingify (VWO), openai, plus the common
     CMP templates). Repository names are verified on GitHub during planning. Community authors with many
     templates (e.g. Jude-Nwachukwu, luratic, gtm-templates-simo-ahava) are matched on repository, never on
     owner alone.
  4. Custom HTML: extract `src` URLs and known inline loader patterns from the `html` parameter →
     `vendorForUrl`. HTML is treated as text and never rendered or executed.
  `templateOrigin` is `official` when the gallery owner is the vendor itself, otherwise `community`
  (`null` for non-template tags).
- **`consentStatus(tag, container): { status, evidence }`** — `status` is:
  - `gated`: `consentSettings.consentStatus = needed` with consent types, or every firing trigger has a
    condition on a consent variable (variable/type/name recognized as consent; custom events from known CMPs
    and CortIQ such as `cookie_consent_marketing`, `CookiebotOnAccept`, `OneTrustGroupsUpdated`).
  - `likely_gated`: no condition found, but the trigger name suggests consent (e.g. "Consent Analytics
    Trigger"). Evidence says this is inferred from the name only.
  - `not_gated`: no consent condition found.
  - `google_consent_mode`: Google's own tags (GA4, Google Ads, Google Tag, Conversion Linker), which adapt
    to Consent Mode rather than being blocked; judged by the Consent Mode default rule instead.
- **Registry (`_shared/tracking-vendors.ts`)** — add RB2B, Apollo, Clay, VWO, G2, Fibbler and OpenAI Ads
  pixel; add optional `identifiesVisitors: true` (person- or company-level visitor identification: RB2B,
  Leadfeeder, Apollo, Clay, Inzynk, Fibbler, others as verified). This also benefits Tracking Check.
  `tests/foundation/marketing-bot-claims.test.mjs` still applies to any public copy.

## Rules

All rules return Tracking Check's `Finding` with `scope: 'GTM'` (new scope value) and an evidence level
`configuration` (phase 1) or `confirmed_live` (phase 2), carried in `evidence.details`.

| checkKey | Condition | Status / priority | typicalOwner |
|---|---|---|---|
| `gtm.consent_missing` | Marketing or analytics vendor tag (or unidentified Custom HTML loading a third-party script) with `not_gated` | fail / high | gtm |
| `gtm.consent_inferred` | Tag is `likely_gated` | manual / medium | gtm |
| `gtm.identifies_visitors` | Vendor has `identifiesVisitors` | warning / high; fail / high when also `not_gated` | legal |
| `gtm.consent_mode_default` | Container has Google tags but no Consent Mode default (CMP template or consent-default tag) on Consent Initialization | warning / medium | gtm |
| `gtm.unknown_custom_html` | Custom HTML with no identified vendor | manual / medium | gtm |
| `gtm.community_template_injects` | Community template with `inject_script` permission | manual / low | gtm |
| `gtm.duplicate` | Same vendor + same ID on an overlapping trigger, or same GA4 event name on the same trigger | warning / medium | gtm |
| `gtm.dead` | Paused tag, tag with no firing trigger, unused trigger or variable | warning / low | gtm |
| `gtm.stale` | Tag not modified for > 24 months before the export date | manual / low | marketing |

Copy states that these are findings in the configuration; a trigger may carry conditions we cannot
evaluate statically (e.g. Custom JavaScript variables), so "no consent condition found" is never phrased as
"fires without consent" until phase 2 confirms it.

## Migration classes

One per tag, phrased as facts — never as promises of features that do not exist yet:

| Class | Examples |
|---|---|
| Covered by CortIQ today | UTM / click ID persistence (incl. Persist Campaign Data, UTM templates), HubSpot form-success listeners and form goals, session replay and heatmaps (Clarity, Hotjar) |
| Consent tool — replaceable by the CortIQ banner | Cookiebot, CookieYes, OneTrust, Usercentrics, Cookie Information and other CMP templates |
| Pixel tag | Meta, LinkedIn Insight, Reddit, TikTok, Pinterest, Microsoft UET, Snap, X |
| Conversion tag — can be sent server-side | Meta / LinkedIn / Reddit / Google Ads conversion events |
| Third-party script | Chat, A/B testing, lead and intent tools |
| Keep in Google | GA4, Google Tag |
| Removal candidate | Paused, no trigger, duplicate |
| Review | Unidentified Custom HTML or template |

## Page and report

- Route `/gtm-audit` in `src/marketing-routes.ts` (prerender, sitemap, footer). English copy.
- Hero + dropzone + three-step export instruction (Admin → Export container → choose version).
  Next to the dropzone: "The file never leaves your browser."
- Before upload: a sample report generated from a synthetic fixture by a script (like
  `scripts/tracking-check/sample-report.mjs`), committed as `src/data/gtmAuditSample.ts` and locked by a
  test.
- Report: summary cards ("12 of 28 tags have no consent condition · 3 identify visitors · 4 removal
  candidates"), findings in the Tracking Check `ReportView` style, then the tag inventory table (vendor,
  type, triggers, consent status, last modified, migration class, folder), filterable by consent status and
  migration class.
- Excel export: sheets Findings, Tags, Triggers & variables (reuse `trackingCheckXlsx.ts` helpers).
- CTA: "Measure without GTM with CortIQ"; "Check live" appears only once phase 2 exists.
- CSP: no change needed — `connect-src` on cortiq.se already allows the Supabase project.

## Anonymous usage counters

- Edge function `gtm-audit-stats`, `verify_jwt = false`. One POST per analysed file; failure never affects
  the report.
- Payload is built by `stats.ts` from a whitelist: engine version, tag count bucket, counts per GTM tag
  type, per registry vendor ID (anything else → `unknown`), per checkKey, per migration class. No names,
  container IDs, domains, URLs or HTML.
- The function re-validates against the same whitelist (shared module), rejects payloads > 10 KB, caps each
  counter, and increments `gtm_audit_stats_daily (day date, key text, count int, primary key (day, key))`
  through a SECURITY DEFINER RPC. RLS on, no policies (service role only). No IP or user agent stored.
- One sentence on the page and one line in the privacy policy describe the counters.

## Error handling

Each parse error has its own message: not a JSON file, not a GTM export, wrong format version, server-side
container, empty container, file too large. Unknown tag or trigger types become "Review"; the engine never
throws on unexpected shapes (unit-tested with a fuzzed export).

## Testing (Node, `tests/`)

- Parser: synthetic exports covering built-in triggers, folders, templates and every tag type in the
  reference container (invented names and IDs — no real customer container in fixtures or samples).
- Identification: one test per source (builtin type, template permissions, gallery reference, Custom HTML).
- Consent status: gated / likely gated / not gated / Google Consent Mode cases.
- One test per rule, and per migration class.
- Stats: whitelist rejects free text and unknown keys, both in `stats.ts` and in the edge function.
- Sample report freshness test.

## Phase 2 (for reference)

"Check live" sends only the domain to Tracking Check, then joins its observations (vendors seen before and
after consent) with the audit: `gtm.consent_missing` becomes `confirmed_live` or is cleared. Dashboard
version stores the audit per site and feeds the template / server-side work.

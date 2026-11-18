# Jurisdiction-aware measurement — requirements and architecture

Date: 2026-11-18 · Status: draft for review · Umbrella spec, six phases (each phase gets its own plan)

## Goal

Maximum **lawful** measurability, not maximum collection. CortIQ decides, per visitor and per purpose,
what may be measured, and measures all of that — no more, no less. Markets from day one: EU/EEA, UK,
US (state by state), Canada (incl. Québec), Brazil.

A customer must not be able to switch on a function that is not allowed for a visitor by mistake.

## Architecture decision (ADR-1): automatic legal steering with controlled exceptions ("A+")

| | |
|---|---|
| Decision | CortIQ selects the applicable rules automatically. The customer can only make them stricter. A less restrictive setting needs a documented legal assessment and a logged approval by the customer's accountable person, and is only possible for rules the pack marks as relaxable (never for hard floors). |
| Rejected | B (customer picks the mode per market): high risk of misconfiguration. C (customer may relax freely): moves legal risk to an unreviewed checkbox. |
| Inputs to every decision | 1) visitor country and region, 2) the customer's country of establishment and the laws that apply to its business, 3) purpose of the processing, 4) consent state, GPC and other privacy signals, 5) approved exceptions and legal bases. |
| Fail mode | Unknown or untrusted input → the strictest rule set among the customer's markets (fail closed). |

## Baseline 2026-11-18 (prod DB, test sites only)

The seven active sites are internal test sites; their volumes do not set market priorities. The findings
are code/function gaps and hold regardless of volume.

| Finding | Severity |
|---|---|
| `getPipelineMode` / `effective_pipeline_mode` are never called; no site has `organization_id`, so `companies.jurisdiction` reaches nothing. Jurisdiction steering is inactive. | P0 |
| Aggregate measurement produces data only on vikingage; sentrisk.se has the flag on but has never sent a hit; off on the rest. | P0 |
| 0 conversions and 1 of 1,695 sessions with UTM in 30 days; 74 % "direct/none". | P0 |
| No country on `cookie_consents` (638/638 null) or on bot rows (`ai_bot_traffic` has no country; `bot_detections.country` empty since 2026-05-31). | P0 |
| `ai_bot_traffic.bot_category` = `other` on all rows (known open P0). | P0 |
| The CortIQ banner records `gpc_signal` but does not act on it; `gdpr_settings.support_gpc` is never read. 14 rows have GPC plus explicit marketing consent. Only `aggregate-hit` honours GPC (`sec-gpc`). | P1 |
| 19 consent rows with analytics = false, marketing = true (båtguide). Verify that this is a real visitor choice. | P2 |

## Phases

| Phase | Delivery | Depends on |
|---|---|---|
| 1 | Repair measurement: conversions, UTM, referrer, aggregate installs, consent logging, GPC behaviour, bot category | — |
| 2 | Trusted geo infrastructure: country + region at the edge | — (parallel with 1) |
| 3 | Central rule engine with automatic decisions | 2 |
| 4 | Legal rule packs: EU/EEA, UK, US states, Canada (incl. Québec), Brazil | 3 + legal review |
| 5 | Bot Intelligence: per-country analysis, filtering, WAF integration | 2 |
| 6 | Measurement Coverage dashboard + Measurement Maximizer | 3 (coverage v0 in phase 1) |

### Phase 1 — Repair measurement

Scope: make the data paths that already exist work end to end. No new legal positions.

Acceptance criteria:
1. **Conversions:** root cause for 0 rows in `conversion_events` documented. A form submit and a page-visit
   goal on a test site produce a row within 60 s (full mode, consented) and a goal count in aggregate mode.
   Automated test for each path.
2. **UTM:** a visit with `?utm_source=x&utm_medium=y&utm_campaign=z` lands in `tracking_sessions` and in
   `aggregate_sources_daily` (when enabled). Test covers SPA navigation and a full page load.
3. **Referrer / direct:** the 74 % "direct/none" is explained by data (own-site referrers, stripped
   referrers, Referrer-Policy) or the bug is fixed. Self-referrals never count as a source.
4. **Aggregate installs:** **not** switched on automatically anywhere. Every site with
   `aggregate_measurement = true` sends hits (today one test site has the flag on and has never sent one —
   find out why in CortIQ's snippet/install flow). The snippet setup and Tracking Check warn when the flag
   is on but no hit has arrived in 24 h. cortiq.se is the reference site for end-to-end tests in every phase.
5. **Consent log:** every new `cookie_consents` row has `geo_country` (time zone now; IP-based after
   phase 2) and a `geo_source` (`ip` | `timezone` | `unknown`).
6. **GPC:** defined, tested banner behaviour: with GPC present the banner pre-sets marketing/sale/sharing
   to refused and records it. Whether and how a later, specific consent may change that is decided in
   phase 4 (US pack); until then GPC wins. The 14 existing rows are investigated and the result written
   down.
7. **Bot category:** `bot_category` is set from the registry on every new row; 0 new `other` rows for
   bots the registry knows.
8. **Coverage v0:** one SQL report per site (consented sessions vs aggregate visits vs server hits,
   conversions with/without source) — the baseline phase 6 builds on.

### Phase 2 — Trusted geo infrastructure

Scope: country (ISO 3166-1) and region (ISO 3166-2, e.g. `US-CA`, `CA-QC`) for every ingest request,
derived from the IP at the edge. The IP itself is not stored for this purpose.

Candidates (decided in the phase plan):
- **a)** Cloudflare Worker in front of ingest endpoints, forwarding `request.cf.country` / `regionCode` in
  a signed header — trusted, no database to maintain. **Chosen**, on the Workers free plan (100,000
  requests/day per account). Monitor daily volume; move to the paid plan before customer traffic reaches
  the limit. On Worker failure, ingest keeps working with `source = 'timezone'`.
- **b)** IP database lookup inside the Edge Functions (GeoLite2 / IPinfo Lite) — check licence, size
  and update cadence.
- **c)** Time zone only (today) — not trusted, no US state, kept only as a fallback.

Acceptance criteria:
1. `_shared/geo.ts` returns `{ country, region, source: 'ip' | 'timezone' | 'unknown' }`; every ingest
   function uses it (no more direct `cf-ipcountry` reads).
2. The header cannot be spoofed by a client: an unsigned or invalid header is ignored → `unknown`.
3. ≥ 98 % of ingest requests from real browsers on test traffic get a country with `source = 'ip'`;
   region resolved for US and CA traffic.
4. Written to: `tracking_sessions`, `cookie_consents`, `ai_bot_traffic`, aggregate tables (country only,
   no region, in aggregate mode), `bot_detections`.
5. No raw IP stored where it was not stored before; DPA and privacy policy updated only if a new
   subprocessor is added (jurist review).

### Phase 3 — Central rule engine

Scope: one pure module, `supabase/functions/_shared/jurisdiction/`, that replaces `PIPELINE_RULES` /
`effective_pipeline_mode`. Same pattern as `_shared/gtm-audit/`: pure functions, imported by Edge Functions
and `src/`.

```
decide({
  visitor:  { country, region, geoSource },
  customer: { establishment, markets, appliesLaws },   // from the customer profile
  purpose:  'statistics' | 'conversion' | 'attribution' | 'ad_platform_sharing' | 'security',
  signals:  { consent: {analytics, marketing}, gpc, consentModeDefault, consentModeUpdate },
  technique:{ storage: 'none'|'session'|'persistent', identifiers: 'none'|'session'|'cross_site', ... },
  exceptions: ApprovedException[],
}) → { outcome: 'allowed' | 'allowed_unless_opt_out' | 'needs_opt_in' | 'blocked',
       constraints: {...}, ruleIds: string[], packVersion: string }
```

Requirements:
- **Customer profile:** sites are linked to a company with establishment country, target markets, and
  per-law applicability (e.g. whether the business meets a US state law's thresholds). Self-declared in a
  guided onboarding step (plain questions, each answer `yes` / `no` / `don't know`), logged with who and
  when. `don't know` counts as `yes` (the law applies). Sites without a profile get the strictest pack
  among EU, UK, Québec. No manual review by CortIQ.
- **Technique, not only geography:** rules match on what the technique does (storage, identifiers,
  location, profiling). Required for Québec (see phase 4) and for aggregate mode.
- **Server decides:** the browser gets the decision for the page load from a policy endpoint (extends
  `geo-check`) so the tracker and banner behave correctly; every ingest function evaluates again and drops
  what is not allowed. The client is never trusted.
- **Customer can tighten:** per site and per purpose. The UI shows the effective result per market.
- **Exceptions:** the customer is the controller, so the customer approves. Table
  `jurisdiction_exceptions` (site, jurisdiction, purpose, legal basis, assessment document or reference,
  approved_by = the customer's named accountable person, default the site's web owner, approved_at,
  expires_at ≤ 12 months). Every approval is logged and shown in the site's audit trail. Expired exceptions
  stop applying automatically.
- **Hard floors:** each pack marks which rules are `relaxable` and which are hard floors that no exception
  can lift (e.g. honouring an opt-out preference signal where a state law requires it, opt-in for
  cross-site identifiers in the EU). This keeps ADR-1: the customer can make documented, accountable
  choices, but cannot switch off a legal minimum.
- **Decision log:** daily counts per site × rule id × outcome. No personal data. Feeds phase 6.
- **Rule status:** each rule has a status: `draft`, `reviewed_agent` (jurist agent, primary sources
  cited) or `reviewed_counsel` (outside counsel, later when the project has budget). A rule that is
  **less** restrictive than the baseline applies from `reviewed_agent`; a draft rule falls back to opt-in.
  The admin view shows which rules are agent-reviewed only.

Acceptance criteria:
1. The old `jurisdiction.ts` rules and `effective_pipeline_mode` are removed or call the new engine;
   `companies.jurisdiction` is migrated into the profile.
2. Table-driven tests: ≥ 1 case per pack × purpose, plus unknown geo, spoofed header, expired exception
   and GPC + later consent.
3. Ingest functions (track-event, visitor-identification, store-consent, aggregate-hit, server-hit,
   ai-bot-tracker, record-conversion, google-ads-quality-upload) call `decide` and log the outcome.
4. An attempt to relax a rule without an exception has no effect, and the UI explains why.

### Phase 4 — Legal rule packs

Each pack = rule data + legal sources + review status + effective dates. Nothing in this section is a
legal conclusion; the items are **hypotheses to verify** before a rule leaves `draft`.

| Pack | To verify (examples) |
|---|---|
| EU/EEA | ePrivacy art. 5(3) as implemented nationally (SE: LEK 9 kap. 28 §); national audience-measurement exemptions differ (e.g. CNIL); aggregate mode reviewed for SE/EU in PR #69 — confirm per member state where customers operate. |
| UK | PECR as amended by the Data (Use and Access) Act 2025 — scope and commencement of the statistical-purpose exemption, opt-out conditions; UK GDPR. |
| US | Per state: CCPA/CPRA (incl. regulations on opt-out preference signals and on consent after an opt-out), and the other state laws that require honouring a universal opt-out signal; applicability thresholds per law (customer profile). |
| Canada | PIPEDA (meaningful consent, implied vs express); Québec Law 25 — rules for technology that identifies, locates or profiles a person, judged per technique (storage, identifiers, location, profiling), not a single opt-in flag. |
| Brazil | LGPD legal bases (consent vs legitimate interest) for analytics and marketing; ANPD cookie guidance. |

GPC (US): a later, specific consent may change an earlier opt-out only under the conditions the pack
documents (separate request, clear notice, timestamp, recorded as its own event). A banner checkbox in the
same interaction never overrides GPC on its own.

Acceptance criteria:
1. Every pack has a source list (law, article, regulation, guidance, date checked) and a review record.
2. Jurist agent review for every pack, against primary sources (statute, regulation, regulator guidance)
   fetched and cited with date — not from model memory. The jurist agent is strongest on SE/EU; for UK,
   US, CA and BR its review must list what it could not verify. Outside counsel is a later upgrade
   (`reviewed_counsel`), not a blocker.
3. Customer-facing text says the rules are CortIQ's technical defaults, not legal advice.
4. Public copy follows the CLAUDE.md copy rules (never "no consent needed", "GDPR-compliant without
   consent", "no banner needed"); jurist review before publishing, DPA version bump where needed.
5. Packs have a "last reviewed" date; a pack older than 12 months shows a warning in admin.

### Phase 5 — Bot Intelligence by country

Acceptance criteria:
1. Bot and human traffic per country (and ASN where available) in the dashboard, from phase-2 geo.
2. **Filter** (default): per-site country rules that exclude traffic from reports while still counting it
   (`filtered` counters, like `aggregate_filtered_daily`). Data is kept, reports are clean.
3. **Block** (opt-in): push a country/ASN rule to the customer's own WAF (Cloudflare first,
   `sites.cloudflare_zone_id`). CortIQ never blocks visitors itself. The UI warns that country blocking
   also hits real users, VPN users and travellers.
4. Suggested rules are based on the site's own data (share of bot traffic per country), not a fixed list.
   RU, CN and KP are pre-checked suggestions only when the data supports it.

### Phase 6 — Measurement Coverage + Measurement Maximizer

Coverage shows how much marketing information CortIQ measures, what is missing, why, and whether a
lawful method exists to measure more.

Every metric has a defined numerator, denominator and denominator source; when no consent-independent
denominator exists, the card shows "denominator unknown" instead of a percentage.

| Metric | Numerator | Denominator (source, best available first) |
|---|---|---|
| Page views with measurable statistics | page views counted by any allowed path | server hits → aggregate count → n/a |
| Conversions with known source | conversions with a non-direct source/medium | all conversions |
| Sessions with allowed attribution | sessions where `decide(attribution)` = allowed | all sessions in the decision log |
| Traffic flagged as bots | bot hits | bot + human hits (server source) |

Maximizer: per site, a list of methods that are allowed under the effective rules but not enabled
(e.g. aggregate mode in a reviewed market, server-side adapter, click-ID capture with marketing
consent), with the expected coverage gain shown as a range and the rule id that allows it.

Acceptance criteria:
1. Every percentage links to its definition and denominator source.
2. Each "missing" item has a reason code from the rule engine (consent refused, GPC, rule, not installed).
3. The Maximizer never suggests a method whose rule is `draft` for the visitor's market.

## Out of scope

Legal advice to customers; consent-management for third-party tags (GTM audit covers that); server-side
CAPI; storing raw IPs for geo; country blocking by CortIQ itself.

## Decisions 2026-11-18

| Question | Decision |
|---|---|
| Who approves exceptions | The customer's named accountable person (default: the site's web owner), within hard floors set by the pack. DPA text on this split: jurist agent review in phase 3. |
| Geo source | Cloudflare Worker, free plan, signed header (phase 2). |
| Customer profile | Self-declared, guided, logged; `don't know` = the law applies. |
| Legal review | Jurist agent now (`reviewed_agent`); outside counsel when the project has budget. |

## Open questions

1. Should the approver role be limited further (e.g. must also hold a role such as DPO or management
   when the site's web owner is an outside agency)?

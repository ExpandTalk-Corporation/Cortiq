# Banner mode per market — more answers, no added risk per market

Status: draft, 2026-11-21. Part of jurisdiction phase 4 (`2026-11-18-jurisdiction-aware-measurement-design.md`).
Nothing in this spec is a legal conclusion. Every market-specific mode is a hypothesis until its rule is
`approved_internal` after jurist review.

## Goal

A site owner wants as many visitors as possible measured in each market without taking more legal risk in
any of them. For the banner that means two things:

1. **Everywhere:** a banner people answer and understand, so the accept rate is as high as an honest banner
   allows. No dark patterns.
2. **Per market:** a lighter banner mode only where an approved rule allows it (e.g. notice + opt-out in US
   states), and the current opt-in banner everywhere else.

Success is measured, not assumed: answer rate and accept rate per site, market and banner language, before
and after each change.

## Baseline 2026-11-21 (prod, last 30 days, `source = cookie_banner`)

| Site | Answers | Analytics yes | Marketing yes | GPC |
|---|---|---|---|---|
| båtguide.nu | 350 | 131 (37%) | 151 (43%) | 14 |
| itsäkerhet.com | 262 | 142 (54%) | 142 (54%) | 12 |

By browser locale (answers ≥ 30): båtguide sv-SE, policy v1 34% (144) → policy v2 52% (83, from 2026-11-09)
→ 30% (33, from 2026-11-18); itsäkerhet sv-SE 63% (91), en-US 50% (98), sv 61% (33). Samples are small;
the policy v1 → v2 change is not a controlled test.

Gaps that block a per-market baseline:

- **Country:** 25 of 612 answers have a country. `geo_source` only exists since 2026-11-18, and on
  båtguide.nu it is `unknown` (the consent post does not go through the geo Worker).
- **Banner language:** 0 answers have `banner_lang` (needs banner 5.5.19+; båtguide runs WP 5.5.13).
- **Denominator:** no banner impressions are counted, so the accept rate is accepts / answers. Visitors
  who ignore the banner are invisible. The answer rate cannot be computed.
- itsäkerhet.com has 98 en-US answers on a Swedish site; part may be automated. Not filtered yet.

## Part A — Measure first (prerequisite for B and C)

A1. **Upgrade the two sites** to the current tracker/banner (5.5.22+) so `banner_lang` and the edge country
are recorded. Check why båtguide's consent post has `geo_source = unknown` (WP plugin `apiUrl` bypasses the
geo Worker?) and fix it in the plugin.

A2. **Banner impression counter.** A daily aggregate per site × banner language × country × variant ×
mode: `shown`, `answered_accept_all`, `answered_custom`, `answered_reject`, `closed_without_answer`. No
identifier, no storage on the device, sent once per page load when the banner renders. Written through the
geo Worker so the country is the signed edge country; unknown country = `unknown`, never the time zone.
Table `banner_impressions_daily`, service role write, owner read via a SECURITY INVOKER RPC; retention
follows site retention.
Legal check before building: the request when the banner renders is the same kind as the aggregate
beacon's (ePrivacy art. 5(3) access question). Jurist agent answers whether a strictly-necessary basis
covers counting the banner's own display, or whether it needs the aggregate-mode opt-in. Until then the
counter ships off and is enabled per site together with aggregate mode.

A3. **Answer and accept rate in Consent → Impact**, per country and language: answer rate = answers /
shown, accept rate per purpose = accepts / answers, and "denominator unknown" where no impressions exist
(phase 6 rule). Bot filter: drop impressions and answers from user agents the registry classifies, and
show headless-browser answers as a separate count.

Acceptance: both sites show ≥ 14 days of impressions with country and language before Part B starts.

## Part B — A better opt-in banner (all markets)

The opt-in banner stays the default in every market. Changes aim at understanding, not at pushing.

Hard rules (EDPB Guidelines 03/2022 on deceptive design patterns, EDPB 2/2023, CNIL guidance, CPRA
regulations § 7004 symmetry in choice — sources to be fetched and cited by the jurist agent):

- Accept and reject on the first layer, same size, weight, shape and position level; only colour differs
  (already true, `consent-banner.js`).
- No pre-ticked purposes; no cookie wall; no "legitimate interest" toggles for tracking purposes.
- No repeated prompting after a reject inside `rejectDays` (default 180).
- Purpose texts say what is collected and for whom, not why the site needs it.
- Closing the banner without a choice = no consent.

Variants to test (each a fixed text/layout id, all reviewed before use):

1. **Purpose-first text:** one sentence per purpose in the visitor's terms ("Counts visits so we know which
   pages help"), current legal texts in the second layer.
2. **Site owner named:** "[Site] uses CortIQ, hosted in the EU" in the first layer.
3. **Layout:** bottom bar vs. centred box (centred box must not block reading — no overlay that prevents
   scrolling).

Assignment: random per page load until the visitor answers; the variant id is sent with the answer
(`cookie_consents.banner_variant`) and with the impression count. No storage before an answer. One
variant at a time per site; a test runs until each arm has ≥ 200 impressions, then the result is shown with
its uncertainty, and the site owner picks.

Acceptance: every variant has a jurist-agent review record; Consent → Impact shows answer and accept rate
per variant with sample size; no variant changes button symmetry.

## Part C — Banner mode per market

### Modes

| Mode | Shown where (when the rule is approved) | What the visitor sees | What starts before an answer |
|---|---|---|---|
| `opt_in` (default) | EU/EEA, UK, CH, Québec, every market without an approved rule | Current banner | Nothing (aggregate mode only if the site enabled it) |
| `notice_opt_out` | Markets whose approved rule for the purpose is `allowed_unless_opt_out` (hypothesis: US states, after review) | A small notice with what is collected and a "Do not sell or share my personal information" / "Opt out" link that opens the same choices | The purposes the rule allows unless opted out; never `ad_platform_sharing` or cross-site identifiers before the rules say so |
| `off` | Site owner chose no CortIQ banner (own CMP) | Nothing from CortIQ | Whatever the own CMP signals |

### How the mode is chosen

1. The banner asks the geo Worker for the mode on load (`GET /banner-mode?site=…`, signed edge country →
   `decide()` per purpose → the strictest mode over the purposes the site uses). Timeout 800 ms; on
   failure, unknown country, or a rule below `approved_internal`: `opt_in`.
2. The site owner turns a market's lighter mode on explicitly (Settings → Consent → Banner per market).
   Default off: a site that does nothing keeps `opt_in` everywhere. The customer can always tighten.
3. Hard floors are evaluated last and always win: GPC / opt-out preference signal → sharing purposes off
   and the notice shows "Opt-out signal honoured"; EU/EEA cross-site identifiers need opt-in; any floor a
   pack adds.
4. A customer-exception relax (decisions 2026-11-20) can change the mode only through the same documented
   flow (legal basis, own assessment, named person, ≤ 12 months); the UI shows CortIQ's default next to it.

### Records

- `cookie_consents.banner_mode` (`opt_in` / `notice_opt_out`) on every answer.
- In `notice_opt_out`, no answer is **not** consent: nothing is written as `consent_given`. An opt-out is
  written as its own record. A later opt-in after an opt-out follows the phase 4 GPC rule (separate
  request, clear notice, timestamp, own event).
- `jurisdiction_decisions_daily` gets the mode so coverage shows how much data rests on each mode.

### Legal review before any code in Part C

Jurist agent, with primary sources fetched and cited, and a list of what it could not verify:

1. US: which state laws allow analytics and first-party advertising by default with notice + opt-out, the
   applicability thresholds (customer profile), the notice-at-collection content, the "Do Not Sell or
   Share" link wording, and opt-out preference signal rules (CCPA regs § 7025 and the other states).
2. Whether sending click IDs or hashed leads to Google Ads is "sharing" (it is assumed to be until
   reviewed; then `ad_platform_sharing` stays opt-in in `notice_opt_out`).
3. Canada (PIPEDA implied consent for analytics) and Brazil (LGPD legitimate interest) as later candidates;
   out of scope for the first release.
4. DPA text for the mode (processor follows the controller's choice; floors listed).

The rule moves to `approved_internal` only in its own reviewed commit.

## Copy rules

- "Banner per market", "lighter notice where the market's approved rule allows it".
- Never "no consent needed", "no banner needed", "compliant", "covers US law", or "get around consent".
- Every market setting shows `DISCLAIMER` and the rule's status and sources.

## Phases

| Step | Content | Gate |
|---|---|---|
| A1 | Upgrade sites, fix båtguide geo | — |
| A2–A3 | Impression counter, answer/accept rate per country and language | Jurist answer on the counter's basis |
| B | Variants + test | A has 14 days of data; jurist review of each variant |
| C-legal | US review, rule records | — |
| C | Mode endpoint, banner notice mode, settings UI, records | US rule `approved_internal`, DPA bump |

## Out of scope

Consent for third-party tags (GTM audit covers that); banner geo-blocking; pricing; per-visitor
personalisation of the banner beyond language and market.

## Open questions

1. Should `notice_opt_out` be available for statistics only in the first release (smallest legal surface),
   with attribution later?
2. Is 200 impressions per arm enough on sites with ~10–20 answers per day, or should tests run across
   sites with the same variant?
3. Does the impression counter need its own line in the privacy policy template (Privacy §5) even when it
   runs only with aggregate mode?

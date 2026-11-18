# Phase 1 measurement findings — 2026-11-18

Data: prod DB, test sites only. Not representative of customer volumes.

Note: the diagnostic queries were re-run live against prod on 2026-11-18. Counts for GPC+marketing and
the no-referrer share came out higher than the numbers quoted in the spec's baseline table (test-site
traffic — Daniel's own browsing and automated probes — kept landing between when the baseline was taken
and this re-run, same day). The conclusions are unchanged; the numbers below are what the re-run actually
returned.

## Conversions (AC1)
- `conversion_events` has had 0 rows ever.
- Root cause: configuration gap, not a pipeline bug. Goals live in `sites.conversion_goals`; only
  itsäkerhet has goals (3 of them: `contact_form`, `phone_click`, `quote_request`), and they are unedited
  templates (`form[name="contact"], #contact-form, .contact-form`; `a[href^="tel:"], .phone-link,
  .call-button`; `form[name="quote"], #quote-form`) that match nothing on that site. ekonom.biz
  (57 completed forms) and sentrisk.se (21 completed forms) have no goals configured at all.
- Fix: Task 9 hint + one-click "any form submission" goal; E2E on cortiq.se.

## UTM and the direct share (AC2, AC3)
- UTM ingest works: `ingest_pageview` stores first-touch `utm_*` on session INSERT. 3 of 9,039 sessions
  in the last 90 days carry UTM, all three on båtguide (`utm_source=chatgpt.com`, 2026-08-21 and
  2026-11-03) — stored correctly.
- Re-run totals (90 days, 7 active sites): 8,555 of 9,039 sessions (94.6 %) have no referrer. This is
  higher than the baseline's 74 % because of continued test traffic on vikingage.se since the baseline
  was taken; the underlying picture is unchanged:
  - **vikingage.se: 6,180 of 6,180 sessions (100 %) have no referrer** — not just admin paths, every
    session, spread across real content pages (`/inscription`, `/explore`, `/sv`, `/excursions`, root,
    `/utflykter`, `/en`, `/carvers`, …). This is disproportionate enough that it is not fully explained
    by "internal traffic" and needs its own look in Task 2 — candidates are Referrer-Policy stripping on
    whatever refers to it, direct/QR access (plausible for a tourism site), or bot/crawler traffic being
    recorded as sessions. Left open here, not claimed as solved.
  - **ekonom.biz: 895 of 1,013 sessions (88.3 %) have no referrer**, and `/admin` is the single largest
    landing path among them (557 of 895, 62 %) — this part *is* internal traffic (no `excludePaths`
    configured).
  - **sentrisk.se: 349 of 368 (94.8 %) have no referrer**; `/admin` + `/dashboard` account for 121 of 349
    (35 %) — partly internal, partly not.
  - **itsäkerhet: 313 of 437 (71.6 %)**, **båtguide: 586 of 757 (77.4 %)** — no admin/dashboard paths of
    note in the top segments; these look like ordinary direct/no-referrer traffic to content pages.
  - Recommendation: set `excludePaths` for `/admin`, `/dashboard` (site configuration, not code) on
    ekonom.biz and sentrisk.se. vikingage.se's 100 % figure needs separate investigation before any fix is
    proposed.
- Bugs confirmed in code, to be fixed in Task 2:
  - `referrer_source_medium()` (`supabase/migrations/20261114000001_report_rpcs.sql:61-91`) has no
    same-site exception — any referrer host not on the hardcoded list (google/facebook/instagram/
    youtube/twitter/linkedin) falls into the `ELSE` branch and is labelled `referral` with that host as
    source, even when the host is the site's own domain. Self-referrals are not excluded anywhere in this
    function.
  - `get_source_breakdown()` (same file, line 118) joins `referrer_source_medium(ts.referrer)` only — it
    never reads `ts.utm_source` / `ts.utm_medium`, so a UTM-tagged session is still bucketed by referrer
    host (or "(direct)") instead of its UTM source/medium.
- Known limitation: a visitor who consents on page 2+ starts the session there; page 1's referrer and
  UTM are lost in full/cookieless mode. Aggregate mode (when enabled) still counts page 1's source.

## Aggregate installs (AC4)
- sentrisk.se has `aggregate_measurement = true` and has never sent a hit (`last_hit_day` is null). It
  loads CortIQ from its own Vite bundle (`window.cortiqConfig` + injected `spa-tracking.js` after
  SentriSK's own consent banner) and never includes the aggregate beacon. Fix is in the SentriSK repo
  (user action, not this repo).
- vikingage.se is the only site that actually produces aggregate data; its last hit is today
  (2026-11-18), confirming the pipeline itself works end to end when the beacon is actually loaded.
- CortIQ gap: the pipeline freshness rule needs 7 days of history, so a pipeline that never delivered
  never alerts. Fixed in Task 4 (`aggregate_never`).
- Deviation from spec: the Tracking Check warning is deferred. Tracking Check scans any URL and has no
  site context; the warning lives in snippet setup and the Alerts tab instead.

## GPC (AC6)
- Re-run count: 84 rows have `gpc_signal = true` and `marketing = true` (not the baseline's 14 — see the
  note at the top; same two sites, more rows accumulated since). Per site: itsäkerhet 52 rows
  (2026-07-07 → 2026-11-16), båtguide 32 rows (2026-07-07 → 2026-11-09). All 84 have `source =
  'cookie_banner'` — `cookie_consents.source` has no other value in the table today, so the
  `cookie_banner | consent_banner` distinction does not currently apply; both banners referred to in the
  spec write through the same `source` value.
- Real visitors (or Daniel's own repeated test visits) pressed "Accept all"; the banner recorded GPC but
  ignored it for every one of these rows.
- Fix: Tasks 5–7. Until phase 4 decides otherwise, GPC wins over any checkbox.
- Existing rows are left unchanged (they are evidence of what was recorded at the time).
- `cookie_consents.geo_country` column already exists but is null on all 4,673 rows (0 with a value) —
  consistent with AC5/baseline ("no country on cookie_consents"). No `geo_source` column exists yet;
  both are out of scope for this findings task (AC5/Task work tracked separately).

## Odd consent rows
- 21 båtguide rows with analytics=false, marketing=true (2026-11-04 → 2026-11-09, confirmed count matches
  the brief). Step 2 query: all 21 have `preferences = true` too.
- Conclusion: these are **accept-all clicks from an older plugin build or a theme that removed the
  analytics row**, not a deliberate "Save selection" with only marketing ticked. Evidence: the plugin's
  "Accept all" handler (`wordpress-plugin/cortiq-analytics.php`, `cq-accept-all` click handler) does
  `chkPref.checked=true; if(chkAnal){ chkAnal.checked=true; } chkMark.checked=true;` — if `#cq-analytics`
  isn't present in the DOM (older build or theme override), `chkAnal` is falsy, analytics is saved as
  `false`, but preferences and marketing are still saved as `true`. Since all 21 rows have
  `preferences=true`, this is the accept-all/missing-checkbox path, not a real "analytics off, marketing
  on" visitor choice.

## Bot category (AC7)
- `ai_bot_traffic.bot_category` is `'other'` (the column default) on 15,827 of 15,861 rows (99.8 %). The
  insert in `supabase/functions/ai-bot-tracker/index.ts` never sets `bot_category` — it sets
  `request_type` from the registry instead (the documented authoritative training/agentic/citation
  classification) and leaves the legacy `bot_category` column at its default.
- The remaining 34 rows (27 `known_bot`, 7 `unknown_ai_behavior`) are not from the current code path —
  no Edge Function in this repo writes `bot_category` on `ai_bot_traffic` today (confirmed by search);
  these predate the switch to `request_type` and are leftover legacy values, not evidence of an active
  write path.
- Fixed in Task 8 with a backfill from the registry via `request_type`/bot name.

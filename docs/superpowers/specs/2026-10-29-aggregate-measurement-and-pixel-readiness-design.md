# Aggregate Measurement + Pixel Readiness — Design

**Date:** 2026-10-29
**Status:** Draft — awaiting review
**Motivation:** Swedish B2B marketers are dropping GA4/Meta/LinkedIn pixels and cookie banners in favour of
privacy-friendly analytics + UTM (LinkedIn thread, Dear Bob, 2026-10). The counter-argument is lost ad
optimisation. CortIQ can serve both sides: measure everyone without consent, and tell each site — with its own
numbers — whether the ad-optimisation layer is worth a banner.

---

## 1. Goals and non-goals

### Goals
1. **Aggregate mode** — an opt-in per-site measurement layer that runs *without* consent: page views, visits,
   approximate unique visitors, sources/UTM, and goal conversions attributed to the source of the visit.
2. **Pixel readiness** — a dashboard card that recommends, per site, "aggregate is enough" vs "the attribution layer
   (banner + Enhanced Conversions) pays off", based on the site's conversion volume and consent acceptance.
3. Make it safe to publish the claim *"CortIQ is designed so you can measure without a cookie banner"* — after legal
   review (§8).

### Non-goals (v1)
- No server-side-adapter-only variant (tracked as follow-up if a customer asks).
- No click/scroll/heatmap/session replay without consent — those stay behind analytics consent.
- No rewiring of every existing tab to read aggregate data. v1 surfaces it in Overview + the readiness card.
- No geo in aggregate mode beyond the `cf-ipcountry` header (currently not forwarded → null; see
  `edge-geo-and-dead-pipelines`). The browser time zone is **not** read in aggregate mode.

---

## 2. Legal position (what the design assumes)

- **ePrivacy / LEK 9 kap. 28 §:** aggregate mode stores nothing on the device and reads nothing from it except the
  site's existing consent record (consent management). This follows the narrower interpretation used by Plausible,
  Fathom and Simple Analytics. EDPB Guidelines 2/2023 read Art. 5(3) broadly (script-triggered transmission can count
  as "access"); that residual risk is the customer's call. Copy says *"designed to not require consent"*, never
  *"legally guaranteed"*.
- **GDPR:** the daily visitor hash is personal data. Lawful basis: legitimate interest (Art. 6(1)(f)). Mitigations:
  salt rotated and destroyed every 24 h, raw IP and UA never stored, hash→visit mapping purged after ≤ 48 h, only
  aggregates retained.
- **Right to object (Art. 21):** an explicit analytics *denial* in the CMP, or `Sec-GPC: 1`, suppresses aggregate
  hits for that visitor. Absence of a choice does not.
- Aggregate mode is **off by default**. The site owner switches it on in Settings after reading a short explanation
  that links to the DPA.

---

## 3. Architecture

```
Browser (spa-tracking.js, aggregate: true)
  │  every page view (incl. SPA navigations)  ─┐
  │  data-wfa-conversion form submit           ─┤  POST, keepalive, no storage, no IDs
  ▼                                             │
Edge Function: aggregate-hit  (verify_jwt = false)
  1. resolve site by tracking key + Origin; require sites.aggregate_measurement = true
  2. drop: known bots (ai-bot-registry / bot-detection), Sec-GPC: 1, rate limit exceeded
  3. hash = SHA-256(daily_salt ‖ site_id ‖ ip ‖ user_agent)   — ip/ua discarded after this line
  4. sanitize: path (no query/fragment), referrer → domain, utm_* (≤100 chars), device from UA
  5. rpc ingest_aggregate_hit(...)
  ▼
Postgres (SECURITY DEFINER, service role only)
  aggregate_visitors        ephemeral: hash → current visit + entry source   (purged after 48 h)
  aggregate_pages_daily     site, day, path → pageviews, entries
  aggregate_sources_daily   site, day, referrer_domain, utm_source/medium/campaign, device → visits, visitors
  aggregate_conversions_daily  site, day, goal_id, goal_name, source dims → conversions, value
  aggregate_salts           day → salt (purged after 24 h, never readable by clients)
```

The aggregate layer runs **alongside** the existing consented layer, not instead of it. Consented visitors are
counted in both; the aggregate tables are therefore the single source for *totals*, and the consented tables
(`page_views`, `tracking_sessions`, `conversion_events`) remain the source for behavioural and attributable data.
No deduplication between the layers is needed.

---

## 4. Components

### 4.1 Database (one migration)
- `sites.aggregate_measurement boolean NOT NULL DEFAULT false`.
- `aggregate_salts(day date PK, salt bytea NOT NULL)` — RLS on, **no** policies (service role only).
- `aggregate_visitors(site_id uuid, day date, visitor_hash text, visit_started_at timestamptz,
  last_seen_at timestamptz, referrer_domain text, utm_source text, utm_medium text, utm_campaign text,
  device text, PRIMARY KEY (site_id, day, visitor_hash))` — RLS on, no policies.
- `aggregate_pages_daily`, `aggregate_sources_daily`, `aggregate_conversions_daily` — dimension columns are
  `text NOT NULL DEFAULT ''` (so they can be part of the unique key), counters `integer NOT NULL DEFAULT 0`,
  `value numeric` on conversions. Unique key = site_id + day + all dimensions. RLS read policy per CLAUDE.md
  convention: `site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid())`. No client write policies.
- `ingest_aggregate_hit(p_site_id, p_day, p_hash, p_kind, p_path, p_referrer_domain, p_utm_source, p_utm_medium,
  p_utm_campaign, p_device, p_goal_id, p_goal_name, p_value)` — SECURITY DEFINER, `EXECUTE` granted to
  `service_role` only. Logic:
  - **Visit rule:** a hit starts a new visit when the hash is new for the day, or `last_seen_at` is > 30 min ago,
    or the hit carries an external referrer/UTM different from the current visit's source. A new visit sets the
    entry source and increments `visits` (and `visitors` if the hash is new for the day) in
    `aggregate_sources_daily`, and `entries` for the path.
  - `pageview`: increments `pageviews` for the path; updates `last_seen_at`.
  - `goal`: increments `aggregate_conversions_daily` using the *current visit's* entry source (direct = all empty).
- pg_cron: hourly job deletes `aggregate_salts` rows older than today (UTC) and `aggregate_visitors` rows older
  than 48 h. (48 h, not 24 h, so a visit crossing midnight UTC is not split mid-stream; the salt is still gone, so
  yesterday's hashes cannot be recomputed.)

### 4.2 Edge Function `supabase/functions/aggregate-hit/index.ts`
- `verify_jwt = false` in `config.toml`. CORS like `track-event`.
- Input: `{ siteKey, kind: 'pageview' | 'goal', url, referrer?, formId?, contentId?, value? }`.
- Site resolution via `_shared/resolve-site.ts` (same as `record-conversion`); reject if inactive or
  `aggregate_measurement` false (200 `{ skipped: 'disabled' }` — never error the customer's page).
- Page-visit goals: on `pageview`, match `matchPageVisitGoals(normalizeGoals(site.conversion_goals), url)` and
  emit a `goal` ingest per match (same shared module as `track-event`, so goal semantics stay identical).
- Form goals: `kind: 'goal'` from a `data-wfa-conversion` submit → goal name = matching configured goal by
  selector/form id, else `contentId` (mirrors the `server_record` path in `track-event`).
- Salt: read today's row; insert with `gen_random_bytes(32)` on first hit of the day (`ON CONFLICT DO NOTHING`,
  re-read).
- IP from `cf-connecting-ip` → first `x-forwarded-for` entry. Used only inside the hash.
- Rate limit: `check_rate_limit('agg:'||site_id, 600, 60)`.
- Responds `204` on success. Never logs IP, UA or hash.

### 4.3 Tracker `public/spa-tracking.js`
- New config `aggregate: true` / `data-aggregate="true"`; `trackingSnippet.ts`, Setup tab and WP plugin expose it.
- On every page view (initial + SPA route change) send `aggregate-hit` with `kind: 'pageview'`,
  `url = origin + pathname`, `referrer = document.referrer`, plus the current URL's `utm_*` values.
- On `submit` of a `data-wfa-conversion` form send `kind: 'goal'`. This listener is registered **independently**
  of `setupConversionTracking` (which stays consent-gated).
- Suppressed when: stored analytics consent is explicitly `false` (CortIQ banner, Cookiebot or Consent Mode
  `denied` from an *update*), or `navigator.globalPrivacyControl === true`.
- Writes **nothing** to cookies, `localStorage` or `sessionStorage`; no `MEMORY_SESSION_ID`; no fingerprint
  signals. Uses `fetch(..., { keepalive: true })`.
- Version bump per `shared-plugin-tracker-version` (5 places, version-sync test).

### 4.4 Dashboard
- **Settings → Tracking:** toggle "Aggregate measurement (no consent required)" with a three-line explanation
  and a link to the DPA section on aggregate measurement (added in v1.4, §8). Writes `sites.aggregate_measurement`.
- **`src/hooks/useAggregateStats.ts`:** reads the three daily tables for the global date range; returns totals
  (visitors, visits, pageviews), top sources, top pages, conversions by goal × source.
- **Overview:** when enabled, an "All visitors (aggregate)" strip + a "Conversions by source" table. Labelled so
  the user can tell aggregate totals from consented-session metrics (honesty pattern from
  `overview-segment-honesty`).

### 4.5 Pixel readiness
- **`src/lib/pixelReadiness.ts`** — pure function, no I/O, unit-tested:
  ```ts
  type Readiness = 'no_primary_goal' | 'fix_goals' | 'aggregate_enough' | 'borderline' | 'attribution_pays';
  assessPixelReadiness({
    primaryConversions30d, acceptanceRate /* 0..1 | null */, adsConnected, primaryGoalHealth
  }): { state: Readiness; effectiveConversions: number; reasons: string[] }
  ```
  - `effectiveConversions = primaryConversions30d × (acceptanceRate ?? ASSUMED_ACCEPTANCE)` — what an ad
    platform would actually see behind a banner. `ASSUMED_ACCEPTANCE = 0.5`, flagged as an assumption in
    `reasons` when used.
  - No primary goal → `no_primary_goal`. Primary goal `silent` / `fires_too_often` / `duplicate_primary` →
    `fix_goals`.
  - `effectiveConversions < 30` → `aggregate_enough`; `30–49` → `borderline`; `≥ 50` and `adsConnected` →
    `attribution_pays`; `≥ 50` without ads → `aggregate_enough` with reason "no ad platform connected".
  - Thresholds are named constants (`SMART_BIDDING_MIN = 30`, `SMART_BIDDING_COMFORTABLE = 50`) with a comment:
    rule of thumb from Google's Smart Bidding guidance (tCPA ≈ 30, tROAS ≈ 50 conversions / 30 days) —
    **verify against current Google Ads docs** before marketing copy quotes them.
- **`src/hooks/usePixelReadiness.ts`** — gathers inputs:
  - primary conversions: `aggregate_conversions_daily` when aggregate is on, else `conversion_events` matched on
    the primary goal's name (same matching as `useConversionGoalHealth`).
  - acceptance: `cookie_consents` analytics ratio, 30 days (same query as `ConsentImpact` — extract to a shared
    helper rather than duplicate).
  - `adsConnected`: `google_ads_customer_id` or `google_ads_enabled`.
  - goal health: `useConversionGoalHealth`.
- **`PixelReadinessCard.tsx`** — shown in Ads → Attribution and above `ConversionGoalsConfig`. Shows state, the
  three numbers behind it (conversions, acceptance, effective), the reasons, and a **Verify** line: "Based on N
  conversions on goal X, last 30 days. Thresholds are a rule of thumb — check Google Ads' bid strategy
  recommendations." CTA per state: enable aggregate mode / fix goals / open HubSpot + Enhanced Conversions wizard.

---

## 5. Error handling
- `aggregate-hit` never returns 4xx/5xx for business conditions the page cannot fix (disabled, bot, GPC, rate
  limit) — it returns 200/204 with a `skipped` reason, so customers' consoles stay clean. Malformed input → 400.
- RPC failure → logged without IP/UA/hash, 204 to the client (best effort, like the `ingest_pageview` bridge).
- Readiness with no data → `no_primary_goal` or `aggregate_enough` with reason "fewer than 7 days of data".

---

## 6. Testing (`npm run test:foundation`)
- `pixel-readiness.test.mjs` — every state, threshold edges (29/30/49/50), null acceptance → assumption reason.
- `aggregate-hit.test.mjs` (edge harness) — disabled site skipped; bot UA skipped; GPC skipped; path stripped of
  query; referrer reduced to domain; utm truncated; page-visit goal emitted; IP/UA never passed to the RPC.
- `aggregate-ingest.sql` + test — visit rule (new hash, 30-min gap, new external source), visitors counted once
  per day, conversion attributed to the visit's entry source, purge job removes salts/visitors.
- `tracker-config.test.mjs` extension — aggregate mode performs zero storage writes and no fingerprinting;
  suppressed on explicit denial and on `globalPrivacyControl`; consented layer unchanged.
- RLS test — a second user cannot read another site's aggregate rows; clients cannot read `aggregate_salts` /
  `aggregate_visitors`.

---

## 7. Rollout
1. Migration + edge function + tracker behind `aggregate_measurement = false` (no behaviour change).
2. Enable on CortIQ's own marketing site (self-tracking) and verify numbers against Cloudflare edge counts for a week.
3. Legal gate (§8).
4. Marketing site + docs + DPA update; LinkedIn post.

## 8. Legal & copy gate (before any public claim)
- `jurist` agent review of §2 against LEK 9:28, EDPB 2/2023, IMY guidance, and GDPR Art. 6(1)(f)/21.
- DPA → v1.4: describe aggregate processing, hash, retention (salt 24 h, visitor map 48 h), legitimate interest.
- Approved wording only: "designed to not require consent", "no cookies, no storage on the device, no persistent
  identifiers". Not: "GDPR-compliant without consent", "no banner needed" as an absolute.
- `marketing-bot-claims`-style test is **not** required; claims are reviewed manually in the PR.

## 9. Open follow-ups (not in this spec)
- Server-side-adapter-only aggregate counting (strictest option).
- Feeding aggregate totals into other tabs (Sources, Campaigns, Locations).
- Optional hidden-field source capture for customers' CRMs.

---

## 10. Amendments (2026-10-30, during planning)
1. **Separate beacon instead of a tracker change (§4.3).** The dashboard snippet and self-tracking load
   `spa-tracking.js` only after consent (`src/lib/consent-loader.js`), so aggregate logic cannot live in the
   tracker. It ships as a small standalone script, `src/lib/aggregate-beacon.js`, inlined into the snippet when
   aggregate is on and bundled into the WP plugin as `assets/cortiq-aggregate.js`. `spa-tracking.js` is unchanged
   and its "nothing before consent" tests stay valid. Form goals configured in the Goals tab are matched by the
   beacon using selectors returned in the pageview response.
2. **Stricter visitor-map retention (§4.1).** The day is part of the key and the salt changes daily, so a visit
   crossing midnight UTC splits regardless. `aggregate_visitors` rows are therefore deleted as soon as their UTC
   day has ended (≤ 24 h + up to one hour for the cron), not after 48 h.
3. **Pageview response (§4.2).** `kind: 'pageview'` returns `200 { goals: [{ id, selector }] }` (form goals only,
   no names or values); other successful hits return `204`.
4. **Server-side summary (§4.4).** Dashboard reads go through `get_aggregate_summary(site, from, to)` (SECURITY
   INVOKER, RLS-enforced) so totals are never truncated by the PostgREST row cap.

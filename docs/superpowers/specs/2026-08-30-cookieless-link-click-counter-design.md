# Cookieless per-link click counter — design

_Date: 2026-08-30. Status: approved design, ready for implementation plan._

## Problem

CortIQ has no working per-link click tracking. The dashboard panels that show clicks
(`NavigationAnalytics.tsx`, `ImportantInteractions.tsx`) read `user_interactions`, which is
empty for every site. All behavioural tracking (clicks, scroll, heatmaps) is gated behind
`hasInteractionConsent()` — which cookieless mode deliberately does **not** grant — so
cookieless sites (e.g. vikingage.se) collect only pageviews and sessions.

We want a **per-link click counter that works in cookieless mode without consent**, under the
same audience-measurement exemption that already covers aggregate pageview counts.

## Constraint that shapes everything

To run without consent under the audience-measurement exemption, the counter must be
**anonymous and aggregate**: a running tally per link, with no linkage to a session or visitor,
no coordinates, and no per-event rows. The moment a click is tied to a session or a per-visitor
path, it leaves the exemption and requires consent again.

Decision: keep the anonymous aggregate data in a **physically separate table** from any
consent-gated per-session data, so the GDPR boundary is clean and auditable.

## Scope

- **In:** aggregate per-link click counts for `<a href>`, `<button>`, and `[role=button]`,
  written from a cookieless-safe script path, readable in a new dashboard widget.
- **Also in (Phase B, additive):** per-session click detail behind interaction consent —
  fixes the existing `pixel-tracking` → `user_interactions` path.
- **Out:** heatmap coordinate capture, per-visitor click paths, click funnels.
- **Out:** third-party analytics integrations (Piwik/Matomo, etc.) — a separate future concern
  like the existing GA4 integration.

### Coexistence with third-party analytics

The counter is CortIQ's own first-party measurement, scoped per site, and is independent of any
other analytics a site runs (GA4, Piwik/Matomo, …). It is gated per site by `tracking_mode` and
consent: cookieless sites count without consent (exemption); full-mode sites (which need a
consent banner anyway for GA4/Piwik) follow the same analytics-consent record as pageviews. No
change to the design is needed to support sites that also run other analytics programs.

## Architecture

Chosen approach: **new dedicated table `link_click_counts` + new edge function
`link-click-counter`.** Rejected alternatives: reusing `heatmap_data` (grid coordinates, not
per-link, itself consent-gated) and reusing `user_interactions` with null sessions (mixes
anonymous and identified data in one table, muddies the boundary).

### 1. Data model — `link_click_counts` (new table + migration)

One row per unique combination, with a running total:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `site_id` | uuid | FK to `sites` |
| `page_path` | text | `location.pathname` — **query and hash stripped** to avoid PII in URLs |
| `link_kind` | text | `'link'` or `'button'` |
| `link_key` | text | anchors: destination host+path (query stripped); buttons: truncated text |
| `link_label` | text | visible text, max 200 chars |
| `device_type` | text | `desktop` / `mobile` / `tablet` |
| `day` | date | UTC date bucket — **not** a timestamp |
| `click_count` | integer | incremented on upsert |
| `created_at` | timestamptz | first-seen, default now() |
| `updated_at` | timestamptz | touched on increment |

Unique index on `(site_id, page_path, link_kind, link_key, device_type, day)` → upsert with
`click_count = link_click_counts.click_count + 1`.

Explicitly absent: `session_id`, `visitor_id`, `x/y coordinates`, sub-day timestamp. Their
absence is what keeps the table exemption-eligible.

**RLS:** enable RLS. Read policy: `site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid())`.
Writes only via the edge function using the service-role key (bypasses RLS). No anon insert policy.

### 2. Tracking script — `public/spa-tracking.js`

New `setupAggregateLinkCounter()`:

- Gated on `hasAnalyticsConsent()` (true in cookieless) — **not** `hasInteractionConsent()`.
  In full mode it follows the same analytics-consent record as pageviews.
- One delegated `click` listener. On a click, walk up to the nearest `<a href>`,
  `<button>`, or `[role=button]`.
- Build the anonymous payload client-side:
  - `pagePath` = `location.pathname` (no search, no hash)
  - `linkKind` = `'link'` for anchors, else `'button'`
  - `linkKey` = for anchors, the resolved URL's `host + pathname` with query/hash stripped;
    for buttons, `textContent` trimmed and truncated to 200 chars
  - `linkLabel` = `textContent` trimmed, truncated to 200 chars
  - `deviceType` = existing `getDeviceType()`
- POST to `link-click-counter`. No `session_id`, no `visitor_id`, no coordinates are sent.
- Called from the cookieless init path (alongside the pageview pipeline), independent of the
  identification/interaction pipeline.

The existing `setupClickTracking()` (per-event, `data-wfa-track`, interaction-consent gated)
stays unchanged and belongs to Phase B.

### 3. Edge function — `supabase/functions/link-click-counter/index.ts` (new)

- Public: `verify_jwt = false` in `config.toml`.
- Uses `SUPABASE_SERVICE_ROLE_KEY`.
- Input: `{ siteId, pagePath, linkKind, linkKey, linkLabel, deviceType }`.
- Server-side defence in depth: verify the site exists; re-strip any `?`/`#` from `pagePath`
  and `linkKey`; clamp `linkKind` to the allowed set; truncate `linkLabel`/`linkKey` to 200;
  normalise `deviceType` to the allowed set.
- Upsert into `link_click_counts` with `day = current UTC date`,
  `on conflict (...) do update set click_count = ... + 1, updated_at = now()`.
- CORS like the other public tracking endpoints. Errors logged, never thrown to the client
  (a failed counter must never break the host page).

### 4. Dashboard — `LinkClickCounts.tsx` + `useLinkClickCounts.ts` (new)

- Hook reads `link_click_counts` for the selected `site_id`, summing `click_count` over a
  chosen window (7 / 30 / 90 days), grouped by `(page_path, link_kind, link_key, link_label)`.
- Component: a card placed in the Heatmap tab near Navigation Analytics. Top links table:
  label, destination (`link_key`), kind badge, total clicks, with a days selector and an
  optional device breakdown. Works in cookieless with no consent, so it is the default
  click view for cookieless sites.

## Data flow

```
visitor clicks a link/button (cookieless, no consent)
  → spa-tracking.js setupAggregateLinkCounter() builds anonymous payload
  → POST /functions/v1/link-click-counter
  → edge fn validates + strips + upserts increment into link_click_counts (day bucket)
  → dashboard useLinkClickCounts() reads aggregate → LinkClickCounts widget
```

## Phasing

- **Phase A (the actual requirement):** table + migration, edge function, script counter,
  dashboard widget. Delivers cookieless per-link counters without consent.
- **Phase B (the second half of "both"):** fix `pixel-tracking/index.ts` (remove the
  non-existent `site_id` column from the `user_interactions` insert) and wire per-event click
  capture to `user_interactions` behind `hasInteractionConsent()`, per
  `docs/click-tracking-gap-analysis.md`. Additive; build after Phase A.

## Testing

- **Edge function:** unit-test the sanitiser (query/hash stripping, truncation, kind/device
  clamping) and the upsert-increment (second identical click bumps `click_count` to 2; a
  different `day`/`device_type` creates a new row).
- **Script:** verify `setupAggregateLinkCounter` fires in cookieless (payload carries no
  session/visitor/coordinate fields) and that the anchor/button/role=button resolution +
  query-strip is correct.
- **RLS:** a user cannot read another user's `link_click_counts` rows.
- **Dashboard:** hook aggregates correctly across days and device types; widget renders empty
  state when there are no rows.

## GDPR notes

- No identifiers, no session linkage, no coordinates, day-level bucket, query-stripped paths →
  aggregate audience measurement, exemption-eligible, no consent required in cookieless.
- Data-retention: anonymous aggregate counts are low-risk and may be retained longer than
  identified data; confirm whether the existing retention cron should skip this table.

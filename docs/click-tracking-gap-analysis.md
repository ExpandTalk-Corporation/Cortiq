# Click / link-interaction tracking — gap analysis & plan

_Investigated 2026-08-30. Trigger: "where do I see which links visitors click on vikingage?" — the dashboard panels are empty._

## Symptom

Two dashboard panels are built to show link/element clicks:

- **Heatmap → Navigation Analysis → "Key Navigation Interactions"** (`NavigationAnalytics.tsx`)
- **"Key Interactions"** widget (`ImportantInteractions.tsx`)

Both read the `user_interactions` table. It is **empty for every site** (0 rows platform-wide), so both panels are always empty.

## Root cause — three independent breaks

### 1. The mainline tracking script never captures generic clicks
`public/spa-tracking.js` `setupClickTracking()` (line ~316) only fires on elements carrying a
`data-wfa-track` attribute, and posts them to the `track-event` edge function → `tracking_events`
table (**not** `user_interactions`). A normal WordPress site has no `data-wfa-track` attributes,
so effectively **zero** clicks are captured. The WordPress plugin (`wordpress-plugin/cortiq-analytics.php`)
has only one click listener — on the consent-banner button — not general interaction tracking.

Result for vikingage: `tracking_events` = 0, `user_interactions` = 0. Only `page_views` (4344)
and `tracking_sessions` (1135) flow.

### 2. The only writer of `user_interactions` is broken
`supabase/functions/pixel-tracking/index.ts:300-318` is the sole code path that inserts into
`user_interactions`. Its insert object includes `site_id: siteId`, but `user_interactions` has
**no `site_id` column** (columns: `id, session_id, page_view_id, interaction_type, element_tag,
element_id, element_class, element_text, x_coordinate, y_coordinate, scroll_position, timestamp_ms,
created_at`). Every insert therefore fails with "column site_id does not exist" and is only logged,
never thrown. So even a site that called `pixel-tracking` would write nothing.

`pixel-tracking` is also not referenced by `spa-tracking.js` or the WP plugin — only by
`first-party-proxy`, `gdpr-compliant-tracking`, and `FirstPartySetupGuide.tsx`.

### 3. Behavioural tracking is consent-gated (correct, but currently a no-op)
`hasInteractionConsent()` (`spa-tracking.js:423`) requires a stored analytics-consent record
(cookieless mode alone does **not** grant it). vikingage has 0 consent records, so even if #1
and #2 were fixed, clicks/scroll/heatmaps would stay deferred until a consent banner records
analytics consent (or the operator sets `config.requireConsent = false` under their own lawful basis).

## The dashboard read side also assumes a schema that drifted
`NavigationAnalytics.tsx` and `ImportantInteractions.tsx` join `user_interactions` → `page_views`
via `page_view_id` and filter by `page_views.site_id`. That join is fine. But `mcp-server/index.ts`
(cortiq_click_counts / cortiq_top_outbound) filters `user_interactions` by `session_id` and notes
"no site_id", "url not available", "href not stored" — the table has no element `href`, so
"top outbound links" can only ever show link **text**, not destination URLs.

## Plan (phased — confirm before coding)

**Phase 1 — make the pipe work end to end (small):**
1. Fix `pixel-tracking/index.ts`: drop `site_id` from the `user_interactions` insert (it is not a
   column; `site_id` lives on the joined `page_views` row). Verify the heatmap-grid write below it
   still resolves `siteId` correctly.
2. Add generic click capture to `spa-tracking.js`: on `hasInteractionConsent()`, attach a delegated
   `click` listener that records tag / id / class / text (and for `<a>`, the `href`) and sends it to
   the interaction endpoint. Gate strictly behind interaction consent (keep the existing deferral).
3. Decide the write target: reuse `pixel-tracking` (already writes `user_interactions` + heatmap grid)
   or add an `interaction` branch to `track-event`. Prefer `pixel-tracking` to avoid duplicating the
   heatmap-grid logic.

**Phase 2 — capture link destinations (schema):**
4. Add an `element_href` column to `user_interactions` (migration) so outbound-link reports show the
   destination, not just link text. Update `mcp-server` outbound tool and the dashboard panels.

**Phase 3 — enablement:**
5. For vikingage specifically: clicks will only start flowing once analytics consent is recorded
   (deploy/verify the consent banner) OR the site opts into `requireConsent=false`. Cookieless mode
   does not unlock behavioural tracking by design.

## Evidence (vikingage, site_id 47825658-d66e-4dfe-9bbb-5b20aeb0f6b2)
- page_views 4344 (1232/7d), tracking_sessions 1135
- cookie_consents 0, user_interactions 0, tracking_events 0, heatmap_data 0
- Platform-wide: user_interactions 0 rows (all sites); cookie_consents 2658 across 2 other sites

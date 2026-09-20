# Design: Google Ads optimization layer (read → recommend → one-click apply)

**Date:** 2026-08-27
**Branch:** `feat/google-ads-optimization` (based on `main`)
**Status:** Draft design, pending spec review
**Design partner:** Pretec AB (first account — B2B lead-gen, Google Ads managed by Expandtalk)

## Problem

CortIQ can already *read* Google Ads campaign totals and *push* lead-quality signals
back, but there is no layer that turns that data into optimization. Concretely:

- `google-ads-import` returns **campaign-level metrics only**, for the last 7/30/90
  days, and **does not persist** them (results go straight to the frontend). No
  ad-group, keyword or search-term granularity, and no history.
- `google-ads-quality-upload` uploads HubSpot lead quality to the Google Ads
  Conversion Adjustments API — the attribution loop — but it is not an optimizer.
- There is no rule engine, no recommendation surface, and no way to *act* on Ads
  from CortIQ. All optimization happens manually in the Google Ads UI.

The product goal ("an agent that pulls live ad data, runs it through rules and
prediction, and turns the result into concrete actions the marketer applies with one
click") has no home in the codebase. This spec builds the foundation for it, scoped to
what is buildable on the existing Google Ads API integration.

## Decision

Build a **Google Ads optimization layer in three phases**, reusing the existing
`site_integrations` credential model and the OAuth refresh already in
`google-ads-import`:

1. **Deepen + persist reads** — sync campaign/ad-group/keyword/search-term metrics into
   history tables.
2. **Rule engine → grounded recommendations** — deterministic rules produce
   recommendation rows, each carrying its evidence, surfaced in a new Optimization view
   and to the MCP server.
3. **Guarded one-click apply** — a dedicated, audited mutate function applies a single
   recommendation, with dry-run, an allow-list of operation types, and a change log.

This respects the layer separation in `docs/ARCHITECTURE.md`: the **Data Layer** owns
all reads/writes to Google Ads; the **Agentic Layer** (AI assistant, MCP) only *reads*
recommendations and *requests* an apply — it never calls the Google Ads API directly.

**Explicitly deferred** (see Out of scope): customer LTV and return-probability models,
and Meta Ads + Merchant Center ingestion. Those are the gap between this layer and the
full vision; they are not blockers for a useful v1 on a Search/lead-gen account.

## Current state (verified against code)

- **Credentials:** `site_integrations` row, `integration_type = 'google_ads_api'`,
  `is_active = true`, `integration_config` JSON with `developer_token`, `customer_id`,
  `client_id`, `client_secret`, `refresh_token`, `login_customer_id`
  (`supabase/functions/google-ads-import/index.ts:107-131`).
- **Auth:** `refreshAccessToken()` exchanges the refresh token at
  `oauth2.googleapis.com/token` (`google-ads-import/index.ts:10-31`). Reusable as-is.
- **API:** GAQL `POST .../vNN/customers/{id}/googleAds:search`, `login-customer-id`
  header for MCC. Version pinned as `ADS_API_VERSION = 'v17'`
  (`google-ads-import/index.ts:8,33-85`).
- **Attribution loop:** `google-ads-quality-upload`, `hubspot-lead-webhook`,
  `conversion_events` (`gclid`, `hashed_email`, `lead_quality`, `quality_value`,
  `upload_status`), `sites.google_ads_customer_id` (CLAUDE.md §Conversion & Attribution).
- **Goal health:** `src/hooks/useConversionGoalHealth.ts` already classifies
  `fires_too_often` / `silent` / `duplicate_primary` — reuse as a rule source.
- **Attribution UI:** `src/components/dashboard/tabs/AttributionTab.tsx` — the new
  Optimization view sits beside it under the Ads section.
- **MCP:** `supabase/functions/mcp-server/` (23 tools) — new read-only tools attach here.

## Approach

### 1. DB migrations — history + recommendations + audit
New migration `supabase/migrations/<ts>_google_ads_optimization.sql`:

- `google_ads_metrics_daily` — one row per `site_id` + `date` + `level`
  (campaign/ad_group/keyword/search_term) + resource id/name, with
  `cost`, `clicks`, `impressions`, `conversions`, `conversions_value`. Upsert key
  `(site_id, date, level, resource_id)`.
- `google_ads_recommendations` — `id`, `site_id`, `rule_id`, `severity`,
  `target_resource` (JSON: level + ids + names), `proposed_action` (JSON: op type +
  payload), `evidence` (JSON: metrics/rows the rule read), `status`
  (`proposed` / `applied` / `dismissed` / `stale`), timestamps.
- `google_ads_change_log` — append-only audit: `recommendation_id`, `site_id`,
  `operation`, `request_payload`, `api_response`, `applied_by`, `applied_at`,
  `dry_run` bool.
- **RLS** (existing convention): `site_id IN (SELECT id FROM public.sites WHERE user_id
  = auth.uid())`. Edge Functions write with the service-role key.

### 2. Reads — `google-ads-sync` edge function
Generalize `google-ads-import` into a sync that runs several GAQL queries and **upserts**
into `google_ads_metrics_daily`:
- `campaign`, `ad_group`, `keyword_view`, `search_term_view` — segmented by
  `segments.date`, `LAST_30_DAYS` on demand and a daily incremental for yesterday.
- Reuse `refreshAccessToken`, the creds loader, and the `login-customer-id` handling
  verbatim. Keep `ADS_API_VERSION` a single pinned constant.
- Scheduled daily via Supabase scheduled function / `pg_cron`. `google-ads-import`
  stays as the live read-through for the current dashboard until the UI moves to the
  persisted tables.

### 3. Rule engine — `google-ads-recommend`
A pure module (`supabase/functions/_shared/ads-rules.ts`) that reads the metrics tables
and emits recommendation rows. Rules for a lead-gen account, v1:
- **Wasted spend** — search term with cost ≥ threshold and 0 conversions →
  propose exact campaign negative. (Same logic as the standalone Google Ads Script, now
  centralized.)
- **Idle keyword** — keyword with spend and 0 conversions over N days → propose pause
  or bid decrease.
- **Budget pace** — MTD spend projecting >115% or <70% of the site's monthly budget →
  propose budget change.
- **Goal health** — wrap `useConversionGoalHealth` logic server-side → flag
  Smart-Bidding-signal issues (no mutation, advisory).
Every rule writes `evidence` (tables queried, row counts, the exact metrics) so the
"transparent insights" principle holds — the UI and AI can show *why*.

### 4. UI — `OptimizationTab`
`src/components/dashboard/tabs/OptimizationTab.tsx` (+ `src/hooks/useAdsRecommendations.ts`),
registered in `DashboardTabs.tsx` under Ads, beside Attribution Gap:
- Recommendations grouped by severity; each card shows the proposed action, the
  evidence, and an **Apply** button (and Dismiss).
- Apply calls `google-ads-mutate` for that one recommendation; the card reflects
  `applied` / error from the change log.
- MCP: read-only tools `list_ads_recommendations`, `get_ads_recommendation` so the AI
  assistant can explain and prioritize — but apply stays a human click in v1.

### 5. Mutate — `google-ads-mutate` edge function (guarded)
Applies **one** recommendation via the Google Ads API mutate endpoints:
- Negatives → `campaignCriterion` create; keyword pause/bid → `adGroupCriterion`
  update; budget → `campaignBudget` update.
- **Guardrails:** allow-list of operation types; server-side re-validation that the
  recommendation is still `proposed` and its evidence still holds (re-query metrics —
  reject if stale); `dry_run` flag (validateOnly on the API); a per-site per-day
  mutation cap; every attempt appended to `google_ads_change_log`. No bulk apply, no
  auto-apply.
- Requires the connected Google account's OAuth to include the `adwords` write scope —
  documented in the HubSpot/Ads setup wizard.

## Edge cases
- **Token refresh failure** → surface as a typed error; recommendations stay `proposed`.
- **API version bump** → `ADS_API_VERSION` stays a single constant; upgrading is one edit
  plus a query-shape check. Pin, don't float.
- **MCC vs direct** → `login_customer_id` optional, already handled.
- **Quota / rate limits** → sync backs off and logs; mutate is one-op-per-call so it
  cannot storm the API.
- **Stale recommendation** → re-validated at apply time; if metrics moved past the rule
  threshold, the apply is rejected and the row marked `stale`.
- **Partial mutate failure** → captured in `api_response`; row not marked `applied`.
- **Consent** → reading the advertiser's *own* Ads data needs no end-user consent; the
  lead-quality upload stays marketing-consent-gated exactly as today.

## Testing
No local Supabase emulator (per CLAUDE.md). Verify against the cloud project + a
low-budget live Pretec test campaign:
1. Configure `site_integrations` for the Pretec site; run `google-ads-sync`; confirm
   `google_ads_metrics_daily` fills for all four levels.
2. Run `google-ads-recommend`; confirm recommendation rows with populated `evidence`.
3. Apply one recommendation with `dry_run = true`; confirm `google_ads_change_log`
   records it and the account is unchanged (`validateOnly`).
4. Apply for real on a throwaway negative; confirm it appears in Google Ads and in the
   change log.
5. `tsc --noEmit` clean; `npm run build` succeeds.

## Out of scope
- **Customer LTV & return-probability models** — the "optimize for profit, not vanity
  ROAS" prediction layer. Needs order/return data from the CRM/e-commerce backend;
  separate spec.
- **Meta Ads + Merchant Center ingestion** — v1 is Google Ads only (fbclid capture
  already exists for attribution, not full Meta ingest).
- **Auto-apply / autonomous agent** — every mutation is a human click in v1.
- **PMax asset mutations**, multi-tenant rule-threshold UI, bulk apply.

## Rollout
DB: `supabase db push`. Functions: `supabase functions deploy google-ads-sync
google-ads-recommend google-ads-mutate`. Feature-flag `OptimizationTab` per site;
enable for Pretec first. Schedule the daily sync via `pg_cron`. Document the required
`adwords` write scope in the Ads setup wizard before enabling mutate.

## Relation to the product vision
Vision: live data (Ads/Meta/Merchant/GA4) → rule engine + prediction → one-click
actions, plus LTV and return probability. This spec delivers the **Google Ads slice**:
persisted live reads, a deterministic rule engine, grounded recommendations, and guarded
one-click apply. The prediction models (LTV, return probability) and the Meta/Merchant
data sources are the named, deferred next specs.

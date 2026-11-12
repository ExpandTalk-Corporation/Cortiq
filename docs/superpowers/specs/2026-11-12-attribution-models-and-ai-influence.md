# Attribution: observed journeys, AI influence and incrementality

Date: 2026-11-12 · Status: layer 2 being built, layers 1 and 3 not started

## Problem

CortIQ has no attribution model. A conversion is tied to the source of the visit it happens in
(aggregate conversions per referrer/UTM), conversions are uploaded to Google Ads by click ID, and
the Attribution Gap tab reconciles CortIQ conversions with HubSpot lead quality. Nothing connects
visits by the same person, and nothing shows the touchpoints that never reach the site.

Most of a buying journey happens off the site: an AI answer that uses the site's content, a
friend's share, a later brand search. Consent, blockers and cross-device use remove most of the
rest. Any single model (first click, last click or anything in between) presents half the story as
the whole. CortIQ's advantage is that it sees some of what GA4 cannot: AI assistants fetching
pages on a user's behalf, AI citation crawlers, and AI assistant referrals as their own channel.

Principle: show what was observed, show what was not, and never present one model as the truth.

## Current data (2026-11-12)

| Data | Where | Cross-visit? |
|---|---|---|
| Visit source | `tracking_sessions.referrer`, `utm_*` | no |
| Conversions | `conversion_events` (session_id, page_view_id; no visitor_id, no source) | no |
| Consent-free conversions | `aggregate_conversions_daily` (day, goal, referrer_domain, UTM) | no |
| Visitor | `unified_visitors`, id = server-side SHA-256 of a device fingerprint | yes, but see risk below |
| AI fetches | `ai_bot_traffic` (url, bot_type, `request_type` = training/agentic/citation, detected_at) | n/a |
| AI referrals | referrer or utm_source matching `src/ontology/traffic.ts` `ai_search_referral` children | no |
| Search Console | `gsc_data` (30-day snapshots per query/page), brand terms in `site_google_credentials.brand_keywords` | n/a |
| Google Ads cost | fetched live by `google-ads-import`, not stored | n/a |

`ai_bot_traffic.bot_category` is a dead column (always `other`); the category lives in `request_type`.

## Layer 1: observed journeys (consented data only, not built)

- Visitor id: a random first-party id in localStorage, written only after analytics consent and
  removed on withdrawal. Never the fingerprint id in `unified_visitors`.
- Store source and channel per visit (referrer, UTM, click-ID type, channel) and `visitor_id` on
  `conversion_events`.
- Models side by side: first touch, last non-direct, linear, position-based (40/20/40), time decay
  (7-day half-life). Lookback 30 or 90 days.
- Main view is a model comparison: how much credit each channel gets under each model. The spread
  is the uncertainty and is shown, not hidden.
- Coverage line, always visible: "X % of conversions have an observed journey; the rest are
  aggregate or without consent."
- AI assistants are their own channel in attribution, not a child of organic search.
- Before building: jurist review and DPA 1.6 (localStorage id = storage on the terminal equipment
  and a persistent identifier), tracker version bump.

## Layer 2: AI influence and brand signals (being built)

No new data collection. Read-only aggregation of data CortIQ already stores. Shown as signals,
never as credit.

RPC `get_ai_influence(p_site_id, p_from, p_to, p_window_days default 14)`, owner-checked like
`get_attribution_gap`, returns:

- **daily:** per day, agentic fetches, citation fetches and AI assistant referral visits.
  - Referral visits come from `aggregate_sources_daily` when the site has aggregate measurement on
    (it counts every visit), otherwise from `tracking_sessions`, so a visit is never counted twice.
  - Referral matching: referrer host or utm_source from the `ai_search_referral` children in
    `src/ontology/traffic.ts`. A foundation test keeps the SQL list in sync with the ontology.
- **assistants:** fetches per AI assistant (`bot_type`) and category.
- **pages:** the 20 paths with the most agentic + citation fetches, with conversions on that path.
- **conversions:**
  - the total in the period
  - conversions on a page that an AI assistant fetched (agentic or citation) in the
    `p_window_days` before the conversion
  - Labelled "on pages AI assistants read", a correlation, not a cause.
- **brand:**
  - Search Console brand and non-brand clicks and impressions per snapshot.
  - Brand terms are the site's `brand_keywords`, matched the same way as `GSCVisibilitySection`
    (case-insensitive substring).
  - With no brand keywords set, brand is null and the card links to the setting.

UI: an "AI influence" card in Ads → Attribution, shown in every state (also with no conversions,
because the signals do not need conversions). Copy rules:
- "signal", "AI assistants read these pages", "correlation"
- never "AI drove X conversions" or "credit".

Out of scope for layer 2: training crawlers (no referral value), per-visitor joins, new tables.

## Layer 3: incrementality (not built)

- Store Google Ads cost per campaign and day.
- A test guide: pause a campaign, or run it only in some regions, for a fixed period. Compare
  conversions against a control with a confidence interval. Small sites get wide intervals, said
  plainly.

## Risks and open points

- No cross-device journeys in any layer.
- Low consent rates mean low layer 1 coverage, hence the coverage line.
- Public copy: "observed journeys" and "AI influence signal", never "true attribution".
- The fingerprint-based id in `unified_visitors` needs a separate review regardless of this spec
  (open point from the jurist review of #139).
- Production data on 2026-11-12 is thin (no conversion events, 1 agentic fetch in 30 days), so
  layer 2 must render a useful empty state per section.

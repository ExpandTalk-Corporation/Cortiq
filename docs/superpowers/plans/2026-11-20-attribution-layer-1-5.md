# Plan: attribution layer 1.5 — self-reported source (2026-11-20)

Spec: `docs/superpowers/specs/2026-11-12-attribution-models-and-ai-influence.md`, "Layer 1.5" and
"Jurist review 2026-11-20". Scope: both capture paths (HubSpot property, form select/radio field),
full mode only, no consent-free aggregate path.

## Decisions

- **Fixed category list, no custom categories.** Codes: `organic_search`, `paid_search`, `paid_social`,
  `social`, `email`, `referral`, `direct`, `ai_assistant`, `podcast`, `community`, `event`,
  `colleague_or_friend`, `other`. The customer maps *answer values* to these codes; the settings UI
  warns against answer options that reveal sensitive data. One list in
  `supabase/functions/_shared/reported-channel.ts`; the SQL CHECK, the tracker and the UI are kept
  equal by a foundation test.
- **Mapping** (both paths): trim + lower-case exact match against the site's value list, else `other`.
  HubSpot: in edge-function memory. Form: in the browser; only the category is sent.
- **Policy-version gate (fail closed).** `sites.reported_channel_policy_version` must be set to enable
  either path. An answer is stored only when the session's latest consent row (picked before any
  filter) is given, not expired, has the purpose (analytics for the form, marketing for HubSpot) and
  that exact `policy_version`. The customer bumps the banner's policy version after updating the
  texts, so only visitors who saw the new text count. Implements the "match only rows consented under
  the new policy_version" recommendation for both paths.
- **Form field by name only** (`<select name>` or `<input type=radio name>`), not a CSS selector:
  smaller surface, and the tracker checks the element type before reading.
- **Aggregate only.** The category is read by one RPC (`get_reported_channel`, SECURITY DEFINER,
  owner check; the `conversion_reported_channel` table has no read policy) that returns cell counts, with counts 1–4 returned as `null` + `lt5`. No row view.
  `public-api`, `google-ads-quality-upload`, GA4 sync and AI insights use explicit column lists
  without it; a foundation test enforces this.

## Steps (one commit each, test first)

1. **Migration `20261210000001_reported_channel.sql`**
   - `conversion_reported_channel` (conversion_id PK → conversion_events ON DELETE CASCADE, site_id, channel
     CHECK fixed list); RLS on, no policy, no grants to anon/authenticated. (Changed from a column on
     conversion_events after code review 2026-11-20; a new table also makes NOT VALID/VALIDATE moot.)
   - `sites`: `reported_channel_hubspot_property`, `reported_channel_hubspot_map jsonb`,
     `reported_channel_form_field`, `reported_channel_form_map jsonb`, `reported_channel_policy_version`;
     CHECKs via `is_valid_reported_channel_map(jsonb)` (object, ≤50 keys, keys ≤100 chars, values in list).
   - `reported_channel_consent_ok(site, session text, path)` — service role only.
   - `record_conversion_event` gets `p_reported_channel text DEFAULT NULL` (drop + recreate, same grants).
   - `apply_reported_channel_hubspot(site, hashed_email, category)` — service role only; adds a category row
     for marketing-consented conversions (`click_id_consent_given`, hashed email) that have no
     answer yet and pass the consent gate; never `upload_status`, never depends on `quality_classified_at`.
   - `observed_channel(referrer, utm_source, utm_medium)` and `get_reported_channel(site, from, to)`.
   - PGlite test `reported-channel.sql`.
2. **HubSpot path** in `hubspot-lead-webhook`: own loop branch for the configured property; drop unmatched;
   no queue, no retry; no logging of value or email.
3. **Form path**: track-event returns the form config with the page-view response (own `sites` query,
   not in cookieless); the tracker reads only the configured select/checked radio on submit, under
   `hasInteractionConsent()` and the same `consentGeneration`, maps to a category and sends it with the
   goal hit (track-event strips it from the stored metadata) and with `record-conversion`.
   Version 5.5.21 everywhere version-sync checks.
4. **Texts**: banner analytics + marketing texts in 13 languages (+ WP plugin banner), Privacy.tsx (§5A
   and "field content is not captured"), GDPR.md, the "Field values are never read here" comment,
   DPA 1.7 (data categories, purpose (d), changelog).
5. **Guarantee test**: `reported_channel` absent from the Google Ads upload, GA4 sync, AI insight code and
   public API.
6. **UI**: "Self-reported source" card in Ads → Attribution; settings card under Settings → Integrations
   → HubSpot with both paths, the sensitive-categories warning and art. 13 notice templates; pointer in
   the HubSpot wizard's property step.
7. **CLAUDE.md** section; `npm run build` (public/v/5.5.21, sri-manifest, plugin zip).

## Deploy order (not done here)

1. `supabase db push --remote` (new columns and functions; `record_conversion_event` keeps working for
   the old 6-argument call).
2. Functions: `track-event`, `record-conversion`, `hubspot-lead-webhook`.
3. dist FTP (tracker 5.5.21, banner texts, dashboard).
4. WP plugin 5.5.21 release.
5. Jurist-agent check of the banner texts before any customer enables the feature.

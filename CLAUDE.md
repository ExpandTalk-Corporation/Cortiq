# CLAUDE.md — CortIQ

CortIQ is an open-source web analytics platform focused on AI bot intelligence and cookie-free tracking, built by Expandtalk Corporation AB.

---

## Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, TanStack Query
- **Backend**: Supabase (PostgreSQL + Deno Edge Functions + RLS)
- **Charts**: Recharts, Leaflet.js
- **Session replay**: rrweb 2.0
- **Tracking script**: Vanilla JS, embeddable on any site

Key numbers: 66 DB tables · 76 Edge Functions · 144 migrations · 135 dashboard components (28 tabs)

---

## Local development

```bash
npm install
cp .env.example .env   # fill in VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, VITE_SUPABASE_PROJECT_ID
npm run dev            # → http://localhost:8080
```

The dev server connects to the Supabase cloud project. There is no local Supabase emulator setup.

---

## Project structure

```
src/
  components/dashboard/   # All dashboard UI — tabs, widgets, charts
  components/dashboard/tabs/  # One file per dashboard tab
  hooks/                  # Data fetching hooks (useAIBotTracking, useAnalytics, etc.)
  pages/                  # Public marketing pages + Dashboard + Auth
  integrations/supabase/  # Auto-generated client and TypeScript types

supabase/
  functions/              # Edge Functions — one folder per function
  migrations/             # Sequential SQL migrations

public/
  spa-tracking.js         # Embeddable tracking script for external sites
  cortiq-server.mjs       # Server-side AI agent adapter (Next/Netlify/Node)
  cloudflare-worker.js    # Server-side AI agent adapter (Cloudflare)
```

---

## Key conventions

### Dashboard tabs
Each tab in `src/components/dashboard/tabs/` is a self-contained component receiving `selectedSite` as a prop. Data fetching happens inside the tab via a dedicated hook in `src/hooks/`.

### Edge Functions
All Edge Functions live in `supabase/functions/`. They use `Deno.env.get()` for secrets — never hardcode. Public endpoints (tracking, consent) have `verify_jwt = false` in `supabase/config.toml`.

### Database
All tables have Row Level Security enabled. Company isolation is enforced at the DB level — never rely solely on application-layer filtering. Use `site_id` and `company_id` consistently.

### Environment variables
Frontend vars are prefixed `VITE_`. Only the anon/publishable key goes in the browser — the service role key is Edge Function only.

---

## AI bot classification

CortIQ classifies AI traffic into three categories — this is the core differentiator:

### Heatmaps
- **Click heatmaps** — tracked via `interaction_type: 'click'` events in `heatmap_data` table
- **Scroll depth heatmaps** — tracked via `interaction_type: 'scroll'` at 25/50/75/100% milestones. `ScrollDepthChart.tsx` renders the funnel visualization.

### AI bot classification

| Category | Examples | Interpretation |
|----------|----------|---------------|
| Training Crawlers | GPTBot, ClaudeBot, Google-Extended | Infrastructure cost, no referral value |
| Agentic Fetches | ChatGPT-User, Claude-User, Perplexity-User (in-browser agents like Comet send stock Chrome UAs — JS-signal heuristics only) | Real user intent, track and convert |
| Citation Crawlers | PerplexityBot, YouBot, DuckAssistBot | AI search indexing, visibility signal |

Canonical registry: `supabase/functions/_shared/ai-bot-registry.ts` (used by `ai-bot-tracker` and `cloudflare-ingest`). Frontend, `src/ontology/agents.ts` and marketing pages import it via `src/lib/aiBotRegistry.ts` — never keep a separate bot list. `tests/foundation/marketing-bot-claims.test.mjs` fails if a public page names a bot the registry does not classify.

---

## Conversion & Attribution (added 2026-06-24)

Five features that make CortIQ the single source of truth for paid conversion measurement — motivated by the common GA4 + Google Ads + HubSpot attribution gap problem.

### 1. First-Party Click ID Capture
`public/spa-tracking.js` captures `gclid`, `fbclid`, `msclkid`, `ttclid`, `li_fat_id` from URL params. Only stored when `marketing` consent is given. Persisted in `sessionStorage` and passed to `visitor-identification` edge function, which writes to `unified_visitors`.

**GDPR gate:** `hasMarketingConsent()` in tracking script — no click IDs captured without explicit marketing consent. In `eu_strict` jurisdiction, skipped automatically.

### 2. Conversion Goal Health Monitor
`src/hooks/useConversionGoalHealth.ts` — flags misconfigured goals:
- `fires_too_often` — firing rate >30% of sessions (e.g. `user_engagement` wrongly set as a goal)
- `silent` — zero conversions in 30 days (broken tag)
- `duplicate_primary` — multiple Primary goals corrupting Smart Bidding signal

Shown inline in `ConversionGoalsConfig.tsx`. Each goal now has a Primary/Observation toggle.

### 3. Form Auto-Discovery with GUID Detection
`supabase/functions/form-detector/` extended to detect HubSpot form GUIDs (`hs_context` input parsing, `data-form-id` attributes) and Gravity Forms. Results written to `form_registry` table. `FormDiscoveryWidget.tsx` shows "X forms found, Y unidentified" in the Forms tab.

### 4. HubSpot Lead Quality Feedback Loop
Full pipeline: HubSpot CRM → CortIQ → Google Ads Enhanced Conversions.

- `supabase/functions/hubspot-lead-webhook/` — receives `contact.propertyChange` webhooks, validates HubSpot HMAC signature, SHA-256 hashes email immediately, updates `conversion_events` with `lead_quality` + `quality_value` (Priority=300, Qualified=100, Challenge=0)
- `supabase/functions/google-ads-quality-upload/` — daily batch upload of Priority/Qualified leads as click conversions (`uploadClickConversions`, `orderId` = conversion id) to the "Import from clicks" conversion action picked in Settings → Integrations → Google Ads (`google_ads_connections.conversion_action_id`); sites without a picked action are skipped with `no_conversion_action`. Only uploads leads where `click_id_consent_given = true`
- `HubSpotIntegrationWizard.tsx` — 5-step setup wizard in Settings → Integrations → HubSpot
- `src/hooks/useLeadQualityPipeline.ts` — pipeline status (pending / uploaded / skipped counts)

**GDPR:** `hashed_email` column stores SHA-256 only — raw email never touches CortIQ. Upload skipped if no marketing consent on original session.

Webhook endpoint: `https://[project].supabase.co/functions/v1/hubspot-lead-webhook?site_id=[uuid]`
Upload function: `google-ads-quality-upload` — requires a Google Ads connection with an account and a conversion action picked.

### 5. Attribution Gap Dashboard
`src/components/dashboard/tabs/AttributionTab.tsx` (Ads → Attribution Gap) — three-column view comparing CortIQ conversions vs HubSpot quality MQLs, gap %, and Enhanced Conversions upload status. `src/hooks/useAttributionGap.ts` aggregates from `conversion_events`.

### New tables
| Table | Purpose |
|---|---|
| `form_registry` | Auto-discovered forms with provider GUIDs and user-assigned labels |
| New columns on `unified_visitors` | `gclid`, `fbclid`, `msclkid`, `ttclid`, `li_fat_id`, `click_id_consent_given` |
| New columns on `conversion_events` | `gclid`, `hashed_email`, `lead_quality`, `quality_value`, `upload_status` |
| New columns on `sites` | `hubspot_webhook_secret`, `hubspot_quality_property`, `hubspot_lead_webhook_enabled`, `google_ads_customer_id` |

### RLS convention
All new tables use: `site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid())`. Edge Function writes use `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS).

---

## Aggregate measurement & pixel readiness (added 2026-10-30)

Spec: `docs/superpowers/specs/2026-10-29-aggregate-measurement-and-pixel-readiness-design.md`.

- **Opt-in per site** (`sites.aggregate_measurement`, default false; Settings → GDPR → Configuration → Tracking mode). Counts page views,
  visits, daily visitors, sources/UTM and form/page-visit goals **without consent**.
- **Browser:** `src/lib/aggregate-beacon.js` — no storage, no IDs, no fingerprint signals; honours explicit refusal and
  GPC. Inlined by the install snippet when enabled; bundled in the WP plugin as `assets/cortiq-aggregate.js`.
  `spa-tracking.js` is unchanged and still waits for consent.
- **Server:** `aggregate-hit` Edge Function → daily-salted SHA-256 of salt|site|IP|UA → `ingest_aggregate_hit`.
  Bot defences: the RPC drops new direct visitors beyond 3 per page per 10 s and counts them in
  `aggregate_filtered_daily` (`20261107000001_aggregate_bursts_and_engagement.sql`).
- **Engagement (GA4 definitions):** the beacon sends `{kind:'engagement', ms}` (foreground time) at 10 s, on hide/pagehide
  and before SPA views. Engaged visit = ≥10 s, ≥2 page views or a conversion → `aggregate_sources_daily.engaged_visits`
  and `engagement_ms`. Rate = engaged/visits, per visitor = engaged/visitors, avg time = engagement_ms/visitors.
  Salts and `aggregate_visitors` are deleted when the UTC day ends (`aggregate_retention`, hourly cron).
- **Reads:** `get_aggregate_summary(site, from, to)` (RLS, SECURITY INVOKER). Overview shows it when enabled.
- **Pixel readiness:** `src/lib/pixelReadiness.ts` + `PixelReadinessCard` (Ads → Attribution, Conversion Goals).
  Effective conversions = aggregate (consent-free) conversions × banner acceptance; conversions counted from
  consented sessions are used as they are, never multiplied again. Thresholds ~30/~50 per 30 days are a rule of thumb.
- **Consent signals:** a Consent Mode *default* of denied = no choice yet (counted); an *update* to denied, banner or
  Cookiebot refusal, or GPC stops the beacon. Server-side, `_shared/aggregate.js` masks emails/IDs/tokens in paths
  (`:id`) and drops them from UTM and form goal values. Daily totals follow site retention (default 365 d) in
  `run_data_retention()`; `api_key_usage` IP/UA are cleared after 90 d.
- **Copy rule:** "designed to not require consent" — never "GDPR-compliant without consent" or "no banner needed".
  Legal review (jurist agent + DPA 1.4) before any public claim.

---

## Pinned installs with SRI (added 2026-11-11)

- Opt-in in the install snippet: loads `/v/<version>/cortiq.js` and `consent-banner.js` with `integrity` +
  `crossorigin="anonymous"`. `public/v/.htaccess` sends the CORS header the browser requires.
- `scripts/pin-tracker.mjs` (in `npm run build`) copies the files into `public/v/<version>/` the first time a
  version builds and writes `src/lib/sri-manifest.json`. Both are committed and never change afterwards.
  **Any change to `cortiq.js` or `consent-banner.js` needs a shared version bump**, or the build fails.
- A release that fixes a security issue in the tracker or banner: set `securityFix: true` on that version in the
  manifest. Sites whose last copied snippet was pinned to an older version (`sites.sri_pinned_version`) get a
  warning in the snippet setup.
- Every `public/v/` directory must stay on the server: deleting one blocks tracking on sites pinned to it.

---

## CSP on cortiq.se (added 2026-11-17)

- `public/.htaccess` and `public/api-docs/.htaccess` send an **enforced** Content-Security-Policy. `script-src` is `'self'` +
  build-time hashes of inline scripts (`scripts/csp-hashes.mjs`); never add `'unsafe-eval'`, `'strict-dynamic'` or a
  third-party script host without SRI. A new external `fetch` target needs a `connect-src` entry.
- Violations go to the `csp-report` Edge Function (report-uri + Reporting-Endpoints) → `csp_reports`, counted per day,
  service role only, 90 days. Check it after every deploy: `select * from csp_reports order by last_seen desc`.

---

## Cookieless session storage (added 2026-11-12)

Spec: `docs/superpowers/specs/2026-11-12-cookieless-session-stitching.md`.

- Cookieless mode (5.5.14+) keeps `cortiq_session_id` + `cortiq_session_expires` in sessionStorage **after analytics
  consent**, same keys as full mode, so a visit survives full page loads in the tab. Withdrawal removes both.
- Opt-out: `sessionStorage: false` / `data-session-storage="false"` (WP: "Memory only") keeps the id in memory; every
  full page load is then a new visit. Snippet-only; not stored server-side.
- Never cookies or localStorage in cookieless mode; click IDs stay marketing-gated (off in cookieless).
- Copy: "sessionStorage after consent" — never "nothing stored" for cookieless, never "no consent needed".
- Phase 2 (not built): daily-salted server hash, consent-only, after jurist review + DPA 1.6.

---

## Uptime monitoring (added 2026-11-17)

- `site-uptime` Edge Function, pg_cron every 5 min (`20261130000001_site_uptime.sql`): fetches each active site's
  home page (`_shared/uptime.ts`, UA `CortIQ-Uptime/1.0`, SSRF-guarded) → `record_uptime_check()`.
- Alerts in `uptime_alerts` after the same problem in two checks in a row: `down` (no answer, timeout, HTTP error —
  e.g. a host suspension) or `snippet_missing` (page loads but the snippet seen there before is gone; sites that
  load CortIQ from their own JS bundle never get it). Bot challenges, 401 and 429 are inconclusive and change nothing.
- Shown in Overview/Alerts (red, above pipeline alerts); emailed to the owner on open and recovery when
  `RESEND_API_KEY` (+ optional `ALERT_EMAIL_FROM`) is set — same secrets as pipeline-freshness.
- **Emails are OFF until Resend is set up** (as of 2026-11-17). Each run writes `alert_email_status.configured`; while
  false, the Alerts tab and every open alert show the setup steps (`EMAIL_SETUP_STEPS` in `_shared/uptime.ts`):
  1. Resend (the SentriSK account is fine): API key with Sending access, restricted to cortiq.se.
  2. Resend → Domains → add cortiq.se; add its DKIM/SPF/MX records at Loopia; wait for Verified.
  3. `supabase secrets set RESEND_API_KEY=re_… ALERT_EMAIL_FROM="CortIQ <alerts@cortiq.se>"` — picked up within 5 min.
  Free plan: 100 emails/day, shared with SentriSK.
- The 36 h pipeline-freshness rule stays for "site up, tracking broken". An hourly data-silence rule was backtested
  2026-11-17 and rejected: ~5 false alarms/month and still 16 h late on ekonom.biz.

---

## GTM container audit (added 2026-11-17)

Spec: `docs/superpowers/specs/2026-11-17-gtm-container-audit-design.md`.

- Public page `/gtm-audit/`: the visitor drops a GTM export (JSON, ≤5 MB) and `_shared/gtm-audit/audit.ts` runs **in the
  browser**. The file is never sent anywhere; `tests/foundation/gtm-audit-page.test.mjs` fails if the page UI calls
  `fetch`/`sendBeacon`.
- Engine: `parse` → `tagInfos` (vendor via the tracking-vendors registry, `gallery-map.ts`, template permissions,
  Custom HTML URLs; consent from triggers and consent settings) → 9 rules (`gtm.*`) + a migration class per tag.
  Evidence level is always "configuration" — never claim a tag fires.
- Engine v2 (2026-11-20, spec `2026-11-20-gtm-audit-destinations-dependencies-design.md`): `destinations.ts`
  (IDs per tag → `gtm.multiple_destinations`, "Sends to"), `dependencies.ts` (sequence/event/consent tool certain;
  global/cookie/regex possible → `gtm.dependencies`, "Relied on by", and a certain dependent turns `remove` into
  `review` except UA), `fragile.ts` (`gtm.fragile_dom`). Shared refs in `refs.ts` (variable chains ≤5 levels).
  User regexes from the file run only when short and simple; the rest count as `possible`.
- Destination IDs are shown in full on the page and in the local export, never in stats.
  **Deploy order:** redeploy `gtm-audit-stats` before the dist FTP, or v2 stats (new keys, `v: 2`) are rejected.
- Counters: `stats.ts` whitelist → `gtm-audit-stats` (public, rate-limited) → `gtm_audit_stats_daily` (service role only).
  New keys must go through `validateStats`; never add names, IDs, domains or URLs.
- Sample report: `node scripts/gtm-audit/sample-report.mjs` after any engine change (freshness test). The sample
  container is synthetic — never use a real customer's export in fixtures, samples or tests.
- New vendor in GTM: add it to `_shared/tracking-vendors.ts` (and `gallery-map.ts` for a gallery template).

---

## Jurisdiction rule engine (added 2026-11-20)

Spec: `docs/superpowers/specs/2026-11-18-jurisdiction-aware-measurement-design.md`. Plan: `docs/superpowers/plans/2026-11-20-jurisdiction-phase3-rule-engine.md`.

- **One engine:** `supabase/functions/_shared/jurisdiction/` (`decide()`), read by the Edge Functions through
  `_shared/jurisdiction-edge.ts` and by the dashboard through `src/lib/jurisdiction.ts`. Never a second copy.
- **Rules:** only `approved_internal` and above apply on customer sites; `draft`/`reviewed_agent` only on admin-flagged
  test sites (`jurisdiction_test_sites`). Without an approved rule the baseline applies: opt-in for every purpose.
  Approving a rule is its own reviewed commit with a jurist review; legal text in a rule is a hypothesis until then.
- **The server decides; in phase 3 the customer can only tighten** (`site_jurisdiction_tighten`: `opt_in` / `off`).
  Relaxing goes through `jurisdiction_exceptions` (max 12 months; no write path in phase 3). Decided 2026-11-20 for
  phase 4: the customer may relax any non-floor rule on its own documented assessment (spec, "Decisions 2026-11-20").
  Hard floors never relax: GPC stops sharing purposes, EU cross-site identifiers need opt-in.
- **The customer's own Off applies now** (decided 2026-11-20; GDPR art. 28(3)(a) instruction): a purpose set to `off`
  drops that purpose's data in every wired function whatever `JURISDICTION_ENFORCE` says (logged `enforced = true`).
  Unwired collectors are listed under "Not yet wired" in the runbook; the dashboard copy names only the wired paths.
  Off is read from the policy (not decide()'s reason) and fails closed if decide() throws. The policy is cached 60 s
  per isolate with a 1.5 s RPC timeout (failure = safe default, no Off); ledger, decide and log stay in the background.
- **Opt-in and market rules stay shadow:** every ingest function logs its decision to `jurisdiction_decisions_daily`
  (daily counts only, country from signed edge geo only, 400 days). `JURISDICTION_ENFORCE` (`all` or a comma list of
  function names) turns dropping on for them. store-consent always logs, never blocks, not even on Off. Flip only per
  `docs/runbooks/jurisdiction-enforcement.md`.
- **Server-side agent measurement** (server-hit) has purpose `agent_measurement` (was `security`; migration
  `20261208000001`) under rule `all.agent_measurement.server_log` (`allowed_unless_opt_out`, draft). It honours
  `Sec-GPC: 1` as an objection by automated means (art. 21(5)), an extra route next to the customer's own channel: the
  adapters (`cortiq-server.mjs`, Cloudflare Worker, PHP adapter, WP plugin 5.5.20+) do not send such a request at all.
  server-hit still discards a hit sent with `gpc: true` (own integrations); no field = no objection.
  Honeypot hits from UAs the registry does not classify are stored as a signal only (no IP, UA, geo or referrer).
- **Copy:** "CortIQ's technical defaults, not legal advice" (`DISCLAIMER`). Avoid implying that the defaults eliminate
  legal requirements, replace compliance obligations, or remove the need for consent mechanisms.
- Phase 6 slice: `coverage_by_country`, `consent_acceptance_by_country_lang` (banner sends `banner_lang` from 5.5.19),
  `aggregate_goal_countries_daily`, `assessPixelReadinessByCountry` (Consent → Impact).

---

## Measurement health & conversion alerts (added 2026-11-19)

Spec: `docs/superpowers/specs/2026-11-19-measurement-health-design.md`.

- `get_measurement_health(site)` (SECURITY INVOKER) → checks (uptime, pipelines, goals, goal health, consent rate,
  conversions) + a 7/28-day signal inventory. Sentences live in `_shared/measurement-health.ts`. The "Alerts" tab
  (value `alerts`) is labelled "Measurement health".
- Tracker version: `site-uptime` reads `/v/<x.y.z>/cortiq.js` or `cortiq*.js?ver=` from the home page into
  `site_uptime.snippet_version`; the UI compares it with `src/lib/sri-manifest.json`.
- `conversion_alerts`: `goal_silent`, `form_zero_completions`, `form_abandon_spike`, run hourly from `pipeline-freshness`
  via `check_conversion_alerts()`. Thresholds in SQL and `_shared/conversion-alerts.ts` (test keeps them equal).
- AI insights cite server facts as `{{mN}}` (`_shared/insight-facts.ts`); `validateInsight` rejects bare digits,
  one retry, then the insight is dropped (`agent_runs.data_snapshot.rejected`). Facts are in `data_snapshot.facts`.

---

## Self-reported attribution (added 2026-11-20)

Spec: `docs/superpowers/specs/2026-11-12-attribution-models-and-ai-influence.md` (layer 1.5 + jurist review 2026-11-20).
Plan: `docs/superpowers/plans/2026-11-20-attribution-layer-1-5.md`.

- "How did you hear about us?" → `conversion_reported_channel` (one row per conversion, `ON DELETE CASCADE` from
  `conversion_events`), a fixed category list (`_shared/reported-channel.ts`, SQL `is_reported_channel`; no custom
  labels). Unmapped answers = `other`. RLS on with **no policy** and no grants to anon/authenticated: written only by
  SECURITY DEFINER functions (`record_conversion_event`, `attach_reported_channel`, `apply_reported_channel_hubspot`),
  read only by `get_reported_channel` (SECURITY DEFINER, explicit owner check).
  Migration `20261210000001_reported_channel.sql`. Full mode only (cookieless records no conversions).
- **Two paths, one gate** (`reported_channel_consent_ok`: latest consent row, policy version = `sites.reported_channel_policy_version`):
  HubSpot property (`hubspot-lead-webhook`, marketing consent, hashed-email match, unmatched dropped, never touches
  `upload_status`) and one select/radio form field (tracker 5.5.21+, analytics consent, mapped in the browser, only the
  category is sent; `track-event` hands the field config out, `record-conversion` stores it via `attach_reported_channel`). Raw values are never stored or logged.
- **Never leaves CortIQ and aggregate only:** not in Google Ads upload, GA4, AI insights, public API or MCP; the dashboard
  reads only `get_reported_channel` (counts 1–4 → "fewer than 5"). `tests/foundation/reported-channel-boundaries.test.mjs`
  enforces both. UI: `ReportedChannelCard` (Ads → Attribution), `ReportedChannelSettings` (Settings → Integrations).
- Texts: banner (13 languages), Privacy §5A, GDPR.md "Self-reported source", DPA 1.7. WP built-in banner texts and own CMPs
  do not name it — the settings card says so. Jurist-agent check of the banner texts before any customer turns it on.
- Copy: "self-reported source", "what buyers say", "answer rate", "recall, not fact". Never "true source/attribution",
  "dark funnel revealed", "AI assistants drove X", "anonymous", consent-free or compliance claims, or anything about one lead (full list in the spec).

---

## Deployment

```bash
npm run build                          # outputs to dist/
supabase functions deploy --all        # deploy edge functions
```

CI/CD is configured in `.github/workflows/` — see the workflow files for required secrets.

---

## Adding a new dashboard tab

1. Create `src/components/dashboard/tabs/MyTab.tsx` — accept `selectedSite` prop
2. Create `src/hooks/useMyFeature.ts` — fetch from Supabase, return typed data
3. Register the tab in `src/components/dashboard/DashboardTabs.tsx`
4. If it needs an Edge Function: add `supabase/functions/my-function/index.ts` and set `verify_jwt` in `config.toml`

---

## Language

- Code and comments: English
- UI copy: English (with some Swedish in older components — migrate to English on touch)
- This file: English

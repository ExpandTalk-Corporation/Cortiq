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
  ai-tracking-unified.js  # AI bot detection script
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
| Training Crawlers | GPTBot, ClaudeBot, BLEXBot | Infrastructure cost, no referral value |
| Agentic Browsers | ChatGPT Browser, Perplexity Comet, Claude Browser | Real user intent, track and convert |
| Citation Crawlers | PerplexityBot, Google-Extended, YouBot | AI search indexing, visibility signal |

Classification logic lives in `src/components/dashboard/BotTrafficClassification.tsx` (frontend) and `supabase/functions/ai-bot-tracker/` (ingest).

---

## Conversion & Attribution (added 2026-06-24)

Five features that make CortIQ the single source of truth for paid conversion measurement — motivated by the common GA4 + Google Ads + HubSpot attribution gap problem.

### 1. First-Party Click ID Capture
`public/spa-tracking.js` captures `gclid`, `fbclid`, `msclkid`, `ttclid`, `li_fat_id` from URL params. Only stored when `marketing` consent is given. Persisted in `sessionStorage` and passed to `visitor-identification` edge function, which writes to `unified_visitors`.

**GDPR gate:** `hasMarketingConsent()` in tracking script — no click IDs captured without explicit marketing consent. In `eu_strict` jurisdiction, skipped automatically.

### 2. Conversion Goal Health Monitor
`src/hooks/useConversionGoalHealth.ts` — flags misconfigured goals:
- `fires_too_often` — firing rate >30% of sessions (e.g. `user_engagement` wrongly set as a goal)
- `silent` — zero conversions in 7 days (broken tag)
- `duplicate_primary` — multiple Primary goals corrupting Smart Bidding signal

Shown inline in `ConversionGoalsConfig.tsx`. Each goal now has a Primary/Observation toggle.

### 3. Form Auto-Discovery with GUID Detection
`supabase/functions/form-detector/` extended to detect HubSpot form GUIDs (`hs_context` input parsing, `data-form-id` attributes) and Gravity Forms. Results written to `form_registry` table. `FormDiscoveryWidget.tsx` shows "X forms found, Y unidentified" in the Forms tab.

### 4. HubSpot Lead Quality Feedback Loop
Full pipeline: HubSpot CRM → CortIQ → Google Ads Enhanced Conversions.

- `supabase/functions/hubspot-lead-webhook/` — receives `contact.propertyChange` webhooks, validates HubSpot HMAC signature, SHA-256 hashes email immediately, updates `conversion_events` with `lead_quality` + `quality_value` (Priority=300, Qualified=100, Challenge=0)
- `supabase/functions/google-ads-quality-upload/` — daily batch upload to Google Ads Conversion Adjustments API. Only uploads leads where `click_id_consent_given = true`
- `HubSpotIntegrationWizard.tsx` — 5-step setup wizard in Settings → Integrations → HubSpot
- `src/hooks/useLeadQualityPipeline.ts` — pipeline status (pending / uploaded / skipped counts)

**GDPR:** `hashed_email` column stores SHA-256 only — raw email never touches CortIQ. Upload skipped if no marketing consent on original session.

Webhook endpoint: `https://[project].supabase.co/functions/v1/hubspot-lead-webhook?site_id=[uuid]`
Upload function: `google-ads-quality-upload` — requires `google_ads_customer_id` on the site row.

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

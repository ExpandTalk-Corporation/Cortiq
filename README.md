# CortIQ — AI Bot Intelligence & Cookie-Free Analytics

<div align="center">

[![React](https://img.shields.io/badge/React-18.3.1-61DAFB?logo=react&logoColor=white)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Backend-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)
[![Made in EU](https://img.shields.io/badge/Made%20in-EU%20%F0%9F%87%AA%F0%9F%87%BA-003399)](https://cortiq.se)
[![Deploy](https://img.shields.io/badge/Live-cortiq.se-blue?logo=vercel)](https://cortiq.se)

**Bot blockers tell you what to stop. CortIQ tells you what matters.**

[🌐 Live Demo](https://cortiq.se) · [🤖 AI Bot Analytics](https://cortiq.se/features/ai/) · [🔒 Security](./SECURITY.md)

</div>

---

![An analyst reviews web traffic dashboards in an office overlooking a city waterfront](src/assets/hero/hero-1280.jpg)

---

## Why CortIQ?

1 in 31 web visits is now an AI bot — up from 1 in 200 at the start of 2025. Every other platform treats that traffic as noise to filter, or a binary block/allow decision.

CortIQ is the **first open-source, EU-built analytics platform** that turns AI traffic into a signal instead of noise — with consent-gated visitor analytics, a cookieless mode (no cookies, no fingerprint, no persistent IDs) and an opt-in aggregate mode designed to not require consent.

It classifies every AI visit into three categories:

| Type | Examples | What it means for you |
|------|----------|-----------------------|
| 🔴 **Training Crawlers** | GPTBot, ClaudeBot, CCBot, Google-Extended | Pure infrastructure cost — no referral value |
| 🟢 **Agentic Fetches** | ChatGPT-User, Claude-User, Perplexity-User | Real users acting through an AI — track and convert them |
| 🔵 **Citation Crawlers** | PerplexityBot, OAI-SearchBot, Claude-SearchBot | AI search indexing — your visibility signal |

In-browser agents such as Perplexity Comet send a stock Chrome user agent, so they are detected by JavaScript signals only, never by UA.

On top of that: **full human analytics** (heatmaps, sessions, A/B testing, forms) and a **paid-conversion attribution loop** that closes the GA4 ↔ Google Ads ↔ CRM gap — all under one roof.

---

## Architecture at a glance

CortIQ is built as three clearly separated layers. This separation is deliberate: the **Data Layer** never depends on AI, and the **Agentic Layer** only ever reads through governed, tenant-scoped interfaces — it never writes raw analytics.

```
┌──────────────────────────────────────────────────────────────────────┐
│  🧠  AGENTIC / INTELLIGENCE LAYER                                       │
│      • AI Assistant (Claude) — grounded tool-use over YOUR data only   │
│      • MCP Server — 22 tools, API-key auth, so external agents can      │
│        query your analytics programmatically                           │
│      • Bot classification engine (training / agentic / citation)       │
│      • GEO audits + transparent AI insights (every claim shows source) │
│      reads ▼ (tenant-scoped, read-mostly, never bypasses ownership)    │
├──────────────────────────────────────────────────────────────────────┤
│  🗄️   DATA LAYER                                                        │
│      • Ingest: tracking script + Edge Functions (visitor-id, events,   │
│        consent, conversions, bot tracker) — service-role, validated    │
│      • Storage: PostgreSQL, Row-Level Security per tenant              │
│      • Unified visitor profiles, sessions, heatmaps, conversions       │
│      writes ▼                                                          │
├──────────────────────────────────────────────────────────────────────┤
│  🔒  PRIVACY / COMPLIANCE LAYER  (cross-cutting, EU-first)             │
│      • Cookieless mode · consent gating · IP anonymisation             │
│      • Server-side consent ledger · retention cron · DSAR path         │
│      • Data residency in the EU · email hashing before any ad upload   │
└──────────────────────────────────────────────────────────────────────┘
```

**Why the split matters for you:** you can self-host the Data + Privacy layers with zero AI dependency (no Anthropic key, no external calls), and switch the Agentic Layer on only when you want it. AI never sees another tenant's data, and every AI-driven insight is traceable back to the exact tables and rows it read.

- **Data Layer** — `supabase/functions/` (ingest), `supabase/migrations/` (schema + RLS), `src/hooks/` (typed reads).
- **Agentic Layer** — `supabase/functions/ai-assistant`, `supabase/functions/mcp-server`, `BotTrafficClassification.tsx`, `public/llms.txt`, `SKILL.md`.
- **Privacy Layer** — `supabase/functions/_shared/jurisdiction.ts`, `store-consent`, consent gating in `public/spa-tracking.js`, retention migrations.

---

## Quick start

```bash
git clone https://github.com/ExpandTalk-Corporation/Cortiq.git
cd cortiq
cp .env.example .env        # add your Supabase keys
npm install && npm run dev  # → http://localhost:8080
```

> Full self-hosting guide (Supabase setup, edge functions, deployment) → [below](#self-hosting)

---

## Features

### 🤖 AI Bot Intelligence — the differentiator
- Classify every AI visit: **training crawler**, **agentic browser**, or **citation crawler** — a single canonical registry drives both ingest and dashboard
- Track agentic journeys page-by-page (ChatGPT-User, Claude-User, Perplexity-User; in-browser agents via JS signals)
- Citation-request detection — know when LLMs index and cite your content
- Browser-type breakdown: Visual / Headless / Text-based
- Server-log + edge ingest so even non-JS training crawlers are counted

### 🎯 Conversion & Attribution *(closes the GA4 ↔ Google Ads ↔ CRM gap)*
- First-party click-ID capture (gclid, fbclid, msclkid, ttclid, li_fat_id) — consent-gated
- Conversion-goal **health monitor** (flags goals that fire too often, went silent, or split Smart Bidding signal)
- Form auto-discovery with HubSpot / Gravity Forms GUID detection
- HubSpot lead-quality → **Google Ads Enhanced Conversions** feedback loop (email is SHA-256 hashed in the browser — raw PII never touches CortIQ)
- Attribution-gap dashboard: CortIQ conversions vs CRM-qualified leads vs upload status
- **AI influence** — AI assistant fetches and referral visits per day, and conversions on pages AI assistants read in the 14 days before (a correlation, never credited), plus Search Console brand vs non-brand clicks
- **Pixel readiness** — estimates whether Meta/Google pixels get enough conversions to optimise (aggregate conversions × banner acceptance)
- Google Ads connected via OAuth; pick the "Import from clicks" conversion action in Settings

### 📊 Human Visitor Analytics
- Page views, sessions, bounce rate, traffic sources
- Click heatmaps by device + scroll-depth funnels (25/50/75/100%)
- Form analytics — field-level completion and drop-off
- Navigation flow analysis
- **Filters and segments** on every main tab (URL-shareable), built-in segments and saved presets
- **Custom dimensions** with report RPCs, GA4-style engagement metrics (engaged visits, engagement time)

### 🧪 Optimisation
- A/B testing with statistical significance · conversion funnels
- KPI dashboards — build your own or pick from a catalog
- Segments and behavioral alerts
- **Pipeline freshness alerts** — warns when a data source (tracker, consent, server-side ingest) goes silent

### 🧠 AI & Agent-Ready
- **AI Assistant** — ask questions in natural language; answers are grounded in your real data via tool-use, never hallucinated
- **MCP Server** — external AI agents can query your analytics with a site-scoped API key (22 read-only tools, rate-limited)
- `llms.txt` published so AI systems can understand the product
- **Transparent insights** — every AI recommendation shows tables queried, row counts, model, tokens, and duration

### 🔍 Tracking Check — free public tool
[cortiq.se/tracking-check](https://cortiq.se/tracking-check/) loads a site in an EU-hosted browser and reports what fires before and after consent: cookies, storage, third-party requests, Consent Mode signals (gcs/gcd), emails in URLs, HubSpot iframe forms (with a paste-ready GTM listener), CSP and script-integrity findings. Results export to Excel; scheduled re-runs available.

### 🔒 Privacy & GDPR — built in, not bolted on
CortIQ is built by an EU company for EU-grade compliance:
- **Aggregate measurement (opt-in per site)** — counts page views, visits, daily visitors, sources/UTM and goals without storage, IDs or fingerprint signals; visitors are a daily-salted server hash, deleted when the UTC day ends. Honours refusal and GPC. Designed to not require consent; the site operator makes the final legal assessment
- **Server-side agent measurement** — AI crawlers and agents measured on your own server or edge (Next.js, Netlify, Cloudflare, Node, WordPress or any server via HTTP API). Only bot-like requests are sent, with the IP truncated on your server. No access to the visitor's device, so in our assessment no consent banner is needed for it; it is still personal data under GDPR (typically legitimate interest). The site operator makes the final legal assessment
- **In-browser bot checks after consent** — bot probe, honeypot and canary in the tracking script read device properties, so they start only after analytics consent
- **Consent-gated visitor analytics** — page views, sessions, AI referrals, clicks, scroll, heatmaps, forms, e-commerce, conversions and A/B tests start only after analytics consent (GDPR Art. 6.1.a / ePrivacy Art. 5.3), verified **server-side**. Consent is valid 12 months, then re-asked
- **Cookieless or Full mode** — Cookieless: no cookies, no fingerprint, no cross-visit profile, no persistent IDs (still needs consent); a session ID is kept in sessionStorage after consent so a visit survives page loads (opt out with `data-session-storage="false"`). Full: persistent visitor ID and returning-visitor analysis after consent. Marketing click IDs only with marketing consent
- **Pinned installs with SRI** — optional snippet that loads a fixed tracker version with `integrity` hashes; security fixes are flagged for sites on older pins ([details](https://cortiq.se/security/sri/))
- **Demonstrable consent** — the consent banner writes an authoritative server-side ledger (timestamp, version, GPC signal) for Art. 7(1) proof
- **Data minimisation** — IP addresses anonymised at ingest; emails SHA-256 hashed before any third-party upload
- **Retention & erasure** — automated retention cron across all sensitive tables + a data-subject-request path
- **EU data residency** — Supabase, AWS `eu-north-1`; US transfers (AI/ads) are optional, consent-gated and disclosed
- **Transparent transfers** — Google, HubSpot and Anthropic are named as recipients/processors in the privacy policy with SCC coverage

### 🔎 Search engine data
- **Google Search Console** — connect with your Google account (read-only, `webmasters.readonly`) and pick a property. Queries, pages, clicks, impressions, CTR and position sync daily per calendar month, with 16 months of history on the first sync
- Search Console data feeds the **Zero-Click Risk Index** (AI crawler visits per page set against CTR) and the brand vs non-brand split in **AI influence** (brand terms set per site)
- **Bing Webmaster Tools** — import of search performance, indexing and crawl data is in development, not yet ready to recommend

### ⚙️ Integrations & Advanced
GA4 (server-side) · Tag Manager · Data Warehouse connectors (BigQuery, Snowflake, Redshift, PostgreSQL) · Geolocation maps · User LTV & cohorts · Web Vitals (LCP, INP, CLS) · White-label · WordPress plugin · REST + MCP API.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| Charts | Recharts, Leaflet.js |
| Session replay | rrweb 2.0 |
| Backend | Supabase (PostgreSQL + Deno Edge Functions) |
| Auth | Supabase Auth with Row-Level Security |
| AI | Claude (Anthropic) — assistant, GEO audits; BYOK supported |
| Tracking script | Vanilla JS, ~18 kB gzipped |

**Scale:** 81 Edge Functions · 204 migrations · 154 dashboard components · 29 dashboard tabs · 75 data hooks

---

## Self-hosting

### Prerequisites
- Node.js 18+, npm
- [Supabase CLI](https://supabase.com/docs/guides/cli) — `npm install -g supabase`
- A Supabase project (EU region recommended)
- *(Optional)* An Anthropic API key — only if you enable the Agentic Layer

### 1. Clone and configure

```bash
git clone https://github.com/ExpandTalk-Corporation/Cortiq.git
cd cortiq
cp .env.example .env
```

Edit `.env`:
```
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
VITE_SUPABASE_PROJECT_ID=your-project-id
```

### 2. Point the project at your own Supabase

The tracking scripts and config reference a default Supabase project ref and `cortiq.se` host. Set `VITE_*` in `.env`, and update the `apiUrl` / script host in `public/spa-tracking.js` and the onboarding snippet to your own domain.

### 3. Push the database schema

```bash
supabase link --project-ref YOUR_PROJECT_ID
supabase db push --include-all
```

Creates all tables, indexes, RLS policies and database functions.

### 4. Set edge function secrets

In [Supabase Dashboard](https://supabase.com/dashboard) → Edge Functions → Manage secrets:

| Secret | Required | Description |
|--------|----------|-------------|
| `SUPABASE_URL` | ✅ | `https://YOUR_PROJECT_ID.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Your service role key |
| `ANTHROPIC_API_KEY` | Agentic Layer | AI assistant + GEO audits (BYOK is also supported per-tenant) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Optional | Google Search Console |
| `GA4_SERVICE_ACCOUNT_KEY` | Optional | GA4 server-side import |

### 5. Deploy edge functions

```bash
supabase functions deploy --all
```

### 6. Build and deploy

```bash
npm run build
# Upload dist/ to your web host — configure the server to serve index.html for all routes
# Or: npx vercel --prod
```

### WordPress / any site

Copy the snippet from the dashboard (Install tracking). It loads the tracker only after analytics consent, so no request reaches cortiq.se before the visitor has chosen. See [INTEGRATION-GUIDE.md](./INTEGRATION-GUIDE.md) for the snippet and for CMP / GTM setups.

For WordPress, download the plugin zip from the dashboard (Settings → Setup); it serves the tracker from your own site. The plugin shares its version with the tracking script (`window.CortIQ.version`).

---

## Project structure

```
cortiq/
├── src/
│   ├── components/dashboard/   # 154 dashboard components (tabs/ = one per tab)
│   ├── hooks/                  # 75 typed data-fetching hooks  ← Data Layer reads
│   ├── pages/                  # Public pages + Dashboard
│   └── integrations/supabase/  # Client & generated TypeScript types
├── supabase/
│   ├── functions/              # 81 Edge Functions (Deno)
│   │   ├── ai-assistant/       #   ← Agentic Layer
│   │   ├── mcp-server/         #   ← Agentic Layer (external agent API)
│   │   ├── visitor-identification/, track-event/, record-conversion/  # ← Data Layer ingest
│   │   ├── store-consent/      #   ← Privacy Layer
│   │   └── _shared/jurisdiction.ts  # ← Privacy Layer (IP anonymisation, jurisdiction)
│   └── migrations/             # Schema + RLS policies
├── public/
│   ├── spa-tracking.js         # Embeddable tracking script (consent-gated)
│   ├── consent-banner.js       # Drop-in CMP → server-side consent ledger
│   ├── v/<version>/            # Pinned, immutable tracker builds for SRI installs
│   └── llms.txt                # AI-discoverability manifest
└── SKILL.md                    # Agent skill definition
```

---

## Contributing

Contributions welcome. Open an issue first to discuss substantial changes, then:

1. Fork · 2. `git checkout -b feature/your-feature` · 3. Commit · 4. Open a PR

---

## Security & Privacy

- No secrets in the repository; `.env` is gitignored (only the publishable anon key ships to the browser, by design)
- Row-Level Security on every table; company/tenant isolation enforced at the database layer
- Public ingest endpoints validate the site and are rate-limited; service-role writes bypass RLS only from Edge Functions
- Input sanitisation + SSRF guards on server-side fetches
- Full details: [SECURITY.md](./SECURITY.md) · privacy policy: [cortiq.se/privacy](https://cortiq.se/privacy/)

---

## About

Built by **Expandtalk Corporation AB** · Göteborg, Sweden 🇪🇺

- **Founder:** [Daniel Larsson](https://www.linkedin.com/in/larssondaniel)
- **Website:** [cortiq.se](https://cortiq.se) · **AI bot analytics:** [How CortIQ classifies AI traffic](https://cortiq.se/features/ai/)

---

## License

CortIQ is licensed under AGPL-3.0 ([LICENSE](./LICENSE)), with an embedding exception ([LICENSE-EXCEPTION.md](./LICENSE-EXCEPTION.md)).

- **Self-hosting:** you may run CortIQ, unmodified or modified, for any purpose. If you modify it and let others use it over a network, including your own staff, section 13 of the AGPL requires you to offer them the source code of your modified version.
- **Code you embed:** the tracking scripts, the consent banner, the server-side adapters and the agent SDKs are also licensed under MIT. Embedding them in your site, server or agent does not put your own code under the AGPL.
- **WordPress plugin:** GPL-2.0-or-later.

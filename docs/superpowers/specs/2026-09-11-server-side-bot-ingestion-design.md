# Design: Server-side bot ingestion — activate and converge onto the canonical AI-bot taxonomy

**Date:** 2026-09-11
**Branch:** `feat/server-bot-ingestion-convergence` (based on `main`)
**Status:** Draft design, pending spec review
**Origin:** Office-hours discussion of "should CortIQ add Cloudflare/Vercel server-log ingestion" (the Ahrefs Logpush / Worker / Vercel Drain pattern).

## Problem

The core CortIQ pitch is AI-bot intelligence classified three ways — Training Crawlers,
Agentic Browsers, Citation Crawlers. But the primary data source is a **JavaScript tag**
(`public/ai-tracking-unified.js` → `ai-bot-tracker`). Training crawlers (GPTBot,
ClaudeBot, Google-Extended) and citation crawlers (PerplexityBot, YouBot) **do not
execute JavaScript**. They fetch HTML and leave. So the tag is structurally blind to two
of the three categories the product is built to sell. Server-side capture is the only way
to see them.

The twist found while scoping this: **server-side capture already exists, and it was built
twice, and neither version reaches the AI Bot Classification dashboard.**

1. **Push path (Cloudflare Worker) — fully built, dormant.** `public/cloudflare-worker.js`
   (fire-and-forget, asset-skipping, IP-anonymising) → `cloudflare-ingest` edge function
   (fail-closed on `CLOUDFLARE_INGEST_SECRET`) → `cloudflare_traffic` table →
   `CloudflareTrafficWidget.tsx`. Complete, with in-UI setup instructions. Dormant only
   because the shared secret is unset.
2. **Upload path (log file) — built.** `server-log-import` parses Apache/Nginx/JSON/CSV
   logs → `increment_server_log_analytics` → `useServerLogAnalytics.tsx`.
3. **Pull path — present.** `cloudflare-analytics` (owner-triggered, `CLOUDFLARE_API_TOKEN`).

The real defect is not "missing feature." It is **three ingestion paths with three
different bot classifiers, none wired to the canonical taxonomy:**

- `cloudflare-ingest` classifies UA into `visitor_type` = human/search_crawler/ai_bot/
  scraper/monitoring/unknown with its own `AI_BOTS` name list ("GPTBot (OpenAI)",
  "Perplexity Comet"). It has **no** training/agentic/citation category.
- `ai-bot-tracker` classifies with `AI_BOT_REGISTRY` and the 3-way `category` that
  `BotTrafficClassification.tsx` and the dashboard KPIs (`request_type = 'training'`)
  actually consume, written to `ai_bot_traffic`.

Result: a GPTBot hit captured server-side lands in `cloudflare_traffic` as
`bot_name = 'GPTBot (OpenAI)'` and is **absent** from the AI Bot Classification view. The
server path sees exactly the crawlers the tag cannot — and then drops them in a side
table. That is the whole miss.

## Decision

**Do not build a new ingestion path. Activate the Worker path and converge it onto the
canonical AI-bot taxonomy**, so server-side training/citation crawler hits appear in the
AI Bot Classification dashboard with the correct 3-way category, deduped against the JS
tag and tagged by source.

Concretely:

1. Extract the canonical classifier into `_shared/ai-bot-registry.ts` (one source of
   truth for all ingestion paths).
2. Make `cloudflare-ingest` additionally classify with it and dual-write **registry-hit**
   AI-bot traffic into `ai_bot_traffic` with `source = 'server_log'`.
3. Add a `source` column to `ai_bot_traffic` (dedup of the small, bounded agentic overlap
   deferred to phase 2, to measure first).
4. Set `CLOUDFLARE_INGEST_SECRET` to switch the path on. The dashboard picks up server rows
   automatically — `get_ai_bot_tracking` is source-agnostic.

Keep `cloudflare_traffic` as the full-traffic (human-vs-bot, all requests) cookieless
view — it is a legitimate second surface. This spec only forks the **AI-bot subset** into
the canonical store.

**Explicitly deferred** (see Out of scope): Vercel Log Drain adapter, full
`cloudflare_traffic`/`ai_bot_traffic` table consolidation, and the GSC AI-attribution loop
(the "crawl → citation → traffic" idea) — that one depends on this spec landing first.

## Current state (verified against code)

- **Worker:** `public/cloudflare-worker.js` — passes through to origin, `ctx.waitUntil`
  fire-and-forget POST to `env.CORTIQ_INGEST_URL` with `x-ingest-key`, skips `/cdn-cgi/`
  and static assets, anonymises IP to `/24` before sending (lines 17-85).
- **Ingest endpoint:** `supabase/functions/cloudflare-ingest/index.ts` — fail-closed:
  503 if `CLOUDFLARE_INGEST_SECRET` unset, 401 on `x-ingest-key` mismatch (lines 177-190).
  Resolves domain → `site_id` via `resolve_site_by_domain` RPC (IDN/www-safe, lines
  154-164). Own classifier `classifyUA` → `visitor_type` + `bot_name` (lines 92-117).
  Writes `cloudflare_traffic` (lines 240-254). `verify_jwt = false` in `config.toml:59`.
- **Canonical classifier:** `supabase/functions/ai-bot-tracker/index.ts` — `AI_BOT_REGISTRY`
  most-specific-first, 3-way `category` = training/agentic/citation (lines 21-59); generic
  crawler → citation fallback (lines 192-196); prefers the real `user-agent` header over
  the forgeable body value (lines 184-187); writes `ai_bot_traffic.request_type` (lines
  235-249). Deliberately does **not** UA-detect in-browser agentic browsers — they send
  stock Chrome UA; only the `-User` agent-fetch tokens and signal-based
  (`jsExecuted && isVisual`) classify agentic (lines 61-68, 209-213).
- **Table:** `cloudflare_traffic` (migration `20260527000001_cloudflare_traffic.sql`) —
  RLS `site_id IN (SELECT id FROM sites WHERE user_id = auth.uid())`, service-role writes,
  `get_cloudflare_traffic_summary` RPC. Header comment already states its purpose: "Captures
  ALL requests including bots that never execute JavaScript."
- **Dashboard:** `src/components/dashboard/CloudflareTrafficWidget.tsx` — reads the summary
  RPC, shows human/bot donut + `visitor_type` breakdown + top bots, and the Worker setup
  steps (`CORTIQ_INGEST_URL`, `CORTIQ_INGEST_KEY`, route `domain/*`).
- **Gap confirmed:** grep of `ai_bot*` migrations for `source` / cloudflare linkage →
  no matches. `ai_bot_traffic` has no `source` column and no server-log path today.

- **Dashboard read path (verified):** `useAIBotTracking.tsx` calls the RPC
  `get_ai_bot_tracking` (migration `20260706160000_dashboard_aggregation_rpcs.sql:64`).
  That RPC aggregates `ai_bot_traffic` filtered on `site_id` + a time window on
  **`detected_at`** only — it does **not** filter on `js_executed` or any source column,
  and it counts `request_type = 'training'`, groups `botBreakdown` by
  `coalesce(bot_name, bot_type)`, and takes the category from the most recent row's
  `request_type`. **Consequence:** server-log rows written into `ai_bot_traffic` with the
  correct `request_type` appear in the AI Bot Classification dashboard with **no RPC
  change**, and merge cleanly with JS-tag rows for the same bot precisely because both
  paths now use the shared registry (same `bot_name`). This is why the shared classifier
  is the load-bearing step.

**Still to confirm against the live schema** (the `ai_bot_traffic` CREATE TABLE is not in
the local migrations — known remote/local drift on this project): that the columns the
dual-write sets (`bot_type`, `bot_name`, `user_agent`, `url`, `referrer`, `request_type`,
`js_executed`, `probe_triggered`, `ip_address`) exist as named. They are exactly the set
`ai-bot-tracker` already inserts, so this is a low-risk check, not a redesign.

## Approach

### 1. Extract the canonical classifier — `_shared/ai-bot-registry.ts`
Move `AI_BOT_REGISTRY`, `GENERIC_BOT_PATTERN`, `BotCategory`, and a pure
`classifyBot(ua): { botType, botName, botCategory, registryMatch }` out of
`ai-bot-tracker/index.ts` into `supabase/functions/_shared/ai-bot-registry.ts`. Re-import
in `ai-bot-tracker` with **zero behavior change** (its inline registry + classification
block are replaced by the identical shared logic). `registryMatch` is the new bit: it
distinguishes a specific AI-vendor hit from the generic-crawler fallback, which the
server-log path uses to stay clean (step 2). This is the one step that stops the divergence
from deepening — every path classifies from the same list.

### 2. Dual-write AI-bot hits in `cloudflare-ingest`
Keep the existing `cloudflare_traffic` insert unchanged. After it, run the shared
`classifyBot` on the same UA. Insert into `ai_bot_traffic` **only on a registry hit**
(`registryMatch === true` — a specific AI-vendor signature):

- `site_id` (already resolved), `bot_type`, `bot_name` (canonical token), `user_agent`,
  `url` = `urlPath`, `referrer`, `request_type = category`,
  `js_executed = false`, `probe_triggered = false`,
  `ip_address` = the already-anonymised `ipSubnet`, `source = 'server_log'`.
  `detected_at` fills from its column default.

**Registry hits only, deliberately.** The generic-crawler fallback (`GENERIC_BOT_PATTERN`
→ citation) is *not* dual-written: from raw server logs it would pull SemrushBot, AhrefsBot,
curl, python-requests, monitoring, etc. into the AI-bot dashboard as fake "citation" bots.
Those stay in `cloudflare_traffic` (which has its own scraper/monitoring buckets). Only real
AI-vendor bots (GPTBot, ClaudeBot, PerplexityBot, ...) enter `ai_bot_traffic`. The insert is
best-effort: a failure is logged, never thrown, so it cannot break the primary
`cloudflare_traffic` write. The Worker payload needs no change.

### 3. Migration — `source` on `ai_bot_traffic` (built)
`supabase/migrations/20260911000000_ai_bot_traffic_source.sql`:
- `ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'js_tag'` — backfill is automatic
  via the default; all history becomes `js_tag`.
- CHECK `source IN ('js_tag','server_log')`, added via an idempotent `pg_constraint` guard.
- Index `(site_id, source, detected_at DESC)` for per-source slicing.
- Idempotent throughout (`IF NOT EXISTS`) to survive the known remote/local migration drift.
- RLS unchanged (same convention already on the table).

### 4. Dedup — deferred to phase 2, measure first
The overlap surface is narrow: only the `-User` agent-fetch tokens (ChatGPT-User,
Claude-User, Perplexity-User) can be seen by **both** paths. Training/citation crawlers are
server-only (no JS); stock-Chrome agentic is tag-only. So at activation the worst case is a
small, bounded double-count of agentic `-User` hits, and only for sites running both the tag
and the Worker.

A dedup key (`site_id | bot_name | url_path | time-bucket`) with `ON CONFLICT DO NOTHING`
across both paths is the fix, but it touches the working JS-tag insert path (which uses
`.insert().select().single()` and would need its conflict semantics reworked) and is not
worth that risk before we have real overlap data. **Ship the `source` tag now, watch the
`source='server_log'` vs `js_tag` counts for the agentic `-User` bots after activation, and
add dedup only if the double-count is material.** Tracked in Out of scope.

### 5. Activate — set the shared secret, fix the stale comment
- Set project secret `CLOUDFLARE_INGEST_SECRET` (Supabase dashboard). That single switch
  moves `cloudflare-ingest` from 503-dormant to live.
- `config.toml:56-58` comment claims the endpoint "stays JWT-gated (dormant)" but the file
  has `verify_jwt = false`. The real gate is the secret, not JWT. Correct the comment so it
  stops contradicting the config.

### 6. Surface the source in the dashboard (optional polish — no wiring needed)
`ai_bot_traffic` server rows flow into the AI Bot Classification view **automatically**:
`get_ai_bot_tracking` is source-agnostic (verified above), so no RPC and no hook change is
required for server-captured training/citation crawlers to appear. Optional polish, not a
blocker:
- A `source` filter/badge (JS tag vs Server log) in `BotTrafficClassification.tsx` so a
  training/citation surge after activation is attributable and not mistaken for a bug.
- One line of copy distinguishing `CloudflareTrafficWidget` ("full server traffic, human
  vs bot") from the classification view ("AI bots, all sources").

## Edge cases
- **Agentic under-count server-side (by design)** — in-browser agentic browsers send stock
  Chrome UA; the canonical registry refuses UA-based agentic detection, so they are *not*
  dual-written as agentic. The JS tag owns that category. Document it; do not "fix" it with
  a UA regex (that false-positives on real Chrome users — see `ai-bot-tracker` lines 61-68).
- **Two surfaces, two totals (by design)** — `ai_bot_traffic` gets only registry AI-vendor
  bots from the server path; `cloudflare_traffic` keeps its own 6-way `visitor_type`
  (human/search_crawler/ai_bot/scraper/monitoring/unknown) over all traffic. So the two
  tables legitimately report different "bot" numbers. Dashboard copy must name which surface
  is which, or the numbers will look wrong to their own author.
- **Double-count until dedup (bounded)** — an agentic `-User` hit seen by both the tag and
  the Worker produces two `ai_bot_traffic` rows until phase-2 dedup lands. Bounded to the
  three `-User` tokens; measure after activation (see Approach step 4).
- **IP** — Worker sends `/24` (`ipSubnet`); the dual-write stores that in `ip_address`. No
  raw IP ever reaches the DB on this path. Consistent with `anonymizeIP` on the tag path.
- **Quota** — Worker free tier is 100k req/day; asset-skipping already trims it. The extra
  Supabase write fires only on an AI-bot match, so added write volume is small.
- **Privacy (pre-existing, flagged not fixed)** — `cloudflare-ingest` stores full UA
  (truncated 500) and does not call `sanitizeForMode`/`getPipelineMode`. Fine for bots
  (not PII); arguable over-collection for the `human` rows it also writes under `eu_strict`.
  Separate privacy-cleanup task, out of scope here.
- **Config drift** — deployed `cloudflare-ingest` may lag the repo. Redeploy on activation.

## Testing
No local Supabase emulator (per CLAUDE.md). Verify against the cloud project + the
Expandtalk site:
1. Set `CLOUDFLARE_INGEST_SECRET`; deploy the Worker on `expandtalk.se/*`.
2. `curl` the ingest endpoint with `x-ingest-key` and `userAgent: "GPTBot/1.0"` → assert a
   row in **both** `cloudflare_traffic` (visitor_type ai_bot) and `ai_bot_traffic`
   (`source='server_log'`, `request_type='training'`).
3. Confirm the AI Bot Classification dashboard (via `get_ai_bot_tracking`) now shows the
   server-captured training/citation crawlers — no RPC or hook change.
4. Send a non-AI bot (`SemrushBot`, `curl/8.0`) → assert it lands in `cloudflare_traffic`
   but **not** in `ai_bot_traffic` (registry-only guard holds).
5. Behavior-preservation: `ai-bot-tracker` classifies a representative UA set identically
   to before the extraction (registry hit; generic → citation; no-match → Unknown Bot).
6. `tsc --noEmit` clean; `npm run build` succeeds.

## Out of scope
- **Vercel Log Drain adapter** — a second, small ingest path (NDJSON log drain → the same
  `_shared` classifier → `ai_bot_traffic`). Fast follow, named not built.
- **Table consolidation** — merging `cloudflare_traffic` and `ai_bot_traffic` behind one
  source-tagged store and a unified read model. The "ideal architecture" endpoint; deferred
  to keep this change small on a ~1-user project.
- **GSC AI-attribution loop** — correlating server-side crawl activity with AI-influenced
  search clicks/impressions (the second office-hours idea). Depends on this spec landing;
  separate design.
- **`server-log-import` convergence** — the upload path also uses its own classifier; align
  it to `_shared` later, same pattern.
- **Phase-2 dedup** — collapse the bounded agentic `-User` double-count once activation shows
  it is material (see Approach step 4).

## Rollout
Migration: `supabase db push` (adds `source`; default backfills all history to `js_tag`).
Functions: `supabase functions deploy ai-bot-tracker cloudflare-ingest`. Set
`CLOUDFLARE_INGEST_SECRET`. Order is safe either way: with the secret unset the endpoint
stays 503-dormant exactly as today, so deploying the code before flipping the secret changes
nothing user-visible; and `ai-bot-tracker` is behavior-preserving. Optional: add the
dashboard source filter behind the existing widget.

## Relation to the two office-hours ideas
This is idea 1 ("server-side ingestion") — reframed from "build it" to "activate and
converge what's already built," because the Worker, endpoint, table, and widget already
exist. It is also the **prerequisite for idea 2**: only once trustworthy server-side crawl
data lives in the canonical taxonomy can CortIQ close the unique "crawl → citation →
traffic" loop against GSC. GSC as a generic SEO dashboard remains SentriSK's job and is not
in scope here.

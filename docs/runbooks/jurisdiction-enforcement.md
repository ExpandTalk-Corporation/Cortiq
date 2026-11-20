# Runbook: jurisdiction enforcement

Technical defaults, not legal advice. Every step that changes what is measured needs Daniel's go.

## Deploy order (any change to the engine or its tables)
1. `supabase db push --remote --yes` (migrations 20261207000001–5) before any function deploy.
2. `supabase functions deploy` for the changed functions (all ingest functions import `_shared/jurisdiction-edge.ts`).
3. `npm run build`; dist FTP when the dashboard changed. Revert `public/cortiq-wordpress-plugin.zip` unless the plugin changed.

### 2026-11-20 follow-up (customer Off applies now, server-log rule, Sec-GPC)
1. `supabase db push --remote --yes` for `20261208000001_jurisdiction_followups.sql` (purpose `security` →
   `agent_measurement`, CHECK constraints, grants). Deploy the functions right after: until then the old functions log
   purpose `security`, which the new CHECK refuses (the log fails and is only reported in the function log; no hit is lost).
2. `supabase functions deploy` for every function that imports the engine: server-hit, aggregate-hit, ai-bot-tracker,
   track-event, visitor-identification, record-conversion, google-ads-quality-upload, store-consent, geo-check.
   From this deploy, a customer `off` drops data without `JURISDICTION_ENFORCE`.
3. `npm run build` (shared version 5.5.20, pinned `public/v/5.5.20/`), dist FTP, then publish WP plugin 5.5.20 so
   WordPress sites stop sending requests that carry `Sec-GPC: 1`. Customers using `cortiq-server.mjs`, the Worker or
   the PHP adapter re-copy the file.

The ingest functions cache each site's policy for 60 s per isolate, so a new Off can take up to a minute to apply.
A policy load that fails or takes more than 1.5 s falls back to the safe default, which applies no Off for that request.

The server adapters (5.5.20+) do not send a request that carries `Sec-GPC: 1`, so server-hit's GPC skip count and its
`agent_measurement` decisions only see GPC from older adapters and own integrations. A near-zero count is expected.

### 2026-11-20 second follow-up (ten more collectors)
1. `supabase db push --remote --yes` for `20261208000002_jurisdiction_more_collectors.sql` (the decision log's `fn`
   CHECK accepts the ten names below). Deploy the functions after it: in the other order their decision logs fail the
   CHECK (reported in the function log only; the customer's Off still applies and no hit is lost).
2. `supabase functions deploy ai-search-tracker link-click-counter ecommerce-tracking canary-tracker track-web-vitals
   pixel-tracking content-tracking media-analytics cloudflare-ingest import-server-logs`.
3. `npm run build` and dist FTP for the dashboard copy in `RulesByMarketTab.tsx`. No tracker or plugin change.

Purposes: `statistics` for all of them except `canary-tracker` (`agent_measurement`: its hits are bot evidence) and
`cloudflare-ingest`, which decides per hit (`agent_measurement` for automated traffic, `statistics` for the anonymous
human count). `import-server-logs` is `statistics`: it skips bots and aggregates human page views only.
`cloudflare-ingest` drops a hit sent with `gpc: true` and `import-server-logs` skips JSON log lines with `gpc: true` or
`sec_gpc: "1"` (counted as `objected_lines`); both only log those decisions, as server-hit does. The current Worker never
sends such a hit.

Found while wiring (not fixed here):
- `ecommerce-tracking`: `spa-tracking.js` `trackEcommercePurchase` sends no `consentGranted`, so the function answers 400.
- `content-tracking`, `media-analytics`: no live caller (the dashboard calls relative `/api/...` URLs); the POST body's
  `site_id` is not validated against a key, and the GET endpoints return any site's data by `site_id` without auth.
  Recommend removing both functions or adding auth.
- `track-web-vitals`: no caller in this repo.

## Not yet wired
These collectors do not call the gate, so a customer Off does not reach them and the dashboard copy does not claim it
does. Wire each through `jurisdictionGate` (or `decideAndLog`) and add it to the copy in `RulesByMarketTab.tsx` when done.
- `agent-telemetry`: not wired on purpose. It stores company-scoped OpenTelemetry spans from the customer's own AI agents
  (no `site_id`, no visitor data), so no site purpose applies. Revisit if it ever records site visitors.
- Not assessed in the 2026-11-20 pass: `hubspot-lead-webhook` (updates lead quality on existing conversion rows).

## Before turning on enforcement for a function
1. Run in shadow for at least 14 days after deploy.
2. Check `select * from coverage_by_country('<site>', current_date - 14, current_date)` for each active site: the
   `missing` and `refused` columns are what enforcement would stop. Compare with the site's banner acceptance.
3. Check `jurisdiction_decisions_daily` for `rule_id = 'baseline'` on functions that should run on an approved rule.
   While no rule is approved, enforcement on aggregate-hit and server-hit stops all consent-free counting.
4. Get Daniel's go, then `supabase secrets set JURISDICTION_ENFORCE=<function>[,<function>]`. Picked up on the next cold start.

## Roll back
`supabase secrets set JURISDICTION_ENFORCE=` (empty = shadow everywhere). No data is lost: shadow logs continue.

## Approving a rule (phase 4 work, listed here so it is not skipped)
1. Jurist review of the rule's legal hypothesis, references and the `DISCLAIMER` copy (jurist agent first, then a
   human lawyer for any public claim; DPA update if the processing changes).
2. Separate commit that sets `status: 'approved_internal'`, `approval` and `reviewDue`; bump `PACK_VERSION`.
3. Deploy (order above). Watch `coverage_by_country` for a week.

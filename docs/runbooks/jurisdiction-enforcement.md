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

## Not yet wired
These collectors receive data for the same purposes but do not call the gate, so a customer Off does not reach them
yet and the dashboard copy does not claim it does. Wire each through `jurisdictionGate` (or `decideAndLog`) and add it
to the copy in `RulesByMarketTab.tsx` when it is done.
- statistics, called by `spa-tracking.js`: `ai-search-tracker`, `link-click-counter`, `ecommerce-tracking`, `canary-tracker`.
- statistics, other: `track-web-vitals`, `pixel-tracking`, `content-tracking`, `media-analytics`, `agent-telemetry`.
- agent_measurement (`ai_bot_traffic`): `cloudflare-ingest`, `import-server-logs`. Neither honours `Sec-GPC` either.

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

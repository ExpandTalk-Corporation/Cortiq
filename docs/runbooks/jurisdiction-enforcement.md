# Runbook: jurisdiction enforcement

Technical defaults, not legal advice. Every step that changes what is measured needs Daniel's go.

## Deploy order (any change to the engine or its tables)
1. `supabase db push --remote --yes` (migrations 20261207000001–5) before any function deploy.
2. `supabase functions deploy` for the changed functions (all ingest functions import `_shared/jurisdiction-edge.ts`).
3. `npm run build`; dist FTP when the dashboard changed. Revert `public/cortiq-wordpress-plugin.zip` unless the plugin changed.

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

-- supabase/migrations/20261208000002_jurisdiction_more_collectors.sql
-- The customer's own Off and the shadow decision log now cover ten more collectors (runbook
-- docs/runbooks/jurisdiction-enforcement.md). The decision log refuses an unknown fn, so the CHECK lists them.
-- Push this BEFORE deploying those functions, or their log rows are refused (non-fatal: the function only
-- logs the error, and the Off still applies).

ALTER TABLE public.jurisdiction_decisions_daily DROP CONSTRAINT IF EXISTS jurisdiction_decisions_daily_fn_check;
ALTER TABLE public.jurisdiction_decisions_daily ADD CONSTRAINT jurisdiction_decisions_daily_fn_check CHECK (fn IN (
  'aggregate-hit','server-hit','ai-bot-tracker','track-event','visitor-identification',
  'record-conversion','store-consent','google-ads-quality-upload',
  'ai-search-tracker','link-click-counter','ecommerce-tracking','canary-tracker','track-web-vitals',
  'pixel-tracking','content-tracking','media-analytics','cloudflare-ingest','import-server-logs'));

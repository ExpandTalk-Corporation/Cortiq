-- California follow-up (R1, jurist review 2026-11-21): google-ads-quality-upload and
-- hubspot-lead-webhook mark a conversion whose linked sessions ever sent Global Privacy Control
-- as 'skipped_gpc' (CPPA Regs §7025(c)(1) and (c)(5)). GPC itself is already recorded in
-- cookie_consents.gpc_signal (store-consent); no new column.
-- Additive: the CHECK keeps every earlier value and adds one. Two partial indexes serve the
-- consumer/browser lookups in _shared/gpc-stop.ts (same hashed email or gclid on one site).

ALTER TABLE public.conversion_events DROP CONSTRAINT IF EXISTS conversion_events_upload_status_check;
ALTER TABLE public.conversion_events ADD CONSTRAINT conversion_events_upload_status_check CHECK (upload_status IN (
  'not_applicable','pending','uploading','uploaded','skipped_no_consent','skipped_no_gclid','skipped_jurisdiction',
  'skipped_gpc','failed'));

CREATE INDEX IF NOT EXISTS idx_conversion_events_site_hashed_email
  ON public.conversion_events (site_id, hashed_email) WHERE hashed_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversion_events_site_gclid
  ON public.conversion_events (site_id, gclid) WHERE gclid IS NOT NULL;

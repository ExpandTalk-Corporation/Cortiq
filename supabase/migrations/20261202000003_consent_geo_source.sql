-- supabase/migrations/20261202000003_consent_geo_source.sql
-- Spec 2026-11-18 phase 1 AC5: every new consent row records where its country came from.
-- 'timezone' = browser time zone (phase 1), 'ip' = signed edge geo (phase 2), 'unknown' = neither.
-- geo_country existed since 20250724171956 and was never written. Old rows stay NULL.
ALTER TABLE public.cookie_consents ADD COLUMN IF NOT EXISTS geo_source text;
ALTER TABLE public.cookie_consents DROP CONSTRAINT IF EXISTS cookie_consents_geo_source_check;
ALTER TABLE public.cookie_consents ADD CONSTRAINT cookie_consents_geo_source_check
  CHECK (geo_source IS NULL OR geo_source IN ('ip', 'timezone', 'unknown'));
COMMENT ON COLUMN public.cookie_consents.geo_source IS 'ip | timezone | unknown — how geo_country was derived.';

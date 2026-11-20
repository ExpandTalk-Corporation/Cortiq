-- Spec 2026-11-18 phase 6 (thin slice): which banner language a visitor answered in, so acceptance
-- can be compared per country x language. NULL = an older banner or an unknown code.
ALTER TABLE public.cookie_consents ADD COLUMN IF NOT EXISTS banner_lang text;
ALTER TABLE public.cookie_consents DROP CONSTRAINT IF EXISTS cookie_consents_banner_lang_check;
ALTER TABLE public.cookie_consents ADD CONSTRAINT cookie_consents_banner_lang_check
  CHECK (banner_lang IS NULL OR banner_lang IN ('sv','en','de','fr','pt','nl','nb','da','fi','pl','it','es','is'));
COMMENT ON COLUMN public.cookie_consents.banner_lang IS 'Language the banner was shown in (5.5.19+). NULL for older banners.';

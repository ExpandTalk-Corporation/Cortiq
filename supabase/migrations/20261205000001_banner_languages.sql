-- Eight more CortIQ banner languages: Dutch, Norwegian (bokmål), Danish, Finnish, Polish, Italian,
-- Spanish and Icelandic. A fixed language makes the snippet load consent-banner.<lang>.js.
alter table public.sites drop constraint if exists sites_banner_language_check;
alter table public.sites add constraint sites_banner_language_check
  check (banner_language in ('auto', 'sv', 'en', 'de', 'fr', 'pt', 'nl', 'nb', 'da', 'fi', 'pl', 'it', 'es', 'is'));

comment on column public.sites.banner_language is 'CortIQ banner language: auto (from <html lang>, every language) or a fixed code from BANNER_LANGUAGES in src/lib/snippetTemplate.ts, rendered as data-lang and consent-banner.<lang>.js.';

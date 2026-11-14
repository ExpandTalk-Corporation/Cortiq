-- Consent & cookie banner settings per site (Settings → Consent & cookie banner).
-- Until now the banner choice was only logged in policy_confirmations, and the GDPR tab's
-- "Cookie banner type" was never saved. These columns are the single source; the Setup
-- snippet starts from them. NULL consent_setup = not chosen yet (Setup falls back to the
-- latest policy confirmation).
alter table public.sites
  add column if not exists consent_setup text
    check (consent_setup in ('own-cmp', 'cortiq-banner', 'none')),
  add column if not exists consent_cmp text
    check (consent_cmp in ('cookiebot', 'cookieyes', 'onetrust', 'google-consent-mode', 'other')),
  add column if not exists banner_language text not null default 'auto'
    check (banner_language in ('auto', 'sv', 'en', 'de', 'fr', 'pt'));

comment on column public.sites.consent_setup is 'How the site collects consent: own-cmp, cortiq-banner or none (aggregate only). NULL = not chosen.';
comment on column public.sites.consent_cmp is 'Which consent tool when consent_setup = own-cmp. Informational; the loader reads any CMP.';
comment on column public.sites.banner_language is 'CortIQ banner language: auto (from <html lang>) or a fixed sv/en/de/fr/pt, rendered as data-lang.';

-- Backfill from the latest policy confirmation so existing sites show what they installed.
update public.sites s
set consent_setup = pc.consent_setup
from (
  select distinct on (site_id) site_id, consent_setup
  from public.policy_confirmations
  order by site_id, confirmed_at desc
) pc
where pc.site_id = s.id
  and s.consent_setup is null
  and pc.consent_setup in ('own-cmp', 'cortiq-banner', 'none');

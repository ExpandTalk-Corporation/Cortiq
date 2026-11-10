-- supabase/migrations/20261117000004_google_ads_oauth.sql
-- Per-site Google Ads connection through OAuth (ported from SentriSK's Google Ads setup).
--
-- The developer token and OAuth client are app-level Edge Function secrets
-- (GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET). Each site stores:
--   * google_ads_connections - which account was picked, visible to the site owner (no secrets);
--   * google_ads_tokens      - the refresh token, AES-GCM sealed with GOOGLE_ADS_TOKEN_KEY.
--     Service role only: RLS on with no policies AND no table grants for anon/authenticated,
--     so the browser cannot read it even if a policy is added by mistake later.
-- All writes go through the google-ads-oauth Edge Function (service role).

CREATE TABLE IF NOT EXISTS public.google_ads_connections (
  site_id              uuid PRIMARY KEY REFERENCES public.sites(id) ON DELETE CASCADE,
  customer_id          text,
  login_customer_id    text,
  descriptive_name     text,
  currency_code        text,
  time_zone            text,
  -- [{id, name, currency, manager, login_customer_id}] discovered at connect time.
  accessible_customers jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- connected: token stored, account picked or not; error: last refresh/list failed.
  status               text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'error')),
  last_error           text,
  connected_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  connected_at         timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT google_ads_connections_customer_id_digits CHECK (customer_id IS NULL OR customer_id ~ '^[0-9]{10}$'),
  CONSTRAINT google_ads_connections_login_id_digits CHECK (login_customer_id IS NULL OR login_customer_id ~ '^[0-9]{10}$')
);

ALTER TABLE public.google_ads_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS google_ads_connections_owner_select ON public.google_ads_connections;
CREATE POLICY google_ads_connections_owner_select ON public.google_ads_connections
  FOR SELECT TO authenticated
  USING (site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid()));

REVOKE ALL ON public.google_ads_connections FROM anon, authenticated;
GRANT SELECT ON public.google_ads_connections TO authenticated;
GRANT ALL ON public.google_ads_connections TO service_role;

CREATE TABLE IF NOT EXISTS public.google_ads_tokens (
  site_id              uuid PRIMARY KEY REFERENCES public.sites(id) ON DELETE CASCADE,
  refresh_token_sealed text NOT NULL CHECK (refresh_token_sealed LIKE 'v1:%'),
  scope                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.google_ads_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.google_ads_tokens FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.google_ads_tokens TO service_role;

COMMENT ON TABLE public.google_ads_tokens IS
  'Google Ads OAuth refresh tokens, AES-GCM sealed with the GOOGLE_ADS_TOKEN_KEY secret. Service role only - never expose to the browser.';
COMMENT ON TABLE public.google_ads_connections IS
  'Per-site Google Ads account selection (no secrets). Written by the google-ads-oauth Edge Function.';

-- Legacy: sites.google_ads_access_token held a pasted access token, which expires after an hour
-- and was never refreshed. Nothing reads it any more; clear it and hide it from the browser.
UPDATE public.sites SET google_ads_access_token = NULL WHERE google_ads_access_token IS NOT NULL;
COMMENT ON COLUMN public.sites.google_ads_access_token IS 'Deprecated 2026-11-17 - replaced by google_ads_tokens (OAuth). Always NULL.';
COMMENT ON COLUMN public.sites.google_ads_customer_id IS
  'Google Ads customer id (10 digits). Mirrors google_ads_connections.customer_id; written by google-ads-oauth.';

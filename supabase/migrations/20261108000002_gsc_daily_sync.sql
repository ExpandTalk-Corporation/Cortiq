-- Daily Search Console sync.
--
-- pg_cron calls the gsc-sync Edge Function once a day. The function re-syncs the previous and
-- the current calendar month for every site with an active property (Google revises the last
-- few days, so the previous month is refreshed too until it settles).
--
-- Auth: the job sends a random secret in the x-cron-secret header. The secret lives only in
-- Supabase Vault (generated here, never in the repo); gsc-sync checks it through
-- gsc_cron_secret_matches(), which only service_role may call.

-- 1. The shared secret (created once; re-running the migration keeps the existing value).
DO $$
BEGIN
  -- Nested IFs: the vault reference must not be planned where Vault is absent.
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'supabase_vault') THEN
    IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'gsc_sync_cron_secret') THEN
      PERFORM vault.create_secret(
        encode(extensions.gen_random_bytes(32), 'hex'),
        'gsc_sync_cron_secret',
        'x-cron-secret for the gsc-daily-sync cron job → gsc-sync Edge Function'
      );
    END IF;
  END IF;
END $$;

-- 2. Secret check for the Edge Function. plpgsql so it can be created where Vault is absent
--    (the local test database); there it simply returns false.
CREATE OR REPLACE FUNCTION public.gsc_cron_secret_matches(p_secret text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_secret IS NULL OR length(p_secret) < 32 THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name = 'gsc_sync_cron_secret' AND decrypted_secret = p_secret
  );
EXCEPTION WHEN undefined_table OR invalid_schema_name THEN
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.gsc_cron_secret_matches(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gsc_cron_secret_matches(text) TO service_role;

-- 3. The job: 05:15 UTC daily. Needs pg_cron, pg_net and Vault (not in every environment).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'supabase_vault') THEN
    PERFORM cron.schedule(
      'gsc-daily-sync',
      '15 5 * * *',
      $job$
      SELECT net.http_post(
        url := 'https://cxmkdtgfocgbfizawlwa.supabase.co/functions/v1/gsc-sync',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'gsc_sync_cron_secret')
        ),
        body := '{"all": true}'::jsonb,
        timeout_milliseconds := 120000
      );
      $job$
    );
  END IF;
END $$;

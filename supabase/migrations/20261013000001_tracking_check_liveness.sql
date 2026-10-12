-- Tracking Check liveness: recover runs whose finalisation died mid-way.
-- A worker sets status = 'assessing' (and now assessing_at) before it builds the report. If that
-- invocation is killed, the run would stay 'assessing' forever. The hourly retention job puts
-- such runs back to 'running' so the next worker invocation finalises them again (saveResults
-- replaces any findings a crashed attempt already wrote).

ALTER TABLE public.tracking_check_runs ADD COLUMN assessing_at timestamptz;

CREATE OR REPLACE FUNCTION public.tracking_check_retention()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.tracking_check_observations WHERE created_at < now() - interval '90 days';
  UPDATE public.tracking_check_runs
     SET auth_ciphertext = NULL, auth_expires_at = NULL
   WHERE auth_ciphertext IS NOT NULL AND (status IN ('done', 'failed') OR auth_expires_at < now());
  -- Runs that entered 'assessing' before assessing_at existed fall back to created_at.
  UPDATE public.tracking_check_runs
     SET status = 'running', assessing_at = NULL
   WHERE status = 'assessing' AND coalesce(assessing_at, created_at) < now() - interval '10 minutes';
$$;

REVOKE ALL ON FUNCTION public.tracking_check_retention() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tracking_check_retention() TO service_role;

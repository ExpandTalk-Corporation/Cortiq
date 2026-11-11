-- Tracking Check: scheduled weekly/monthly reruns with a diff against the previous run.
--
-- A schedule belongs to a run "lineage": the owner picks Weekly or Monthly on a finished report and
-- the settings of that run (mode, URLs, policy, pages) are copied into tracking_check_schedules. The
-- source run and every run the schedule creates carry schedule_id, so the worker can compare a new
-- run with the previous finished run of the same schedule (summary.diff).
--
-- Scheduling:
--   - An hourly pg_cron job calls tracking_check_enqueue_due(), which creates a run plus its tasks for
--     every enabled schedule whose next_run_at has passed, then kicks tracking-check-worker over
--     pg_net with a random x-cron-secret that lives only in Vault (same pattern as gsc-daily-sync).
--     The same call also restarts the worker for manual runs whose worker chain died.
--   - Scheduled runs only re-run public pages: credentials (auth_ciphertext) expire after 2 hours and
--     are never copied. Runs that used credentials (requires_auth) cannot be scheduled.
--   - Scheduled runs are marked trigger = 'scheduled' and do not count against the manual 24 h quota.
--     They are bounded by the number of active schedules per user (enforced in tracking-check-start)
--     and by the frequency (at most one run per schedule per week).
--
-- Clients only read their own schedules; all writes go through tracking-check-start (service role).

-- ── Runs: lineage, trigger and whether the run needed credentials ─────────────
ALTER TABLE public.tracking_check_runs
  ADD COLUMN IF NOT EXISTS trigger text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS requires_auth boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tracking_check_runs_trigger_check') THEN
    ALTER TABLE public.tracking_check_runs
      ADD CONSTRAINT tracking_check_runs_trigger_check CHECK (trigger IN ('manual', 'scheduled'));
  END IF;
END $$;

-- Runs still holding credentials (unfinished runs from before this column) needed them.
UPDATE public.tracking_check_runs SET requires_auth = true WHERE auth_ciphertext IS NOT NULL AND NOT requires_auth;

-- ── Schedules ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tracking_check_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_run_id uuid REFERENCES public.tracking_check_runs(id) ON DELETE SET NULL,
  mode text NOT NULL CHECK (mode IN ('comparison', 'policy')),
  baseline_url text,
  target_url text NOT NULL,
  policy jsonb,
  pages jsonb NOT NULL DEFAULT '{"pages":[],"legacy":[]}'::jsonb,
  frequency text NOT NULL CHECK (frequency IN ('weekly', 'monthly')),
  enabled boolean NOT NULL DEFAULT true,
  next_run_at timestamptz NOT NULL,
  last_run_id uuid REFERENCES public.tracking_check_runs(id) ON DELETE SET NULL,
  last_run_at timestamptz,
  -- Latest scheduled run whose diff found new problems; cleared when the owner dismisses the notice.
  alert_run_id uuid REFERENCES public.tracking_check_runs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tracking_check_schedules_baseline CHECK ((mode = 'comparison') = (baseline_url IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS tracking_check_schedules_user_idx ON public.tracking_check_schedules (user_id);
CREATE INDEX IF NOT EXISTS tracking_check_schedules_due_idx ON public.tracking_check_schedules (next_run_at) WHERE enabled;

ALTER TABLE public.tracking_check_runs
  ADD COLUMN IF NOT EXISTS schedule_id uuid REFERENCES public.tracking_check_schedules(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS tracking_check_runs_schedule_idx ON public.tracking_check_runs (schedule_id, created_at DESC) WHERE schedule_id IS NOT NULL;

-- ── Privileges and RLS ─────────────────────────────────────────────────────────
ALTER TABLE public.tracking_check_schedules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tracking_check_schedules FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.tracking_check_schedules TO service_role;
GRANT SELECT ON public.tracking_check_schedules TO authenticated;

DROP POLICY IF EXISTS tracking_check_schedules_select_own ON public.tracking_check_schedules;
CREATE POLICY tracking_check_schedules_select_own ON public.tracking_check_schedules
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- tracking_check_runs grants SELECT per column (auth_ciphertext stays hidden): add the new ones.
GRANT SELECT (schedule_id, trigger, requires_auth) ON public.tracking_check_runs TO authenticated;

-- ── Enqueue due schedules (service role / pg_cron only) ─────────────────────────
CREATE OR REPLACE FUNCTION public.tracking_check_advance(p_from timestamptz, p_frequency text)
RETURNS timestamptz LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT p_from + CASE p_frequency WHEN 'weekly' THEN interval '7 days' ELSE interval '1 month' END;
$$;

-- Creates one run (with its tasks, as tracking-check-start does) per due schedule and moves
-- next_run_at forward. A schedule whose previous run is still in progress is skipped and retried
-- on the next tick. Returns the ids of the new runs.
CREATE OR REPLACE FUNCTION public.tracking_check_enqueue_due(p_limit integer DEFAULT 20)
RETURNS SETOF uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.tracking_check_schedules%ROWTYPE;
  v_run uuid;
  v_roles text[];
  v_next timestamptz;
  v_at timestamptz;
  v_count integer;
BEGIN
  FOR s IN
    SELECT * FROM public.tracking_check_schedules
     WHERE enabled AND next_run_at <= now()
     ORDER BY next_run_at
     LIMIT p_limit
     FOR UPDATE SKIP LOCKED
  LOOP
    IF EXISTS (SELECT 1 FROM public.tracking_check_runs WHERE schedule_id = s.id AND status IN ('running', 'assessing')) THEN
      CONTINUE;
    END IF;

    -- Nothing to check: switch the schedule off instead of creating runs that never finish.
    IF jsonb_typeof(s.pages -> 'pages') IS DISTINCT FROM 'array' OR jsonb_array_length(s.pages -> 'pages') = 0 THEN
      UPDATE public.tracking_check_schedules SET enabled = false, updated_at = now() WHERE id = s.id;
      CONTINUE;
    END IF;

    INSERT INTO public.tracking_check_runs (user_id, mode, baseline_url, target_url, policy, pages, schedule_id, trigger)
    VALUES (s.user_id, s.mode, s.baseline_url, s.target_url, s.policy, s.pages, s.id, 'scheduled')
    RETURNING id INTO v_run;

    -- Same task layout as tracking-check-start: per page, per site role, fetch then browser, then
    -- legacy URLs. Tasks are claimed by created_at; one microsecond apart keeps that order exact.
    v_roles := CASE WHEN s.mode = 'comparison' THEN ARRAY['baseline', 'target'] ELSE ARRAY['target'] END;
    v_at := clock_timestamp();
    INSERT INTO public.tracking_check_tasks (run_id, site_role, path, kind, legacy, created_at)
    SELECT v_run, r.role, p.path, k.kind, false,
           v_at + (row_number() OVER (ORDER BY p.ord, r.rord, k.kord)) * interval '1 microsecond'
      FROM jsonb_array_elements_text(s.pages -> 'pages') WITH ORDINALITY AS p(path, ord)
     CROSS JOIN unnest(v_roles) WITH ORDINALITY AS r(role, rord)
     CROSS JOIN unnest(ARRAY['fetch', 'browser']) WITH ORDINALITY AS k(kind, kord);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF s.mode = 'comparison' AND jsonb_typeof(s.pages -> 'legacy') = 'array' THEN
      INSERT INTO public.tracking_check_tasks (run_id, site_role, path, kind, legacy, created_at)
      SELECT v_run, 'target', l.path, 'fetch', true, v_at + (v_count + l.ord) * interval '1 microsecond'
        FROM jsonb_array_elements_text(s.pages -> 'legacy') WITH ORDINALITY AS l(path, ord);
    END IF;

    -- Keep the cadence anchored to the schedule; after a long outage, start again from now.
    v_next := public.tracking_check_advance(s.next_run_at, s.frequency);
    IF v_next <= now() THEN v_next := public.tracking_check_advance(now(), s.frequency); END IF;
    UPDATE public.tracking_check_schedules
       SET last_run_id = v_run, last_run_at = now(), next_run_at = v_next, updated_at = now()
     WHERE id = s.id;

    RETURN NEXT v_run;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.tracking_check_advance(timestamptz, text), public.tracking_check_enqueue_due(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tracking_check_advance(timestamptz, text), public.tracking_check_enqueue_due(integer) TO service_role;

-- ── Cron → worker secret ───────────────────────────────────────────────────────
-- Created once in Vault (re-running keeps the value). Nested IFs: vault must not be planned where absent.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'supabase_vault') THEN
    IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'tracking_check_cron_secret') THEN
      PERFORM vault.create_secret(
        encode(extensions.gen_random_bytes(32), 'hex'),
        'tracking_check_cron_secret',
        'x-cron-secret for the tracking-check-schedules cron job → tracking-check-worker Edge Function'
      );
    END IF;
  END IF;
END $$;

-- plpgsql so it can be created where Vault is absent (the test database); there it returns false.
CREATE OR REPLACE FUNCTION public.tracking_check_cron_secret_matches(p_secret text)
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
    WHERE name = 'tracking_check_cron_secret' AND decrypted_secret = p_secret
  );
EXCEPTION WHEN undefined_table OR invalid_schema_name THEN
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.tracking_check_cron_secret_matches(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tracking_check_cron_secret_matches(text) TO service_role;

-- ── Hourly job at :11 ──────────────────────────────────────────────────────────
-- Enqueues due schedules, then kicks the worker when any run is unfinished. Needs pg_cron, pg_net and
-- Vault (not in every environment). cron.schedule with an existing job name replaces that job.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'supabase_vault') THEN
    PERFORM cron.schedule(
      'tracking-check-schedules',
      '11 * * * *',
      $job$
      SELECT public.tracking_check_enqueue_due(20);
      SELECT net.http_post(
        url := 'https://cxmkdtgfocgbfizawlwa.supabase.co/functions/v1/tracking-check-worker',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'tracking_check_cron_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 10000
      )
      WHERE EXISTS (SELECT 1 FROM public.tracking_check_runs WHERE status = 'running');
      $job$
    );
  END IF;
END $$;

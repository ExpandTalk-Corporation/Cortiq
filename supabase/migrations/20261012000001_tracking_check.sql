-- Tracking Check (docs/superpowers/specs/2026-10-12-tracking-check-design.md).
-- Runs belong to the user who created them and are not tied to sites: the checked site
-- does not need CortIQ installed. Edge functions write with the service role. Clients only
-- read their own rows, delete their runs and mark manual findings as verified.

CREATE TABLE public.tracking_check_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  mode text NOT NULL CHECK (mode IN ('comparison', 'policy')),
  baseline_url text,
  target_url text NOT NULL,
  policy jsonb,
  pages jsonb NOT NULL DEFAULT '{"pages":[],"legacy":[]}'::jsonb,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'assessing', 'done', 'failed')),
  error text,
  summary jsonb,
  auth_ciphertext text,
  auth_expires_at timestamptz,
  share_token text UNIQUE,
  share_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CONSTRAINT tracking_check_runs_baseline CHECK ((mode = 'comparison') = (baseline_url IS NOT NULL))
);
CREATE INDEX tracking_check_runs_user_idx ON public.tracking_check_runs (user_id, created_at DESC);

CREATE TABLE public.tracking_check_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.tracking_check_runs(id) ON DELETE CASCADE,
  site_role text NOT NULL CHECK (site_role IN ('baseline', 'target')),
  path text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('fetch', 'browser')),
  legacy boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  error text,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX tracking_check_tasks_pending_idx ON public.tracking_check_tasks (kind, created_at) WHERE status = 'pending';
CREATE INDEX tracking_check_tasks_run_idx ON public.tracking_check_tasks (run_id);

CREATE TABLE public.tracking_check_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.tracking_check_runs(id) ON DELETE CASCADE,
  task_id uuid NOT NULL UNIQUE REFERENCES public.tracking_check_tasks(id) ON DELETE CASCADE,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tracking_check_observations_run_idx ON public.tracking_check_observations (run_id);

CREATE TABLE public.tracking_check_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.tracking_check_runs(id) ON DELETE CASCADE,
  sort_order integer NOT NULL,
  scope text NOT NULL,
  check_key text NOT NULL,
  title text NOT NULL,
  status text NOT NULL CHECK (status IN ('pass', 'fail', 'warning', 'manual', 'untestable')),
  priority text CHECK (priority IN ('high', 'medium', 'low')),
  explanation text NOT NULL DEFAULT '',
  fix text NOT NULL DEFAULT '',
  typical_owner text,
  evidence jsonb NOT NULL DEFAULT '{"pages":[],"details":[]}'::jsonb,
  verified_by text,
  verified_at timestamptz
);
CREATE INDEX tracking_check_findings_run_idx ON public.tracking_check_findings (run_id, sort_order);

-- ── Privileges and RLS ─────────────────────────────────────────────────────────
ALTER TABLE public.tracking_check_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_check_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_check_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_check_findings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.tracking_check_runs, public.tracking_check_tasks, public.tracking_check_observations, public.tracking_check_findings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.tracking_check_runs, public.tracking_check_tasks, public.tracking_check_observations, public.tracking_check_findings TO service_role;

-- auth_ciphertext and auth_expires_at are deliberately not granted.
GRANT SELECT (id, user_id, mode, baseline_url, target_url, policy, pages, status, error, summary, share_token, share_expires_at, created_at, finished_at)
  ON public.tracking_check_runs TO authenticated;
GRANT DELETE ON public.tracking_check_runs TO authenticated;
GRANT SELECT ON public.tracking_check_tasks, public.tracking_check_observations, public.tracking_check_findings TO authenticated;
GRANT UPDATE (verified_by, verified_at) ON public.tracking_check_findings TO authenticated;

CREATE POLICY tracking_check_runs_select_own ON public.tracking_check_runs
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY tracking_check_runs_delete_own ON public.tracking_check_runs
  FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY tracking_check_tasks_select_own ON public.tracking_check_tasks
  FOR SELECT TO authenticated USING (run_id IN (SELECT id FROM public.tracking_check_runs WHERE user_id = auth.uid()));
CREATE POLICY tracking_check_observations_select_own ON public.tracking_check_observations
  FOR SELECT TO authenticated USING (run_id IN (SELECT id FROM public.tracking_check_runs WHERE user_id = auth.uid()));
CREATE POLICY tracking_check_findings_select_own ON public.tracking_check_findings
  FOR SELECT TO authenticated USING (run_id IN (SELECT id FROM public.tracking_check_runs WHERE user_id = auth.uid()));
CREATE POLICY tracking_check_findings_verify_own ON public.tracking_check_findings
  FOR UPDATE TO authenticated
  USING (run_id IN (SELECT id FROM public.tracking_check_runs WHERE user_id = auth.uid()))
  WITH CHECK (run_id IN (SELECT id FROM public.tracking_check_runs WHERE user_id = auth.uid()));

-- ── Queue functions (service role only) ────────────────────────────────────────
CREATE FUNCTION public.tracking_check_claim_tasks(p_kind text, p_limit integer)
RETURNS SETOF public.tracking_check_tasks LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  -- UPDATE ... RETURNING does not preserve the subquery's ORDER BY (it can plan as a
  -- HashAggregate semi-join), so the outer SELECT re-sorts the claimed rows explicitly.
  WITH claimed AS (
    UPDATE public.tracking_check_tasks t
       SET status = 'running', attempts = t.attempts + 1, claimed_at = now()
     WHERE t.id IN (
       SELECT id FROM public.tracking_check_tasks
        WHERE status = 'pending' AND kind = p_kind
        ORDER BY created_at
        LIMIT p_limit
        FOR UPDATE SKIP LOCKED)
    RETURNING t.*
  )
  SELECT * FROM claimed ORDER BY created_at;
$$;

CREATE FUNCTION public.tracking_check_recover_stale(p_seconds integer)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.tracking_check_tasks
     SET status = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'pending' END,
         error = coalesce(error, 'Worker timed out')
   WHERE status = 'running' AND claimed_at < now() - make_interval(secs => p_seconds);
$$;

CREATE FUNCTION public.tracking_check_runs_to_finalize()
RETURNS SETOF uuid LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id FROM public.tracking_check_runs r
   WHERE r.status = 'running'
     AND NOT EXISTS (SELECT 1 FROM public.tracking_check_tasks t WHERE t.run_id = r.id AND t.status IN ('pending', 'running'));
$$;

CREATE FUNCTION public.tracking_check_retention()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.tracking_check_observations WHERE created_at < now() - interval '90 days';
  UPDATE public.tracking_check_runs
     SET auth_ciphertext = NULL, auth_expires_at = NULL
   WHERE auth_ciphertext IS NOT NULL AND (status IN ('done', 'failed') OR auth_expires_at < now());
$$;

REVOKE ALL ON FUNCTION public.tracking_check_claim_tasks(text, integer), public.tracking_check_recover_stale(integer),
  public.tracking_check_runs_to_finalize(), public.tracking_check_retention() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tracking_check_claim_tasks(text, integer), public.tracking_check_recover_stale(integer),
  public.tracking_check_runs_to_finalize(), public.tracking_check_retention() TO service_role;

-- Hourly retention (credentials expire after 2 hours). pg_cron is not available in every environment.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('tracking-check-retention', '17 * * * *', 'select public.tracking_check_retention()');
  END IF;
END $$;

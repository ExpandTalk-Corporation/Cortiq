-- Tracking Check runs are deleted with the account that created them. user_id had no foreign key,
-- so closing an account (deleting the auth user) left its runs, observations and reports behind.
-- Tasks, observations and findings already cascade from tracking_check_runs.

-- Runs whose user no longer exists are exactly what the constraint would have removed.
DELETE FROM public.tracking_check_runs r
 WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = r.user_id);

ALTER TABLE public.tracking_check_runs
  ADD CONSTRAINT tracking_check_runs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

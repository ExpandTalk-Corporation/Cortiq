-- Supabase grants ALL on new public tables to anon/authenticated by default. RLS already has no
-- UPDATE/DELETE policy; revoke the privileges too, so the log is append-only at both levels.
REVOKE UPDATE, DELETE, TRUNCATE ON public.policy_confirmations FROM authenticated, anon;
REVOKE ALL ON public.policy_confirmations FROM anon;

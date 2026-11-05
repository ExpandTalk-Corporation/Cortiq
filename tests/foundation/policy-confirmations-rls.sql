-- tests/foundation/policy-confirmations-rls.sql
BEGIN;
CREATE ROLE anon; CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE TABLE public.sites (id uuid PRIMARY KEY, user_id uuid NOT NULL);
GRANT SELECT ON public.sites TO authenticated;
GRANT USAGE ON SCHEMA auth TO authenticated;
\ir ../../supabase/migrations/20261105000001_policy_confirmations.sql
INSERT INTO auth.users VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO sites VALUES ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
                         ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO policy_confirmations (site_id, user_id, consent_setup, tracking_mode, checklist_version, checklist)
VALUES ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'own-cmp', 'full', 'v', '[]');

SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  INSERT INTO public.policy_confirmations (site_id, consent_setup, tracking_mode, marketing, checklist_version, checklist)
  VALUES ('11111111-1111-4111-8111-111111111111', 'cortiq-banner', 'full', true, 'v', '["item"]');
  ASSERT (SELECT count(*) FROM public.policy_confirmations) = 1, 'sees only own';
  ASSERT (SELECT user_id FROM public.policy_confirmations) = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'user_id defaults to caller';
  BEGIN
    INSERT INTO public.policy_confirmations (site_id, consent_setup, tracking_mode, checklist_version, checklist)
    VALUES ('22222222-2222-4222-8222-222222222222', 'own-cmp', 'full', 'v', '[]');
    RAISE EXCEPTION 'expected RLS denial for another owner''s site';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.policy_confirmations (site_id, user_id, consent_setup, tracking_mode, checklist_version, checklist)
    VALUES ('11111111-1111-4111-8111-111111111111', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'own-cmp', 'full', 'v', '[]');
    RAISE EXCEPTION 'expected RLS denial when logging as someone else';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.policy_confirmations (site_id, consent_setup, tracking_mode, marketing, checklist_version, checklist)
    VALUES ('11111111-1111-4111-8111-111111111111', 'cortiq-banner', 'cookieless', true, 'v', '[]');
    RAISE EXCEPTION 'expected marketing-without-full rejection';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.policy_confirmations SET marketing = false;
    RAISE EXCEPTION 'expected no update privilege';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.policy_confirmations;
    RAISE EXCEPTION 'expected no delete privilege';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
ROLLBACK;

-- tests/foundation/saved-filters-rls.sql
BEGIN;
CREATE ROLE anon; CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE TABLE public.sites (id uuid PRIMARY KEY, user_id uuid NOT NULL);
GRANT SELECT ON public.sites TO authenticated;
\ir ../../supabase/migrations/20261015000002_dashboard_saved_filters.sql
INSERT INTO sites VALUES ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
                         ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO dashboard_saved_filters (site_id, name, filters)
VALUES ('22222222-2222-4222-8222-222222222222', 'Other user', '{}');

SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  INSERT INTO public.dashboard_saved_filters (site_id, name, filters)
  VALUES ('11111111-1111-4111-8111-111111111111', 'Pricing', '{"path":"/pricing","segmentId":null,"rangeDays":30}');
  ASSERT (SELECT count(*) FROM public.dashboard_saved_filters) = 1, 'sees only own';
  BEGIN
    INSERT INTO public.dashboard_saved_filters (site_id, name, filters)
    VALUES ('22222222-2222-4222-8222-222222222222', 'Hijack', '{}');
    RAISE EXCEPTION 'expected RLS denial';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.dashboard_saved_filters (site_id, name, filters)
    VALUES ('11111111-1111-4111-8111-111111111111', '', '{}');
    RAISE EXCEPTION 'expected empty-name rejection';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
ROLLBACK;

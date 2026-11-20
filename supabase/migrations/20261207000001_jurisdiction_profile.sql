-- supabase/migrations/20261207000001_jurisdiction_profile.sql
-- Spec 2026-11-18 phase 3: per-site legal profile, tighten-only settings, approved exceptions, admin test sites.
-- The engine reads all of it through get_site_jurisdiction (service role). Technical defaults, not legal advice.

CREATE TABLE public.site_legal_profiles (
  site_id uuid PRIMARY KEY REFERENCES public.sites(id) ON DELETE CASCADE,
  establishment_country text CHECK (establishment_country IS NULL OR establishment_country ~ '^[A-Z]{2}$'),
  markets text[] NOT NULL DEFAULT '{}'
    CHECK (markets <@ ARRAY['eu','uk','ch','us_ca','us_other','ca_qc','ca_other','br','other']::text[]),
  answers jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(answers) = 'object'),
  answered_by uuid,
  answered_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.site_legal_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY site_legal_profiles_owner_select ON public.site_legal_profiles FOR SELECT TO authenticated
  USING (site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid()));

CREATE TABLE public.site_legal_profile_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  establishment_country text, markets text[], answers jsonb,
  legacy_jurisdiction text,          -- companies.jurisdiction at migration time (Task 8); never read by the engine
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.site_legal_profile_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY site_legal_profile_log_owner_select ON public.site_legal_profile_log FOR SELECT TO authenticated
  USING (site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.save_site_legal_profile(p_site_id uuid, p_establishment text, p_markets text[], p_answers jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_est text := upper(nullif(trim(coalesce(p_establishment, '')), ''));
  v_markets text[] := coalesce(p_markets, '{}');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sites WHERE id = p_site_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not_owner' USING ERRCODE = '42501';
  END IF;
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' OR EXISTS (
    SELECT 1 FROM jsonb_each(p_answers) e WHERE e.value NOT IN ('"yes"'::jsonb, '"no"'::jsonb, '"dont_know"'::jsonb)) THEN
    RAISE EXCEPTION 'invalid_answers' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.site_legal_profiles (site_id, establishment_country, markets, answers, answered_by, answered_at)
  VALUES (p_site_id, v_est, v_markets, p_answers, auth.uid(), now())
  ON CONFLICT (site_id) DO UPDATE SET establishment_country = EXCLUDED.establishment_country, markets = EXCLUDED.markets,
    answers = EXCLUDED.answers, answered_by = EXCLUDED.answered_by, answered_at = EXCLUDED.answered_at;
  INSERT INTO public.site_legal_profile_log (site_id, establishment_country, markets, answers, changed_by)
  VALUES (p_site_id, v_est, v_markets, p_answers, auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.save_site_legal_profile(uuid, text, text[], jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_site_legal_profile(uuid, text, text[], jsonb) TO authenticated;

-- Tighten only: no row = rule default. There is no value that relaxes.
CREATE TABLE public.site_jurisdiction_tighten (
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('statistics','conversion','attribution','ad_platform_sharing','security')),
  setting text NOT NULL CHECK (setting IN ('opt_in','off')),
  set_by uuid DEFAULT auth.uid(),
  set_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, purpose)
);
ALTER TABLE public.site_jurisdiction_tighten ENABLE ROW LEVEL SECURITY;
CREATE POLICY site_jurisdiction_tighten_owner ON public.site_jurisdiction_tighten FOR ALL TO authenticated
  USING (site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid()))
  WITH CHECK (site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid()));

-- Approved exceptions. Phase 3 has no write path (no policy for writes); phase 4 adds the approval screen.
CREATE TABLE public.jurisdiction_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  rule_id text NOT NULL CHECK (rule_id ~ '^[a-z0-9_.]+@[0-9]+$' AND length(rule_id) <= 200),
  jurisdiction text NOT NULL CHECK (jurisdiction IN ('eu','uk','ch','us_ca','us_other','ca_qc','ca_other','br','other')),
  purpose text NOT NULL CHECK (purpose IN ('statistics','conversion','attribution','ad_platform_sharing','security')),
  legal_basis text NOT NULL CHECK (length(legal_basis) BETWEEN 1 AND 100),
  assessment_ref text NOT NULL CHECK (length(assessment_ref) BETWEEN 1 AND 200),
  approved_by uuid NOT NULL,
  approved_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  CHECK (expires_at > approved_at AND expires_at <= approved_at + interval '12 months')
);
ALTER TABLE public.jurisdiction_exceptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY jurisdiction_exceptions_owner_select ON public.jurisdiction_exceptions FOR SELECT TO authenticated
  USING (site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid()));

-- Sites where draft and reviewed_agent rules run (spec: draft = unit tests and admin-flagged test sites).
CREATE TABLE public.jurisdiction_test_sites (
  site_id uuid PRIMARY KEY REFERENCES public.sites(id) ON DELETE CASCADE,
  flagged_by uuid DEFAULT auth.uid(),
  flagged_at timestamptz NOT NULL DEFAULT now(),
  note text CHECK (note IS NULL OR length(note) <= 200)
);
ALTER TABLE public.jurisdiction_test_sites ENABLE ROW LEVEL SECURITY;
CREATE POLICY jurisdiction_test_sites_admin ON public.jurisdiction_test_sites FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.get_site_jurisdiction(p_site_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'profile', (SELECT jsonb_build_object('establishment_country', p.establishment_country, 'markets', to_jsonb(p.markets), 'answers', p.answers)
                FROM public.site_legal_profiles p WHERE p.site_id = p_site_id),
    'tighten', coalesce((SELECT jsonb_object_agg(t.purpose, t.setting) FROM public.site_jurisdiction_tighten t WHERE t.site_id = p_site_id), '{}'::jsonb),
    'exceptions', coalesce((SELECT jsonb_agg(jsonb_build_object('ruleId', e.rule_id, 'jurisdiction', e.jurisdiction, 'purpose', e.purpose,
                   'legalBasis', e.legal_basis, 'assessmentRef', e.assessment_ref, 'approvedBy', e.approved_by::text,
                   'approvedAt', e.approved_at, 'expiresAt', e.expires_at) ORDER BY e.approved_at)
                FROM public.jurisdiction_exceptions e WHERE e.site_id = p_site_id AND e.expires_at > now()), '[]'::jsonb),
    'testSite', EXISTS (SELECT 1 FROM public.jurisdiction_test_sites s WHERE s.site_id = p_site_id));
$$;
REVOKE ALL ON FUNCTION public.get_site_jurisdiction(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_site_jurisdiction(uuid) TO service_role;

-- supabase/migrations/20261207000006_jurisdiction_hardening.sql
-- Spec 2026-11-18 phase 3, final review: explicit table grants that match the RLS policies in
-- 20261207000001/2/4 (Supabase's default privileges otherwise give anon and authenticated ALL),
-- set_by on tighten rows always comes from the session, and the decision log refuses negative counts.

-- Owner may read and change their own tighten rows (policy site_jurisdiction_tighten_owner, FOR ALL).
REVOKE ALL ON TABLE public.site_jurisdiction_tighten FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.site_jurisdiction_tighten TO authenticated;

-- Read-only for owners (SELECT policies only); writes go through SECURITY DEFINER functions.
REVOKE ALL ON TABLE public.site_legal_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.site_legal_profiles TO authenticated;
REVOKE ALL ON TABLE public.site_legal_profile_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.site_legal_profile_log TO authenticated;
REVOKE ALL ON TABLE public.jurisdiction_decisions_daily FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.jurisdiction_decisions_daily TO authenticated;
REVOKE ALL ON TABLE public.aggregate_goal_countries_daily FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.aggregate_goal_countries_daily TO authenticated;

-- The column default auth.uid() can be overridden by the client; this cannot.
CREATE OR REPLACE FUNCTION public.site_jurisdiction_tighten_set_by()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.set_by := auth.uid();
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.site_jurisdiction_tighten_set_by() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS site_jurisdiction_tighten_set_by ON public.site_jurisdiction_tighten;
CREATE TRIGGER site_jurisdiction_tighten_set_by
  BEFORE INSERT OR UPDATE ON public.site_jurisdiction_tighten
  FOR EACH ROW EXECUTE FUNCTION public.site_jurisdiction_tighten_set_by();

-- Was greatest(count, 0): a negative count is a caller bug and must not pass as 0.
CREATE OR REPLACE FUNCTION public.log_jurisdiction_decision(
  p_site_id uuid, p_fn text, p_purpose text, p_country text, p_rule_id text, p_outcome text, p_reason text,
  p_evidence text, p_enforced boolean, p_count integer DEFAULT 1, p_now timestamptz DEFAULT now())
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_c text := upper(coalesce(trim(p_country), ''));
  v_n integer := coalesce(p_count, 1);
BEGIN
  IF v_n < 0 THEN
    RAISE EXCEPTION 'negative_count' USING ERRCODE = '22023';
  END IF;
  IF v_c !~ '^[A-Z]{2}$' OR v_c IN ('XX', 'T1') THEN v_c := ''; END IF;
  INSERT INTO public.jurisdiction_decisions_daily (site_id, day, fn, purpose, country, rule_id, outcome, reason, evidence, enforced, count)
  -- No usable rule = the baseline decided (the common case while nothing is approved); '' would fail the CHECK.
  VALUES (p_site_id, (p_now AT TIME ZONE 'UTC')::date, p_fn, p_purpose, v_c, left(coalesce(nullif(trim(p_rule_id), ''), 'baseline'), 200),
          p_outcome, p_reason, p_evidence, coalesce(p_enforced, false), v_n)
  ON CONFLICT (site_id, day, fn, purpose, country, rule_id, outcome, reason, evidence, enforced)
  DO UPDATE SET count = public.jurisdiction_decisions_daily.count + EXCLUDED.count;
END $$;
REVOKE ALL ON FUNCTION public.log_jurisdiction_decision(uuid, text, text, text, text, text, text, text, boolean, integer, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_jurisdiction_decision(uuid, text, text, text, text, text, text, text, boolean, integer, timestamptz) TO service_role;

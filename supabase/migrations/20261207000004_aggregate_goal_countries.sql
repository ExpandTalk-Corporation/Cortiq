-- Spec 2026-11-18 phase 6 (thin slice): consent-free goal conversions per country per day, for
-- per-country pixel readiness. Country only from the signed edge geo ('' otherwise). Daily counts,
-- no visitor key.
CREATE TABLE IF NOT EXISTS public.aggregate_goal_countries_daily (
  site_id     uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  day         date NOT NULL,
  country     text NOT NULL DEFAULT '' CHECK (country = '' OR country ~ '^[A-Z]{2}$'),
  goal_id     text NOT NULL CHECK (length(goal_id) BETWEEN 1 AND 200),
  conversions integer NOT NULL DEFAULT 0 CHECK (conversions >= 0),
  PRIMARY KEY (site_id, day, country, goal_id)
);
ALTER TABLE public.aggregate_goal_countries_daily ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Site owners read aggregate goal countries" ON public.aggregate_goal_countries_daily;
CREATE POLICY "Site owners read aggregate goal countries" ON public.aggregate_goal_countries_daily
  FOR SELECT TO authenticated
  USING (site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.ingest_aggregate_goal_country(p_site_id uuid, p_country text, p_goal_id text, p_now timestamptz DEFAULT now())
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_c text := upper(coalesce(trim(p_country), ''));
BEGIN
  IF v_c !~ '^[A-Z]{2}$' OR v_c IN ('XX', 'T1') THEN v_c := ''; END IF;
  INSERT INTO public.aggregate_goal_countries_daily (site_id, day, country, goal_id, conversions)
  VALUES (p_site_id, (p_now AT TIME ZONE 'UTC')::date, v_c, p_goal_id, 1)
  ON CONFLICT (site_id, day, country, goal_id) DO UPDATE SET conversions = public.aggregate_goal_countries_daily.conversions + 1;
END $$;
REVOKE ALL ON FUNCTION public.ingest_aggregate_goal_country(uuid, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_aggregate_goal_country(uuid, text, text, timestamptz) TO service_role;

-- Same retention as aggregate_countries_daily: rows older than the oldest remaining page day go.
CREATE OR REPLACE FUNCTION public.aggregate_goal_countries_retention()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE n integer;
BEGIN
  DELETE FROM public.aggregate_goal_countries_daily c
   WHERE NOT EXISTS (SELECT 1 FROM public.aggregate_pages_daily p WHERE p.site_id = c.site_id AND p.day <= c.day);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.aggregate_goal_countries_retention() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aggregate_goal_countries_retention() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('aggregate-goal-countries-retention', '45 4 * * *', 'SELECT public.aggregate_goal_countries_retention()');
  END IF;
END $$;

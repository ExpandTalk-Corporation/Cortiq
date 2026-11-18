-- supabase/migrations/20261203000002_aggregate_countries.sql
-- Spec 2026-11-18 phase 2 AC4: consent-free aggregate page views per country per day. Country
-- only (no region): a separate table so the existing aggregate keys and burst filter stay as they
-- are. '' = unknown. Called by aggregate-hit after a counted page view.

CREATE TABLE IF NOT EXISTS public.aggregate_countries_daily (
  site_id   uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  day       date NOT NULL,
  country   text NOT NULL DEFAULT '' CHECK (country = '' OR country ~ '^[A-Z]{2}$'),
  pageviews integer NOT NULL DEFAULT 0,
  PRIMARY KEY (site_id, day, country)
);
ALTER TABLE public.aggregate_countries_daily ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Site owners read aggregate countries" ON public.aggregate_countries_daily;
CREATE POLICY "Site owners read aggregate countries" ON public.aggregate_countries_daily
  FOR SELECT TO authenticated
  USING (site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.ingest_aggregate_country(p_site_id uuid, p_country text, p_now timestamptz DEFAULT now())
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_c text := upper(coalesce(trim(p_country), ''));
BEGIN
  IF v_c !~ '^[A-Z]{2}$' OR v_c IN ('XX', 'T1') THEN v_c := ''; END IF;
  INSERT INTO public.aggregate_countries_daily (site_id, day, country, pageviews)
  VALUES (p_site_id, (p_now AT TIME ZONE 'UTC')::date, v_c, 1)
  ON CONFLICT (site_id, day, country) DO UPDATE SET pageviews = public.aggregate_countries_daily.pageviews + 1;
END;
$$;
REVOKE ALL ON FUNCTION public.ingest_aggregate_country(uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_aggregate_country(uuid, text, timestamptz) TO service_role;

-- Same retention as the other aggregate tables: run_data_retention() trims aggregate_pages_daily
-- by the site's retention; country rows older than the oldest remaining page day go too.
CREATE OR REPLACE FUNCTION public.aggregate_countries_retention()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  n integer;
BEGIN
  DELETE FROM public.aggregate_countries_daily c
   WHERE NOT EXISTS (SELECT 1 FROM public.aggregate_pages_daily p WHERE p.site_id = c.site_id AND p.day <= c.day);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.aggregate_countries_retention() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aggregate_countries_retention() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('aggregate-countries-retention', '40 4 * * *', 'SELECT public.aggregate_countries_retention()');
  END IF;
END;
$$;

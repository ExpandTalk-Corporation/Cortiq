-- supabase/migrations/20261015000002_dashboard_saved_filters.sql
CREATE TABLE IF NOT EXISTS public.dashboard_saved_filters (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id    uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  filters    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dashboard_saved_filters_site ON public.dashboard_saved_filters(site_id);

ALTER TABLE public.dashboard_saved_filters ENABLE ROW LEVEL SECURITY;
CREATE POLICY dashboard_saved_filters_owner ON public.dashboard_saved_filters
  FOR ALL TO authenticated
  USING (site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid()))
  WITH CHECK (site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dashboard_saved_filters TO authenticated;

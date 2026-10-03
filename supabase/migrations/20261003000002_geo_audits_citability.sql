-- GEO audit score model v2 (see SCORE_VERSION in supabase/functions/geo-analyze):
-- deterministic passage citability plus a version so v1 and v2 scores are not
-- compared as if they were the same scale.
ALTER TABLE public.geo_audits
  ADD COLUMN IF NOT EXISTS citability_score integer,
  ADD COLUMN IF NOT EXISTS citability_details jsonb,
  ADD COLUMN IF NOT EXISTS score_version integer NOT NULL DEFAULT 1;

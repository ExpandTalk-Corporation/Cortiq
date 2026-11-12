-- supabase/migrations/20261121000001_sri_pinned_version.sql
-- Pinned installs with Subresource Integrity. The install snippet can load a fixed tracker version
-- (/v/<version>/cortiq.js) with an integrity hash; such a site gets no tracker updates until the
-- owner copies a new snippet. The dashboard records the version when the owner copies a pinned
-- snippet (null = the auto-updating snippet) and warns when a newer version fixes a security issue.
-- Owners update their own sites under the existing sites RLS policies.

ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS sri_pinned_version text
  CONSTRAINT sites_sri_pinned_version_format CHECK (sri_pinned_version ~ '^\d{1,4}\.\d{1,4}\.\d{1,4}$');

COMMENT ON COLUMN public.sites.sri_pinned_version IS
  'Tracker version of the last pinned (SRI) snippet copied from the dashboard; null = auto-updating snippet.';

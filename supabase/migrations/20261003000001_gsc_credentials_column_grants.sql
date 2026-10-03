-- site_google_credentials holds Google OAuth refresh/access tokens. RLS limits rows to
-- the site owner, but the owner's browser could still SELECT the token columns.
-- Only the Edge Functions (service role) need tokens; the dashboard reads the
-- property list and edits the active property and brand keywords.
REVOKE ALL ON public.site_google_credentials FROM anon, authenticated;

GRANT SELECT (id, site_id, property_url, is_active, last_sync_at, created_at, brand_keywords)
  ON public.site_google_credentials TO authenticated;
GRANT UPDATE (is_active, brand_keywords) ON public.site_google_credentials TO authenticated;
GRANT DELETE ON public.site_google_credentials TO authenticated;

-- 1. api_keys: site-owner RLS (the old company policies were a tautology)
-- 2. validate_api_key: pin search_path
-- 3. run_data_retention: cover the tables it skipped
--
-- Why (1): the original policies were written as
--   company_id IN (SELECT company_id FROM organization_members WHERE user_id = auth.uid())
-- but organization_members has no company_id column, so Postgres resolved it to the
-- OUTER api_keys.company_id. The condition was true for every row whenever the caller
-- belonged to any organization: any such user could read, update and delete every API
-- key (hashes, site ids, rate limits) and insert keys for any site. Keys are site-scoped
-- (validate_api_key returns site_id; public-api and mcp-server only use site_id), so
-- ownership follows the project convention: the caller must own the site.
--
-- Why (3): ai_agent_sessions (+ journey steps), ai_search_traffic and cloudflare_traffic
-- were never deleted except by site cascade. They now follow the same per-site cutoff as
-- every other tracking table; cloudflare_traffic (raw request log) is capped at 90 days.

-- ── 1. api_keys RLS ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "view_own_company_api_keys"   ON public.api_keys;
DROP POLICY IF EXISTS "insert_own_company_api_keys" ON public.api_keys;
DROP POLICY IF EXISTS "update_own_company_api_keys" ON public.api_keys;
DROP POLICY IF EXISTS "delete_own_company_api_keys" ON public.api_keys;
DROP POLICY IF EXISTS "view_own_api_key_usage"      ON public.api_key_usage;

-- Every key must belong to a site (a site-less key would be unreachable by these policies).
DELETE FROM public.api_keys WHERE site_id IS NULL;
ALTER TABLE public.api_keys ALTER COLUMN site_id SET NOT NULL;

ALTER TABLE public.api_keys DROP CONSTRAINT IF EXISTS api_keys_rate_limit_range;
ALTER TABLE public.api_keys
  ADD CONSTRAINT api_keys_rate_limit_range CHECK (rate_limit BETWEEN 1 AND 100000);

CREATE POLICY "api_keys_select_own_site" ON public.api_keys
  FOR SELECT TO authenticated
  USING (site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid()));

CREATE POLICY "api_keys_insert_own_site" ON public.api_keys
  FOR INSERT TO authenticated
  WITH CHECK (
    site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid())
    AND created_by = auth.uid()
  );

CREATE POLICY "api_keys_update_own_site" ON public.api_keys
  FOR UPDATE TO authenticated
  USING      (site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid()))
  WITH CHECK (site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid()));

CREATE POLICY "api_keys_delete_own_site" ON public.api_keys
  FOR DELETE TO authenticated
  USING (site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid()));

CREATE POLICY "api_key_usage_select_own_site" ON public.api_key_usage
  FOR SELECT TO authenticated
  USING (api_key_id IN (
    SELECT k.id FROM public.api_keys k
    JOIN public.sites s ON s.id = k.site_id
    WHERE s.user_id = auth.uid()
  ));

-- ── 2. validate_api_key ─────────────────────────────────────────────────────────
-- Same body; adds search_path. CREATE OR REPLACE keeps the service_role-only grants
-- from 20260923000003.
CREATE OR REPLACE FUNCTION public.validate_api_key(p_key_hash text)
RETURNS TABLE(api_key_id uuid, company_id uuid, site_id uuid, permissions text[], rate_limit integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT k.id, k.company_id, k.site_id, k.permissions, k.rate_limit
  FROM api_keys k
  WHERE k.key_hash = p_key_hash
    AND k.is_active = TRUE
    AND (k.expires_at IS NULL OR k.expires_at > NOW());

  UPDATE api_keys SET last_used_at = NOW() WHERE key_hash = p_key_hash;
END;
$$;

-- ── 3. run_data_retention ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.run_data_retention()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  site_rec   record;
  retention  int;
  cutoff     timestamptz;
  cf_cutoff  timestamptz;
  results    jsonb := '{}';
  del_count  bigint;
begin
  for site_rec in
    select s.id as site_id,
           coalesce(g.data_retention_days, 730) as retention_days
    from   sites s
    left join gdpr_settings g on g.site_id = s.id
  loop
    retention := site_rec.retention_days;
    cutoff    := now() - (retention || ' days')::interval;
    -- Raw server-log rows: never older than 90 days, sooner if the site's cutoff is shorter.
    cf_cutoff := greatest(cutoff, now() - interval '90 days');

    begin
      delete from heatmap_data where site_id = site_rec.site_id and created_at < cutoff;
      get diagnostics del_count = row_count;
      results := results || jsonb_build_object('heatmap_data', coalesce((results->>'heatmap_data')::int, 0) + del_count);
    exception when others then raise warning 'retention heatmap_data failed for %: %', site_rec.site_id, sqlerrm; end;

    begin
      delete from user_interactions
      where session_id in (select id from tracking_sessions where site_id = site_rec.site_id and started_at < cutoff);
      get diagnostics del_count = row_count;
      results := results || jsonb_build_object('user_interactions', coalesce((results->>'user_interactions')::int, 0) + del_count);
    exception when others then raise warning 'retention user_interactions failed for %: %', site_rec.site_id, sqlerrm; end;

    begin
      delete from page_views where site_id = site_rec.site_id and viewed_at < cutoff;
      get diagnostics del_count = row_count;
      results := results || jsonb_build_object('page_views', coalesce((results->>'page_views')::int, 0) + del_count);
    exception when others then raise warning 'retention page_views failed for %: %', site_rec.site_id, sqlerrm; end;

    begin
      delete from tracking_sessions where site_id = site_rec.site_id and started_at < cutoff;
      get diagnostics del_count = row_count;
      results := results || jsonb_build_object('tracking_sessions', coalesce((results->>'tracking_sessions')::int, 0) + del_count);
    exception when others then raise warning 'retention tracking_sessions failed for %: %', site_rec.site_id, sqlerrm; end;

    begin
      delete from ai_bot_traffic where site_id = site_rec.site_id and created_at < cutoff;
      get diagnostics del_count = row_count;
      results := results || jsonb_build_object('ai_bot_traffic', coalesce((results->>'ai_bot_traffic')::int, 0) + del_count);
    exception when others then raise warning 'retention ai_bot_traffic failed for %: %', site_rec.site_id, sqlerrm; end;

    begin
      delete from conversion_events where site_id = site_rec.site_id and created_at < cutoff;
      get diagnostics del_count = row_count;
      results := results || jsonb_build_object('conversion_events', coalesce((results->>'conversion_events')::int, 0) + del_count);
    exception when others then raise warning 'retention conversion_events failed for %: %', site_rec.site_id, sqlerrm; end;

    begin
      delete from unified_visitors where site_id = site_rec.site_id and last_seen_at < cutoff;
      get diagnostics del_count = row_count;
      results := results || jsonb_build_object('unified_visitors', coalesce((results->>'unified_visitors')::int, 0) + del_count);
    exception when others then raise warning 'retention unified_visitors failed for %: %', site_rec.site_id, sqlerrm; end;

    begin
      delete from form_analytics where site_id = site_rec.site_id and created_at < cutoff;
      get diagnostics del_count = row_count;
      results := results || jsonb_build_object('form_analytics', coalesce((results->>'form_analytics')::int, 0) + del_count);
    exception when others then raise warning 'retention form_analytics failed for %: %', site_rec.site_id, sqlerrm; end;

    -- Journey steps cascade from ai_agent_sessions; the explicit delete also catches
    -- old steps whose session is still active.
    begin
      delete from ai_agent_journey_steps where site_id = site_rec.site_id and created_at < cutoff;
      get diagnostics del_count = row_count;
      results := results || jsonb_build_object('ai_agent_journey_steps', coalesce((results->>'ai_agent_journey_steps')::int, 0) + del_count);
    exception when others then raise warning 'retention ai_agent_journey_steps failed for %: %', site_rec.site_id, sqlerrm; end;

    begin
      delete from ai_agent_sessions
      where site_id = site_rec.site_id and coalesce(last_activity_at, created_at) < cutoff;
      get diagnostics del_count = row_count;
      results := results || jsonb_build_object('ai_agent_sessions', coalesce((results->>'ai_agent_sessions')::int, 0) + del_count);
    exception when others then raise warning 'retention ai_agent_sessions failed for %: %', site_rec.site_id, sqlerrm; end;

    begin
      delete from ai_search_traffic where site_id = site_rec.site_id and created_at < cutoff;
      get diagnostics del_count = row_count;
      results := results || jsonb_build_object('ai_search_traffic', coalesce((results->>'ai_search_traffic')::int, 0) + del_count);
    exception when others then raise warning 'retention ai_search_traffic failed for %: %', site_rec.site_id, sqlerrm; end;

    begin
      delete from cloudflare_traffic where site_id = site_rec.site_id and created_at < cf_cutoff;
      get diagnostics del_count = row_count;
      results := results || jsonb_build_object('cloudflare_traffic', coalesce((results->>'cloudflare_traffic')::int, 0) + del_count);
    exception when others then raise warning 'retention cloudflare_traffic failed for %: %', site_rec.site_id, sqlerrm; end;

  end loop;
  return results;
end;
$function$;

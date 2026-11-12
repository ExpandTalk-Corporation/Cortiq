-- supabase/migrations/20261125000001_aggregate_and_api_log_retention.sql
-- Product risks from the legal review of aggregate measurement:
-- 1. aggregate_*_daily kept free-text paths, UTM values and goal names forever. run_data_retention()
--    now deletes them at the site's retention cutoff (gdpr_settings.data_retention_days, default 365).
--    aggregate_retention() still removes salts and visitor hashes when the UTC day ends.
-- 2. api_key_usage kept the caller's full IP (and User-Agent) for the key's lifetime. Both are
--    cleared after 90 days. The rate limit only reads the last hour, so it is unaffected.
-- Same body as 20261014000001 otherwise. CREATE OR REPLACE keeps the existing grants and cron job.

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
           coalesce(g.data_retention_days, 365) as retention_days
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

    -- Truncated IPs on bot rows are only needed for short-term verification
    -- (e.g. checking a claimed GPTBot against OpenAI's published ranges).
    begin
      update ai_bot_traffic set ip_address = null
      where site_id = site_rec.site_id and ip_address is not null
        and created_at < now() - interval '30 days';
      get diagnostics del_count = row_count;
      results := results || jsonb_build_object('ai_bot_traffic_ip_cleared', coalesce((results->>'ai_bot_traffic_ip_cleared')::int, 0) + del_count);
    exception when others then raise warning 'retention ai_bot_traffic ip failed for %: %', site_rec.site_id, sqlerrm; end;

    begin
      delete from canary_hits where site_id = site_rec.site_id and detected_at < cutoff;
      get diagnostics del_count = row_count;
      results := results || jsonb_build_object('canary_hits', coalesce((results->>'canary_hits')::int, 0) + del_count);
    exception when others then raise warning 'retention canary_hits failed for %: %', site_rec.site_id, sqlerrm; end;

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

    -- Consent-free aggregate totals (paths, sources, UTM values, goal names) follow the same
    -- retention as the site's other data.
    begin
      delete from aggregate_pages_daily where site_id = site_rec.site_id and day < cutoff::date;
      get diagnostics del_count = row_count;
      results := results || jsonb_build_object('aggregate_pages_daily', coalesce((results->>'aggregate_pages_daily')::int, 0) + del_count);
    exception when others then raise warning 'retention aggregate_pages_daily failed for %: %', site_rec.site_id, sqlerrm; end;

    begin
      delete from aggregate_sources_daily where site_id = site_rec.site_id and day < cutoff::date;
      get diagnostics del_count = row_count;
      results := results || jsonb_build_object('aggregate_sources_daily', coalesce((results->>'aggregate_sources_daily')::int, 0) + del_count);
    exception when others then raise warning 'retention aggregate_sources_daily failed for %: %', site_rec.site_id, sqlerrm; end;

    begin
      delete from aggregate_conversions_daily where site_id = site_rec.site_id and day < cutoff::date;
      get diagnostics del_count = row_count;
      results := results || jsonb_build_object('aggregate_conversions_daily', coalesce((results->>'aggregate_conversions_daily')::int, 0) + del_count);
    exception when others then raise warning 'retention aggregate_conversions_daily failed for %: %', site_rec.site_id, sqlerrm; end;

    begin
      delete from aggregate_filtered_daily where site_id = site_rec.site_id and day < cutoff::date;
      get diagnostics del_count = row_count;
      results := results || jsonb_build_object('aggregate_filtered_daily', coalesce((results->>'aggregate_filtered_daily')::int, 0) + del_count);
    exception when others then raise warning 'retention aggregate_filtered_daily failed for %: %', site_rec.site_id, sqlerrm; end;

  end loop;

  -- API request log: the caller's IP and User-Agent are only needed for abuse checks and
  -- support. After 90 days they are cleared; endpoint, status and timing stay for usage stats.
  begin
    update api_key_usage set request_ip = null, user_agent = null
    where created_at < now() - interval '90 days'
      and (request_ip is not null or user_agent is not null);
    get diagnostics del_count = row_count;
    results := results || jsonb_build_object('api_key_usage_ip_cleared', del_count);
  exception when others then raise warning 'retention api_key_usage ip failed: %', sqlerrm; end;
  return results;
end;
$function$;

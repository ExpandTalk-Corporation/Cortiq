-- Server-side agent measurement + retention tightening (2026-10-14).
--
-- Background: the in-browser bot layer now waits for analytics consent (reading
-- navigator/screen and loading a canary pixel is device access under LEK 9:28 /
-- ePrivacy Art. 5.3). Crawlers are measured server-side instead: adapters on the
-- customer's server/edge send only bot-like requests, robots.txt / llms.txt fetches
-- and honeypot hits to the `server-hit` Edge Function, with the IP already truncated.
--
-- 1. ai_bot_traffic.server_signal — what kind of server-side request it was.
-- 2. get_ai_bot_source_breakdown() — browser vs server-side coverage for the dashboard.
-- 3. run_data_retention(): default 365 days (was 730 for sites without gdpr_settings),
--    and the truncated IP on bot rows is cleared after 30 days.
-- 4. run_bot_detection_retention(): bot_detections 730 -> 365 days; run_canary_retention()
--    730 -> 365 days, and canary_hits also follow each site's retention.
-- 5. auto_anonymize_ip also on tracking_sessions and heatmap_data (both have an
--    ip_address column that no current writer fills — defence in depth).
--
-- Idempotent guards: remote migration history drifts from these files.

-- ── 1. server_signal ────────────────────────────────────────────────────────────
ALTER TABLE public.ai_bot_traffic ADD COLUMN IF NOT EXISTS server_signal text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_bot_traffic_server_signal_check') THEN
    ALTER TABLE public.ai_bot_traffic
      ADD CONSTRAINT ai_bot_traffic_server_signal_check
      CHECK (server_signal IS NULL OR server_signal IN ('request', 'robots_txt', 'llms_txt', 'honeypot'));
  END IF;
END$$;

COMMENT ON COLUMN public.ai_bot_traffic.server_signal IS
  'Server-side rows only: request = ordinary bot fetch, robots_txt / llms_txt = fetch of that file, honeypot = followed the hidden trap link (ignores robots.txt Disallow).';

-- ── 2. Source breakdown for the dashboard ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_ai_bot_source_breakdown(p_site_id uuid, p_days int DEFAULT 7)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'js_tag',      count(*) FILTER (WHERE source = 'js_tag'),
    'server_log',  count(*) FILTER (WHERE source = 'server_log'),
    'robots_txt',  count(*) FILTER (WHERE server_signal = 'robots_txt'),
    'llms_txt',    count(*) FILTER (WHERE server_signal = 'llms_txt'),
    'honeypot',    count(*) FILTER (WHERE server_signal = 'honeypot'),
    'last_server_hit', max(detected_at) FILTER (WHERE source = 'server_log')
  )
  FROM ai_bot_traffic
  WHERE site_id = p_site_id AND detected_at >= now() - (p_days || ' days')::interval;
$$;

REVOKE ALL ON FUNCTION public.get_ai_bot_source_breakdown(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ai_bot_source_breakdown(uuid, int) TO authenticated;

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

  end loop;
  return results;
end;
$function$;

-- ── 4. run_bot_detection_retention ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.run_bot_detection_retention()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_detections BIGINT;
  deleted_stats      BIGINT;
BEGIN
  -- bot_detections: 365 days, same default as visitor data.
  DELETE FROM public.bot_detections WHERE detected_at < now() - interval '365 days';
  GET DIAGNOSTICS deleted_detections = ROW_COUNT;

  -- bot_hourly_stats: 365 days (aggregate, no personal data).
  DELETE FROM public.bot_hourly_stats WHERE hour < now() - interval '365 days';
  GET DIAGNOSTICS deleted_stats = ROW_COUNT;

  RETURN jsonb_build_object(
    'bot_detections_deleted', deleted_detections,
    'bot_hourly_stats_deleted', deleted_stats
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.run_canary_retention()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted BIGINT;
BEGIN
  DELETE FROM public.canary_hits WHERE detected_at < now() - interval '365 days';
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN jsonb_build_object('canary_hits_deleted', deleted);
END;
$$;

-- ── 5. IP anonymisation trigger coverage ────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tracking_sessions', 'heatmap_data'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = t AND column_name = 'ip_address')
       AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'auto_anonymize_ip_' || t) THEN
      EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF ip_address ON public.%I
                      FOR EACH ROW EXECUTE FUNCTION public.auto_anonymize_ip()', 'auto_anonymize_ip_' || t, t);
    END IF;
  END LOOP;
END$$;

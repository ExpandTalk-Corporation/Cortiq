-- supabase/migrations/20261015120000_form_session_ingest.sql
-- Forms tab: the tracker has sent form_session events since the 2026-07 tracker convergence,
-- but track-event had no handler (the type was not even on its allow-list), so form_sessions
-- and form_analytics stopped receiving data. track-event now calls this function for tracker
-- form sessions and for SentriSK iframe submits.

CREATE OR REPLACE FUNCTION public.record_form_session(
  p_site_id          uuid,
  p_session_id       text,
  p_form_id          text,
  p_form_name        text,
  p_form_type        text,
  p_status           text,        -- 'completed' | 'abandoned'
  p_duration_seconds int,
  p_fields_completed int,
  p_total_fields     int,
  p_error_count      int,
  p_device_type      text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_now  timestamptz := now();
  v_dur  int := greatest(0, least(coalesce(p_duration_seconds, 0), 86400));
  v_fa   uuid;
BEGIN
  IF p_site_id IS NULL OR coalesce(p_form_id, '') = '' OR p_status NOT IN ('completed', 'abandoned') THEN
    RETURN;
  END IF;

  INSERT INTO public.form_sessions (site_id, session_id, form_id, form_type, started_at, completed_at, abandoned_at,
                                    completion_time, fields_completed, total_fields, error_count, device_type)
  VALUES (p_site_id, coalesce(nullif(p_session_id, ''), 'unknown'), left(p_form_id, 200),
          coalesce(nullif(left(p_form_type, 50), ''), 'custom'),
          v_now - make_interval(secs => v_dur),
          CASE WHEN p_status = 'completed' THEN v_now END,
          CASE WHEN p_status = 'abandoned' THEN v_now END,
          CASE WHEN p_status = 'completed' THEN v_dur END,
          greatest(0, coalesce(p_fields_completed, 0)), greatest(0, coalesce(p_total_fields, 0)),
          greatest(0, coalesce(p_error_count, 0)),
          CASE WHEN p_device_type IN ('mobile', 'tablet', 'desktop') THEN p_device_type END);

  -- One form_analytics row per site + form, recomputed from its sessions (no unique
  -- constraint exists on the table, so find-or-create under a row lock).
  SELECT id INTO v_fa FROM public.form_analytics
    WHERE site_id = p_site_id AND form_id = left(p_form_id, 200)
    ORDER BY created_at LIMIT 1 FOR UPDATE;
  IF v_fa IS NULL THEN
    INSERT INTO public.form_analytics (site_id, form_id, form_name, form_type)
    VALUES (p_site_id, left(p_form_id, 200), left(coalesce(nullif(p_form_name, ''), p_form_id), 200),
            coalesce(nullif(left(p_form_type, 50), ''), 'custom'))
    RETURNING id INTO v_fa;
  END IF;

  UPDATE public.form_analytics fa
  SET total_starts        = s.starts,
      total_completions   = s.completions,
      total_abandons      = s.abandons,
      avg_completion_time = s.avg_time,
      conversion_rate     = CASE WHEN s.starts > 0 THEN round(100.0 * s.completions / s.starts, 2) ELSE 0 END,
      updated_at          = v_now
  FROM (
    SELECT count(*)                                   AS starts,
           count(*) FILTER (WHERE completed_at IS NOT NULL) AS completions,
           count(*) FILTER (WHERE abandoned_at IS NOT NULL) AS abandons,
           round(avg(completion_time) FILTER (WHERE completed_at IS NOT NULL))::int AS avg_time
    FROM public.form_sessions
    WHERE site_id = p_site_id AND form_id = left(p_form_id, 200)
  ) s
  WHERE fa.id = v_fa;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_form_session(uuid, text, text, text, text, text, int, int, int, int, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.record_form_session(uuid, text, text, text, text, text, int, int, int, int, text) TO service_role;

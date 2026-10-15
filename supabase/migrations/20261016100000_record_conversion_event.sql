-- supabase/migrations/20261016100000_record_conversion_event.sql
-- Conversions: conversion_events had 0 rows. The goals configured in the dashboard
-- (sites.conversion_goals) were never read by the tracker, and record-conversion is skipped
-- in cookieless mode, which every install uses. track-event now records goal hits through
-- this function: page-visit goals matched server-side, form/click goals reported by the
-- tracker, SentriSK iframe submits, and data-wfa-conversion elements in cookieless mode.

CREATE OR REPLACE FUNCTION public.record_conversion_event(
  p_site_id      uuid,
  p_session      text,          -- the tracker's session token (tracking_sessions.session_id)
  p_event_name   text,
  p_event_type   text,
  p_selector     text,
  p_value        numeric
)
RETURNS boolean                 -- true when a row was inserted
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_sess uuid;
  v_name text := left(nullif(trim(p_event_name), ''), 200);
BEGIN
  IF p_site_id IS NULL OR v_name IS NULL THEN RETURN false; END IF;

  IF coalesce(p_session, '') <> '' THEN
    SELECT id INTO v_sess FROM public.tracking_sessions
      WHERE site_id = p_site_id AND session_id = p_session
      ORDER BY started_at DESC LIMIT 1;
  END IF;

  -- A goal counts once per session (repeat clicks or reloads are not extra conversions).
  IF v_sess IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.conversion_events
    WHERE site_id = p_site_id AND session_id = v_sess AND event_name = v_name
  ) THEN
    RETURN false;
  END IF;

  INSERT INTO public.conversion_events (site_id, session_id, event_type, event_name, event_value, element_selector)
  VALUES (p_site_id, v_sess, left(coalesce(nullif(p_event_type, ''), 'conversion'), 50), v_name,
          CASE WHEN p_value IS NOT NULL AND p_value >= 0 AND p_value < 1e9 THEN p_value END,
          left(nullif(p_selector, ''), 500));
  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_conversion_event(uuid, text, text, text, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.record_conversion_event(uuid, text, text, text, text, numeric) TO service_role;

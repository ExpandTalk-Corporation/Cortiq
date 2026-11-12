-- supabase/migrations/20261126000001_user_interactions_ingest.sql
-- Per-event click interactions (nav / button / link / element) into user_interactions.
--
-- The table has been empty since it was created: the tracker's 'interaction' events reached
-- track-event, which dropped them (not on its event allow-list), and the legacy pixel-tracking
-- endpoint inserted a site_id column the table does not have and a text session id into the
-- uuid FKs session_id -> tracking_sessions(id) and page_view_id -> page_views(id).
--
-- record_user_interaction resolves both FKs from the site and the tracker's session id. It
-- stores nothing when the session has no page view: page views and interactions come from the
-- same analytics-consented tracker, so a session without one has no consented visit to attach
-- to. Rows go when their session or page view goes (ON DELETE CASCADE), so retention is
-- unchanged. Callers (track-event, pixel-tracking) sanitise the values first; this function
-- only clips them again.

ALTER TABLE public.user_interactions ADD COLUMN IF NOT EXISTS element_href text;

COMMENT ON COLUMN public.user_interactions.element_href IS
  'Link target without query string or fragment; mailto:/tel: store only the scheme.';

CREATE OR REPLACE FUNCTION public.record_user_interaction(
  p_site_id       uuid,
  p_session       text,
  p_url           text,
  p_type          text,
  p_element_tag   text,
  p_element_id    text,
  p_element_class text,
  p_element_text  text,
  p_element_href  text,
  p_x             integer,
  p_y             integer,
  p_scroll        integer,
  p_at            timestamptz
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_ts      timestamptz := least(coalesce(p_at, now()), now() + interval '5 minutes');
  v_path    text := nullif(split_part(split_part(coalesce(p_url, ''), '#', 1), '?', 1), '');
  v_session uuid;
  v_view    uuid;
  v_id      uuid;
BEGIN
  IF p_site_id IS NULL OR coalesce(p_session, '') = '' OR coalesce(p_type, '') !~ '^[a-z][a-z_]{0,39}$' THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_session FROM public.tracking_sessions
  WHERE site_id = p_site_id AND session_id = p_session AND started_at <= v_ts
  ORDER BY started_at DESC LIMIT 1;
  IF v_session IS NULL THEN RETURN NULL; END IF;

  -- The page the click happened on: the latest view of the same URL in this visit, else the
  -- latest view at all.
  SELECT id INTO v_view FROM public.page_views
  WHERE session_id = v_session AND site_id = p_site_id AND viewed_at <= v_ts + interval '5 minutes'
  ORDER BY (v_path IS NOT NULL AND split_part(split_part(url, '#', 1), '?', 1) = v_path) DESC, viewed_at DESC
  LIMIT 1;
  IF v_view IS NULL THEN RETURN NULL; END IF;

  INSERT INTO public.user_interactions (session_id, page_view_id, interaction_type, element_tag, element_id,
    element_class, element_text, element_href, x_coordinate, y_coordinate, scroll_position, timestamp_ms)
  VALUES (v_session, v_view, p_type, left(p_element_tag, 32), left(p_element_id, 100), left(p_element_class, 100),
    left(p_element_text, 255), left(p_element_href, 1024), p_x, p_y, p_scroll,
    (extract(epoch FROM v_ts) * 1000)::bigint)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_user_interaction(uuid, text, text, text, text, text, text, text, text, integer, integer, integer, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.record_user_interaction(uuid, text, text, text, text, text, text, text, text, integer, integer, integer, timestamptz) TO service_role;

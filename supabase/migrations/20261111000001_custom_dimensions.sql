-- supabase/migrations/20261111000001_custom_dimensions.sql
-- Custom dimensions: a site registers metadata keys sent with CortIQ.track() so they can be
-- reported on (GA4's "register custom dimension"). Until now custom properties were stored
-- in tracking_events.metadata but no report could read them.

-- 1. tracking_events is keyed by company; events need their site to be reported per site.
--    track-event sets it from now on (after an ownership check); older rows are backfilled
--    from metadata.url, matched only against sites owned by the event's company.
ALTER TABLE public.tracking_events
  ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tracking_events_site_time
  ON public.tracking_events(site_id, timestamp DESC) WHERE site_id IS NOT NULL;

UPDATE public.tracking_events te
SET site_id = s.id
FROM public.sites s
WHERE te.site_id IS NULL
  AND s.user_id = te.company_id
  AND te.metadata->>'url' IS NOT NULL
  AND public._norm_host(s.domain) = public._norm_host(te.metadata->>'url');

-- 2. Keys that identify a person or device, or carry full URLs / user agents. They are set by
--    the tracker itself and must never become a reporting dimension.
CREATE OR REPLACE FUNCTION public._is_reserved_event_key(p_key text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT lower(p_key) = ANY (ARRAY[
    'user_agent', 'referrer', 'url', 'visitor_id', 'session_id', 'ip_address', 'email',
    'original_content_id', 'click_ids', 'gclid', 'fbclid', 'msclkid', 'ttclid', 'li_fat_id',
    'timezone', 'timestamp', 'items', 'field_data'
  ])
$$;

CREATE TABLE IF NOT EXISTS public.custom_dimensions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id    uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  key        text NOT NULL CHECK (key ~ '^[A-Za-z_][A-Za-z0-9_]{0,39}$' AND NOT public._is_reserved_event_key(key)),
  label      text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 60),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, key)
);

ALTER TABLE public.custom_dimensions ENABLE ROW LEVEL SECURITY;
CREATE POLICY custom_dimensions_owner ON public.custom_dimensions
  FOR ALL TO authenticated
  USING (site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid()))
  WITH CHECK (site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_dimensions TO authenticated;

-- At most 25 dimensions per site.
CREATE OR REPLACE FUNCTION public._custom_dimensions_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF (SELECT count(*) FROM public.custom_dimensions WHERE site_id = NEW.site_id) >= 25 THEN
    RAISE EXCEPTION 'custom dimension limit (25) reached' USING ERRCODE = '54000';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER custom_dimensions_limit BEFORE INSERT ON public.custom_dimensions
  FOR EACH ROW EXECUTE FUNCTION public._custom_dimensions_limit();

-- 3. Discovery: scalar metadata keys seen on the site's events, so the user picks from real
--    data instead of typing key names.
CREATE OR REPLACE FUNCTION public.get_event_property_keys(p_site_id uuid, p_from date, p_to date)
RETURNS TABLE (key text, events bigint, registered boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sites WHERE id = p_site_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from + 1 > 366 THEN
    RAISE EXCEPTION 'invalid range' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT kv.key, count(*) AS events,
         EXISTS (SELECT 1 FROM public.custom_dimensions cd WHERE cd.site_id = p_site_id AND cd.key = kv.key)
  FROM public.tracking_events te,
       LATERAL jsonb_each(CASE WHEN jsonb_typeof(te.metadata) = 'object' THEN te.metadata ELSE '{}'::jsonb END) kv
  WHERE te.site_id = p_site_id
    AND te.timestamp >= p_from AND te.timestamp < p_to + 1
    AND jsonb_typeof(kv.value) IN ('string', 'number', 'boolean')
    AND kv.key ~ '^[A-Za-z_][A-Za-z0-9_]{0,39}$'
    AND NOT public._is_reserved_event_key(kv.key)
  GROUP BY kv.key
  ORDER BY events DESC, kv.key
  LIMIT 50;
END;
$$;

-- 4. Breakdown of one registered dimension: top values plus an "(other)" row, so the rows
--    always add up to the number of events that carry the key. Values are cut to 100 chars.
CREATE OR REPLACE FUNCTION public.get_custom_dimension_breakdown(
  p_site_id uuid, p_key text, p_from date, p_to date, p_limit int DEFAULT 25
)
RETURNS TABLE (value text, events bigint, sessions bigint, is_other boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  lim int := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sites WHERE id = p_site_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from + 1 > 366 THEN
    RAISE EXCEPTION 'invalid range' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.custom_dimensions WHERE site_id = p_site_id AND key = p_key) THEN
    RAISE EXCEPTION 'dimension not registered' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH v AS (
    SELECT COALESCE(NULLIF(left(te.metadata->>p_key, 100), ''), '(empty)') AS val, te.session_id
    FROM public.tracking_events te
    WHERE te.site_id = p_site_id
      AND te.timestamp >= p_from AND te.timestamp < p_to + 1
      AND jsonb_typeof(te.metadata->p_key) IN ('string', 'number', 'boolean')
  ),
  g AS (
    SELECT v.val, count(*) AS ev, count(DISTINCT v.session_id) AS se FROM v GROUP BY v.val
  ),
  r AS (
    SELECT g.*, row_number() OVER (ORDER BY g.ev DESC, g.val) AS rn FROM g
  )
  SELECT r.val, r.ev, r.se, false FROM r WHERE r.rn <= lim
  UNION ALL
  SELECT '(other)', sum(r.ev)::bigint,
         (SELECT count(DISTINCT v.session_id) FROM v JOIN r r2 ON r2.val = v.val WHERE r2.rn > lim),
         true
  FROM r WHERE r.rn > lim
  HAVING count(*) > 0
  ORDER BY 4, 2 DESC, 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_event_property_keys(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_event_property_keys(uuid, date, date) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_custom_dimension_breakdown(uuid, text, date, date, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_custom_dimension_breakdown(uuid, text, date, date, int) TO authenticated;

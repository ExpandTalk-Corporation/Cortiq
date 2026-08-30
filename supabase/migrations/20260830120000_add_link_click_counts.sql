-- Anonymous aggregate per-link click counter (audience-measurement exemption).
-- One row per (site, page path, link, device, UTC day) with a running click_count.
-- Deliberately carries NO session_id, visitor_id, coordinates, or sub-day timestamp —
-- that absence is what keeps this table consent-exempt for cookieless sites.

CREATE TABLE IF NOT EXISTS public.link_click_counts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  page_path   text NOT NULL,
  link_kind   text NOT NULL CHECK (link_kind IN ('link','button')),
  link_key    text NOT NULL,
  link_label  text,
  device_type text NOT NULL DEFAULT 'desktop' CHECK (device_type IN ('desktop','mobile','tablet')),
  day         date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  click_count integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS link_click_counts_unique
  ON public.link_click_counts (site_id, page_path, link_kind, link_key, device_type, day);

CREATE INDEX IF NOT EXISTS link_click_counts_site_day
  ON public.link_click_counts (site_id, day);

ALTER TABLE public.link_click_counts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS link_click_counts_select_own ON public.link_click_counts;
CREATE POLICY link_click_counts_select_own
  ON public.link_click_counts
  FOR SELECT
  USING (site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid()));

COMMENT ON TABLE public.link_click_counts IS
  'Anonymous aggregate per-link click tallies (daily buckets). No session/visitor linkage or coordinates — consent-exempt audience measurement. Written only by the link-click-counter edge function (service role).';

-- Atomic increment RPC — used by the link-click-counter edge function (service role)
-- to upsert a single click without a read-then-write race across concurrent requests.
CREATE OR REPLACE FUNCTION public.increment_link_click(
  p_site_id uuid, p_page_path text, p_link_kind text, p_link_key text,
  p_link_label text, p_device_type text, p_day date
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.link_click_counts
    (site_id, page_path, link_kind, link_key, link_label, device_type, day, click_count)
  VALUES
    (p_site_id, p_page_path, p_link_kind, p_link_key, p_link_label, p_device_type, p_day, 1)
  ON CONFLICT (site_id, page_path, link_kind, link_key, device_type, day)
  DO UPDATE SET click_count = public.link_click_counts.click_count + 1, updated_at = now();
$$;

REVOKE EXECUTE ON FUNCTION public.increment_link_click(uuid,text,text,text,text,text,date) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.increment_link_click(uuid,text,text,text,text,text,date) TO service_role;

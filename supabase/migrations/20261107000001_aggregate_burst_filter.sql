-- Aggregate measurement: drop bursts of new direct visitors on one page.
-- Crawlers that run JavaScript with a browser User-Agent and a new IP per request pass the UA bot
-- filter in aggregate-hit and each count as a new visitor (seen on a live site: 10 "visitors" on
-- one page within 16 seconds, all direct, one page view each). A real site rarely gets several
-- brand-new direct visitors on the same page within seconds, so once a page has had
-- BURST_MAX direct visits starting in the last BURST_WINDOW, further first hits from new hashes
-- with no referrer and no UTM are not counted at all (no visitor row, no aggregates).
-- Hits with an external source, returning hashes and goals are never affected.

ALTER TABLE public.aggregate_visitors ADD COLUMN IF NOT EXISTS entry_path text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS aggregate_visitors_burst_idx
  ON public.aggregate_visitors (site_id, entry_path, visit_started_at);

CREATE OR REPLACE FUNCTION public.ingest_aggregate_hit(
  p_site_id uuid, p_hash text, p_kind text, p_path text,
  p_referrer_domain text, p_utm_source text, p_utm_medium text, p_utm_campaign text, p_device text,
  p_goal_id text, p_goal_name text, p_value numeric, p_now timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  burst_max    constant int := 3;
  burst_window constant interval := interval '10 seconds';
  v_day  date := (p_now AT TIME ZONE 'UTC')::date;
  v_path text := left(coalesce(nullif(p_path, ''), '/'), 512);
  v_ref  text := left(coalesce(p_referrer_domain, ''), 253);
  v_src  text := left(coalesce(p_utm_source, ''), 100);
  v_med  text := left(coalesce(p_utm_medium, ''), 100);
  v_cmp  text := left(coalesce(p_utm_campaign, ''), 100);
  v_dev  text := left(coalesce(p_device, ''), 20);
  v_goal text := left(nullif(p_goal_id, ''), 200);
  v_row  public.aggregate_visitors%ROWTYPE;
  v_found boolean;
  v_new_visitor boolean := false;
  v_new_visit boolean := false;
BEGIN
  IF p_site_id IS NULL OR coalesce(p_hash, '') = '' OR p_kind IS NULL OR p_kind NOT IN ('pageview', 'goal') THEN
    RETURN false;
  END IF;
  IF p_kind = 'goal' AND (v_goal IS NULL OR coalesce(p_goal_name, '') = '') THEN RETURN false; END IF;
  -- Goal hits never change the visit's source.
  IF p_kind = 'goal' THEN v_ref := ''; v_src := ''; v_med := ''; v_cmp := ''; END IF;

  -- Burst filter for direct first hits. The advisory lock serializes candidates for the same
  -- site and page so concurrent requests of one burst cannot all see an empty window.
  IF p_kind = 'pageview' AND v_ref = '' AND v_src = '' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(p_site_id::text || '|' || v_path, 0));
    IF NOT EXISTS (SELECT 1 FROM public.aggregate_visitors v
                   WHERE v.site_id = p_site_id AND v.day = v_day AND v.visitor_hash = p_hash)
       AND (SELECT count(*) FROM public.aggregate_visitors v
            WHERE v.site_id = p_site_id AND v.entry_path = v_path
              AND v.visit_started_at > p_now - burst_window AND v.visit_started_at <= p_now
              AND v.referrer_domain = '' AND v.utm_source = '') >= burst_max THEN
      RETURN false;
    END IF;
  END IF;

  -- Decide "new visitor" at the serialization point: attempt to create the row first. If this
  -- call wins the insert, it is unambiguously the first hit for this hash today. If it loses
  -- (ON CONFLICT DO NOTHING, no row returned), the row already exists — SELECT ... FOR UPDATE
  -- then either waits for a concurrent creator's insert to commit, or reads the existing row,
  -- so two concurrent first hits for the same hash can never both see "new visitor".
  INSERT INTO public.aggregate_visitors AS v
    (site_id, day, visitor_hash, visit_started_at, last_seen_at, referrer_domain, utm_source, utm_medium, utm_campaign, device, goals_hit, entry_path)
  VALUES (p_site_id, v_day, p_hash, p_now, p_now, v_ref, v_src, v_med, v_cmp, v_dev, '{}', v_path)
  ON CONFLICT (site_id, day, visitor_hash) DO NOTHING
  RETURNING * INTO v_row;
  v_found := FOUND;

  IF v_found THEN
    v_new_visitor := true; v_new_visit := true;
  ELSE
    SELECT * INTO v_row FROM public.aggregate_visitors v
      WHERE v.site_id = p_site_id AND v.day = v_day AND v.visitor_hash = p_hash
      FOR UPDATE;

    -- A goal hit on an existing row never starts a visit: it stays with the row's current source
    -- (otherwise a late conversion would be credited to Direct and add a visit without a page view).
    IF p_kind = 'goal' THEN
      v_new_visit := false;
    ELSIF v_row.last_seen_at < p_now - interval '30 minutes' THEN
      v_new_visit := true;
    ELSIF (v_ref <> '' OR v_src <> '')
      AND (v_ref, v_src, v_med, v_cmp) IS DISTINCT FROM (v_row.referrer_domain, v_row.utm_source, v_row.utm_medium, v_row.utm_campaign) THEN
      v_new_visit := true;
    END IF;

    IF v_new_visit THEN
      UPDATE public.aggregate_visitors v SET
        visit_started_at = p_now, last_seen_at = p_now, referrer_domain = v_ref, utm_source = v_src,
        utm_medium = v_med, utm_campaign = v_cmp, device = v_dev, goals_hit = '{}', entry_path = v_path
        WHERE v.site_id = p_site_id AND v.day = v_day AND v.visitor_hash = p_hash
      RETURNING * INTO v_row;
    ELSE
      UPDATE public.aggregate_visitors v SET last_seen_at = p_now
        WHERE v.site_id = p_site_id AND v.day = v_day AND v.visitor_hash = p_hash;
    END IF;
  END IF;

  IF v_new_visit THEN
    INSERT INTO public.aggregate_sources_daily AS s
      (site_id, day, referrer_domain, utm_source, utm_medium, utm_campaign, device, visits, visitors)
    VALUES (p_site_id, v_day, v_ref, v_src, v_med, v_cmp, v_dev, 1, CASE WHEN v_new_visitor THEN 1 ELSE 0 END)
    ON CONFLICT (site_id, day, referrer_domain, utm_source, utm_medium, utm_campaign, device) DO UPDATE SET
      visits = s.visits + 1, visitors = s.visitors + EXCLUDED.visitors;
  END IF;

  IF p_kind = 'pageview' THEN
    INSERT INTO public.aggregate_pages_daily AS pg (site_id, day, path, pageviews, entries)
    VALUES (p_site_id, v_day, v_path, 1, CASE WHEN v_new_visit THEN 1 ELSE 0 END)
    ON CONFLICT (site_id, day, path) DO UPDATE SET
      pageviews = pg.pageviews + 1, entries = pg.entries + EXCLUDED.entries;
    RETURN true;
  END IF;

  IF v_goal = ANY (v_row.goals_hit) THEN RETURN false; END IF;
  UPDATE public.aggregate_visitors v SET goals_hit = array_append(v.goals_hit, v_goal)
    WHERE v.site_id = p_site_id AND v.day = v_day AND v.visitor_hash = p_hash;

  INSERT INTO public.aggregate_conversions_daily AS c
    (site_id, day, goal_id, goal_name, referrer_domain, utm_source, utm_medium, utm_campaign, conversions, value)
  VALUES (p_site_id, v_day, v_goal, left(p_goal_name, 200), v_row.referrer_domain, v_row.utm_source,
          v_row.utm_medium, v_row.utm_campaign, 1,
          CASE WHEN p_value IS NOT NULL AND p_value >= 0 AND p_value < 1e9 THEN p_value ELSE 0 END)
  ON CONFLICT (site_id, day, goal_id, referrer_domain, utm_source, utm_medium, utm_campaign) DO UPDATE SET
    goal_name = EXCLUDED.goal_name, conversions = c.conversions + 1, value = c.value + EXCLUDED.value;
  RETURN true;
END;
$$;

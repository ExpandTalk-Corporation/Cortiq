-- Aggregate measurement: drop bursts of new direct visitors on one page.
-- Crawlers that run JavaScript with a browser User-Agent and a new IP per request pass the UA bot
-- filter in aggregate-hit and each count as a new visitor (seen on a live site: 10 "visitors" on
-- one page within 16 seconds, all direct, one page view each). A real site rarely gets several
-- brand-new direct visitors on the same page within seconds, so once a page has had
-- BURST_MAX direct visits starting in the last BURST_WINDOW, further first hits from new hashes
-- with no referrer and no UTM are not counted at all (no visitor row, no aggregates).
-- Hits with an external source, returning hashes and goals are never affected.
-- Dropped hits are counted per site and day in aggregate_filtered_daily so the dashboard can show
-- how much was filtered.
--
-- Engagement, with GA4's definitions so the numbers can be compared:
--   engaged visit (GA4 "engaged session") = at least 10 s of foreground time, OR at least 2 page
--   views, OR a conversion in the visit. The beacon sends { kind: 'engagement', ms } with the
--   foreground time; ingest adds it to the visit and to aggregate_sources_daily.engagement_ms.
--   engagement rate = engaged_visits / visits, engaged visits per visitor = engaged_visits /
--   visitors, average engagement time = engagement_ms / visitors (GA4: per active user).

ALTER TABLE public.aggregate_visitors ADD COLUMN IF NOT EXISTS entry_path text NOT NULL DEFAULT '';
ALTER TABLE public.aggregate_visitors ADD COLUMN IF NOT EXISTS visit_pageviews integer NOT NULL DEFAULT 0;
ALTER TABLE public.aggregate_visitors ADD COLUMN IF NOT EXISTS visit_engaged boolean NOT NULL DEFAULT false;
ALTER TABLE public.aggregate_visitors ADD COLUMN IF NOT EXISTS visit_engagement_ms bigint NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS aggregate_visitors_burst_idx
  ON public.aggregate_visitors (site_id, entry_path, visit_started_at);

ALTER TABLE public.aggregate_sources_daily ADD COLUMN IF NOT EXISTS engaged_visits integer NOT NULL DEFAULT 0;
ALTER TABLE public.aggregate_sources_daily ADD COLUMN IF NOT EXISTS engagement_ms bigint NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.aggregate_filtered_daily (
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  day     date NOT NULL,
  reason  text NOT NULL,
  hits    integer NOT NULL DEFAULT 0,
  PRIMARY KEY (site_id, day, reason)
);
ALTER TABLE public.aggregate_filtered_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.aggregate_filtered_daily FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.aggregate_filtered_daily TO authenticated;
DROP POLICY IF EXISTS "Owners read aggregate filtered" ON public.aggregate_filtered_daily;
CREATE POLICY "Owners read aggregate filtered" ON public.aggregate_filtered_daily FOR SELECT TO authenticated
  USING (site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid()));

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
  engaged_ms   constant bigint := 10000;
  max_ping_ms  constant bigint := 1800000;
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
  v_engage boolean := false;
  v_ms bigint;
BEGIN
  IF p_site_id IS NULL OR coalesce(p_hash, '') = '' OR p_kind IS NULL OR p_kind NOT IN ('pageview', 'goal', 'engagement') THEN
    RETURN false;
  END IF;
  IF p_kind = 'goal' AND (v_goal IS NULL OR coalesce(p_goal_name, '') = '') THEN RETURN false; END IF;
  -- Goal and engagement hits never change the visit's source.
  IF p_kind <> 'pageview' THEN v_ref := ''; v_src := ''; v_med := ''; v_cmp := ''; END IF;

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
      INSERT INTO public.aggregate_filtered_daily AS f (site_id, day, reason, hits)
      VALUES (p_site_id, v_day, 'burst', 1)
      ON CONFLICT (site_id, day, reason) DO UPDATE SET hits = f.hits + 1;
      RETURN false;
    END IF;
  END IF;

  -- Engagement only adds foreground time to an existing visit; it never creates a visitor or a
  -- visit (an unknown hash means the page view was not counted, e.g. dropped as a burst).
  IF p_kind = 'engagement' THEN
    IF p_value IS NULL OR p_value < 1 THEN RETURN false; END IF;
    v_ms := round(least(p_value, max_ping_ms));
    UPDATE public.aggregate_visitors v SET
      visit_engagement_ms = v.visit_engagement_ms + v_ms, last_seen_at = greatest(v.last_seen_at, p_now)
      WHERE v.site_id = p_site_id AND v.day = v_day AND v.visitor_hash = p_hash
    RETURNING * INTO v_row;
    IF NOT FOUND THEN RETURN false; END IF;
    UPDATE public.aggregate_sources_daily s SET engagement_ms = s.engagement_ms + v_ms
      WHERE s.site_id = p_site_id AND s.day = v_day AND s.referrer_domain = v_row.referrer_domain
        AND s.utm_source = v_row.utm_source AND s.utm_medium = v_row.utm_medium
        AND s.utm_campaign = v_row.utm_campaign AND s.device = v_row.device;
    v_engage := v_row.visit_engagement_ms >= engaged_ms;
  ELSE

  -- Decide "new visitor" at the serialization point: attempt to create the row first. If this
  -- call wins the insert, it is unambiguously the first hit for this hash today. If it loses
  -- (ON CONFLICT DO NOTHING, no row returned), the row already exists — SELECT ... FOR UPDATE
  -- then either waits for a concurrent creator's insert to commit, or reads the existing row,
  -- so two concurrent first hits for the same hash can never both see "new visitor".
  INSERT INTO public.aggregate_visitors AS v
    (site_id, day, visitor_hash, visit_started_at, last_seen_at, referrer_domain, utm_source, utm_medium, utm_campaign, device, goals_hit, entry_path, visit_pageviews)
  VALUES (p_site_id, v_day, p_hash, p_now, p_now, v_ref, v_src, v_med, v_cmp, v_dev, '{}', v_path, CASE WHEN p_kind = 'pageview' THEN 1 ELSE 0 END)
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
        utm_medium = v_med, utm_campaign = v_cmp, device = v_dev, goals_hit = '{}', entry_path = v_path,
        visit_pageviews = 1, visit_engaged = false, visit_engagement_ms = 0
        WHERE v.site_id = p_site_id AND v.day = v_day AND v.visitor_hash = p_hash
      RETURNING * INTO v_row;
    ELSE
      UPDATE public.aggregate_visitors v SET last_seen_at = p_now,
        visit_pageviews = v.visit_pageviews + CASE WHEN p_kind = 'pageview' THEN 1 ELSE 0 END
        WHERE v.site_id = p_site_id AND v.day = v_day AND v.visitor_hash = p_hash
      RETURNING * INTO v_row;
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
    v_engage := v_row.visit_pageviews >= 2;
  ELSE

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
  v_engage := true;
  END IF;
  END IF;

  -- Count the visit as engaged once. The row lock taken above serializes concurrent hits, and
  -- the NOT visit_engaged guard makes the increment happen exactly once per visit.
  IF v_engage AND NOT v_row.visit_engaged THEN
    UPDATE public.aggregate_visitors v SET visit_engaged = true
      WHERE v.site_id = p_site_id AND v.day = v_day AND v.visitor_hash = p_hash AND NOT v.visit_engaged;
    IF FOUND THEN
      UPDATE public.aggregate_sources_daily s SET engaged_visits = s.engaged_visits + 1
        WHERE s.site_id = p_site_id AND s.day = v_day AND s.referrer_domain = v_row.referrer_domain
          AND s.utm_source = v_row.utm_source AND s.utm_medium = v_row.utm_medium
          AND s.utm_campaign = v_row.utm_campaign AND s.device = v_row.device;
    END IF;
  END IF;
  RETURN true;
END;
$$;

-- Dashboard read: as before, plus engagement and filtered hits.
CREATE OR REPLACE FUNCTION public.get_aggregate_summary(p_site_id uuid, p_from date, p_to date)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'visitors', coalesce((SELECT sum(visitors) FROM public.aggregate_sources_daily
                          WHERE site_id = p_site_id AND day BETWEEN p_from AND p_to), 0),
    'visits', coalesce((SELECT sum(visits) FROM public.aggregate_sources_daily
                        WHERE site_id = p_site_id AND day BETWEEN p_from AND p_to), 0),
    'engaged_visits', coalesce((SELECT sum(engaged_visits) FROM public.aggregate_sources_daily
                                WHERE site_id = p_site_id AND day BETWEEN p_from AND p_to), 0),
    'engagement_ms', coalesce((SELECT sum(engagement_ms) FROM public.aggregate_sources_daily
                               WHERE site_id = p_site_id AND day BETWEEN p_from AND p_to), 0),
    'pageviews', coalesce((SELECT sum(pageviews) FROM public.aggregate_pages_daily
                           WHERE site_id = p_site_id AND day BETWEEN p_from AND p_to), 0),
    'filtered_hits', coalesce((SELECT sum(hits) FROM public.aggregate_filtered_daily
                               WHERE site_id = p_site_id AND day BETWEEN p_from AND p_to), 0),
    'days_with_data', (SELECT count(DISTINCT day) FROM public.aggregate_pages_daily
                       WHERE site_id = p_site_id AND day BETWEEN p_from AND p_to),
    'top_sources', coalesce((SELECT jsonb_agg(s ORDER BY s.visits DESC) FROM (
        SELECT referrer_domain, utm_source, utm_medium, sum(visits)::int AS visits, sum(visitors)::int AS visitors,
               sum(engaged_visits)::int AS engaged_visits
        FROM public.aggregate_sources_daily
        WHERE site_id = p_site_id AND day BETWEEN p_from AND p_to
        GROUP BY referrer_domain, utm_source, utm_medium ORDER BY 4 DESC LIMIT 10) s), '[]'::jsonb),
    'top_pages', coalesce((SELECT jsonb_agg(p ORDER BY p.pageviews DESC) FROM (
        SELECT path, sum(pageviews)::int AS pageviews, sum(entries)::int AS entries
        FROM public.aggregate_pages_daily
        WHERE site_id = p_site_id AND day BETWEEN p_from AND p_to
        GROUP BY path ORDER BY 2 DESC LIMIT 10) p), '[]'::jsonb),
    'conversions', coalesce((SELECT jsonb_agg(c ORDER BY c.conversions DESC) FROM (
        SELECT goal_id, max(goal_name) AS goal_name, referrer_domain, utm_source, utm_medium,
               sum(conversions)::int AS conversions, sum(value) AS value
        FROM public.aggregate_conversions_daily
        WHERE site_id = p_site_id AND day BETWEEN p_from AND p_to
        GROUP BY goal_id, referrer_domain, utm_source, utm_medium ORDER BY 6 DESC LIMIT 50) c), '[]'::jsonb),
    'conversions_by_goal', coalesce((SELECT jsonb_agg(g ORDER BY g.conversions DESC) FROM (
        SELECT goal_id, max(goal_name) AS goal_name, sum(conversions)::int AS conversions
        FROM public.aggregate_conversions_daily
        WHERE site_id = p_site_id AND day BETWEEN p_from AND p_to
        GROUP BY goal_id) g), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.ingest_aggregate_hit(uuid, text, text, text, text, text, text, text, text, text, text, numeric, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_aggregate_hit(uuid, text, text, text, text, text, text, text, text, text, text, numeric, timestamptz)
  TO service_role;
REVOKE ALL ON FUNCTION public.get_aggregate_summary(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_aggregate_summary(uuid, date, date) TO authenticated;

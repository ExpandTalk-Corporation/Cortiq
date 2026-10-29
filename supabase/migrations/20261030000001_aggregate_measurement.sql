-- supabase/migrations/20261030000001_aggregate_measurement.sql
-- Aggregate measurement (docs/superpowers/specs/2026-10-29-aggregate-measurement-and-pixel-readiness-design.md).
-- A consent-free, aggregate-only layer written by the aggregate-hit Edge Function. The only
-- personal data is the daily visitor hash in aggregate_visitors: its salt is deleted once the
-- UTC day has ended and so are the rows. Raw IP and User-Agent never reach the database.

ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS aggregate_measurement boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.sites.aggregate_measurement IS
  'Site owner opted in to consent-free aggregate measurement (aggregate-hit). Off by default.';

CREATE TABLE IF NOT EXISTS public.aggregate_salts (
  day  date PRIMARY KEY,
  salt text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.aggregate_visitors (
  site_id          uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  day              date NOT NULL,
  visitor_hash     text NOT NULL,
  visit_started_at timestamptz NOT NULL,
  last_seen_at     timestamptz NOT NULL,
  referrer_domain  text NOT NULL DEFAULT '',
  utm_source       text NOT NULL DEFAULT '',
  utm_medium       text NOT NULL DEFAULT '',
  utm_campaign     text NOT NULL DEFAULT '',
  device           text NOT NULL DEFAULT '',
  goals_hit        text[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (site_id, day, visitor_hash)
);

CREATE TABLE IF NOT EXISTS public.aggregate_pages_daily (
  site_id   uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  day       date NOT NULL,
  path      text NOT NULL,
  pageviews integer NOT NULL DEFAULT 0,
  entries   integer NOT NULL DEFAULT 0,
  PRIMARY KEY (site_id, day, path)
);

CREATE TABLE IF NOT EXISTS public.aggregate_sources_daily (
  site_id         uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  day             date NOT NULL,
  referrer_domain text NOT NULL DEFAULT '',
  utm_source      text NOT NULL DEFAULT '',
  utm_medium      text NOT NULL DEFAULT '',
  utm_campaign    text NOT NULL DEFAULT '',
  device          text NOT NULL DEFAULT '',
  visits          integer NOT NULL DEFAULT 0,
  visitors        integer NOT NULL DEFAULT 0,
  PRIMARY KEY (site_id, day, referrer_domain, utm_source, utm_medium, utm_campaign, device)
);

CREATE TABLE IF NOT EXISTS public.aggregate_conversions_daily (
  site_id         uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  day             date NOT NULL,
  goal_id         text NOT NULL,
  goal_name       text NOT NULL,
  referrer_domain text NOT NULL DEFAULT '',
  utm_source      text NOT NULL DEFAULT '',
  utm_medium      text NOT NULL DEFAULT '',
  utm_campaign    text NOT NULL DEFAULT '',
  conversions     integer NOT NULL DEFAULT 0,
  value           numeric NOT NULL DEFAULT 0,
  PRIMARY KEY (site_id, day, goal_id, referrer_domain, utm_source, utm_medium, utm_campaign)
);

ALTER TABLE public.aggregate_salts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aggregate_visitors          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aggregate_pages_daily       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aggregate_sources_daily     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aggregate_conversions_daily ENABLE ROW LEVEL SECURITY;

-- Salts and the visitor map: service role only (no policies, no grants).
REVOKE ALL ON public.aggregate_salts, public.aggregate_visitors FROM PUBLIC, anon, authenticated;
-- Daily aggregates: owners read, nobody writes from the client.
REVOKE ALL ON public.aggregate_pages_daily, public.aggregate_sources_daily, public.aggregate_conversions_daily
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.aggregate_pages_daily, public.aggregate_sources_daily, public.aggregate_conversions_daily
  TO authenticated;

DROP POLICY IF EXISTS "Owners read aggregate pages" ON public.aggregate_pages_daily;
CREATE POLICY "Owners read aggregate pages" ON public.aggregate_pages_daily FOR SELECT TO authenticated
  USING (site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "Owners read aggregate sources" ON public.aggregate_sources_daily;
CREATE POLICY "Owners read aggregate sources" ON public.aggregate_sources_daily FOR SELECT TO authenticated
  USING (site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "Owners read aggregate conversions" ON public.aggregate_conversions_daily;
CREATE POLICY "Owners read aggregate conversions" ON public.aggregate_conversions_daily FOR SELECT TO authenticated
  USING (site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid()));

-- One random salt per UTC day. gen_random_uuid() uses the server's strong RNG; no extension needed.
CREATE OR REPLACE FUNCTION public.aggregate_daily_salt(p_now timestamptz DEFAULT now())
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_day  date := (p_now AT TIME ZONE 'UTC')::date;
  v_salt text;
BEGIN
  INSERT INTO public.aggregate_salts (day, salt)
  VALUES (v_day, encode(sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text || clock_timestamp()::text, 'UTF8')), 'hex'))
  ON CONFLICT (day) DO NOTHING;
  SELECT s.salt INTO v_salt FROM public.aggregate_salts s WHERE s.day = v_day;
  RETURN v_salt;
END;
$$;

-- One hit. A new visit starts when the hash is new for the day, after 30 minutes of inactivity,
-- or when a page view arrives from a different external source. Goals count once per goal per
-- visit and are attributed to the visit's entry source.
CREATE OR REPLACE FUNCTION public.ingest_aggregate_hit(
  p_site_id uuid, p_hash text, p_kind text, p_path text,
  p_referrer_domain text, p_utm_source text, p_utm_medium text, p_utm_campaign text, p_device text,
  p_goal_id text, p_goal_name text, p_value numeric, p_now timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
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

  -- Decide "new visitor" at the serialization point: attempt to create the row first. If this
  -- call wins the insert, it is unambiguously the first hit for this hash today. If it loses
  -- (ON CONFLICT DO NOTHING, no row returned), the row already exists — SELECT ... FOR UPDATE
  -- then either waits for a concurrent creator's insert to commit, or reads the existing row,
  -- so two concurrent first hits for the same hash can never both see "new visitor".
  INSERT INTO public.aggregate_visitors AS v
    (site_id, day, visitor_hash, visit_started_at, last_seen_at, referrer_domain, utm_source, utm_medium, utm_campaign, device, goals_hit)
  VALUES (p_site_id, v_day, p_hash, p_now, p_now, v_ref, v_src, v_med, v_cmp, v_dev, '{}')
  ON CONFLICT (site_id, day, visitor_hash) DO NOTHING
  RETURNING * INTO v_row;
  v_found := FOUND;

  IF v_found THEN
    v_new_visitor := true; v_new_visit := true;
  ELSE
    SELECT * INTO v_row FROM public.aggregate_visitors v
      WHERE v.site_id = p_site_id AND v.day = v_day AND v.visitor_hash = p_hash
      FOR UPDATE;

    IF v_row.last_seen_at < p_now - interval '30 minutes' THEN
      v_new_visit := true;
    ELSIF (v_ref <> '' OR v_src <> '')
      AND (v_ref, v_src, v_med, v_cmp) IS DISTINCT FROM (v_row.referrer_domain, v_row.utm_source, v_row.utm_medium, v_row.utm_campaign) THEN
      v_new_visit := true;
    END IF;

    IF v_new_visit THEN
      UPDATE public.aggregate_visitors v SET
        visit_started_at = p_now, last_seen_at = p_now, referrer_domain = v_ref, utm_source = v_src,
        utm_medium = v_med, utm_campaign = v_cmp, device = v_dev, goals_hit = '{}'
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

-- Salts and the visitor map are deleted once their UTC day has ended. Aggregates are kept.
CREATE OR REPLACE FUNCTION public.aggregate_retention(p_now timestamptz DEFAULT now())
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  DELETE FROM public.aggregate_salts WHERE day < (p_now AT TIME ZONE 'UTC')::date;
  DELETE FROM public.aggregate_visitors WHERE day < (p_now AT TIME ZONE 'UTC')::date;
$$;

-- Dashboard read. SECURITY INVOKER: RLS on the daily tables decides what the caller sees, and
-- aggregation happens here so totals are never cut off by the PostgREST row cap.
CREATE OR REPLACE FUNCTION public.get_aggregate_summary(p_site_id uuid, p_from date, p_to date)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'visitors', coalesce((SELECT sum(visitors) FROM public.aggregate_sources_daily
                          WHERE site_id = p_site_id AND day BETWEEN p_from AND p_to), 0),
    'visits', coalesce((SELECT sum(visits) FROM public.aggregate_sources_daily
                        WHERE site_id = p_site_id AND day BETWEEN p_from AND p_to), 0),
    'pageviews', coalesce((SELECT sum(pageviews) FROM public.aggregate_pages_daily
                           WHERE site_id = p_site_id AND day BETWEEN p_from AND p_to), 0),
    'days_with_data', (SELECT count(DISTINCT day) FROM public.aggregate_pages_daily
                       WHERE site_id = p_site_id AND day BETWEEN p_from AND p_to),
    'top_sources', coalesce((SELECT jsonb_agg(s ORDER BY s.visits DESC) FROM (
        SELECT referrer_domain, utm_source, utm_medium, sum(visits)::int AS visits, sum(visitors)::int AS visitors
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

REVOKE ALL ON FUNCTION public.aggregate_daily_salt(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ingest_aggregate_hit(uuid, text, text, text, text, text, text, text, text, text, text, numeric, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.aggregate_retention(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aggregate_daily_salt(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.ingest_aggregate_hit(uuid, text, text, text, text, text, text, text, text, text, text, numeric, timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.aggregate_retention(timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.get_aggregate_summary(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_aggregate_summary(uuid, date, date) TO authenticated;

-- Hourly retention. pg_cron is not available in every environment.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('aggregate-retention', '23 * * * *', 'select public.aggregate_retention()');
  END IF;
END $$;

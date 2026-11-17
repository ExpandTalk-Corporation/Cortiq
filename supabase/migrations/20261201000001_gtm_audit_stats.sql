-- Anonymous usage counters from the public GTM container audit (gtm-audit-stats Edge Function),
-- summed per UTC day. Keys are whitelisted counter names (files, bucket:…, type:…, vendor:…, check:…,
-- migration:…): no names, container IDs, domains, URLs, IP addresses or User-Agents.
-- Service role only (RLS on, no policies). Aggregates only, so no retention job.

CREATE TABLE IF NOT EXISTS public.gtm_audit_stats_daily (
  day   date    NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  key   text    NOT NULL CHECK (key ~ '^[a-z0-9:_.+-]{1,80}$'),
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (day, key)
);

ALTER TABLE public.gtm_audit_stats_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gtm_audit_stats_daily FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.ingest_gtm_audit_stats(p_keys text[], p_counts integer[])
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.gtm_audit_stats_daily (key, count)
  SELECT u.k, least(sum(u.c), 500)::int
  FROM unnest(p_keys[1:200], p_counts[1:200]) AS u(k, c)
  WHERE u.k ~ '^[a-z0-9:_.+-]{1,80}$' AND u.c > 0
  GROUP BY u.k
  ON CONFLICT (day, key) DO UPDATE SET count = public.gtm_audit_stats_daily.count + EXCLUDED.count;
$$;

REVOKE ALL ON FUNCTION public.ingest_gtm_audit_stats(text[], integer[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_gtm_audit_stats(text[], integer[]) TO service_role;

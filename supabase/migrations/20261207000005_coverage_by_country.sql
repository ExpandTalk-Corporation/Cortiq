-- supabase/migrations/20261207000005_coverage_by_country.sql
-- Spec 2026-11-18 phase 6 (thin slice): what the engine decided per country, and how visitors
-- answered the banner per country x banner language. SECURITY INVOKER: RLS on the source tables
-- limits rows to the caller's sites. Daily counts in, daily counts out.

CREATE OR REPLACE FUNCTION public.coverage_by_country(p_site_id uuid, p_from date, p_to date)
RETURNS TABLE(country text, purpose text, decisions bigint, permitted bigint, refused bigint, missing bigint,
              gpc bigint, blocked bigint, enforced_drops bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT d.country, d.purpose,
         sum(d.count)::bigint,
         coalesce(sum(d.count) FILTER (WHERE d.reason = 'allowed'), 0)::bigint,
         coalesce(sum(d.count) FILTER (WHERE d.reason IN ('consent_refused', 'opt_out')), 0)::bigint,
         coalesce(sum(d.count) FILTER (WHERE d.reason = 'consent_missing'), 0)::bigint,
         coalesce(sum(d.count) FILTER (WHERE d.reason = 'gpc'), 0)::bigint,
         coalesce(sum(d.count) FILTER (WHERE d.reason IN ('rule_blocked', 'customer_off')), 0)::bigint,
         coalesce(sum(d.count) FILTER (WHERE d.reason <> 'allowed' AND d.enforced), 0)::bigint
    FROM public.jurisdiction_decisions_daily d
   WHERE d.site_id = p_site_id AND d.day BETWEEN p_from AND p_to
   GROUP BY d.country, d.purpose;
$$;
REVOKE ALL ON FUNCTION public.coverage_by_country(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coverage_by_country(uuid, date, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.consent_acceptance_by_country_lang(p_site_id uuid, p_from date, p_to date)
RETURNS TABLE(country text, banner_lang text, answers bigint, analytics_accepted bigint, marketing_accepted bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT CASE WHEN c.geo_source = 'ip' AND c.geo_country ~ '^[A-Z]{2}$' THEN c.geo_country ELSE '' END AS country,
         coalesce(c.banner_lang, '') AS banner_lang,
         count(*)::bigint,
         count(*) FILTER (WHERE c.consent_types -> 'analytics' = 'true'::jsonb)::bigint,
         count(*) FILTER (WHERE c.consent_types -> 'marketing' = 'true'::jsonb)::bigint
    FROM public.cookie_consents c
   WHERE c.site_id = p_site_id AND c.created_at >= p_from AND c.created_at < p_to + 1
   GROUP BY 1, 2;
$$;
REVOKE ALL ON FUNCTION public.consent_acceptance_by_country_lang(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consent_acceptance_by_country_lang(uuid, date, date) TO authenticated, service_role;

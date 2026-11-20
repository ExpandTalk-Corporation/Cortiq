-- supabase/migrations/20261208000001_jurisdiction_followups.sql
-- Decided 2026-11-20 (brief customer-off-server-log):
-- 1. Purpose `security` is renamed `agent_measurement` (server-side AI agent measurement is statistics, not security).
-- 2. Table grants on jurisdiction_exceptions and jurisdiction_test_sites match their RLS policies
--    (Supabase's default privileges otherwise give anon and authenticated ALL, including TRUNCATE).

-- 1. Purpose rename. Constraints first, so the UPDATEs can write the new value.
ALTER TABLE public.site_jurisdiction_tighten DROP CONSTRAINT IF EXISTS site_jurisdiction_tighten_purpose_check;
ALTER TABLE public.jurisdiction_exceptions DROP CONSTRAINT IF EXISTS jurisdiction_exceptions_purpose_check;
ALTER TABLE public.jurisdiction_decisions_daily DROP CONSTRAINT IF EXISTS jurisdiction_decisions_daily_purpose_check;

-- Tighten: PK (site_id, purpose). A site cannot have both values before this migration (the old CHECK refused
-- agent_measurement), but keep the newer row if it somehow does.
DELETE FROM public.site_jurisdiction_tighten s
 WHERE s.purpose = 'security'
   AND EXISTS (SELECT 1 FROM public.site_jurisdiction_tighten n WHERE n.site_id = s.site_id AND n.purpose = 'agent_measurement');
UPDATE public.site_jurisdiction_tighten SET purpose = 'agent_measurement' WHERE purpose = 'security';

-- No write path exists in phase 3; renamed for completeness.
UPDATE public.jurisdiction_exceptions SET purpose = 'agent_measurement' WHERE purpose = 'security';

-- Daily log: merge counts into an existing agent_measurement row with the same key, then rename the rest.
-- rule_id stays as logged: it records which pack rule decided at the time.
UPDATE public.jurisdiction_decisions_daily n
   SET count = n.count + o.count
  FROM public.jurisdiction_decisions_daily o
 WHERE o.purpose = 'security' AND n.purpose = 'agent_measurement'
   AND n.site_id = o.site_id AND n.day = o.day AND n.fn = o.fn AND n.country = o.country AND n.rule_id = o.rule_id
   AND n.outcome = o.outcome AND n.reason = o.reason AND n.evidence = o.evidence AND n.enforced = o.enforced;
DELETE FROM public.jurisdiction_decisions_daily o
 WHERE o.purpose = 'security'
   AND EXISTS (SELECT 1 FROM public.jurisdiction_decisions_daily n
                WHERE n.purpose = 'agent_measurement'
                  AND n.site_id = o.site_id AND n.day = o.day AND n.fn = o.fn AND n.country = o.country
                  AND n.rule_id = o.rule_id AND n.outcome = o.outcome AND n.reason = o.reason
                  AND n.evidence = o.evidence AND n.enforced = o.enforced);
UPDATE public.jurisdiction_decisions_daily SET purpose = 'agent_measurement' WHERE purpose = 'security';

ALTER TABLE public.site_jurisdiction_tighten ADD CONSTRAINT site_jurisdiction_tighten_purpose_check
  CHECK (purpose IN ('statistics','conversion','attribution','ad_platform_sharing','agent_measurement'));
ALTER TABLE public.jurisdiction_exceptions ADD CONSTRAINT jurisdiction_exceptions_purpose_check
  CHECK (purpose IN ('statistics','conversion','attribution','ad_platform_sharing','agent_measurement'));
ALTER TABLE public.jurisdiction_decisions_daily ADD CONSTRAINT jurisdiction_decisions_daily_purpose_check
  CHECK (purpose IN ('statistics','conversion','attribution','ad_platform_sharing','agent_measurement'));

-- 2. Grants.
-- Owners may only read their exceptions (policy jurisdiction_exceptions_owner_select); no write path in phase 3.
REVOKE ALL ON TABLE public.jurisdiction_exceptions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.jurisdiction_exceptions TO authenticated;
-- Admins manage test sites (policy jurisdiction_test_sites_admin, FOR ALL); anon gets nothing.
REVOKE ALL ON TABLE public.jurisdiction_test_sites FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.jurisdiction_test_sites TO authenticated;

-- supabase/migrations/20261207000002_jurisdiction_decisions.sql
-- Spec 2026-11-18 phase 3: daily counts of every jurisdiction decision (no IP, UA, session, URL or
-- visitor id), and removal of the legacy companies.jurisdiction model (AC1).

CREATE TABLE public.jurisdiction_decisions_daily (
  site_id  uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  day      date NOT NULL,
  fn       text NOT NULL CHECK (fn IN ('aggregate-hit','server-hit','ai-bot-tracker','track-event','visitor-identification',
                                       'record-conversion','store-consent','google-ads-quality-upload')),
  purpose  text NOT NULL CHECK (purpose IN ('statistics','conversion','attribution','ad_platform_sharing','security')),
  country  text NOT NULL DEFAULT '' CHECK (country = '' OR country ~ '^[A-Z]{2}$'),
  rule_id  text NOT NULL CHECK (length(rule_id) BETWEEN 1 AND 200),
  outcome  text NOT NULL CHECK (outcome IN ('allowed','allowed_unless_opt_out','needs_opt_in','blocked')),
  reason   text NOT NULL CHECK (reason IN ('allowed','opt_out','gpc','consent_missing','consent_refused','rule_blocked','customer_off')),
  evidence text NOT NULL CHECK (evidence IN ('ledger','tracker_gate','none')),
  enforced boolean NOT NULL,
  count    integer NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (site_id, day, fn, purpose, country, rule_id, outcome, reason, evidence, enforced)
);
ALTER TABLE public.jurisdiction_decisions_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY jurisdiction_decisions_owner_select ON public.jurisdiction_decisions_daily FOR SELECT TO authenticated
  USING (site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.log_jurisdiction_decision(
  p_site_id uuid, p_fn text, p_purpose text, p_country text, p_rule_id text, p_outcome text, p_reason text,
  p_evidence text, p_enforced boolean, p_count integer DEFAULT 1, p_now timestamptz DEFAULT now())
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_c text := upper(coalesce(trim(p_country), ''));
BEGIN
  IF v_c !~ '^[A-Z]{2}$' OR v_c IN ('XX', 'T1') THEN v_c := ''; END IF;
  INSERT INTO public.jurisdiction_decisions_daily (site_id, day, fn, purpose, country, rule_id, outcome, reason, evidence, enforced, count)
  -- No usable rule = the baseline decided (the common case while nothing is approved); '' would fail the CHECK.
  VALUES (p_site_id, (p_now AT TIME ZONE 'UTC')::date, p_fn, p_purpose, v_c, left(coalesce(nullif(trim(p_rule_id), ''), 'baseline'), 200),
          p_outcome, p_reason, p_evidence, coalesce(p_enforced, false), greatest(coalesce(p_count, 1), 0))
  ON CONFLICT (site_id, day, fn, purpose, country, rule_id, outcome, reason, evidence, enforced)
  DO UPDATE SET count = public.jurisdiction_decisions_daily.count + EXCLUDED.count;
END $$;
REVOKE ALL ON FUNCTION public.log_jurisdiction_decision(uuid, text, text, text, text, text, text, text, boolean, integer, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_jurisdiction_decision(uuid, text, text, text, text, text, text, text, boolean, integer, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.jurisdiction_decisions_retention()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE n integer;
BEGIN
  DELETE FROM public.jurisdiction_decisions_daily WHERE day < (now() AT TIME ZONE 'UTC')::date - 400;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.jurisdiction_decisions_retention() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jurisdiction_decisions_retention() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('jurisdiction-decisions-retention', '50 4 * * *', 'SELECT public.jurisdiction_decisions_retention()');
  END IF;
END $$;

-- AC1: the old account-level model goes. Old values are kept only as history, never as a profile.
INSERT INTO public.site_legal_profile_log (site_id, legacy_jurisdiction, changed_by)
SELECT s.id, c.jurisdiction, NULL FROM public.sites s JOIN public.companies c ON c.id = s.user_id;
DROP FUNCTION IF EXISTS public.effective_pipeline_mode(uuid, text);
ALTER TABLE public.companies DROP COLUMN IF EXISTS auto_eu_geo_override;
ALTER TABLE public.companies DROP COLUMN IF EXISTS jurisdiction;

-- google-ads-quality-upload marks rows the engine refused (enforce mode only).
ALTER TABLE public.conversion_events DROP CONSTRAINT IF EXISTS conversion_events_upload_status_check;
ALTER TABLE public.conversion_events ADD CONSTRAINT conversion_events_upload_status_check CHECK (upload_status IN (
  'not_applicable','pending','uploading','uploaded','skipped_no_consent','skipped_no_gclid','skipped_jurisdiction','failed'));

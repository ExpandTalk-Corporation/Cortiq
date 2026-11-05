-- Append-only log of a site owner confirming that their privacy policy covers what the
-- chosen install (consent setup, tracking mode, marketing) collects. The install guide
-- shows the snippet only after a confirmation that matches the current choice.
-- `checklist` stores the exact items that were shown, so the record proves what was confirmed.

CREATE TABLE IF NOT EXISTS public.policy_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  consent_setup text NOT NULL CHECK (consent_setup IN ('own-cmp', 'cortiq-banner')),
  tracking_mode text NOT NULL CHECK (tracking_mode IN ('cookieless', 'full')),
  marketing boolean NOT NULL DEFAULT false,
  policy_url text,
  checklist_version text NOT NULL,
  checklist jsonb NOT NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT policy_confirmations_marketing_full CHECK (NOT marketing OR tracking_mode = 'full')
);

CREATE INDEX IF NOT EXISTS policy_confirmations_site_idx
  ON public.policy_confirmations (site_id, confirmed_at DESC);

ALTER TABLE public.policy_confirmations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.policy_confirmations FROM anon;
GRANT SELECT, INSERT ON public.policy_confirmations TO authenticated;

DROP POLICY IF EXISTS "Site owners read policy confirmations" ON public.policy_confirmations;
CREATE POLICY "Site owners read policy confirmations" ON public.policy_confirmations
  FOR SELECT USING (site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid()));

-- Insert only as yourself, for your own site. No UPDATE or DELETE policy: the log is append-only.
DROP POLICY IF EXISTS "Site owners log policy confirmations" ON public.policy_confirmations;
CREATE POLICY "Site owners log policy confirmations" ON public.policy_confirmations
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid())
  );

COMMENT ON TABLE public.policy_confirmations IS
  'Append-only: site owner confirmed their privacy policy covers the chosen install (setup, tracking mode, marketing). checklist = the exact items shown.';

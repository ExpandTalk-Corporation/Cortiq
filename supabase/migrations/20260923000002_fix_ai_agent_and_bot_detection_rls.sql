-- Fix three broken RLS policies found in the 2026-09-23 security sweep.
--
-- ai_agent_sessions / ai_agent_journey_steps: the policies named "Service role full
-- access" were created for role PUBLIC with USING (true) / WITH CHECK (true), so anyone
-- with the public anon key could read, insert, update and delete every row. The
-- service role bypasses RLS and needs no policy; the dashboard reads as the site owner.
--
-- bot_detections: the SELECT policy compared bot_detections.company_id with itself
-- (outer column inside the subquery), so every logged-in user who belonged to any
-- organization could read all companies' rows. The INSERT policy allowed anon writes;
-- inserts come from Edge Functions (_shared/bot-detection.ts) with the service role.
-- company_id holds either the owning user's id or a site id, so accept both.

-- ── ai_agent_sessions ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Service role full access to ai_agent_sessions" ON public.ai_agent_sessions;

CREATE POLICY "owner_select_ai_agent_sessions" ON public.ai_agent_sessions
  FOR SELECT TO authenticated
  USING (site_id IN (SELECT id FROM public.sites WHERE user_id = (SELECT auth.uid())));

-- ── ai_agent_journey_steps ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Service role full access to ai_agent_journey_steps" ON public.ai_agent_journey_steps;

CREATE POLICY "owner_select_ai_agent_journey_steps" ON public.ai_agent_journey_steps
  FOR SELECT TO authenticated
  USING (session_id IN (
    SELECT s.id FROM public.ai_agent_sessions s
    JOIN public.sites st ON st.id = s.site_id
    WHERE st.user_id = (SELECT auth.uid())
  ));

-- ── bot_detections ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "bot_detections_select" ON public.bot_detections;
DROP POLICY IF EXISTS "bot_detections_service_insert" ON public.bot_detections;

CREATE POLICY "owner_select_bot_detections" ON public.bot_detections
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT auth.uid())
    OR company_id IN (SELECT id FROM public.sites WHERE user_id = (SELECT auth.uid()))
  );

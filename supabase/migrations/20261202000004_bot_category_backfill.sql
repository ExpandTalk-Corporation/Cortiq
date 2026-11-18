-- supabase/migrations/20261202000004_bot_category_backfill.sql
-- Spec 2026-11-18 phase 1 AC7. ai_bot_traffic.bot_category (20260327000000) was never written, so
-- every row says 'other'. New rows get it from the registry (storedBotCategory). Old rows: the
-- three writers stored the registry category in request_type, so copy it where it is one of the
-- three registry categories. 'unknown' and NULL stay 'other'.
--
-- BUT request_type alone is not sufficient: ai-bot-tracker's historical fallback (no registry
-- match) could still land on request_type 'citation' (citationData present) or 'agentic'
-- (probeData.jsExecuted && isVisual) for a bot the registry does NOT recognise — see
-- classifyBot/storedBotCategory in supabase/functions/_shared/ai-bot-registry.ts and the
-- requestType fallback in ai-bot-tracker/index.ts. Those rows must stay 'other', same as
-- storedBotCategory would give them today. The registry never assigns bot_type 'other' (that
-- value, with bot_name 'Other Bot'/'Unknown Bot', is exclusively the non-registry fallback used
-- by every writer), so bot_type <> 'other' is the precise, stored-column predicate that selects
-- only rows that came from an actual registry match.
UPDATE public.ai_bot_traffic
   SET bot_category = request_type
 WHERE request_type IN ('training', 'agentic', 'citation')
   AND bot_type <> 'other'
   AND bot_category IS DISTINCT FROM request_type;

COMMENT ON COLUMN public.ai_bot_traffic.bot_category IS
  'training | agentic | citation (from the AI bot registry) | other (not in the registry)';

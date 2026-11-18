-- supabase/migrations/20261202000004_bot_category_backfill.sql
-- Spec 2026-11-18 phase 1 AC7. ai_bot_traffic.bot_category (20260327000000) was never written, so
-- every row says 'other'. New rows get it from the registry (storedBotCategory). Old rows: the
-- three writers stored the registry category in request_type, so copy it where it is one of the
-- three registry categories. 'unknown' and NULL stay 'other'.
UPDATE public.ai_bot_traffic
   SET bot_category = request_type
 WHERE request_type IN ('training', 'agentic', 'citation')
   AND bot_category IS DISTINCT FROM request_type;

COMMENT ON COLUMN public.ai_bot_traffic.bot_category IS
  'training | agentic | citation (from the AI bot registry) | other (not in the registry)';

-- Tag each ai_bot_traffic row with the ingestion path that captured it, so the
-- dashboard can attribute (and, later, filter) server-side vs JS-tag detection.
--
--   'js_tag'     = the in-page JS tracker (ai-bot-tracker). The default, and every
--                  historical row.
--   'server_log' = server-side capture (cloudflare-ingest, fed by the Cloudflare
--                  Worker in public/cloudflare-worker.js). This path sees the training
--                  and citation crawlers that never execute JavaScript and are therefore
--                  invisible to the JS tag.
--
-- Additive and backfill-free: the DEFAULT stamps every existing row as 'js_tag'.
-- get_ai_bot_tracking() is source-agnostic, so server_log rows flow into the AI Bot
-- Classification dashboard with no RPC change. Idempotent guards keep this safe against
-- the known remote/local migration drift on this project.

ALTER TABLE public.ai_bot_traffic
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'js_tag';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_bot_traffic_source_check'
  ) THEN
    ALTER TABLE public.ai_bot_traffic
      ADD CONSTRAINT ai_bot_traffic_source_check
      CHECK (source IN ('js_tag', 'server_log'));
  END IF;
END$$;

-- Supports the dashboard's per-source slicing without scanning the whole table.
CREATE INDEX IF NOT EXISTS ai_bot_traffic_site_source_detected_idx
  ON public.ai_bot_traffic (site_id, source, detected_at DESC);

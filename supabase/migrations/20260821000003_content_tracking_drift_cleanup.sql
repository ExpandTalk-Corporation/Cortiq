-- Content-tracking schema drift — neutralize the landmines, document the source of truth.
--
-- Background: content_interactions & content_performance are each defined twice with
-- CREATE TABLE IF NOT EXISTS — v1 (20260209110000) and v2 (20260209160000). Because
-- IF NOT EXISTS runs oldest-first, v1 wins and v2's table bodies are silent no-ops.
-- form_field_analytics is defined THREE times; the 2025 shape (20250719051110) wins.
--
-- Verified source-of-truth (consumer audit 2026-08-21):
--   * content_interactions  → LIVE shape = v1; table is effectively DEAD (its only writer,
--                             the content-tracking edge function, is unreachable — no client
--                             invokes it, and src/lib/contentTracking.ts is never imported).
--   * content_performance   → LIVE shape = v1; sole live reader ContentPerformance.tsx expects
--                             v1 and runs fine (returns empty, as nothing populates it).
--   * form_field_analytics  → LIVE shape = the 2025 schema (form_id/field_position/…),
--                             matched by its live reader useFormAnalytics.tsx.
--
-- We deliberately do NOT reshape the live tables: forcing the v2 shape would break the live
-- v1 reader. Deciding whether to build out or delete the dead v2 content-tracking stack is a
-- product decision, tracked separately.
--
-- What this migration DOES fix: the two v2 aggregate functions below reference v2 columns
-- (interaction_timestamp, element_id, view_duration, form_name, field_order, …) that do NOT
-- exist on the live v1/2025 tables. They are never scheduled today, but anyone who later
-- wires them to pg_cron gets a hard `column does not exist` failure. They are broken dead
-- code — drop them so they can't become a trap. (The v1 update_content_performance is valid
-- against the live v1 schema, so it is left in place.)

DROP FUNCTION IF EXISTS public.aggregate_content_performance(date);
DROP FUNCTION IF EXISTS public.aggregate_form_field_analytics(date);

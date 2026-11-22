-- Step C of docs/runbooks/ai-citations-retirement.md. ai_citations held human AI-referral visits logged by
-- trackAICitation (removed in 5.5.23). Nothing reads or writes it since 20261212000001 and the ai-bot-tracker
-- deploy; step B (2026-11-22) archived its 66 rows to ai_citations_archive_20261212 and emptied it.
-- Verified in production before this migration: 0 rows, no functions, views or foreign keys reference it.
DROP TABLE IF EXISTS public.ai_citations;

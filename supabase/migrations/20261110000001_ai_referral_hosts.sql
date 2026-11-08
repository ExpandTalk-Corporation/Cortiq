-- supabase/migrations/20261110000001_ai_referral_hosts.sql
-- Align the built-in 'ai' segment with the tracker's AI_REFERRER list (public/spa-tracking.js):
-- add copilot.microsoft.com, you.com and phind.com hosts, and openai / copilot / phind utm_source
-- prefixes. The function body is otherwise unchanged from 20261109000003_builtin_segments.sql.
CREATE OR REPLACE FUNCTION public.builtin_segment_match(
  p_key text, p_device text, p_referrer text, p_utm_source text, p_utm_medium text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  WITH v AS (
    SELECT lower(split_part(regexp_replace(coalesce(p_referrer, ''), '^[a-zA-Z-]+://', ''), '/', 1)) AS host,
           coalesce(p_referrer, '')                       AS ref,
           lower(coalesce(p_utm_source, ''))              AS src,
           lower(coalesce(p_utm_medium, ''))              AS med
  ), c AS (
    SELECT v.*,
      v.med IN ('cpc', 'ppc', 'paid-social', 'display', 'paid') AS is_paid,
      (v.host ~ '(^|\.)(chat\.openai\.com|chatgpt\.com|perplexity\.ai|claude\.ai|gemini\.google\.com|bard\.google\.com|copilot\.microsoft\.com|you\.com|phind\.com)$'
        OR v.src ~ '^(chatgpt|openai|perplexity|claude|gemini|bard|copilot|phind)') AS is_ai
    FROM v
  )
  SELECT CASE p_key
    WHEN 'mobile'  THEN p_device = 'mobile'
    WHEN 'desktop' THEN p_device = 'desktop'
    WHEN 'tablet'  THEN p_device = 'tablet'
    WHEN 'paid'    THEN c.is_paid
    WHEN 'ai'      THEN c.is_ai
    WHEN 'social'  THEN (
      c.ref ILIKE '%facebook%'  OR c.ref ILIKE '%instagram%' OR
      c.ref ILIKE '%linkedin%'  OR c.ref ILIKE '%twitter%'   OR
      c.ref ILIKE '%tiktok%'    OR c.ref ILIKE '%youtube%'   OR
      c.ref ILIKE '%pinterest%' OR c.ref ILIKE '%reddit%'    OR
      c.ref ILIKE '%lnkd.in%'   OR c.ref ILIKE '%t.co/%'     OR
      c.ref ILIKE '%x.com%'     OR c.ref ILIKE '%youtu.be%'  OR
      c.ref ILIKE '%fb.com%'    OR c.ref ILIKE '%redd.it%'   OR
      c.ref ILIKE '%pin.it%'    OR
      c.src ILIKE '%facebook%'  OR c.src ILIKE '%instagram%' OR
      c.src ILIKE '%linkedin%'  OR c.src ILIKE '%twitter%'   OR
      c.src ILIKE '%tiktok%'    OR c.src ILIKE '%youtube%'   OR
      c.src ILIKE '%pinterest%' OR c.src ILIKE '%reddit%'    OR
      c.src ILIKE '%fb'         OR c.src ILIKE '%ig'         OR
      c.src = 'x')
    WHEN 'organic' THEN NOT c.is_paid AND NOT c.is_ai AND c.host NOT LIKE 'mail.%'
      AND c.host ~ '(^|\.)(google|bing|duckduckgo|ecosia|yandex|baidu|qwant|startpage|brave)\.|(^|\.)search\.yahoo\.'
    WHEN 'direct'  THEN c.ref = '' AND c.src = '' AND c.med = ''
    ELSE false END
  FROM c
$$;

GRANT EXECUTE ON FUNCTION public.builtin_segment_match(text, text, text, text, text) TO authenticated;

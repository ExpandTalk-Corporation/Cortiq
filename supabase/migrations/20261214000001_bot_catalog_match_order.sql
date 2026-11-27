-- bot_catalog is generated from the agent ontology (supabase/functions/_shared/agent-ontology.ts,
-- scripts/gen-ontology-sql.mjs). Substring patterns overlap ("MistralAI" also matches
-- "MistralAI-User"), so the UA layer needs the ontology's most-specific-first order instead of
-- created_at. The generated *_ontology_sync.sql migrations fill match_order.

ALTER TABLE public.bot_catalog ADD COLUMN IF NOT EXISTS match_order integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.bot_catalog.match_order IS
  'UA match order from the agent ontology: lowest first. Generated — do not edit by hand.';

CREATE OR REPLACE FUNCTION public.match_bot(
  p_user_agent TEXT DEFAULT NULL,
  p_ip         TEXT DEFAULT NULL
)
RETURNS TABLE(
  bot_catalog_id   UUID,
  bot_name         TEXT,
  bot_display_name TEXT,
  bot_category     TEXT,
  detection_method TEXT,
  confidence       NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ip inet;
BEGIN
  -- Layer 1: UA pattern matching (highest confidence, cheapest)
  IF p_user_agent IS NOT NULL AND trim(p_user_agent) <> '' THEN
    RETURN QUERY
    SELECT
      bc.id,
      bc.name,
      bc.display_name,
      bc.category,
      'ua_match'::TEXT,
      1.0::NUMERIC
    FROM public.bot_catalog bc
    WHERE bc.is_active = true
      AND array_length(bc.ua_patterns, 1) > 0
      AND EXISTS (
        SELECT 1 FROM unnest(bc.ua_patterns) AS pat
        WHERE lower(p_user_agent) LIKE '%' || lower(pat) || '%'
      )
    ORDER BY bc.match_order, bc.created_at
    LIMIT 1;

    IF FOUND THEN RETURN; END IF;
  END IF;

  -- Layer 2: IP range / reputation matching
  IF p_ip IS NOT NULL AND trim(p_ip) <> '' THEN
    BEGIN
      v_ip := split_part(trim(p_ip), ',', 1)::inet;
    EXCEPTION WHEN OTHERS THEN
      -- Invalid IP — skip silently
      RETURN;
    END;

    RETURN QUERY
    SELECT
      bc.id,
      bc.name,
      bc.display_name,
      bc.category,
      'ip_match'::TEXT,
      0.85::NUMERIC
    FROM public.bot_catalog bc
    WHERE bc.is_active = true
      AND array_length(bc.ip_ranges, 1) > 0
      AND EXISTS (
        SELECT 1 FROM unnest(bc.ip_ranges) AS rng
        WHERE v_ip <<= rng::cidr
      )
    ORDER BY bc.match_order, bc.created_at
    LIMIT 1;
  END IF;
END;
$$;

-- supabase/migrations/20261210000001_reported_channel.sql
-- Attribution layer 1.5: self-reported source ("how did you hear about us?").
-- Spec: docs/superpowers/specs/2026-11-12-attribution-models-and-ai-influence.md (jurist review
-- 2026-11-20). Plan: docs/superpowers/plans/2026-11-20-attribution-layer-1-5.md.
--
-- - conversion_reported_channel: one category per conversion from a fixed list (no free text, no raw
--   answer), in its own table so no dashboard role can read it row by row: RLS on, no policy, no
--   grants to anon/authenticated. Written only by the SECURITY DEFINER functions below, read only by
--   get_reported_channel. Deleted with its conversion (ON DELETE CASCADE, so run_data_retention()
--   and erasure cover it). The list is kept equal to supabase/functions/_shared/reported-channel.ts
--   by a foundation test.
-- - Two capture paths, both off until the site sets reported_channel_policy_version:
--     HubSpot: a contact property, mapped in hubspot-lead-webhook, written by
--       apply_reported_channel_hubspot onto marketing-consented rows (hashed email match).
--     Form: a select/radio field, mapped in the browser, written by record_conversion_event (goal
--       hits) or attach_reported_channel (record-conversion) when the session has analytics consent.
--   Either way the session's latest consent row must carry that policy_version and be newer than
--   sites.reported_channel_enabled_at (set by a trigger), so only visitors who saw the updated
--   banner text count. Fails closed.
-- - Read only in aggregate: get_reported_channel (SECURITY DEFINER, explicit owner check, small
--   counts suppressed). The value never leaves CortIQ (Google Ads upload, GA4, AI insights): test-enforced.

-- ---------------------------------------------------------------------------------------------
-- Category list and value-list validation
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_reported_channel(p text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT coalesce(p IN ('organic_search', 'paid_search', 'paid_social', 'social', 'email', 'referral', 'direct',
                        'ai_assistant', 'podcast', 'community', 'event', 'colleague_or_friend', 'other'), false)
$$;

-- A site's answer → category list: a JSON object, at most 50 entries, keys 1-100 characters,
-- every value a known category.
CREATE OR REPLACE FUNCTION public.is_valid_reported_channel_map(p jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE WHEN p IS NULL OR jsonb_typeof(p) <> 'object' THEN false ELSE
    (SELECT count(*) FROM jsonb_object_keys(p)) <= 50
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_each(p) e
      WHERE length(btrim(e.key)) NOT BETWEEN 1 AND 100
         OR jsonb_typeof(e.value) <> 'string'
         OR NOT public.is_reported_channel(e.value #>> '{}')
    ) END
$$;

-- A new table (no existing rows), so its CHECK needs no NOT VALID / VALIDATE step.
CREATE TABLE IF NOT EXISTS public.conversion_reported_channel (
  conversion_id uuid PRIMARY KEY REFERENCES public.conversion_events(id) ON DELETE CASCADE,
  site_id       uuid NOT NULL,
  channel       text NOT NULL CHECK (public.is_reported_channel(channel)),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conversion_reported_channel_site_idx ON public.conversion_reported_channel (site_id);
COMMENT ON TABLE public.conversion_reported_channel IS
  'Self-reported source category (fixed list) per conversion. No read policy: aggregate display through get_reported_channel only; never exported to Google Ads, GA4 or an LLM.';

ALTER TABLE public.conversion_reported_channel ENABLE ROW LEVEL SECURITY;
-- Deliberately no policy: anon and authenticated can neither read nor write rows.
REVOKE ALL ON public.conversion_reported_channel FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.conversion_reported_channel TO service_role;

ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS reported_channel_policy_version text,
  ADD COLUMN IF NOT EXISTS reported_channel_hubspot_property text,
  ADD COLUMN IF NOT EXISTS reported_channel_hubspot_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS reported_channel_form_field text,
  ADD COLUMN IF NOT EXISTS reported_channel_form_map jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.sites DROP CONSTRAINT IF EXISTS sites_reported_channel_config_check;
ALTER TABLE public.sites
  ADD CONSTRAINT sites_reported_channel_config_check CHECK (
    public.is_valid_reported_channel_map(reported_channel_hubspot_map)
    AND public.is_valid_reported_channel_map(reported_channel_form_map)
    AND (reported_channel_policy_version IS NULL OR length(reported_channel_policy_version) BETWEEN 1 AND 20)
    AND (reported_channel_hubspot_property IS NULL OR reported_channel_hubspot_property ~ '^[A-Za-z0-9_]{1,100}$')
    -- A form field NAME only (select or radio group), never a CSS selector.
    AND (reported_channel_form_field IS NULL OR reported_channel_form_field ~ '^[A-Za-z0-9_.:\[\]-]{1,100}$')
  );

-- When a capture path was last switched on, or the policy version changed. Set only by the trigger
-- below (the dashboard cannot write it): consents given before this moment never qualify, so a
-- policy version that was already in effect before the notice text was added cannot be reused.
ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS reported_channel_enabled_at timestamptz;

CREATE OR REPLACE FUNCTION public.sites_reported_channel_enabled_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_form_on boolean := NEW.reported_channel_policy_version IS NOT NULL AND NEW.reported_channel_form_field IS NOT NULL;
  v_hub_on  boolean := NEW.reported_channel_policy_version IS NOT NULL AND NEW.reported_channel_hubspot_property IS NOT NULL;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.reported_channel_enabled_at := CASE WHEN v_form_on OR v_hub_on THEN now() END;
    RETURN NEW;
  END IF;
  -- Never taken from the client: keep the stored value unless a path goes off → on or the version changes.
  NEW.reported_channel_enabled_at := OLD.reported_channel_enabled_at;
  IF (v_form_on AND NOT (OLD.reported_channel_policy_version IS NOT NULL AND OLD.reported_channel_form_field IS NOT NULL))
     OR (v_hub_on AND NOT (OLD.reported_channel_policy_version IS NOT NULL AND OLD.reported_channel_hubspot_property IS NOT NULL))
     OR ((v_form_on OR v_hub_on) AND NEW.reported_channel_policy_version IS DISTINCT FROM OLD.reported_channel_policy_version) THEN
    NEW.reported_channel_enabled_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sites_reported_channel_enabled_at ON public.sites;
CREATE TRIGGER sites_reported_channel_enabled_at
  BEFORE INSERT OR UPDATE ON public.sites
  FOR EACH ROW EXECUTE FUNCTION public.sites_reported_channel_enabled_at();

-- ---------------------------------------------------------------------------------------------
-- Consent gate: the session's latest consent row (picked BEFORE any filter, so a withdrawal is
-- never skipped) is given, not expired, grants the purpose and carries the policy version the
-- site set when it enabled self-reported source, and was given (or last changed) after the path was
-- switched on (reported_channel_enabled_at; NULL fails closed). Cookieless sites never qualify.
--   p_path 'form'    → analytics purpose, form field configured
--   p_path 'hubspot' → marketing purpose, HubSpot property configured
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reported_channel_consent_ok(p_site_id uuid, p_session text, p_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce((
    SELECT s.reported_channel_policy_version IS NOT NULL
       AND s.tracking_mode IS DISTINCT FROM 'cookieless'
       AND CASE p_path
             WHEN 'form' THEN s.reported_channel_form_field IS NOT NULL
             WHEN 'hubspot' THEN s.reported_channel_hubspot_property IS NOT NULL
             ELSE false
           END
       AND c.consent_given IS TRUE
       AND c.expires_at > now()
       AND c.consent_types -> CASE p_path WHEN 'hubspot' THEN 'marketing' ELSE 'analytics' END = 'true'::jsonb
       AND c.policy_version = s.reported_channel_policy_version
       AND s.reported_channel_enabled_at IS NOT NULL
       AND coalesce(c.updated_at, c.created_at) >= s.reported_channel_enabled_at
    FROM public.sites s
    CROSS JOIN LATERAL (
      SELECT cc.consent_given, cc.consent_types, cc.expires_at, cc.policy_version, cc.updated_at, cc.created_at
      FROM public.cookie_consents cc
      WHERE cc.site_id = s.id AND cc.session_id = p_session
      ORDER BY cc.updated_at DESC NULLS LAST, cc.created_at DESC NULLS LAST
      LIMIT 1
    ) c
    WHERE s.id = p_site_id AND coalesce(p_session, '') <> ''
  ), false)
$$;

REVOKE EXECUTE ON FUNCTION public.reported_channel_consent_ok(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.reported_channel_consent_ok(uuid, text, text) TO service_role;

-- ---------------------------------------------------------------------------------------------
-- Form path, goal hits: record_conversion_event takes the browser-mapped category. Dropped and
-- recreated (a second overload would make the 6-argument named call ambiguous); the old call
-- still resolves through the DEFAULT, so track-event keeps working between db push and deploy.
-- ---------------------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.record_conversion_event(uuid, text, text, text, text, numeric);

CREATE OR REPLACE FUNCTION public.record_conversion_event(
  p_site_id          uuid,
  p_session          text,          -- the tracker's session token (tracking_sessions.session_id)
  p_event_name       text,
  p_event_type       text,
  p_selector         text,
  p_value            numeric,
  p_reported_channel text DEFAULT NULL  -- a category from the fixed list, mapped in the browser
)
RETURNS boolean                 -- true when a row was inserted
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_sess uuid;
  v_name text := left(nullif(trim(p_event_name), ''), 200);
  v_channel text;
  v_id uuid;
BEGIN
  IF p_site_id IS NULL OR v_name IS NULL THEN RETURN false; END IF;

  IF coalesce(p_session, '') <> '' THEN
    SELECT id INTO v_sess FROM public.tracking_sessions
      WHERE site_id = p_site_id AND session_id = p_session
      ORDER BY started_at DESC LIMIT 1;
  END IF;

  -- A goal counts once per session (repeat clicks or reloads are not extra conversions).
  IF v_sess IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.conversion_events
    WHERE site_id = p_site_id AND session_id = v_sess AND event_name = v_name
  ) THEN
    RETURN false;
  END IF;

  -- Self-reported source: only a known category, only from a session that consented to analytics
  -- under the site's self-reported-source policy version. Anything else is dropped silently.
  IF public.is_reported_channel(p_reported_channel)
     AND public.reported_channel_consent_ok(p_site_id, p_session, 'form') THEN
    v_channel := p_reported_channel;
  END IF;

  INSERT INTO public.conversion_events (site_id, session_id, event_type, event_name, event_value, element_selector)
  VALUES (p_site_id, v_sess, left(coalesce(nullif(p_event_type, ''), 'conversion'), 50), v_name,
          CASE WHEN p_value IS NOT NULL AND p_value >= 0 AND p_value < 1e9 THEN p_value END,
          left(nullif(p_selector, ''), 500))
  RETURNING id INTO v_id;
  IF v_channel IS NOT NULL THEN
    INSERT INTO public.conversion_reported_channel (conversion_id, site_id, channel) VALUES (v_id, p_site_id, v_channel);
  END IF;
  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_conversion_event(uuid, text, text, text, text, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.record_conversion_event(uuid, text, text, text, text, numeric, text) TO service_role;

-- ---------------------------------------------------------------------------------------------
-- Form path, data-wfa-conversion forms: record-conversion inserts the conversion itself (service
-- role) and then attaches the browser-mapped category here, under the same consent gate. Only to a
-- conversion of this site that has no answer yet. Returns true when stored.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.attach_reported_channel(p_site_id uuid, p_conversion_id uuid, p_session text, p_category text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_site_id IS NULL OR p_conversion_id IS NULL OR NOT public.is_reported_channel(p_category)
     OR NOT public.reported_channel_consent_ok(p_site_id, p_session, 'form') THEN
    RETURN false;
  END IF;
  INSERT INTO public.conversion_reported_channel (conversion_id, site_id, channel)
  SELECT ce.id, ce.site_id, p_category
  FROM public.conversion_events ce
  WHERE ce.id = p_conversion_id AND ce.site_id = p_site_id
  ON CONFLICT (conversion_id) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count = 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.attach_reported_channel(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.attach_reported_channel(uuid, uuid, text, text) TO service_role;

-- ---------------------------------------------------------------------------------------------
-- HubSpot path: the webhook maps the property value in memory and passes only the category.
-- Own code path: matches marketing-consented conversions by hashed email that have no answer yet,
-- whose session consented to marketing under the policy version, and adds a category row. Never
-- touches conversion_events (upload_status, quality columns). Returns the rows added (0 = dropped).
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_reported_channel_hubspot(p_site_id uuid, p_hashed_email text, p_category text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_site_id IS NULL OR p_hashed_email !~ '^[a-f0-9]{64}$' OR NOT public.is_reported_channel(p_category) THEN
    RETURN 0;
  END IF;

  INSERT INTO public.conversion_reported_channel (conversion_id, site_id, channel)
  SELECT ce.id, ce.site_id, p_category
  FROM public.conversion_events ce
  WHERE ce.site_id = p_site_id
    AND ce.hashed_email = p_hashed_email
    AND ce.click_id_consent_given IS TRUE
    AND NOT EXISTS (SELECT 1 FROM public.conversion_reported_channel r WHERE r.conversion_id = ce.id)
    AND public.reported_channel_consent_ok(p_site_id, ce.form_data ->> 'tracking_session_id', 'hubspot')
  ON CONFLICT (conversion_id) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_reported_channel_hubspot(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.apply_reported_channel_hubspot(uuid, text, text) TO service_role;

-- ---------------------------------------------------------------------------------------------
-- Observed channel of a visit, in the same codes as the reported list (subset).
-- AI assistant first (its own channel), then paid, email, social, search, other referrers, direct.
-- A referrer on the site's own host (or a subdomain of it) is ignored: an internal hop is not a
-- source, so without UTM tags the visit is direct. Paid search only for search-ad mediums
-- (cpc, ppc, paid, paid_search, sem); display/banner/cpm/cpv have no category of their own -> other.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.observed_channel(p_referrer text, p_utm_source text, p_utm_medium text,
                                                   p_site_host text DEFAULT NULL)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  WITH raw AS (
    SELECT regexp_replace(lower(substring(btrim(coalesce(p_referrer, '')) from '^[a-zA-Z]+://([^/:?#]+)')), '^www\.', '') AS host,
           regexp_replace(split_part(split_part(regexp_replace(lower(btrim(coalesce(p_site_host, ''))), '^[a-z]+://', ''),
                                                '/', 1), ':', 1), '^www\.', '') AS own,
           lower(btrim(coalesce(p_utm_source, ''))) AS src,
           lower(btrim(coalesce(p_utm_medium, ''))) AS med
  ),
  n AS (
    SELECT CASE WHEN own <> '' AND (host = own OR right(host, length(own) + 1) = '.' || own) THEN NULL ELSE host END AS host,
           src, med
    FROM raw
  )
  SELECT CASE
    WHEN public.is_ai_assistant_referral(host, nullif(src, '')) THEN 'ai_assistant'
    WHEN public.is_paid_social_medium(med)
         AND (public.social_network(host, nullif(src, '')) IS NOT NULL
              OR med IN ('paid-social', 'paid_social', 'paidsocial', 'social-paid', 'social_paid')) THEN 'paid_social'
    WHEN med IN ('cpc', 'ppc', 'paid', 'paid_search', 'paid-search', 'paidsearch', 'sem') THEN 'paid_search'
    WHEN med IN ('display', 'banner', 'cpm', 'cpv') THEN 'other'
    WHEN med IN ('email', 'e-mail', 'e_mail', 'newsletter') OR src IN ('newsletter', 'email') THEN 'email'
    WHEN public.social_network(host, nullif(src, '')) IS NOT NULL OR public.is_social_medium(med) THEN 'social'
    WHEN med = 'organic'
      OR host ~ '(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|yahoo\.[a-z.]+|ecosia\.org|yandex\.[a-z.]+|baidu\.com|startpage\.com|qwant\.com|search\.brave\.com)$'
      THEN 'organic_search'
    WHEN coalesce(host, '') <> '' OR src <> '' THEN 'referral'
    ELSE 'direct'
  END
  FROM n
$$;

-- ---------------------------------------------------------------------------------------------
-- Aggregate read for the dashboard. SECURITY DEFINER (the category table has no read policy) with an
-- explicit owner check on auth.uid(); never granted to anon.
-- Every count is returned as {n, lt5}: 1-4 become {n: null, lt5: true} ("fewer than 5").
-- No row-level output: never a session, visitor, hash or conversion id.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reported_channel_count(p bigint)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE WHEN p BETWEEN 1 AND 4 THEN jsonb_build_object('n', NULL, 'lt5', true)
              ELSE jsonb_build_object('n', coalesce(p, 0), 'lt5', false) END
$$;

CREATE OR REPLACE FUNCTION public.get_reported_channel(p_site_id uuid, p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sites WHERE id = p_site_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 366 THEN
    RAISE EXCEPTION 'invalid range' USING ERRCODE = '22023';
  END IF;

  WITH conv AS (
    SELECT r.channel AS reported,
           CASE WHEN t.id IS NULL THEN 'unknown'
                ELSE public.observed_channel(coalesce(nullif(t.referrer, ''), t.referrer_url), t.utm_source, t.utm_medium,
                                             (SELECT domain FROM public.sites WHERE id = p_site_id)) END AS observed
    FROM public.conversion_events ce
    LEFT JOIN public.conversion_reported_channel r ON r.conversion_id = ce.id
    LEFT JOIN public.tracking_sessions t ON t.id = ce.session_id AND t.site_id = ce.site_id
    WHERE ce.site_id = p_site_id
      AND ce.created_at >= p_from AND ce.created_at < p_to + 1
  ),
  cells AS (
    SELECT reported, observed, count(*) AS n FROM conv WHERE reported IS NOT NULL GROUP BY 1, 2
  ),
  rep AS (
    SELECT reported, count(*) AS n FROM conv WHERE reported IS NOT NULL GROUP BY 1
  )
  SELECT jsonb_build_object(
    'conversions', public.reported_channel_count((SELECT count(*) FROM conv)),
    'answered', public.reported_channel_count((SELECT count(*) FROM conv WHERE reported IS NOT NULL)),
    'matched', public.reported_channel_count((SELECT count(*) FROM conv WHERE reported IS NOT NULL AND reported = observed)),
    'reported', coalesce((SELECT jsonb_agg(jsonb_build_object('channel', reported) || public.reported_channel_count(n)
                                           ORDER BY n DESC, reported) FROM rep), '[]'::jsonb),
    'cells', coalesce((SELECT jsonb_agg(jsonb_build_object('reported', reported, 'observed', observed)
                                        || public.reported_channel_count(n)
                                        ORDER BY n DESC, reported, observed) FROM cells), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_reported_channel(uuid, date, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_reported_channel(uuid, date, date) TO authenticated;

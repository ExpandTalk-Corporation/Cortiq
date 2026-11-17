-- CSP violation reports from cortiq.se (csp-report Edge Function), counted per UTC day.
-- Holds page paths, directives and blocked origins only: no query strings, script samples,
-- IP addresses or User-Agents. Service role only (RLS on, no policies). Kept 90 days.

CREATE TABLE IF NOT EXISTS public.csp_reports (
  day           date        NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  document_path text        NOT NULL,
  directive     text        NOT NULL,
  blocked       text        NOT NULL DEFAULT '',
  source        text        NOT NULL DEFAULT '',
  disposition   text        NOT NULL CHECK (disposition IN ('enforce', 'report')),
  count         integer     NOT NULL DEFAULT 1,
  first_seen    timestamptz NOT NULL DEFAULT now(),
  last_seen     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, document_path, directive, blocked, source, disposition)
);

ALTER TABLE public.csp_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.csp_reports FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.ingest_csp_report(
  p_document_path text,
  p_directive     text,
  p_blocked       text,
  p_source        text,
  p_disposition   text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.csp_reports (document_path, directive, blocked, source, disposition)
  VALUES (left(p_document_path, 512), left(p_directive, 40), left(coalesce(p_blocked, ''), 300),
          left(coalesce(p_source, ''), 300), CASE WHEN p_disposition = 'report' THEN 'report' ELSE 'enforce' END)
  ON CONFLICT (day, document_path, directive, blocked, source, disposition)
  DO UPDATE SET count = public.csp_reports.count + 1, last_seen = now();
$$;

REVOKE ALL ON FUNCTION public.ingest_csp_report(text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_csp_report(text, text, text, text, text) TO service_role;

-- Daily at 03:23 UTC. Needs pg_cron (not in every environment).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'csp-reports-retention',
      '23 3 * * *',
      $job$DELETE FROM public.csp_reports WHERE day < (now() AT TIME ZONE 'utc')::date - 90$job$
    );
  END IF;
END $$;

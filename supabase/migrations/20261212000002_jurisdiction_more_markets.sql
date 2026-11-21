-- Five more named markets in the jurisdiction engine (types.ts MARKETS): Mexico, Argentina, Chile, Colombia,
-- South Africa. No rules are written for them yet, so they get the same rules as 'other' (baseline opt-in).
-- The inline CHECK from 20261207000001 got the default name site_legal_profiles_markets_check.
ALTER TABLE public.site_legal_profiles DROP CONSTRAINT IF EXISTS site_legal_profiles_markets_check;
ALTER TABLE public.site_legal_profiles ADD CONSTRAINT site_legal_profiles_markets_check
  CHECK (markets <@ ARRAY['eu','uk','ch','us_ca','us_other','ca_qc','ca_other','br','mx','ar','cl','co','za','other']::text[]);

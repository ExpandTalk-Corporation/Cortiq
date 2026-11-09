-- supabase/migrations/20261113000001_retention_default_365.sql
-- One retention default everywhere: 365 days. run_data_retention, the gdpr_settings column
-- default, the dashboard and the privacy page already use 365. companies.consent_settings
-- still carried 730 from an old template. Nothing reads that key, but it contradicted the rest.

ALTER TABLE public.companies
  ALTER COLUMN consent_settings SET DEFAULT '{
    "consent_mode": "opt-out",
    "data_retention_days": 365,
    "anonymize_ip": true,
    "allowed_event_types": ["view", "click", "conversion"],
    "gdpr_settings": {
      "store_user_agent": false,
      "store_referrer": true,
      "geographic_restrictions": ["EU"]
    }
  }'::jsonb;

UPDATE public.companies
SET consent_settings = jsonb_set(consent_settings, '{data_retention_days}', '365'::jsonb)
WHERE consent_settings->>'data_retention_days' = '730';

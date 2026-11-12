// tests/foundation/aggregate-retention.test.mjs
// run_data_retention() deletes aggregate daily totals at the site's retention cutoff and clears
// the caller IP/User-Agent in the API request log after 90 days. Tables the function covers but
// this fixture does not create only raise a warning inside their own block.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = (file) => readFileSync(new URL(`../../supabase/migrations/${file}`, import.meta.url), 'utf8');

const fixture = `
BEGIN;
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
CREATE TABLE public.sites (id uuid PRIMARY KEY, user_id uuid NOT NULL);
CREATE TABLE public.gdpr_settings (site_id uuid PRIMARY KEY, data_retention_days int);
CREATE TABLE public.api_key_usage (id bigserial PRIMARY KEY, endpoint text, request_ip text, user_agent text,
                                   created_at timestamptz DEFAULT now());
${migration('20261030000001_aggregate_measurement.sql')}
${migration('20261107000001_aggregate_bursts_and_engagement.sql')}
${migration('20261125000001_aggregate_and_api_log_retention.sql')}

INSERT INTO sites VALUES ('11111111-1111-4111-8111-111111111111', gen_random_uuid()),
                         ('22222222-2222-4222-8222-222222222222', gen_random_uuid());
-- Site 2 keeps 30 days; site 1 has no settings row → default 365.
INSERT INTO gdpr_settings VALUES ('22222222-2222-4222-8222-222222222222', 30);

INSERT INTO aggregate_pages_daily (site_id, day, path, pageviews, entries)
SELECT s, current_date - d, '/p', 1, 1
FROM unnest(ARRAY['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222']::uuid[]) s,
     unnest(ARRAY[10, 60, 400]) d;
INSERT INTO aggregate_sources_daily (site_id, day, referrer_domain, utm_source, utm_medium, utm_campaign, device, visits, visitors)
SELECT s, current_date - d, '', '', '', 'c', 'desktop', 1, 1
FROM unnest(ARRAY['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222']::uuid[]) s,
     unnest(ARRAY[10, 60, 400]) d;
INSERT INTO aggregate_conversions_daily (site_id, day, goal_id, goal_name, referrer_domain, utm_source, utm_medium, utm_campaign, conversions)
SELECT s, current_date - d, 'g', 'G', '', '', '', '', 1
FROM unnest(ARRAY['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222']::uuid[]) s,
     unnest(ARRAY[10, 60, 400]) d;
INSERT INTO aggregate_filtered_daily (site_id, day, reason, hits)
SELECT s, current_date - d, 'burst', 1
FROM unnest(ARRAY['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222']::uuid[]) s,
     unnest(ARRAY[10, 60, 400]) d;

INSERT INTO api_key_usage (endpoint, request_ip, user_agent, created_at) VALUES
  ('/v1/a', '203.0.113.9', 'curl/8', now() - interval '10 days'),
  ('/v1/b', '203.0.113.9', 'curl/8', now() - interval '91 days');

DO $$
DECLARE r jsonb; s1 uuid := '11111111-1111-4111-8111-111111111111'; s2 uuid := '22222222-2222-4222-8222-222222222222';
BEGIN
  r := public.run_data_retention();
  ASSERT (SELECT array_agg(current_date - day ORDER BY day DESC) FROM aggregate_pages_daily WHERE site_id = s1) = ARRAY[10, 60], 'default 365 d';
  ASSERT (SELECT array_agg(current_date - day) FROM aggregate_pages_daily WHERE site_id = s2) = ARRAY[10], 'site setting 30 d';
  ASSERT (SELECT count(*) FROM aggregate_sources_daily) = 3, 'sources follow retention';
  ASSERT (SELECT count(*) FROM aggregate_conversions_daily) = 3, 'conversions follow retention';
  ASSERT (SELECT count(*) FROM aggregate_filtered_daily) = 3, 'filtered counts follow retention';
  ASSERT (r->>'aggregate_pages_daily')::int = 3, 'deletions reported';
  ASSERT (SELECT request_ip FROM api_key_usage WHERE endpoint = '/v1/a') = '203.0.113.9', 'recent IP kept';
  ASSERT (SELECT request_ip IS NULL AND user_agent IS NULL FROM api_key_usage WHERE endpoint = '/v1/b'), 'IP and UA cleared after 90 d';
  ASSERT (SELECT count(*) FROM api_key_usage) = 2, 'usage rows kept';
  ASSERT (r->>'api_key_usage_ip_cleared')::int = 1, 'clearing reported';
END $$;
ROLLBACK;
`;

test('PostgreSQL: run_data_retention covers aggregate totals and the API log IP', async () => {
  const db = new PGlite();
  try {
    await assert.doesNotReject(db.exec(fixture));
  } finally {
    await db.close();
  }
});

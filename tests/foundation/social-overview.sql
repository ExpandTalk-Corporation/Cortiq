-- tests/foundation/social-overview.sql
-- Minimal schema for get_social_overview. session_matches_filters is stubbed: the real rule is
-- covered by tab-filters tests; here p_path matches the session_id so the filter path is exercised.
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE TABLE public.sites (id uuid PRIMARY KEY, user_id uuid NOT NULL, domain text, aggregate_measurement boolean NOT NULL DEFAULT false);
CREATE TABLE public.tracking_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id uuid, session_id text,
  device_type text, referrer text, referrer_url text, started_at timestamptz, page_views int, duration_seconds int,
  utm_source text, utm_medium text, utm_campaign text, utm_term text, utm_content text);
CREATE TABLE public.page_views (id uuid DEFAULT gen_random_uuid(), site_id uuid, session_id uuid, url text, viewed_at timestamptz);
CREATE TABLE public.conversion_events (site_id uuid, session_id uuid, created_at timestamptz);
CREATE TABLE public.unified_visitors (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id uuid, first_session_id text,
  fbclid text, ttclid text, li_fat_id text, gclid text);
CREATE TABLE public.visitor_session_links (id uuid DEFAULT gen_random_uuid(), site_id uuid, visitor_id uuid, human_session_id uuid);
CREATE TABLE public.aggregate_sources_daily (site_id uuid, day date, referrer_domain text NOT NULL DEFAULT '',
  utm_source text NOT NULL DEFAULT '', utm_medium text NOT NULL DEFAULT '', utm_campaign text NOT NULL DEFAULT '',
  device text NOT NULL DEFAULT '', visits int NOT NULL DEFAULT 0, visitors int NOT NULL DEFAULT 0,
  engaged_visits int NOT NULL DEFAULT 0, engagement_ms bigint NOT NULL DEFAULT 0);
CREATE TABLE public.aggregate_conversions_daily (site_id uuid, day date, goal_id text, goal_name text,
  referrer_domain text NOT NULL DEFAULT '', utm_source text NOT NULL DEFAULT '', utm_medium text NOT NULL DEFAULT '',
  utm_campaign text NOT NULL DEFAULT '', conversions int NOT NULL DEFAULT 0, value numeric NOT NULL DEFAULT 0);
CREATE FUNCTION public.session_matches_filters(ts public.tracking_sessions, p_path text, p_segment jsonb)
  RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT p_path IS NULL OR ts.session_id LIKE p_path $$;
\ir ../../supabase/migrations/20261116000001_key_pages_and_heatmap_pages.sql
\ir ../../supabase/migrations/20261117000002_social_overview.sql

INSERT INTO sites VALUES ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','a.se', false),
                         ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','b.se', true);

-- s1: Facebook referrer, 3 page views, lands on /blog, reaches /contact, converts, fbclid on the visitor.
-- s2: Instagram in-app browser, no referrer, utm_source=ig, 1 page view, 4 s (not engaged).
-- s3: paid LinkedIn campaign, 1 page view, 30 s (engaged by time).
-- s4: Google organic: not social.
-- s5: utm_medium=social with an unknown source: "other".
-- s6: Facebook outside the range.
-- s7: other site's Facebook visit.
INSERT INTO tracking_sessions (id, site_id, session_id, referrer, started_at, page_views, duration_seconds, utm_source, utm_medium, utm_campaign) VALUES
  ('00000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','s1','https://l.facebook.com/l.php?u=x','2026-09-01 10:00Z',3,120,null,null,null),
  ('00000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','s2',null,'2026-09-02 10:00Z',1,4,'IG','social','autumn'),
  ('00000000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','s3','https://www.linkedin.com/','2026-09-02 11:00Z',1,30,'linkedin','paid-social','b2b-q3'),
  ('00000000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','s4','https://www.google.com/','2026-09-02 12:00Z',2,50,null,null,null),
  ('00000000-0000-4000-8000-000000000005','11111111-1111-4111-8111-111111111111','s5',null,'2026-09-03 12:00Z',1,0,'newsletter-friends','social',null),
  ('00000000-0000-4000-8000-000000000006','11111111-1111-4111-8111-111111111111','s6','https://facebook.com/','2026-08-01 12:00Z',1,0,null,null,null),
  ('00000000-0000-4000-8000-000000000007','22222222-2222-4222-8222-222222222222','s7','https://facebook.com/','2026-09-01 12:00Z',1,0,null,null,null);
INSERT INTO page_views (site_id, session_id, url, viewed_at) VALUES
  ('11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000001','https://a.se/blog/post?fbclid=abc','2026-09-01 10:00Z'),
  ('11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000001','https://a.se/pricing','2026-09-01 10:01Z'),
  ('11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000001','https://a.se/contact/','2026-09-01 10:02Z'),
  ('11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000002','https://a.se/shop','2026-09-02 10:00Z'),
  ('11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000003','https://a.se/b2b','2026-09-02 11:00Z');
INSERT INTO conversion_events VALUES ('11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000001','2026-09-01 10:03Z');
INSERT INTO unified_visitors (site_id, first_session_id, fbclid) VALUES ('11111111-1111-4111-8111-111111111111','s1','abc');
INSERT INTO aggregate_sources_daily (site_id, day, referrer_domain, utm_source, utm_medium, visits, visitors, engaged_visits) VALUES
  ('22222222-2222-4222-8222-222222222222','2026-09-01','facebook.com','','',10,8,4),
  ('22222222-2222-4222-8222-222222222222','2026-09-01','','tiktok','paid-social',5,5,1),
  ('22222222-2222-4222-8222-222222222222','2026-09-01','google.com','','',50,40,20),
  ('11111111-1111-4111-8111-111111111111','2026-09-01','facebook.com','','',99,99,99);
INSERT INTO aggregate_conversions_daily (site_id, day, goal_id, goal_name, referrer_domain, conversions) VALUES
  ('22222222-2222-4222-8222-222222222222','2026-09-01','g1','Contact','facebook.com',2);

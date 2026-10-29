# Aggregate Measurement + Pixel Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a site opt in to consent-free aggregate measurement (page views, visits, daily visitors, sources/UTM, goal conversions per source), and show each site a "Do you need the pixel?" recommendation based on its own conversion volume and consent acceptance.

**Architecture:** A standalone browser beacon (`aggregate-beacon.js`, no storage, no IDs) posts to a new public Edge Function `aggregate-hit`, which folds IP + User-Agent into a daily-salted hash and calls one SECURITY DEFINER RPC that maintains three daily aggregate tables plus an ephemeral visitor map. The dashboard reads totals through a SECURITY INVOKER summary RPC. Pixel readiness is a pure function fed by a hook.

**Tech Stack:** Supabase Postgres (PL/pgSQL, RLS, pg_cron), Deno Edge Functions (TypeScript), vanilla JS beacon, React 18 + TanStack Query + shadcn/ui, WordPress plugin (PHP). Tests: `node --test` with PGlite (SQL), the edge harness (`tests/foundation/edge-harness.mjs`) and `node:vm` (browser scripts).

**Spec:** `docs/superpowers/specs/2026-10-29-aggregate-measurement-and-pixel-readiness-design.md` (read §10 Amendments — they override §4.1 retention, §4.2 responses, §4.3 tracker change, §4.4 reads).

## Global Constraints

- Aggregate mode is **off by default**: `sites.aggregate_measurement boolean NOT NULL DEFAULT false`.
- The beacon writes **nothing** to cookies, `localStorage` or `sessionStorage`, creates no identifier, reads no fingerprint signals (no canvas, screen, language, time zone).
- The beacon is suppressed by `navigator.globalPrivacyControl === true`, a stored CortIQ consent with `analytics === false`, Cookiebot `statistics === false` after a response, a Consent Mode `update` with `analytics_storage: 'denied'`, and a later `siteConsentUpdated` with `analytics: false`.
- Raw IP and User-Agent never reach the database or logs. Hash = SHA-256 hex of `salt|site_id|ip|user_agent`.
- Salt rows are deleted once their UTC day has ended; `aggregate_visitors` rows likewise (spec §10.2).
- Path stored without query string or fragment, trailing slash removed (except `/`), max 512 chars. Referrer stored as bare domain; own-site referrers stored as `''`. `utm_source/medium/campaign` trimmed, max 100 chars each.
- `aggregate-hit` never returns 4xx/5xx for conditions the page cannot fix (disabled, bot, GPC, rate limit, salt/RPC failure); it returns `200 {"skipped": "<reason>"}`. Malformed input → 400, unknown/inactive key → 401, oversized body → 413.
- Readiness thresholds: `SMART_BIDDING_MIN = 30`, `SMART_BIDDING_COMFORTABLE = 50`, `ASSUMED_ACCEPTANCE = 0.5`, `MIN_DAYS_OF_DATA = 7`.
- UI copy in English. Never claim "GDPR-compliant without consent" or "no banner needed" as an absolute; use "designed to not require consent" / "counted without consent: no cookies, no device storage, no persistent IDs".
- Shared tracker/plugin version bumps to **5.5.7** in all five places (`shared-plugin-tracker-version`).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Work on branch `feat/aggregate-measurement`.
- Do not stage `public/cortiq-wordpress-plugin.zip` unless the task changed the plugin (Task 5), nor `docs/BRIEF_2026-10-14_samtycke-och-agentmatning.md`.

## Review Focus

1. **Beacon included twice** (snippet + plugin, or a theme that injects it twice) → page views must count once. Test owned by Task 4.
2. **Visit crossing midnight UTC** → two visitor rows on two days, each day counts one visitor; no error, no carry-over of yesterday's hash. Test owned by Task 1.
3. **WordPress install** (account key as `apiKey`, account id as `siteId`, page on `www.` host) → hit resolves to the right site by domain; a page URL on a domain the account does not own is refused. Test owned by Task 3.
4. **Headless browsers and audit tools** (`HeadlessChrome`, `Lighthouse`, `PhantomJS`, empty UA) → not counted as visitors. Test owned by Task 3.
5. **Brand-new site with nothing** (no consent data, 0 conversions, 2 days old, healthy primary goal) → `aggregate_enough` with an assumption reason and a short-history reason, never a crash or NaN. Test owned by Task 7.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20261030000001_aggregate_measurement.sql` | Column, 5 tables, RLS, `aggregate_daily_salt`, `ingest_aggregate_hit`, `aggregate_retention`, `get_aggregate_summary`, cron |
| `tests/foundation/aggregate-measurement.sql` + `.test.mjs` | PGlite test of the migration |
| `supabase/functions/_shared/site-host.ts` | `normHost`, `ownsHost` (moved out of `server-hit`) |
| `supabase/functions/_shared/aggregate.js` | Pure helpers: path, referrer, UTM, device, client IP, visitor hash |
| `supabase/functions/aggregate-hit/index.ts` | Public ingest endpoint |
| `tests/foundation/aggregate-helpers.test.mjs`, `aggregate-hit.test.mjs` | Helper + endpoint tests |
| `src/lib/aggregate-beacon.js` | Browser beacon (single source; inlined by snippet, bundled into plugin) |
| `tests/foundation/aggregate-beacon.test.mjs` | VM test of the beacon |
| `src/lib/snippetTemplate.ts` | Pure snippet renderer (testable without Vite `?raw`) |
| `src/lib/trackingSnippet.ts` | Vite wrapper: raw imports → `renderTrackingSnippet` |
| `tests/foundation/tracking-snippet.test.mjs` | Snippet renderer test |
| `scripts/self-tracking-snippet.mjs`, `scripts/build-plugin.mjs`, `wordpress-plugin/*` | Distribution |
| `src/lib/aggregateStats.ts`, `src/hooks/useAggregateStats.ts`, `src/components/dashboard/overview/AggregateOverview.tsx` | Overview section |
| `src/components/dashboard/CMPDashboard.tsx` | Settings toggle |
| `src/lib/pixelReadiness.ts`, `tests/foundation/pixel-readiness.test.mjs` | Readiness logic |
| `src/lib/consentAcceptance.ts` | Shared acceptance-rate query (used by `ConsentImpact` and readiness) |
| `src/hooks/usePixelReadiness.ts`, `src/components/dashboard/PixelReadinessCard.tsx` | Readiness UI |

---

### Task 1: Database — aggregate tables, ingest RPC, retention, summary

**Files:**
- Create: `supabase/migrations/20261030000001_aggregate_measurement.sql`
- Create: `tests/foundation/aggregate-measurement.sql`
- Create: `tests/foundation/aggregate-measurement.test.mjs`

**Interfaces:**
- Produces (SQL, used by Tasks 3, 6, 8):
  - `public.aggregate_daily_salt(p_now timestamptz DEFAULT now()) RETURNS text` — 64-char hex, one per UTC day. service_role only.
  - `public.ingest_aggregate_hit(p_site_id uuid, p_hash text, p_kind text, p_path text, p_referrer_domain text, p_utm_source text, p_utm_medium text, p_utm_campaign text, p_device text, p_goal_id text, p_goal_name text, p_value numeric, p_now timestamptz DEFAULT now()) RETURNS boolean` — service_role only.
  - `public.aggregate_retention(p_now timestamptz DEFAULT now()) RETURNS void` — service_role only.
  - `public.get_aggregate_summary(p_site_id uuid, p_from date, p_to date) RETURNS jsonb` — authenticated, RLS-enforced. Keys: `visitors, visits, pageviews, days_with_data, top_sources[{referrer_domain, utm_source, utm_medium, visits, visitors}], top_pages[{path, pageviews, entries}], conversions[{goal_id, goal_name, referrer_domain, utm_source, utm_medium, conversions, value}], conversions_by_goal[{goal_id, goal_name, conversions}]`.
  - Column `sites.aggregate_measurement boolean`.

- [ ] **Step 1: Write the failing SQL fixture**

Create `tests/foundation/aggregate-measurement.sql`:

```sql
-- tests/foundation/aggregate-measurement.sql — run in an ephemeral PGlite instance; everything rolls back.
BEGIN;
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE TABLE public.sites (id uuid PRIMARY KEY, user_id uuid NOT NULL);
GRANT SELECT ON public.sites TO authenticated;
\ir ../../supabase/migrations/20261030000001_aggregate_measurement.sql

INSERT INTO sites VALUES ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
                         ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

DO $$
DECLARE
  s1 uuid := '11111111-1111-4111-8111-111111111111';
  t0 timestamptz := '2026-10-30 10:00:00+00';
  salt text;
  sig text := 'public.ingest_aggregate_hit(uuid,text,text,text,text,text,text,text,text,text,text,numeric,timestamptz)';
BEGIN
  ASSERT (SELECT aggregate_measurement FROM public.sites WHERE id = s1) = false, 'off by default';

  salt := public.aggregate_daily_salt(t0);
  ASSERT length(salt) = 64, 'salt is sha256 hex';
  ASSERT public.aggregate_daily_salt(t0 + interval '5 hours') = salt, 'one salt per UTC day';
  ASSERT public.aggregate_daily_salt(t0 + interval '1 day') <> salt, 'new salt the next day';

  -- Visitor A: LinkedIn campaign → /produkt → /demo → goal twice (counts once)
  PERFORM public.ingest_aggregate_hit(s1, 'hashA', 'pageview', '/produkt', 'linkedin.com', 'linkedin', 'paid', 'q4', 'desktop', NULL, NULL, NULL, t0);
  PERFORM public.ingest_aggregate_hit(s1, 'hashA', 'pageview', '/demo', '', '', '', '', 'desktop', NULL, NULL, NULL, t0 + interval '2 minutes');
  PERFORM public.ingest_aggregate_hit(s1, 'hashA', 'goal', '/tack', '', '', '', '', 'desktop', 'g1', 'Demo request', 100, t0 + interval '3 minutes');
  PERFORM public.ingest_aggregate_hit(s1, 'hashA', 'goal', '/tack', '', '', '', '', 'desktop', 'g1', 'Demo request', 100, t0 + interval '4 minutes');
  -- Visitor B: direct, then Google within 30 min → new visit with Google as source
  PERFORM public.ingest_aggregate_hit(s1, 'hashB', 'pageview', '/', '', '', '', '', 'mobile', NULL, NULL, NULL, t0);
  PERFORM public.ingest_aggregate_hit(s1, 'hashB', 'pageview', '/blog', 'google.com', '', '', '', 'mobile', NULL, NULL, NULL, t0 + interval '5 minutes');
  -- Visitor A returns after 50 minutes, direct → new visit, same visitor
  PERFORM public.ingest_aggregate_hit(s1, 'hashA', 'pageview', '/', '', '', '', '', 'desktop', NULL, NULL, NULL, t0 + interval '50 minutes');

  ASSERT (SELECT sum(pageviews) FROM public.aggregate_pages_daily WHERE site_id = s1) = 5, 'five page views';
  ASSERT (SELECT entries FROM public.aggregate_pages_daily WHERE site_id = s1 AND path = '/produkt') = 1, 'landing counted as entry';
  ASSERT (SELECT entries FROM public.aggregate_pages_daily WHERE site_id = s1 AND path = '/demo') = 0, 'second page is not an entry';
  ASSERT (SELECT sum(visitors) FROM public.aggregate_sources_daily WHERE site_id = s1) = 2, 'two distinct visitors';
  ASSERT (SELECT sum(visits) FROM public.aggregate_sources_daily WHERE site_id = s1) = 4, 'A: linkedin + return, B: direct + google';
  ASSERT (SELECT visits FROM public.aggregate_sources_daily WHERE site_id = s1 AND referrer_domain = 'google.com') = 1, 'google visit';
  ASSERT (SELECT conversions FROM public.aggregate_conversions_daily
          WHERE site_id = s1 AND goal_id = 'g1' AND utm_source = 'linkedin' AND utm_campaign = 'q4') = 1,
    'goal counted once per visit and attributed to the entry source';
  ASSERT (SELECT value FROM public.aggregate_conversions_daily WHERE site_id = s1 AND utm_source = 'linkedin') = 100, 'value kept';

  -- Same goal in A's new (direct) visit counts again, attributed to direct
  PERFORM public.ingest_aggregate_hit(s1, 'hashA', 'goal', '/tack', '', '', '', '', 'desktop', 'g1', 'Demo request', NULL, t0 + interval '55 minutes');
  ASSERT (SELECT conversions FROM public.aggregate_conversions_daily WHERE site_id = s1 AND goal_id = 'g1' AND utm_source = '' AND referrer_domain = '') = 1,
    'second visit converts again, as direct';

  -- Review Focus 2: crossing midnight UTC splits into two days
  PERFORM public.ingest_aggregate_hit(s1, 'hashN1', 'pageview', '/', '', '', '', '', 'desktop', NULL, NULL, NULL, '2026-10-30 23:59:00+00');
  PERFORM public.ingest_aggregate_hit(s1, 'hashN2', 'pageview', '/', '', '', '', '', 'desktop', NULL, NULL, NULL, '2026-10-31 00:01:00+00');
  ASSERT (SELECT visitors FROM public.aggregate_sources_daily WHERE site_id = s1 AND day = '2026-10-31') = 1, 'next day counted on its own';

  -- Invalid input is refused without writes
  ASSERT NOT public.ingest_aggregate_hit(s1, '', 'pageview', '/', '', '', '', '', '', NULL, NULL, NULL, t0), 'empty hash';
  ASSERT NOT public.ingest_aggregate_hit(s1, 'h', 'click', '/', '', '', '', '', '', NULL, NULL, NULL, t0), 'unknown kind';
  ASSERT NOT public.ingest_aggregate_hit(s1, 'h', 'goal', '/', '', '', '', '', '', NULL, NULL, NULL, t0), 'goal without id';

  -- Retention: salts and visitor map go once their day has ended; aggregates stay
  PERFORM public.aggregate_retention('2026-10-31 00:30:00+00');
  ASSERT (SELECT count(*) FROM public.aggregate_salts WHERE day < '2026-10-31') = 0, 'old salts deleted';
  ASSERT (SELECT count(*) FROM public.aggregate_visitors WHERE day < '2026-10-31') = 0, 'old visitor map deleted';
  ASSERT (SELECT count(*) FROM public.aggregate_visitors WHERE day = '2026-10-31') = 1, 'today kept';
  ASSERT (SELECT count(*) FROM public.aggregate_pages_daily WHERE site_id = s1) > 0, 'aggregates kept';

  -- Privileges
  ASSERT NOT has_function_privilege('anon', sig, 'EXECUTE'), 'anon cannot ingest';
  ASSERT NOT has_function_privilege('authenticated', sig, 'EXECUTE'), 'users cannot ingest';
  ASSERT has_function_privilege('service_role', sig, 'EXECUTE'), 'service role ingests';
  ASSERT NOT has_function_privilege('authenticated', 'public.aggregate_daily_salt(timestamptz)', 'EXECUTE'), 'salt is private';
  ASSERT NOT has_function_privilege('authenticated', 'public.aggregate_retention(timestamptz)', 'EXECUTE'), 'retention is private';
  ASSERT NOT has_table_privilege('authenticated', 'public.aggregate_salts', 'SELECT'), 'salts unreadable';
  ASSERT NOT has_table_privilege('authenticated', 'public.aggregate_visitors', 'SELECT'), 'visitor map unreadable';
  ASSERT NOT has_table_privilege('authenticated', 'public.aggregate_pages_daily', 'INSERT'), 'no client writes';
  ASSERT has_function_privilege('authenticated', 'public.get_aggregate_summary(uuid,date,date)', 'EXECUTE'), 'summary readable';
  ASSERT NOT has_function_privilege('anon', 'public.get_aggregate_summary(uuid,date,date)', 'EXECUTE'), 'anon cannot read';
END $$;

INSERT INTO public.aggregate_pages_daily (site_id, day, path, pageviews, entries)
VALUES ('22222222-2222-4222-8222-222222222222', '2026-10-30', '/other', 7, 7);

SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE r jsonb;
BEGIN
  r := public.get_aggregate_summary('11111111-1111-4111-8111-111111111111', '2026-10-30', '2026-10-30');
  ASSERT (r->>'pageviews')::int = 6, 'own pageviews (5 + the 23:59 hit)';
  ASSERT (r->>'visitors')::int = 3, 'A, B and the 23:59 visitor';
  ASSERT (r->>'days_with_data')::int = 1, 'one day';
  ASSERT jsonb_array_length(r->'top_pages') = 4, 'distinct paths: /produkt, /demo, /, /blog';
  ASSERT (r->'conversions_by_goal'->0->>'conversions')::int = 2, 'goal total across sources';
  ASSERT (r->'conversions_by_goal'->0->>'goal_name') = 'Demo request', 'goal name';
  r := public.get_aggregate_summary('22222222-2222-4222-8222-222222222222', '2026-10-30', '2026-10-30');
  ASSERT (r->>'pageviews')::int = 0, 'other tenant invisible';
  ASSERT jsonb_array_length(r->'top_pages') = 0, 'other tenant rows invisible';
  ASSERT (SELECT count(*) FROM public.aggregate_pages_daily WHERE site_id = '22222222-2222-4222-8222-222222222222') = 0, 'RLS on table';
END $$;
ROLLBACK;
```

Create `tests/foundation/aggregate-measurement.test.mjs`:

```js
// tests/foundation/aggregate-measurement.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('PostgreSQL: aggregate ingest, visit rule, retention, privileges and tenant isolation', async () => {
  const db = new PGlite();
  const fixture = readFileSync(new URL('./aggregate-measurement.sql', import.meta.url), 'utf8');
  const migration = readFileSync(new URL('../../supabase/migrations/20261030000001_aggregate_measurement.sql', import.meta.url), 'utf8');
  try {
    await assert.doesNotReject(db.exec(fixture.replace(/^\\ir .*$/m, () => migration)));
  } finally {
    await db.close();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/foundation/aggregate-measurement.test.mjs`
Expected: FAIL — `ENOENT ... 20261030000001_aggregate_measurement.sql`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20261030000001_aggregate_measurement.sql`:

```sql
-- supabase/migrations/20261030000001_aggregate_measurement.sql
-- Aggregate measurement (docs/superpowers/specs/2026-10-29-aggregate-measurement-and-pixel-readiness-design.md).
-- A consent-free, aggregate-only layer written by the aggregate-hit Edge Function. The only
-- personal data is the daily visitor hash in aggregate_visitors: its salt is deleted once the
-- UTC day has ended and so are the rows. Raw IP and User-Agent never reach the database.

ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS aggregate_measurement boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.sites.aggregate_measurement IS
  'Site owner opted in to consent-free aggregate measurement (aggregate-hit). Off by default.';

CREATE TABLE IF NOT EXISTS public.aggregate_salts (
  day  date PRIMARY KEY,
  salt text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.aggregate_visitors (
  site_id          uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  day              date NOT NULL,
  visitor_hash     text NOT NULL,
  visit_started_at timestamptz NOT NULL,
  last_seen_at     timestamptz NOT NULL,
  referrer_domain  text NOT NULL DEFAULT '',
  utm_source       text NOT NULL DEFAULT '',
  utm_medium       text NOT NULL DEFAULT '',
  utm_campaign     text NOT NULL DEFAULT '',
  device           text NOT NULL DEFAULT '',
  goals_hit        text[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (site_id, day, visitor_hash)
);

CREATE TABLE IF NOT EXISTS public.aggregate_pages_daily (
  site_id   uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  day       date NOT NULL,
  path      text NOT NULL,
  pageviews integer NOT NULL DEFAULT 0,
  entries   integer NOT NULL DEFAULT 0,
  PRIMARY KEY (site_id, day, path)
);

CREATE TABLE IF NOT EXISTS public.aggregate_sources_daily (
  site_id         uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  day             date NOT NULL,
  referrer_domain text NOT NULL DEFAULT '',
  utm_source      text NOT NULL DEFAULT '',
  utm_medium      text NOT NULL DEFAULT '',
  utm_campaign    text NOT NULL DEFAULT '',
  device          text NOT NULL DEFAULT '',
  visits          integer NOT NULL DEFAULT 0,
  visitors        integer NOT NULL DEFAULT 0,
  PRIMARY KEY (site_id, day, referrer_domain, utm_source, utm_medium, utm_campaign, device)
);

CREATE TABLE IF NOT EXISTS public.aggregate_conversions_daily (
  site_id         uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  day             date NOT NULL,
  goal_id         text NOT NULL,
  goal_name       text NOT NULL,
  referrer_domain text NOT NULL DEFAULT '',
  utm_source      text NOT NULL DEFAULT '',
  utm_medium      text NOT NULL DEFAULT '',
  utm_campaign    text NOT NULL DEFAULT '',
  conversions     integer NOT NULL DEFAULT 0,
  value           numeric NOT NULL DEFAULT 0,
  PRIMARY KEY (site_id, day, goal_id, referrer_domain, utm_source, utm_medium, utm_campaign)
);

ALTER TABLE public.aggregate_salts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aggregate_visitors          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aggregate_pages_daily       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aggregate_sources_daily     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aggregate_conversions_daily ENABLE ROW LEVEL SECURITY;

-- Salts and the visitor map: service role only (no policies, no grants).
REVOKE ALL ON public.aggregate_salts, public.aggregate_visitors FROM PUBLIC, anon, authenticated;
-- Daily aggregates: owners read, nobody writes from the client.
REVOKE ALL ON public.aggregate_pages_daily, public.aggregate_sources_daily, public.aggregate_conversions_daily
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.aggregate_pages_daily, public.aggregate_sources_daily, public.aggregate_conversions_daily
  TO authenticated;

DROP POLICY IF EXISTS "Owners read aggregate pages" ON public.aggregate_pages_daily;
CREATE POLICY "Owners read aggregate pages" ON public.aggregate_pages_daily FOR SELECT TO authenticated
  USING (site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "Owners read aggregate sources" ON public.aggregate_sources_daily;
CREATE POLICY "Owners read aggregate sources" ON public.aggregate_sources_daily FOR SELECT TO authenticated
  USING (site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "Owners read aggregate conversions" ON public.aggregate_conversions_daily;
CREATE POLICY "Owners read aggregate conversions" ON public.aggregate_conversions_daily FOR SELECT TO authenticated
  USING (site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid()));

-- One random salt per UTC day. gen_random_uuid() uses the server's strong RNG; no extension needed.
CREATE OR REPLACE FUNCTION public.aggregate_daily_salt(p_now timestamptz DEFAULT now())
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_day  date := (p_now AT TIME ZONE 'UTC')::date;
  v_salt text;
BEGIN
  INSERT INTO public.aggregate_salts (day, salt)
  VALUES (v_day, encode(sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text || clock_timestamp()::text, 'UTF8')), 'hex'))
  ON CONFLICT (day) DO NOTHING;
  SELECT s.salt INTO v_salt FROM public.aggregate_salts s WHERE s.day = v_day;
  RETURN v_salt;
END;
$$;

-- One hit. A new visit starts when the hash is new for the day, after 30 minutes of inactivity,
-- or when a page view arrives from a different external source. Goals count once per goal per
-- visit and are attributed to the visit's entry source.
CREATE OR REPLACE FUNCTION public.ingest_aggregate_hit(
  p_site_id uuid, p_hash text, p_kind text, p_path text,
  p_referrer_domain text, p_utm_source text, p_utm_medium text, p_utm_campaign text, p_device text,
  p_goal_id text, p_goal_name text, p_value numeric, p_now timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_day  date := (p_now AT TIME ZONE 'UTC')::date;
  v_path text := left(coalesce(nullif(p_path, ''), '/'), 512);
  v_ref  text := left(coalesce(p_referrer_domain, ''), 253);
  v_src  text := left(coalesce(p_utm_source, ''), 100);
  v_med  text := left(coalesce(p_utm_medium, ''), 100);
  v_cmp  text := left(coalesce(p_utm_campaign, ''), 100);
  v_dev  text := left(coalesce(p_device, ''), 20);
  v_goal text := left(nullif(p_goal_id, ''), 200);
  v_row  public.aggregate_visitors%ROWTYPE;
  v_found boolean;
  v_new_visitor boolean := false;
  v_new_visit boolean := false;
BEGIN
  IF p_site_id IS NULL OR coalesce(p_hash, '') = '' OR p_kind IS NULL OR p_kind NOT IN ('pageview', 'goal') THEN
    RETURN false;
  END IF;
  IF p_kind = 'goal' AND (v_goal IS NULL OR coalesce(p_goal_name, '') = '') THEN RETURN false; END IF;
  -- Goal hits never change the visit's source.
  IF p_kind = 'goal' THEN v_ref := ''; v_src := ''; v_med := ''; v_cmp := ''; END IF;

  SELECT * INTO v_row FROM public.aggregate_visitors v
    WHERE v.site_id = p_site_id AND v.day = v_day AND v.visitor_hash = p_hash
    FOR UPDATE;
  v_found := FOUND;

  IF NOT v_found THEN
    v_new_visitor := true; v_new_visit := true;
  ELSIF v_row.last_seen_at < p_now - interval '30 minutes' THEN
    v_new_visit := true;
  ELSIF (v_ref <> '' OR v_src <> '')
    AND (v_ref, v_src, v_med, v_cmp) IS DISTINCT FROM (v_row.referrer_domain, v_row.utm_source, v_row.utm_medium, v_row.utm_campaign) THEN
    v_new_visit := true;
  END IF;

  IF v_new_visit THEN
    INSERT INTO public.aggregate_visitors AS v
      (site_id, day, visitor_hash, visit_started_at, last_seen_at, referrer_domain, utm_source, utm_medium, utm_campaign, device, goals_hit)
    VALUES (p_site_id, v_day, p_hash, p_now, p_now, v_ref, v_src, v_med, v_cmp, v_dev, '{}')
    ON CONFLICT (site_id, day, visitor_hash) DO UPDATE SET
      visit_started_at = EXCLUDED.visit_started_at, last_seen_at = EXCLUDED.last_seen_at,
      referrer_domain = EXCLUDED.referrer_domain, utm_source = EXCLUDED.utm_source,
      utm_medium = EXCLUDED.utm_medium, utm_campaign = EXCLUDED.utm_campaign,
      device = EXCLUDED.device, goals_hit = '{}'
    RETURNING * INTO v_row;

    INSERT INTO public.aggregate_sources_daily AS s
      (site_id, day, referrer_domain, utm_source, utm_medium, utm_campaign, device, visits, visitors)
    VALUES (p_site_id, v_day, v_ref, v_src, v_med, v_cmp, v_dev, 1, CASE WHEN v_new_visitor THEN 1 ELSE 0 END)
    ON CONFLICT (site_id, day, referrer_domain, utm_source, utm_medium, utm_campaign, device) DO UPDATE SET
      visits = s.visits + 1, visitors = s.visitors + EXCLUDED.visitors;
  ELSE
    UPDATE public.aggregate_visitors v SET last_seen_at = p_now
      WHERE v.site_id = p_site_id AND v.day = v_day AND v.visitor_hash = p_hash;
  END IF;

  IF p_kind = 'pageview' THEN
    INSERT INTO public.aggregate_pages_daily AS pg (site_id, day, path, pageviews, entries)
    VALUES (p_site_id, v_day, v_path, 1, CASE WHEN v_new_visit THEN 1 ELSE 0 END)
    ON CONFLICT (site_id, day, path) DO UPDATE SET
      pageviews = pg.pageviews + 1, entries = pg.entries + EXCLUDED.entries;
    RETURN true;
  END IF;

  IF v_goal = ANY (v_row.goals_hit) THEN RETURN false; END IF;
  UPDATE public.aggregate_visitors v SET goals_hit = array_append(v.goals_hit, v_goal)
    WHERE v.site_id = p_site_id AND v.day = v_day AND v.visitor_hash = p_hash;

  INSERT INTO public.aggregate_conversions_daily AS c
    (site_id, day, goal_id, goal_name, referrer_domain, utm_source, utm_medium, utm_campaign, conversions, value)
  VALUES (p_site_id, v_day, v_goal, left(p_goal_name, 200), v_row.referrer_domain, v_row.utm_source,
          v_row.utm_medium, v_row.utm_campaign, 1,
          CASE WHEN p_value IS NOT NULL AND p_value >= 0 AND p_value < 1e9 THEN p_value ELSE 0 END)
  ON CONFLICT (site_id, day, goal_id, referrer_domain, utm_source, utm_medium, utm_campaign) DO UPDATE SET
    goal_name = EXCLUDED.goal_name, conversions = c.conversions + 1, value = c.value + EXCLUDED.value;
  RETURN true;
END;
$$;

-- Salts and the visitor map are deleted once their UTC day has ended. Aggregates are kept.
CREATE OR REPLACE FUNCTION public.aggregate_retention(p_now timestamptz DEFAULT now())
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  DELETE FROM public.aggregate_salts WHERE day < (p_now AT TIME ZONE 'UTC')::date;
  DELETE FROM public.aggregate_visitors WHERE day < (p_now AT TIME ZONE 'UTC')::date;
$$;

-- Dashboard read. SECURITY INVOKER: RLS on the daily tables decides what the caller sees, and
-- aggregation happens here so totals are never cut off by the PostgREST row cap.
CREATE OR REPLACE FUNCTION public.get_aggregate_summary(p_site_id uuid, p_from date, p_to date)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'visitors', coalesce((SELECT sum(visitors) FROM public.aggregate_sources_daily
                          WHERE site_id = p_site_id AND day BETWEEN p_from AND p_to), 0),
    'visits', coalesce((SELECT sum(visits) FROM public.aggregate_sources_daily
                        WHERE site_id = p_site_id AND day BETWEEN p_from AND p_to), 0),
    'pageviews', coalesce((SELECT sum(pageviews) FROM public.aggregate_pages_daily
                           WHERE site_id = p_site_id AND day BETWEEN p_from AND p_to), 0),
    'days_with_data', (SELECT count(DISTINCT day) FROM public.aggregate_pages_daily
                       WHERE site_id = p_site_id AND day BETWEEN p_from AND p_to),
    'top_sources', coalesce((SELECT jsonb_agg(s ORDER BY s.visits DESC) FROM (
        SELECT referrer_domain, utm_source, utm_medium, sum(visits)::int AS visits, sum(visitors)::int AS visitors
        FROM public.aggregate_sources_daily
        WHERE site_id = p_site_id AND day BETWEEN p_from AND p_to
        GROUP BY referrer_domain, utm_source, utm_medium ORDER BY 4 DESC LIMIT 10) s), '[]'::jsonb),
    'top_pages', coalesce((SELECT jsonb_agg(p ORDER BY p.pageviews DESC) FROM (
        SELECT path, sum(pageviews)::int AS pageviews, sum(entries)::int AS entries
        FROM public.aggregate_pages_daily
        WHERE site_id = p_site_id AND day BETWEEN p_from AND p_to
        GROUP BY path ORDER BY 2 DESC LIMIT 10) p), '[]'::jsonb),
    'conversions', coalesce((SELECT jsonb_agg(c ORDER BY c.conversions DESC) FROM (
        SELECT goal_id, max(goal_name) AS goal_name, referrer_domain, utm_source, utm_medium,
               sum(conversions)::int AS conversions, sum(value) AS value
        FROM public.aggregate_conversions_daily
        WHERE site_id = p_site_id AND day BETWEEN p_from AND p_to
        GROUP BY goal_id, referrer_domain, utm_source, utm_medium ORDER BY 6 DESC LIMIT 50) c), '[]'::jsonb),
    'conversions_by_goal', coalesce((SELECT jsonb_agg(g ORDER BY g.conversions DESC) FROM (
        SELECT goal_id, max(goal_name) AS goal_name, sum(conversions)::int AS conversions
        FROM public.aggregate_conversions_daily
        WHERE site_id = p_site_id AND day BETWEEN p_from AND p_to
        GROUP BY goal_id) g), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.aggregate_daily_salt(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ingest_aggregate_hit(uuid, text, text, text, text, text, text, text, text, text, text, numeric, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.aggregate_retention(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aggregate_daily_salt(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.ingest_aggregate_hit(uuid, text, text, text, text, text, text, text, text, text, text, numeric, timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.aggregate_retention(timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.get_aggregate_summary(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_aggregate_summary(uuid, date, date) TO authenticated;

-- Hourly retention. pg_cron is not available in every environment.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('aggregate-retention', '23 * * * *', 'select public.aggregate_retention()');
  END IF;
END $$;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/foundation/aggregate-measurement.test.mjs`
Expected: PASS. If an `ASSERT` fails, the error message names the assertion — fix the SQL, not the assertion.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261030000001_aggregate_measurement.sql tests/foundation/aggregate-measurement.sql tests/foundation/aggregate-measurement.test.mjs
git commit -m "feat(db): aggregate measurement tables, ingest RPC, retention and summary

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Shared helpers — site host + aggregate sanitizers

**Files:**
- Create: `supabase/functions/_shared/site-host.ts`
- Create: `supabase/functions/_shared/aggregate.js`
- Modify: `supabase/functions/server-hit/index.ts:63-71,111` (import `normHost`/`ownsHost` instead of defining them)
- Test: `tests/foundation/aggregate-helpers.test.mjs`

**Interfaces:**
- Produces:
  - `normHost(value: string): string | null` and `ownsHost(siteHost: string, host: string): boolean` from `_shared/site-host.ts`.
  - From `_shared/aggregate.js`: `cleanPath(url: URL): string`, `referrerSource(referrer: unknown, siteHost: string): string`, `utmFrom(raw: unknown): { p_utm_source: string, p_utm_medium: string, p_utm_campaign: string }`, `deviceFromUA(ua: string): 'desktop'|'mobile'|'tablet'`, `clientIp(headers: Headers): string`, `visitorHash(salt: string, siteId: string, ip: string, ua: string): Promise<string>` (64-char hex).

- [ ] **Step 1: Write the failing test**

Create `tests/foundation/aggregate-helpers.test.mjs`:

```js
// tests/foundation/aggregate-helpers.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanPath, referrerSource, utmFrom, deviceFromUA, clientIp, visitorHash } from '../../supabase/functions/_shared/aggregate.js';

test('cleanPath drops query, fragment and trailing slash', () => {
  assert.equal(cleanPath(new URL('https://a.test/demo/?email=x@y.se#top')), '/demo');
  assert.equal(cleanPath(new URL('https://a.test/')), '/');
  assert.equal(cleanPath(new URL('https://a.test/' + 'x'.repeat(600))).length, 512);
});

test('referrerSource: external domain only, own site and junk are direct', () => {
  assert.equal(referrerSource('https://www.linkedin.com/feed/?trk=abc', 'shop.test'), 'linkedin.com');
  assert.equal(referrerSource('https://shop.test/pricing', 'shop.test'), '');
  assert.equal(referrerSource('https://blog.shop.test/x', 'shop.test'), '');
  assert.equal(referrerSource('', 'shop.test'), '');
  assert.equal(referrerSource('not a url', 'shop.test'), '');
  assert.equal(referrerSource(42, 'shop.test'), '');
});

test('utmFrom keeps three keys, trimmed and capped, ignores the rest', () => {
  assert.deepEqual(utmFrom({ utm_source: ' LinkedIn ', utm_medium: 'paid', utm_campaign: 'q'.repeat(150), utm_term: 'x', email: 'a@b' }),
    { p_utm_source: 'LinkedIn', p_utm_medium: 'paid', p_utm_campaign: 'q'.repeat(100) });
  assert.deepEqual(utmFrom(null), { p_utm_source: '', p_utm_medium: '', p_utm_campaign: '' });
  assert.deepEqual(utmFrom({ utm_source: 5 }), { p_utm_source: '', p_utm_medium: '', p_utm_campaign: '' });
});

test('deviceFromUA classifies coarse device only', () => {
  assert.equal(deviceFromUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148'), 'mobile');
  assert.equal(deviceFromUA('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36'), 'mobile');
  assert.equal(deviceFromUA('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)'), 'tablet');
  assert.equal(deviceFromUA('Mozilla/5.0 (Linux; Android 14; SM-X710) Safari/537.36'), 'tablet');
  assert.equal(deviceFromUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0'), 'desktop');
  assert.equal(deviceFromUA(''), 'desktop');
});

test('clientIp prefers cf-connecting-ip, then the first x-forwarded-for entry', () => {
  assert.equal(clientIp(new Headers({ 'cf-connecting-ip': '203.0.113.9', 'x-forwarded-for': '198.51.100.1' })), '203.0.113.9');
  assert.equal(clientIp(new Headers({ 'x-forwarded-for': '198.51.100.1, 10.0.0.1' })), '198.51.100.1');
  assert.equal(clientIp(new Headers()), '');
});

test('visitorHash is deterministic per salt and changes with salt, site, ip or ua', async () => {
  const h = await visitorHash('salt1', 'site', '203.0.113.9', 'UA');
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(await visitorHash('salt1', 'site', '203.0.113.9', 'UA'), h);
  for (const args of [['salt2', 'site', '203.0.113.9', 'UA'], ['salt1', 'other', '203.0.113.9', 'UA'],
                      ['salt1', 'site', '203.0.113.10', 'UA'], ['salt1', 'site', '203.0.113.9', 'UA2']]) {
    assert.notEqual(await visitorHash(...args), h);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/foundation/aggregate-helpers.test.mjs`
Expected: FAIL — `Cannot find module .../_shared/aggregate.js`.

- [ ] **Step 3: Write the helpers**

Create `supabase/functions/_shared/aggregate.js`:

```js
// Aggregate measurement helpers (aggregate-hit). Plain JS so Deno and the Node foundation tests
// share one implementation. IP and User-Agent are only reduced to a device class or folded into
// the daily visitor hash; nothing here stores them.

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign'];

/** Path without query string or fragment (they can carry emails or tokens), no trailing slash. */
export function cleanPath(url) {
  const p = url.pathname || '/';
  return ((p.length > 1 ? p.replace(/\/+$/, '') : p) || '/').slice(0, 512);
}

/** External referrer → bare domain. Own site (incl. subdomains), empty or invalid → '' (direct). */
export function referrerSource(referrer, siteHost) {
  if (typeof referrer !== 'string' || !referrer) return '';
  let host;
  try { host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, ''); } catch { return ''; }
  if (!host || host === siteHost || host.endsWith('.' + siteHost)) return '';
  return host.slice(0, 253);
}

/** The three campaign keys the dashboard groups by, as RPC parameters. */
export function utmFrom(raw) {
  const out = { p_utm_source: '', p_utm_medium: '', p_utm_campaign: '' };
  if (!raw || typeof raw !== 'object') return out;
  for (const key of UTM_KEYS) {
    const v = raw[key];
    if (typeof v === 'string') out['p_' + key] = v.trim().slice(0, 100);
  }
  return out;
}

/** Coarse device class from the User-Agent header the request carried anyway. */
export function deviceFromUA(ua) {
  const s = String(ua || '');
  if (/iPad|Tablet|PlayBook|Silk/i.test(s) || (/Android/i.test(s) && !/Mobile/i.test(s))) return 'tablet';
  if (/Mobi|iPhone|iPod|Android/i.test(s)) return 'mobile';
  return 'desktop';
}

/** The visitor's IP as seen by the edge. Used only as hash input. */
export function clientIp(headers) {
  const cf = headers.get('cf-connecting-ip');
  if (cf) return cf.trim();
  const xff = headers.get('x-forwarded-for');
  return xff ? xff.split(',')[0].trim() : '';
}

/**
 * SHA-256 hex of salt|site|ip|ua. The salt changes every UTC day and is deleted afterwards, so a
 * hash cannot be recomputed or linked across days.
 */
export async function visitorHash(salt, siteId, ip, ua) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode([salt, siteId, ip, ua].join('|')));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
```

Create `supabase/functions/_shared/site-host.ts`:

```ts
// Host matching shared by public ingest endpoints that authenticate with a site's public key.

/** Hostname as the browser sees it: lowercase, punycode, no www., no port/path/scheme. */
export function normHost(value: string): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase();
    return host.replace(/^www\./, '').replace(/\.$/, '') || null;
  } catch { return null; }
}

/** True when host is the site's own host or a subdomain of it. */
export function ownsHost(siteHost: string, host: string): boolean {
  return host === siteHost || host.endsWith('.' + siteHost);
}
```

Modify `supabase/functions/server-hit/index.ts`:
- Add `import { normHost, ownsHost } from "../_shared/site-host.ts";` after the existing imports.
- Delete the local `normHost` function (lines 63-71, including its doc comment) and add `export { normHost };` directly under the imports so any existing importer keeps working (check first: `grep -rn "normHost" supabase tests` — at plan time only `server-hit/index.ts` used it).
- Replace line 111 `const ownsHost = (host: string) => host === siteHost || host.endsWith('.' + siteHost);` by nothing, and change line 121 `if (!host || !ownsHost(host))` to `if (!host || !ownsHost(siteHost, host))`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/foundation/aggregate-helpers.test.mjs tests/foundation/server-hit.test.mjs`
Expected: PASS (all server-hit tests unchanged, including the IDN and host-ownership cases).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/aggregate.js supabase/functions/_shared/site-host.ts supabase/functions/server-hit/index.ts tests/foundation/aggregate-helpers.test.mjs
git commit -m "feat(edge): shared aggregate sanitizers and site-host matching

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Edge Function `aggregate-hit`

**Files:**
- Create: `supabase/functions/aggregate-hit/index.ts`
- Modify: `supabase/config.toml` (append a block)
- Test: `tests/foundation/aggregate-hit.test.mjs`

**Interfaces:**
- Consumes: Task 1 RPCs `aggregate_daily_salt`, `ingest_aggregate_hit`, plus existing `check_rate_limit(p_key, p_max_count, p_window_sec)` and `resolve_site_by_domain(p_url)`; Task 2 helpers; `classifyBot`, `GENERIC_BOT_PATTERN` from `_shared/ai-bot-registry.ts`; `normalizeGoals`, `matchPageVisitGoals` from `_shared/conversion-goals.js`.
- Produces (HTTP, used by Task 4 beacon): `POST {apiUrl}/aggregate-hit`, header `Authorization: Bearer <site tracking key | account api key>`, JSON body `{ siteId: string, kind: 'pageview'|'goal', url: string, referrer?: string, utm?: { utm_source?, utm_medium?, utm_campaign? }, goalId?: string, formId?: string, contentId?: string, value?: number }`.
  - `pageview` success → `200 { goals: Array<{ id: string, selector: string }> }` (form_submission goals only).
  - `goal` success → `204`.
  - Skips → `200 { skipped: 'gpc'|'bot'|'disabled'|'rate_limited'|'unavailable' }`.

- [ ] **Step 1: Write the failing test**

Create `tests/foundation/aggregate-hit.test.mjs`:

```js
// tests/foundation/aggregate-hit.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEdge, mockDatabase } from './edge-harness.mjs';

const SITE = '11111111-1111-4111-8111-111111111111';
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const KEY = 'tk_' + 'a'.repeat(32);
const ACCOUNT_KEY = 'acct_' + 'b'.repeat(32);
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36';
const GOALS = [
  { id: 'g-form', name: 'Demo form', type: 'form_submission', selector: '#demo-form', value: 100 },
  { id: 'g-thanks', name: 'Thank-you page', type: 'page_visit', selector: '/tack' },
  { id: 'g-click', name: 'Phone', type: 'phone_click', selector: 'a[href^=tel]' },
];

function setup({ site = { id: SITE, user_id: OWNER, is_active: true, domain: 'https://www.shop.test/', aggregate_measurement: true, conversion_goals: GOALS },
                 company = null, domainSiteId = null, rate = { data: true, error: null }, salt = { data: 'f'.repeat(64), error: null } } = {}) {
  const rpcCalls = [];
  const db = mockDatabase(
    (op) => {
      if (op.table === 'sites') {
        const byKey = op.filters.find(([k]) => k === 'tracking_id');
        if (byKey) return { data: byKey[1] === KEY ? site : null, error: null };
        const byId = op.filters.find(([k]) => k === 'id');
        return { data: byId && site && byId[1] === site.id ? site : null, error: null };
      }
      if (op.table === 'companies') return { data: company, error: null };
      return { data: null, error: null };
    },
    async (name, args) => {
      rpcCalls.push({ name, args });
      if (name === 'check_rate_limit') return rate;
      if (name === 'aggregate_daily_salt') return salt;
      if (name === 'resolve_site_by_domain') return { data: domainSiteId, error: null };
      return { data: true, error: null };
    },
  );
  return { ...db, rpcCalls, handler: loadEdge('aggregate-hit', db.client) };
}

const post = (body, { key = KEY, ua = CHROME, headers = {} } = {}) => new Request('https://fn.test/aggregate-hit', {
  method: 'POST',
  headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}), 'user-agent': ua, 'cf-connecting-ip': '203.0.113.9', ...headers },
  body: JSON.stringify(body),
});
const ingests = (rpcCalls) => rpcCalls.filter((c) => c.name === 'ingest_aggregate_hit').map((c) => c.args);

test('pageview: sanitized ingest, page-visit goal emitted, form goals returned without names', async () => {
  const { handler, rpcCalls } = setup();
  const res = await handler(post({ siteId: SITE, kind: 'pageview', url: 'https://www.shop.test/tack/?email=a@b.se#x',
    referrer: 'https://www.linkedin.com/feed/?trk=1', utm: { utm_source: 'linkedin', utm_medium: 'paid', utm_campaign: 'q4' } }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { goals: [{ id: 'g-form', selector: '#demo-form' }] });
  const [view, goal] = ingests(rpcCalls);
  assert.equal(view.p_kind, 'pageview');
  assert.equal(view.p_path, '/tack');
  assert.equal(view.p_referrer_domain, 'linkedin.com');
  assert.equal(view.p_utm_source, 'linkedin');
  assert.equal(view.p_device, 'desktop');
  assert.match(view.p_hash, /^[0-9a-f]{64}$/);
  assert.equal(goal.p_kind, 'goal');
  assert.equal(goal.p_goal_id, 'g-thanks');
  assert.equal(goal.p_goal_name, 'Thank-you page');
  // IP and UA never leave the function.
  const serialized = JSON.stringify(rpcCalls);
  assert.equal(serialized.includes('203.0.113.9'), false);
  assert.equal(serialized.includes('Chrome/130'), false);
});

test('form goal by id uses the configured name and value; unknown form falls back to content id', async () => {
  const { handler, rpcCalls } = setup();
  assert.equal((await handler(post({ siteId: SITE, kind: 'goal', url: 'https://shop.test/demo', goalId: 'g-form' }))).status, 204);
  assert.equal((await handler(post({ siteId: SITE, kind: 'goal', url: 'https://shop.test/demo', formId: 'contact', contentId: 'Contact form', value: 50 }))).status, 204);
  const [byId, fallback] = ingests(rpcCalls);
  assert.deepEqual([byId.p_goal_id, byId.p_goal_name, byId.p_value], ['g-form', 'Demo form', 100]);
  assert.deepEqual([fallback.p_goal_id, fallback.p_goal_name, fallback.p_value], ['form:contact', 'Contact form', 50]);
});

test('click goals are not accepted without consent', async () => {
  const { handler, rpcCalls } = setup();
  await handler(post({ siteId: SITE, kind: 'goal', url: 'https://shop.test/', goalId: 'g-click' }));
  assert.equal(ingests(rpcCalls)[0].p_goal_id, 'form:/');
});

test('skips: disabled site, GPC, bots and audit tools (Review Focus 4), rate limit, limiter error, salt error', async () => {
  const cases = [
    [setup({ site: { id: SITE, user_id: OWNER, is_active: true, domain: 'shop.test', aggregate_measurement: false, conversion_goals: [] } }), {}, 'disabled'],
    [setup(), { headers: { 'sec-gpc': '1' } }, 'gpc'],
    [setup(), { ua: 'Mozilla/5.0 (compatible; GPTBot/1.2)' }, 'bot'],
    [setup(), { ua: 'Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/130.0 Safari/537.36' }, 'bot'],
    [setup(), { ua: 'Mozilla/5.0 Chrome-Lighthouse' }, 'bot'],
    [setup(), { ua: '' }, 'bot'],
    [setup({ rate: { data: false, error: null } }), {}, 'rate_limited'],
    [setup({ rate: { data: null, error: { message: 'down' } } }), {}, 'unavailable'],
    [setup({ salt: { data: null, error: { message: 'down' } } }), {}, 'unavailable'],
  ];
  for (const [{ handler, rpcCalls }, opts, reason] of cases) {
    const res = await handler(post({ siteId: SITE, kind: 'pageview', url: 'https://shop.test/' }, opts));
    assert.equal(res.status, 200, reason);
    assert.deepEqual(await res.json(), { skipped: reason });
    assert.equal(ingests(rpcCalls).length, 0, reason);
  }
});

test('auth and validation: bad key 401, wrong siteId 401, foreign host 400, bad kind 400, big body 413', async () => {
  assert.equal((await setup().handler(post({ siteId: SITE, kind: 'pageview', url: 'https://shop.test/' }, { key: null }))).status, 401);
  assert.equal((await setup().handler(post({ siteId: 'other', kind: 'pageview', url: 'https://shop.test/' }))).status, 401);
  assert.equal((await setup().handler(post({ siteId: SITE, kind: 'pageview', url: 'https://evilshop.test/' }))).status, 400);
  assert.equal((await setup().handler(post({ siteId: SITE, kind: 'click', url: 'https://shop.test/' }))).status, 400);
  assert.equal((await setup().handler(post({ siteId: SITE, kind: 'pageview', url: 'javascript:alert(1)' }))).status, 400);
  const big = await setup().handler(post({ siteId: SITE, kind: 'pageview', url: 'https://shop.test/' }, { headers: { 'content-length': String(20 * 1024) } }));
  assert.equal(big.status, 413);
});

test('WordPress account key resolves the site by domain, incl. www (Review Focus 3)', async () => {
  const company = { id: OWNER, is_active: true };
  const ok = setup({ company, domainSiteId: SITE });
  const res = await ok.handler(post({ siteId: OWNER, kind: 'pageview', url: 'https://www.shop.test/' }, { key: ACCOUNT_KEY }));
  assert.equal(res.status, 200);
  assert.equal(ingests(ok.rpcCalls)[0].p_site_id, SITE);

  const foreign = setup({ company: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', is_active: true }, domainSiteId: SITE });
  const denied = await foreign.handler(post({ siteId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', kind: 'pageview', url: 'https://shop.test/' }, { key: ACCOUNT_KEY }));
  assert.equal(denied.status, 401);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/foundation/aggregate-hit.test.mjs`
Expected: FAIL — `ENOENT ... supabase/functions/aggregate-hit/index.ts`.

- [ ] **Step 3: Write the Edge Function**

Create `supabase/functions/aggregate-hit/index.ts`:

```ts
/**
 * aggregate-hit — consent-free aggregate measurement
 * (docs/superpowers/specs/2026-10-29-aggregate-measurement-and-pixel-readiness-design.md).
 *
 * Called by src/lib/aggregate-beacon.js on sites whose owner enabled sites.aggregate_measurement.
 * The beacon stores nothing on the device and sends no identifier. Here, IP + User-Agent are
 * folded into a daily-salted hash (the salt is deleted when the UTC day ends) and dropped; only
 * the hash and sanitized dimensions reach ingest_aggregate_hit. Never logs IP, UA or hash.
 *
 * Auth: Bearer = the site's tracking key (sites.tracking_id) with body.siteId = site id or owner
 * id, or the account key (companies.api_key, WordPress plugin) with body.siteId = account id, in
 * which case the site is resolved from the page URL's domain and must belong to that account.
 *
 * Conditions the page cannot fix (disabled, GPC, bots, rate limit, DB trouble) answer
 * 200 { skipped } so customers' consoles stay clean.
 */
import { createClient } from '../_shared/supabase.ts';
import { classifyBot, GENERIC_BOT_PATTERN } from '../_shared/ai-bot-registry.ts';
import { normalizeGoals, matchPageVisitGoals } from '../_shared/conversion-goals.js';
import { normHost, ownsHost } from '../_shared/site-host.ts';
import { cleanPath, referrerSource, utmFrom, deviceFromUA, clientIp, visitorHash } from '../_shared/aggregate.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_BODY_BYTES = 8 * 1024;
const REQUESTS_PER_MINUTE = 600;
const SITE_COLUMNS = 'id, user_id, is_active, domain, aggregate_measurement, conversion_goals';
// Headless browsers and audit tools that do not match the AI bot registry.
const AUTOMATION_PATTERN = /HeadlessChrome|Lighthouse|PhantomJS|Puppeteer|Playwright|Selenium/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
const skipped = (reason: string) => json({ skipped: reason });
const clip = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function isLikelyBot(ua: string): boolean {
  if (!ua) return true;
  return classifyBot(ua).registryMatch || GENERIC_BOT_PATTERN.test(ua) || AUTOMATION_PATTERN.test(ua);
}

// deno-lint-ignore no-explicit-any
async function resolveAggregateSite(supabase: any, key: string, siteId: string, pageUrl: URL) {
  const { data: byKey } = await supabase.from('sites').select(SITE_COLUMNS).eq('tracking_id', key).maybeSingle();
  if (byKey) {
    return byKey.is_active !== false && (siteId === byKey.id || siteId === byKey.user_id) ? byKey : null;
  }
  const { data: company } = await supabase.from('companies').select('id, is_active').eq('api_key', key).maybeSingle();
  if (!company || company.is_active === false || company.id !== siteId) return null;
  const { data: domainSiteId } = await supabase.rpc('resolve_site_by_domain', { p_url: pageUrl.origin });
  if (!domainSiteId) return null;
  const { data: site } = await supabase.from('sites').select(SITE_COLUMNS).eq('id', domainSiteId as string).maybeSingle();
  return site && site.user_id === company.id && site.is_active !== false ? site : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const auth = req.headers.get('authorization') ?? '';
  const key = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!/^[A-Za-z0-9+/=_-]{20,128}$/.test(key)) return json({ error: 'Missing or malformed key' }, 401);
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return json({ error: 'Body too large' }, 413);

  // deno-lint-ignore no-explicit-any
  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const kind = body?.kind;
  if (kind !== 'pageview' && kind !== 'goal') return json({ error: 'kind must be pageview or goal' }, 400);
  let pageUrl: URL;
  try { pageUrl = new URL(String(body.url ?? '')); } catch { return json({ error: 'Invalid url' }, 400); }
  if (pageUrl.protocol !== 'https:' && pageUrl.protocol !== 'http:') return json({ error: 'Invalid url' }, 400);

  // Objection signals and non-humans are dropped before any lookup.
  if (req.headers.get('sec-gpc') === '1') return skipped('gpc');
  const ua = (req.headers.get('user-agent') ?? '').slice(0, 512);
  if (isLikelyBot(ua)) return skipped('bot');

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const site = await resolveAggregateSite(supabase, key, String(body.siteId ?? ''), pageUrl);
  if (!site) return json({ error: 'Unknown or inactive key' }, 401);
  if (!site.aggregate_measurement) return skipped('disabled');

  const siteHost = normHost(site.domain ?? '');
  const host = normHost(pageUrl.hostname);
  if (!siteHost || !host || !ownsHost(siteHost, host)) return json({ error: 'Host does not belong to this site' }, 400);

  // Fail closed: an unavailable limiter must not become an unlimited one.
  const { data: allowed, error: rlError } = await supabase.rpc('check_rate_limit', {
    p_key: `agg:${site.id}`, p_max_count: REQUESTS_PER_MINUTE, p_window_sec: 60,
  });
  if (rlError) return skipped('unavailable');
  if (allowed === false) return skipped('rate_limited');

  const { data: salt, error: saltError } = await supabase.rpc('aggregate_daily_salt');
  if (saltError || typeof salt !== 'string' || !salt) {
    console.error('aggregate-hit: salt unavailable');
    return skipped('unavailable');
  }
  const hash = await visitorHash(salt, site.id, clientIp(req.headers), ua);

  const base = { p_site_id: site.id, p_hash: hash, p_path: cleanPath(pageUrl), p_device: deviceFromUA(ua) };
  const noSource = { p_referrer_domain: '', p_utm_source: '', p_utm_medium: '', p_utm_campaign: '' };
  const ingest = async (args: Record<string, unknown>) => {
    const { error } = await supabase.rpc('ingest_aggregate_hit', args);
    if (error) console.error('aggregate-hit: ingest failed:', error.message);
  };
  const goals = normalizeGoals(site.conversion_goals);

  if (kind === 'pageview') {
    await ingest({ ...base, p_kind: 'pageview', p_referrer_domain: referrerSource(body.referrer, siteHost),
      ...utmFrom(body.utm), p_goal_id: null, p_goal_name: null, p_value: null });
    for (const goal of matchPageVisitGoals(goals, pageUrl.href)) {
      await ingest({ ...base, ...noSource, p_kind: 'goal', p_goal_id: goal.id, p_goal_name: goal.name, p_value: num(goal.value) });
    }
    // Form goals only: the beacon matches submits by selector. No names or values leave here.
    return json({ goals: goals.filter((g) => g.type === 'form_submission').map((g) => ({ id: g.id, selector: g.selector.slice(0, 500) })) });
  }

  const goal = typeof body.goalId === 'string'
    ? goals.find((g) => g.id === body.goalId && g.type === 'form_submission')
    : undefined;
  await ingest({
    ...base, ...noSource, p_kind: 'goal',
    p_goal_id: goal ? goal.id : `form:${clip(body.formId, 100) ?? base.p_path}`,
    p_goal_name: goal ? goal.name : (clip(body.contentId, 200) ?? 'Conversion'),
    p_value: goal ? num(goal.value) : num(body.value),
  });
  return new Response(null, { status: 204, headers: corsHeaders });
});
```

Append to `supabase/config.toml`:

```toml

[functions.aggregate-hit]
verify_jwt = false
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/foundation/aggregate-hit.test.mjs`
Expected: PASS. If the account-key test fails on the `companies` mock returning the company for the tracking-key lookup, check `resolveAggregateSite` queries `sites` by `tracking_id` first (mock returns `null` for `ACCOUNT_KEY`).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/aggregate-hit/index.ts supabase/config.toml tests/foundation/aggregate-hit.test.mjs
git commit -m "feat(edge): aggregate-hit endpoint for consent-free aggregate measurement

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Browser beacon `aggregate-beacon.js`

**Files:**
- Create: `src/lib/aggregate-beacon.js`
- Test: `tests/foundation/aggregate-beacon.test.mjs`

**Interfaces:**
- Consumes: Task 3 HTTP contract.
- Produces: a self-executing script that reads `window.cortiqConfig = { apiUrl?, siteId, apiKey, aggregate: true }`. Contains only full-line `//` comments (Task 5 strips them when inlining). Sets `window.__cortiqAggregate = true` as a double-load guard.

- [ ] **Step 1: Write the failing test**

Create `tests/foundation/aggregate-beacon.test.mjs`:

```js
// tests/foundation/aggregate-beacon.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../../src/lib/aggregate-beacon.js', import.meta.url), 'utf8');
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };

function browser({ config = { siteId: 'site-1', apiKey: 'tk_key', aggregate: true }, stored = null, gpc = false,
                   cookiebot, dataLayer, referrer = 'https://www.linkedin.com/feed/', search = '?utm_source=linkedin&utm_campaign=q4',
                   goals = [{ id: 'g-form', selector: '#demo' }] } = {}) {
  const calls = [];
  const storageTouches = [];
  const listeners = new Map();
  const on = (target) => ({
    addEventListener(n, h) { (listeners.get(target + n) || listeners.set(target + n, []).get(target + n)).push(h); },
  });
  const fire = (target, type, event) => (listeners.get(target + type) || []).forEach((h) => h({ type, ...event }));
  const local = new Map(stored ? [['site_cookie_consent', JSON.stringify(stored)]] : []);
  const window = Object.assign(on('w'), {
    cortiqConfig: config,
    ...(cookiebot && { Cookiebot: cookiebot }),
    ...(dataLayer && { dataLayer }),
  });
  const location = { origin: 'https://shop.test', pathname: '/start', search };
  const history = {
    pushState(_s, _t, path) { location.pathname = path; },
    replaceState(_s, _t, path) { location.pathname = path; },
  };
  const ctx = {
    window, location, history,
    document: Object.assign(on('d'), { referrer }),
    navigator: { globalPrivacyControl: gpc },
    URLSearchParams,
    localStorage: { getItem: (k) => { storageTouches.push(['get', k]); return local.get(k) ?? null; },
                    setItem: (k) => storageTouches.push(['set', k]) },
    sessionStorage: { getItem: (k) => { storageTouches.push(['sget', k]); return null; }, setItem: (k) => storageTouches.push(['sset', k]) },
    fetch: async (url, opts) => {
      calls.push({ url, opts, body: JSON.parse(opts.body) });
      const pageview = JSON.parse(opts.body).kind === 'pageview';
      return { status: pageview ? 200 : 204, json: async () => ({ goals }) };
    },
  };
  ctx.window.window = ctx.window;
  const run = () => runInNewContext(source, ctx);
  run();
  const submit = (form) => fire('d', 'submit', { target: form });
  const consent = (detail) => fire('w', 'siteConsentUpdated', { detail });
  return { calls, storageTouches, ctx, run, submit, consent, history, location };
}
const form = (matches, attrs = {}) => ({
  id: attrs.id || '', closest: (sel) => (matches.includes(sel) ? {} : null),
  hasAttribute: (a) => a in attrs, getAttribute: (a) => attrs[a] ?? null,
});

test('sends one pageview with referrer and UTM, no storage writes, no session reads', async () => {
  const b = browser();
  await settle();
  assert.equal(b.calls.length, 1);
  const { url, opts, body } = b.calls[0];
  assert.equal(url, 'https://cxmkdtgfocgbfizawlwa.supabase.co/functions/v1/aggregate-hit');
  assert.equal(opts.keepalive, true);
  assert.equal(opts.credentials, 'omit');
  assert.equal(opts.headers.Authorization, 'Bearer tk_key');
  assert.deepEqual(body, { kind: 'pageview', url: 'https://shop.test/start', referrer: 'https://www.linkedin.com/feed/',
    utm: { utm_source: 'linkedin', utm_campaign: 'q4' }, siteId: 'site-1' });
  assert.equal(b.storageTouches.some(([op]) => op !== 'get'), false, 'only reads the consent record');
  assert.deepEqual(b.storageTouches.filter(([op]) => op === 'get').map(([, k]) => k), ['site_cookie_consent']);
});

test('SPA navigation sends a pageview per new path, without the original referrer', async () => {
  const b = browser();
  await settle();
  b.ctx.history.pushState({}, '', '/pricing');
  b.ctx.history.replaceState({}, '', '/pricing');
  await settle();
  assert.equal(b.calls.length, 2);
  assert.equal(b.calls[1].body.url, 'https://shop.test/pricing');
  assert.equal(b.calls[1].body.referrer, '');
});

test('form goals: configured selector by id, data-wfa-conversion fallback, nothing for other forms', async () => {
  const b = browser();
  await settle();
  b.submit(form(['#demo']));
  b.submit(form([], { 'data-wfa-conversion': '', id: 'contact', 'data-wfa-content-id': 'Contact form', 'data-wfa-value': '50' }));
  b.submit(form([]));
  await settle();
  const goals = b.calls.slice(1).map((c) => c.body);
  assert.equal(goals.length, 2);
  assert.deepEqual(goals[0], { kind: 'goal', url: 'https://shop.test/start', goalId: 'g-form', siteId: 'site-1' });
  assert.deepEqual(goals[1], { kind: 'goal', url: 'https://shop.test/start', formId: 'contact', contentId: 'Contact form', value: 50, siteId: 'site-1' });
});

test('suppressed: GPC, stored refusal, Cookiebot refusal, Consent Mode denied, missing aggregate flag', async () => {
  const variants = [
    { gpc: true },
    { stored: { analytics: false, expiresAt: '2099-01-01T00:00:00Z' } },
    { cookiebot: { hasResponse: true, consent: { statistics: false } } },
    { dataLayer: [['consent', 'default', { analytics_storage: 'granted' }], ['consent', 'update', { analytics_storage: 'denied' }]] },
    { config: { siteId: 'site-1', apiKey: 'tk_key' } },
  ];
  for (const v of variants) {
    const b = browser(v);
    await settle();
    assert.equal(b.calls.length, 0, JSON.stringify(v));
  }
});

test('a later refusal stops further hits; a later grant resumes', async () => {
  const b = browser();
  await settle();
  b.consent({ analytics: false });
  b.ctx.history.pushState({}, '', '/after-refusal');
  await settle();
  assert.equal(b.calls.length, 1);
  b.consent({ analytics: true });
  b.ctx.history.pushState({}, '', '/after-grant');
  await settle();
  assert.equal(b.calls.length, 2);
});

test('loaded twice on one page still counts once (Review Focus 1)', async () => {
  const b = browser();
  b.run();
  await settle();
  assert.equal(b.calls.length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/foundation/aggregate-beacon.test.mjs`
Expected: FAIL — `ENOENT ... src/lib/aggregate-beacon.js`.

- [ ] **Step 3: Write the beacon**

Create `src/lib/aggregate-beacon.js` (only full-line comments; no trailing `//` comments on code lines):

```js
// CortIQ aggregate beacon. Runs without consent ONLY when the site owner turned on aggregate
// measurement (window.cortiqConfig.aggregate === true and sites.aggregate_measurement).
// Sends the page path, the referrer, UTM values and form-goal hits to aggregate-hit.
// Writes nothing to the device (no cookies, localStorage or sessionStorage), sets no identifier
// and reads no fingerprint signals. It reads the stored consent record only to honour an explicit
// refusal, and stops on Global Privacy Control.
(function () {
  var cfg = window.cortiqConfig || {};
  if (cfg.aggregate !== true || !cfg.siteId || !cfg.apiKey || window.__cortiqAggregate) return;
  window.__cortiqAggregate = true;
  var endpoint = (cfg.apiUrl || 'https://cxmkdtgfocgbfizawlwa.supabase.co/functions/v1') + '/aggregate-hit';
  var refusedLive = null;
  var formGoals = [];
  var lastPath = null;
  var firstView = true;

  function refused() {
    if (refusedLive !== null) return refusedLive;
    if (navigator.globalPrivacyControl === true) return true;
    try {
      var c = JSON.parse(localStorage.getItem('site_cookie_consent') || 'null');
      if (c && c.analytics === false) return true;
    } catch (e) { /* storage unavailable */ }
    var cb = window.Cookiebot;
    if (cb && cb.hasResponse && cb.consent && cb.consent.statistics === false) return true;
    var dl = window.dataLayer;
    if (Array.isArray(dl)) {
      var state = null;
      for (var i = 0; i < dl.length; i++) {
        var en = dl[i];
        if (en && en[0] === 'consent' && en[1] === 'update' && en[2] && en[2].analytics_storage) state = en[2].analytics_storage;
      }
      if (state === 'denied') return true;
    }
    return false;
  }

  function send(body) {
    if (navigator.globalPrivacyControl === true || refused()) return Promise.resolve(null);
    body.siteId = cfg.siteId;
    try {
      return fetch(endpoint, {
        method: 'POST', keepalive: true, credentials: 'omit',
        headers: { 'Authorization': 'Bearer ' + cfg.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(function (r) { return r && r.status === 200 ? r.json() : null; })
        .catch(function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }

  function utm() {
    var p = new URLSearchParams(location.search);
    var out = {};
    ['utm_source', 'utm_medium', 'utm_campaign'].forEach(function (k) {
      var v = p.get(k);
      if (v) out[k] = v.slice(0, 100);
    });
    return out;
  }

  function pageview() {
    var path = location.pathname;
    if (path === lastPath) return;
    lastPath = path;
    var body = { kind: 'pageview', url: location.origin + path, referrer: firstView ? (document.referrer || '') : '', utm: utm() };
    firstView = false;
    send(body).then(function (res) {
      if (res && Array.isArray(res.goals)) {
        formGoals = res.goals.filter(function (g) { return g && typeof g.id === 'string' && typeof g.selector === 'string'; });
      }
    });
  }

  function matches(el, selector) {
    try { return !!(el && el.closest && el.closest(selector)); } catch (e) { return false; }
  }

  document.addEventListener('submit', function (e) {
    var target = e.target;
    var url = location.origin + location.pathname;
    var hits = formGoals.filter(function (g) { return matches(target, g.selector); });
    hits.forEach(function (g) { send({ kind: 'goal', url: url, goalId: g.id }); });
    if (hits.length === 0 && target && target.hasAttribute && target.hasAttribute('data-wfa-conversion')) {
      var body = { kind: 'goal', url: url, formId: target.id || '', contentId: target.getAttribute('data-wfa-content-id') || location.pathname };
      var value = parseFloat(target.getAttribute('data-wfa-value') || '0');
      if (value > 0) body.value = value;
      send(body);
    }
  }, true);

  window.addEventListener('siteConsentUpdated', function (e) {
    if (e && e.detail && typeof e.detail.analytics === 'boolean') refusedLive = !e.detail.analytics;
  });

  ['pushState', 'replaceState'].forEach(function (name) {
    var original = history[name];
    if (typeof original !== 'function') return;
    history[name] = function () {
      var result = original.apply(this, arguments);
      pageview();
      return result;
    };
  });
  window.addEventListener('popstate', pageview);

  pageview();
})();
```

Note on the "goal" body key order in the test (`{ kind, url, goalId, siteId }`): `deepStrictEqual` ignores key order, so `siteId` being appended last is fine.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/foundation/aggregate-beacon.test.mjs tests/foundation/tracking-consent.test.mjs`
Expected: PASS (tracking-consent untouched: the tracker is unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/lib/aggregate-beacon.js tests/foundation/aggregate-beacon.test.mjs
git commit -m "feat(tracker): consent-free aggregate beacon (no storage, no IDs)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Distribution — snippet, self-tracking, WordPress plugin, version 5.5.7

**Files:**
- Create: `src/lib/snippetTemplate.ts`
- Modify: `src/lib/trackingSnippet.ts` (whole file)
- Modify: `src/components/dashboard/InstallationGuide.tsx:56`
- Modify: `scripts/self-tracking-snippet.mjs` (`buildSelfTrackingSnippet`, `readSelfTrackingFiles`)
- Modify: `scripts/build-plugin.mjs` (bundle beacon)
- Modify: `wordpress-plugin/cortiq-analytics.php` (option default ~line 48, enqueue after line ~271, sanitize ~line 780, settings UI near line ~931, version lines 6 and 24)
- Modify: `wordpress-plugin/readme.txt` (Stable tag + changelog), `src/lib/plugin-version.ts`, `public/spa-tracking.js:4,20` (version only)
- Modify: `tests/foundation/version-sync.test.mjs` (assert bundled beacon), `tests/foundation/self-tracking.test.mjs` (aggregate case)
- Create: `tests/foundation/tracking-snippet.test.mjs`
- Rebuild: `public/cortiq.js`, `public/cortiq-wordpress-plugin.zip`

**Interfaces:**
- Consumes: Task 4 `src/lib/aggregate-beacon.js`.
- Produces: `renderTrackingSnippet(opts: TrackingSnippetOptions & { aggregate?: boolean }, sources: { loader: string; beacon: string }): string`; `buildTrackingSnippet(opts)` gains optional `aggregate?: boolean`. `buildSelfTrackingSnippet(env, { loaderSource, beaconSource, version })` honours `env.VITE_CORTIQ_AGGREGATE === 'true'`.

- [ ] **Step 1: Write the failing tests**

Create `tests/foundation/tracking-snippet.test.mjs`:

```js
// tests/foundation/tracking-snippet.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderTrackingSnippet } from '../../src/lib/snippetTemplate.ts';

const loader = readFileSync(new URL('../../src/lib/consent-loader.js', import.meta.url), 'utf8');
const beacon = readFileSync(new URL('../../src/lib/aggregate-beacon.js', import.meta.url), 'utf8');
const opts = { apiUrl: 'https://api.test/functions/v1', siteId: 'site-1', trackingKey: 'tk_key', scriptSrc: 'https://cortiq.se/spa-tracking.js' };

test('default snippet: consent-gated loader only, no beacon, no aggregate flag', () => {
  const html = renderTrackingSnippet(opts, { loader, beacon });
  assert.match(html, /loads only after analytics consent/);
  assert.equal(html.includes('aggregate-hit'), false);
  assert.equal(html.includes('aggregate: true'), false);
  assert.match(html, /https:\/\/cortiq\.se\/spa-tracking\.js/);
});

test('aggregate snippet: flag set, beacon inlined before the loader, comments stripped', () => {
  const html = renderTrackingSnippet({ ...opts, aggregate: true }, { loader, beacon });
  assert.match(html, /aggregate: true/);
  assert.ok(html.indexOf('aggregate-hit') > -1 && html.indexOf('aggregate-hit') < html.indexOf('spa-tracking.js'));
  assert.equal(/^\s*\/\//m.test(html.replace(/<!--.*?-->/g, '')), false, 'no line comments shipped');
  assert.match(html, /counts page views without consent/);
});
```

In `tests/foundation/self-tracking.test.mjs` add at the end:

```js
test('aggregate self-tracking inlines the beacon only when VITE_CORTIQ_AGGREGATE=true', () => {
  const env = { VITE_CORTIQ_SITE_ID: SITE, VITE_CORTIQ_TRACKING_KEY: 'abcDEF123_-key' };
  assert.equal(buildSelfTrackingSnippet(env, files).includes('aggregate-hit'), false);
  const html = buildSelfTrackingSnippet({ ...env, VITE_CORTIQ_AGGREGATE: 'true' }, files);
  assert.ok(html.includes('aggregate-hit'));
  assert.ok(html.includes('"aggregate":true'));
});
```

In `tests/foundation/version-sync.test.mjs`, inside the test `'served plugin zip matches wordpress-plugin/ sources'`, after the `tracker` assertions add:

```js
  const beacon = zip.file('cortiq-analytics/assets/cortiq-aggregate.js');
  assert.ok(beacon, 'zip is missing the bundled aggregate beacon assets/cortiq-aggregate.js');
  assert.equal(await beacon.async('string'),
    readFileSync(new URL('../../src/lib/aggregate-beacon.js', import.meta.url), 'utf8'),
    'zip copy of the aggregate beacon is stale — run node scripts/build-plugin.mjs');
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/foundation/tracking-snippet.test.mjs tests/foundation/self-tracking.test.mjs tests/foundation/version-sync.test.mjs`
Expected: FAIL — missing `snippetTemplate.ts`, missing beacon in self-tracking output, missing beacon in zip.

- [ ] **Step 3: Implement**

Create `src/lib/snippetTemplate.ts`:

```ts
// Pure renderer for the install snippet. trackingSnippet.ts supplies the sources via Vite ?raw
// imports; the foundation tests read them from disk.

export interface TrackingSnippetOptions {
  apiUrl: string;
  siteId: string;
  trackingKey: string;
  scriptSrc: string;
  /** Inline the consent-free aggregate beacon (sites.aggregate_measurement). */
  aggregate?: boolean;
}

const stripLineComments = (source: string) => source
  .split('\n')
  .filter(line => !line.trimStart().startsWith('//'))
  .join('\n')
  .trim();

export function renderTrackingSnippet(
  { apiUrl, siteId, trackingKey, scriptSrc, aggregate = false }: TrackingSnippetOptions,
  sources: { loader: string; beacon: string },
): string {
  const loader = stripLineComments(sources.loader).replace('__CORTIQ_SRC__', scriptSrc);
  const indent = (code: string) => code.split('\n').map(l => '  ' + l).join('\n');
  const header = aggregate
    ? '<!-- CortIQ Analytics: counts page views without consent (no cookies, no device storage, no IDs); full tracking loads only after analytics consent -->'
    : '<!-- CortIQ Analytics: loads only after analytics consent -->';
  return `${header}
<script>
  window.cortiqConfig = {
    apiUrl: '${apiUrl}',
    siteId: '${siteId}',
    apiKey: '${trackingKey}',
    cookieless: true${aggregate ? ',\n    aggregate: true' : ''}
  };
${aggregate ? indent(stripLineComments(sources.beacon)) + '\n' : ''}${indent(loader)}
</script>`;
}
```

Replace `src/lib/trackingSnippet.ts` with:

```ts
import consentLoader from './consent-loader.js?raw';
import aggregateBeacon from './aggregate-beacon.js?raw';
import { renderTrackingSnippet, type TrackingSnippetOptions } from './snippetTemplate';

export type { TrackingSnippetOptions };

/**
 * The install snippet shown in the dashboard. It sets window.cortiqConfig and inlines the
 * consent-gated loader, so the browser requests the tracker (and sends its IP to the tracker's
 * host) only after the visitor's analytics consent. With `aggregate`, it also inlines the
 * consent-free aggregate beacon (src/lib/aggregate-beacon.js).
 */
export function buildTrackingSnippet(options: TrackingSnippetOptions): string {
  return renderTrackingSnippet(options, { loader: consentLoader, beacon: aggregateBeacon });
}
```

In `src/components/dashboard/InstallationGuide.tsx:56` change the call to:

```tsx
{buildTrackingSnippet({ apiUrl: apiBase, siteId: selectedSite.id, trackingKey: selectedSite.tracking_id, scriptSrc,
  aggregate: (selectedSite as Site & { aggregate_measurement?: boolean }).aggregate_measurement === true })}
```

(`Site` is already imported in that file; if not, add `import type { Site } from '@/types/dashboard';`.)

In `scripts/self-tracking-snippet.mjs`:
- Change the signature to `export function buildSelfTrackingSnippet(env, { loaderSource, beaconSource = '', version })` and update the JSDoc `files` type to `{ loaderSource: string, beaconSource?: string, version: string }`.
- After `const config = { ... };` add `const aggregate = (env.VITE_CORTIQ_AGGREGATE || '').trim() === 'true';` and `if (aggregate) config.aggregate = true;`.
- Replace the return with:

```js
  const strip = (src) => src.split('\n').filter((line) => !line.trimStart().startsWith('//')).join('\n').trim();
  const beacon = aggregate && beaconSource ? `${strip(beaconSource)}\n` : '';
  return `<!-- CortIQ self-measurement: loads only after analytics consent -->\n<script>\nwindow.cortiqConfig = ${JSON.stringify(config)};\n${beacon}${loader}\n</script>`;
```

- In `readSelfTrackingFiles` add `const beaconSource = readFileSync(`${root}/src/lib/aggregate-beacon.js`, 'utf8');` and return `{ loaderSource, beaconSource, version }`.

In `scripts/build-plugin.mjs`, after the `assets/cortiq.js` line add:

```js
// Consent-free aggregate beacon, enqueued only when the site owner enables Aggregate measurement.
zip.file(`${PLUGIN_FOLDER}/assets/cortiq-aggregate.js`, readFileSync(join(root, 'src', 'lib', 'aggregate-beacon.js')));
```

In `wordpress-plugin/cortiq-analytics.php`:
- Defaults (next to `'tracking_mode' => 'full',` ~line 48): add `'aggregate'             => false,   // consent-free aggregate counts (assets/cortiq-aggregate.js)`.
- In the config array (~line 269) add `'aggregate'   => ! empty( $opts['aggregate'] ),`.
- Directly after `wp_add_inline_script( 'cortiq-tracking', 'window.cortiqConfig = ' . $config . ';', 'before' );` add:

```php
    // Aggregate measurement: counts page views, sources and form goals without consent —
    // no cookies, no device storage, no identifiers. Only when the site owner enabled it.
    if ( ! empty( $opts['aggregate'] ) ) {
        $agg = plugin_dir_path( __FILE__ ) . 'assets/cortiq-aggregate.js';
        if ( file_exists( $agg ) ) {
            wp_enqueue_script( 'cortiq-aggregate', plugins_url( 'assets/cortiq-aggregate.js', __FILE__ ), array(), CORTIQ_VERSION, false );
            wp_add_inline_script( 'cortiq-aggregate', 'window.cortiqConfig = ' . $config . ';', 'before' );
        }
    }
```

- Sanitizer (~line 780, next to `tracking_mode`): `$clean['aggregate'] = ! empty( $input['aggregate'] );`
- Settings UI: directly after the tracking-mode radio group (~line 931-940) add a row:

```php
                <tr>
                    <th scope="row">Aggregate measurement</th>
                    <td>
                        <label>
                            <input type="checkbox" name="<?php echo CORTIQ_OPTION_KEY; ?>[aggregate]" value="1" <?php checked( ! empty( $opts['aggregate'] ) ); ?> />
                            Count page views, sources and form goals without consent
                        </label>
                        <p class="description">No cookies, no device storage, no persistent identifiers. Designed to not require consent; your own legal assessment decides. Also switch it on in the CortIQ dashboard (Consent → Tracking mode), otherwise hits are ignored.</p>
                    </td>
                </tr>
```

(Match the surrounding markup: if the settings page uses a `<table class="form-table">`, put the row inside it; if it uses another structure, mirror the tracking-mode block's wrapper.)

Version bump to **5.5.7** in all five places: `wordpress-plugin/cortiq-analytics.php` (header `Version:` and `define( 'CORTIQ_VERSION', ... )`), `wordpress-plugin/readme.txt` (`Stable tag:`), `src/lib/plugin-version.ts` (`PLUGIN_VERSION = '5.5.7'`, `PLUGIN_LAST_UPDATED = '2026-10-30'`), `public/spa-tracking.js` (header comment line 4 and `CORTIQ_VERSION` line 20). Add a changelog entry at the top of the readme changelog (above `= 5.5.6 =`):

```
= 5.5.7 =
* New: optional Aggregate measurement — counts page views, sources and form goals without consent (no cookies, no device storage, no identifiers).
```

Rebuild the bundled tracker and plugin zip:

Run: `node scripts/minify-tracker.mjs && node scripts/build-plugin.mjs`

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/foundation/tracking-snippet.test.mjs tests/foundation/self-tracking.test.mjs tests/foundation/version-sync.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/snippetTemplate.ts src/lib/trackingSnippet.ts src/components/dashboard/InstallationGuide.tsx scripts/self-tracking-snippet.mjs scripts/build-plugin.mjs wordpress-plugin/ src/lib/plugin-version.ts public/spa-tracking.js public/cortiq.js public/cortiq-wordpress-plugin.zip tests/foundation/tracking-snippet.test.mjs tests/foundation/self-tracking.test.mjs tests/foundation/version-sync.test.mjs
git commit -m "feat(tracking): ship aggregate beacon in snippet, self-tracking and WP plugin 5.5.7

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(If `public/cortiq.js` is git-ignored, `git add` will say so — drop it from the list.)

---

### Task 6: Dashboard — settings toggle + aggregate section on Overview

**Files:**
- Create: `src/lib/aggregateStats.ts`
- Create: `src/hooks/useAggregateStats.ts`
- Create: `src/components/dashboard/overview/AggregateOverview.tsx`
- Modify: `src/components/dashboard/CMPDashboard.tsx` (state ~line 24, handler after line 96, UI after the Cookieless switch block ~line 270)
- Modify: `src/components/dashboard/tabs/OverviewTab.tsx`
- Test: `tests/foundation/aggregate-stats.test.mjs`

**Interfaces:**
- Consumes: Task 1 `get_aggregate_summary`.
- Produces: `toAggregateSummary(raw: unknown): AggregateSummary`, `sourceLabel(r: { referrer_domain?: string; utm_source?: string; utm_medium?: string }): string`, type `AggregateSummary = { visitors: number; visits: number; pageviews: number; daysWithData: number; topSources: { label: string; visits: number; visitors: number }[]; topPages: { path: string; pageviews: number; entries: number }[]; conversions: { goalId: string; goalName: string; source: string; conversions: number; value: number }[]; conversionsByGoal: { goalId: string; goalName: string; conversions: number }[] }`; hook `useAggregateStats(siteId: string, from: string, to: string, enabled: boolean)` → TanStack `UseQueryResult<AggregateSummary>`.

- [ ] **Step 1: Write the failing test**

Create `tests/foundation/aggregate-stats.test.mjs`:

```js
// tests/foundation/aggregate-stats.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toAggregateSummary, sourceLabel } from '../../src/lib/aggregateStats.ts';

test('sourceLabel: UTM wins, then referrer, else Direct', () => {
  assert.equal(sourceLabel({ utm_source: 'linkedin', utm_medium: 'paid', referrer_domain: 'linkedin.com' }), 'linkedin / paid');
  assert.equal(sourceLabel({ utm_source: 'newsletter' }), 'newsletter');
  assert.equal(sourceLabel({ referrer_domain: 'google.com' }), 'google.com');
  assert.equal(sourceLabel({}), 'Direct');
});

test('toAggregateSummary maps the RPC payload and tolerates junk', () => {
  const s = toAggregateSummary({
    visitors: 3, visits: '4', pageviews: 6, days_with_data: 1,
    top_sources: [{ referrer_domain: 'google.com', utm_source: '', utm_medium: '', visits: 1, visitors: 1 }],
    top_pages: [{ path: '/', pageviews: 3, entries: 2 }],
    conversions: [{ goal_id: 'g1', goal_name: 'Demo', referrer_domain: '', utm_source: 'linkedin', utm_medium: 'paid', conversions: 1, value: '100' }],
    conversions_by_goal: [{ goal_id: 'g1', goal_name: 'Demo', conversions: 2 }],
  });
  assert.deepEqual(s, {
    visitors: 3, visits: 4, pageviews: 6, daysWithData: 1,
    topSources: [{ label: 'google.com', visits: 1, visitors: 1 }],
    topPages: [{ path: '/', pageviews: 3, entries: 2 }],
    conversions: [{ goalId: 'g1', goalName: 'Demo', source: 'linkedin / paid', conversions: 1, value: 100 }],
    conversionsByGoal: [{ goalId: 'g1', goalName: 'Demo', conversions: 2 }],
  });
  assert.deepEqual(toAggregateSummary(null), {
    visitors: 0, visits: 0, pageviews: 0, daysWithData: 0, topSources: [], topPages: [], conversions: [], conversionsByGoal: [],
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/foundation/aggregate-stats.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/aggregateStats.ts`:

```ts
// Maps get_aggregate_summary (supabase/migrations/20261030000001_aggregate_measurement.sql) to the
// shape the dashboard renders. No '@/' imports: the foundation tests import this file directly.

export interface AggregateSummary {
  visitors: number;
  visits: number;
  pageviews: number;
  daysWithData: number;
  topSources: { label: string; visits: number; visitors: number }[];
  topPages: { path: string; pageviews: number; entries: number }[];
  conversions: { goalId: string; goalName: string; source: string; conversions: number; value: number }[];
  conversionsByGoal: { goalId: string; goalName: string; conversions: number }[];
}

type Row = Record<string, unknown>;
const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const s = (v: unknown) => (typeof v === 'string' ? v : '');
const rows = (v: unknown): Row[] => (Array.isArray(v) ? v.filter((r): r is Row => !!r && typeof r === 'object') : []);

export function sourceLabel(r: { referrer_domain?: string; utm_source?: string; utm_medium?: string }): string {
  if (r.utm_source) return r.utm_medium ? `${r.utm_source} / ${r.utm_medium}` : r.utm_source;
  return r.referrer_domain || 'Direct';
}

export function toAggregateSummary(raw: unknown): AggregateSummary {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Row;
  const label = (x: Row) => sourceLabel({ referrer_domain: s(x.referrer_domain), utm_source: s(x.utm_source), utm_medium: s(x.utm_medium) });
  return {
    visitors: n(r.visitors),
    visits: n(r.visits),
    pageviews: n(r.pageviews),
    daysWithData: n(r.days_with_data),
    topSources: rows(r.top_sources).map(x => ({ label: label(x), visits: n(x.visits), visitors: n(x.visitors) })),
    topPages: rows(r.top_pages).map(x => ({ path: s(x.path), pageviews: n(x.pageviews), entries: n(x.entries) })),
    conversions: rows(r.conversions).map(x => ({
      goalId: s(x.goal_id), goalName: s(x.goal_name), source: label(x), conversions: n(x.conversions), value: n(x.value),
    })),
    conversionsByGoal: rows(r.conversions_by_goal).map(x => ({ goalId: s(x.goal_id), goalName: s(x.goal_name), conversions: n(x.conversions) })),
  };
}
```

Create `src/hooks/useAggregateStats.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toAggregateSummary, type AggregateSummary } from '@/lib/aggregateStats';

// get_aggregate_summary is newer than the generated Supabase types.
const rpc = supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;

/** Consent-free aggregate totals for an inclusive 'YYYY-MM-DD' range. */
export function useAggregateStats(siteId: string, from: string, to: string, enabled: boolean) {
  return useQuery({
    queryKey: ['aggregate-stats', siteId, from, to],
    enabled: enabled && !!siteId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<AggregateSummary> => {
      const { data, error } = await rpc.call(supabase, 'get_aggregate_summary', { p_site_id: siteId, p_from: from, p_to: to });
      if (error) throw new Error(error.message);
      return toAggregateSummary(data);
    },
  });
}
```

Create `src/components/dashboard/overview/AggregateOverview.tsx`:

```tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAggregateStats } from '@/hooks/useAggregateStats';

const fmt = (n: number) => n.toLocaleString('sv-SE');

export function AggregateOverview({ siteId, from, to }: { siteId: string; from: string; to: string }) {
  const { data, isLoading, error } = useAggregateStats(siteId, from, to, true);
  if (isLoading) return <div className="h-32 animate-pulse rounded-lg bg-muted" aria-busy="true" />;
  if (error || !data) return <p className="rounded-lg border p-4 text-sm">Could not load aggregate measurement.</p>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">All visitors (aggregate)</CardTitle>
        <CardDescription>
          Counted without consent: no cookies, no device storage, no persistent IDs. Visitors are counted
          per day, so someone who returns on two days counts twice.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-3 gap-4">
          {([['Visitors', data.visitors], ['Visits', data.visits], ['Page views', data.pageviews]] as const).map(([label, value]) => (
            <div key={label}>
              <div className="text-2xl font-bold">{fmt(value)}</div>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h4 className="mb-2 text-sm font-medium">Sources</h4>
            {data.topSources.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data in this period.</p>
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-muted-foreground"><th className="py-1">Source</th><th className="py-1 text-right">Visits</th><th className="py-1 text-right">Visitors</th></tr></thead>
                <tbody>
                  {data.topSources.map((r) => (
                    <tr key={r.label} className="border-t"><td className="py-1 break-all">{r.label}</td><td className="py-1 text-right">{fmt(r.visits)}</td><td className="py-1 text-right">{fmt(r.visitors)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div>
            <h4 className="mb-2 text-sm font-medium">Conversions by source</h4>
            {data.conversions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No goal conversions in this period.</p>
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-muted-foreground"><th className="py-1">Goal</th><th className="py-1">Source</th><th className="py-1 text-right">Conversions</th></tr></thead>
                <tbody>
                  {data.conversions.map((r) => (
                    <tr key={`${r.goalId} ${r.source}`} className="border-t"><td className="py-1">{r.goalName}</td><td className="py-1 break-all">{r.source}</td><td className="py-1 text-right">{fmt(r.conversions)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

In `src/components/dashboard/tabs/OverviewTab.tsx`:
- Add `import { AggregateOverview } from '@/components/dashboard/overview/AggregateOverview';`.
- After the `trackingMode` line add `const aggregateOn = (selectedSite as Site & { aggregate_measurement?: boolean }).aggregate_measurement === true;`.
- After `<KpiRow ... />` insert `{aggregateOn && <AggregateOverview siteId={selectedSite.id} from={filters.from} to={filters.to} />}`.

In `src/components/dashboard/CMPDashboard.tsx`:
- Under the `trackingMode` state (line 24) add `const [aggregateOn, setAggregateOn] = useState<boolean>((selectedSite as any).aggregate_measurement === true);`.
- After `updateTrackingMode` add:

```tsx
  const updateAggregate = async (enabled: boolean) => {
    const { error } = await supabase.from('sites').update({ aggregate_measurement: enabled } as any).eq('id', selectedSite.id);
    if (error) {
      console.error('Error updating aggregate measurement:', error);
      toast.error('Could not update aggregate measurement');
      return;
    }
    setAggregateOn(enabled);
    toast.success(enabled ? 'Aggregate measurement on — update your snippet or plugin setting too' : 'Aggregate measurement off');
  };
```

- Inside the same `CardContent`, after the Cookieless `<Alert>` (the one ending with "set Tracking mode to the same value."), add:

```tsx
              <div className="flex items-center justify-between border-t pt-4">
                <div className="space-y-0.5 pr-4">
                  <Label>Aggregate measurement (no consent required)</Label>
                  <p className="text-sm text-muted-foreground">
                    Counts page views, visits, sources and form goals for every visitor — no cookies, no device
                    storage, no persistent IDs. A daily-rotating hash, deleted after the day, groups a visitor's
                    pages. Designed to not require consent; your own legal assessment decides. Visitors who refuse
                    analytics or send Global Privacy Control are not counted.
                  </p>
                </div>
                <Switch checked={aggregateOn} onCheckedChange={updateAggregate} />
              </div>
              {aggregateOn && (
                <Alert>
                  <Shield className="h-4 w-4" />
                  <AlertDescription>
                    Copy the updated snippet from Setup, or tick “Aggregate measurement” in the WordPress plugin.
                    Without it, nothing is counted.
                  </AlertDescription>
                </Alert>
              )}
```

- [ ] **Step 4: Run tests and typecheck the touched files**

Run: `node --test tests/foundation/aggregate-stats.test.mjs`
Expected: PASS.
Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "aggregateStats|useAggregateStats|AggregateOverview|OverviewTab|CMPDashboard" || echo "no errors in touched files"`
Expected: `no errors in touched files` (the repo-wide typecheck has pre-existing errors; only the touched files must be clean. If `tsconfig.app.json` does not exist, use `tsconfig.json`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/aggregateStats.ts src/hooks/useAggregateStats.ts src/components/dashboard/overview/AggregateOverview.tsx src/components/dashboard/tabs/OverviewTab.tsx src/components/dashboard/CMPDashboard.tsx tests/foundation/aggregate-stats.test.mjs
git commit -m "feat(dashboard): aggregate measurement toggle and Overview section

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Pixel readiness logic

**Files:**
- Create: `src/lib/pixelReadiness.ts`
- Test: `tests/foundation/pixel-readiness.test.mjs`

**Interfaces:**
- Produces:

```ts
export type ReadinessState = 'no_primary_goal' | 'fix_goals' | 'aggregate_enough' | 'borderline' | 'attribution_pays';
export type PrimaryGoalStatus = 'healthy' | 'fires_too_often' | 'silent' | 'duplicate_primary' | null;
export interface ReadinessInput { hasPrimaryGoal: boolean; primaryGoalStatus: PrimaryGoalStatus; primaryConversions30d: number; acceptanceRate: number | null; adsConnected: boolean; daysOfData: number; }
export interface ReadinessResult { state: ReadinessState; effectiveConversions: number; acceptanceUsed: number; acceptanceAssumed: boolean; reasons: string[]; }
export function assessPixelReadiness(input: ReadinessInput): ReadinessResult;
export const SMART_BIDDING_MIN = 30, SMART_BIDDING_COMFORTABLE = 50, ASSUMED_ACCEPTANCE = 0.5, MIN_DAYS_OF_DATA = 7;
```

- [ ] **Step 1: Write the failing test**

Create `tests/foundation/pixel-readiness.test.mjs`:

```js
// tests/foundation/pixel-readiness.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessPixelReadiness } from '../../src/lib/pixelReadiness.ts';

const base = { hasPrimaryGoal: true, primaryGoalStatus: 'healthy', primaryConversions30d: 0, acceptanceRate: 1, adsConnected: true, daysOfData: 30 };
const state = (over) => assessPixelReadiness({ ...base, ...over }).state;

test('no primary goal, then unhealthy primary goal, short-circuit', () => {
  assert.equal(state({ hasPrimaryGoal: false, primaryConversions30d: 500 }), 'no_primary_goal');
  for (const s of ['silent', 'fires_too_often', 'duplicate_primary']) {
    assert.equal(state({ primaryGoalStatus: s, primaryConversions30d: 500 }), 'fix_goals');
  }
});

test('threshold edges use effective conversions (conversions × acceptance)', () => {
  assert.equal(state({ primaryConversions30d: 29 }), 'aggregate_enough');
  assert.equal(state({ primaryConversions30d: 30 }), 'borderline');
  assert.equal(state({ primaryConversions30d: 49 }), 'borderline');
  assert.equal(state({ primaryConversions30d: 50 }), 'attribution_pays');
  // 80 conversions behind a 55% banner → 44 seen by the ad platform
  const r = assessPixelReadiness({ ...base, primaryConversions30d: 80, acceptanceRate: 0.55 });
  assert.equal(r.effectiveConversions, 44);
  assert.equal(r.state, 'borderline');
});

test('enough volume without an ad platform is still aggregate_enough, with a reason', () => {
  const r = assessPixelReadiness({ ...base, primaryConversions30d: 200, adsConnected: false });
  assert.equal(r.state, 'aggregate_enough');
  assert.ok(r.reasons.some((x) => x.includes('no ad platform')));
});

test('brand-new empty site: assumption + short history reasons, no NaN (Review Focus 5)', () => {
  const r = assessPixelReadiness({ ...base, primaryConversions30d: 0, acceptanceRate: null, daysOfData: 2 });
  assert.equal(r.state, 'aggregate_enough');
  assert.equal(r.acceptanceAssumed, true);
  assert.equal(r.acceptanceUsed, 0.5);
  assert.equal(r.effectiveConversions, 0);
  assert.ok(r.reasons.some((x) => x.includes('assumed 50%')));
  assert.ok(r.reasons.some((x) => x.includes('2 days')));
  assert.equal(r.reasons.some((x) => x.includes('NaN')), false);
});

test('out-of-range inputs are clamped', () => {
  const r = assessPixelReadiness({ ...base, primaryConversions30d: -5, acceptanceRate: 3 });
  assert.equal(r.effectiveConversions, 0);
  assert.equal(r.acceptanceUsed, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/foundation/pixel-readiness.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/pixelReadiness.ts`:

```ts
// "Do you need the pixel?" — per site, would an ad platform get enough conversions behind a
// cookie banner for its optimisation to be worth the banner? Pure; no '@/' imports (tested directly).

export type ReadinessState = 'no_primary_goal' | 'fix_goals' | 'aggregate_enough' | 'borderline' | 'attribution_pays';
export type PrimaryGoalStatus = 'healthy' | 'fires_too_often' | 'silent' | 'duplicate_primary' | null;

export interface ReadinessInput {
  hasPrimaryGoal: boolean;
  primaryGoalStatus: PrimaryGoalStatus;
  primaryConversions30d: number;
  /** Share of banner answers granting analytics (0..1), or null without banner data. */
  acceptanceRate: number | null;
  adsConnected: boolean;
  daysOfData: number;
}

export interface ReadinessResult {
  state: ReadinessState;
  effectiveConversions: number;
  acceptanceUsed: number;
  acceptanceAssumed: boolean;
  reasons: string[];
}

// Rule of thumb from Google's Smart Bidding guidance (target CPA ≈ 30, target ROAS ≈ 50
// conversions per 30 days). Verify against current Google Ads documentation before quoting
// these numbers in marketing copy.
export const SMART_BIDDING_MIN = 30;
export const SMART_BIDDING_COMFORTABLE = 50;
// Used when the site has no banner data of its own; always shown to the user as an assumption.
export const ASSUMED_ACCEPTANCE = 0.5;
export const MIN_DAYS_OF_DATA = 7;

export function assessPixelReadiness(input: ReadinessInput): ReadinessResult {
  const acceptanceAssumed = input.acceptanceRate === null || !Number.isFinite(input.acceptanceRate);
  const acceptanceUsed = acceptanceAssumed ? ASSUMED_ACCEPTANCE : Math.min(1, Math.max(0, input.acceptanceRate as number));
  const conversions = Math.max(0, Number.isFinite(input.primaryConversions30d) ? input.primaryConversions30d : 0);
  const effectiveConversions = Math.floor(conversions * acceptanceUsed);
  const result = (state: ReadinessState, reasons: string[]): ReadinessResult =>
    ({ state, effectiveConversions, acceptanceUsed, acceptanceAssumed, reasons });

  if (!input.hasPrimaryGoal) {
    return result('no_primary_goal', ['Mark one conversion goal as Primary to get a recommendation.']);
  }
  if (input.primaryGoalStatus && input.primaryGoalStatus !== 'healthy') {
    return result('fix_goals', [`The primary goal is flagged "${input.primaryGoalStatus.replace(/_/g, ' ')}". Fix it before deciding on ad tracking.`]);
  }

  const reasons: string[] = [];
  if (acceptanceAssumed) reasons.push(`No banner data yet — assumed ${Math.round(ASSUMED_ACCEPTANCE * 100)}% consent acceptance.`);
  if (input.daysOfData < MIN_DAYS_OF_DATA) reasons.push(`Only ${Math.max(0, input.daysOfData)} days of data — the recommendation will firm up.`);
  reasons.push(`${conversions} conversions × ${Math.round(acceptanceUsed * 100)}% acceptance ≈ ${effectiveConversions} an ad platform would see per 30 days.`);

  if (effectiveConversions < SMART_BIDDING_MIN) {
    reasons.push(`Below ~${SMART_BIDDING_MIN} per month, Smart Bidding has too little to learn from.`);
    return result('aggregate_enough', reasons);
  }
  if (effectiveConversions < SMART_BIDDING_COMFORTABLE) {
    reasons.push(`Between ~${SMART_BIDDING_MIN} and ~${SMART_BIDDING_COMFORTABLE}, Smart Bidding can work but learns slowly.`);
    return result('borderline', reasons);
  }
  if (!input.adsConnected) {
    reasons.push('Enough volume, but no ad platform is connected (no Google Ads customer ID).');
    return result('aggregate_enough', reasons);
  }
  reasons.push('Enough volume for Smart Bidding — consented click IDs and Enhanced Conversions should pay off.');
  return result('attribution_pays', reasons);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/foundation/pixel-readiness.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pixelReadiness.ts tests/foundation/pixel-readiness.test.mjs
git commit -m "feat(ads): pixel readiness assessment

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Pixel readiness — data hook, card, mounts

**Files:**
- Create: `src/lib/consentAcceptance.ts`
- Modify: `src/components/dashboard/ConsentImpact.tsx:28-40` (use the shared helper)
- Create: `src/hooks/usePixelReadiness.ts`
- Create: `src/components/dashboard/PixelReadinessCard.tsx`
- Modify: `src/components/dashboard/tabs/AttributionTab.tsx` (mount after the header block)
- Modify: `src/components/dashboard/DashboardTabs.tsx:347` (mount above `ConversionGoalsConfig`)
- Test: `tests/foundation/consent-acceptance.test.mjs`

**Interfaces:**
- Consumes: Task 7 `assessPixelReadiness`; Task 6 `toAggregateSummary`; Task 1 `get_aggregate_summary`; existing `useConversionGoalHealth(siteId)` → `GoalHealth[]` with `{ goalId, status }`.
- Produces: `acceptanceRate(rows: Array<{ consent_types: unknown }>): number | null`, `fetchAnalyticsAcceptance(client, siteId, sinceIso): Promise<number | null>`; `usePixelReadiness(site: Site)` → `{ data?: ReadinessResult & { primaryGoalName: string | null; conversions: number; acceptanceRate: number | null; source: 'aggregate' | 'consented' }, isLoading: boolean, error: unknown }`; `<PixelReadinessCard selectedSite={Site} />`.

- [ ] **Step 1: Write the failing test**

Create `tests/foundation/consent-acceptance.test.mjs`:

```js
// tests/foundation/consent-acceptance.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acceptanceRate, fetchAnalyticsAcceptance } from '../../src/lib/consentAcceptance.ts';

test('acceptanceRate: share of answers granting analytics, null without answers', () => {
  assert.equal(acceptanceRate([]), null);
  assert.equal(acceptanceRate([{ consent_types: { analytics: true } }, { consent_types: { analytics: false } },
    { consent_types: null }, { consent_types: { analytics: true, marketing: true } }]), 0.5);
});

test('fetchAnalyticsAcceptance queries the last-N-days window for the site', async () => {
  const seen = [];
  const q = { select() { return q; }, eq(k, v) { seen.push([k, v]); return q; }, gte(k, v) { seen.push([k, v]); return q; },
              limit() { return Promise.resolve({ data: [{ consent_types: { analytics: true } }], error: null }); } };
  const client = { from(t) { seen.push(['table', t]); return q; } };
  assert.equal(await fetchAnalyticsAcceptance(client, 'site-1', '2026-10-01T00:00:00Z'), 1);
  assert.deepEqual(seen, [['table', 'cookie_consents'], ['site_id', 'site-1'], ['created_at', '2026-10-01T00:00:00Z']]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/foundation/consent-acceptance.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/consentAcceptance.ts`:

```ts
// Banner acceptance (analytics) — shared by ConsentImpact and pixel readiness. No '@/' imports:
// the client is passed in so the foundation tests can call it directly.

/** Share of banner answers that granted analytics, or null when nobody has answered yet. */
export function acceptanceRate(rows: Array<{ consent_types: unknown }>): number | null {
  if (rows.length === 0) return null;
  const granted = rows.filter((r) => (r.consent_types as { analytics?: unknown } | null)?.analytics === true).length;
  return granted / rows.length;
}

// deno-lint-ignore no-explicit-any
export async function fetchAnalyticsAcceptance(client: any, siteId: string, sinceIso: string): Promise<number | null> {
  const { data } = await client
    .from('cookie_consents')
    .select('consent_types, created_at')
    .eq('site_id', siteId)
    .gte('created_at', sinceIso)
    .limit(2000);
  return acceptanceRate(data ?? []);
}
```

In `src/components/dashboard/ConsentImpact.tsx`:
- Add `import { fetchAnalyticsAcceptance } from '@/lib/consentAcceptance';`.
- Replace lines 28-40 (the `cookie_consents` query and the `if/else` that sets `acceptRate`) with:

```tsx
      // Banner acceptance (analytics) over 30 days.
      setAcceptRate(await fetchAnalyticsAcceptance(supabase, selectedSite.id, since));
```

Create `src/hooks/usePixelReadiness.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useConversionGoalHealth } from '@/hooks/useConversionGoalHealth';
import { fetchAnalyticsAcceptance } from '@/lib/consentAcceptance';
import { toAggregateSummary } from '@/lib/aggregateStats';
import { assessPixelReadiness, type PrimaryGoalStatus, type ReadinessResult } from '@/lib/pixelReadiness';
import type { Site } from '@/types/dashboard';

type ReadinessSite = Site & {
  aggregate_measurement?: boolean;
  conversion_goals?: unknown;
  google_ads_customer_id?: string | null;
  google_ads_enabled?: boolean | null;
};

export interface PixelReadiness extends ReadinessResult {
  primaryGoalName: string | null;
  conversions: number;
  acceptanceRate: number | null;
  source: 'aggregate' | 'consented';
}

const DAY = 24 * 60 * 60 * 1000;
const rpc = supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;

export function usePixelReadiness(selectedSite: Site) {
  const site = selectedSite as ReadinessSite;
  const health = useConversionGoalHealth(site.id);
  const goals = Array.isArray(site.conversion_goals) ? (site.conversion_goals as Array<{ id?: string; name?: string; is_primary?: boolean }>) : [];
  const primary = goals.find((g) => g?.is_primary && typeof g.id === 'string' && typeof g.name === 'string') ?? null;
  const aggregate = site.aggregate_measurement === true;

  const query = useQuery({
    queryKey: ['pixel-readiness', site.id, primary?.id ?? null, aggregate],
    enabled: !!site.id && !health.isLoading,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<PixelReadiness> => {
      const now = Date.now();
      const sinceIso = new Date(now - 30 * DAY).toISOString();
      const acceptance = await fetchAnalyticsAcceptance(supabase, site.id, sinceIso);

      let conversions = 0;
      let daysOfData = Math.min(30, Math.floor((now - new Date(site.created_at).getTime()) / DAY));
      if (primary && aggregate) {
        const { data, error } = await rpc.call(supabase, 'get_aggregate_summary', {
          p_site_id: site.id, p_from: sinceIso.slice(0, 10), p_to: new Date(now).toISOString().slice(0, 10),
        });
        if (error) throw new Error(error.message);
        const summary = toAggregateSummary(data);
        conversions = summary.conversionsByGoal.find((g) => g.goalId === primary.id)?.conversions ?? 0;
        daysOfData = summary.daysWithData;
      } else if (primary) {
        const { count, error } = await supabase
          .from('conversion_events')
          .select('*', { count: 'exact', head: true })
          .eq('site_id', site.id)
          .eq('event_name', primary.name as string)
          .gte('created_at', sinceIso);
        if (error) throw new Error(error.message);
        conversions = count ?? 0;
      }

      const status = (health.data ?? []).find((h) => h.goalId === primary?.id)?.status ?? null;
      const result = assessPixelReadiness({
        hasPrimaryGoal: !!primary,
        primaryGoalStatus: status as PrimaryGoalStatus,
        primaryConversions30d: conversions,
        acceptanceRate: acceptance,
        adsConnected: !!site.google_ads_customer_id || site.google_ads_enabled === true,
        daysOfData: Number.isFinite(daysOfData) ? daysOfData : 0,
      });
      return { ...result, primaryGoalName: primary?.name ?? null, conversions, acceptanceRate: acceptance, source: aggregate ? 'aggregate' : 'consented' };
    },
  });

  return { data: query.data, isLoading: query.isLoading || health.isLoading, error: query.error };
}
```

Create `src/components/dashboard/PixelReadinessCard.tsx`:

```tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { usePixelReadiness } from '@/hooks/usePixelReadiness';
import type { ReadinessState } from '@/lib/pixelReadiness';
import type { Site } from '@/types/dashboard';

const COPY: Record<ReadinessState, { badge: string; headline: string; action: string }> = {
  no_primary_goal: { badge: 'Set up', headline: 'Set a primary goal first',
    action: 'Mark the conversion that matters most (e.g. demo request) as Primary in Conversion Goals.' },
  fix_goals: { badge: 'Fix goals', headline: 'Fix your primary goal first',
    action: 'A misfiring goal would mislead any ad platform. See the warning in Conversion Goals.' },
  aggregate_enough: { badge: 'Aggregate is enough', headline: 'You probably do not need the pixel',
    action: 'An ad platform would see too few conversions to optimise on, so a cookie banner likely costs more than it gives. Turn on Aggregate measurement under Consent → Tracking mode and track channels with UTM tags.' },
  borderline: { badge: 'Borderline', headline: 'Borderline — test before adding a banner',
    action: 'Run aggregate measurement for a month and compare. If volume grows, add consented click IDs for your biggest campaign first.' },
  attribution_pays: { badge: 'Attribution pays off', headline: 'The attribution layer pays off',
    action: 'Use consented click IDs + Enhanced Conversions (Settings → Integrations → HubSpot) so Smart Bidding learns from qualified leads.' },
};

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function PixelReadinessCard({ selectedSite }: { selectedSite: Site }) {
  const { data, isLoading, error } = usePixelReadiness(selectedSite);
  if (isLoading) return <div className="h-40 animate-pulse rounded-lg bg-muted" aria-busy="true" />;
  if (error || !data) return null;
  const copy = COPY[data.state];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">Do you need the pixel?</CardTitle>
          <Badge variant="outline">{copy.badge}</Badge>
        </div>
        <CardDescription>{copy.headline}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.state !== 'no_primary_goal' && (
          <div className="grid grid-cols-3 gap-4">
            <div><div className="text-2xl font-bold">{data.conversions}</div><p className="text-xs text-muted-foreground">conversions, 30 days</p></div>
            <div><div className="text-2xl font-bold">{pct(data.acceptanceUsed)}</div><p className="text-xs text-muted-foreground">{data.acceptanceAssumed ? 'acceptance (assumed)' : 'banner acceptance'}</p></div>
            <div><div className="text-2xl font-bold">{data.effectiveConversions}</div><p className="text-xs text-muted-foreground">an ad platform would see</p></div>
          </div>
        )}
        <p className="text-sm">{copy.action}</p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {data.reasons.map((r) => <li key={r}>{r}</li>)}
        </ul>
        <p className="text-xs text-muted-foreground">
          Verify: based on {data.conversions} conversions on goal “{data.primaryGoalName ?? '—'}” in the last 30 days
          ({data.source === 'aggregate' ? 'aggregate measurement, all visitors' : 'consented sessions only'}). Thresholds
          (~30 / ~50 per month) are a rule of thumb — check Google Ads’ bid strategy recommendations for your account.
        </p>
      </CardContent>
    </Card>
  );
}
```

Mounts:
- `src/components/dashboard/tabs/AttributionTab.tsx`: add `import { PixelReadinessCard } from '@/components/dashboard/PixelReadinessCard';` and insert `<PixelReadinessCard selectedSite={selectedSite} />` directly after the header `<div>` that contains `<h2 ...>Attribution Gap</h2>`. Also render it in the `if (!data) return null;` path: change that line to `if (!data) return <PixelReadinessCard selectedSite={selectedSite} />;` so a site without attribution data still gets the recommendation.
- `src/components/dashboard/DashboardTabs.tsx:347`: add the same import and render `<PixelReadinessCard selectedSite={selectedSite} />` immediately before `<ConversionGoalsConfig selectedSite={selectedSite} />`. Check the parent element: if it is not a vertical stack (`space-y-*`), wrap both in `<div className="space-y-6">…</div>`.

- [ ] **Step 4: Run tests and typecheck the touched files**

Run: `node --test tests/foundation/consent-acceptance.test.mjs tests/foundation/pixel-readiness.test.mjs`
Expected: PASS.
Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "consentAcceptance|usePixelReadiness|PixelReadinessCard|ConsentImpact|AttributionTab|DashboardTabs" || echo "no errors in touched files"`
Expected: `no errors in touched files`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/consentAcceptance.ts src/components/dashboard/ConsentImpact.tsx src/hooks/usePixelReadiness.ts src/components/dashboard/PixelReadinessCard.tsx src/components/dashboard/tabs/AttributionTab.tsx src/components/dashboard/DashboardTabs.tsx tests/foundation/consent-acceptance.test.mjs
git commit -m "feat(ads): Do-you-need-the-pixel card in Attribution and Conversion Goals

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Docs and full verification

**Files:**
- Modify: `CLAUDE.md` (new section after "Conversion & Attribution")
- Modify: `tests/foundation/README.md` (one paragraph)

- [ ] **Step 1: Document**

Append to `CLAUDE.md` after the "Conversion & Attribution" section:

```markdown
## Aggregate measurement & pixel readiness (added 2026-10-30)

Spec: `docs/superpowers/specs/2026-10-29-aggregate-measurement-and-pixel-readiness-design.md`.

- **Opt-in per site** (`sites.aggregate_measurement`, default false; Consent → Tracking mode). Counts page views,
  visits, daily visitors, sources/UTM and form/page-visit goals **without consent**.
- **Browser:** `src/lib/aggregate-beacon.js` — no storage, no IDs, no fingerprint signals; honours explicit refusal and
  GPC. Inlined by the install snippet when enabled; bundled in the WP plugin as `assets/cortiq-aggregate.js`.
  `spa-tracking.js` is unchanged and still waits for consent.
- **Server:** `aggregate-hit` Edge Function → daily-salted SHA-256 of salt|site|IP|UA → `ingest_aggregate_hit`.
  Salts and `aggregate_visitors` are deleted when the UTC day ends (`aggregate_retention`, hourly cron).
- **Reads:** `get_aggregate_summary(site, from, to)` (RLS, SECURITY INVOKER). Overview shows it when enabled.
- **Pixel readiness:** `src/lib/pixelReadiness.ts` + `PixelReadinessCard` (Ads → Attribution, Conversion Goals).
  Effective conversions = conversions × banner acceptance; thresholds ~30/~50 per 30 days are a rule of thumb.
- **Copy rule:** "designed to not require consent" — never "GDPR-compliant without consent" or "no banner needed".
  Legal review (jurist agent + DPA 1.4) before any public claim.
```

Append to `tests/foundation/README.md`:

```markdown
## Aggregate measurement (2026-10-30)

`aggregate-measurement.test.mjs` runs the migration in PGlite: visit rule, once-per-visit goals, midnight split, retention, privileges and tenant isolation of `get_aggregate_summary`. `aggregate-hit.test.mjs` covers the endpoint (sanitizing, skips, auth incl. WordPress account keys; IP/UA never reach the RPC). `aggregate-beacon.test.mjs` runs the beacon in a VM: no storage writes, refusal/GPC/Consent Mode suppression, SPA navigation, double-load guard. These do not prove the legal position; that review is separate.
```

- [ ] **Step 2: Run the full suite**

Run: `npm run test:foundation`
Expected: all tests PASS (previous count + the new files). If an unrelated test fails, run it alone on `main` (`git stash; node --test <file>; git stash pop`) to confirm it is pre-existing before continuing, and report it.

- [ ] **Step 3: Build the client**

Run: `npm run build:client`
Expected: build succeeds (the `?raw` import of `aggregate-beacon.js` resolves).

- [ ] **Step 4: Lint the touched files**

Run: `npx eslint src/lib/snippetTemplate.ts src/lib/trackingSnippet.ts src/lib/aggregateStats.ts src/lib/pixelReadiness.ts src/lib/consentAcceptance.ts src/hooks/useAggregateStats.ts src/hooks/usePixelReadiness.ts src/components/dashboard/PixelReadinessCard.tsx src/components/dashboard/overview/AggregateOverview.tsx`
Expected: no errors (warnings for `any` casts that mirror existing patterns are acceptable; fix anything else).

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md tests/foundation/README.md
git commit -m "docs: aggregate measurement and pixel readiness

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Not in this plan (rollout, needs the owner)

1. `supabase db push` of the migration and `supabase functions deploy aggregate-hit` — production changes, run by Daniel.
2. Enable on CortIQ's own site (`VITE_CORTIQ_AGGREGATE=true` + toggle) and compare with Cloudflare edge counts for a week.
3. Legal gate: `jurist` agent review, DPA 1.4, copy approval.
4. Marketing site update and LinkedIn post.

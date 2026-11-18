# Phase 1 — Measurement Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the measurement paths CortIQ already has work end to end: conversions, UTM/referrer sources, aggregate installs, consent geo + GPC, bot category, and a coverage baseline report.

**Architecture:** No new legal positions. Fixes land in SQL migrations (report RPCs, alerts, coverage), Edge Functions (store-consent, three bot inserts), the two consent banners (standalone `consent-banner.js` and the WP plugin banner) and two dashboard views. Every fix gets a Node test in `tests/foundation/` (PGlite for SQL, `edge-harness.mjs` for Edge Functions, `node:vm` for browser scripts).

**Tech Stack:** PostgreSQL (Supabase) migrations, Deno Edge Functions (TypeScript), vanilla JS tracker/banner, React 18 + TypeScript dashboard, `node --test` with `@electric-sql/pglite`.

**Spec:** `docs/superpowers/specs/2026-11-18-jurisdiction-aware-measurement-design.md` → "Phase 1 — Repair measurement" (AC1–AC8). Read the spec's "Baseline 2026-11-18" section too.

## Global Constraints

- Copy rules (CLAUDE.md): never "no consent needed", "GDPR-compliant without consent", "no banner needed"; aggregate mode is "designed to not require consent"; cookieless is "sessionStorage after consent".
- Phase 1 adds **no new legal positions**. GPC handling here is "GPC wins" until the phase 4 US pack decides otherwise (spec AC6). Any new public wording about GPC goes through the `jurist` agent before it ships.
- Aggregate measurement is **never** switched on automatically (spec AC4).
- Prod DB sites are Daniel's test sites. Use them to diagnose, never to size priorities.
- cortiq.se is the reference site for end-to-end checks.
- Any change to `public/spa-tracking.js` (built into `cortiq.js`) or `public/consent-banner.js` requires a shared version bump. Phase 1 bumps **5.5.14 → 5.5.15** once (Task 6 does it; Task 7 rides on it) in all five places: `public/spa-tracking.js:4` and `:20`, `src/lib/plugin-version.ts:6`, `wordpress-plugin/cortiq-analytics.php:6` and `:24`, `wordpress-plugin/readme.txt` (Stable tag + a `= 5.5.15 =` changelog entry), then `node scripts/build-plugin.mjs`. `tests/foundation/version-sync.test.mjs` enforces it; `npm run build` pins `public/v/5.5.15/` and updates `src/lib/sri-manifest.json` (commit both; never edit older `public/v/*`).
- Phase 2 (geo Worker) runs in parallel and bumps to 5.5.16 later. Phase 1 owns migration timestamps `20261202000001`–`20261202000099`; phase 2 owns `20261203…`.
- RLS convention: owner reads use `site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid())`; service-role-only functions `REVOKE … FROM PUBLIC, anon, authenticated` and `GRANT … TO service_role`.
- Code and comments in English. UI copy in English.
- Run all foundation tests with `npm run test:foundation` before each commit that touches shared code.
- Deploy is not part of the tasks; the final section lists it. Daniel does the dist FTP.

## Review Focus

1. **A UTM-tagged visit that also has an external referrer** — UTM must win as source/medium (GA4 rule), the referrer must not double count. Pinned in Task 2 (`utm beats referrer`).
2. **A site whose domain is stored with `www.` or a trailing path while the referrer has none (or a subdomain like `shop.site.se`)** — still a self-referral → `(direct)`. Pinned in Task 2 (`www and subdomain`).
3. **GPC visitor who clicks "Accept all" on either banner** — marketing stored as `false` locally, posted as `false`, and the server also forces `false` if an old banner sends `true`. Pinned in Task 5 (server), Task 6 (standalone) and Task 7 (plugin).
4. **Aggregate flag switched on, then off, then on again with no hits** — one open `aggregate_never` alert at most, resolved when the flag goes off or a hit arrives. Pinned in Task 4 (`flag off resolves`).
5. **An unknown time zone string or none at all in a consent request** — `geo_country` null and `geo_source = 'unknown'`, never an error and never a guessed country. Pinned in Task 5 (`bogus time zone`).

---

## File structure

| File | Responsibility | Task |
|---|---|---|
| `docs/superpowers/findings/2026-11-18-phase1-measurement-findings.md` | Root causes, data investigations, limitations | 1 |
| `supabase/migrations/20261202000001_source_self_referral_utm.sql` | `session_source_medium()` + new `get_source_breakdown` | 2 |
| `tests/foundation/source-attribution.test.mjs` | PGlite tests for Task 2 | 2 |
| `tests/foundation/utm-ingest.test.mjs` | First-touch UTM on full load + SPA | 3 |
| `supabase/migrations/20261202000002_aggregate_never_alert.sql` | `aggregate_enabled_at`, `aggregate_never` alert, `get_aggregate_install_status` | 4 |
| `supabase/functions/_shared/pipeline-alerts.ts` | label + sentence for `aggregate_never` | 4 |
| `src/components/dashboard/TrackingSnippetSetup.tsx` | "no hit in 24 h" warning | 4 |
| `tests/foundation/aggregate-never.test.mjs` | Task 4 tests | 4 |
| `supabase/migrations/20261202000003_consent_geo_source.sql` | `cookie_consents.geo_source` | 5 |
| `supabase/functions/_shared/consent-geo.ts` | `consentGeo()`, `gpcRequested()` | 5 |
| `supabase/functions/store-consent/index.ts` | writes geo, enforces GPC | 5 |
| `tests/foundation/store-consent-geo-gpc.test.mjs` | Task 5 tests | 5 |
| `public/consent-banner.js` + version files | time zone + GPC | 6 |
| `tests/foundation/consent-banner.test.mjs` | GPC tests | 6 |
| `wordpress-plugin/cortiq-analytics.php` | plugin banner time zone + GPC | 7 |
| `tests/foundation/plugin-banner-gpc.test.mjs` | Task 7 tests | 7 |
| `supabase/functions/_shared/ai-bot-registry.ts` | `storedBotCategory()` | 8 |
| `ai-bot-tracker`, `server-hit`, `cloudflare-ingest` `index.ts` | write `bot_category` | 8 |
| `supabase/migrations/20261202000004_bot_category_backfill.sql` | backfill | 8 |
| `tests/foundation/bot-category.test.mjs` | Task 8 tests | 8 |
| `src/lib/conversionSetupHint.ts` | hint logic + template list | 9 |
| `src/components/dashboard/ConversionGoalsConfig.tsx` | hint + one-click goal | 9 |
| `tests/foundation/conversion-setup-hint.test.mjs` | Task 9 tests | 9 |
| `supabase/migrations/20261202000005_measurement_coverage_v0.sql` | `measurement_coverage_v0()` | 10 |
| `tests/foundation/measurement-coverage.test.mjs` | Task 10 tests | 10 |

---

### Task 1: Findings document (AC1, AC3, AC4, AC6 investigation)

**Files:**
- Create: `docs/superpowers/findings/2026-11-18-phase1-measurement-findings.md`

**Interfaces:**
- Consumes: nothing.
- Produces: the written root causes that the spec's AC1, AC3, AC4 and AC6 ask for. Later tasks link to it.

- [ ] **Step 1: Re-run the diagnostic queries on prod (read-only)**

Use the Supabase MCP `execute_sql` (project `cxmkdtgfocgbfizawlwa`). Run each and keep the output:

```sql
-- 1. Conversions: rows ever, goals per site, completed forms per site.
select count(*) from conversion_events;
select s.domain, jsonb_array_length(coalesce(s.conversion_goals,'[]'::jsonb)) goals,
       (select count(*) from form_sessions f where f.site_id = s.id and f.completed_at is not null) completed_forms
from sites s where coalesce(s.is_active,true) order by 3 desc;

-- 2. Direct share explained: sessions with no referrer by landing path prefix (last 90 days).
select s.domain, split_part(regexp_replace(pv.url,'^https?://[^/]+',''),'/',2) first_segment, count(*)
from tracking_sessions ts join sites s on s.id = ts.site_id
join lateral (select url from page_views p where p.session_id = ts.id order by viewed_at limit 1) pv on true
where ts.referrer is null and ts.started_at > now() - interval '90 days'
group by 1,2 order by 3 desc limit 30;

-- 3. The 14 GPC + marketing rows.
select s.domain, cc.source, cc.locale, cc.policy_version, cc.created_at::date, cc.consent_types
from cookie_consents cc join sites s on s.id = cc.site_id
where cc.gpc_signal and (cc.consent_types->>'marketing')::boolean order by cc.created_at;

-- 4. The 21 analytics=false + marketing=true rows (båtguide, 2026-11-04 → 11-09).
select s.domain, cc.source, cc.locale, cc.policy_version, left(cc.user_agent,80) ua, cc.created_at
from cookie_consents cc join sites s on s.id = cc.site_id
where not (cc.consent_types->>'analytics')::boolean and (cc.consent_types->>'marketing')::boolean
order by cc.created_at;

-- 5. Aggregate flag on but never a hit.
select s.domain, s.aggregate_measurement,
       (select max(day) from aggregate_pages_daily a where a.site_id = s.id) last_hit_day
from sites s where s.aggregate_measurement;
```

- [ ] **Step 2: For query 4, decide between two causes and write which one the data supports**

The current plugin (`cortiq-analytics.php:628-631`) always renders `#cq-analytics`, so accept-all sends analytics=true. If the 21 rows have `preferences=true` too, they are accept-all clicks from an older plugin build or a theme that removed the analytics row; if `preferences=false`, they are "Save selection" with only marketing ticked (a valid choice). Check with:

```sql
select (cc.consent_types->>'preferences') pref, count(*) from cookie_consents cc
where not (cc.consent_types->>'analytics')::boolean and (cc.consent_types->>'marketing')::boolean group by 1;
```

- [ ] **Step 3: Write the findings document**

Create `docs/superpowers/findings/2026-11-18-phase1-measurement-findings.md` with exactly these sections, filling the numbers from Step 1–2:

```markdown
# Phase 1 measurement findings — 2026-11-18

Data: prod DB, test sites only. Not representative of customer volumes.

## Conversions (AC1)
- `conversion_events` has had 0 rows ever.
- Root cause: configuration gap, not a pipeline bug. Goals live in `sites.conversion_goals`; only
  itsäkerhet has goals, and they are unedited templates (`form[name="contact"], #contact-form, .contact-form`)
  that match nothing on that site. ekonom.biz (<n> completed forms) and sentrisk.se (<n>) have no goals.
- Fix: Task 9 hint + one-click "any form submission" goal; E2E on cortiq.se.

## UTM and the direct share (AC2, AC3)
- UTM ingest works: `ingest_pageview` stores first-touch `utm_*` on session INSERT. båtguide's one
  tagged visit (utm_source=chatgpt.com) is stored correctly.
- "Direct" is mostly internal traffic: <table from query 2>. These sites do not set `excludePaths` for
  `/admin`, `/dashboard`. Recommendation: set `excludePaths` (site configuration, not code).
- Bugs fixed in Task 2: own-domain referrers counted as `referral`; `get_source_breakdown` ignored UTM.
- Known limitation: a visitor who consents on page 2+ starts the session there; page 1's referrer and
  UTM are lost in full/cookieless mode. Aggregate mode (when enabled) still counts page 1's source.

## Aggregate installs (AC4)
- sentrisk.se has `aggregate_measurement = true` and has never sent a hit. It loads CortIQ from its own
  Vite bundle (`window.cortiqConfig` + injected `spa-tracking.js` after SentriSK's own consent banner) and
  never includes the aggregate beacon. Fix is in the SentriSK repo (user action, not this repo).
- CortIQ gap: the pipeline freshness rule needs 7 days of history, so a pipeline that never delivered
  never alerts. Fixed in Task 4 (`aggregate_never`).
- Deviation from spec: the Tracking Check warning is deferred. Tracking Check scans any URL and has no
  site context; the warning lives in snippet setup and the Alerts tab instead.

## GPC (AC6)
- 14 rows have `gpc_signal = true` and marketing granted: <per-site counts, dates from query 3>.
  Real visitors pressed "Accept all"; both banners recorded GPC but ignored it. Source: <cookie_banner|consent_banner>.
- Fix: Tasks 5–7. Until phase 4 decides otherwise, GPC wins over any checkbox.
- Existing rows are left unchanged (they are evidence of what was recorded at the time).

## Odd consent rows
- 21 båtguide rows with analytics=false, marketing=true: <conclusion from Step 2>.

## Bot category (AC7)
- `ai_bot_traffic.bot_category` was never written (default `other`). Fixed in Task 8 with a backfill.
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/findings/2026-11-18-phase1-measurement-findings.md
git commit -m "docs(findings): phase 1 measurement root causes"
```

---

### Task 2: Self-referrals are direct, UTM wins the source (AC3, AC2 report side)

**Files:**
- Create: `supabase/migrations/20261202000001_source_self_referral_utm.sql`
- Create: `tests/foundation/source-attribution.test.mjs`

**Interfaces:**
- Consumes: `public._norm_host(text)` (from `20260706200000_pageview_bridge.sql`), `public.session_matches_filters(ts, text, jsonb)` (from `20261109000004_tab_filters.sql`).
- Produces: `public.session_source_medium(p_referrer text, p_utm_source text, p_utm_medium text, p_site_host text, OUT source text, OUT medium text)` IMMUTABLE; `public.get_source_breakdown(uuid, date, date, text, jsonb)` same signature and JSON contract as before. Drops `public.referrer_source_medium(text)` (only caller was `get_source_breakdown`). Task 10 calls `session_source_medium`.

- [ ] **Step 1: Write the failing test**

Create `tests/foundation/source-attribution.test.mjs`:

```js
// tests/foundation/source-attribution.test.mjs
// Traffic sources: the site's own pages are never a source, and UTM tags beat the referrer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const SITE = '11111111-1111-4111-8111-111111111111';
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

async function db() {
  const pg = new PGlite();
  await pg.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE public.sites (id uuid PRIMARY KEY, user_id uuid NOT NULL, domain text);
    CREATE TABLE public.tracking_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id uuid, started_at timestamptz, referrer text,
      device_type text, page_views integer, duration_seconds integer,
      utm_source text, utm_medium text, utm_campaign text, utm_content text, utm_term text);
    CREATE TABLE public.page_views (site_id uuid, session_id uuid, url text, title text, viewed_at timestamptz);
    CREATE TABLE public.conversion_events (site_id uuid, session_id uuid, event_value numeric, created_at timestamptz);
    CREATE TABLE public.heatmap_data (site_id uuid, url text, interaction_type text, element_text text, created_at timestamptz);
    CREATE FUNCTION public._norm_host(u text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
      SELECT regexp_replace(split_part(split_part(regexp_replace(lower(coalesce(u, '')), '^https?://', ''), '/', 1), ':', 1), '^www\\.', '') $$;
  `);
  for (const f of ['20261109000003_builtin_segments.sql', '20261109000004_tab_filters.sql',
                   '20261114000001_report_rpcs.sql', '20261202000001_source_self_referral_utm.sql']) {
    await pg.exec(read(`../../supabase/migrations/${f}`));
  }
  await pg.query(`INSERT INTO sites VALUES ($1, $2, 'https://www.site.se/')`, [SITE, OWNER]);
  return pg;
}

const sm = async (pg, ref, src, med, host) =>
  (await pg.query(`SELECT source, medium FROM public.session_source_medium($1, $2, $3, $4)`, [ref, src, med, host])).rows[0];

test('PostgreSQL: own-site referrers are direct, www and subdomains included', async () => {
  const pg = await db();
  try {
    assert.deepEqual(await sm(pg, 'https://site.se/a', null, null, 'site.se'), { source: '(direct)', medium: '(none)' });
    assert.deepEqual(await sm(pg, 'https://www.site.se/a', null, null, 'site.se'), { source: '(direct)', medium: '(none)' });
    assert.deepEqual(await sm(pg, 'https://shop.site.se/', null, null, 'site.se'), { source: '(direct)', medium: '(none)' });
    // A different domain that merely ends in the same letters is not the site.
    assert.deepEqual(await sm(pg, 'https://notsite.se/', null, null, 'site.se'), { source: 'notsite.se', medium: 'referral' });
    assert.deepEqual(await sm(pg, 'https://www.google.com/', null, null, 'site.se'), { source: 'google', medium: 'organic' });
    assert.deepEqual(await sm(pg, null, null, null, 'site.se'), { source: '(direct)', medium: '(none)' });
  } finally { await pg.close(); }
});

test('PostgreSQL: utm beats referrer; utm_source without medium gets (not set)', async () => {
  const pg = await db();
  try {
    assert.deepEqual(await sm(pg, 'https://www.google.com/', 'Newsletter', 'Email', 'site.se'), { source: 'newsletter', medium: 'email' });
    assert.deepEqual(await sm(pg, null, 'chatgpt.com', null, 'site.se'), { source: 'chatgpt.com', medium: '(not set)' });
    // utm_medium alone is not a source tag; the referrer decides.
    assert.deepEqual(await sm(pg, 'https://www.linkedin.com/', null, 'cpc', 'site.se'), { source: 'linkedin', medium: 'social' });
  } finally { await pg.close(); }
});

test('PostgreSQL: get_source_breakdown groups self-referrals as direct and uses UTM', async () => {
  const pg = await db();
  try {
    await pg.query(`INSERT INTO tracking_sessions (site_id, started_at, referrer, page_views, utm_source, utm_medium) VALUES
      ($1, '2026-11-02 10:00Z', 'https://www.site.se/admin', 2, NULL, NULL),
      ($1, '2026-11-02 10:00Z', NULL, 1, NULL, NULL),
      ($1, '2026-11-02 10:00Z', 'https://www.google.com/', 1, 'newsletter', 'email'),
      ($1, '2026-11-02 10:00Z', 'https://www.google.com/', 3, NULL, NULL)`, [SITE]);
    await pg.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [OWNER]);
    const r = (await pg.query(`SELECT public.get_source_breakdown($1, '2026-11-01', '2026-11-30') AS r`, [SITE])).rows[0].r;
    assert.equal(r.total_sessions, 4);
    const by = Object.fromEntries(r.sources.map((s) => [`${s.source}/${s.medium}`, s.sessions]));
    assert.deepEqual(by, { '(direct)/(none)': 2, 'newsletter/email': 1, 'google/organic': 1 });
    await pg.query(`SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', false)`);
    await assert.rejects(pg.query(`SELECT public.get_source_breakdown($1, '2026-11-01', '2026-11-30')`, [SITE]), /not authorised/);
  } finally { await pg.close(); }
});

test('the old referrer-only classifier is gone and nothing else calls it', () => {
  const sql = read('../../supabase/migrations/20261202000001_source_self_referral_utm.sql');
  assert.match(sql, /DROP FUNCTION IF EXISTS public\.referrer_source_medium\(text\);/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/foundation/source-attribution.test.mjs`
Expected: FAIL — `ENOENT ... 20261202000001_source_self_referral_utm.sql`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20261202000001_source_self_referral_utm.sql`:

```sql
-- supabase/migrations/20261202000001_source_self_referral_utm.sql
-- Traffic sources (phase 1, spec 2026-11-18 AC2/AC3).
-- 1. A referrer on the site's own domain (www or any subdomain) is navigation, not a source:
--    it counts as (direct)/(none). Before this, ekonom.biz's own /admin pages were its top "referral".
-- 2. A session's first-touch UTM tags win over its referrer, as in GA4. utm_source without
--    utm_medium gets medium '(not set)'; utm_medium alone is ignored.
-- Same JSON contract for get_source_breakdown as 20261114000001.

DROP FUNCTION IF EXISTS public.referrer_source_medium(text);

CREATE OR REPLACE FUNCTION public.session_source_medium(
  p_referrer text, p_utm_source text, p_utm_medium text, p_site_host text,
  OUT source text, OUT medium text)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_host text;
  v_site text := regexp_replace(lower(coalesce(p_site_host, '')), '^www\.', '');
BEGIN
  IF nullif(trim(p_utm_source), '') IS NOT NULL THEN
    source := lower(left(trim(p_utm_source), 100));
    medium := coalesce(lower(left(nullif(trim(p_utm_medium), ''), 100)), '(not set)');
    RETURN;
  END IF;
  IF p_referrer IS NULL OR p_referrer = '' OR p_referrer = '(direct)' THEN
    source := '(direct)'; medium := '(none)'; RETURN;
  END IF;
  v_host := regexp_replace(lower(substring(p_referrer FROM '^[a-zA-Z][a-zA-Z0-9+.-]*://([^/:?#]+)')), '^www\.', '');
  IF v_host IS NULL OR v_host = '' THEN
    source := 'unknown'; medium := 'referral';
  ELSIF v_site <> '' AND (v_host = v_site OR v_host LIKE '%.' || v_site) THEN
    source := '(direct)'; medium := '(none)';
  ELSIF v_host LIKE '%google%' THEN
    source := 'google'; medium := 'organic';
  ELSIF v_host LIKE '%facebook%' THEN
    source := 'facebook'; medium := 'social';
  ELSIF v_host LIKE '%instagram%' THEN
    source := 'instagram'; medium := 'social';
  ELSIF v_host LIKE '%youtube%' THEN
    source := 'youtube'; medium := 'social';
  ELSIF v_host LIKE '%twitter%' OR v_host IN ('x.com', 't.co') THEN
    source := 'twitter'; medium := 'social';
  ELSIF v_host LIKE '%linkedin%' THEN
    source := 'linkedin'; medium := 'social';
  ELSE
    source := v_host; medium := 'referral';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_source_breakdown(
  p_site_id uuid, p_from date, p_to date,
  p_path    text DEFAULT NULL,
  p_segment jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
  v_host   text;
BEGIN
  SELECT public._norm_host(s.domain) INTO v_host FROM public.sites s
   WHERE s.id = p_site_id AND s.user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from + 1 > 366 THEN
    RAISE EXCEPTION 'invalid range' USING ERRCODE = '22023';
  END IF;

  WITH sess AS (
    SELECT ts.id, rs.source, rs.medium,
           coalesce(ts.page_views, 0) AS pv, coalesce(ts.duration_seconds, 0) AS dur
    FROM public.tracking_sessions ts
    CROSS JOIN LATERAL public.session_source_medium(ts.referrer, ts.utm_source, ts.utm_medium, v_host) rs
    WHERE ts.site_id = p_site_id
      AND ts.started_at >= p_from AND ts.started_at < p_to + 1
      AND ((p_path IS NULL AND p_segment IS NULL) OR public.session_matches_filters(ts, p_path, p_segment))
  ),
  conv AS (
    SELECT DISTINCT ce.session_id
    FROM public.conversion_events ce
    WHERE ce.site_id = p_site_id
      AND ce.created_at >= p_from AND ce.created_at < p_to + 1
  ),
  agg AS (
    SELECT s.source, s.medium,
           count(*)                          AS sessions,
           sum(s.pv)                         AS page_views,
           count(*) FILTER (WHERE s.pv <= 1) AS bounces,
           sum(s.dur)                        AS duration_seconds,
           count(c.session_id)               AS conversions
    FROM sess s
    LEFT JOIN conv c ON c.session_id = s.id
    GROUP BY s.source, s.medium
  )
  SELECT jsonb_build_object(
    'total_sessions', (SELECT count(*) FROM sess),
    'sources', coalesce((SELECT jsonb_agg(jsonb_build_object(
                 'source', source, 'medium', medium, 'sessions', sessions, 'page_views', page_views,
                 'bounces', bounces, 'duration_seconds', duration_seconds, 'conversions', conversions
               ) ORDER BY sessions DESC, source, medium) FROM agg), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.session_source_medium(text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_source_breakdown(uuid, date, date, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_source_breakdown(uuid, date, date, text, jsonb) TO authenticated;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/foundation/source-attribution.test.mjs tests/foundation/report-rpcs.test.mjs`
Expected: PASS (report-rpcs still runs the old migration alone and is unaffected).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261202000001_source_self_referral_utm.sql tests/foundation/source-attribution.test.mjs
git commit -m "fix(reports): own-site referrers count as direct, UTM beats referrer in sources"
```

---

### Task 3: UTM ingest test — full load and SPA navigation (AC2)

**Files:**
- Create: `tests/foundation/utm-ingest.test.mjs`

**Interfaces:**
- Consumes: `public._url_param` (`20261015110000_session_utm.sql`), `public.ingest_pageview(text,text,text,text,timestamptz,text,text,text)` (`20261124000001_session_browser_os.sql`), `public.touch_tracking_session` and `sites.session_timeout_minutes` (`20261108000001`, `20261120000001`).
- Produces: a regression test only. No production change is expected; if a step fails, fix the code it names and say so in the commit.

- [ ] **Step 1: Write the test**

```js
// tests/foundation/utm-ingest.test.mjs
// Spec 2026-11-18 phase 1 AC2: a visit with utm_* lands in tracking_sessions on a full page load
// and keeps it across SPA route changes (first touch). The aggregate side is covered by
// aggregate-measurement.sql and aggregate-helpers.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const SITE = '11111111-1111-4111-8111-111111111111';

test('PostgreSQL: first-touch UTM on landing, kept on SPA views, new visit takes new tags', async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE public.sites (id uuid PRIMARY KEY, user_id uuid, domain text);
      CREATE TABLE public.tracking_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id uuid, session_id text,
        device_type text, browser text, os text, referrer text, started_at timestamptz, last_activity timestamptz,
        page_views int, duration_seconds int, country_code text,
        utm_source text, utm_medium text, utm_campaign text, utm_term text, utm_content text);
      CREATE TABLE public.page_views (id uuid DEFAULT gen_random_uuid(), site_id uuid, session_id uuid, url text,
        viewed_at timestamptz, referrer text);
      CREATE FUNCTION public._norm_host(u text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
        SELECT regexp_replace(split_part(split_part(regexp_replace(lower(coalesce(u, '')), '^https?://', ''), '/', 1), ':', 1), '^www\\.', '') $$;
      INSERT INTO sites VALUES ('${SITE}', '${SITE}', 'site.se');`);
    // The real _url_param (percent-decoding) — only the function block, not the old ingest_pageview.
    const utm = read('../../supabase/migrations/20261015110000_session_utm.sql');
    await pg.exec(utm.match(/CREATE OR REPLACE FUNCTION public\._url_param[\s\S]*?\n\$\$;/)[0]);
    await pg.exec(read('../../supabase/migrations/20261108000001_visit_inactivity_timeout.sql'));
    await pg.exec(read('../../supabase/migrations/20261120000001_session_timeout.sql'));
    await pg.exec(read('../../supabase/migrations/20261124000001_session_browser_os.sql'));

    const view = (url, at, ref = null) => pg.query(
      `SELECT public.ingest_pageview($1, 's1', 'desktop', $2, $3::timestamptz)`, [url, ref, at]);
    const sessions = async () => (await pg.query(
      `SELECT utm_source, utm_medium, utm_campaign, page_views FROM tracking_sessions ORDER BY started_at`)).rows;

    // Full page load with tags (percent-encoded campaign), then two SPA views without tags.
    await view('https://www.site.se/?utm_source=x&utm_medium=y&utm_campaign=z%20q4', '2026-11-20 10:00Z', 'https://www.linkedin.com/');
    await view('https://www.site.se/pricing', '2026-11-20 10:01Z');
    await view('https://www.site.se/contact?utm_source=other', '2026-11-20 10:02Z');
    assert.deepEqual(await sessions(), [{ utm_source: 'x', utm_medium: 'y', utm_campaign: 'z q4', page_views: 3 }]);

    // After the 30-minute timeout the same tab starts a new visit with its own tags.
    await view('https://www.site.se/?utm_source=news&utm_medium=email', '2026-11-20 11:00Z');
    const rows = await sessions();
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[1], { utm_source: 'news', utm_medium: 'email', utm_campaign: null, page_views: 1 });
  } finally {
    await pg.close();
  }
});

test('tracker sends the full URL (with query string) on every page view, SPA included', () => {
  const tracker = read('../../public/spa-tracking.js');
  // trackEvent's metadata carries window.location.href, which keeps ?utm_*.
  assert.match(tracker, /url: window\.location\.href,/);
  // SPA route changes go through the same trackPageView.
  assert.match(tracker, /history\.pushState = function\(/);
  assert.match(tracker, /window\.addEventListener\('popstate', checkPathChange\)/);
});
```

- [ ] **Step 2: Run the test**

Run: `node --test tests/foundation/utm-ingest.test.mjs`
Expected: PASS. If `20261108000001_visit_inactivity_timeout.sql` needs a table the fixture lacks, add that table to the fixture `CREATE` block (copy its columns from the error message) — do not change the migration.

- [ ] **Step 3: Commit**

```bash
git add tests/foundation/utm-ingest.test.mjs
git commit -m "test(utm): first-touch UTM on full load and SPA views"
```

---

### Task 4: Aggregate flag on but no hit → alert and setup warning (AC4)

**Files:**
- Create: `supabase/migrations/20261202000002_aggregate_never_alert.sql`
- Modify: `supabase/functions/_shared/pipeline-alerts.ts`
- Modify: `src/components/dashboard/TrackingSnippetSetup.tsx` (state block ~:74-90, JSX after the amber block at ~:237-242)
- Create: `tests/foundation/aggregate-never.test.mjs`

**Interfaces:**
- Consumes: `public.pipeline_alerts`, `public.pipeline_activity(timestamptz, timestamptz)`, `public.check_pipeline_freshness(timestamptz)` from `20261115000001_pipeline_freshness.sql`.
- Produces:
  - column `sites.aggregate_enabled_at timestamptz` (set by trigger `sites_aggregate_enabled_at` when `aggregate_measurement` turns true; null when false).
  - alert pipeline value `'aggregate_never'` in `pipeline_alerts`; `last_seen_at` = `aggregate_enabled_at`, `expected` = 0.
  - RPC `public.get_aggregate_install_status(p_site_id uuid) RETURNS jsonb` → `{ "enabled": bool, "enabled_at": timestamptz|null, "last_hit_day": date|null, "missing": bool }` (`missing` = enabled ≥ 24 h ago and no `aggregate_pages_daily` row on/after the enable day). Owner only.
  - `Pipeline` type gains `'aggregate_never'`; `alertSentence` returns a dedicated sentence for it.

- [ ] **Step 1: Write the failing test**

Create `tests/foundation/aggregate-never.test.mjs`:

```js
// tests/foundation/aggregate-never.test.mjs
// Spec 2026-11-18 phase 1 AC4: a site with aggregate measurement on that has never sent a hit
// gets an alert after 24 h (the freshness rule needs 7 days of history, so it never fired).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { alertSentence, PIPELINES } from '../../supabase/functions/_shared/pipeline-alerts.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const S1 = '11111111-1111-4111-8111-111111111111';
const S2 = '22222222-2222-4222-8222-222222222222';
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

async function db() {
  const pg = new PGlite();
  await pg.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE public.sites (id uuid PRIMARY KEY, user_id uuid NOT NULL, is_active boolean DEFAULT true,
      aggregate_measurement boolean NOT NULL DEFAULT false);
    CREATE TABLE public.page_views (site_id uuid, viewed_at timestamptz);
    CREATE TABLE public.cookie_consents (site_id uuid, created_at timestamptz);
    CREATE TABLE public.ai_bot_traffic (site_id uuid, source text, detected_at timestamptz);
    CREATE TABLE public.link_click_counts (site_id uuid, updated_at timestamptz);
    CREATE TABLE public.aggregate_pages_daily (site_id uuid, day date);
    GRANT SELECT ON public.sites TO authenticated;
    INSERT INTO public.sites (id, user_id) VALUES ('${S1}', '${OWNER}'), ('${S2}', '${OWNER}');
  `);
  await pg.exec(read('../../supabase/migrations/20261115000001_pipeline_freshness.sql'));
  await pg.exec(read('../../supabase/migrations/20261202000002_aggregate_never_alert.sql'));
  return pg;
}
const open = async (pg) => (await pg.query(
  `SELECT site_id, pipeline FROM public.pipeline_alerts WHERE resolved_at IS NULL ORDER BY site_id`)).rows;
const check = (pg, now) => pg.query(`SELECT * FROM public.check_pipeline_freshness($1)`, [now]);

test('PostgreSQL: enabling sets aggregate_enabled_at; disabling clears it', async () => {
  const pg = await db();
  try {
    await pg.exec(`UPDATE sites SET aggregate_measurement = true WHERE id = '${S1}'`);
    assert.ok((await pg.query(`SELECT aggregate_enabled_at FROM sites WHERE id = $1`, [S1])).rows[0].aggregate_enabled_at);
    await pg.exec(`UPDATE sites SET aggregate_measurement = false WHERE id = '${S1}'`);
    assert.equal((await pg.query(`SELECT aggregate_enabled_at FROM sites WHERE id = $1`, [S1])).rows[0].aggregate_enabled_at, null);
  } finally { await pg.close(); }
});

test('PostgreSQL: no hit 24 h after enabling opens one aggregate_never alert; a hit resolves it', async () => {
  const pg = await db();
  try {
    await pg.exec(`UPDATE sites SET aggregate_measurement = true, aggregate_enabled_at = '2026-11-20 08:00Z' WHERE id IN ('${S1}', '${S2}')`);
    await pg.exec(`INSERT INTO aggregate_pages_daily VALUES ('${S2}', '2026-11-20')`);
    await check(pg, '2026-11-21 07:00Z');           // 23 h: too early
    assert.deepEqual(await open(pg), []);
    await check(pg, '2026-11-21 09:00Z');           // 25 h: S1 alerts, S2 has a hit
    assert.deepEqual(await open(pg), [{ site_id: S1, pipeline: 'aggregate_never' }]);
    await check(pg, '2026-11-21 10:00Z');           // no duplicate
    assert.equal((await pg.query(`SELECT count(*)::int n FROM pipeline_alerts`)).rows[0].n, 1);
    await pg.exec(`INSERT INTO aggregate_pages_daily VALUES ('${S1}', '2026-11-21')`);
    await check(pg, '2026-11-21 11:00Z');
    assert.deepEqual(await open(pg), []);
  } finally { await pg.close(); }
});

test('PostgreSQL: flag off resolves the alert; on again later starts a new 24 h window', async () => {
  const pg = await db();
  try {
    await pg.exec(`UPDATE sites SET aggregate_measurement = true, aggregate_enabled_at = '2026-11-20 08:00Z' WHERE id = '${S1}'`);
    await check(pg, '2026-11-21 09:00Z');
    assert.equal((await open(pg)).length, 1);
    await pg.exec(`UPDATE sites SET aggregate_measurement = false WHERE id = '${S1}'`);
    await check(pg, '2026-11-21 10:00Z');
    assert.deepEqual(await open(pg), []);
    await pg.exec(`UPDATE sites SET aggregate_measurement = true WHERE id = '${S1}'`);
    await pg.exec(`UPDATE sites SET aggregate_enabled_at = '2026-11-22 08:00Z' WHERE id = '${S1}'`);
    await check(pg, '2026-11-22 20:00Z');
    assert.deepEqual(await open(pg), [], 'new window has not elapsed');
  } finally { await pg.close(); }
});

test('PostgreSQL: install status for the owner only', async () => {
  const pg = await db();
  try {
    await pg.exec(`UPDATE sites SET aggregate_measurement = true, aggregate_enabled_at = now() - interval '2 days' WHERE id = '${S1}'`);
    await pg.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [OWNER]);
    const s = (await pg.query(`SELECT public.get_aggregate_install_status($1) AS s`, [S1])).rows[0].s;
    assert.equal(s.enabled, true);
    assert.equal(s.last_hit_day, null);
    assert.equal(s.missing, true);
    await pg.query(`SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', false)`);
    await assert.rejects(pg.query(`SELECT public.get_aggregate_install_status($1)`, [S1]), /not authorised/);
  } finally { await pg.close(); }
});

test('alert wording for a pipeline that never delivered', () => {
  assert.equal(PIPELINES.aggregate_never.label, 'Aggregate measurement (no hits yet)');
  const s = alertSentence({ pipeline: 'aggregate_never', last_seen_at: '2026-11-20T08:00:00Z', expected: 0 }, new Date('2026-11-22T08:00:00Z'));
  assert.equal(s, 'Aggregate measurement was turned on 2 days ago and no hit has arrived since.');
});

test('snippet setup warns when the flag is on and no hit has arrived in 24 h', () => {
  const ui = read('../../src/components/dashboard/TrackingSnippetSetup.tsx');
  assert.match(ui, /rpc\('get_aggregate_install_status', \{ p_site_id: siteId \}\)/);
  assert.match(ui, /installStatus\?\.missing &&/);
  assert.match(ui, /no aggregate hit has arrived/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/foundation/aggregate-never.test.mjs`
Expected: FAIL — missing migration file.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20261202000002_aggregate_never_alert.sql`:

```sql
-- supabase/migrations/20261202000002_aggregate_never_alert.sql
-- Spec 2026-11-18 phase 1 AC4. A site with aggregate measurement on that never sends a hit was
-- invisible: check_pipeline_freshness needs 7 days of history. sentrisk.se had the flag on and
-- no beacon in its install. New alert 'aggregate_never': flag on for 24 h, no aggregate_pages_daily
-- row since the day it was turned on. Resolves when a hit arrives or the flag goes off.
-- Same body as 20261115000001 otherwise.

ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS aggregate_enabled_at timestamptz;
COMMENT ON COLUMN public.sites.aggregate_enabled_at IS
  'When aggregate_measurement last turned true; null while off. Set by trigger sites_aggregate_enabled_at.';

UPDATE public.sites SET aggregate_enabled_at = now() WHERE aggregate_measurement AND aggregate_enabled_at IS NULL;

CREATE OR REPLACE FUNCTION public.sites_set_aggregate_enabled_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.aggregate_measurement AND (TG_OP = 'INSERT' OR NOT coalesce(OLD.aggregate_measurement, false)) THEN
    NEW.aggregate_enabled_at := now();
  ELSIF NOT NEW.aggregate_measurement THEN
    NEW.aggregate_enabled_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sites_aggregate_enabled_at ON public.sites;
CREATE TRIGGER sites_aggregate_enabled_at
  BEFORE INSERT OR UPDATE OF aggregate_measurement ON public.sites
  FOR EACH ROW EXECUTE FUNCTION public.sites_set_aggregate_enabled_at();

CREATE OR REPLACE FUNCTION public.check_pipeline_freshness(p_now timestamptz DEFAULT now())
RETURNS SETOF public.pipeline_alerts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.pipeline_alerts a SET resolved_at = p_now
    FROM public.pipeline_activity(p_now - interval '28 days', p_now) s
   WHERE a.resolved_at IS NULL AND s.site_id = a.site_id AND s.pipeline = a.pipeline AND s.last_at > a.last_seen_at;

  -- aggregate_never: resolved by any hit on/after the enable day, or by the flag going off.
  UPDATE public.pipeline_alerts a SET resolved_at = p_now
   WHERE a.resolved_at IS NULL AND a.pipeline = 'aggregate_never'
     AND (NOT EXISTS (SELECT 1 FROM public.sites st WHERE st.id = a.site_id AND st.aggregate_measurement)
          OR EXISTS (SELECT 1 FROM public.aggregate_pages_daily ap
                      WHERE ap.site_id = a.site_id AND ap.day >= (a.last_seen_at AT TIME ZONE 'UTC')::date));

  INSERT INTO public.pipeline_alerts (site_id, pipeline, last_seen_at, expected, opened_at)
  SELECT s.site_id, s.pipeline, s.last_at, floor(s.expected)::integer, p_now
    FROM (
      SELECT a.*, h.history_days,
             a.n / (h.history_days * 24) * extract(epoch FROM p_now - a.last_at) / 3600 AS expected,
             floor(extract(epoch FROM p_now - a.last_at) / 86400) AS silent_days
        FROM public.pipeline_activity(p_now - interval '28 days', p_now) a
        CROSS JOIN LATERAL (SELECT ceil(extract(epoch FROM p_now - a.first_at) / 86400) AS history_days) h
    ) s
    JOIN public.sites st ON st.id = s.site_id AND coalesce(st.is_active, true)
   WHERE p_now - s.last_at >= interval '36 hours'
     AND s.history_days >= 7
     AND s.expected >= 12
     AND power(greatest(0, 1 - s.days / s.history_days), s.silent_days) <= 0.01
  ON CONFLICT (site_id, pipeline) WHERE resolved_at IS NULL DO NOTHING;

  INSERT INTO public.pipeline_alerts (site_id, pipeline, last_seen_at, expected, opened_at)
  SELECT st.id, 'aggregate_never', st.aggregate_enabled_at, 0, p_now
    FROM public.sites st
   WHERE coalesce(st.is_active, true) AND st.aggregate_measurement
     AND st.aggregate_enabled_at IS NOT NULL AND st.aggregate_enabled_at <= p_now - interval '24 hours'
     AND NOT EXISTS (SELECT 1 FROM public.aggregate_pages_daily ap
                      WHERE ap.site_id = st.id AND ap.day >= (st.aggregate_enabled_at AT TIME ZONE 'UTC')::date)
  ON CONFLICT (site_id, pipeline) WHERE resolved_at IS NULL DO NOTHING;

  RETURN QUERY
    SELECT * FROM public.pipeline_alerts a
     WHERE (a.resolved_at IS NULL AND a.opened_notified_at IS NULL)
        OR (a.resolved_at IS NOT NULL AND a.opened_notified_at IS NOT NULL AND a.resolved_notified_at IS NULL)
     ORDER BY a.site_id, a.opened_at;
END;
$$;

REVOKE ALL ON FUNCTION public.check_pipeline_freshness(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_pipeline_freshness(timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.get_aggregate_install_status(p_site_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_on   boolean;
  v_at   timestamptz;
  v_last date;
BEGIN
  SELECT s.aggregate_measurement, s.aggregate_enabled_at INTO v_on, v_at
    FROM public.sites s WHERE s.id = p_site_id AND s.user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501';
  END IF;
  SELECT max(ap.day) INTO v_last FROM public.aggregate_pages_daily ap WHERE ap.site_id = p_site_id;
  RETURN jsonb_build_object(
    'enabled', v_on, 'enabled_at', v_at, 'last_hit_day', v_last,
    'missing', coalesce(v_on AND v_at <= now() - interval '24 hours'
                        AND (v_last IS NULL OR v_last < (v_at AT TIME ZONE 'UTC')::date), false));
END;
$$;

REVOKE ALL ON FUNCTION public.get_aggregate_install_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_aggregate_install_status(uuid) TO authenticated;
```

- [ ] **Step 4: Update `supabase/functions/_shared/pipeline-alerts.ts`**

Change the `Pipeline` type, add the entry, and special-case the sentence:

```ts
export type Pipeline = 'page_views' | 'consents' | 'ai_bots_server' | 'link_clicks' | 'aggregate' | 'aggregate_never';
```

Add to `PIPELINES` after `aggregate`:

```ts
  aggregate_never: {
    label: 'Aggregate measurement (no hits yet)',
    check: 'Aggregate measurement is on, but the install never sent a hit. Copy the install snippet again (it includes the aggregate beacon) or update the WordPress plugin. Custom loaders must include the beacon too.',
  },
```

Replace `alertSentence` with:

```ts
/** "Page views stopped 5 days ago; about 30 were expected since." */
export function alertSentence(alert: Pick<PipelineAlert, 'pipeline' | 'last_seen_at' | 'expected'>, now = new Date()): string {
  const hours = Math.max(0, (now.getTime() - Date.parse(alert.last_seen_at)) / 3_600_000);
  const ago = hours < 48 ? `${Math.round(hours)} hours` : `${Math.round(hours / 24)} days`;
  if (alert.pipeline === 'aggregate_never') {
    return `Aggregate measurement was turned on ${ago} ago and no hit has arrived since.`;
  }
  return `${pipelineLabel(alert.pipeline)} stopped arriving ${ago} ago; about ${alert.expected} were expected since, going by the last 28 days.`;
}
```

- [ ] **Step 5: Add the warning to `TrackingSnippetSetup.tsx`**

After the `useState` block (~:90) add:

```tsx
  // Flag on for 24 h and no aggregate hit since: the installed snippet/plugin lacks the beacon.
  const [installStatus, setInstallStatus] = useState<{ missing: boolean; last_hit_day: string | null } | null>(null);
  useEffect(() => {
    let live = true;
    supabase.rpc('get_aggregate_install_status', { p_site_id: siteId }).then(({ data }) => {
      if (live && data) setInstallStatus(data as { missing: boolean; last_hit_day: string | null });
    });
    return () => { live = false; };
  }, [siteId, aggregateOn]);
```

Directly after the amber `consentSetup === 'none' && !aggregateOn` block (~:242) add:

```tsx
      {aggregateOn && installStatus?.missing && (
        <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
          Aggregate measurement has been on for more than 24 hours, but no aggregate hit has arrived.
          The snippet installed on the site does not include the aggregate beacon: copy the snippet below
          again, or update the WordPress plugin. A custom loader must include the beacon too.
        </div>
      )}
```

If `supabase.rpc` typing rejects the unknown RPC name, regenerate types is not required: cast as the codebase already does elsewhere (`supabase.rpc('get_aggregate_install_status' as never, { p_site_id: siteId } as never)`) and adjust the test regex in Step 1 to `rpc\('get_aggregate_install_status'` only.

- [ ] **Step 6: Run tests**

Run: `node --test tests/foundation/aggregate-never.test.mjs tests/foundation/pipeline-freshness.test.mjs`
Expected: PASS (pipeline-freshness still runs only the old migration).

- [ ] **Step 7: Check the email/dashboard consumers use `alertSentence`/`PIPELINES` and need nothing else**

Run: `grep -rn "PIPELINES\|alertSentence\|pipelineLabel" src supabase/functions --include=*.ts --include=*.tsx`
Expected: every consumer goes through these helpers. If one switches on `pipeline` values directly, add `'aggregate_never'` there in the same commit.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20261202000002_aggregate_never_alert.sql supabase/functions/_shared/pipeline-alerts.ts src/components/dashboard/TrackingSnippetSetup.tsx tests/foundation/aggregate-never.test.mjs
git commit -m "feat(alerts): warn when aggregate measurement is on but no hit ever arrives"
```

---

### Task 5: store-consent writes geo and enforces GPC (AC5, AC6 server side)

**Files:**
- Create: `supabase/migrations/20261202000003_consent_geo_source.sql`
- Create: `supabase/functions/_shared/consent-geo.ts`
- Modify: `supabase/functions/store-consent/index.ts` (interface :11-29, `consentData` ~:167-179, update payload ~:192-202)
- Create: `tests/foundation/store-consent-geo-gpc.test.mjs`

**Interfaces:**
- Consumes: `countryFromTimeZone(tz: unknown): string | null` from `supabase/functions/_shared/tz-country.js`.
- Produces:
  - column `cookie_consents.geo_source text` with CHECK `geo_source IN ('ip','timezone','unknown')`.
  - `consentGeo(timeZone: unknown): { geo_country: string | null; geo_source: 'timezone' | 'unknown' }`.
  - `gpcRequested(body: { gpc_signal?: unknown }, headers: Headers): boolean` — true when `gpc_signal === true` or header `sec-gpc` is `1`.
  - store-consent request field `time_zone?: string` (IANA name). Phase 2 replaces `consentGeo` with `resolveGeo` and sets `geo_source = 'ip'`.

- [ ] **Step 1: Write the failing test**

```js
// tests/foundation/store-consent-geo-gpc.test.mjs
// Spec 2026-11-18 phase 1 AC5/AC6: every new consent row has geo_country + geo_source, and a
// GPC signal always records marketing as refused.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadEdge, mockDatabase } from './edge-harness.mjs';
import { consentGeo, gpcRequested } from '../../supabase/functions/_shared/consent-geo.ts';

const SITE = '11111111-1111-4111-8111-111111111111';

test('consentGeo: IANA zone → country; bogus or missing → unknown', () => {
  assert.deepEqual(consentGeo('Europe/Stockholm'), { geo_country: 'SE', geo_source: 'timezone' });
  assert.deepEqual(consentGeo('America/Los_Angeles'), { geo_country: 'US', geo_source: 'timezone' });
  assert.deepEqual(consentGeo('Not/AZone'), { geo_country: null, geo_source: 'unknown' });
  assert.deepEqual(consentGeo(undefined), { geo_country: null, geo_source: 'unknown' });
  assert.deepEqual(consentGeo({ toString: () => 'Europe/Stockholm' }), { geo_country: null, geo_source: 'unknown' });
});

test('gpcRequested: body flag or Sec-GPC header', () => {
  assert.equal(gpcRequested({ gpc_signal: true }, new Headers()), true);
  assert.equal(gpcRequested({}, new Headers({ 'sec-gpc': '1' })), true);
  assert.equal(gpcRequested({ gpc_signal: 'true' }, new Headers()), false);
  assert.equal(gpcRequested({}, new Headers({ 'sec-gpc': '0' })), false);
});

function setup() {
  const db = mockDatabase((op) => {
    if (op.table === 'sites') return { data: { id: SITE }, error: null };
    if (op.table === 'cookie_consents' && op.type === 'select') return { data: null, error: null };
    if (op.table === 'cookie_consents' && op.type === 'insert') return { data: { id: 'row-1', ...op.payload }, error: null };
    return { data: null, error: null };
  }, async (name) => ({ data: name === 'check_rate_limit' ? true : null, error: null }));
  return { db, handler: loadEdge('store-consent', db.client) };
}
const post = (body, headers = {}) => new Request('https://fn.test/store-consent', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
});
const choice = (marketing) => ({ site_id: SITE, session_id: 'c-1', consent_types: { analytics: true, marketing, preferences: false } });
const inserted = (db) => db.calls.find((c) => c.table === 'cookie_consents' && c.type === 'insert').payload;

test('store-consent: time zone → geo_country/geo_source on the row', async () => {
  const { db, handler } = setup();
  const res = await handler(post({ ...choice(false), time_zone: 'Europe/Berlin' }));
  assert.equal(res.status, 200);
  const row = inserted(db);
  assert.equal(row.geo_country, 'DE');
  assert.equal(row.geo_source, 'timezone');
});

test('store-consent: bogus time zone → unknown, no guess', async () => {
  const { db, handler } = setup();
  await handler(post({ ...choice(false), time_zone: 'Mars/Olympus' }));
  assert.deepEqual([inserted(db).geo_country, inserted(db).geo_source], [null, 'unknown']);
});

test('store-consent: GPC forces marketing false even if an old banner sent true', async () => {
  for (const [body, headers] of [[{ ...choice(true), gpc_signal: true }, {}], [choice(true), { 'Sec-GPC': '1' }]]) {
    const { db, handler } = setup();
    await handler(post(body, headers));
    const row = inserted(db);
    assert.equal(row.consent_types.marketing, false);
    assert.equal(row.consent_types.analytics, true, 'other categories untouched');
    assert.equal(row.gpc_signal, true);
  }
});

test('store-consent: update path writes the same geo and GPC result', () => {
  const src = readFileSync('supabase/functions/store-consent/index.ts', 'utf8');
  const update = src.slice(src.indexOf(".update({"), src.indexOf("})", src.indexOf(".update({")));
  assert.match(update, /geo_country: consentData\.geo_country/);
  assert.match(update, /geo_source: consentData\.geo_source/);
  assert.match(update, /consent_types: consentData\.consent_types/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/foundation/store-consent-geo-gpc.test.mjs`
Expected: FAIL — cannot find `_shared/consent-geo.ts`.

- [ ] **Step 3: Migration**

Create `supabase/migrations/20261202000003_consent_geo_source.sql`:

```sql
-- supabase/migrations/20261202000003_consent_geo_source.sql
-- Spec 2026-11-18 phase 1 AC5: every new consent row records where its country came from.
-- 'timezone' = browser time zone (phase 1), 'ip' = signed edge geo (phase 2), 'unknown' = neither.
-- geo_country existed since 20250724171956 and was never written. Old rows stay NULL.
ALTER TABLE public.cookie_consents ADD COLUMN IF NOT EXISTS geo_source text;
ALTER TABLE public.cookie_consents DROP CONSTRAINT IF EXISTS cookie_consents_geo_source_check;
ALTER TABLE public.cookie_consents ADD CONSTRAINT cookie_consents_geo_source_check
  CHECK (geo_source IS NULL OR geo_source IN ('ip', 'timezone', 'unknown'));
COMMENT ON COLUMN public.cookie_consents.geo_source IS 'ip | timezone | unknown — how geo_country was derived.';
```

- [ ] **Step 4: Shared helper**

Create `supabase/functions/_shared/consent-geo.ts`:

```ts
// Country and GPC for the consent ledger (spec 2026-11-18 phase 1 AC5/AC6).
// Phase 1 uses the browser time zone; phase 2 replaces this with signed edge geo (source 'ip').
import { countryFromTimeZone } from './tz-country.js';

export type ConsentGeo = { geo_country: string | null; geo_source: 'timezone' | 'unknown' };

export function consentGeo(timeZone: unknown): ConsentGeo {
  const country = typeof timeZone === 'string' ? countryFromTimeZone(timeZone.slice(0, 64)) : null;
  return country ? { geo_country: country, geo_source: 'timezone' } : { geo_country: null, geo_source: 'unknown' };
}

/** Global Privacy Control: the banner's flag or the browser's Sec-GPC request header. */
export function gpcRequested(body: { gpc_signal?: unknown }, headers: Headers): boolean {
  return body.gpc_signal === true || headers.get('sec-gpc')?.trim() === '1';
}
```

- [ ] **Step 5: Wire it into `store-consent/index.ts`**

Add the import after the `anonymizeIP` import:

```ts
import { consentGeo, gpcRequested } from "../_shared/consent-geo.ts";
```

Add to `ConsentRequest` (after `page_url`):

```ts
  time_zone?: string; // IANA zone from the banner (Intl), used for geo_country until phase 2
```

Directly after the `requestData.consent_types = { … };` normalization add:

```ts
    // GPC wins (spec 2026-11-18 AC6): a GPC visitor's marketing choice is recorded as refused,
    // whatever the banner sent. Phase 4 decides whether a later specific consent may change that.
    const gpc = gpcRequested(requestData, req.headers);
    if (gpc) requestData.consent_types.marketing = false;
```

In `consentData`, replace `gpc_signal: requestData.gpc_signal || false,` with:

```ts
      gpc_signal: gpc,
      ...consentGeo(requestData.time_zone),
```

In the `.update({ … })` payload, replace `consent_types: requestData.consent_types,` with `consent_types: consentData.consent_types,` and add:

```ts
          geo_country: consentData.geo_country,
          geo_source: consentData.geo_source,
```

Note: `consent_given` is computed from `requestData.consent_types` after the GPC override, so a GPC "accept all" with analytics still counts as `consent_given = true` (analytics granted), and a GPC marketing-only choice becomes `false`. That is intended.

- [ ] **Step 6: Run tests**

Run: `node --test tests/foundation/store-consent-geo-gpc.test.mjs tests/foundation/server-consent.test.mjs tests/foundation/consent-acceptance.test.mjs`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20261202000003_consent_geo_source.sql supabase/functions/_shared/consent-geo.ts supabase/functions/store-consent/index.ts tests/foundation/store-consent-geo-gpc.test.mjs
git commit -m "feat(consent): record geo_country/geo_source and let GPC refuse marketing server-side"
```

---

### Task 6: Standalone banner — time zone + GPC, version 5.5.15 (AC5, AC6)

**Files:**
- Modify: `public/consent-banner.js` (translations `T` ~:87-200, `postConsent` :291-321, `saveConsent` :358-381, render ~:436-460, accept handler :494-496, `row()` :514)
- Modify: `tests/foundation/consent-banner.test.mjs` (`page()` helper, new tests)
- Modify (version bump): `public/spa-tracking.js:4,:20`, `src/lib/plugin-version.ts:6`, `wordpress-plugin/cortiq-analytics.php:6,:24`, `wordpress-plugin/readme.txt`, rebuilt plugin zip

**Interfaces:**
- Consumes: store-consent field `time_zone` (Task 5).
- Produces: banner sends `time_zone`; with `navigator.globalPrivacyControl === true` marketing is stored/posted/pushed as `false`, the marketing toggle renders unchecked + disabled, and a note `tx.gpc` is shown. Shared version 5.5.15.

- [ ] **Step 1: Extend the test harness and write failing tests**

In `tests/foundation/consent-banner.test.mjs`, change the `page()` signature to accept `nav = {}` and use it in the context:

```js
function page({ attrs = {}, stored = null, htmlLang = '', hostname = 'www.vikingage.se', cortiqConfig, extraWindow = {}, nav = {} } = {}) {
```

```js
    window, document, navigator: { language: 'en-US', ...nav }, location: { hostname },
    Intl: { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: nav.timeZone ?? 'Europe/Stockholm' }) }) },
```

Append tests:

```js
test('consent record carries the browser time zone', async () => {
  const p = page({ attrs: { 'data-site-id': 'site-uuid' }, nav: { timeZone: 'America/Toronto' } });
  p.byId.get('crtq-cb-accept').click();
  await p.flush();
  assert.equal(p.posts[0].body.time_zone, 'America/Toronto');
});

test('GPC: accept all keeps marketing refused everywhere, other categories granted', async () => {
  const p = page({ attrs: { 'data-site-id': 'site-uuid', 'data-categories': 'analytics,marketing' }, nav: { globalPrivacyControl: true } });
  const banner = p.byId.get('crtq-consent-banner');
  assert.match(banner.innerHTML, /Global Privacy Control/);
  assert.equal(p.byId.get('crtq-toggle-marketing').checked, false);
  assert.equal(p.byId.get('crtq-toggle-marketing').disabled, true);
  p.byId.get('crtq-cb-accept').click();
  await p.flush();
  assert.deepEqual({ a: p.saved().analytics, m: p.saved().marketing }, { a: true, m: false });
  assert.equal(p.posts[0].body.consent_types.marketing, false);
  assert.equal(p.posts[0].body.gpc_signal, true);
  assert.equal(p.events[0].marketing, false);
});

test('GPC: a checked marketing toggle (tampered DOM) is still saved as refused', () => {
  const p = page({ attrs: { 'data-site-id': 'site-uuid', 'data-categories': 'analytics,marketing' }, nav: { globalPrivacyControl: true } });
  p.byId.get('crtq-toggle-marketing').checked = true;
  p.byId.get('crtq-cb-save').click();
  assert.equal(p.saved().marketing, false);
});

test('no GPC: marketing toggle is a normal choice', () => {
  const p = page({ attrs: { 'data-site-id': 'site-uuid', 'data-categories': 'analytics,marketing' } });
  assert.equal(p.byId.get('crtq-toggle-marketing').disabled, false);
  p.byId.get('crtq-cb-accept').click();
  assert.equal(p.saved().marketing, true);
});
```

The DOM stub registers `disabled` only via `makeElement` defaults; update the `body.appendChild` loop in `page()` to also record it:

```js
        child.checked = /\schecked/.test(m[0]);
        child.disabled = /\sdisabled/.test(m[0]);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/foundation/consent-banner.test.mjs`
Expected: the four new tests FAIL (`time_zone` undefined, no GPC note, marketing true).

- [ ] **Step 3: Implement in `public/consent-banner.js`**

a) Near `ALL_CATEGORIES` (:49) add:

```js
  // Global Privacy Control (spec 2026-11-18 AC6): marketing/sale/sharing stays refused while the
  // browser sends GPC. No checkbox can override it in this version.
  var GPC = (function () { try { return navigator.globalPrivacyControl === true; } catch (e) { return false; } })();
  function timeZone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; }
  }
```

b) Add a `gpc` string to every language in `T` (next to `storage`):

- sv: `gpc: 'Din webbläsare skickar Global Privacy Control (GPC). Därför är marknadsföring avstängd.'`
- en: `gpc: 'Your browser sends Global Privacy Control (GPC), so marketing is turned off.'`
- de: `gpc: 'Ihr Browser sendet Global Privacy Control (GPC). Marketing ist deshalb deaktiviert.'`
- fr: `gpc: 'Votre navigateur envoie le signal Global Privacy Control (GPC) : le marketing est donc désactivé.'`
- pt: `gpc: 'O seu navegador envia Global Privacy Control (GPC), por isso o marketing está desativado.'`

c) In `saveConsent`, change the loop body:

```js
      types[key] = cfg.categories.indexOf(key) !== -1 && chosen[key] === true && !(GPC && key === 'marketing');
```

d) In `postConsent`'s `body`, replace the `gpc_signal` line and add the zone:

```js
        gpc_signal: GPC,
        time_zone: timeZone(),
```

e) In the render, pass a disabled + unchecked marketing row under GPC. Replace the `rows` map with:

```js
    var rows = shown.map(function (key) {
      var label = (key === 'necessary' ? tx.cats.necessary : categoryText(key))[0];
      var locked = key === 'necessary' || (GPC && key === 'marketing');
      var on = key === 'necessary' || (saved[key] === true && !(GPC && key === 'marketing'));
      return row(key, label, '', locked, on, dark, muted);
    });
```

and directly after the `<ul …>' + purposes + '</ul>'` line add:

```js
          (GPC && cfg.categories.indexOf('marketing') !== -1 ? '<p style="margin:6px 0 0;color:' + muted + ';font-size:12px;">' + tx.gpc + '</p>' : ''),
```

The accept handler stays `saveConsent({ analytics: true, marketing: true, preferences: true })`; step (c) refuses marketing under GPC.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/foundation/consent-banner.test.mjs tests/foundation/consent-reprompt.test.mjs`
Expected: PASS.

- [ ] **Step 5: Bump the shared version to 5.5.15**

- `public/spa-tracking.js`: line 4 comment and line 20 version string `5.5.14` → `5.5.15`.
- `src/lib/plugin-version.ts:6` → `'5.5.15'`.
- `wordpress-plugin/cortiq-analytics.php:6` (`Version:`) and `:24` (constant) → `5.5.15`.
- `wordpress-plugin/readme.txt`: `Stable tag: 5.5.15`; add at the top of the changelog:

```
= 5.5.15 =
* Consent banner: with Global Privacy Control (GPC) on, marketing stays off and the banner says why.
* Consent records include the browser time zone, used to record the visitor's country.
```

Then run:

```bash
node scripts/build-plugin.mjs
npm run build
```

Expected: `public/v/5.5.15/` created, `src/lib/sri-manifest.json` `latest` = `5.5.15`.

- [ ] **Step 6: Run the version and SRI tests**

Run: `node --test tests/foundation/version-sync.test.mjs tests/foundation/sri-pin.test.mjs tests/foundation/csp-hashes.test.mjs`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add public/consent-banner.js tests/foundation/consent-banner.test.mjs public/spa-tracking.js src/lib/plugin-version.ts wordpress-plugin/ public/v/5.5.15 src/lib/sri-manifest.json
git commit -m "feat(banner): GPC keeps marketing refused, consent carries time zone (5.5.15)"
```

Check `git status` afterwards: if the build rewrote the plugin zip for older versions with line-ending-only diffs, revert those files (`git checkout -- <file>`).

---

### Task 7: WordPress plugin banner — time zone + GPC (AC5, AC6)

**Files:**
- Modify: `wordpress-plugin/cortiq-analytics.php` (`cortiq_banner_strings` :89-200, marketing row :515-521, `CQ_T` :542-547, script :556-640)
- Create: `tests/foundation/plugin-banner-gpc.test.mjs`

**Interfaces:**
- Consumes: store-consent `time_zone` (Task 5); version 5.5.15 from Task 6 (no second bump; if Task 6 is not merged yet, do Task 6 first).
- Produces: plugin banner sends `time_zone`, saves/posts marketing `false` under GPC, disables `#cq-marketing` and shows `CQ_T.gpc`.

- [ ] **Step 1: Write the failing test**

The banner script mixes PHP; extract the `save` function and the handlers and run them in `node:vm` with stubs.

```js
// tests/foundation/plugin-banner-gpc.test.mjs
// Spec 2026-11-18 AC5/AC6 for the WordPress plugin banner (source of every consent row in prod).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const php = readFileSync('wordpress-plugin/cortiq-analytics.php', 'utf8');

// The inline banner script between "(function(){" after CQ_API and its closing "})();".
function bannerScript() {
  const start = php.indexOf("var CQ_API = '");
  const body = php.slice(start, php.indexOf('})();', start));
  // Replace PHP echoes with test values.
  return body
    .replace(/<\?php echo esc_js\( CORTIQ_API \); \?>/, 'https://api.test')
    .replace(/<\?php echo wp_json_encode\([\s\S]*?\) \); \?>/, '{"show":"s","hide":"h","nec":"N","pref":"P","stat":"S","mark":"M","cdate":"d","cid":"i","cats":"c","gpc":"GPC note"}')
    .replace(/<\?php echo max\( 1, intval\( \$opts\['reprompt_cooldown_days'\] \) \); \?>/, '365')
    .replace(/<\?php echo max\( 1, intval\( \$opts\['reprompt_reject_days'\] \) \); \?>/, '180')
    .replace(/<\?php echo ! empty\( \$opts\['geo_gating'\] \) \? 'true' : 'false'; \?>/, 'false')
    .replace(/<\?php echo esc_js\( \$opts\['[a-z_]+'\] \); \?>/g, 'x');
}

function run({ gpc }) {
  const els = {};
  const el = (id) => (els[id] ||= { id, checked: false, disabled: false, style: {}, innerHTML: '', textContent: '', className: '',
    querySelector: () => null, onclick: null });
  const posts = [];
  const store = new Map();
  const context = {
    document: { getElementById: el },
    navigator: { language: 'sv-SE', globalPrivacyControl: gpc },
    Intl: { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: 'America/New_York' }) }) },
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
    window: { dispatchEvent() {}, crypto: { getRandomValues: (a) => a } },
    CustomEvent: class { constructor(n, i) { this.detail = i.detail; } },
    location: { href: 'https://site.test/' },
    fetch: (url, init) => { posts.push(JSON.parse(init.body)); return { catch() {} }; },
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'), Date, JSON, Math, String,
  };
  runInNewContext(bannerScript() + '\n})();', context);
  return { els, posts, saved: () => JSON.parse(store.get('site_cookie_consent')) };
}

test('plugin banner: accept all under GPC saves and posts marketing false, time zone sent', () => {
  const b = run({ gpc: true });
  assert.equal(b.els['cq-marketing'].disabled, true);
  b.els['cq-accept-all'].onclick();
  assert.equal(b.saved().marketing, false);
  assert.equal(b.saved().analytics, true);
  assert.equal(b.posts[0].consent_types.marketing, false);
  assert.equal(b.posts[0].gpc_signal, true);
  assert.equal(b.posts[0].time_zone, 'America/New_York');
});

test('plugin banner: no GPC → accept all grants marketing', () => {
  const b = run({ gpc: false });
  assert.equal(b.els['cq-marketing'].disabled, false);
  b.els['cq-accept-all'].onclick();
  assert.equal(b.saved().marketing, true);
});

test('plugin banner: every language has a GPC note', () => {
  const langs = [...php.matchAll(/'(en|sv|de|fr)' => array\(/g)].map((m) => m[1]);
  assert.ok(langs.length >= 3);
  assert.equal((php.match(/'gpc'\s*=>/g) || []).length, langs.length);
  assert.match(php, /'gpc'\s*=> \$t\['gpc'\]/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/foundation/plugin-banner-gpc.test.mjs`
Expected: FAIL (marketing true, no `time_zone`, no `'gpc'` strings). If the extraction throws first, adjust only the `.replace` patterns in the test to match the file's exact PHP echoes.

- [ ] **Step 3: Implement in `cortiq-analytics.php`**

a) Add a `'gpc'` key to every language array in `cortiq_banner_strings` (after `'close'`):

- en: `'gpc' => 'Your browser sends Global Privacy Control (GPC), so marketing is turned off.',`
- sv: `'gpc' => 'Din webbläsare skickar Global Privacy Control (GPC). Därför är marknadsföring avstängd.',`
- de: `'gpc' => 'Ihr Browser sendet Global Privacy Control (GPC). Marketing ist deshalb deaktiviert.',`
- fr: `'gpc' => 'Votre navigateur envoie le signal Global Privacy Control (GPC) : le marketing est donc désactivé.',`

b) Under the marketing row's description `<div class="cq-cat-desc">…marketing_desc…</div>` add:

```php
          <div class="cq-cat-desc" id="cq-gpc-note" style="display:none"><?php echo esc_html( $t['gpc'] ); ?></div>
```

c) In `CQ_T` add `'gpc' => $t['gpc'],`.

d) After `var locale  = (navigator.language || 'sv');` add:

```js
  // Global Privacy Control (spec 2026-11-18 AC6): marketing stays refused while GPC is on.
  var GPC = navigator.globalPrivacyControl === true;
  function tz(){ try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch(e){ return ''; } }
  if (GPC) {
    chkMark.checked = false; chkMark.disabled = true;
    var gpcNote = document.getElementById('cq-gpc-note'); if (gpcNote) { gpcNote.style.display = 'block'; }
  }
```

e) First line of `save(pref,anal,mark)`: `if (GPC) { mark = false; }`. In its `JSON.stringify({…})` replace `gpc_signal:(navigator.globalPrivacyControl===true),` with `gpc_signal:GPC, time_zone:tz(),`.

f) Accept-all handler: `chkMark.checked=!GPC;` instead of `chkMark.checked=true;` (save already forces false).

- [ ] **Step 4: Run tests**

Run: `node --test tests/foundation/plugin-banner-gpc.test.mjs tests/foundation/consent-reprompt.test.mjs tests/foundation/version-sync.test.mjs`
Expected: PASS.

- [ ] **Step 5: Rebuild the plugin zip**

Run: `node scripts/build-plugin.mjs`

- [ ] **Step 6: Commit**

```bash
git add wordpress-plugin/ tests/foundation/plugin-banner-gpc.test.mjs
git commit -m "feat(plugin): banner honours GPC for marketing and sends the time zone"
```

---

### Task 8: `bot_category` from the registry on every insert + backfill (AC7)

**Files:**
- Modify: `supabase/functions/_shared/ai-bot-registry.ts` (after `classifyBot`, ~:101)
- Modify: `supabase/functions/ai-bot-tracker/index.ts:183-197`, `supabase/functions/server-hit/index.ts:124-143`, `supabase/functions/cloudflare-ingest/index.ts:276-288`
- Create: `supabase/migrations/20261202000004_bot_category_backfill.sql`
- Create: `tests/foundation/bot-category.test.mjs`

**Interfaces:**
- Consumes: `classifyBot(ua: string): { botType; botName; botCategory: 'training'|'agentic'|'citation'|null; registryMatch: boolean }`.
- Produces: `storedBotCategory(c: { botCategory: BotCategory | null; registryMatch: boolean }): 'training' | 'agentic' | 'citation' | 'other'`. `ai_bot_traffic.bot_category` holds those four values on new rows. Phase 5 groups by it.

- [ ] **Step 1: Write the failing test**

```js
// tests/foundation/bot-category.test.mjs
// Spec 2026-11-18 phase 1 AC7: bot_category comes from the registry on every new ai_bot_traffic row.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { classifyBot, storedBotCategory } from '../../supabase/functions/_shared/ai-bot-registry.ts';

test('storedBotCategory: registry bots get their category, everything else other', () => {
  assert.equal(storedBotCategory(classifyBot('Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)')), 'training');
  assert.equal(storedBotCategory(classifyBot('Mozilla/5.0 ChatGPT-User/1.0')), 'agentic');
  assert.equal(storedBotCategory(classifyBot('Mozilla/5.0 PerplexityBot/1.0')), 'citation');
  // The generic fallback says "citation" without a registry match; it must not be stored as such.
  const generic = classifyBot('SomeCrawler/1.0 bot');
  assert.equal(generic.registryMatch, false);
  assert.equal(storedBotCategory(generic), 'other');
});

test('all three ai_bot_traffic writers set bot_category through storedBotCategory', () => {
  for (const fn of ['ai-bot-tracker', 'server-hit', 'cloudflare-ingest']) {
    const src = readFileSync(`supabase/functions/${fn}/index.ts`, 'utf8');
    const insert = src.slice(src.indexOf("from('ai_bot_traffic')") - 400, src.indexOf("from('ai_bot_traffic')") + 1200);
    assert.match(src, /storedBotCategory/, fn);
    assert.match(src, /bot_category:\s/, `${fn} writes bot_category`);
    assert.ok(insert.length > 0);
  }
});

test('PostgreSQL: backfill maps request_type for registry rows, leaves others as other', async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`CREATE TABLE public.ai_bot_traffic (id serial, bot_name text, request_type text, bot_category text DEFAULT 'other');
      INSERT INTO ai_bot_traffic (bot_name, request_type) VALUES
        ('GPTBot','training'), ('ChatGPT-User','agentic'), ('PerplexityBot','citation'),
        ('Honeypot visitor','unknown'), ('X','unknown'), ('Y', NULL);`);
    await pg.exec(readFileSync('supabase/migrations/20261202000004_bot_category_backfill.sql', 'utf8'));
    const rows = (await pg.query(`SELECT bot_name, bot_category FROM ai_bot_traffic ORDER BY id`)).rows;
    assert.deepEqual(rows.map((r) => r.bot_category), ['training', 'agentic', 'citation', 'other', 'other', 'other']);
  } finally { await pg.close(); }
});
```

Use UA strings that match the registry patterns: open `supabase/functions/_shared/ai-bot-registry.ts`, find the GPTBot, ChatGPT-User and PerplexityBot entries and confirm each test UA matches its `pattern`. Adjust only the test strings if not.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/foundation/bot-category.test.mjs`
Expected: FAIL — `storedBotCategory` is not exported.

- [ ] **Step 3: Add the helper to `ai-bot-registry.ts`** (right after `classifyBot`)

```ts
/** Value for ai_bot_traffic.bot_category: the registry category, or 'other' for anything the
 *  registry does not know (the generic fallback's 'citation' is a guess, not a classification). */
export function storedBotCategory(c: { botCategory: BotCategory | null; registryMatch: boolean }): BotCategory | 'other' {
  return c.registryMatch && c.botCategory ? c.botCategory : 'other';
}
```

(`BotCategory` is the type `classifyBot` already uses; export it if it is not exported.)

- [ ] **Step 4: Set `bot_category` in the three inserts**

`ai-bot-tracker/index.ts`: extend the import to `import { classifyBot, storedBotCategory, type BotCategory } from "../_shared/ai-bot-registry.ts";`. At :144 keep the destructuring but also keep the full result: `const classification = classifyBot(ua); const { botType, botName, botCategory } = classification;` (preserve the existing type annotation on the destructure). In the insert object add after `request_type: requestType,`:

```ts
        bot_category: storedBotCategory(classification),
```

`server-hit/index.ts`: import `storedBotCategory` with `classifyBot`; in `rows.push({…})` add after `request_type: …,`:

```ts
      bot_category: storedBotCategory(bot),
```

`cloudflare-ingest/index.ts`: import `storedBotCategory` from `../_shared/ai-bot-registry.ts` next to the existing classifier import; add after `request_type: ai.botCategory,`:

```ts
        bot_category:    storedBotCategory(ai),
```

- [ ] **Step 5: Backfill migration**

Create `supabase/migrations/20261202000004_bot_category_backfill.sql`:

```sql
-- supabase/migrations/20261202000004_bot_category_backfill.sql
-- Spec 2026-11-18 phase 1 AC7. ai_bot_traffic.bot_category (20260327000000) was never written, so
-- every row says 'other'. New rows get it from the registry (storedBotCategory). Old rows: the
-- three writers stored the registry category in request_type, so copy it where it is one of the
-- three registry categories. 'unknown' and NULL stay 'other'.
UPDATE public.ai_bot_traffic
   SET bot_category = request_type
 WHERE request_type IN ('training', 'agentic', 'citation')
   AND bot_category IS DISTINCT FROM request_type;

COMMENT ON COLUMN public.ai_bot_traffic.bot_category IS
  'training | agentic | citation (from the AI bot registry) | other (not in the registry)';
```

Note for the reviewer: ai-bot-tracker can set `request_type` to `citation`/`agentic` from citation data or a visual JS probe even for non-registry UAs; those old rows get that category from the backfill. That matches what the dashboard already showed for them; new rows use the registry only.

- [ ] **Step 6: Run tests**

Run: `node --test tests/foundation/bot-category.test.mjs tests/foundation/server-hit.test.mjs tests/foundation/ai-bot-tracker-evidence.test.mjs tests/foundation/marketing-bot-claims.test.mjs`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/ai-bot-registry.ts supabase/functions/ai-bot-tracker/index.ts supabase/functions/server-hit/index.ts supabase/functions/cloudflare-ingest/index.ts supabase/migrations/20261202000004_bot_category_backfill.sql tests/foundation/bot-category.test.mjs
git commit -m "fix(bots): store registry bot_category on every ai_bot_traffic row, backfill old rows"
```

---

### Task 9: Conversion setup hint + one-click form goal + E2E on cortiq.se (AC1)

**Files:**
- Create: `src/lib/conversionSetupHint.ts`
- Modify: `src/components/dashboard/ConversionGoalsConfig.tsx` (`predefinedGoals` :136-160 moves to the lib; hint above "Active conversion goals" ~:176)
- Create: `tests/foundation/conversion-setup-hint.test.mjs`

**Interfaces:**
- Consumes: `form_sessions` (owner-readable via RLS "Site owners can view form sessions"; columns `site_id`, `completed_at`); `sites.conversion_goals`.
- Produces:
  - `PREDEFINED_GOALS: ReadonlyArray<{ name: string; type: 'form_submission' | 'phone_click'; selector: string; value: number }>` (the four existing templates, unchanged).
  - `ANY_FORM_GOAL = { name: 'Any form submission', type: 'form_submission', selector: 'form', value: 0 }`.
  - `conversionSetupHint(input: { completedForms30d: number; goals: Array<{ type: string; selector: string }> }): 'ok' | 'no_goals' | 'template_only'` — `no_goals` when forms were completed and no goals exist; `template_only` when forms were completed and every goal's selector equals a `PREDEFINED_GOALS` selector; else `ok`.

- [ ] **Step 1: Write the failing test**

```js
// tests/foundation/conversion-setup-hint.test.mjs
// Spec 2026-11-18 phase 1 AC1: 0 conversions came from missing or unedited goals while forms were
// being completed. The Goals view says so and offers a one-click "any form submission" goal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { conversionSetupHint, PREDEFINED_GOALS, ANY_FORM_GOAL } from '../../src/lib/conversionSetupHint.ts';
import { normalizeGoals, clientGoals } from '../../supabase/functions/_shared/conversion-goals.js';

test('hint: completed forms and no goals → no_goals', () => {
  assert.equal(conversionSetupHint({ completedForms30d: 50, goals: [] }), 'no_goals');
});
test('hint: only unedited templates → template_only', () => {
  const goals = PREDEFINED_GOALS.slice(0, 2).map((g) => ({ type: g.type, selector: g.selector }));
  assert.equal(conversionSetupHint({ completedForms30d: 3, goals }), 'template_only');
});
test('hint: a real goal, or no completed forms → ok', () => {
  assert.equal(conversionSetupHint({ completedForms30d: 3, goals: [{ type: 'form_submission', selector: '#signup' }] }), 'ok');
  assert.equal(conversionSetupHint({ completedForms30d: 0, goals: [] }), 'ok');
});
test('the one-click goal survives server normalization and reaches the tracker', () => {
  const stored = normalizeGoals([{ id: 'goal_1', ...ANY_FORM_GOAL }]);
  assert.equal(stored.length, 1);
  assert.deepEqual(clientGoals(stored).map((g) => [g.type, g.selector]), [['form_submission', 'form']]);
});
test('Goals view uses the lib and counts completed forms server-side', () => {
  const ui = readFileSync('src/components/dashboard/ConversionGoalsConfig.tsx', 'utf8');
  assert.match(ui, /from '@\/lib\/conversionSetupHint'/);
  assert.match(ui, /from\('form_sessions'\)\s*\.select\('id', \{ count: 'exact', head: true \}\)/);
  assert.match(ui, /\.not\('completed_at', 'is', null\)/);
  assert.doesNotMatch(ui, /const predefinedGoals = \[/);
});
```

Check `clientGoals`'s return shape in `supabase/functions/_shared/conversion-goals.js` first; if it returns objects with different keys than `type`/`selector`, adjust the map in the test, not the lib.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/foundation/conversion-setup-hint.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/lib/conversionSetupHint.ts`**

```ts
// Why a site with real form activity has no conversions (spec 2026-11-18 phase 1 AC1):
// either no goals at all, or only the unedited templates, whose selectors match no real form.

export const PREDEFINED_GOALS = [
  { name: 'Contact form', type: 'form_submission', selector: 'form[name="contact"], #contact-form, .contact-form', value: 50 },
  { name: 'Phone click', type: 'phone_click', selector: 'a[href^="tel:"], .phone-link, .call-button', value: 25 },
  { name: 'Quote request', type: 'form_submission', selector: 'form[name="quote"], #quote-form, .quote-form', value: 100 },
  { name: 'Newsletter signup', type: 'form_submission', selector: 'form[name="newsletter"], #newsletter, .newsletter-signup', value: 15 },
] as const;

/** Counts every successful form submit on the site. Visitors' input is never read. */
export const ANY_FORM_GOAL = { name: 'Any form submission', type: 'form_submission', selector: 'form', value: 0 } as const;

export type ConversionSetupHint = 'ok' | 'no_goals' | 'template_only';

export function conversionSetupHint(input: { completedForms30d: number; goals: Array<{ type: string; selector: string }> }): ConversionSetupHint {
  if (!(input.completedForms30d > 0)) return 'ok';
  if (input.goals.length === 0) return 'no_goals';
  const templates = new Set(PREDEFINED_GOALS.map((g) => g.selector));
  return input.goals.every((g) => templates.has(g.selector)) ? 'template_only' : 'ok';
}
```

- [ ] **Step 4: Use it in `ConversionGoalsConfig.tsx`**

- Delete the local `const predefinedGoals = [ … ];` and import:

```tsx
import { ANY_FORM_GOAL, PREDEFINED_GOALS, conversionSetupHint } from '@/lib/conversionSetupHint';
```

  Replace every `predefinedGoals` reference with `PREDEFINED_GOALS`.
- Add state + load next to the other effects:

```tsx
  const [completedForms30d, setCompletedForms30d] = useState(0);
  useEffect(() => {
    let live = true;
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    supabase.from('form_sessions').select('id', { count: 'exact', head: true })
      .eq('site_id', selectedSite.id).not('completed_at', 'is', null).gte('completed_at', since)
      .then(({ count }) => { if (live) setCompletedForms30d(count ?? 0); });
    return () => { live = false; };
  }, [selectedSite.id]);
  const hint = conversionSetupHint({ completedForms30d, goals });
  const addAnyFormGoal = () => setGoals([...goals, { id: `goal_${Date.now()}`, ...ANY_FORM_GOAL, is_primary: goals.length === 0 }]);
```

- Directly above `<h4 className="font-medium">Active conversion goals …` render:

```tsx
          {hint !== 'ok' && (
            <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm space-y-2">
              <p>
                {completedForms30d} forms were completed on this site in the last 30 days, but no conversion was recorded:{' '}
                {hint === 'no_goals'
                  ? 'the site has no conversion goals.'
                  : 'the goals still use the example selectors, which match no form on the site.'}
              </p>
              <Button size="sm" onClick={addAnyFormGoal}>Add goal: any form submission</Button>
              <p className="text-xs text-muted-foreground">Then press Save. You can narrow the selector later.</p>
            </div>
          )}
```

  (`Button` is already imported in this file; if not, import it from `@/components/ui/button`.)

- [ ] **Step 5: Run tests and the type check**

Run: `node --test tests/foundation/conversion-setup-hint.test.mjs tests/foundation/conversion-goals.test.mjs tests/foundation/goal-matching.test.mjs && npx tsc --noEmit -p tsconfig.app.json`
Expected: PASS; no new type errors in the touched files (the build skips tsc, so compare against `git stash` output if the project has existing errors).

- [ ] **Step 6: Commit**

```bash
git add src/lib/conversionSetupHint.ts src/components/dashboard/ConversionGoalsConfig.tsx tests/foundation/conversion-setup-hint.test.mjs
git commit -m "feat(goals): explain missing conversions and offer a one-click form goal"
```

- [ ] **Step 7: E2E on cortiq.se (after deploy, manual, record the result in the findings doc)**

1. In the dashboard for cortiq.se: Goals → add a `page_visit` goal for `/contact/thanks/` (or any real page) and the "Any form submission" goal; Save.
2. Open cortiq.se in a private window, accept analytics, submit a form, then open the page-visit goal URL.
3. Within 60 s: `select event_name, event_type, created_at from conversion_events where site_id = '<cortiq site id>' order by created_at desc limit 5;` — expect both rows.
4. With aggregate measurement on for cortiq.se, repeat in a fresh private window and **refuse** consent: `select * from aggregate_conversions_daily where site_id = '<id>' and day = current_date;` — expect the page-visit goal count (form goals in aggregate mode count only if the beacon's submit matcher fires).
5. Append the result under "Conversions (AC1)" in the findings doc and commit: `git commit -am "docs(findings): conversion E2E on cortiq.se"`.

---

### Task 10: Coverage v0 report (AC8)

**Files:**
- Create: `supabase/migrations/20261202000005_measurement_coverage_v0.sql`
- Create: `tests/foundation/measurement-coverage.test.mjs`

**Interfaces:**
- Consumes: `tracking_sessions`, `cookie_consents`, `aggregate_sources_daily (site_id, day, visits, …)`, `ai_bot_traffic (source, detected_at)`, `conversion_events (session_id, created_at)`, `public.session_source_medium` (Task 2), `public._norm_host`.
- Produces: `public.measurement_coverage_v0(p_from date, p_to date) RETURNS TABLE (site_id uuid, domain text, consent_rows bigint, consents_analytics bigint, consents_marketing bigint, consented_sessions bigint, aggregate_visits bigint, server_bot_hits bigint, conversions bigint, conversions_with_source bigint)` — SECURITY DEFINER, service_role only. Phase 6 builds the dashboard on it.

- [ ] **Step 1: Write the failing test**

```js
// tests/foundation/measurement-coverage.test.mjs
// Spec 2026-11-18 phase 1 AC8: one row per site with the baseline phase 6 builds on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const S1 = '11111111-1111-4111-8111-111111111111';

test('PostgreSQL: coverage v0 counts per site in range, service role only', async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE public.sites (id uuid PRIMARY KEY, domain text, is_active boolean DEFAULT true);
      CREATE TABLE public.tracking_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id uuid, started_at timestamptz,
        referrer text, utm_source text, utm_medium text);
      CREATE TABLE public.cookie_consents (site_id uuid, created_at timestamptz, consent_types jsonb);
      CREATE TABLE public.aggregate_sources_daily (site_id uuid, day date, visits int);
      CREATE TABLE public.ai_bot_traffic (site_id uuid, source text, detected_at timestamptz);
      CREATE TABLE public.conversion_events (site_id uuid, session_id uuid, created_at timestamptz);
      CREATE FUNCTION public._norm_host(u text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
        SELECT regexp_replace(split_part(split_part(regexp_replace(lower(coalesce(u, '')), '^https?://', ''), '/', 1), ':', 1), '^www\\.', '') $$;
      INSERT INTO sites VALUES ('${S1}', 'site.se');
      INSERT INTO tracking_sessions (id, site_id, started_at, referrer, utm_source) VALUES
        ('00000000-0000-4000-8000-000000000001', '${S1}', '2026-11-02', 'https://www.google.com/', NULL),
        ('00000000-0000-4000-8000-000000000002', '${S1}', '2026-11-02', 'https://site.se/a', NULL),
        ('00000000-0000-4000-8000-000000000003', '${S1}', '2026-10-01', NULL, NULL);
      INSERT INTO cookie_consents VALUES ('${S1}', '2026-11-02', '{"analytics":true,"marketing":false}'),
                                         ('${S1}', '2026-11-03', '{"analytics":false,"marketing":false}');
      INSERT INTO aggregate_sources_daily VALUES ('${S1}', '2026-11-02', 7), ('${S1}', '2026-11-03', 5);
      INSERT INTO ai_bot_traffic VALUES ('${S1}', 'server_log', '2026-11-02'), ('${S1}', 'js_tag', '2026-11-02');
      INSERT INTO conversion_events VALUES ('${S1}', '00000000-0000-4000-8000-000000000001', '2026-11-02'),
                                           ('${S1}', '00000000-0000-4000-8000-000000000002', '2026-11-02');`);
    const src = read('../../supabase/migrations/20261202000001_source_self_referral_utm.sql');
    await pg.exec(src.match(/CREATE OR REPLACE FUNCTION public\.session_source_medium[\s\S]*?\n\$\$;/)[0]);
    await pg.exec(read('../../supabase/migrations/20261202000005_measurement_coverage_v0.sql'));
    const r = (await pg.query(`SELECT * FROM public.measurement_coverage_v0('2026-11-01', '2026-11-30')`)).rows[0];
    assert.deepEqual(
      [r.consent_rows, r.consents_analytics, r.consents_marketing, r.consented_sessions, r.aggregate_visits, r.server_bot_hits, r.conversions, r.conversions_with_source].map(Number),
      [2, 1, 0, 2, 12, 1, 2, 1]);
    const grants = (await pg.query(`SELECT has_function_privilege('authenticated', 'public.measurement_coverage_v0(date,date)', 'EXECUTE') a`)).rows[0].a;
    assert.equal(grants, false);
  } finally { await pg.close(); }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/foundation/measurement-coverage.test.mjs`
Expected: FAIL — missing migration.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20261202000005_measurement_coverage_v0.sql
-- Spec 2026-11-18 phase 1 AC8: per-site baseline for the phase 6 coverage dashboard.
-- consented_sessions = tracking_sessions (full/cookieless mode only runs after consent),
-- aggregate_visits = consent-free aggregate visits, server_bot_hits = non-browser AI bot rows,
-- conversions_with_source = conversions whose session has a non-direct source (UTM or external referrer).
-- Service role only (operator report). Run: select * from measurement_coverage_v0(current_date - 30, current_date);
CREATE OR REPLACE FUNCTION public.measurement_coverage_v0(p_from date, p_to date)
RETURNS TABLE (site_id uuid, domain text, consent_rows bigint, consents_analytics bigint, consents_marketing bigint,
               consented_sessions bigint, aggregate_visits bigint, server_bot_hits bigint,
               conversions bigint, conversions_with_source bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.id, s.domain,
    (SELECT count(*) FROM public.cookie_consents c WHERE c.site_id = s.id AND c.created_at >= p_from AND c.created_at < p_to + 1),
    (SELECT count(*) FROM public.cookie_consents c WHERE c.site_id = s.id AND c.created_at >= p_from AND c.created_at < p_to + 1
        AND (c.consent_types->>'analytics')::boolean),
    (SELECT count(*) FROM public.cookie_consents c WHERE c.site_id = s.id AND c.created_at >= p_from AND c.created_at < p_to + 1
        AND (c.consent_types->>'marketing')::boolean),
    (SELECT count(*) FROM public.tracking_sessions t WHERE t.site_id = s.id AND t.started_at >= p_from AND t.started_at < p_to + 1),
    (SELECT coalesce(sum(a.visits), 0) FROM public.aggregate_sources_daily a WHERE a.site_id = s.id AND a.day BETWEEN p_from AND p_to),
    (SELECT count(*) FROM public.ai_bot_traffic b WHERE b.site_id = s.id AND b.source <> 'js_tag'
        AND b.detected_at >= p_from AND b.detected_at < p_to + 1),
    (SELECT count(*) FROM public.conversion_events e WHERE e.site_id = s.id AND e.created_at >= p_from AND e.created_at < p_to + 1),
    (SELECT count(*) FROM public.conversion_events e
       JOIN public.tracking_sessions t ON t.id = e.session_id
       CROSS JOIN LATERAL public.session_source_medium(t.referrer, t.utm_source, t.utm_medium, public._norm_host(s.domain)) sm
      WHERE e.site_id = s.id AND e.created_at >= p_from AND e.created_at < p_to + 1 AND sm.source <> '(direct)')
  FROM public.sites s
  WHERE coalesce(s.is_active, true)
  ORDER BY s.domain
$$;

REVOKE ALL ON FUNCTION public.measurement_coverage_v0(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.measurement_coverage_v0(date, date) TO service_role;
```

If `aggregate_sources_daily` has no `visits` column under that name in prod, check `20261030000001_aggregate_measurement.sql` and use its column (the test fixture mirrors the real name).

- [ ] **Step 4: Run tests**

Run: `node --test tests/foundation/measurement-coverage.test.mjs`
Expected: PASS.

- [ ] **Step 5: Full suite**

Run: `npm run test:foundation`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261202000005_measurement_coverage_v0.sql tests/foundation/measurement-coverage.test.mjs
git commit -m "feat(reports): measurement coverage v0 per site"
```

---

## Deploy (after review, with Daniel)

1. `supabase db push --remote --yes` (migrations `20261202000001`–`…005`).
2. `supabase functions deploy store-consent ai-bot-tracker server-hit cloudflare-ingest pipeline-freshness`.
3. `npm run build`; Daniel FTPs `dist/` (includes `public/v/5.5.15/`).
4. Publish WP plugin 5.5.15 (zip from `wordpress-plugin/`).
5. Checks: `select geo_source, count(*) from cookie_consents where created_at > now() - interval '1 day' group by 1;` (no NULL on new rows); `select bot_category, count(*) from ai_bot_traffic where detected_at > now() - interval '1 day' group by 1;` (no `other` for registry names); `select * from measurement_coverage_v0(current_date - 30, current_date);`; `select * from csp_reports order by last_seen desc limit 5;`.
6. User action outside this repo: add the aggregate beacon to the SentriSK loader (or turn `aggregate_measurement` off for sentrisk.se).

# Dashboard Overview v2, Filters, Export and Numbered Menu — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the CortIQ dashboard a one-screen Overview (status, KPIs with trend and change, AI traffic up front, module cards), a global filter panel (date, URL, segment, saved filters), CSV/PDF export on every Overview widget, and a numbered left-hand menu instead of grouped dropdown tabs.

**Architecture:** Filters live in the URL (`?from=&to=&path=&segment=`) behind a React context, so views are linkable and survive reloads. One new SECURITY DEFINER RPC, `get_overview_metrics`, returns current period, previous period and a gap-free daily series in a single round trip; the Overview widgets render from it. Pure logic (filter parsing, period maths, CSV) lives in dependency-free `.ts` modules that the existing `node --test` suite imports directly. Navigation keeps the existing `?tab=` values, so deep links do not break.

**Tech Stack:** React 18, TypeScript (non-strict), Vite, Tailwind, shadcn/ui, TanStack Query, recharts, Supabase (Postgres + RLS), `node:test` + PGlite for tests.

**Spec:** This plan is the spec. It implements the user's decision of 2026-10-14 (chat): adopt from Extellio the status strip, KPI row with sparklines, per-module summary cards, per-widget CSV/PDF export, a global filter panel (date, URL, segment, saved filters) and a numbered menu; do better than Extellio with period-over-period change, AI traffic in the KPI row, honest "Visits" labelling (no unique visitors exist in the data) and "Not set up → Set up" instead of locked cards.

## Global Constraints

- UI copy in English. Code and comments in English.
- No new npm dependencies. PDF = the browser's print dialog ("Save as PDF") on a print-only copy of the widget.
- Never `supabase db push`. Apply migrations with `npx supabase db query --linked -f <file>` then `npx supabase migration repair --status applied <version>` (13+ historic migrations are unrecorded remotely).
- New RPCs: `SECURITY DEFINER`, `SET search_path = ''`, ownership check `sites.user_id = auth.uid()`, `REVOKE ... FROM PUBLIC, anon`, `GRANT ... TO authenticated`.
- New tables: RLS on; policy `site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid())` (CLAUDE.md convention).
- Join keys (verified against prod 2026-10-14): `page_views.session_id` (uuid) → `tracking_sessions.id`; `conversion_events.session_id` (uuid) → `tracking_sessions.id`. `tracking_sessions.session_id` is the text client id — do not join on it.
- AI time column is `ai_bot_traffic.detected_at`; category is `request_type` (`training` / `agentic` / anything else = `citation`, same rule as `BotTrafficClassification.tsx:51-57`); server-side rows have `source = 'server_log'`.
- Pageview exclusions must match `get_analytics_summary`: `url NOT LIKE '%wp-admin%'`, `'%wp-login%'`, `'%elementor-preview%'`, `'%elementor=%'`, `'%preview=true%'`.
- The data has no unique-visitor id (cookieless sites — 5 of 8 in prod — and full sites alike). Label the session count **"Visits"**, never "Visitors".
- Existing `?tab=` values stay exactly as they are.
- Pure `.ts` modules imported by tests: relative imports with `.ts` extension, no `@/` alias, no enums.
- Daily buckets are UTC days; the date picker sends `YYYY-MM-DD`.
- Max range 366 days.

## Review Focus

1. **Previous period is zero** (new site, first month) — the delta shows "New", never `Infinity%`/`NaN%`. Test in Task 1.
2. **Hand-edited or stale URL params** (`?from=banana`, `from > to`, a 5-year range, a deleted segment id, a saved filter from another site) — fall back to the 30-day default / ignore the segment without crashing. Tests in Task 1 and Task 5.
3. **URL filter containing `%` or `_`** (e.g. `/50%_off`) — matched literally, not as LIKE wildcards. Test in Task 3.
4. **Days without any traffic** — the daily series still has one point per day so sparklines and CSV rows don't skip dates. Test in Task 3.
5. **Exported CSV opened in Excel** — cells starting with `=`, `+`, `-`, `@` are neutralised; UTF-8 BOM so `å/ä/ö` survive. Test in Task 2.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/dashboard/filters.ts` (new) | `DashboardFilters` type; parse/write URL params; previous period; percent change; path normalisation. Pure. |
| `src/lib/csv.ts` (new) | Generic, injection-safe CSV builder. Pure. |
| `src/lib/printWidget.ts` (new) | Print one DOM node via a hidden iframe (PDF via the browser). |
| `supabase/migrations/20261015000001_overview_metrics.sql` (new) | `get_overview_metrics` RPC. |
| `supabase/migrations/20261015000002_dashboard_saved_filters.sql` (new) | `dashboard_saved_filters` table + RLS. |
| `src/contexts/DashboardFiltersContext.tsx` (new) | URL-synced filter state for the dashboard. |
| `src/hooks/useSavedFilters.ts` (new) | CRUD for saved filters (TanStack Query). |
| `src/hooks/useOverviewMetrics.ts` (new) | Calls the RPC with current filters. |
| `src/components/dashboard/filters/FilterPanel.tsx` (new) | Right-hand panel: saved filter, URL, date range, segment. |
| `src/components/dashboard/nav/navSections.ts` (new) | Numbered menu definition. Pure. |
| `src/components/dashboard/nav/DashboardSidebar.tsx` (new) | Renders the numbered menu. |
| `src/components/dashboard/widgets/WidgetCard.tsx` (new) | Card shell with title + CSV/PDF toolbar. |
| `src/components/dashboard/widgets/Sparkline.tsx` (new) | Shared sparkline (replaces two file-private copies later). |
| `src/components/dashboard/overview/StatusStrip.tsx` (new) | Site · receiving data · mode · server-side status. |
| `src/components/dashboard/overview/KpiRow.tsx` (new) | KPI tiles with sparkline + delta. |
| `src/components/dashboard/overview/ModuleCards.tsx` (new) | Human / AI / Conversions / Heatmaps & forms / Server-side. |
| `src/components/dashboard/FilterScopeNotice.tsx` (new) | "This view uses the date range only" on tabs that ignore URL/segment. |
| `src/components/dashboard/tabs/OverviewTab.tsx` (rewrite) | Composes v2. |
| `src/components/dashboard/DashboardTabs.tsx` (modify) | Sidebar + content switch; drop dropdown groups. |
| `src/pages/Dashboard.tsx` (modify) | Provider, grid layout (menu · content · filter panel), date from context. |
| `src/components/dashboard/DashboardHeader.tsx` (modify) | Remove its DateRangePicker (moves to the panel). |
| `tests/foundation/dashboard-filters.test.mjs`, `csv.test.mjs`, `overview-metrics.test.mjs` + `.sql`, `saved-filters-rls.test.mjs` + `.sql`, `nav-sections.test.mjs` (new) | Tests. |

---

### Task 1: Filter model (pure)

**Files:**
- Create: `src/lib/dashboard/filters.ts`
- Test: `tests/foundation/dashboard-filters.test.mjs`

**Interfaces:**
- Produces:
  - `interface DashboardFilters { from: string; to: string; path: string | null; segmentId: string | null }` (dates `YYYY-MM-DD`, inclusive)
  - `defaultFilters(today: Date): DashboardFilters`
  - `parseFilters(params: URLSearchParams, today: Date): DashboardFilters`
  - `writeFilters(params: URLSearchParams, f: DashboardFilters): URLSearchParams` (returns a new instance, preserves other keys such as `tab`)
  - `previousPeriod(from: string, to: string): { from: string; to: string }`
  - `percentChange(current: number, previous: number): number | null` (null = "New")
  - `normalizePath(input: string): string | null`
  - `MAX_RANGE_DAYS = 366`, `DEFAULT_DAYS = 30`

- [ ] **Step 1: Write the failing test**

```js
// tests/foundation/dashboard-filters.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultFilters, parseFilters, writeFilters, previousPeriod, percentChange, normalizePath,
} from '../../src/lib/dashboard/filters.ts';

const TODAY = new Date('2026-10-14T12:00:00Z');

test('default is the last 30 days including today', () => {
  assert.deepEqual(defaultFilters(TODAY), { from: '2026-09-15', to: '2026-10-14', path: null, segmentId: null });
});

test('valid params round-trip and keep unrelated keys', () => {
  const p = new URLSearchParams('tab=analytics&from=2026-09-01&to=2026-09-30&path=%2Fpricing&segment=abc');
  const f = parseFilters(p, TODAY);
  assert.deepEqual(f, { from: '2026-09-01', to: '2026-09-30', path: '/pricing', segmentId: 'abc' });
  const out = writeFilters(new URLSearchParams('tab=analytics'), f);
  assert.equal(out.get('tab'), 'analytics');
  assert.equal(out.get('from'), '2026-09-01');
  assert.equal(out.get('path'), '/pricing');
});

test('garbage, inverted, future-clamped and oversized ranges fall back safely', () => {
  assert.deepEqual(parseFilters(new URLSearchParams('from=banana&to=2026-09-30'), TODAY), defaultFilters(TODAY));
  assert.deepEqual(parseFilters(new URLSearchParams('from=2026-09-30&to=2026-09-01'), TODAY), defaultFilters(TODAY));
  assert.deepEqual(parseFilters(new URLSearchParams('from=2020-01-01&to=2026-10-14'), TODAY), defaultFilters(TODAY));
  assert.equal(parseFilters(new URLSearchParams('from=2026-10-01&to=2027-01-01'), TODAY).to, '2026-10-14');
});

test('empty filters are omitted from the URL', () => {
  const out = writeFilters(new URLSearchParams('segment=old&path=/x'), { ...defaultFilters(TODAY) });
  assert.equal(out.has('segment'), false);
  assert.equal(out.has('path'), false);
});

test('previous period has the same length and ends the day before', () => {
  assert.deepEqual(previousPeriod('2026-09-01', '2026-09-30'), { from: '2026-08-02', to: '2026-08-31' });
  assert.deepEqual(previousPeriod('2026-10-14', '2026-10-14'), { from: '2026-10-13', to: '2026-10-13' });
});

test('percent change: zero previous is "new", not Infinity', () => {
  assert.equal(percentChange(10, 0), null);
  assert.equal(percentChange(0, 0), null);
  assert.equal(percentChange(150, 100), 50);
  assert.equal(percentChange(50, 100), -50);
});

test('paths are normalised from full URLs and bare input', () => {
  assert.equal(normalizePath('https://example.com/pricing/?a=1'), '/pricing/');
  assert.equal(normalizePath('pricing'), '/pricing');
  assert.equal(normalizePath('  '), null);
  assert.equal(normalizePath('/50%_off'), '/50%_off');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/foundation/dashboard-filters.test.mjs`
Expected: FAIL — `Cannot find module .../src/lib/dashboard/filters.ts`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/dashboard/filters.ts
// Dashboard filter state. Pure and dependency-free so node --test can import it directly.

export interface DashboardFilters {
  from: string; // YYYY-MM-DD, inclusive
  to: string;   // YYYY-MM-DD, inclusive
  path: string | null;
  segmentId: string | null;
}

export const DEFAULT_DAYS = 30;
export const MAX_RANGE_DAYS = 366;
const DAY_MS = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const toIso = (d: Date) => d.toISOString().slice(0, 10);
const parseIso = (s: string | null): Date | null => {
  if (!s || !ISO_DATE.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || toIso(d) !== s ? null : d;
};
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY_MS);
const utcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export function defaultFilters(today: Date): DashboardFilters {
  const end = utcDay(today);
  return { from: toIso(addDays(end, -(DEFAULT_DAYS - 1))), to: toIso(end), path: null, segmentId: null };
}

export function normalizePath(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) {
    try { return new URL(raw).pathname || '/'; } catch { return null; }
  }
  const noQuery = raw.split(/[?#]/)[0];
  return noQuery.startsWith('/') ? noQuery : `/${noQuery}`;
}

export function parseFilters(params: URLSearchParams, today: Date): DashboardFilters {
  const fallback = defaultFilters(today);
  const end = utcDay(today);
  const from = parseIso(params.get('from'));
  let to = parseIso(params.get('to'));
  let range = { from: fallback.from, to: fallback.to };
  if (from && to) {
    if (to > end) to = end;
    const days = Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1;
    if (days >= 1 && days <= MAX_RANGE_DAYS) range = { from: toIso(from), to: toIso(to) };
  }
  const path = params.get('path');
  const segment = params.get('segment');
  return {
    ...range,
    path: path ? normalizePath(path) : null,
    segmentId: segment && segment.trim() ? segment.trim() : null,
  };
}

export function writeFilters(params: URLSearchParams, f: DashboardFilters): URLSearchParams {
  const out = new URLSearchParams(params);
  out.set('from', f.from);
  out.set('to', f.to);
  if (f.path) out.set('path', f.path); else out.delete('path');
  if (f.segmentId) out.set('segment', f.segmentId); else out.delete('segment');
  return out;
}

export function previousPeriod(from: string, to: string): { from: string; to: string } {
  const f = parseIso(from)!;
  const t = parseIso(to)!;
  const days = Math.round((t.getTime() - f.getTime()) / DAY_MS) + 1;
  return { from: toIso(addDays(f, -days)), to: toIso(addDays(f, -1)) };
}

export function percentChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/foundation/dashboard-filters.test.mjs`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboard/filters.ts tests/foundation/dashboard-filters.test.mjs
git commit -m "feat(dashboard): URL filter model with period maths"
```

---

### Task 2: Safe CSV builder (pure)

**Files:**
- Create: `src/lib/csv.ts`
- Test: `tests/foundation/csv.test.mjs`

**Interfaces:**
- Produces: `csvCell(value: unknown): string`, `toCsv(columns: string[], rows: unknown[][]): string`, `downloadCsv(filename: string, csv: string): void` (browser only; not unit-tested)

- [ ] **Step 1: Write the failing test**

```js
// tests/foundation/csv.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, toCsv } from '../../src/lib/csv.ts';

test('formula-leading cells are neutralised', () => {
  for (const v of ['=SUM(A1)', '+1', '-2', '@cmd', '\tx']) {
    assert.ok(csvCell(v).startsWith(`"'`), v);
  }
  assert.equal(csvCell(-5), '"-5"'); // numbers are data, not formulas
});

test('quotes are doubled and null becomes empty', () => {
  assert.equal(csvCell('a "b"'), '"a ""b"""');
  assert.equal(csvCell(null), '""');
});

test('BOM, CRLF and Swedish characters', () => {
  const csv = toCsv(['Sida', 'Besök'], [['/åäö', 3]]);
  assert.ok(csv.startsWith('﻿'));
  assert.equal(csv, '﻿"Sida","Besök"\r\n"/åäö","3"\r\n');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/foundation/csv.test.mjs`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/csv.ts
// Injection-safe CSV (same rule as supabase/functions/_shared/tracking-check/report.ts).
// Numbers are written as-is: a negative number is data, not a formula.

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const s = String(value);
  const guarded = typeof value !== 'number' && /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${guarded.replace(/"/g, '""')}"`;
}

export function toCsv(columns: string[], rows: unknown[][]): string {
  return '﻿' + [columns, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/foundation/csv.test.mjs`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/csv.ts tests/foundation/csv.test.mjs
git commit -m "feat(export): injection-safe CSV builder"
```

---

### Task 3: `get_overview_metrics` RPC

**Files:**
- Create: `supabase/migrations/20261015000001_overview_metrics.sql`
- Test: `tests/foundation/overview-metrics.sql`, `tests/foundation/overview-metrics.test.mjs`

**Interfaces:**
- Produces RPC `public.get_overview_metrics(p_site_id uuid, p_from date, p_to date, p_path text DEFAULT NULL, p_segment jsonb DEFAULT NULL) RETURNS jsonb`:

```json
{
  "current":  { "visits": 0, "pageViews": 0, "conversions": 0, "ai": { "total": 0, "training": 0, "agentic": 0, "citation": 0 } },
  "previous": { "...same shape..." },
  "daily": [ { "date": "2026-09-15", "visits": 0, "pageViews": 0, "conversions": 0, "ai": 0 } ],
  "lastPageViewAt": "timestamptz|null",
  "lastServerHitAt": "timestamptz|null",
  "serverHits": 0
}
```
  `p_segment` = the `filters` array of one `utm_segments` row with tokens already resolved client-side (`[{field, op, value}]`, ops `eq|contains|starts_with`, AND within the array). Segment applies to visits/pageViews/conversions; AI rows have no UTM and ignore it. `lastPageViewAt`/`lastServerHitAt`/`serverHits` (period) ignore path/segment.

- [ ] **Step 1: Write the failing test fixture**

```sql
-- tests/foundation/overview-metrics.sql
BEGIN;
CREATE ROLE anon; CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE TABLE public.sites (id uuid PRIMARY KEY, user_id uuid NOT NULL);
CREATE TABLE public.tracking_sessions (id uuid PRIMARY KEY, site_id uuid, started_at timestamptz,
  utm_source text, utm_medium text, utm_campaign text, utm_content text, utm_term text);
CREATE TABLE public.page_views (id uuid DEFAULT gen_random_uuid(), site_id uuid, session_id uuid, url text, viewed_at timestamptz);
CREATE TABLE public.conversion_events (site_id uuid, session_id uuid, created_at timestamptz);
CREATE TABLE public.ai_bot_traffic (site_id uuid, url text, request_type text, source text, detected_at timestamptz);
\ir ../../supabase/migrations/20261015000001_overview_metrics.sql

INSERT INTO sites VALUES ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
                         ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
-- current period 2026-09-01..2026-09-03; previous 2026-08-29..2026-08-31
INSERT INTO tracking_sessions VALUES
 ('00000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','2026-09-01 10:00Z','newsletter',null,null,null,null),
 ('00000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','2026-09-03 10:00Z','google',null,null,null,null),
 ('00000000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','2026-08-30 10:00Z',null,null,null,null,null),
 ('00000000-0000-4000-8000-000000000009','22222222-2222-4222-8222-222222222222','2026-09-01 10:00Z',null,null,null,null,null);
INSERT INTO page_views (site_id, session_id, url, viewed_at) VALUES
 ('11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000001','https://a.se/pricing','2026-09-01 10:00Z'),
 ('11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000001','https://a.se/50%_off','2026-09-01 10:01Z'),
 ('11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000002','https://a.se/blog','2026-09-03 10:00Z'),
 ('11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000002','https://a.se/wp-admin/x','2026-09-03 10:01Z'),
 ('11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000003','https://a.se/pricing','2026-08-30 10:00Z'),
 ('11111111-1111-4111-8111-111111111111',null,'https://a.se/500off','2026-09-02 10:00Z');
INSERT INTO conversion_events VALUES ('11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000001','2026-09-01 10:02Z');
INSERT INTO ai_bot_traffic VALUES
 ('11111111-1111-4111-8111-111111111111','https://a.se/pricing','training','server_log','2026-09-02 01:00Z'),
 ('11111111-1111-4111-8111-111111111111','https://a.se/blog','agentic','js_tag','2026-09-02 02:00Z'),
 ('11111111-1111-4111-8111-111111111111','https://a.se/blog','citation','server_log','2026-09-03 03:00Z');

SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE r jsonb;
BEGIN
  r := public.get_overview_metrics('11111111-1111-4111-8111-111111111111','2026-09-01','2026-09-03');
  ASSERT (r->'current'->>'visits')::int = 2, 'visits current';
  ASSERT (r->'current'->>'pageViews')::int = 4, 'page views exclude wp-admin';
  ASSERT (r->'current'->>'conversions')::int = 1, 'conversions';
  ASSERT (r->'current'->'ai'->>'total')::int = 3 AND (r->'current'->'ai'->>'training')::int = 1
     AND (r->'current'->'ai'->>'agentic')::int = 1 AND (r->'current'->'ai'->>'citation')::int = 1, 'ai split';
  ASSERT (r->'previous'->>'visits')::int = 1, 'previous visits';
  ASSERT jsonb_array_length(r->'daily') = 3, 'one point per day incl. empty 2026-09-02 visits';
  ASSERT (r->'daily'->1->>'visits')::int = 0 AND (r->'daily'->1->>'ai')::int = 2, 'gap day present';
  ASSERT (r->>'serverHits')::int = 2, 'server hits';

  r := public.get_overview_metrics('11111111-1111-4111-8111-111111111111','2026-09-01','2026-09-03','/50%_off');
  ASSERT (r->'current'->>'pageViews')::int = 1, '% and _ are literal (500off must not match)';
  ASSERT (r->'current'->>'visits')::int = 1, 'path filters sessions';

  r := public.get_overview_metrics('11111111-1111-4111-8111-111111111111','2026-09-01','2026-09-03', NULL,
         '[{"field":"utm_source","op":"eq","value":"Newsletter"}]');
  ASSERT (r->'current'->>'visits')::int = 1 AND (r->'current'->>'conversions')::int = 1, 'segment eq, case-insensitive';
  ASSERT (r->'current'->'ai'->>'total')::int = 3, 'segment does not filter AI';

  r := public.get_overview_metrics('11111111-1111-4111-8111-111111111111','2026-09-01','2026-09-03', NULL,
         '[{"field":"bogus","op":"eq","value":"x"}]');
  ASSERT (r->'current'->>'visits')::int = 0, 'unknown field matches nothing';

  BEGIN
    PERFORM public.get_overview_metrics('22222222-2222-4222-8222-222222222222','2026-09-01','2026-09-03');
    RAISE EXCEPTION 'expected denial';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.get_overview_metrics('11111111-1111-4111-8111-111111111111','2026-09-03','2026-09-01');
    RAISE EXCEPTION 'expected invalid range';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END $$;
ROLLBACK;
```

```js
// tests/foundation/overview-metrics.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('PostgreSQL: overview metrics — periods, gaps, path, segment, AI split, access', async () => {
  const db = new PGlite();
  const fixture = readFileSync(new URL('./overview-metrics.sql', import.meta.url), 'utf8');
  const migration = readFileSync(new URL('../../supabase/migrations/20261015000001_overview_metrics.sql', import.meta.url), 'utf8');
  try {
    await assert.doesNotReject(db.exec(fixture.replace(/^\\ir .*$/m, () => migration)));
  } finally {
    await db.close();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/foundation/overview-metrics.test.mjs`
Expected: FAIL — `ENOENT ... 20261015000001_overview_metrics.sql`

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20261015000001_overview_metrics.sql
-- Overview v2: current + previous period and a gap-free daily series in one call.
CREATE OR REPLACE FUNCTION public.get_overview_metrics(
  p_site_id uuid, p_from date, p_to date, p_path text DEFAULT NULL, p_segment jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_days     int := p_to - p_from + 1;
  v_prev     date := p_from - (p_to - p_from + 1);
  v_like     text;
  v_result   jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sites WHERE id = p_site_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501';
  END IF;
  IF p_to < p_from OR v_days > 366 THEN
    RAISE EXCEPTION 'invalid range' USING ERRCODE = '22023';
  END IF;
  -- Literal prefix match: escape LIKE metacharacters.
  v_like := CASE WHEN p_path IS NULL THEN NULL
            ELSE replace(replace(replace(p_path, '\', '\\'), '%', '\%'), '_', '\_') || '%' END;

  WITH
  sess AS (
    SELECT ts.id, ts.started_at::date AS d
    FROM public.tracking_sessions ts
    WHERE ts.site_id = p_site_id
      AND ts.started_at >= v_prev AND ts.started_at < p_to + 1
      AND (p_segment IS NULL OR NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_segment) f
        WHERE NOT COALESCE((
          WITH c AS (SELECT CASE f->>'field'
                       WHEN 'utm_source'   THEN ts.utm_source
                       WHEN 'utm_medium'   THEN ts.utm_medium
                       WHEN 'utm_campaign' THEN ts.utm_campaign
                       WHEN 'utm_content'  THEN ts.utm_content
                       WHEN 'utm_term'     THEN ts.utm_term END AS col,
                     replace(replace(replace(f->>'value', '\', '\\'), '%', '\%'), '_', '\_') AS v)
          SELECT CASE f->>'op'
                   WHEN 'eq'          THEN lower(c.col) = lower(f->>'value')
                   WHEN 'contains'    THEN c.col ILIKE '%' || c.v || '%'
                   WHEN 'starts_with' THEN c.col ILIKE c.v || '%'
                   ELSE false END
          FROM c), false)))
      AND (v_like IS NULL OR EXISTS (
        SELECT 1 FROM public.page_views pv
        WHERE pv.session_id = ts.id
          AND regexp_replace(pv.url, '^https?://[^/]+', '') LIKE v_like))
  ),
  pvs AS (
    SELECT pv.viewed_at::date AS d
    FROM public.page_views pv
    WHERE pv.site_id = p_site_id
      AND pv.viewed_at >= v_prev AND pv.viewed_at < p_to + 1
      AND pv.url NOT LIKE '%wp-admin%' AND pv.url NOT LIKE '%wp-login%'
      AND pv.url NOT LIKE '%elementor-preview%' AND pv.url NOT LIKE '%elementor=%'
      AND pv.url NOT LIKE '%preview=true%'
      AND (v_like IS NULL OR regexp_replace(pv.url, '^https?://[^/]+', '') LIKE v_like)
      AND (p_segment IS NULL OR pv.session_id IN (SELECT id FROM sess))
  ),
  conv AS (
    SELECT ce.created_at::date AS d
    FROM public.conversion_events ce
    WHERE ce.site_id = p_site_id
      AND ce.created_at >= v_prev AND ce.created_at < p_to + 1
      AND ((p_segment IS NULL AND v_like IS NULL) OR ce.session_id IN (SELECT id FROM sess))
  ),
  ai AS (
    SELECT a.detected_at::date AS d,
           CASE WHEN a.request_type IN ('training', 'agentic') THEN a.request_type ELSE 'citation' END AS cat
    FROM public.ai_bot_traffic a
    WHERE a.site_id = p_site_id
      AND a.detected_at >= v_prev AND a.detected_at < p_to + 1
      AND (v_like IS NULL OR regexp_replace(a.url, '^https?://[^/]+', '') LIKE v_like)
  ),
  totals AS (
    SELECT period,
      jsonb_build_object(
        'visits',      (SELECT count(*) FROM sess  WHERE d BETWEEN lo AND hi),
        'pageViews',   (SELECT count(*) FROM pvs   WHERE d BETWEEN lo AND hi),
        'conversions', (SELECT count(*) FROM conv  WHERE d BETWEEN lo AND hi),
        'ai', jsonb_build_object(
          'total',    (SELECT count(*) FROM ai WHERE d BETWEEN lo AND hi),
          'training', (SELECT count(*) FROM ai WHERE d BETWEEN lo AND hi AND cat = 'training'),
          'agentic',  (SELECT count(*) FROM ai WHERE d BETWEEN lo AND hi AND cat = 'agentic'),
          'citation', (SELECT count(*) FROM ai WHERE d BETWEEN lo AND hi AND cat = 'citation'))
      ) AS obj
    FROM (VALUES ('current', p_from, p_to), ('previous', v_prev, p_from - 1)) AS p(period, lo, hi)
  ),
  days AS (SELECT g::date AS d FROM generate_series(p_from, p_to, interval '1 day') g)
  SELECT jsonb_build_object(
    'current',  (SELECT obj FROM totals WHERE period = 'current'),
    'previous', (SELECT obj FROM totals WHERE period = 'previous'),
    'daily', (SELECT jsonb_agg(jsonb_build_object(
                'date', to_char(days.d, 'YYYY-MM-DD'),
                'visits',      (SELECT count(*) FROM sess WHERE sess.d = days.d),
                'pageViews',   (SELECT count(*) FROM pvs  WHERE pvs.d  = days.d),
                'conversions', (SELECT count(*) FROM conv WHERE conv.d = days.d),
                'ai',          (SELECT count(*) FROM ai   WHERE ai.d   = days.d)) ORDER BY days.d)
              FROM days),
    'lastPageViewAt',  (SELECT max(viewed_at) FROM public.page_views WHERE site_id = p_site_id),
    'lastServerHitAt', (SELECT max(detected_at) FROM public.ai_bot_traffic
                        WHERE site_id = p_site_id AND source = 'server_log'),
    'serverHits',      (SELECT count(*) FROM public.ai_bot_traffic
                        WHERE site_id = p_site_id AND source = 'server_log'
                          AND detected_at >= p_from AND detected_at < p_to + 1)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_overview_metrics(uuid, date, date, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_overview_metrics(uuid, date, date, text, jsonb) TO authenticated;
```

Note on the fixture: the `pvs` rows in the current period are `/pricing`, `/50%_off`, `/blog`, `/500off` (wp-admin excluded) = 4. The `/500off` row has no session, so it disappears only when a segment is applied.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/foundation/overview-metrics.test.mjs`
Expected: PASS. If an `ASSERT` fails, the message names the broken rule; fix the SQL, not the fixture.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261015000001_overview_metrics.sql tests/foundation/overview-metrics.*
git commit -m "feat(db): get_overview_metrics RPC with period comparison, path and segment filters"
```

---

### Task 4: Saved filters table

**Files:**
- Create: `supabase/migrations/20261015000002_dashboard_saved_filters.sql`
- Test: `tests/foundation/saved-filters-rls.sql`, `tests/foundation/saved-filters-rls.test.mjs`

**Interfaces:**
- Produces table `public.dashboard_saved_filters(id uuid pk, site_id uuid → sites, name text 1..80, filters jsonb, created_at timestamptz)`. `filters` stores `{ path: string|null, segmentId: string|null, rangeDays: number|null }` — a relative range (e.g. 30) so a saved "Last 30 days, /pricing" stays useful; absolute dates are not saved.

- [ ] **Step 1: Write the failing test**

```sql
-- tests/foundation/saved-filters-rls.sql
BEGIN;
CREATE ROLE anon; CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE TABLE public.sites (id uuid PRIMARY KEY, user_id uuid NOT NULL);
GRANT SELECT ON public.sites TO authenticated;
\ir ../../supabase/migrations/20261015000002_dashboard_saved_filters.sql
INSERT INTO sites VALUES ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
                         ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO dashboard_saved_filters (site_id, name, filters)
VALUES ('22222222-2222-4222-8222-222222222222', 'Other user', '{}');

SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  INSERT INTO public.dashboard_saved_filters (site_id, name, filters)
  VALUES ('11111111-1111-4111-8111-111111111111', 'Pricing', '{"path":"/pricing","segmentId":null,"rangeDays":30}');
  ASSERT (SELECT count(*) FROM public.dashboard_saved_filters) = 1, 'sees only own';
  BEGIN
    INSERT INTO public.dashboard_saved_filters (site_id, name, filters)
    VALUES ('22222222-2222-4222-8222-222222222222', 'Hijack', '{}');
    RAISE EXCEPTION 'expected RLS denial';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.dashboard_saved_filters (site_id, name, filters)
    VALUES ('11111111-1111-4111-8111-111111111111', '', '{}');
    RAISE EXCEPTION 'expected empty-name rejection';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
ROLLBACK;
```

```js
// tests/foundation/saved-filters-rls.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('PostgreSQL: saved filters are isolated per site owner', async () => {
  const db = new PGlite();
  const fixture = readFileSync(new URL('./saved-filters-rls.sql', import.meta.url), 'utf8');
  const migration = readFileSync(new URL('../../supabase/migrations/20261015000002_dashboard_saved_filters.sql', import.meta.url), 'utf8');
  try {
    await assert.doesNotReject(db.exec(fixture.replace(/^\\ir .*$/m, () => migration)));
  } finally {
    await db.close();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/foundation/saved-filters-rls.test.mjs`
Expected: FAIL — migration file not found

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20261015000002_dashboard_saved_filters.sql
CREATE TABLE IF NOT EXISTS public.dashboard_saved_filters (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id    uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  filters    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dashboard_saved_filters_site ON public.dashboard_saved_filters(site_id);

ALTER TABLE public.dashboard_saved_filters ENABLE ROW LEVEL SECURITY;
CREATE POLICY dashboard_saved_filters_owner ON public.dashboard_saved_filters
  FOR ALL TO authenticated
  USING (site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid()))
  WITH CHECK (site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dashboard_saved_filters TO authenticated;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/foundation/saved-filters-rls.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261015000002_dashboard_saved_filters.sql tests/foundation/saved-filters-rls.*
git commit -m "feat(db): dashboard_saved_filters with owner RLS"
```

---

### Task 5: Filter context, saved-filter hook and FilterPanel

**Files:**
- Create: `src/contexts/DashboardFiltersContext.tsx`, `src/hooks/useSavedFilters.ts`, `src/components/dashboard/filters/FilterPanel.tsx`
- Modify: `src/pages/Dashboard.tsx` (wrap in provider; derive `dateRange` from context), `src/components/dashboard/DashboardHeader.tsx` (remove `DateRangePicker` and the `dateRange`/`onDateRangeChange` props)

**Interfaces:**
- Consumes: Task 1 (`DashboardFilters`, `parseFilters`, `writeFilters`, `normalizePath`), Task 4 table, `useUTMSegments()` from `src/contexts/UTMSegmentContext.tsx` (segments list), `DateRangePicker` (`{dateRange, onDateRangeChange}`).
- Produces:
  - `useDashboardFilters(): { filters: DashboardFilters; setFilters(patch: Partial<DashboardFilters>): void; dateRange: { from: Date; to: Date } }`
  - `useSavedFilters(siteId: string): { saved: SavedFilter[]; save(name: string, f: DashboardFilters): Promise<void>; remove(id: string): Promise<void> }` with `type SavedFilter = { id: string; name: string; filters: { path: string | null; segmentId: string | null; rangeDays: number | null } }`
  - `<FilterPanel siteId={string} />`

- [ ] **Step 1: Context**

```tsx
// src/contexts/DashboardFiltersContext.tsx
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { type DashboardFilters, parseFilters, writeFilters } from '@/lib/dashboard/filters';

interface Ctx {
  filters: DashboardFilters;
  setFilters: (patch: Partial<DashboardFilters>) => void;
  dateRange: { from: Date; to: Date };
}
const DashboardFiltersContext = createContext<Ctx | null>(null);

export function DashboardFiltersProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseFilters(params, new Date()), [params]);
  const setFilters = useCallback((patch: Partial<DashboardFilters>) => {
    setParams((prev) => writeFilters(prev, { ...parseFilters(prev, new Date()), ...patch }), { replace: true });
  }, [setParams]);
  const dateRange = useMemo(() => ({
    from: new Date(`${filters.from}T00:00:00`),
    to: new Date(`${filters.to}T23:59:59`),
  }), [filters.from, filters.to]);
  return (
    <DashboardFiltersContext.Provider value={{ filters, setFilters, dateRange }}>
      {children}
    </DashboardFiltersContext.Provider>
  );
}

export function useDashboardFilters(): Ctx {
  const ctx = useContext(DashboardFiltersContext);
  if (!ctx) throw new Error('useDashboardFilters must be used inside DashboardFiltersProvider');
  return ctx;
}
```

- [ ] **Step 2: Saved-filter hook**

```ts
// src/hooks/useSavedFilters.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { DashboardFilters } from '@/lib/dashboard/filters';

export type SavedFilter = {
  id: string;
  name: string;
  filters: { path: string | null; segmentId: string | null; rangeDays: number | null };
};

const DAY_MS = 86_400_000;

export function useSavedFilters(siteId: string) {
  const qc = useQueryClient();
  const key = ['dashboard-saved-filters', siteId];
  const { data } = useQuery({
    queryKey: key,
    enabled: !!siteId,
    queryFn: async () => {
      // Table is newer than the generated types; cast at the boundary.
      const { data, error } = await (supabase as any)
        .from('dashboard_saved_filters').select('id, name, filters').eq('site_id', siteId).order('name');
      if (error) throw error;
      return (data ?? []) as SavedFilter[];
    },
  });
  const save = useMutation({
    mutationFn: async ({ name, f }: { name: string; f: DashboardFilters }) => {
      const rangeDays = Math.round((Date.parse(f.to) - Date.parse(f.from)) / DAY_MS) + 1;
      const { error } = await (supabase as any).from('dashboard_saved_filters').insert({
        site_id: siteId, name: name.trim(), filters: { path: f.path, segmentId: f.segmentId, rangeDays },
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('dashboard_saved_filters').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
  return {
    saved: data ?? [],
    save: (name: string, f: DashboardFilters) => save.mutateAsync({ name, f }),
    remove: (id: string) => remove.mutateAsync(id),
  };
}
```

- [ ] **Step 3: FilterPanel**

```tsx
// src/components/dashboard/filters/FilterPanel.tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2 } from 'lucide-react';
import { DateRangePicker } from '@/components/dashboard/DateRangePicker';
import { useDashboardFilters } from '@/contexts/DashboardFiltersContext';
import { useSavedFilters } from '@/hooks/useSavedFilters';
import { useUTMSegments } from '@/contexts/UTMSegmentContext';
import { normalizePath } from '@/lib/dashboard/filters';

const toIso = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10);
const ALL = '__all__';

export function FilterPanel({ siteId }: { siteId: string }) {
  const { filters, setFilters, dateRange } = useDashboardFilters();
  const { saved, save, remove } = useSavedFilters(siteId);
  const { segments } = useUTMSegments();
  const [pathDraft, setPathDraft] = useState(filters.path ?? '');
  const [name, setName] = useState('');

  // A segment id from the URL that no longer exists is treated as "All".
  const segmentValue = segments.some((s) => s.id === filters.segmentId) ? filters.segmentId! : ALL;

  const applySaved = (id: string) => {
    const s = saved.find((x) => x.id === id);
    if (!s) return;
    const to = new Date();
    const from = new Date(to.getTime() - ((s.filters.rangeDays ?? 30) - 1) * 86_400_000);
    setFilters({ from: toIso(from), to: toIso(to), path: s.filters.path, segmentId: s.filters.segmentId });
    setPathDraft(s.filters.path ?? '');
  };

  return (
    <aside aria-label="Filters" className="space-y-6 rounded-lg border bg-card p-4">
      <h2 className="text-lg font-semibold">Filter</h2>

      <div className="space-y-2">
        <Label>Saved filter</Label>
        <Select onValueChange={applySaved}>
          <SelectTrigger><SelectValue placeholder={saved.length ? 'Choose a saved filter' : 'No saved filters'} /></SelectTrigger>
          <SelectContent>
            {saved.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {saved.map((s) => (
          <div key={s.id} className="flex items-center justify-between text-sm text-muted-foreground">
            <span className="truncate">{s.name}</span>
            <Button variant="ghost" size="icon" aria-label={`Delete ${s.name}`} onClick={() => remove(s.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <Label htmlFor="filter-path">Website URL</Label>
        <Input id="filter-path" placeholder="All URLs — e.g. /pricing" value={pathDraft}
          onChange={(e) => setPathDraft(e.target.value)}
          onBlur={() => setFilters({ path: normalizePath(pathDraft) })}
          onKeyDown={(e) => { if (e.key === 'Enter') setFilters({ path: normalizePath(pathDraft) }); }} />
        <p className="text-xs text-muted-foreground">Matches pages that start with this path.</p>
      </div>

      <div className="space-y-2">
        <Label>Date range</Label>
        <DateRangePicker dateRange={dateRange}
          onDateRangeChange={(r) => { if (r?.from && r?.to) setFilters({ from: toIso(r.from), to: toIso(r.to) }); }} />
      </div>

      <div className="space-y-2">
        <Label>Segment</Label>
        <Select value={segmentValue} onValueChange={(v) => setFilters({ segmentId: v === ALL ? null : v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All visits</SelectItem>
            {segments.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <form className="space-y-2 border-t pt-4"
        onSubmit={async (e) => { e.preventDefault(); if (name.trim()) { await save(name, filters); setName(''); } }}>
        <Label htmlFor="filter-name">Save current filter</Label>
        <div className="flex gap-2">
          <Input id="filter-name" maxLength={80} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" disabled={!name.trim()}>Save</Button>
        </div>
      </form>
    </aside>
  );
}
```

`useUTMSegments()` (`UTMSegmentContext.tsx:293`) returns the context value whose `segments: UTMSegment[]` field (`:184`) lists the site's segments. It throws outside `UTMSegmentProvider`, which today wraps only `DashboardTabs` (`DashboardTabs.tsx:608-614`) — Step 4 moves it up.

- [ ] **Step 4: Wire into Dashboard**

In `DashboardTabs.tsx` remove the `UTMSegmentProvider` wrapper (608-614) and render it instead in `Dashboard.tsx` around the whole body as `<UTMSegmentProvider siteId={selectedSite.id}>`, so the filter panel and the tabs share one segment list. In `src/pages/Dashboard.tsx`: remove the local `dateRange` `useState` (lines 11-15); render the page body inside `<DashboardFiltersProvider>`; inside, read `const { dateRange } = useDashboardFilters()` and pass it to `useAnalytics` and `DashboardTabs` exactly as before. Because the provider must wrap the hook call, move the body into an inner `DashboardBody` component in the same file:

```tsx
export default function Dashboard() {
  return (
    <DashboardFiltersProvider>
      <DashboardBody />
    </DashboardFiltersProvider>
  );
}
```

In `DashboardHeader.tsx` delete the `DateRangePicker` render and its two props; update the call site.

- [ ] **Step 5: Verify**

Run: `npm run build` → expect success. Run: `npm run dev`, open `http://localhost:8080/dashboard?from=banana` → panel shows the 30-day default; set URL `/pricing`, reload → still set; save filter "Pricing", switch to another site → "Pricing" not listed.

- [ ] **Step 6: Commit**

```bash
git add src/contexts/DashboardFiltersContext.tsx src/hooks/useSavedFilters.ts src/components/dashboard/filters/FilterPanel.tsx src/pages/Dashboard.tsx src/components/dashboard/DashboardHeader.tsx
git commit -m "feat(dashboard): global filter panel with URL-synced date, path, segment and saved filters"
```

---

### Task 6: Numbered menu

**Files:**
- Create: `src/components/dashboard/nav/navSections.ts`, `src/components/dashboard/nav/DashboardSidebar.tsx`
- Modify: `src/components/dashboard/DashboardTabs.tsx` (delete `NAV_GROUPS`, `NavGroupDropdown` and the dropdown `TabsList`; render `DashboardSidebar` + content), `src/pages/Dashboard.tsx` (three-column grid)
- Test: `tests/foundation/nav-sections.test.mjs`

**Interfaces:**
- Produces: `type NavItem = { value: string; label: string }`, `type NavSection = { number: number; label: string; items: NavItem[] }`, `NAV_SECTIONS: NavSection[]`, `SETTINGS_ITEMS: NavItem[]`, `numberedLabel(sectionNumber: number, itemIndex: number): string` (→ `"1.2"`), `<DashboardSidebar activeTab={string} onSelect={(v: string) => void} />`

- [ ] **Step 1: Write the failing test**

```js
// tests/foundation/nav-sections.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NAV_SECTIONS, SETTINGS_ITEMS, numberedLabel } from '../../src/components/dashboard/nav/navSections.ts';

// Every tab value that DashboardTabs renders must be reachable from the menu exactly once.
const tabsSource = readFileSync(new URL('../../src/components/dashboard/DashboardTabs.tsx', import.meta.url), 'utf8');
const rendered = new Set([...tabsSource.matchAll(/TabsContent\s+value="([^"]+)"/g)].map((m) => m[1]));

test('menu covers every rendered tab exactly once', () => {
  const all = [...NAV_SECTIONS.flatMap((s) => s.items), ...SETTINGS_ITEMS].map((i) => i.value);
  assert.equal(new Set(all).size, all.length, 'duplicate menu entry');
  for (const v of rendered) assert.ok(all.includes(v), `tab "${v}" missing from menu`);
  for (const v of all) assert.ok(rendered.has(v), `menu entry "${v}" has no TabsContent`);
});

test('sections are numbered 1..n and items get n.m labels', () => {
  NAV_SECTIONS.forEach((s, i) => assert.equal(s.number, i + 1));
  assert.equal(numberedLabel(1, 0), '1.1');
  assert.equal(numberedLabel(4, 2), '4.3');
});

test('overview is the first item', () => {
  assert.equal(NAV_SECTIONS[0].items[0].value, 'overview');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/foundation/nav-sections.test.mjs`
Expected: FAIL — module not found

- [ ] **Step 3: Write the menu definition**

```ts
// src/components/dashboard/nav/navSections.ts
// Numbered dashboard menu. Values are the existing ?tab= values — never rename them.
export type NavItem = { value: string; label: string };
export type NavSection = { number: number; label: string; items: NavItem[] };

export const NAV_SECTIONS: NavSection[] = [
  { number: 1, label: 'Visitors', items: [
    { value: 'overview', label: 'Overview' },
    { value: 'analytics', label: 'Analytics' },
    { value: 'realtime', label: 'Real-time' },
    { value: 'geolocation', label: 'Locations' },
    { value: 'cookiefree', label: 'Cookie-free' },
  ] },
  { number: 2, label: 'Acquisition', items: [
    { value: 'social-media', label: 'Social media' },
    { value: 'campaigns', label: 'Campaigns' },
    { value: 'paid-ads', label: 'Ads (GA4)' },
    { value: 'paid-ads-server', label: 'Ads (server-side)' },
    { value: 'attribution', label: 'Attribution gap' },
    { value: 'click-fraud', label: 'Click fraud' },
  ] },
  { number: 3, label: 'Behavior', items: [
    { value: 'navigation', label: 'Navigation flow' },
    { value: 'content-performance', label: 'Content' },
    { value: 'heatmap', label: 'Heatmaps' },
    { value: 'session-recording', label: 'Session recording' },
    { value: 'forms', label: 'Forms' },
  ] },
  { number: 4, label: 'AI agents', items: [
    { value: 'ai', label: 'AI traffic' },
    { value: 'ai-bots', label: 'AI agents & crawlers' },
    { value: 'server-logs', label: 'Server-side measurement' },
    { value: 'ai-visibility', label: 'GEO / AI search' },
    { value: 'zero-click-risk', label: 'Zero-click risk' },
    { value: 'agent-ops', label: 'Agent ops' },
  ] },
  { number: 5, label: 'Conversions', items: [
    { value: 'conversion-goals', label: 'Goals' },
    { value: 'abtesting', label: 'A/B testing' },
    { value: 'user-ltv', label: 'LTV & cohorts' },
  ] },
  { number: 6, label: 'Reports', items: [
    { value: 'kpi', label: 'KPI dashboard' },
    { value: 'kpi-catalog', label: 'AI KPI overview' },
    { value: 'report-builder', label: 'Report builder' },
    { value: 'alerts', label: 'Alerts' },
  ] },
];

export const SETTINGS_ITEMS: NavItem[] = [
  { value: 'setup', label: 'Setup & tracking script' },
  { value: 'integrations', label: 'Integrations' },
  { value: 'cortiq-api', label: 'CortIQ API & MCP' },
  { value: 'api-keys', label: 'Third-party keys' },
  { value: 'gdpr', label: 'GDPR' },
  { value: 'notifications', label: 'Notifications' },
  { value: 'tag-manager', label: 'Tag manager' },
  { value: 'warehouse', label: 'Data warehouse' },
  { value: 'advanced-features', label: 'Web vitals & white label' },
  { value: 'segments', label: 'Segments' },
  { value: 'utm-segments', label: 'UTM segments' },
  { value: 'ip-segments', label: 'Network segments' },
  { value: 'ecommerce', label: 'E-commerce' },
  { value: 'content-tracking', label: 'Content tracking' },
  { value: 'agent-macros', label: 'Agent macros' },
  { value: 'agent-registry', label: 'Agent registry' },
];

export const numberedLabel = (sectionNumber: number, itemIndex: number) => `${sectionNumber}.${itemIndex + 1}`;
```

Run the test. If it reports a tab "missing from menu" or "has no TabsContent", the list above drifted from `DashboardTabs.tsx`: add the missing value to the section where it belongs (do not delete a `TabsContent`).

- [ ] **Step 4: Sidebar component**

```tsx
// src/components/dashboard/nav/DashboardSidebar.tsx
import { useState } from 'react';
import { ChevronDown, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAV_SECTIONS, SETTINGS_ITEMS, numberedLabel } from './navSections';

export function DashboardSidebar({ activeTab, onSelect }: { activeTab: string; onSelect: (v: string) => void }) {
  const owning = NAV_SECTIONS.find((s) => s.items.some((i) => i.value === activeTab))?.number;
  const [open, setOpen] = useState<Set<number>>(new Set([owning ?? 1]));
  const toggle = (n: number) => setOpen((prev) => {
    const next = new Set(prev);
    next.has(n) ? next.delete(n) : next.add(n);
    return next;
  });
  const itemClass = (value: string) => cn(
    'block w-full rounded-md px-3 py-2 text-left text-sm transition-colors',
    value === activeTab ? 'bg-primary/10 font-medium text-primary' : 'text-foreground/80 hover:bg-muted',
  );

  return (
    <nav aria-label="Dashboard sections" className="space-y-1">
      {NAV_SECTIONS.map((s) => (
        <div key={s.number}>
          <button type="button" aria-expanded={open.has(s.number)} onClick={() => toggle(s.number)}
            className={cn('flex w-full items-center justify-between rounded-md px-3 py-2 text-left font-medium',
              owning === s.number ? 'text-primary' : 'text-foreground')}>
            <span>{s.number} {s.label}</span>
            <ChevronDown className={cn('h-4 w-4 transition-transform', open.has(s.number) && 'rotate-180')} />
          </button>
          {open.has(s.number) && (
            <ul className="ml-2 space-y-0.5">
              {s.items.map((item, idx) => (
                <li key={item.value}>
                  <button type="button" aria-current={item.value === activeTab ? 'page' : undefined}
                    className={itemClass(item.value)} onClick={() => onSelect(item.value)}>
                    {numberedLabel(s.number, idx)} {item.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      <details className="pt-4" open={SETTINGS_ITEMS.some((i) => i.value === activeTab)}>
        <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 font-medium">
          <Settings className="h-4 w-4" /> Settings
        </summary>
        <ul className="ml-2 space-y-0.5">
          {SETTINGS_ITEMS.map((item) => (
            <li key={item.value}>
              <button type="button" className={itemClass(item.value)} onClick={() => onSelect(item.value)}>{item.label}</button>
            </li>
          ))}
        </ul>
      </details>
    </nav>
  );
}
```

- [ ] **Step 5: Replace the dropdown tabs**

In `DashboardTabs.tsx`: delete `NavOption`, `NavGroup`, `NAV_GROUPS`, `SETTINGS_OPTIONS`, `NavGroupDropdown` and the `TabsList` block (approx. lines 67-262). Keep `<Tabs value={activeTab}>` and every `TabsContent` unchanged. Export the active-tab state so `Dashboard.tsx` can render the sidebar in its own column: change the component to accept `activeTab` and `onTabChange` props, and move the `searchParams` read (`searchParams.get('tab') || 'overview'`) and `setActiveTab` into `Dashboard.tsx`.

In `Dashboard.tsx` replace the `max-w-7xl` body with:

```tsx
<div className="mx-auto grid max-w-[1600px] gap-6 px-4 py-6 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_280px]">
  <aside className="lg:sticky lg:top-4 lg:self-start"><DashboardSidebar activeTab={activeTab} onSelect={setActiveTab} /></aside>
  <main className="min-w-0"><DashboardTabs ... activeTab={activeTab} onTabChange={setActiveTab} /></main>
  <div className="xl:sticky xl:top-4 xl:self-start"><FilterPanel siteId={selectedSite.id} /></div>
</div>
```

Below `lg` the three columns stack: menu, content, filters. Add a "Filters" `<details>` wrapper around `FilterPanel` below `xl` if the panel pushes content too far down (check at 390 px width).

- [ ] **Step 6: Run tests and build**

Run: `node --test tests/foundation/nav-sections.test.mjs && npm run build`
Expected: PASS, build succeeds. Manually: `/dashboard?tab=ai-bots` opens section 4 with "4.2 AI agents & crawlers" highlighted.

- [ ] **Step 7: Commit**

```bash
git add src/components/dashboard/nav tests/foundation/nav-sections.test.mjs src/components/dashboard/DashboardTabs.tsx src/pages/Dashboard.tsx
git commit -m "feat(dashboard): numbered section menu replaces grouped dropdown tabs"
```

---

### Task 7: WidgetCard with CSV/PDF export, shared Sparkline

**Files:**
- Create: `src/lib/printWidget.ts`, `src/components/dashboard/widgets/WidgetCard.tsx`, `src/components/dashboard/widgets/Sparkline.tsx`

**Interfaces:**
- Consumes: Task 2 (`toCsv`, `downloadCsv`)
- Produces:
  - `printWidget(node: HTMLElement, title: string): void`
  - `type WidgetExport = { filename: string; columns: string[]; rows: unknown[][] }`
  - `<WidgetCard title={string} subtitle?={string} exportData?={() => WidgetExport} actions?={ReactNode}>{children}</WidgetCard>`
  - `<Sparkline data={number[]} className?={string} />`

- [ ] **Step 1: printWidget**

```ts
// src/lib/printWidget.ts
// "PDF" export without dependencies: print a copy of one widget; the browser's dialog offers Save as PDF.
export function printWidget(node: HTMLElement, title: string): void {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument!;
  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((el) => el.outerHTML).join('');
  doc.open();
  doc.write(`<!doctype html><html class="light"><head><title>${title.replace(/</g, '&lt;')}</title>${styles}
    <style>@page{margin:16mm} body{background:#fff;color:#111} [data-widget-toolbar]{display:none!important}</style>
    </head><body><h1 style="font:600 18px system-ui;margin:0 0 12px">${title.replace(/</g, '&lt;')}</h1>${node.outerHTML}</body></html>`);
  doc.close();
  const done = () => setTimeout(() => iframe.remove(), 500);
  iframe.contentWindow!.addEventListener('afterprint', done);
  setTimeout(() => { iframe.contentWindow!.focus(); iframe.contentWindow!.print(); }, 300);
}
```

- [ ] **Step 2: WidgetCard**

```tsx
// src/components/dashboard/widgets/WidgetCard.tsx
import { useRef, type ReactNode } from 'react';
import { FileDown, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toCsv, downloadCsv } from '@/lib/csv';
import { printWidget } from '@/lib/printWidget';

export type WidgetExport = { filename: string; columns: string[]; rows: unknown[][] };

export function WidgetCard({ title, subtitle, exportData, actions, children }: {
  title: string; subtitle?: string; exportData?: () => WidgetExport; actions?: ReactNode; children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <section ref={ref} className="rounded-lg border bg-card p-5">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{title}</h3>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        <div data-widget-toolbar className="flex gap-1">
          {actions}
          {exportData && (
            <Button variant="ghost" size="icon" aria-label={`Export ${title} as CSV`} title="Export CSV"
              onClick={() => { const e = exportData(); downloadCsv(e.filename, toCsv(e.columns, e.rows)); }}>
              <FileDown className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" aria-label={`Print or save ${title} as PDF`} title="Print / PDF"
            onClick={() => ref.current && printWidget(ref.current, title)}>
            <Printer className="h-4 w-4" />
          </Button>
        </div>
      </header>
      {children}
    </section>
  );
}
```

- [ ] **Step 3: Sparkline**

```tsx
// src/components/dashboard/widgets/Sparkline.tsx
import { Line, LineChart, ResponsiveContainer } from 'recharts';

export function Sparkline({ data, className }: { data: number[]; className?: string }) {
  if (data.length < 2) return <div className={className} style={{ height: 40 }} aria-hidden="true" />;
  const points = data.map((v, i) => ({ i, v }));
  return (
    <div className={className} style={{ height: 40 }} aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points}>
          <Line type="monotone" dataKey="v" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 4: Build**

Run: `npm run build` → success.

- [ ] **Step 5: Commit**

```bash
git add src/lib/printWidget.ts src/components/dashboard/widgets
git commit -m "feat(export): WidgetCard with CSV and print-to-PDF, shared Sparkline"
```

---

### Task 8: Overview v2 — data hook, status strip, KPI row, module cards

**Files:**
- Create: `src/hooks/useOverviewMetrics.ts`, `src/components/dashboard/overview/StatusStrip.tsx`, `KpiRow.tsx`, `ModuleCards.tsx`
- Rewrite: `src/components/dashboard/tabs/OverviewTab.tsx`
- Modify: `src/components/dashboard/DashboardTabs.tsx` (Overview props)

**Interfaces:**
- Consumes: Task 1 (`percentChange`), Task 3 RPC, Task 5 (`useDashboardFilters`), Task 7 (`WidgetCard`, `Sparkline`, `WidgetExport`), `useUTMSegments()` + `resolveTokens` from `UTMSegmentContext`, `useConversionGoalHealth` (existing), `AIInsightsWidget`, `TopPagesData` (existing).
- Produces:
  - `type PeriodTotals = { visits: number; pageViews: number; conversions: number; ai: { total: number; training: number; agentic: number; citation: number } }`
  - `type OverviewMetrics = { current: PeriodTotals; previous: PeriodTotals; daily: { date: string; visits: number; pageViews: number; conversions: number; ai: number }[]; lastPageViewAt: string | null; lastServerHitAt: string | null; serverHits: number }`
  - `useOverviewMetrics(siteId: string): UseQueryResult<OverviewMetrics>`
  - `<OverviewTab selectedSite={Site} onNavigate={(tab: string) => void} />`

- [ ] **Step 1: Hook**

```ts
// src/hooks/useOverviewMetrics.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDashboardFilters } from '@/contexts/DashboardFiltersContext';
import { useUTMSegments, resolveTokens } from '@/contexts/UTMSegmentContext';

export type PeriodTotals = { visits: number; pageViews: number; conversions: number;
  ai: { total: number; training: number; agentic: number; citation: number } };
export type OverviewMetrics = { current: PeriodTotals; previous: PeriodTotals;
  daily: { date: string; visits: number; pageViews: number; conversions: number; ai: number }[];
  lastPageViewAt: string | null; lastServerHitAt: string | null; serverHits: number };

export function useOverviewMetrics(siteId: string) {
  const { filters } = useDashboardFilters();
  const { segments } = useUTMSegments();
  const segment = segments.find((s) => s.id === filters.segmentId);
  const segmentFilters = segment
    ? segment.filters.filter((f) => f.value.trim()).map((f) => ({ ...f, value: resolveTokens(f.value) }))
    : null;
  return useQuery({
    queryKey: ['overview-metrics', siteId, filters.from, filters.to, filters.path, segmentFilters],
    enabled: !!siteId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_overview_metrics', {
        p_site_id: siteId, p_from: filters.from, p_to: filters.to,
        p_path: filters.path, p_segment: segmentFilters,
      });
      if (error) throw error;
      return data as OverviewMetrics;
    },
  });
}
```

- [ ] **Step 2: StatusStrip**

```tsx
// src/components/dashboard/overview/StatusStrip.tsx
import { formatDistanceToNow } from 'date-fns';

const DAY_MS = 86_400_000;

export function StatusStrip({ domain, trackingMode, lastPageViewAt, lastServerHitAt, onNavigate }: {
  domain: string; trackingMode: 'cookieless' | 'full'; lastPageViewAt: string | null;
  lastServerHitAt: string | null; onNavigate: (tab: string) => void;
}) {
  const receiving = lastPageViewAt && Date.now() - Date.parse(lastPageViewAt) < DAY_MS;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      <span className="text-lg font-semibold">{domain}</span>
      <span className="flex items-center gap-1.5">
        <span className={`h-2 w-2 rounded-full ${receiving ? 'bg-emerald-500' : 'bg-amber-500'}`} aria-hidden="true" />
        {receiving
          ? 'Receiving data'
          : lastPageViewAt ? `No page views for ${formatDistanceToNow(new Date(lastPageViewAt))}` : 'No page views yet'}
      </span>
      <span className="text-muted-foreground">|</span>
      <span>{trackingMode === 'cookieless' ? 'Cookieless mode' : 'Full mode'}</span>
      <span className="text-muted-foreground">|</span>
      {lastServerHitAt
        ? <span>Server-side: last hit {formatDistanceToNow(new Date(lastServerHitAt))} ago</span>
        : <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => onNavigate('server-logs')}>
            Server-side measurement not set up
          </button>}
    </div>
  );
}
```

- [ ] **Step 3: KpiRow**

```tsx
// src/components/dashboard/overview/KpiRow.tsx
import { percentChange } from '@/lib/dashboard/filters';
import { Sparkline } from '@/components/dashboard/widgets/Sparkline';
import { WidgetCard } from '@/components/dashboard/widgets/WidgetCard';
import type { OverviewMetrics } from '@/hooks/useOverviewMetrics';

const fmt = new Intl.NumberFormat('en-US');

function Delta({ current, previous }: { current: number; previous: number }) {
  const pct = percentChange(current, previous);
  if (pct === null) return <span className="text-xs text-muted-foreground">{current ? 'New' : '—'}</span>;
  const up = pct >= 0;
  return (
    <span className={`text-xs font-medium ${up ? 'text-emerald-600' : 'text-red-600'}`}>
      {up ? '▲' : '▼'} {Math.abs(pct)}% <span className="font-normal text-muted-foreground">vs previous period</span>
    </span>
  );
}

export function KpiRow({ m, from, to }: { m: OverviewMetrics; from: string; to: string }) {
  const convRate = (t: { visits: number; conversions: number }) => (t.visits ? (t.conversions / t.visits) * 100 : 0);
  const tiles = [
    { label: 'Visits', cur: m.current.visits, prev: m.previous.visits, series: m.daily.map((d) => d.visits) },
    { label: 'Page views', cur: m.current.pageViews, prev: m.previous.pageViews, series: m.daily.map((d) => d.pageViews) },
    { label: 'Conversions', cur: m.current.conversions, prev: m.previous.conversions, series: m.daily.map((d) => d.conversions) },
    { label: 'Conversion rate', cur: convRate(m.current), prev: convRate(m.previous), series: null, pct: true },
    { label: 'AI visits', cur: m.current.ai.total, prev: m.previous.ai.total, series: m.daily.map((d) => d.ai) },
    { label: 'AI per 100 visits', cur: m.current.visits ? (m.current.ai.total / m.current.visits) * 100 : 0,
      prev: m.previous.visits ? (m.previous.ai.total / m.previous.visits) * 100 : 0, series: null },
  ];
  return (
    <WidgetCard title="Key figures" subtitle={`${from} – ${to}`}
      exportData={() => ({
        filename: `cortiq-overview-${from}-${to}`,
        columns: ['Date', 'Visits', 'Page views', 'Conversions', 'AI visits'],
        rows: m.daily.map((d) => [d.date, d.visits, d.pageViews, d.conversions, d.ai]),
      })}>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map((t) => (
          <div key={t.label} className="space-y-1">
            <p className="text-sm text-muted-foreground">{t.label}</p>
            <p className="text-2xl font-semibold tabular-nums">{t.pct ? `${t.cur.toFixed(1)}%` : fmt.format(Math.round(t.cur * 10) / 10)}</p>
            <Delta current={t.cur} previous={t.prev} />
            {t.series && <Sparkline data={t.series} />}
          </div>
        ))}
      </div>
    </WidgetCard>
  );
}
```

- [ ] **Step 4: ModuleCards**

```tsx
// src/components/dashboard/overview/ModuleCards.tsx
import { Button } from '@/components/ui/button';
import { WidgetCard } from '@/components/dashboard/widgets/WidgetCard';
import { BOT_CATEGORY_META } from '@/lib/aiBotRegistry';
import type { OverviewMetrics } from '@/hooks/useOverviewMetrics';

type Issue = { goalName: string; issue: string };

export function ModuleCards({ m, goalIssues, goalCount, onNavigate }: {
  m: OverviewMetrics; goalIssues: Issue[]; goalCount: number; onNavigate: (tab: string) => void;
}) {
  const open = (tab: string, label = 'Open') => <Button variant="link" className="px-0" onClick={() => onNavigate(tab)}>{label} →</Button>;
  const ai = m.current.ai;
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <WidgetCard title="AI agents" subtitle="Training, agentic and citation traffic"
        exportData={() => ({ filename: 'cortiq-ai-categories', columns: ['Category', 'Visits'],
          rows: [['Training', ai.training], ['Agentic', ai.agentic], ['Citation', ai.citation]] })}>
        <dl className="grid grid-cols-3 gap-3 text-center">
          {(['training', 'agentic', 'citation'] as const).map((k) => (
            <div key={k}><dt className="text-xs text-muted-foreground">{BOT_CATEGORY_META[k]?.label ?? k}</dt>
              <dd className="text-xl font-semibold tabular-nums">{ai[k]}</dd></div>
          ))}
        </dl>
        {open('ai-bots')}
      </WidgetCard>

      <WidgetCard title="Conversions" subtitle={goalCount ? `${goalCount} goals configured` : 'No goals configured'}>
        {goalCount === 0
          ? <p className="text-sm">Not set up. {open('conversion-goals', 'Set up goals')}</p>
          : goalIssues.length === 0
            ? <p className="text-sm">All goals look healthy. {open('conversion-goals')}</p>
            : <ul className="space-y-1 text-sm">{goalIssues.map((g) => (
                <li key={g.goalName + g.issue}><span className="font-medium">{g.goalName}</span>: {g.issue.replace(/_/g, ' ')}</li>))}
                <li>{open('conversion-goals', 'Fix in Goals')}</li></ul>}
      </WidgetCard>

      <WidgetCard title="Heatmaps & forms" subtitle="Clicks, scroll depth and form drop-off">
        <p className="text-sm text-muted-foreground">Recorded after analytics consent.</p>
        <div className="flex gap-4">{open('heatmap', 'Heatmaps')}{open('forms', 'Forms')}</div>
      </WidgetCard>

      <WidgetCard title="Server-side measurement" subtitle="AI crawlers that never run JavaScript">
        {m.serverHits > 0
          ? <p className="text-sm"><span className="text-xl font-semibold tabular-nums">{m.serverHits}</span> server-side hits in this period. {open('server-logs')}</p>
          : <p className="text-sm">Not set up — most AI crawlers are invisible without it. {open('server-logs', 'Install the adapter')}</p>}
      </WidgetCard>
    </div>
  );
}
```

`BOT_CATEGORY_META` (`src/lib/aiBotRegistry.ts:21`) is `Record<BotCategory, { label; description }>` with labels "Training Crawlers", "Agentic Fetches", "Citation & Search Crawlers". `useConversionGoalHealth(siteId)` is a TanStack query whose `data` is `GoalHealth[]` (`{ goalId, goalName, firingRate, lastFiredAt, status: 'healthy'|'fires_too_often'|'silent'|'duplicate_primary', warning }`); OverviewTab maps it to `goalIssues`.

- [ ] **Step 5: Rewrite OverviewTab**

```tsx
// src/components/dashboard/tabs/OverviewTab.tsx
import { AIInsightsWidget } from '@/components/dashboard/AIInsightsWidget';
import { TopPagesData } from '@/components/dashboard/TopPagesData';
import { StatusStrip } from '@/components/dashboard/overview/StatusStrip';
import { KpiRow } from '@/components/dashboard/overview/KpiRow';
import { ModuleCards } from '@/components/dashboard/overview/ModuleCards';
import { useOverviewMetrics } from '@/hooks/useOverviewMetrics';
import { useConversionGoalHealth } from '@/hooks/useConversionGoalHealth';
import { useDashboardFilters } from '@/contexts/DashboardFiltersContext';
import type { Site } from '@/types/dashboard';

export function OverviewTab({ selectedSite, onNavigate }: { selectedSite: Site; onNavigate: (tab: string) => void }) {
  const { filters } = useDashboardFilters();
  const metrics = useOverviewMetrics(selectedSite.id);
  const health = useConversionGoalHealth(selectedSite.id);
  const goals = health.data ?? [];
  const goalIssues = goals.filter((g) => g.status !== 'healthy').map((g) => ({ goalName: g.goalName, issue: g.status }));
  const trackingMode = ((selectedSite as Site & { tracking_mode?: string }).tracking_mode === 'cookieless') ? 'cookieless' : 'full';

  if (metrics.isLoading) return <div className="h-64 animate-pulse rounded-lg bg-muted" aria-busy="true" />;
  if (metrics.error || !metrics.data) {
    return <p className="rounded-lg border p-6 text-sm">Could not load the overview. Try again, or narrow the date range.</p>;
  }
  const m = metrics.data;
  return (
    <div className="space-y-6">
      <StatusStrip domain={selectedSite.domain} trackingMode={trackingMode}
        lastPageViewAt={m.lastPageViewAt} lastServerHitAt={m.lastServerHitAt} onNavigate={onNavigate} />
      <KpiRow m={m} from={filters.from} to={filters.to} />
      <ModuleCards m={m} goalCount={goals.length} goalIssues={goalIssues} onNavigate={onNavigate} />
      <div className="grid gap-6 lg:grid-cols-2">
        <TopPagesData siteId={selectedSite.id} startDate={`${filters.from}T00:00:00Z`} endDate={`${filters.to}T23:59:59Z`} />
        <AIInsightsWidget siteId={selectedSite.id} />
      </div>
    </div>
  );
}
```

Import paths for `AIInsightsWidget` and `TopPagesData` are the ones the current `OverviewTab.tsx` uses (lines 3 and 7). `SetupHealthCheck` moves to the `setup` tab (render it at the top of `SetupTab`).

In `DashboardTabs.tsx` change the Overview render to `<OverviewTab selectedSite={selectedSite} onNavigate={onTabChange} />` (removes the undeclared `onNavigateToAI/Setup/Integrations` props).

- [ ] **Step 6: Verify**

Run: `npm run build && npm run test:foundation` → success, all pass.
Manually on `npm run dev` with a cookieless site and a full site: KPI tiles say "Visits"; a new site shows "New" not "Infinity%"; URL `/pricing` changes Visits/Page views/AI but the status strip stays the same; CSV opens in Excel with å/ä/ö intact; Print → Save as PDF shows one widget on white.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useOverviewMetrics.ts src/components/dashboard/overview src/components/dashboard/tabs/OverviewTab.tsx src/components/dashboard/tabs/SetupTab.tsx src/components/dashboard/DashboardTabs.tsx
git commit -m "feat(dashboard): Overview v2 — status strip, KPIs with change and AI traffic, module cards"
```

---

### Task 9: Filter honesty on other tabs

**Files:**
- Create: `src/components/dashboard/FilterScopeNotice.tsx`
- Modify: `src/components/dashboard/DashboardTabs.tsx`

**Interfaces:**
- Consumes: Task 5 (`useDashboardFilters`)
- Produces: `<FilterScopeNotice supports={{ date: boolean }} />`

Only Overview honours URL and segment in this plan. Other tabs must not look filtered when they are not.

- [ ] **Step 1: Component**

```tsx
// src/components/dashboard/FilterScopeNotice.tsx
import { Info } from 'lucide-react';
import { useDashboardFilters } from '@/contexts/DashboardFiltersContext';

export function FilterScopeNotice({ supports }: { supports: { date: boolean } }) {
  const { filters } = useDashboardFilters();
  const ignored = [
    filters.path && 'URL',
    filters.segmentId && 'segment',
    !supports.date && 'date range',
  ].filter(Boolean) as string[];
  if (!ignored.length) return null;
  return (
    <p role="note" className="mb-4 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
      <Info className="h-4 w-4" /> This view does not apply the {ignored.join(' and ')} filter yet.
    </p>
  );
}
```

- [ ] **Step 2: Render it**

In `DashboardTabs.tsx`, render `<FilterScopeNotice supports={{ date: X }} />` once above the `<Tabs>` content for every `activeTab !== 'overview'`, with `X` from a `DATE_AWARE` set built from the date-handling list in the exploration notes: tabs that receive `dateRange` or derived start/end (`analytics`, `geolocation`, `campaigns`, `content-performance`, `content-tracking`, `paid-ads-server`, `click-fraud`, `cookiefree`) are `true`; all others `false`.

- [ ] **Step 3: Build and commit**

Run: `npm run build` → success.

```bash
git add src/components/dashboard/FilterScopeNotice.tsx src/components/dashboard/DashboardTabs.tsx
git commit -m "feat(dashboard): say which filters a view ignores"
```

---

### Task 10: Ship

- [ ] **Step 1: Full verification**

Run: `npm run test:foundation && npm run build`
Expected: all tests pass (280 + 5 new files), build prerenders 22 pages. Revert `public/cortiq-wordpress-plugin.zip` if it shows a line-ending-only diff.

- [ ] **Step 2: Apply migrations (prod)**

```bash
npx supabase db query --linked -f supabase/migrations/20261015000001_overview_metrics.sql
npx supabase migration repair --status applied 20261015000001
npx supabase db query --linked -f supabase/migrations/20261015000002_dashboard_saved_filters.sql
npx supabase migration repair --status applied 20261015000002
```

Then check advisors (Supabase MCP `get_advisors`, type `security`) — no new findings for the two objects.

- [ ] **Step 3: PR, merge, FTP**

Branch `feat/dashboard-overview-v2`, one PR with the commits above. After merge: `npm run build`, user uploads `dist` via FTP.

---

## Self-review notes

- Coverage: status strip (T8), KPI row with sparklines + deltas + AI (T3, T8), module cards with "Not set up" (T8), AI insights last (T8), CSV/PDF per widget (T2, T7, T8), filter panel with date/URL/segment/saved (T1, T4, T5), numbered menu (T6), honest scope for other tabs (T9).
- Out of scope (later plans): applying URL/segment filters inside the other 40 tabs; retrofitting `WidgetCard` export onto existing tab widgets; Visits log.
- Type names used across tasks: `DashboardFilters`, `OverviewMetrics`, `PeriodTotals`, `WidgetExport`, `SavedFilter`, `NavSection`, `useDashboardFilters`, `useOverviewMetrics`, `useSavedFilters` — consistent.

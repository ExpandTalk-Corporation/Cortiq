# Cookieless Per-Link Click Counter (Phase A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an anonymous, aggregate per-link click counter that works in CortIQ's cookieless mode without consent.

**Architecture:** A new `link_click_counts` table holds daily per-link tallies (no session/visitor linkage, no coordinates). A public edge function `link-click-counter` sanitises and upsert-increments those tallies. `spa-tracking.js` sends anonymous click payloads from the analytics-consent-gated pipeline (which is unconditional in cookieless). A dashboard widget reads the aggregate and renders top links.

**Tech Stack:** Supabase Postgres + RLS, Deno Edge Functions, vanilla JS tracking script, React 18 + TypeScript + TanStack-style hooks + shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-08-30-cookieless-link-click-counter-design.md`

## Global Constraints

- Anonymous aggregate only: NEVER store `session_id`, `visitor_id`, x/y coordinates, or a sub-day timestamp on `link_click_counts`. Their absence is what keeps the data exemption-eligible.
- `page_path` and (for anchors) `link_key` MUST have query string and hash stripped, both client-side and re-stripped server-side.
- `link_label` and `link_key` truncated to 200 chars.
- Allowed `link_kind`: `'link' | 'button'`. Allowed `device_type`: `'desktop' | 'mobile' | 'tablet'`.
- The counter is gated per site by analytics consent: it runs from `startAnalytics()`, which only executes when `hasAnalyticsConsent()` is true (always true in cookieless) or `config.requireConsent === false`. Do NOT gate it on `hasInteractionConsent()`.
- Edge Functions use `Deno.env.get()` for secrets; never hardcode. Service-role key only in the function.
- RLS convention for new tables: read via `site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid())`; writes only via service role.
- Repo has NO JavaScript unit-test runner (no vitest/jest). Frontend verification is `npx tsc --noEmit` + `npm run build:client` + a manual data check. Edge-function pure logic is tested with `deno test`. DB behaviour is verified with SQL. Adding a JS test framework is out of scope.

---

### Task 1: Migration — `link_click_counts` table

**Files:**
- Create: `supabase/migrations/20260830120000_add_link_click_counts.sql`

**Interfaces:**
- Produces: table `public.link_click_counts` with columns `id, site_id, page_path, link_kind, link_key, link_label, device_type, day, click_count, created_at, updated_at`; unique index on `(site_id, page_path, link_kind, link_key, device_type, day)`; RLS select policy for owners.

- [ ] **Step 1: Write the migration**

```sql
-- Anonymous aggregate per-link click counter (audience-measurement exemption).
-- One row per (site, page path, link, device, UTC day) with a running click_count.
-- Deliberately carries NO session_id, visitor_id, coordinates, or sub-day timestamp —
-- that absence is what keeps this table consent-exempt for cookieless sites.

CREATE TABLE IF NOT EXISTS public.link_click_counts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  page_path   text NOT NULL,
  link_kind   text NOT NULL CHECK (link_kind IN ('link','button')),
  link_key    text NOT NULL,
  link_label  text,
  device_type text NOT NULL DEFAULT 'desktop' CHECK (device_type IN ('desktop','mobile','tablet')),
  day         date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  click_count integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS link_click_counts_unique
  ON public.link_click_counts (site_id, page_path, link_kind, link_key, device_type, day);

CREATE INDEX IF NOT EXISTS link_click_counts_site_day
  ON public.link_click_counts (site_id, day);

ALTER TABLE public.link_click_counts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS link_click_counts_select_own ON public.link_click_counts;
CREATE POLICY link_click_counts_select_own
  ON public.link_click_counts
  FOR SELECT
  USING (site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid()));

COMMENT ON TABLE public.link_click_counts IS
  'Anonymous aggregate per-link click tallies (daily buckets). No session/visitor linkage or coordinates — consent-exempt audience measurement. Written only by the link-click-counter edge function (service role).';
```

- [ ] **Step 2: Apply the migration**

Run: `npm run supabase:db:push`
Expected: migration applies without error.

- [ ] **Step 3: Verify schema, index, and RLS exist**

Run:
```bash
supabase db push --dry-run >/dev/null 2>&1; \
psql "$SUPABASE_DB_URL" -c "\d+ public.link_click_counts" || echo "use SQL editor / MCP execute_sql instead"
```
If no local psql, run this SQL via the Supabase SQL editor or MCP `execute_sql`:
```sql
SELECT column_name FROM information_schema.columns WHERE table_name='link_click_counts' ORDER BY ordinal_position;
SELECT indexname FROM pg_indexes WHERE tablename='link_click_counts';
SELECT relrowsecurity FROM pg_class WHERE relname='link_click_counts';
```
Expected: 11 columns as defined; `link_click_counts_unique` present; `relrowsecurity = true`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260830120000_add_link_click_counts.sql
git commit -m "feat(db): add link_click_counts aggregate table + RLS"
```

---

### Task 2: Edge function `link-click-counter`

**Files:**
- Create: `supabase/functions/link-click-counter/sanitize.ts`
- Create: `supabase/functions/link-click-counter/sanitize.test.ts`
- Create: `supabase/functions/link-click-counter/index.ts`
- Modify: `supabase/config.toml` (add `verify_jwt = false` for the function)

**Interfaces:**
- Consumes: `link_click_counts` table (Task 1).
- Produces: `POST /functions/v1/link-click-counter` accepting `{ siteId, pagePath, linkKind, linkKey, linkLabel, deviceType }` with `Authorization: Bearer <site tracking_id or company api_key>`; upsert-increments one daily row. Exports `sanitize(raw): CleanPayload` and `stripUrlToKey(value, kind): string`.

- [ ] **Step 1: Write the failing sanitizer test**

Create `supabase/functions/link-click-counter/sanitize.test.ts`:
```ts
import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { sanitize } from './sanitize.ts';

Deno.test('strips query and hash from pagePath and anchor link_key', () => {
  const out = sanitize({
    pagePath: '/produkter/yxa?utm_source=fb#top',
    linkKind: 'link',
    linkKey: 'vikingage.se/kontakt?ref=foo#form',
    linkLabel: 'Kontakta oss',
    deviceType: 'mobile',
  });
  assertEquals(out.pagePath, '/produkter/yxa');
  assertEquals(out.linkKey, 'vikingage.se/kontakt');
  assertEquals(out.linkKind, 'link');
  assertEquals(out.deviceType, 'mobile');
});

Deno.test('truncates label and key to 200 chars', () => {
  const long = 'a'.repeat(500);
  const out = sanitize({ pagePath: '/', linkKind: 'button', linkKey: long, linkLabel: long, deviceType: 'x' });
  assertEquals(out.linkKey.length, 200);
  assertEquals(out.linkLabel?.length, 200);
});

Deno.test('normalises unknown device_type to desktop and rejects bad kind', () => {
  const out = sanitize({ pagePath: '/', linkKind: 'button', linkKey: 'Boka', linkLabel: 'Boka', deviceType: 'weird' });
  assertEquals(out.deviceType, 'desktop');
  assertThrows(() => sanitize({ pagePath: '/', linkKind: 'nope', linkKey: 'x', linkLabel: 'x', deviceType: 'desktop' }));
});

Deno.test('rejects empty pagePath or linkKey', () => {
  assertThrows(() => sanitize({ pagePath: '', linkKind: 'link', linkKey: 'x', linkLabel: '', deviceType: 'desktop' }));
  assertThrows(() => sanitize({ pagePath: '/', linkKind: 'link', linkKey: '', linkLabel: '', deviceType: 'desktop' }));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `deno test supabase/functions/link-click-counter/sanitize.test.ts`
Expected: FAIL — `Cannot find module './sanitize.ts'`.

- [ ] **Step 3: Write the sanitizer**

Create `supabase/functions/link-click-counter/sanitize.ts`:
```ts
export interface RawPayload {
  pagePath: unknown;
  linkKind: unknown;
  linkKey: unknown;
  linkLabel: unknown;
  deviceType: unknown;
}

export interface CleanPayload {
  pagePath: string;
  linkKind: 'link' | 'button';
  linkKey: string;
  linkLabel: string | null;
  deviceType: 'desktop' | 'mobile' | 'tablet';
}

const DEVICES = ['desktop', 'mobile', 'tablet'] as const;

// Remove anything from the first '?' or '#' onward, then trim/truncate.
function stripQueryHash(value: string): string {
  const cut = value.split(/[?#]/)[0];
  return cut.trim().slice(0, 200);
}

export function sanitize(raw: RawPayload): CleanPayload {
  const kind = String(raw.linkKind ?? '');
  if (kind !== 'link' && kind !== 'button') {
    throw new Error(`invalid link_kind: ${kind}`);
  }

  const pagePath = stripQueryHash(String(raw.pagePath ?? ''));
  if (!pagePath) throw new Error('empty pagePath');

  // Anchors carry a URL-shaped key (host+path) — strip query/hash. Buttons carry text.
  const rawKey = String(raw.linkKey ?? '');
  const linkKey = kind === 'link' ? stripQueryHash(rawKey) : rawKey.trim().slice(0, 200);
  if (!linkKey) throw new Error('empty linkKey');

  const label = String(raw.linkLabel ?? '').trim().slice(0, 200);
  const device = String(raw.deviceType ?? '');
  const deviceType = (DEVICES as readonly string[]).includes(device)
    ? (device as CleanPayload['deviceType'])
    : 'desktop';

  return { pagePath, linkKind: kind, linkKey, linkLabel: label || null, deviceType };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `deno test supabase/functions/link-click-counter/sanitize.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the function handler**

Create `supabase/functions/link-click-counter/index.ts`:
```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sanitize } from './sanitize.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'missing bearer' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const apiKey = authHeader.replace('Bearer ', '');

    const body = await req.json();
    const siteId = String(body.siteId ?? '');
    if (!siteId) {
      return new Response(JSON.stringify({ error: 'missing siteId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Authorize the site against the key. Accept either the site's own tracking_id
    // or the owning company's api_key (same model as track-event).
    const { data: siteByKey } = await supabase
      .from('sites').select('id, is_active').eq('id', siteId).eq('tracking_id', apiKey).maybeSingle();

    let authorized = !!(siteByKey && siteByKey.is_active);
    if (!authorized) {
      const { data: company } = await supabase
        .from('companies').select('id').eq('api_key', apiKey).maybeSingle();
      if (company) {
        const { data: ownedSite } = await supabase
          .from('sites').select('id, is_active').eq('id', siteId).eq('user_id', company.id).maybeSingle();
        authorized = !!(ownedSite && ownedSite.is_active);
      }
    }
    if (!authorized) {
      return new Response(JSON.stringify({ error: 'forbidden' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let clean;
    try {
      clean = sanitize(body);
    } catch (e) {
      return new Response(JSON.stringify({ error: 'invalid payload', detail: String(e) }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const day = new Date().toISOString().slice(0, 10); // UTC date
    // Atomic upsert-increment. Requires the unique index from Task 1.
    const { error } = await supabase.rpc('increment_link_click', {
      p_site_id: siteId,
      p_page_path: clean.pagePath,
      p_link_kind: clean.linkKind,
      p_link_key: clean.linkKey,
      p_link_label: clean.linkLabel,
      p_device_type: clean.deviceType,
      p_day: day,
    });
    if (error) {
      console.error('increment_link_click failed:', error);
      return new Response(JSON.stringify({ error: 'write failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ ok: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('link-click-counter error:', e);
    // Never break the host page — always return, never throw to the client.
    return new Response(JSON.stringify({ ok: false }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
```

- [ ] **Step 6: Add the atomic increment RPC to the migration**

The handler calls `increment_link_click`. Add this function to the SAME migration file from Task 1 (append), then re-run `npm run supabase:db:push`:
```sql
CREATE OR REPLACE FUNCTION public.increment_link_click(
  p_site_id uuid, p_page_path text, p_link_kind text, p_link_key text,
  p_link_label text, p_device_type text, p_day date
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.link_click_counts
    (site_id, page_path, link_kind, link_key, link_label, device_type, day, click_count)
  VALUES
    (p_site_id, p_page_path, p_link_kind, p_link_key, p_link_label, p_device_type, p_day, 1)
  ON CONFLICT (site_id, page_path, link_kind, link_key, device_type, day)
  DO UPDATE SET click_count = public.link_click_counts.click_count + 1, updated_at = now();
$$;

REVOKE ALL ON FUNCTION public.increment_link_click(uuid,text,text,text,text,text,date) FROM public, anon, authenticated;
```
(Service role bypasses the REVOKE; anon/authenticated cannot call it directly.)

- [ ] **Step 7: Register `verify_jwt = false` in config.toml**

In `supabase/config.toml`, add (mirroring the other public tracking endpoints):
```toml
[functions.link-click-counter]
verify_jwt = false
```

- [ ] **Step 8: Deploy and integration-test the increment**

Run:
```bash
supabase functions deploy link-click-counter --no-verify-jwt
```
Then call it twice with a real site's tracking_id and confirm the tally reaches 2. Replace `TRACKING_ID` and `SITE_ID`:
```bash
for i in 1 2; do curl -s -X POST "https://cxmkdtgfocgbfizawlwa.supabase.co/functions/v1/link-click-counter" \
  -H "Authorization: Bearer TRACKING_ID" -H "Content-Type: application/json" \
  -d '{"siteId":"SITE_ID","pagePath":"/test?x=1#y","linkKind":"link","linkKey":"vikingage.se/kontakt?ref=z","linkLabel":"Kontakt","deviceType":"mobile"}'; echo; done
```
Then via SQL editor / MCP `execute_sql`:
```sql
SELECT page_path, link_key, device_type, day, click_count
FROM link_click_counts WHERE site_id='SITE_ID' AND link_key='vikingage.se/kontakt';
```
Expected: exactly one row, `page_path='/test'`, `link_key='vikingage.se/kontakt'`, `click_count=2`.

- [ ] **Step 9: Commit**

```bash
git add supabase/functions/link-click-counter/ supabase/config.toml supabase/migrations/20260830120000_add_link_click_counts.sql
git commit -m "feat(edge): link-click-counter function with sanitiser + atomic increment RPC"
```

---

### Task 3: Tracking script — `setupAggregateLinkCounter()`

**Files:**
- Modify: `public/spa-tracking.js` (add helpers + function; call it in `startAnalytics()` after `trackPageView()`)

**Interfaces:**
- Consumes: `POST /functions/v1/link-click-counter` (Task 2), existing `SITE_ID`, `API_URL`, `API_KEY`, `getDeviceType()`.
- Produces: anonymous click payloads carrying only `{ siteId, pagePath, linkKind, linkKey, linkLabel, deviceType }`.

- [ ] **Step 1: Add the counter function**

Insert immediately BEFORE the `startAnalytics` function (around `public/spa-tracking.js:550`):
```js
  // Anonymous aggregate per-link counter. Runs under analytics consent (unconditional in
  // cookieless) — deliberately NOT behind hasInteractionConsent(). Sends no session id,
  // no visitor id, no coordinates: only page path + link + device, so it stays within the
  // audience-measurement exemption. Query/hash are stripped before sending.
  function linkDestination(anchor) {
    try {
      const u = new URL(anchor.href, window.location.origin);
      return (u.host + u.pathname).slice(0, 200);
    } catch (_) { return ''; }
  }

  function setupAggregateLinkCounter() {
    document.addEventListener('click', function (e) {
      const el = e.target.closest && e.target.closest('a[href], button, [role="button"]');
      if (!el) return;
      const isAnchor = el.tagName === 'A' && el.getAttribute('href');
      const label = (el.textContent || '').trim().slice(0, 200);
      const linkKind = isAnchor ? 'link' : 'button';
      const linkKey = isAnchor ? linkDestination(el) : label;
      if (!linkKey) return;

      const payload = {
        siteId: SITE_ID,
        pagePath: window.location.pathname, // no search, no hash
        linkKind: linkKind,
        linkKey: linkKey,
        linkLabel: label,
        deviceType: getDeviceType()
      };

      try {
        fetch(API_URL + '/link-click-counter', {
          method: 'POST',
          headers: API_KEY
            ? { 'Authorization': 'Bearer ' + API_KEY, 'Content-Type': 'application/json' }
            : { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true // survive the navigation the click may trigger
        }).catch(function () {});
      } catch (_) {}
    }, true); // capture phase: fire before navigation
  }
```

- [ ] **Step 2: Call it from `startAnalytics()`**

Modify `startAnalytics()` (currently `public/spa-tracking.js:552-562`) to add the counter after the pageview:
```js
  async function startAnalytics() {
    if (!COOKIELESS) {
      await identifyVisitor();
    }
    trackPageView();
    setupAggregateLinkCounter(); // anonymous per-link tallies — runs in cookieless too
    setupClickTracking();
    setupConversionTracking();
    setupScrollTracking();
  }
```

- [ ] **Step 3: Type/build sanity check**

Run: `npm run build:client`
Expected: build succeeds (the script is static JS in `public/`, so this confirms nothing else broke).

- [ ] **Step 4: Manual payload verification**

Serve the built site (or load `public/spa-tracking.js` on a cookieless test page), open DevTools → Network, click a link and a button. For each `link-click-counter` request, confirm the JSON body contains ONLY `siteId, pagePath, linkKind, linkKey, linkLabel, deviceType`, that `pagePath` has no `?`/`#`, and that there is NO `session_id`, `visitor_id`, `x`, or `y`. Confirm the row appears in `link_click_counts` via SQL.

- [ ] **Step 5: Commit**

```bash
git add public/spa-tracking.js
git commit -m "feat(tracking): anonymous aggregate per-link counter in cookieless pipeline"
```

---

### Task 4: Dashboard — hook + widget

**Files:**
- Create: `src/hooks/useLinkClickCounts.ts`
- Create: `src/components/dashboard/LinkClickCounts.tsx`
- Modify: `src/components/dashboard/tabs/NavigationTab.tsx` (render `<LinkClickCounts />` near `<NavigationAnalytics />`)

**Interfaces:**
- Consumes: `link_click_counts` (Task 1) via the Supabase client.
- Produces: `useLinkClickCounts(siteId, days)` returning `{ rows: LinkClickRow[]; loading: boolean; error: string | null; reload: (days?: number) => Promise<void> }` where `LinkClickRow = { page_path, link_kind, link_key, link_label, total_clicks, desktop_clicks, mobile_clicks, tablet_clicks }`.

- [ ] **Step 1: Write the hook**

Create `src/hooks/useLinkClickCounts.ts`:
```ts
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface LinkClickRow {
  page_path: string;
  link_kind: 'link' | 'button';
  link_key: string;
  link_label: string | null;
  total_clicks: number;
  desktop_clicks: number;
  mobile_clicks: number;
  tablet_clicks: number;
}

export function useLinkClickCounts(siteId: string | null, days: number = 30) {
  const [rows, setRows] = useState<LinkClickRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async (windowDays: number = days) => {
    if (!siteId) { setRows([]); return; }
    setLoading(true);
    setError(null);
    try {
      const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)
        .toISOString().slice(0, 10);
      const { data, error: qErr } = await supabase
        .from('link_click_counts')
        .select('page_path, link_kind, link_key, link_label, device_type, click_count, day')
        .eq('site_id', siteId)
        .gte('day', since);
      if (qErr) throw qErr;

      const map = new Map<string, LinkClickRow>();
      (data || []).forEach((r: any) => {
        const key = `${r.page_path} ${r.link_kind} ${r.link_key}`;
        let row = map.get(key);
        if (!row) {
          row = {
            page_path: r.page_path, link_kind: r.link_kind, link_key: r.link_key,
            link_label: r.link_label, total_clicks: 0,
            desktop_clicks: 0, mobile_clicks: 0, tablet_clicks: 0,
          };
          map.set(key, row);
        }
        const c = r.click_count || 0;
        row.total_clicks += c;
        if (r.device_type === 'mobile') row.mobile_clicks += c;
        else if (r.device_type === 'tablet') row.tablet_clicks += c;
        else row.desktop_clicks += c;
      });

      setRows(Array.from(map.values()).sort((a, b) => b.total_clicks - a.total_clicks));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load link clicks');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(days); /* eslint-disable-next-line */ }, [siteId, days]);

  return { rows, loading, error, reload };
}
```

- [ ] **Step 2: Write the widget**

Create `src/components/dashboard/LinkClickCounts.tsx`:
```tsx
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Link as LinkIcon, MousePointer } from 'lucide-react';
import { useLinkClickCounts } from '@/hooks/useLinkClickCounts';

interface LinkClickCountsProps {
  siteId: string | null;
}

export function LinkClickCounts({ siteId }: LinkClickCountsProps) {
  const [days, setDays] = useState(30);
  const { rows, loading, error } = useLinkClickCounts(siteId, days);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <LinkIcon className="h-5 w-5" /> Link clicks (aggregate)
          </CardTitle>
          <Select value={days.toString()} onValueChange={(v) => setDays(parseInt(v))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 days</SelectItem>
              <SelectItem value="30">30 days</SelectItem>
              <SelectItem value="90">90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-sm text-muted-foreground">
          Anonymous per-link tallies. Works in cookieless mode without consent.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : error ? (
          <p className="text-sm text-destructive">Error: {error}</p>
        ) : rows.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <MousePointer className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No link clicks recorded for this period yet.</p>
          </div>
        ) : (
          <div className="grid gap-2">
            {rows.slice(0, 20).map((r, i) => (
              <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{r.link_label || r.link_key}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    <Badge variant="outline" className="mr-2 text-[10px]">{r.link_kind}</Badge>
                    {r.link_key} · {r.page_path}
                  </p>
                </div>
                <div className="text-right ml-4">
                  <div className="text-lg font-bold">{r.total_clicks}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.desktop_clicks}d / {r.mobile_clicks}m / {r.tablet_clicks}t
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default LinkClickCounts;
```

- [ ] **Step 3: Render it in the Navigation tab**

In `src/components/dashboard/tabs/NavigationTab.tsx`, import the widget and render it directly below `<NavigationAnalytics ... />`. Add the import near the other imports:
```tsx
import { LinkClickCounts } from '@/components/dashboard/LinkClickCounts';
```
And place `<LinkClickCounts siteId={/* the same siteId passed to NavigationAnalytics */} />` immediately after the `<NavigationAnalytics ... />` element (match the exact `siteId` prop expression already used in that file — open it first to confirm whether it is `selectedSite?.id` or a `siteId` variable).

- [ ] **Step 4: Type check and build**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 0 errors.
Run: `npm run build:client`
Expected: build succeeds.

- [ ] **Step 5: Manual data check**

Load the dashboard, open the Navigation tab for a site that has rows in `link_click_counts`, and confirm the "Link clicks (aggregate)" widget lists links sorted by total clicks with the desktop/mobile/tablet split, and that the days selector re-queries.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useLinkClickCounts.ts src/components/dashboard/LinkClickCounts.tsx src/components/dashboard/tabs/NavigationTab.tsx
git commit -m "feat(dashboard): aggregate link-click widget in Navigation tab"
```

---

## Self-Review

**Spec coverage:**
- Data model (§1) → Task 1 (table, unique index, RLS, no session/visitor/coords). ✓
- Tracking script `setupAggregateLinkCounter` gated on analytics consent (§2) → Task 3 (added to `startAnalytics`, not interaction-consent gated). ✓
- Edge function `link-click-counter`, verify_jwt=false, service role, sanitise + upsert-increment (§3) → Task 2. ✓
- Dashboard widget + hook in Navigation/Heatmap area (§4) → Task 4. ✓
- Phasing: Phase A only; Phase B (pixel-tracking fix + per-event detail) explicitly excluded. ✓
- Query/hash strip client + server; truncation; kind/device clamps (Global Constraints) → Task 2 sanitiser + Task 3 client. ✓

**Placeholder scan:** Task 4 Step 3 asks the implementer to match the existing `siteId` prop expression in `NavigationTab.tsx` — this is a real instruction (confirm one of two named forms), not a placeholder. No TBD/TODO/"handle edge cases" left.

**Type consistency:** `sanitize`/`CleanPayload` names match between `sanitize.ts`, its test, and `index.ts`. `increment_link_click` parameter list matches between the RPC definition (Task 2 Step 6) and the `supabase.rpc(...)` call (Task 2 Step 5). `LinkClickRow` shape matches between hook and widget. Device buckets (`desktop/mobile/tablet`) consistent across sanitiser, RPC check constraint, hook, and widget.

**Note on RPC:** The atomic increment is done via `increment_link_click` (a SECURITY DEFINER SQL function) rather than a client-side read-modify-write, so concurrent clicks cannot lose counts. It lives in the Task 1 migration file but is introduced in Task 2 because that is where its caller is written; apply the migration again after appending it (Task 2 Step 6).

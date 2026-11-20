# Phase 2 — Signed Edge Geo via Cloudflare Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every ingest request gets a trustworthy IP country (and US/CA region) from Cloudflare, signed so a client cannot forge it, with the browser time zone as the fallback and no new raw IP storage.

**Architecture:** A Cloudflare Worker on the free plan (`workers/geo-edge/`) sits in front of the public ingest Edge Functions. It removes any incoming `x-cortiq-geo` header, signs `{country, region, ip, ts}` with HMAC-SHA256 (`GEO_SIGNING_KEY`) and proxies to Supabase. Edge Functions call `resolveGeo()` (`_shared/geo.ts`), which accepts only a valid token no older than 60 s and otherwise falls back to the time zone. The tracker, banner and beacon send through the Worker by default and switch to direct Supabase for the rest of the page load when the Worker fails.

**Tech Stack:** Cloudflare Workers (wrangler, ES modules), Web Crypto HMAC, Deno Edge Functions, PostgreSQL migrations, vanilla JS tracker/banner/beacon, PHP WP plugin, `node --test` + PGlite.

**Spec:** `docs/superpowers/specs/2026-11-18-jurisdiction-aware-measurement-design.md` → "Phase 2 — Geo foundation" (AC1–AC5) and the decision "Cloudflare Worker for geo (free plan)".

## Global Constraints

- **Release gate:** Cloudflare becomes a direct CortIQ subprocessor. No dist FTP, WP plugin release or tracker default that routes visitors through the Worker before Task 7's jurist review and the updated DPA and privacy policy have reached `approved_internal` (Daniel's approval). Code can merge before that, and so can the Worker deploy, which is idle until a client calls it.
- No new raw IP storage (spec AC5). The signed token carries the client IP **in transit only**. Functions use it where they use the client IP today (rate-limit keys, daily-salted aggregate hash, `anonymizeIP`) and never store it raw.
- Region only for `US` and `CA` (spec AC3). The Worker drops region for every other country.
- An unsigned, tampered, expired (>60 s, or >5 s in the future) or wrongly keyed token → treated as absent: `source` `timezone` or `unknown`, never `ip` (spec AC2).
- `geo_source` values: `ip` | `timezone` | `unknown` (same CHECK as phase 1's `cookie_consents.geo_source`).
- Depends on phase 1: `cookie_consents.geo_source` (phase 1 Task 5, migration `20261202000003`), `_shared/consent-geo.ts` and shared version 5.5.15. Execute phase 2 Task 4 and later tasks only after phase 1 Tasks 5–7 are merged. Tasks 1–3 can run in parallel with phase 1.
- Migration timestamps: `20261203000001`–`20261203000099`.
- Shared version bump **5.5.15 → 5.5.16** in Task 5, in five places: `public/spa-tracking.js:4,:20`, `src/lib/plugin-version.ts:6`, `wordpress-plugin/cortiq-analytics.php:6,:24`, `wordpress-plugin/readme.txt` (Stable tag + changelog), then `node scripts/build-plugin.mjs` and `npm run build` (pins `public/v/5.5.16/`).
- CSP on cortiq.se: a new `fetch` target needs a `connect-src` entry (`public/.htaccess:25`).
- Copy rules (CLAUDE.md) apply to the privacy and DPA text: no "no consent needed" and no "GDPR-compliant without consent". Legal text goes through the `jurist` agent.
- Free plan: 100,000 Worker requests/day across all sites. Running out of quota is a fallback case, not an outage (Task 5). Task 7 sets up volume monitoring.

## Review Focus

1. **Signing key rotated on one side only.** Every token fails verification. Ingest must keep working, with geo falling back to the time zone, and the run must be visible in `geo_source` counts. Pinned in Task 1 (`wrong key`) and in the Task 7 runbook order (Supabase first, then the Worker).
2. **A request that arrives through the Worker without a valid token.** Without the signed IP, `clientIp()` returns the Worker's egress IP, so every visitor shares one rate-limit key and one aggregate hash. Functions must not fall back to `x-forwarded-for` when a token header is present but invalid. Pinned in Task 1 (`invalid token present → ip null`) and Task 4 (ai-bot-tracker rate-limit key uses `geo.ip ?? 'unknown'`).
3. **The Worker is over quota, blocked by an ad blocker or the site's CSP, or Cloudflare returns its own error page without CORS.** The browser `fetch` rejects. The tracker resends that one request directly and stays direct for the page load, with no lost page view. Pinned in Task 5 (`reject → direct`, `proxy error header → direct`, `function 500 → no retry`).
4. **A client sends its own `x-cortiq-geo` header through the Worker,** for example copied from an earlier request. The Worker drops it and signs a fresh one. Directly to Supabase, a replayed token expires after 60 s. Pinned in Task 2 (`client header stripped`) and Task 1 (`expired`).
5. **Region for a non-US/CA country,** such as Brazil (BR/SP), is never signed or stored. Pinned in Task 2 (`region only US/CA`) and Task 3 (CHECK constraint).

---

## File structure

| File | Responsibility | Task |
|---|---|---|
| `supabase/functions/_shared/geo-token.js` | `signGeo` / `verifyGeo` (shared by the Worker and the functions) | 1 |
| `supabase/functions/_shared/geo.ts` | `resolveGeo(req, opts)` | 1 |
| `tests/foundation/geo-token.test.mjs` | Task 1 tests | 1 |
| `workers/geo-edge/wrangler.toml`, `workers/geo-edge/src/index.js`, `workers/geo-edge/ENDPOINT` | the Worker | 2 |
| `tests/foundation/geo-edge-worker.test.mjs` | Task 2 tests | 2 |
| `supabase/migrations/20261203000001_geo_columns.sql` | region + geo_source columns, `ingest_pageview` p_region/p_geo_source | 3 |
| `supabase/migrations/20261203000002_aggregate_countries.sql` | `aggregate_countries_daily`, `ingest_aggregate_country`, retention | 3 |
| `tests/foundation/geo-columns.test.mjs` | Task 3 tests | 3 |
| ingest functions (list in Task 4), `_shared/bot-detection.ts`, `_shared/consent-geo.ts` | use `resolveGeo` | 4 |
| `tests/foundation/geo-wiring.test.mjs`, `tests/foundation/geo-breakdown.test.mjs` | Task 4 tests | 4 |
| `public/spa-tracking.js`, `public/consent-banner.js`, `src/lib/aggregate-beacon.js`, `wordpress-plugin/cortiq-analytics.php`, `public/.htaccess` + version files | Worker endpoint with direct fallback | 5 |
| `tests/foundation/geo-endpoint-fallback.test.mjs` | Task 5 tests | 5 |
| `public/cloudflare-worker.js`, `supabase/functions/server-hit/index.ts` | country from the customer's CF adapter | 6 |
| `tests/foundation/server-hit.test.mjs` | Task 6 tests | 6 |
| `docs/runbooks/geo-edge-worker.md` | runbook, verification SQL, legal step | 7 |

---

### Task 1: Geo token and `resolveGeo` (AC1, AC2)

**Files:**
- Create: `supabase/functions/_shared/geo-token.js`
- Create: `supabase/functions/_shared/geo.ts` (a file, next to the unrelated `_shared/geo/` folder, which holds GEO citability code; do not touch that folder)
- Create: `tests/foundation/geo-token.test.mjs`

**Interfaces:**
- Consumes: `countryFromTimeZone` (`_shared/tz-country.js`), `clientIp(headers)` (`_shared/aggregate.js:88`).
- Produces:
  - `signGeo(claims: { country: string|null; region: string|null; ip: string|null }, secret: string, nowSec: number): Promise<string|null>` returns `v1.<b64url(JSON {c,r,ip,ts})>.<b64url(HMAC-SHA256(secret, "v1.<payload>"))>`, or `null` when the secret is shorter than 32 characters.
  - `verifyGeo(token: string, secret: string, nowSec: number): Promise<{ c: string|null; r: string|null; ip: string|null; ts: number } | null>`. It returns `null` for a bad format, a bad signature, `ts < now-60`, `ts > now+5`, a short secret or a token longer than 1024 characters. It normalizes `c` (alpha-2, not XX/T1, else null), `r` (only when `c` ∈ {US, CA} and `/^[A-Z0-9]{1,3}$/`, else null) and `ip` (≤45 characters of `[0-9a-fA-F.:]`, else null).
  - `GEO_HEADER = 'x-cortiq-geo'`.
  - `resolveGeo(req: Request, opts: { key?: string|null; timeZone?: unknown; now?: number }): Promise<{ country: string|null; region: string|null; source: 'ip'|'timezone'|'unknown'; ip: string|null }>`.
    - Valid token with a country → `source:'ip'` and the token's `ip`.
    - Valid token without a country → time zone fallback, keeping the token's `ip`.
    - Header present but invalid → time zone fallback with `ip: null`, because the request came through a proxy and the header IP is the proxy's.
    - No header → time zone fallback with `ip = clientIp(req.headers) || null`.

- [ ] **Step 1: Write the failing test**

```js
// tests/foundation/geo-token.test.mjs
// Spec 2026-11-18 phase 2 AC1/AC2: geo comes from a token signed by the CortIQ Worker; anything
// unsigned, tampered, stale or signed with another key is ignored.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signGeo, verifyGeo, GEO_HEADER } from '../../supabase/functions/_shared/geo-token.js';
import { resolveGeo } from '../../supabase/functions/_shared/geo.ts';

const KEY = 'k'.repeat(32);
const NOW = 1_800_000_000;
const req = (headers = {}) => new Request('https://fn.test/x', { method: 'POST', headers });

test('sign → verify round trip', async () => {
  const t = await signGeo({ country: 'US', region: 'CA', ip: '203.0.113.9' }, KEY, NOW);
  assert.match(t, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.deepEqual(await verifyGeo(t, KEY, NOW + 10), { c: 'US', r: 'CA', ip: '203.0.113.9', ts: NOW });
});

test('wrong key, tampered payload, short key → null', async () => {
  const t = await signGeo({ country: 'SE', region: null, ip: '198.51.100.1' }, KEY, NOW);
  assert.equal(await verifyGeo(t, 'x'.repeat(32), NOW), null);
  const [v, , sig] = t.split('.');
  const forged = Buffer.from(JSON.stringify({ c: 'US', r: null, ip: '198.51.100.1', ts: NOW })).toString('base64url');
  assert.equal(await verifyGeo(`${v}.${forged}.${sig}`, KEY, NOW), null);
  assert.equal(await signGeo({ country: 'SE', region: null, ip: null }, 'short', NOW), null);
  assert.equal(await verifyGeo(t, 'short', NOW), null);
  assert.equal(await verifyGeo('garbage', KEY, NOW), null);
  assert.equal(await verifyGeo('v1.' + 'a'.repeat(2000) + '.b', KEY, NOW), null);
});

test('expired (>60 s) or from the future (>5 s) → null', async () => {
  const t = await signGeo({ country: 'SE', region: null, ip: null }, KEY, NOW);
  assert.ok(await verifyGeo(t, KEY, NOW + 60));
  assert.equal(await verifyGeo(t, KEY, NOW + 61), null);
  assert.equal(await verifyGeo(t, KEY, NOW - 6), null);
});

test('normalization: XX/T1 → no country, region only for US/CA, junk ip dropped', async () => {
  const v = async (claims) => verifyGeo(await signGeo(claims, KEY, NOW), KEY, NOW);
  assert.equal((await v({ country: 'XX', region: null, ip: null })).c, null);
  assert.equal((await v({ country: 'T1', region: null, ip: null })).c, null);
  assert.equal((await v({ country: 'BR', region: 'SP', ip: null })).r, null);
  assert.equal((await v({ country: 'CA', region: 'QC', ip: null })).r, 'QC');
  assert.equal((await v({ country: 'SE', region: null, ip: '<script>' })).ip, null);
});

test('resolveGeo: valid token → ip source, token ip', async () => {
  const t = await signGeo({ country: 'CA', region: 'QC', ip: '2001:db8::1' }, KEY, NOW);
  const g = await resolveGeo(req({ [GEO_HEADER]: t, 'x-forwarded-for': '10.0.0.1' }), { key: KEY, timeZone: 'Europe/Stockholm', now: NOW * 1000 });
  assert.deepEqual(g, { country: 'CA', region: 'QC', source: 'ip', ip: '2001:db8::1' });
});

test('resolveGeo: invalid token present → time zone, ip null (never the proxy ip)', async () => {
  const g = await resolveGeo(req({ [GEO_HEADER]: 'v1.bad.sig', 'x-forwarded-for': '172.70.1.1' }), { key: KEY, timeZone: 'Europe/Berlin', now: NOW * 1000 });
  assert.deepEqual(g, { country: 'DE', region: null, source: 'timezone', ip: null });
});

test('resolveGeo: no header → time zone or unknown, ip from forwarding headers', async () => {
  assert.deepEqual(await resolveGeo(req({ 'x-forwarded-for': '198.51.100.7, 10.0.0.1' }), { key: KEY, timeZone: 'America/Sao_Paulo' }),
    { country: 'BR', region: null, source: 'timezone', ip: '198.51.100.7' });
  assert.deepEqual(await resolveGeo(req(), { key: null, timeZone: 'Mars/Base' }),
    { country: null, region: null, source: 'unknown', ip: null });
});

test('resolveGeo: no key configured → token ignored', async () => {
  const t = await signGeo({ country: 'US', region: 'NY', ip: '203.0.113.1' }, KEY, NOW);
  const g = await resolveGeo(req({ [GEO_HEADER]: t }), { key: undefined, timeZone: undefined, now: NOW * 1000 });
  assert.equal(g.source, 'unknown');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/foundation/geo-token.test.mjs`
Expected: FAIL. Module not found.

- [ ] **Step 3: Write `supabase/functions/_shared/geo-token.js`**

```js
// Signed edge geo (spec 2026-11-18 phase 2). The CortIQ Worker (workers/geo-edge) signs the
// visitor's Cloudflare country, US/CA region and IP; Edge Functions verify it. Plain JS so the
// Worker bundle, Deno and Node tests share one implementation.
// Format: v1.<base64url(JSON {c, r, ip, ts})>.<base64url(HMAC-SHA256(key, "v1.<payload>"))>
export const GEO_HEADER = 'x-cortiq-geo';
const MAX_AGE_SEC = 60;
const MAX_SKEW_SEC = 5;
const MIN_KEY = 32;
const REGION_COUNTRIES = new Set(['US', 'CA']);
const enc = new TextEncoder();

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (ch) => ch.charCodeAt(0));

function hmacKey(secret, usage) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

function normalize(claims) {
  const c = typeof claims.c === 'string' && /^[A-Z]{2}$/.test(claims.c) && claims.c !== 'XX' && claims.c !== 'T1' ? claims.c : null;
  const r = c && REGION_COUNTRIES.has(c) && typeof claims.r === 'string' && /^[A-Z0-9]{1,3}$/.test(claims.r) ? claims.r : null;
  const ip = typeof claims.ip === 'string' && claims.ip.length <= 45 && /^[0-9a-fA-F.:]+$/.test(claims.ip) ? claims.ip : null;
  return { c, r, ip };
}

export async function signGeo({ country, region, ip }, secret, nowSec) {
  if (typeof secret !== 'string' || secret.length < MIN_KEY) return null;
  const claims = normalize({ c: country ? String(country).toUpperCase() : null, r: region ? String(region).toUpperCase() : null, ip });
  const payload = b64url(enc.encode(JSON.stringify({ ...claims, ts: Math.floor(nowSec) })));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret, 'sign'), enc.encode(`v1.${payload}`));
  return `v1.${payload}.${b64url(new Uint8Array(sig))}`;
}

export async function verifyGeo(token, secret, nowSec) {
  try {
    if (typeof secret !== 'string' || secret.length < MIN_KEY) return null;
    if (typeof token !== 'string' || token.length > 1024) return null;
    const m = /^v1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(token);
    if (!m) return null;
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret, 'verify'), fromB64url(m[2]), enc.encode(`v1.${m[1]}`));
    if (!ok) return null;
    const claims = JSON.parse(new TextDecoder().decode(fromB64url(m[1])));
    const ts = Number(claims?.ts);
    if (!Number.isFinite(ts) || ts < nowSec - MAX_AGE_SEC || ts > nowSec + MAX_SKEW_SEC) return null;
    return { ...normalize(claims), ts };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Write `supabase/functions/_shared/geo.ts`**

```ts
// One place that decides a request's country (spec 2026-11-18 phase 2 AC1). Ingest functions call
// resolveGeo instead of reading cf-ipcountry / x-forwarded-for themselves. The key is passed in
// (Deno.env.get('GEO_SIGNING_KEY') at the call site) so Node tests can import this file.
import { GEO_HEADER, verifyGeo } from './geo-token.js';
import { countryFromTimeZone } from './tz-country.js';
import { clientIp } from './aggregate.js';

export type GeoSource = 'ip' | 'timezone' | 'unknown';
export type Geo = { country: string | null; region: string | null; source: GeoSource; ip: string | null };

export async function resolveGeo(
  req: Request,
  opts: { key?: string | null; timeZone?: unknown; now?: number },
): Promise<Geo> {
  const header = req.headers.get(GEO_HEADER);
  const token = header && opts.key ? await verifyGeo(header, opts.key, Math.floor((opts.now ?? Date.now()) / 1000)) : null;
  if (token?.c) return { country: token.c, region: token.r, source: 'ip', ip: token.ip };
  const tz = countryFromTimeZone(typeof opts.timeZone === 'string' ? opts.timeZone.slice(0, 64) : null);
  // A request that carried a geo header came through a proxy: its forwarding headers name the
  // proxy, not the visitor, so they are no use as a rate-limit key or hash input.
  const ip = token ? token.ip : header ? null : (clientIp(req.headers) || null);
  return { country: tz, region: null, source: tz ? 'timezone' : 'unknown', ip };
}

export const geoKey = (): string | null => Deno.env.get('GEO_SIGNING_KEY') ?? null;
```

`geoKey` reads `Deno.env` only when called, so importing the module in Node is safe.

- [ ] **Step 5: Run tests**

Run: `node --test tests/foundation/geo-token.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/geo-token.js supabase/functions/_shared/geo.ts tests/foundation/geo-token.test.mjs
git commit -m "feat(geo): signed edge geo token and resolveGeo"
```

---

### Task 2: The `geo-edge` Worker (AC1–AC3)

**Files:**
- Create: `workers/geo-edge/wrangler.toml`, `workers/geo-edge/src/index.js`
- Create: `tests/foundation/geo-edge-worker.test.mjs`
- Create (after deploy): `workers/geo-edge/ENDPOINT`
- Modify: `.gitignore` only if `workers/` is not tracked (check with `git check-ignore -v workers/geo-edge/src/index.js`; the AI-Hub allowlist rule applies to the parent repo, not CortIQ, but verify).

**Interfaces:**
- Consumes: `signGeo`, `GEO_HEADER` (Task 1).
- Produces: `https://<worker host>/<function>[/<rest>]` proxies to `${SUPABASE_URL}/functions/v1/<function>[/<rest>]` for the allowlisted functions only. The Worker's own failures return `502` with `access-control-allow-origin: *`, `access-control-expose-headers: x-cortiq-geo-proxy` and `x-cortiq-geo-proxy: error`, which Task 5 relies on. `ALLOWED_FUNCTIONS` is exported. `workers/geo-edge/ENDPOINT` holds the deployed origin with no trailing slash and no newline; Task 5 reads it.

- [ ] **Step 1: Write the failing test**

```js
// tests/foundation/geo-edge-worker.test.mjs
// Spec 2026-11-18 phase 2: the Worker signs Cloudflare geo for allowlisted ingest functions only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { ALLOWED_FUNCTIONS } from '../../workers/geo-edge/src/index.js';
import { verifyGeo, GEO_HEADER } from '../../supabase/functions/_shared/geo-token.js';

const env = { SUPABASE_URL: 'https://proj.supabase.co', GEO_SIGNING_KEY: 'k'.repeat(32) };

function call(path, { cf = { country: 'US', regionCode: 'CA' }, headers = {}, method = 'POST', upstream } = {}) {
  const seen = [];
  globalThis.fetch = async (r) => {
    seen.push(r);
    if (upstream) return upstream(r);
    return new Response('{"ok":true}', { status: 200, headers: { 'access-control-allow-origin': '*' } });
  };
  const req = new Request(`https://geo.test${path}`, {
    method, headers: { 'cf-connecting-ip': '203.0.113.5', 'content-type': 'application/json', ...headers },
    body: method === 'POST' ? '{"a":1}' : undefined,
  });
  Object.defineProperty(req, 'cf', { value: cf });
  return worker.fetch(req, env).then((res) => ({ res, seen }));
}

test('allowlist covers browser ingest, not server-to-server or dashboard functions', () => {
  for (const fn of ['track-event', 'visitor-identification', 'record-conversion', 'link-click-counter', 'ecommerce-tracking',
                    'ai-search-tracker', 'ai-bot-tracker', 'canary-tracker', 'store-consent', 'aggregate-hit', 'geo-check']) {
    assert.ok(ALLOWED_FUNCTIONS.has(fn), fn);
  }
  for (const fn of ['server-hit', 'cloudflare-ingest', 'public-api', 'mcp-server', 'csp-report']) assert.ok(!ALLOWED_FUNCTIONS.has(fn), fn);
});

test('proxies to the function with a fresh signed token, body and query kept', async () => {
  const { res, seen } = await call('/track-event?x=1');
  assert.equal(res.status, 200);
  assert.equal(seen[0].url, 'https://proj.supabase.co/functions/v1/track-event?x=1');
  assert.equal(await seen[0].text(), '{"a":1}');
  const claims = await verifyGeo(seen[0].headers.get(GEO_HEADER), env.GEO_SIGNING_KEY, Math.floor(Date.now() / 1000));
  assert.deepEqual([claims.c, claims.r, claims.ip], ['US', 'CA', '203.0.113.5']);
});

test('client header stripped: a forged token never reaches Supabase', async () => {
  const { seen } = await call('/store-consent', { headers: { [GEO_HEADER]: 'v1.forged.sig' } });
  assert.notEqual(seen[0].headers.get(GEO_HEADER), 'v1.forged.sig');
  assert.ok(await verifyGeo(seen[0].headers.get(GEO_HEADER), env.GEO_SIGNING_KEY, Math.floor(Date.now() / 1000)));
});

test('region only US/CA', async () => {
  const { seen } = await call('/aggregate-hit', { cf: { country: 'BR', regionCode: 'SP' } });
  const claims = await verifyGeo(seen[0].headers.get(GEO_HEADER), env.GEO_SIGNING_KEY, Math.floor(Date.now() / 1000));
  assert.deepEqual([claims.c, claims.r], ['BR', null]);
});

test('sub-paths (canary-tracker/<type>) and OPTIONS preflight pass through', async () => {
  const { seen } = await call('/canary-tracker/pixel', { method: 'GET' });
  assert.equal(seen[0].url, 'https://proj.supabase.co/functions/v1/canary-tracker/pixel');
  const pre = await call('/track-event', { method: 'OPTIONS' });
  assert.equal(pre.seen[0].method, 'OPTIONS');
});

test('unknown function → 404, nothing fetched', async () => {
  const { res, seen } = await call('/server-hit');
  assert.equal(res.status, 404);
  assert.equal(seen.length, 0);
});

test('upstream unreachable → 502 with the proxy-error header the tracker reads', async () => {
  const { res } = await call('/track-event', { upstream: () => { throw new TypeError('network'); } });
  assert.equal(res.status, 502);
  assert.equal(res.headers.get('x-cortiq-geo-proxy'), 'error');
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  assert.match(res.headers.get('access-control-expose-headers'), /x-cortiq-geo-proxy/);
});

test('missing signing key → proxied without a token (functions fall back to time zone)', async () => {
  globalThis.fetch = async (r) => new Response('ok', { status: 200, headers: { seen: r.headers.has(GEO_HEADER) ? '1' : '0' } });
  const req = new Request('https://geo.test/track-event', { method: 'POST', body: '{}' });
  Object.defineProperty(req, 'cf', { value: { country: 'SE' } });
  const res = await worker.fetch(req, { SUPABASE_URL: env.SUPABASE_URL });
  assert.equal(res.headers.get('seen'), '0');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/foundation/geo-edge-worker.test.mjs`
Expected: FAIL. Module not found.

- [ ] **Step 3: Write `workers/geo-edge/src/index.js`**

```js
// CortIQ geo edge (spec 2026-11-18 phase 2). Sits in front of the public ingest Edge Functions,
// signs the visitor's Cloudflare country (+ US/CA region) and IP, and proxies the request.
// Supabase Edge does not forward CF-IPCountry and sees this Worker's IP, so the signed header is
// the only way geo and the client IP reach the functions. The IP is never stored raw there.
import { GEO_HEADER, signGeo } from '../../../supabase/functions/_shared/geo-token.js';

export const ALLOWED_FUNCTIONS = new Set([
  'track-event', 'visitor-identification', 'record-conversion', 'link-click-counter', 'ecommerce-tracking',
  'ai-search-tracker', 'ai-bot-tracker', 'canary-tracker', 'store-consent', 'aggregate-hit', 'geo-check',
]);

const proxyError = () => new Response('Upstream unavailable', {
  status: 502,
  headers: {
    'access-control-allow-origin': '*',
    'access-control-expose-headers': 'x-cortiq-geo-proxy',
    'x-cortiq-geo-proxy': 'error',
    'cache-control': 'no-store',
  },
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/+/, '');
    const fn = path.split('/')[0];
    if (!ALLOWED_FUNCTIONS.has(fn) || path.includes('..')) return new Response('Not found', { status: 404 });

    const headers = new Headers(request.headers);
    headers.delete(GEO_HEADER);
    const cf = request.cf || {};
    const token = await signGeo(
      { country: cf.country ?? null, region: cf.regionCode ?? null, ip: request.headers.get('cf-connecting-ip') },
      env.GEO_SIGNING_KEY, Math.floor(Date.now() / 1000));
    if (token) headers.set(GEO_HEADER, token);

    const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
    try {
      return await fetch(new Request(`${env.SUPABASE_URL}/functions/v1/${path}${url.search}`, {
        method: request.method, headers, body: hasBody ? request.body : undefined, redirect: 'manual',
        ...(hasBody ? { duplex: 'half' } : {}),
      }));
    } catch {
      return proxyError();
    }
  },
};
```

- [ ] **Step 4: Write `workers/geo-edge/wrangler.toml`**

```toml
# CortIQ geo edge — see docs/runbooks/geo-edge-worker.md
name = "cortiq-geo"
account_id = "965167b0273f7357cf036e3fffcd825a"
main = "src/index.js"
compatibility_date = "2026-11-01"
workers_dev = true

[vars]
SUPABASE_URL = "https://cxmkdtgfocgbfizawlwa.supabase.co"

# GEO_SIGNING_KEY is a secret: npx wrangler secret put GEO_SIGNING_KEY
```

- [ ] **Step 5: Run tests**

Run: `node --test tests/foundation/geo-edge-worker.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add workers/geo-edge tests/foundation/geo-edge-worker.test.mjs
git commit -m "feat(geo): cortiq-geo Worker signs Cloudflare geo for ingest functions"
```

- [ ] **Step 7: Deploy (Daniel, interactive) and record the endpoint**

Follow `docs/runbooks/geo-edge-worker.md` sections 1–3 (written in Task 7; if Task 7 is not done yet, the steps are: `npx wrangler login`, then set the key on Supabase first with `supabase secrets set GEO_SIGNING_KEY=<value>`, then `cd workers/geo-edge && npx wrangler secret put GEO_SIGNING_KEY` and `npx wrangler deploy`). Write the origin `wrangler deploy` prints into `workers/geo-edge/ENDPOINT` with no trailing slash and no newline. For example: `printf '%s' 'https://cortiq-geo.<account>.workers.dev' > workers/geo-edge/ENDPOINT`, with the real account subdomain from the deploy output.

```bash
git add workers/geo-edge/ENDPOINT
git commit -m "chore(geo): record deployed geo Worker endpoint"
```

---

### Task 3: Geo columns, `ingest_pageview` region/source, country aggregate (AC4)

**Files:**
- Create: `supabase/migrations/20261203000001_geo_columns.sql`
- Create: `supabase/migrations/20261203000002_aggregate_countries.sql`
- Create: `tests/foundation/geo-columns.test.mjs`

**Interfaces:**
- Consumes: `ingest_pageview` (8 args) from `20261124000001_session_browser_os.sql`; `cookie_consents.geo_source` from phase 1 `20261202000003`.
- Produces:
  - `tracking_sessions.region_code text` with CHECK `^[A-Z0-9]{1,3}$`, and `tracking_sessions.geo_source text` with CHECK ∈ (ip, timezone, unknown).
  - `cookie_consents.geo_region text` with the same pattern.
  - `ai_bot_traffic.country_code text` (`^[A-Z]{2}$`) and `ai_bot_traffic.region_code text`.
  - `public.ingest_pageview(p_url, p_session, p_device, p_referrer, p_viewed_at, p_country, p_browser, p_os, p_region text DEFAULT NULL, p_geo_source text DEFAULT NULL)`. Region is kept only when the country is US or CA. `geo_source` and region are set on the first page view, the same as country.
  - The table `public.aggregate_countries_daily(site_id, day, country, pageviews, PK(site_id, day, country))`. Country `''` means unknown.
  - `public.ingest_aggregate_country(p_site_id uuid, p_country text, p_now timestamptz DEFAULT now()) RETURNS void`, service_role only.
  - `public.aggregate_countries_retention() RETURNS integer`, which deletes rows older than the site's oldest remaining `aggregate_pages_daily` day. It runs on a daily cron.

- [ ] **Step 1: Write the failing test**

```js
// tests/foundation/geo-columns.test.mjs
// Spec 2026-11-18 phase 2 AC4: geo lands on sessions, consents, AI bot rows and (country only) aggregates.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const SITE = '11111111-1111-4111-8111-111111111111';

async function db() {
  const pg = new PGlite();
  await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE public.sites (id uuid PRIMARY KEY, user_id uuid, domain text, session_timeout_minutes int);
    CREATE TABLE public.tracking_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id uuid, session_id text,
      device_type text, browser text, os text, referrer text, started_at timestamptz, last_activity timestamptz,
      page_views int, duration_seconds int, country_code text,
      utm_source text, utm_medium text, utm_campaign text, utm_term text, utm_content text);
    CREATE TABLE public.page_views (site_id uuid, session_id uuid, url text, viewed_at timestamptz, referrer text);
    CREATE TABLE public.cookie_consents (id uuid DEFAULT gen_random_uuid(), geo_country text, geo_source text);
    CREATE TABLE public.ai_bot_traffic (id uuid DEFAULT gen_random_uuid(), site_id uuid);
    CREATE TABLE public.aggregate_pages_daily (site_id uuid, day date, path text, pageviews int);
    CREATE FUNCTION public._norm_host(u text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
      SELECT regexp_replace(split_part(split_part(regexp_replace(lower(coalesce(u, '')), '^https?://', ''), '/', 1), ':', 1), '^www\\.', '') $$;
    CREATE FUNCTION public._url_param(u text, k text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT NULL::text $$;
    INSERT INTO sites VALUES ('${SITE}', '${SITE}', 'site.se', 30);`);
  await pg.exec(read('../../supabase/migrations/20261124000001_session_browser_os.sql'));
  await pg.exec(read('../../supabase/migrations/20261203000001_geo_columns.sql'));
  await pg.exec(read('../../supabase/migrations/20261203000002_aggregate_countries.sql'));
  return pg;
}

test('PostgreSQL: ingest_pageview stores region (US/CA only) and geo_source from the first view', async () => {
  const pg = await db();
  try {
    const view = (s, at, c, r, src) => pg.query(
      `SELECT public.ingest_pageview('https://site.se/', $1, 'desktop', NULL, $2::timestamptz, $3, NULL, NULL, $4, $5)`, [s, at, c, r, src]);
    await view('a', '2026-12-01 10:00Z', 'US', 'CA', 'ip');
    await view('a', '2026-12-01 10:01Z', 'SE', NULL, 'timezone');
    await view('b', '2026-12-01 10:00Z', 'BR', 'SP', 'ip');
    await view('c', '2026-12-01 10:00Z', null, null, 'bogus');
    const rows = (await pg.query(`SELECT session_id, country_code, region_code, geo_source FROM tracking_sessions ORDER BY session_id`)).rows;
    assert.deepEqual(rows, [
      { session_id: 'a', country_code: 'US', region_code: 'CA', geo_source: 'ip' },
      { session_id: 'b', country_code: 'BR', region_code: null, geo_source: 'ip' },
      { session_id: 'c', country_code: null, region_code: null, geo_source: 'unknown' },
    ]);
  } finally { await pg.close(); }
});

test('PostgreSQL: CHECK constraints refuse bad geo values', async () => {
  const pg = await db();
  try {
    await assert.rejects(pg.query(`INSERT INTO tracking_sessions (site_id, region_code) VALUES ($1, 'california')`, [SITE]));
    await assert.rejects(pg.query(`INSERT INTO tracking_sessions (site_id, geo_source) VALUES ($1, 'gps')`, [SITE]));
    await assert.rejects(pg.query(`INSERT INTO ai_bot_traffic (site_id, country_code) VALUES ($1, 'usa')`, [SITE]));
    await pg.query(`INSERT INTO ai_bot_traffic (site_id, country_code, region_code) VALUES ($1, 'US', 'NY')`, [SITE]);
    await pg.query(`INSERT INTO cookie_consents (geo_country, geo_source, geo_region) VALUES ('CA', 'ip', 'QC')`);
  } finally { await pg.close(); }
});

test('PostgreSQL: country aggregate counts per day, unknown as empty string, retention follows pages', async () => {
  const pg = await db();
  try {
    for (const c of ['SE', 'SE', 'us', null, 'XX']) {
      await pg.query(`SELECT public.ingest_aggregate_country($1, $2, '2026-12-01 10:00Z')`, [SITE, c]);
    }
    const rows = (await pg.query(`SELECT country, pageviews FROM aggregate_countries_daily ORDER BY country`)).rows;
    assert.deepEqual(rows, [{ country: '', pageviews: 2 }, { country: 'SE', pageviews: 2 }, { country: 'US', pageviews: 1 }]);
    await pg.query(`SELECT public.ingest_aggregate_country($1, 'SE', '2026-11-01 10:00Z')`, [SITE]);
    await pg.query(`INSERT INTO aggregate_pages_daily VALUES ($1, '2026-12-01', '/', 1)`, [SITE]);
    assert.equal((await pg.query(`SELECT public.aggregate_countries_retention() AS n`)).rows[0].n, 1);
    assert.equal((await pg.query(`SELECT count(*)::int n FROM aggregate_countries_daily WHERE day = '2026-11-01'`)).rows[0].n, 0);
    const g = (await pg.query(`SELECT has_function_privilege('anon', 'public.ingest_aggregate_country(uuid,text,timestamptz)', 'EXECUTE') a`)).rows[0].a;
    assert.equal(g, false);
  } finally { await pg.close(); }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/foundation/geo-columns.test.mjs`
Expected: FAIL. Missing migration.

- [ ] **Step 3: Write `20261203000001_geo_columns.sql`**

```sql
-- supabase/migrations/20261203000001_geo_columns.sql
-- Spec 2026-11-18 phase 2 AC4: signed edge geo (source 'ip') and the time zone fallback land on
-- sessions, consents and AI bot rows. Region is kept for US and CA only (state/province rules).
-- No IP is stored. ingest_pageview: same body as 20261124000001 plus p_region/p_geo_source.

ALTER TABLE public.tracking_sessions
  ADD COLUMN IF NOT EXISTS region_code text CHECK (region_code IS NULL OR region_code ~ '^[A-Z0-9]{1,3}$'),
  ADD COLUMN IF NOT EXISTS geo_source  text CHECK (geo_source IS NULL OR geo_source IN ('ip', 'timezone', 'unknown'));

ALTER TABLE public.cookie_consents
  ADD COLUMN IF NOT EXISTS geo_region text CHECK (geo_region IS NULL OR geo_region ~ '^[A-Z0-9]{1,3}$');

ALTER TABLE public.ai_bot_traffic
  ADD COLUMN IF NOT EXISTS country_code text CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
  ADD COLUMN IF NOT EXISTS region_code  text CHECK (region_code IS NULL OR region_code ~ '^[A-Z0-9]{1,3}$');

DROP FUNCTION IF EXISTS public.ingest_pageview(text, text, text, text, timestamptz, text, text, text);

CREATE OR REPLACE FUNCTION public.ingest_pageview(
  p_url        text,
  p_session    text,
  p_device     text,
  p_referrer   text,
  p_viewed_at  timestamptz,
  p_country    text DEFAULT NULL,
  p_browser    text DEFAULT NULL,
  p_os         text DEFAULT NULL,
  p_region     text DEFAULT NULL,
  p_geo_source text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_host    text;
  v_site    uuid;
  v_timeout integer;
  v_sess    uuid;
  v_ts      timestamptz := coalesce(p_viewed_at, now());
  v_country text := upper(trim(p_country));
  v_region  text := upper(trim(p_region));
  v_source  text := lower(trim(p_geo_source));
  v_browser text := nullif(left(trim(p_browser), 40), '');
  v_os      text := nullif(left(trim(p_os), 40), '');
BEGIN
  IF p_url IS NULL OR p_session IS NULL THEN RETURN; END IF;

  -- Cloudflare sends XX for unknown and T1 for Tor; anything not alpha-2 is dropped.
  IF v_country IS NULL OR v_country !~ '^[A-Z]{2}$' OR v_country IN ('XX', 'T1') THEN
    v_country := NULL;
  END IF;
  IF v_country NOT IN ('US', 'CA') OR v_country IS NULL OR v_region !~ '^[A-Z0-9]{1,3}$' THEN
    v_region := NULL;
  END IF;
  IF v_source IS NULL OR v_source NOT IN ('ip', 'timezone', 'unknown') THEN
    v_source := 'unknown';
  END IF;
  IF v_country IS NULL THEN v_source := 'unknown'; END IF;

  v_host := public._norm_host(p_url);
  IF v_host = '' THEN RETURN; END IF;

  SELECT id, coalesce(session_timeout_minutes, 30) INTO v_site, v_timeout
    FROM sites WHERE public._norm_host(domain) = v_host LIMIT 1;
  IF v_site IS NULL THEN RETURN; END IF;

  SELECT id INTO v_sess FROM tracking_sessions
    WHERE site_id = v_site AND session_id = p_session
      AND coalesce(last_activity, started_at) > v_ts - make_interval(mins => v_timeout)
    ORDER BY started_at DESC LIMIT 1;

  IF v_sess IS NULL THEN
    INSERT INTO tracking_sessions (site_id, session_id, device_type, browser, os, referrer, started_at,
                                   last_activity, page_views, country_code, region_code, geo_source,
                                   utm_source, utm_medium, utm_campaign, utm_term, utm_content)
    VALUES (v_site, p_session, p_device, v_browser, v_os, p_referrer, v_ts, v_ts, 1, v_country, v_region, v_source,
            public._url_param(p_url, 'utm_source'), public._url_param(p_url, 'utm_medium'),
            public._url_param(p_url, 'utm_campaign'), public._url_param(p_url, 'utm_term'),
            public._url_param(p_url, 'utm_content'))
    RETURNING id INTO v_sess;
  ELSE
    -- A session keeps the geo, browser, OS and UTM tags of its first page view; a later view
    -- fills geo only if the first had none.
    UPDATE tracking_sessions
      SET page_views    = coalesce(page_views, 0) + 1,
          last_activity = greatest(last_activity, v_ts),
          duration_seconds = greatest(0, extract(epoch FROM (greatest(last_activity, v_ts) - started_at))::int),
          region_code   = CASE WHEN country_code IS NULL THEN v_region ELSE region_code END,
          geo_source    = CASE WHEN country_code IS NULL THEN v_source ELSE geo_source END,
          country_code  = coalesce(country_code, v_country),
          browser       = coalesce(browser, v_browser),
          os            = coalesce(os, v_os)
    WHERE id = v_sess;
  END IF;

  INSERT INTO page_views (site_id, session_id, url, viewed_at, referrer)
  VALUES (v_site, v_sess, p_url, v_ts, p_referrer);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ingest_pageview(text, text, text, text, timestamptz, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.ingest_pageview(text, text, text, text, timestamptz, text, text, text, text, text) TO service_role;
```

Note: in a PostgreSQL `UPDATE ... SET`, every right-hand side sees the old row. So `region_code`/`geo_source` read the old `country_code` even though `country_code` is listed after them. That is intended.

Note for the deploy order: the old 8-argument function is dropped. Deploy the migration and track-event (Task 4) together. The old track-event passes named arguments without `p_region`, and the defaults still match, so the old function code keeps working against the new signature.

- [ ] **Step 4: Write `20261203000002_aggregate_countries.sql`**

```sql
-- supabase/migrations/20261203000002_aggregate_countries.sql
-- Spec 2026-11-18 phase 2 AC4: consent-free aggregate page views per country per day. Country
-- only (no region): a separate table so the existing aggregate keys and burst filter stay as they
-- are. '' = unknown. Called by aggregate-hit after a counted page view.

CREATE TABLE IF NOT EXISTS public.aggregate_countries_daily (
  site_id   uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  day       date NOT NULL,
  country   text NOT NULL DEFAULT '' CHECK (country = '' OR country ~ '^[A-Z]{2}$'),
  pageviews integer NOT NULL DEFAULT 0,
  PRIMARY KEY (site_id, day, country)
);
ALTER TABLE public.aggregate_countries_daily ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Site owners read aggregate countries" ON public.aggregate_countries_daily;
CREATE POLICY "Site owners read aggregate countries" ON public.aggregate_countries_daily
  FOR SELECT TO authenticated
  USING (site_id IN (SELECT id FROM public.sites WHERE user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.ingest_aggregate_country(p_site_id uuid, p_country text, p_now timestamptz DEFAULT now())
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_c text := upper(coalesce(trim(p_country), ''));
BEGIN
  IF v_c !~ '^[A-Z]{2}$' OR v_c IN ('XX', 'T1') THEN v_c := ''; END IF;
  INSERT INTO public.aggregate_countries_daily (site_id, day, country, pageviews)
  VALUES (p_site_id, (p_now AT TIME ZONE 'UTC')::date, v_c, 1)
  ON CONFLICT (site_id, day, country) DO UPDATE SET pageviews = public.aggregate_countries_daily.pageviews + 1;
END;
$$;
REVOKE ALL ON FUNCTION public.ingest_aggregate_country(uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_aggregate_country(uuid, text, timestamptz) TO service_role;

-- Same retention as the other aggregate tables: run_data_retention() trims aggregate_pages_daily
-- by the site's retention; country rows older than the oldest remaining page day go too.
CREATE OR REPLACE FUNCTION public.aggregate_countries_retention()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  n integer;
BEGIN
  DELETE FROM public.aggregate_countries_daily c
   WHERE NOT EXISTS (SELECT 1 FROM public.aggregate_pages_daily p WHERE p.site_id = c.site_id AND p.day <= c.day);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.aggregate_countries_retention() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aggregate_countries_retention() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('aggregate-countries-retention', '40 4 * * *', 'SELECT public.aggregate_countries_retention()');
  END IF;
END;
$$;
```

The fixture in Step 1 has no `auth` schema, so the `CREATE POLICY` with `auth.uid()` will fail in PGlite. Add `CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;` to the fixture `exec` before running.

- [ ] **Step 5: Run tests**

Run: `node --test tests/foundation/geo-columns.test.mjs tests/foundation/utm-ingest.test.mjs tests/foundation/geo-breakdown.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261203000001_geo_columns.sql supabase/migrations/20261203000002_aggregate_countries.sql tests/foundation/geo-columns.test.mjs
git commit -m "feat(geo): region/geo_source columns, ingest_pageview geo, country aggregate"
```

---

### Task 4: Every ingest function uses `resolveGeo` (AC1, AC4)

**Files:**
- Modify:
  - `supabase/functions/track-event/index.ts:496-500` (the `ingest_pageview` call)
  - `supabase/functions/visitor-identification/index.ts:266-270, :406-408`
  - `supabase/functions/store-consent/index.ts` (the `consentGeo` line from phase 1 Task 5)
  - `supabase/functions/_shared/consent-geo.ts`
  - `supabase/functions/aggregate-hit/index.ts:114` (+ the counted page view branch)
  - `supabase/functions/ai-bot-tracker/index.ts:28-33, :123, :183-197`
  - `supabase/functions/canary-tracker/index.ts:70-74`
  - `supabase/functions/geo-check/index.ts:16`
  - `supabase/functions/_shared/bot-detection.ts:236-243`
- Modify: `tests/foundation/geo-breakdown.test.mjs:20-23, :43`
- Create: `tests/foundation/geo-wiring.test.mjs`

**Interfaces:**
- Consumes: `resolveGeo`, `geoKey` (Task 1); the columns and RPCs from Task 3; phase 1's `consentGeo`/`gpcRequested`.
- Produces: `consentGeo(geo: Geo): { geo_country; geo_region; geo_source }`. It replaces phase 1's `consentGeo(timeZone)`, so store-consent passes the resolved geo. No function in the Worker allowlist reads `cf-ipcountry`, `x-country`, `cf-connecting-ip`, `x-forwarded-for` or `x-real-ip` directly.

- [ ] **Step 1: Write the failing wiring test**

```js
// tests/foundation/geo-wiring.test.mjs
// Spec 2026-11-18 phase 2 AC1: geo and client IP come from resolveGeo only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadEdge, mockDatabase } from './edge-harness.mjs';
import { signGeo, GEO_HEADER } from '../../supabase/functions/_shared/geo-token.js';

const FUNCS = ['track-event', 'visitor-identification', 'store-consent', 'aggregate-hit', 'ai-bot-tracker', 'canary-tracker', 'geo-check'];
const RAW = /headers\.get\(\s*['"](cf-ipcountry|x-country|cf-connecting-ip|x-forwarded-for|x-real-ip)['"]/i;

test('no allowlisted function reads geo or IP headers directly', () => {
  for (const fn of FUNCS) {
    const src = readFileSync(`supabase/functions/${fn}/index.ts`, 'utf8');
    assert.doesNotMatch(src, RAW, fn);
    assert.match(src, /resolveGeo\(/, fn);
  }
  assert.doesNotMatch(readFileSync('supabase/functions/_shared/bot-detection.ts', 'utf8'), /headers\.get\(\s*['"](cf-ipcountry|x-country)['"]/i);
});

test('store-consent: signed geo → geo_source ip with region', async () => {
  const KEY = 'k'.repeat(32);
  const SITE = '11111111-1111-4111-8111-111111111111';
  const db = mockDatabase((op) => {
    if (op.table === 'sites') return { data: { id: SITE }, error: null };
    if (op.table === 'cookie_consents' && op.type === 'insert') return { data: { id: 'r', ...op.payload }, error: null };
    return { data: null, error: null };
  }, async (name) => ({ data: name === 'check_rate_limit' ? true : null, error: null }));
  const handler = loadEdge('store-consent', db.client, { env: { GEO_SIGNING_KEY: KEY } });
  const token = await signGeo({ country: 'US', region: 'CA', ip: '203.0.113.4' }, KEY, Math.floor(Date.now() / 1000));
  await handler(new Request('https://fn.test/store-consent', {
    method: 'POST', headers: { 'Content-Type': 'application/json', [GEO_HEADER]: token },
    body: JSON.stringify({ site_id: SITE, session_id: 's', consent_types: { analytics: true }, time_zone: 'Europe/Stockholm' }),
  }));
  const row = db.calls.find((c) => c.table === 'cookie_consents' && c.type === 'insert').payload;
  assert.deepEqual([row.geo_country, row.geo_region, row.geo_source], ['US', 'CA', 'ip']);
  assert.equal(row.ip_address, '203.0.113.0', 'anonymized signed IP, never raw');
});

test('geo-check: signed country decides scope; unknown stays in scope', async () => {
  const KEY = 'k'.repeat(32);
  const handler = loadEdge('geo-check', null, { env: { GEO_SIGNING_KEY: KEY } });
  const token = await signGeo({ country: 'US', region: 'TX', ip: null }, KEY, Math.floor(Date.now() / 1000));
  const us = await (await handler(new Request('https://fn.test/geo-check', { headers: { [GEO_HEADER]: token } }))).json();
  assert.deepEqual(us, { country: 'US', region: 'TX', in_scope: false });
  const none = await (await handler(new Request('https://fn.test/geo-check'))).json();
  assert.deepEqual(none, { country: null, region: null, in_scope: true });
});
```

Note: `loadEdge` returns `'test-value'` for any env key not passed in, so a test that wants "no key" must pass `GEO_SIGNING_KEY: ''` (short keys are rejected anyway). `anonymizeIP` (`_shared/jurisdiction.ts:164`) zeroes the last IPv4 octet, so `203.0.113.4` → `203.0.113.0`. If `mockDatabase`'s insert payload for store-consent is the object passed to `.insert()`, the `ip_address` assertion holds with phase 1's `anonymizeIP(requestData.ip_address)`. This task changes that to `anonymizeIP(geo.ip)`. Check `edge-harness.mjs` for how `loadEdge` handles a `null` client before you assume it works for geo-check, which has no Supabase client. If it needs a client, pass `mockDatabase(() => ({ data: null, error: null })).client`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/foundation/geo-wiring.test.mjs`
Expected: FAIL (raw header reads found).

- [ ] **Step 3: Update `_shared/consent-geo.ts`**

Replace `consentGeo` with this, and keep `gpcRequested` unchanged:

```ts
import type { Geo } from './geo.ts';

export type ConsentGeo = { geo_country: string | null; geo_region: string | null; geo_source: Geo['source'] };

/** Consent ledger geo from the resolved request geo (signed edge IP country, else time zone). */
export function consentGeo(geo: Geo): ConsentGeo {
  return { geo_country: geo.country, geo_region: geo.region, geo_source: geo.source };
}
```

Remove the `countryFromTimeZone` import. Update phase 1's `tests/foundation/store-consent-geo-gpc.test.mjs` `consentGeo` unit test to the new signature:

```js
test('consentGeo: copies the resolved geo', () => {
  assert.deepEqual(consentGeo({ country: 'SE', region: null, source: 'timezone', ip: null }), { geo_country: 'SE', geo_region: null, geo_source: 'timezone' });
  assert.deepEqual(consentGeo({ country: null, region: null, source: 'unknown', ip: null }), { geo_country: null, geo_region: null, geo_source: 'unknown' });
});
```

The other tests in that file (bogus time zone → unknown, GPC) stay valid through store-consent.

- [ ] **Step 4: store-consent**

Add `import { resolveGeo, geoKey } from "../_shared/geo.ts";`. After the request body is parsed and validated, and before `consentData`, add:

```ts
    const geo = await resolveGeo(req, { key: geoKey(), timeZone: requestData.time_zone });
```

In `consentData`, use `ip_address: anonymizeIP(geo.ip ?? requestData.ip_address ?? null),` and replace `...consentGeo(requestData.time_zone),` with `...consentGeo(geo),`. In the update payload, add `geo_region: consentData.geo_region,`.

- [ ] **Step 5: track-event**

Add `import { resolveGeo, geoKey } from '../_shared/geo.ts';`. Before the `supabase.rpc('ingest_pageview', …)` call, add `const geo = await resolveGeo(req, { key: geoKey(), timeZone: body.metadata?.timezone });` and replace the `p_country` line and its comment with:

```ts
            // Signed Cloudflare geo via the CortIQ Worker, else the browser time zone
            // (resolveGeo, spec 2026-11-18 phase 2). Region only for US/CA; no IP is stored.
            p_country: geo.country,
            p_region: geo.region,
            p_geo_source: geo.source,
```

Remove the `countryFromTimeZone` import if nothing else uses it.

- [ ] **Step 6: visitor-identification**

Delete the `visitorCountry` function. Import `resolveGeo, geoKey`. Replace `p_country_code: visitorCountry(req.headers.get('cf-ipcountry'), requestData.timeZone)` and the comment above it with:

```ts
      // Signed edge geo, else the browser time zone (spec 2026-11-18 phase 2).
      p_country_code: (await resolveGeo(req, { key: geoKey(), timeZone: requestData.timeZone })).country
```

- [ ] **Step 7: aggregate-hit**

Import `resolveGeo, geoKey`. Replace `clientIp(req.headers)` in the hash line:

```ts
  // The Worker hides the visitor's IP behind its own; the signed geo carries it (in transit only).
  const geo = await resolveGeo(req, { key: geoKey(), timeZone: body.tz });
  const hash = await visitorHash(salt, site.id, geo.ip ?? '', ua);
```

Remove `clientIp` from the `_shared/aggregate.js` import. Directly after `if (counted === false) return skipped('burst');` add:

```ts
    const { error: geoError } = await supabase.rpc('ingest_aggregate_country', { p_site_id: site.id, p_country: geo.country });
    if (geoError) console.error('aggregate-hit: country ingest failed:', geoError.message);
```

The beacon does not send `tz` today, so `body.tz` is undefined and the fallback is `unknown`. Country aggregates are IP-based only, by design: do not add a time zone to the consent-free beacon.

- [ ] **Step 8: ai-bot-tracker**

Delete the local `clientIp` function. Import `resolveGeo, geoKey`. Before the rate limit, add `const geo = await resolveGeo(req, { key: geoKey(), timeZone: null });` and `const ip = geo.ip ?? 'unknown';`. Then remove the old `const ip = clientIp(req);`. In the insert, change `ip_address` to `anonymizeIP(geo.ip) || 'unknown',` and add:

```ts
        country_code: geo.country,
        region_code: geo.region,
```

Use `timeZone: null` because a bot's browser time zone means nothing. AI bot geo is IP-only.

- [ ] **Step 9: canary-tracker, geo-check, bot-detection**

canary-tracker: import `resolveGeo, geoKey`. Replace the `rawIP` and `country` lines with:

```ts
    const geo = await resolveGeo(req, { key: geoKey(), timeZone: null });
    const rawIP = geo.ip;
    const country = geo.country;
```

geo-check, the full new handler body:

```ts
import { resolveGeo, geoKey } from '../_shared/geo.ts';
// (keep corsHeaders and EEA_UK_CH)
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  // Signed edge geo via the CortIQ Worker; no time zone here — this decides banner scope and
  // unknown must stay in scope (fail-safe).
  const geo = await resolveGeo(req, { key: geoKey(), timeZone: null });
  const inScope = geo.country ? EEA_UK_CH.has(geo.country) : true;
  return new Response(
    JSON.stringify({ country: geo.country, region: geo.region, in_scope: inScope }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=300' } }
  );
});
```

Update the header comment to say it reads the signed geo, not CF-IPCountry.

`_shared/bot-detection.ts`: `detectAndRecordBot` has no live caller (`grep -rn detectAndRecordBot supabase/functions` shows only its own file). Still replace the `country` block with `const country = (await resolveGeo(req, { key: geoKey(), timeZone: null })).country;` so a future caller gets signed geo into `bot_detections.country`. Also change `getClientIP(req)` to `(await resolveGeo(req, { key: geoKey(), timeZone: null })).ip`. Resolve once into a `geo` const and use it for both.

- [ ] **Step 10: Update `geo-breakdown.test.mjs`**

Replace the test at :20-23 and the assertion at :43:

```js
test('track-event forwards resolved geo (signed edge country, else time zone) to ingest_pageview', () => {
  const src = readFileSync(new URL('../../supabase/functions/track-event/index.ts', import.meta.url), 'utf8');
  assert.match(src, /resolveGeo\(req, \{ key: geoKey\(\), timeZone: body\.metadata\?\.timezone \}\)/);
  assert.match(src, /p_country: geo\.country,/);
  assert.match(src, /p_region: geo\.region,/);
  assert.match(src, /p_geo_source: geo\.source,/);
});
```

At :43, replace `assert.match(src, /countryFromTimeZone\(body\.metadata\?\.timezone\)/);` with `assert.match(src, /timeZone: body\.metadata\?\.timezone/);`. Keep the surrounding lines. If line 20's test reads `src` from an outer scope, keep the variable name the file already uses.

- [ ] **Step 11: Run the suite**

Run: `npm run test:foundation`
Expected: all PASS. Fix any test that asserted the old raw header reads by pointing it at `resolveGeo`, and name each such file in the commit body.

- [ ] **Step 12: Commit**

```bash
git add supabase/functions tests/foundation
git commit -m "feat(geo): ingest functions read country and client IP from signed edge geo"
```

---

### Task 5: Clients send through the Worker with direct fallback; 5.5.16 (AC3)

**Files:**
- Modify:
  - `public/spa-tracking.js` (`API_URL` at :40 and every `fetch(…API_URL…)` call site: :277, :371, :486, :653, :727, :845, :879, :950, :1039, :1081, :1177, :1196, :1215, :1240, :1256)
  - `public/consent-banner.js` (cfg :210, `postConsent` :308)
  - `src/lib/aggregate-beacon.js` (:14 and the send at :62)
  - `wordpress-plugin/cortiq-analytics.php` (:27 constants, `CQ_API` usage in the banner script :539, :582 save, :664 geo-check)
  - `public/.htaccess:25` (connect-src)
  - The version files listed in Global Constraints.
- Create: `tests/foundation/geo-endpoint-fallback.test.mjs`

**Interfaces:**
- Consumes: `workers/geo-edge/ENDPOINT` (Task 2) and the Worker's `x-cortiq-geo-proxy: error` contract.
- Produces:
  - Config `geoUrl` (snippet `window.cortiqConfig.geoUrl`, banner `data-geo-url`). The value `false` opts out.
  - Rule, the same in all three scripts:
    - The primary base is `geoUrl` if given.
    - Otherwise it is the built-in `GEO_URL`, but only when `apiUrl` is absent or equals the built-in direct URL. A site with its own `apiUrl` proxy is never rerouted.
    - The fallback base is `apiUrl` or the direct URL.
  - On a rejected fetch, or a response with `x-cortiq-geo-proxy: error`, the script resends that request once to the fallback base and uses the fallback for the rest of the page load. Nothing is stored. A normal HTTP error from a function (4xx or 5xx without the header) is never retried.

- [ ] **Step 1: Write the failing test**

```js
// tests/foundation/geo-endpoint-fallback.test.mjs
// Spec 2026-11-18 phase 2: scripts call the geo Worker and fall back to direct Supabase when it
// fails (quota, ad blocker, CSP, outage), without losing the request.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const ENDPOINT = readFileSync('workers/geo-edge/ENDPOINT', 'utf8');
const DIRECT = 'https://cxmkdtgfocgbfizawlwa.supabase.co/functions/v1';
const tracker = readFileSync('public/spa-tracking.js', 'utf8');
const banner = readFileSync('public/consent-banner.js', 'utf8');
const beacon = readFileSync('src/lib/aggregate-beacon.js', 'utf8');
const plugin = readFileSync('wordpress-plugin/cortiq-analytics.php', 'utf8');

test('the built-in Worker URL matches the deployed endpoint everywhere', () => {
  assert.match(ENDPOINT, /^https:\/\/[a-z0-9.-]+$/);
  for (const [name, src] of [['tracker', tracker], ['banner', banner], ['beacon', beacon]]) {
    assert.ok(src.includes(`'${ENDPOINT}'`), name);
  }
  assert.match(plugin, new RegExp(`define\\( 'CORTIQ_GEO_API',\\s+'${ENDPOINT.replace(/\./g, '\\.')}' \\);`));
  assert.match(readFileSync('public/.htaccess', 'utf8'), new RegExp(`connect-src [^;]*${ENDPOINT.replace(/\./g, '\\.')}`));
});

test('tracker: no raw fetch to API_URL is left; everything goes through apiFetch', () => {
  assert.doesNotMatch(tracker, /fetch\(\s*`\$\{API_URL\}/);
  assert.doesNotMatch(tracker, /fetch\(\s*API_URL\s*\+/);
  assert.match(tracker, /function apiFetch\(path, init\)/);
});

// Run the tracker's routing helpers in isolation.
function routing(config, fetchImpl) {
  const start = tracker.indexOf('// --- API routing');
  const end = tracker.indexOf('// --- end API routing');
  const code = tracker.slice(start, end) + '\n;({ apiFetch, base: () => API_URL });';
  return runInNewContext(code, { config, fetch: fetchImpl, Promise });
}
const ok = (headers = {}) => Promise.resolve(new Response('{}', { status: 200, headers }));

test('default: Worker first', async () => {
  const urls = [];
  const r = routing({}, (u) => { urls.push(u); return ok(); });
  await r.apiFetch('/track-event', {});
  assert.deepEqual(urls, [`${ENDPOINT}/track-event`]);
});

test('reject → direct, and direct stays for the page load', async () => {
  const urls = [];
  const r = routing({}, (u) => { urls.push(u); return u.startsWith(ENDPOINT) ? Promise.reject(new TypeError('blocked')) : ok(); });
  await r.apiFetch('/track-event', {});
  await r.apiFetch('/record-conversion', {});
  assert.deepEqual(urls, [`${ENDPOINT}/track-event`, `${DIRECT}/track-event`, `${DIRECT}/record-conversion`]);
});

test('proxy error header → direct', async () => {
  const urls = [];
  const r = routing({}, (u) => { urls.push(u); return u.startsWith(ENDPOINT) ? ok({ 'x-cortiq-geo-proxy': 'error' }) : ok(); });
  await r.apiFetch('/store-consent', {});
  assert.deepEqual(urls, [`${ENDPOINT}/store-consent`, `${DIRECT}/store-consent`]);
});

test('function 500 → no retry (would duplicate the event)', async () => {
  const urls = [];
  const r = routing({}, (u) => { urls.push(u); return Promise.resolve(new Response('x', { status: 500 })); });
  const res = await r.apiFetch('/track-event', {});
  assert.equal(res.status, 500);
  assert.equal(urls.length, 1);
});

test('own apiUrl proxy or geoUrl:false → never the Worker', async () => {
  for (const config of [{ apiUrl: 'https://proxy.example/fn' }, { geoUrl: false }]) {
    const urls = [];
    const r = routing(config, (u) => { urls.push(u); return ok(); });
    await r.apiFetch('/track-event', {});
    assert.ok(!urls[0].startsWith(ENDPOINT), JSON.stringify(config));
  }
});

test('banner and beacon use the same rule and fallback', () => {
  for (const src of [banner, beacon]) {
    assert.match(src, /x-cortiq-geo-proxy/);
    assert.match(src, /geoUrl/);
  }
  assert.match(plugin, /CQ_GEO\s*=/);
  assert.match(plugin, /x-cortiq-geo-proxy/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/foundation/geo-endpoint-fallback.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Tracker routing (`public/spa-tracking.js`)**

Replace the `const API_URL = …` line at :40 with the following block. Replace `<ENDPOINT>` with the exact contents of `workers/geo-edge/ENDPOINT`; the Step 1 test checks it.

```js
  // --- API routing (spec 2026-11-18 phase 2): send through the CortIQ geo Worker, which adds
  // signed Cloudflare country/region. If it fails (blocked, over quota, outage), resend that
  // request directly and stay direct for this page load. A site with its own apiUrl, or
  // geoUrl: false, never goes through the Worker. Nothing is stored.
  var DIRECT_URL = 'https://cxmkdtgfocgbfizawlwa.supabase.co/functions/v1';
  var GEO_URL = '<ENDPOINT>';
  var API_DIRECT = config.apiUrl || DIRECT_URL;
  var API_URL = config.geoUrl === false ? API_DIRECT
    : (config.geoUrl || (API_DIRECT === DIRECT_URL ? GEO_URL : API_DIRECT));
  function apiFetch(path, init) {
    var base = API_URL;
    var direct = function () { API_URL = API_DIRECT; return fetch(API_DIRECT + path, init); };
    if (base === API_DIRECT) return fetch(base + path, init);
    return fetch(base + path, init).then(function (res) {
      return res.headers.get('x-cortiq-geo-proxy') === 'error' ? direct() : res;
    }, direct);
  }
  // --- end API routing
```

`var`/`function` are used so the test's `runInNewContext` slice returns them, and because the file's other top-level helpers use the same style. If the surrounding block uses `const` throughout and the linter objects, `let API_URL` also works with the test, because `base: () => API_URL` is evaluated in the same script.

Then rewrite every call site mechanically:

- `fetch(\`${API_URL}/X\`, {` → `apiFetch('/X', {`
- `fetch(API_URL + '/X', {` → `apiFetch('/X', {`

`sendBeacon(API_URL + '/X', …)` calls stay as they are. They read `API_URL` at call time, so they go direct after a fallback. A sendBeacon that is rejected falls through to the existing `else fetch(...)` branch, which now calls `apiFetch`.

Check with: `grep -n "fetch(\`\${API_URL}\|fetch(API_URL" public/spa-tracking.js`. Expect no output.

- [ ] **Step 4: Banner (`public/consent-banner.js`)**

In `cfg`, replace the `apiUrl` line with:

```js
    apiUrl        : attr('data-api-url') || DIRECT_URL,
    geoUrl        : attr('data-geo-url') === 'false' ? false : (attr('data-geo-url') || null),
```

Above `cfg`, add:

```js
  var DIRECT_URL = 'https://cxmkdtgfocgbfizawlwa.supabase.co/functions/v1';
  var GEO_URL = '<ENDPOINT>';
```

Replace `fetch(cfg.apiUrl + '/store-consent', opts)` (keep the existing options object; name it `opts` if it is inline) with:

```js
      var primary = cfg.geoUrl === false ? cfg.apiUrl : (cfg.geoUrl || (cfg.apiUrl === DIRECT_URL ? GEO_URL : cfg.apiUrl));
      var direct = function () { return fetch(cfg.apiUrl + '/store-consent', opts); };
      (primary === cfg.apiUrl ? direct() : fetch(primary + '/store-consent', opts).then(function (res) {
        return res.headers.get('x-cortiq-geo-proxy') === 'error' ? direct() : res;
      }, direct))
```

Chain the existing `.then/.catch` handlers after this expression unchanged. Add `headers: { get: () => null }` to the test stub's fetch responses in `consent-banner.test.mjs` if they do not already return one. Update the `posts` recorder there so the tests from phase 1 Task 6 still find the store-consent post: match on `url.endsWith('/store-consent')`.

- [ ] **Step 5: Beacon (`src/lib/aggregate-beacon.js`)**

Replace the `endpoint` line with:

```js
  var DIRECT_URL = 'https://cxmkdtgfocgbfizawlwa.supabase.co/functions/v1';
  var GEO_URL = '<ENDPOINT>';
  var directBase = cfg.apiUrl || DIRECT_URL;
  var base = cfg.geoUrl === false ? directBase : (cfg.geoUrl || (directBase === DIRECT_URL ? GEO_URL : directBase));
```

In the send function (:62), change `fetch(endpoint, init)` to:

```js
      var url = base + '/aggregate-hit';
      var toDirect = function () { base = directBase; return fetch(directBase + '/aggregate-hit', init); };
      return (base === directBase ? fetch(url, init) : fetch(url, init).then(function (res) {
        return res.headers.get('x-cortiq-geo-proxy') === 'error' ? toDirect() : res;
      }, toDirect))
```

Keep whatever `.catch` already follows. Replace any other reference to `endpoint` with `base + '/aggregate-hit'`. The WP plugin bundles this file as `assets/cortiq-aggregate.js` through `scripts/build-plugin.mjs`, and the snippet inlines it, so no other copy needs editing. Check with `grep -rn "aggregate-hit" src/lib wordpress-plugin/assets`.

- [ ] **Step 6: WP plugin banner + CSP**

`cortiq-analytics.php`: after the `CORTIQ_API` define, add `define( 'CORTIQ_GEO_API',    '<ENDPOINT>' );`. Line it up with the existing defines; the Step 1 regex allows any whitespace. In the banner script, after `var CQ_API = …;`, add:

```js
  var CQ_GEO = '<?php echo esc_js( CORTIQ_GEO_API ); ?>';
  // Through the CortIQ geo Worker (signed country); direct if it fails.
  function cqFetch(path, init){
    var direct = function(){ CQ_GEO = CQ_API; return fetch(CQ_API + path, init); };
    if (CQ_GEO === CQ_API) { return fetch(CQ_API + path, init); }
    return fetch(CQ_GEO + path, init).then(function(r){ return r.headers.get('x-cortiq-geo-proxy') === 'error' ? direct() : r; }, direct);
  }
```

Change `fetch(CQ_API+'/store-consent', …)` in `save()` and `fetch(CQ_API + '/geo-check')` to `cqFetch('/store-consent', …)` and `cqFetch('/geo-check')`. The plugin's tracker config (`'apiUrl' => CORTIQ_API`) stays the same: the tracker's rule sends it through the Worker because it equals the built-in direct URL. Update phase 1's `plugin-banner-gpc.test.mjs` extraction: add a `.replace(/<\?php echo esc_js\( CORTIQ_GEO_API \); \?>/, 'https://api.test')` so both bases are equal in that test.

`public/.htaccess:25`: in `connect-src`, add `<ENDPOINT>` after `https://cxmkdtgfocgbfizawlwa.supabase.co`.

- [ ] **Step 7: Run tests**

Run: `npm run test:foundation`
Expected: PASS.

- [ ] **Step 8: Bump to 5.5.16 and build**

Edit the five places listed in Global Constraints. Add this readme changelog entry:

```
= 5.5.16 =
* Tracking and consent requests go through CortIQ's Cloudflare edge, which adds the visitor's country (and US state / Canadian province). If the edge is unreachable, requests go directly to CortIQ as before.
```

Run `node scripts/build-plugin.mjs && npm run build`, then `node --test tests/foundation/version-sync.test.mjs tests/foundation/sri-pin.test.mjs tests/foundation/csp-hashes.test.mjs`. Expect PASS. Revert any zip that changed only in line endings.

- [ ] **Step 9: Commit**

```bash
git add public/spa-tracking.js public/consent-banner.js src/lib/aggregate-beacon.js wordpress-plugin public/.htaccess src/lib/plugin-version.ts public/v/5.5.16 src/lib/sri-manifest.json tests/foundation
git commit -m "feat(geo): scripts send through the geo Worker with direct fallback (5.5.16)"
```

Do not release yet. Release waits for Task 7's legal gate.

---

### Task 6: Country for server-side bot hits from the customer's CF adapter (AC4)

**Files:**
- Modify: `public/cloudflare-worker.js` (`report()` body ~:84-91)
- Modify: `supabase/functions/server-hit/index.ts` (row push ~:124-143)
- Modify: `tests/foundation/server-hit.test.mjs`

**Interfaces:**
- Consumes: `ai_bot_traffic.country_code`/`region_code` (Task 3).
- Produces: hit field `country` (alpha-2) and `region` (US/CA only), both optional. server-hit stores them after the same normalization as `geo-token.js` (reuse its exported logic through a small `normalizeGeoClaims` export). server-hit is server to server, so the country comes from the customer's own Cloudflare (`request.cf.country`), not from the CortIQ Worker. The Node/Next/Netlify adapters cannot know the country and send none.

- [ ] **Step 1: Export the normalizer from `geo-token.js`**

Rename the internal `normalize` to `export function normalizeGeoClaims(claims)` and update its two call sites in the same file.

- [ ] **Step 2: Write the failing tests** (append to `tests/foundation/server-hit.test.mjs`)

Use the file's existing `setup()`, `post(hits)` and `inserted(calls)` helpers (lines 8–24). Add:

```js
test('server-hit stores the adapter country (alpha-2) and US/CA region only', async () => {
  const { handler, calls } = setup();
  await handler(post([
    { url: 'https://www.shop.test/a', userAgent: 'Mozilla/5.0 (compatible; GPTBot/1.2)', country: 'us', region: 'ca' },
    { url: 'https://www.shop.test/b', userAgent: 'Mozilla/5.0 (compatible; GPTBot/1.2)', country: 'BR', region: 'SP' },
    { url: 'https://www.shop.test/c', userAgent: 'Mozilla/5.0 (compatible; GPTBot/1.2)', country: 'XX' },
  ]));
  assert.deepEqual(inserted(calls).map((r) => [r.country_code, r.region_code]), [['US', 'CA'], ['BR', null], [null, null]]);
});

test('Cloudflare adapter sends request.cf country and region', () => {
  const src = readFileSync('public/cloudflare-worker.js', 'utf8');
  assert.match(src, /country: request\.cf\?\.country \|\| undefined,/);
  assert.match(src, /region: request\.cf\?\.regionCode \|\| undefined,/);
});
```

- [ ] **Step 3: Run to verify failure**

Run: `node --test tests/foundation/server-hit.test.mjs`
Expected: the new tests FAIL.

- [ ] **Step 4: Implement**

In `public/cloudflare-worker.js` `report()`, add these to the hit object after `ip:`:

```js
        country: request.cf?.country || undefined,
        region: request.cf?.regionCode || undefined,
```

In `server-hit/index.ts`, import `normalizeGeoClaims` from `../_shared/geo-token.js`. In the loop, before `rows.push`, add `const g = normalizeGeoClaims({ c: typeof raw.country === 'string' ? raw.country.toUpperCase() : null, r: typeof raw.region === 'string' ? raw.region.toUpperCase() : null, ip: null });`. In the row, add:

```ts
      country_code: g.c,
      region_code: g.r,
```

- [ ] **Step 5: Run tests**

Run: `node --test tests/foundation/server-hit.test.mjs tests/foundation/geo-token.test.mjs tests/foundation/server-adapters.test.mjs`
Expected: PASS. If `server-adapters.test.mjs` does not exist, run `ls tests/foundation | grep -i adapter` and run what matches. The adapters have a sync test with `cortiq-server.mjs` for `AGENT_UA` only.

- [ ] **Step 6: Commit**

```bash
git add public/cloudflare-worker.js supabase/functions/server-hit/index.ts supabase/functions/_shared/geo-token.js tests/foundation/server-hit.test.mjs
git commit -m "feat(geo): server-side bot hits carry country from the Cloudflare adapter"
```

---

### Task 7: Runbook, verification and the legal gate (AC3, AC5)

**Files:**
- Create: `docs/runbooks/geo-edge-worker.md`

**Interfaces:**
- Consumes: everything above.
- Produces: the runbook, the release decision recorded in it, and updated DPA/privacy texts (separate PR, after jurist review).

- [ ] **Step 1: Write the runbook**

```markdown
# Geo edge Worker (cortiq-geo)

Spec: docs/superpowers/specs/2026-11-18-jurisdiction-aware-measurement-design.md (phase 2).
Code: workers/geo-edge/, supabase/functions/_shared/geo-token.js, _shared/geo.ts.

## 1. One-time setup (Daniel)
1. Cloudflare account: Daniel's existing account `965167b0273f7357cf036e3fffcd825a` (free plan; set as
   `account_id` in wrangler.toml). `npx wrangler login` with that account's login.
2. Generate a key: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
3. Supabase FIRST: `supabase secrets set GEO_SIGNING_KEY=<key>`. Until the Worker has the same key,
   functions ignore tokens (time zone fallback) — nothing breaks.
4. Worker: `cd workers/geo-edge && npx wrangler secret put GEO_SIGNING_KEY` (same key) → `npx wrangler deploy`.
5. Record the printed origin in workers/geo-edge/ENDPOINT (no trailing slash, no newline) and commit.

## 2. Rotating the key
Same order: Supabase, then Worker, within a few minutes. During the gap geo_source is 'timezone'
and rate-limit keys fall back to 'unknown' for Worker traffic (Review Focus 2) — keep it short.

## 3. Deploy order for phase 2
1. `supabase db push --remote --yes` (20261203000001, 20261203000002).
2. `supabase functions deploy track-event visitor-identification store-consent aggregate-hit ai-bot-tracker canary-tracker geo-check server-hit`.
3. Worker deployed (section 1). Smoke test:
   `curl -s https://<ENDPOINT>/geo-check` → `{"country":"SE","region":null,"in_scope":true}` from Sweden.
4. **Legal gate (section 5) approved** → `npm run build`, dist FTP (Daniel), WP plugin 5.5.16 release.

## 4. Verification (after 48 h of traffic on 5.5.16)
-- Share of browser sessions with IP geo (target ≥ 98 %), per site:
select s.domain, count(*) filter (where ts.geo_source = 'ip')::numeric / nullif(count(*), 0) as ip_share, count(*)
from tracking_sessions ts join sites s on s.id = ts.site_id
where ts.started_at > now() - interval '48 hours' group by 1 order by 3 desc;
-- Region coverage for US/CA:
select country_code, count(*) filter (where region_code is not null)::numeric / count(*) from tracking_sessions
where started_at > now() - interval '48 hours' and country_code in ('US','CA') group by 1;
-- Consents:
select geo_source, count(*) from cookie_consents where created_at > now() - interval '48 hours' group by 1;
-- CSP on cortiq.se:
select * from csp_reports order by last_seen desc limit 10;
A share below 98 % on a site: check whether its CSP blocks the Worker (fallback is silent by design)
or an ad blocker list includes workers.dev.

## 5. Legal gate (before release)
1. `jurist` agent reviews: Cloudflare, Inc. as a CortIQ subprocessor (transit of IP + country,
   no storage by CortIQ; Cloudflare's DPA and SCCs / EU-US DPF), the purpose (jurisdiction rules
   and country reports), and the privacy-policy and DPA wording.
2. Update the DPA subprocessor list (next DPA version) and the privacy policy page; copy rules in CLAUDE.md apply.
3. Daniel approves → status approved_internal. Record date and DPA version here.
   - Approved: ____ (date) · DPA version: ____
4. Only then release (section 3 step 4).

## 6. Volume
Free plan: 100,000 requests/day across all sites. Over quota → Cloudflare error without CORS → scripts
fall back to direct (no data loss, geo_source 'timezone'). Watch: Cloudflare dashboard → Workers → cortiq-geo → Metrics.
Upgrade to Workers Paid ($5/month, 10 M requests) when daily requests pass ~70,000.
```

Fill the "Approved" line in section 5 only when Daniel approves. That is a recorded decision, not a blank in the plan.

- [ ] **Step 2: Run the legal review**

Dispatch the `jurist` agent with the runbook's section 5 items 1–2, the current DPA text (`grep -rln "subprocessor\|underbiträde" src/pages docs | head`) and the privacy policy page. Ask it to return concrete wording for the subprocessor entry and the privacy policy paragraph, and to flag any claim that needs outside counsel. Save its output as `docs/legal/2026-11-geo-worker-review.md`.

- [ ] **Step 3: Commit**

```bash
git add docs/runbooks/geo-edge-worker.md docs/legal/2026-11-geo-worker-review.md
git commit -m "docs(geo): runbook, verification queries and legal gate for the geo Worker"
```

The DPA and privacy policy text changes go in their own PR after Daniel has read the review.

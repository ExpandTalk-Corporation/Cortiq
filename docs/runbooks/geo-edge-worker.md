# Geo edge Worker (cortiq-geo)

Spec: docs/superpowers/specs/2026-11-18-jurisdiction-aware-measurement-design.md (phase 2).
Code: workers/geo-edge/, supabase/functions/_shared/geo-token.js, _shared/geo.ts.

## 1. One-time setup (Daniel)
1. Cloudflare account `965167b0273f7357cf036e3fffcd825a`, named Expandtalk Corporation AB since 2026-11-18
   (Workers Free; set as `account_id` in wrangler.toml). `npx wrangler login` with that account's login.
   DPA: incorporated in the Self-Serve Subscription Agreement; PDF copies kept outside the repo (TIA §4).
2. Generate a key: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
3. Supabase FIRST: `supabase secrets set GEO_SIGNING_KEY=<key>`. Until the Worker has the same key,
   functions ignore tokens (time zone fallback) — nothing breaks.
4. Worker: `cd workers/geo-edge && npx wrangler secret put GEO_SIGNING_KEY` (same key) → `npx wrangler deploy`.
   Type the key at the prompt; never pipe it from PowerShell 5.1 (`$key | wrangler secret put` stores a
   trailing CRLF, the HMACs never match and geo-check silently returns `country: null`).
5. Record the printed origin in workers/geo-edge/ENDPOINT (no trailing slash, no newline) and commit.
   Done 2026-11-18: workers.dev subdomain `cortiq` (registered via API — "geo-edge" was taken),
   origin `https://cortiq-geo.cortiq.workers.dev`.

## 2. Rotating the key
Same order: Supabase, then Worker, within a few minutes. During the gap geo_source is 'timezone'
and rate-limit keys fall back to 'unknown' for Worker traffic (Review Focus 2) — keep it short.

## 3. Deploy order for phase 2
1. `supabase db push --remote --yes` (20261203000001, 20261203000002).
2. `supabase functions deploy track-event visitor-identification store-consent aggregate-hit ai-bot-tracker canary-tracker geo-check geo-analyze server-hit` (geo-analyze imports `_shared/bot-detection.ts`).
3. Worker deployed (section 1). Smoke test:
   `curl -s https://<ENDPOINT>/geo-check` → `{"country":"SE","region":null,"in_scope":true}` from Sweden.
4. **Legal gate (section 5) approved** → `npm run build`, dist FTP (Daniel), WP plugin 5.5.16 release.

## 4. Verification (after 48 h of traffic on 5.5.16)
```sql
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
```
A share below 98 % on a site: check whether its CSP blocks the Worker (fallback is silent by design)
or an ad blocker list includes workers.dev.

## 5. Legal gate (before release)
1. `jurist` agent reviews: Cloudflare, Inc. as a CortIQ subprocessor (transit of IP + country,
   no storage by CortIQ; Cloudflare's DPA and SCCs / EU-US DPF), the purpose (jurisdiction rules
   and country reports), and the privacy-policy and DPA wording.
   Result: docs/legal/2026-11-geo-worker-review.md (reviewed_agent) — its "Krävs före release" checklist
   is part of this gate: customer notice (30 days, 14 days to object) or per-site opt-in, Cloudflare account
   owned by Expandtalk Corporation AB with the DPA acceptance recorded, observability off in the dashboard,
   a TIA for Cloudflare, and outside counsel before the US/UK/Québec/BR rules go live.
   Gate status 2026-11-18:
   - Customer notice: not sent, none needed. Expandtalk Corporation AB is the only controller: read-only check
     2026-11-18 found 7 auth users, of which only one (Expandtalk) owns sites, and all 7 sites belong to
     Expandtalk Corporation AB (confirmed by Daniel); the other 6 accounts are test accounts with no sites.
     Re-check before the first external customer — from then on, a subprocessor change needs the notice.
   - Account renamed and DPA recorded (section 1); Workers Logs/Traces off, no Logpush (checked 2026-11-18);
     TIA §4 complete (DPF listing checked 2026-11-18).
   - Expandtalk's own sites' privacy policies name Cloudflare (Art. 13.1 e–f): ____
2. Update the DPA subprocessor list (next DPA version) and the privacy policy page; copy rules in CLAUDE.md apply.
3. Daniel approves → status approved_internal. Record date and DPA version here.
   - Approved: ____ (date) · DPA version: ____
4. Only then release (section 3 step 4).

## 6. Volume
Free plan: 100,000 requests/day across all sites. Over quota → Cloudflare error without CORS → scripts
fall back to direct (no data loss, geo_source 'timezone'). Watch: Cloudflare dashboard → Workers → cortiq-geo → Metrics.
Upgrade to Workers Paid ($5/month, 10 M requests) when daily requests pass ~70,000.

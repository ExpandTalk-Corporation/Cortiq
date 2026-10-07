# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in CortIQ, please report it responsibly.

**Do not open a public GitHub issue for security vulnerabilities.**

Contact:

- **Email:** info@expandtalk.se
- **LinkedIn:** https://www.linkedin.com/in/larssondaniel

Include a description of the vulnerability, steps to reproduce, and potential impact. You will receive a response within 48 hours.

## Scope

| Area | In scope |
|---|---|
| Row Level Security bypass | ✅ |
| Edge Function injection | ✅ |
| Auth / session vulnerabilities | ✅ |
| Tracking script XSS | ✅ |
| Exposed credentials in code | ✅ |
| Third-party dependencies | ❌ Report upstream |

## Security design

- All database tables have Row Level Security enabled
- Secrets are loaded via `Deno.env.get()` in Edge Functions — never hardcoded
- The anon/publishable key is browser-safe by design; data access is controlled by RLS
- Public tracking endpoints validate input and apply rate limiting
- `.env` files are excluded from version control via `.gitignore`

## Security hardening — 2026-07 review

A six-perspective security & privacy review (conducted with Anthropic's Claude Fable)
hardened the platform across the data, agentic and privacy layers:

**Cross-tenant isolation**
- Closed anonymous read/write holes on visitor tables (`visitor_session_links`,
  `visitor_events`) that previously used `FOR ALL … USING(true)`; now service-role
  writes with owner-scoped reads.
- Swept remaining permissive `WITH CHECK (true)` INSERT policies on server-written
  analytics tables so the public anon key can no longer inject rows via PostgREST.

**Public ingest endpoints (service-role backed)**
- `ai-bot-tracker`, `record-conversion`, `store-consent`: added site-existence
  validation and per-site rate limiting; bot user-agent is now read from the request
  header (not the forgeable request body).
- `store-consent` no longer returns internal error stacks and derives `consent_given`
  from the actual choices.

**SSRF & server-side fetches**
- `form-detector` and `geo-analyze` block private / loopback / link-local / cloud-metadata
  targets, restrict to http(s), follow no redirects into private space, and cap response
  size with a timeout.
- `geo-analyze` verifies the caller owns the site before running any (paid) audit.

**Privacy / GDPR**
- Consent is now verified **server-side** before click IDs are stored (the client flag is
  no longer trusted); the consent banner writes an authoritative server-side ledger.
- Data-retention automation covers the sensitive tables (conversion events, visitor
  profiles, form data); session-replay text masking is on by default.

**Dependencies**
- All known Dependabot advisories resolved (Vite upgraded within the supported range,
  transitive `esbuild` / `js-yaml` / `uuid` patched via overrides). `npm audit`: 0.

Secrets note: tenant BYOK API keys are stored service-role-only; a follow-up item is to
encrypt them at rest with Supabase Vault / pgsodium.

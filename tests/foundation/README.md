# Foundation regression tests

Run `npm ci` and `npm run test:foundation` with Node.js 22 or newer.

These tests require no production credentials, network API calls or running database:

- `analytics-summary.test.mjs` executes the new migration and SQL assertions in an ephemeral PGlite PostgreSQL instance. It verifies 1,000 pageviews across 10 URLs, exclusions, an empty period, session metrics and the function's ownership/execute checks. The fixture is deliberately minimal; this does not test all migrations or the production schema.
- `insight-access.test.mjs` executes the actual Edge Function handler, transpiled using the project's TypeScript dependency. Supabase and the AI provider are mocked. It tests HTTP validation, authentication, site lookup and that rejected requests cannot reach privileged operations. Production RLS must still be verified separately.
- `tracking-consent.test.mjs` executes the actual tracking script in a simulated browser using Node's VM. It tests storage, requests, API calls, navigation, repeated grants, revocation, late identification responses and Cookiebot decline. These are not real-browser end-to-end tests and do not cover other tracking bundles or the full consent banner/server ledger.
- `version-sync.test.mjs` checks that the WordPress plugin and `spa-tracking.js` declare one shared version (plugin header, `CORTIQ_VERSION`, readme Stable tag, `src/lib/plugin-version.ts`, tracker), that the served plugin zip matches `wordpress-plugin/`, and runs the plugin banner's inline script against a stub DOM to verify it writes the `expiresAt` the tracker requires.

The dedicated GitHub Actions workflow runs the same command on pull requests and main. It does not replace the remaining repository-wide typecheck, lint and browser-test work.

## Behaviour change to review before deployment

`spa-tracking.js` now requires analytics consent for client tracking in both normal and cookieless configurations. `requireConsent: false` no longer bypasses this. Cookieless still suppresses persistent tracking IDs and visitor identification. A separately assessed server-only baseline is not implemented by this change.

Requests sent before withdrawal cannot be recalled. The tracker blocks subsequent requests and discards late identification results. Server-side checks now cover consent-check, record-conversion and the Google Ads export queue; other ingestion endpoints and deletion of historical data remain separate work.

## Additional verification on 2026-09-17

All 56 tests pass. `server-consent.test.mjs` checks missing, expired and withdrawn consent, malformed flags, ledger failures, origin mismatch, conversion minimization and rechecking consent before Google export. `site-cookie-banner.test.mjs` checks restoration and expiry in the React banner. The insight tests also cover aggregate totals, explicitly limited form samples, provider errors and failed recommendation writes.

For a manual browser check, run `node tests/foundation/browser-smoke-server.mjs` and open http://127.0.0.1:8097. This fixture serves the actual standalone banner and tracker with mocked APIs, without production credentials. Verify no tracking before consent, grant, reopening settings, withdrawal and a probe after withdrawal. This sequence passed in the in-app browser: tracking requests stayed at 5 through reopening, withdrawal and the subsequent probe; visitor identity and stored session were cleared. Consent controls themselves did not generate tracking events.

This is not a production end-to-end check. The React banner's server journal integration, third-party CMP adapters, all tracking bundles, production RLS and the complete migration history are not covered. A successful Vite build does not establish that the repository-wide TypeScript check passes.

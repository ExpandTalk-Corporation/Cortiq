# Tracking Check — live verification (2026-10-13)

## Browserless contract (plan Task 1)
`scripts/tracking-check/browserless-smoke.mjs` against production-sfo: HTTP 200, response wrapped as `{ data, type }` (handled by `runBrowserProbe`), `createBrowserContext` available, CDP `Network.getAllCookies`, `evaluateOnNewDocument` and `page.authenticate` work.

## Region
From production-sfo (US), paligo.net's CookieYes showed no banner and pushed a consent `update` to granted before any choice (geo-targeting), so analytics and marketing tags loaded immediately. From production-lon and production-ams the banner appears and the adapter works. Default is now production-ams (EU).

## CMP adapters (plan Task 10, Step 7) — run from production-ams
| CMP | Site | none | reject | accept | analytics_only | marketing_only |
|---|---|---|---|---|---|---|
| CookieYes | https://paligo.net/ | not_needed | adapter | adapter | not run | not run |
| Cookiebot | https://www.cookiebot.com/ | not_needed | adapter | adapter | adapter | adapter |
| OneTrust | https://www.onetrust.com/ | not_needed | adapter | adapter | not_automated | not_automated |
| Complianz | https://complianz.io/ | not_needed | adapter | adapter | not_automated | not_automated |
| Own React banner (text fallback) | https://cortiq.se/ | not_needed | text | text | not_automated | not_automated |
| Dynamicweb (text fallback) | https://www.pretec.se/ | not_needed | text | text | not_automated | not_automated |

CookieYes granular states were run from production-sfo only (no banner there), so they are unverified; the adapter does not support them by design.

## Observations
- pretec.se: Extellio (cdn.extellio.com) sends requests in `none` and `reject` without cookies; sets `extellio_id.*`/`extellio_ses.*` only after accept. GA4 `G-6J9DFZLXNL` loads only after accept. No Google Ads requests were seen.
- cookiebot.com: with only Statistics accepted, only GA4 ran; marketing tools ran only with Marketing accepted.
- The CortIQ WordPress-plugin banner (`#crtq-consent-banner`) is not used on cortiq.se, which runs the React `SiteCookieBanner`; the adapter for the plugin banner is still unverified on a live site.

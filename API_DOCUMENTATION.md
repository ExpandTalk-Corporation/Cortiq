# CortIQ Public REST API

Read-only REST API for CortIQ analytics data, served by the `public-api` Supabase Edge Function
(`supabase/functions/public-api/index.ts`). The OpenAPI spec is in
[`public/api-docs/swagger.json`](./public/api-docs/swagger.json) and rendered at
[https://cortiq.se/api-docs/](https://cortiq.se/api-docs/). Landing page: [https://cortiq.se/api/](https://cortiq.se/api/).

## Base URL

```
https://cxmkdtgfocgbfizawlwa.supabase.co/functions/v1/public-api
```

`https://cortiq.se/api/v1/...` is **not** routed to the API (cortiq.se serves the SPA). Always call the
Supabase function URL. For backwards compatibility the function also accepts a legacy `/api/v1` prefix
after the function name (`.../public-api/api/v1/sites`), but the documented paths below are canonical.

## Authentication

Every request needs a CortIQ API key as a Bearer token:

```
Authorization: Bearer ck_live_your_api_key_here
```

- No Supabase `apikey` header or JWT is needed (`verify_jwt = false` for this function).
- Keys are stored only as a SHA-256 hash (`api_keys.key_hash`).
- Each key is scoped to **one site** (`api_keys.site_id`). Requests for any other site return 404.
- Keys with `is_active = false` or a past `expires_at` are rejected with 401.
- Create keys in the dashboard: Settings → CortIQ API & MCP. The full key is shown once at creation.

## Endpoints

All endpoints are `GET`. Other methods return 405.

| Path | Returns | Source table |
|---|---|---|
| `/sites` | Array with the one site the key is scoped to (`id, domain, name, created_at, is_active`) | `sites` |
| `/sites/{id}/visits` | Sessions, newest first, filtered on `started_at`. IP and raw user agent are not returned. | `tracking_sessions` |
| `/sites/{id}/pages` | Page views, newest first, filtered on `viewed_at` | `page_views` |
| `/sites/{id}/referrers` | `[{ domain, visits }]`: sessions with a referrer, grouped by referrer hostname, sorted by count | `tracking_sessions` |
| `/sites/{id}/agents` | AI agent sessions (agentic browsers), filtered on `started_at`. Device fingerprint is not returned. | `ai_agent_sessions` |
| `/sites/{id}/conversions` | Conversion events, filtered on `created_at`. Form data and hashed email are not returned. | `conversion_events` |
| `/sites/{id}/heatmaps` | Click/scroll heatmap points, filtered on `created_at`. IP is not returned. | `heatmap_data` |

Field lists per endpoint are in the OpenAPI spec.

## Query parameters

| Parameter | Applies to | Description | Default |
|---|---|---|---|
| `date_from` | all `/sites/{id}/*` | Start of range, ISO 8601 date or date-time, inclusive | 30 days ago |
| `date_to` | all `/sites/{id}/*` | End of range, ISO 8601 date or date-time, inclusive | now |
| `limit` | all except `referrers` | Rows to return, clamped to 1–1000 | 1000 |
| `offset` | all except `referrers` | Rows to skip (pagination) | 0 |
| `page_url` | `heatmaps` | Exact page URL filter | none |
| `format` | all | `json` or `csv` | `json` |

`referrers` has no pagination; it aggregates over the 1,000 most recent sessions with a referrer in the range.

## Examples

```bash
BASE=https://cxmkdtgfocgbfizawlwa.supabase.co/functions/v1/public-api

# The site this key can read
curl "$BASE/sites" -H "Authorization: Bearer ck_live_your_api_key_here"

# Sessions in January
curl "$BASE/sites/YOUR_SITE_ID/visits?date_from=2026-01-01&date_to=2026-01-31" \
  -H "Authorization: Bearer ck_live_your_api_key_here"

# Page views as CSV, second page of 1,000
curl "$BASE/sites/YOUR_SITE_ID/pages?format=csv&offset=1000" \
  -H "Authorization: Bearer ck_live_your_api_key_here" -o pageviews.csv

# AI agent sessions
curl "$BASE/sites/YOUR_SITE_ID/agents?date_from=2026-01-01" \
  -H "Authorization: Bearer ck_live_your_api_key_here"
```

Referrers response:

```json
[
  { "domain": "www.google.com", "visits": 1250 },
  { "domain": "chatgpt.com", "visits": 310 }
]
```

## Rate limiting

- Default **1,000 requests per rolling hour per key** (`api_keys.rate_limit`, default 1000).
- Only successful (200) requests are logged in `api_key_usage` and counted.
- Every successful response includes `X-RateLimit-Limit` and `X-Response-Time` (ms). No
  `X-RateLimit-Remaining` or reset header is sent.
- When exceeded: `429` with `Retry-After: 3600` and

```json
{ "error": "Rate limit exceeded", "retry_after": 3600 }
```

## Response formats

- JSON (default): an array of rows.
- CSV (`format=csv`): header row from the first row's keys, served with
  `Content-Disposition: attachment`. An empty result returns an empty body.

## Errors

| Status | Body | Cause |
|---|---|---|
| 401 | `{"error":"Invalid or missing API key"}` | Missing/unknown/inactive/expired key |
| 404 | `{"error":"Site not found or access denied"}` | Site ID is not the key's site |
| 404 | `{"error":"Unknown resource: <name>"}` | Unknown resource under `/sites/{id}/` |
| 404 | `{"error":"Invalid API endpoint"}` | Any other path |
| 405 | `{"error":"Method not allowed"}` | Non-GET request |
| 429 | `{"error":"Rate limit exceeded","retry_after":3600}` | Rate limit reached |
| 500 | `{"error":"Internal server error","message":"..."}` | Database or server error |

## Data collection context

The API returns what the tracker collected. Visitor analytics (sessions, page views, heatmaps,
conversions) are collected only after the visitor gives analytics consent, in both Cookieless and
Full mode. Consent is valid for 12 months. Only the AI-bot/security layer runs without consent; the
site operator makes the final legal assessment of that processing.

## Agentic layer (MCP)

AI agents can query the same data through the MCP server at
`https://cxmkdtgfocgbfizawlwa.supabase.co/functions/v1/mcp-server` with the same API key. It exposes
23 read-only tools (`supabase/functions/mcp-server/index.ts`).

## SDKs

There are no official SDKs. Use plain HTTP.

## Support

support@cortiq.se

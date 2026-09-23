# CortIQ — Tracking Integration Guide

## Quick Start

### 1. Run the setup script

Create your company records and generate API keys. Set the required environment variables first:

```bash
export VITE_SUPABASE_URL="https://[YOUR_PROJECT_REF].supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
npx tsx src/scripts/setup-companies.ts
```

You will receive:
- **Company ID** (UUID)
- **API Key** (one per site)

### 2. Add the tracking script

Place the snippet before `</body>` on every page:

```html
<script
  src="https://cortiq.se/spa-tracking.js"
  data-site-id="[YOUR_COMPANY_ID]"
  data-api-key="[YOUR_API_KEY]"
  defer
></script>
```

Page views are tracked automatically. No additional calls required for standard navigation.

---

## Platform Examples

### Standard website (MPA)

```html
<!-- Place in <head> or before </body> -->
<script>
  window.wfaConfig = {
    companyId: '[YOUR_COMPANY_ID]',
    apiKey: '[YOUR_API_KEY]',
    apiUrl: 'https://[YOUR_PROJECT_REF].supabase.co/functions/v1',
    contentType: 'page',
    platform: 'my-site'
  };
</script>
<script src="https://cortiq.se/spa-tracking.js"></script>
```

**Track specific elements:**
```html
<!-- Track button clicks -->
<button data-wfa-track data-wfa-event="click" data-wfa-content-id="cta-button">
  Contact us
</button>

<!-- Track form submissions as conversions -->
<form data-wfa-conversion data-wfa-content-id="contact-form">
  <input type="email" required>
  <button type="submit">Submit</button>
</form>
```

---

### React / Vue / Next.js SPA

CortIQ captures SPA navigation automatically via History API (`pushState` / `replaceState` / `popstate`). No extra calls needed for page view tracking.

```html
<script
  src="https://cortiq.se/spa-tracking.js"
  data-site-id="[YOUR_COMPANY_ID]"
  data-api-key="[YOUR_API_KEY]"
  defer
></script>
```

**Conversion events via postMessage** (for SPAs that submit via `fetch` rather than native form submit):

```js
// Successful form submission
window.postMessage({
  type: 'cortiq:formSubmit',
  formId: form.id,
  tenantId: company.id
}, '*');

// User login
window.postMessage({ type: 'cortiq:login' }, '*');

// New lead created
window.postMessage({
  type: 'cortiq:leadCreated',
  tenantId: company.id
}, '*');
```

| `type` | Conversion type | Extra fields |
|--------|----------------|--------------|
| `cortiq:formSubmit` | `form_submit` | `formId`, `tenantId` |
| `cortiq:login` | `login` | `tenantId` (optional) |
| `cortiq:leadCreated` | `lead_created` | `tenantId` |

Legacy values without namespace (`formSubmit`, `login`, `leadCreated`) are also accepted for backwards compatibility.

---

### SaaS app with authenticated routes

For apps with a public marketing section and a protected `/admin` area:

```html
<script
  src="https://cortiq.se/spa-tracking.js"
  data-site-id="[YOUR_SITE_ID]"
  data-api-key="[YOUR_API_KEY]"
  data-exclude-iframes="true"
  data-exclude-paths="/embed/"
  data-auth-path="/admin"
  defer>
</script>
```

- `data-exclude-iframes="true"` — stops all tracking when the script runs inside an iframe.
- `data-exclude-paths="/embed/"` — skips tracking if the URL path starts with `/embed/`, even outside an iframe.
- `data-auth-path="/admin"` — traffic under this prefix is tagged `traffic_segment: "authenticated"`, everything else `"public"`. Lets you filter product usage from marketing traffic in the dashboard.

**Track tenant dimension** (optional — for multi-tenant apps):

```js
// Run in React context once currentCompany is known
const n = window.CortIQ.getNonce();
window.CortIQ.track('identify', window.location.pathname, {
  tenant_id: currentCompany.id
}, n);
```

Or set it statically if the installation always belongs to one tenant:
```html
<script ... data-tenant-id="[TENANT_UUID]" defer></script>
```

---

### Content / AI platform

Track AI-generated content views and conversions:

```javascript
async function trackGeneratedContent(contentId, contentType, platform) {
  const response = await fetch(
    'https://[YOUR_PROJECT_REF].supabase.co/functions/v1/track-event',
    {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer [YOUR_API_KEY]',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        company_id: '[YOUR_COMPANY_ID]',
        content_type: contentType, // 'image' | 'form' | 'event' | 'survey' | 'chatbot'
        content_id: contentId,
        event_type: 'view',        // 'view' | 'click' | 'conversion' | 'submission'
        platform: platform,        // 'instagram' | 'youtube' | 'tiktok' | etc.
        session_id: WFATracker.getSessionId(),
        metadata: {
          device_type: 'desktop',
          referrer: document.referrer
        }
      })
    }
  );
  return response.json();
}
```

Retrieve analytics for a content item:

```javascript
async function getContentAnalytics(contentId) {
  const response = await fetch(
    `https://[YOUR_PROJECT_REF].supabase.co/functions/v1/analytics-content/[COMPANY_ID]/${contentId}?from=2024-01-01&to=2024-12-31`,
    { headers: { 'Authorization': 'Bearer [API_KEY]' } }
  );
  return response.json();
  // Returns: { content_id, content_type, metrics: { total_views, total_clicks, ctr, ... }, timeline, top_platforms }
}
```

---

## Astro

### Standard MPA (default)

Astro does full page loads — the script re-initialises on every page. Add it to your base layout:

```astro
<!-- src/layouts/BaseLayout.astro -->
<head>
  <script
    is:inline
    src="https://cortiq.se/spa-tracking.js"
    data-site-id="[SITE_ID]"
    data-api-key="[API_KEY]"
    defer
  ></script>
</head>
```

`is:inline` is required for external tracking scripts — it prevents Vite from trying to bundle the URL.

### Astro with View Transitions

When `<ViewTransitions />` is active, Astro uses `history.pushState` internally. CortIQ captures these automatically.

Add an `astro:page-load` listener as a complement for edge cases where Astro replaces `<body>`:

```astro
<head>
  <script
    is:inline
    src="https://cortiq.se/spa-tracking.js"
    data-site-id="[SITE_ID]"
    data-api-key="[API_KEY]"
    defer
  ></script>
  <script is:inline>
    document.addEventListener('astro:page-load', () => {
      if (window.CortIQ) {
        const n = window.CortIQ.getNonce();
        window.CortIQ.trackView(n);
      }
    });
  </script>
</head>
```

### Astro SSR on Cloudflare Pages

The tracking script runs entirely client-side — where Astro serves HTML (Node, Deno, Cloudflare Workers) does not affect CortIQ. Installation is identical to standard MPA above.

---

## Script data attributes

| Attribute | Type | Description |
|-----------|------|-------------|
| `data-site-id` | UUID | **Required.** Identifies the site in CortIQ. |
| `data-api-key` | string | API key for authenticating against Edge Functions. |
| `data-exclude-iframes` | `"true"` | Stops all tracking when the script runs inside an iframe. |
| `data-exclude-paths` | comma-separated | Path prefixes to ignore. Example: `"/embed/,/preview/"`. Matched with `startsWith`. |
| `data-auth-path` | string | Path prefix for authenticated mode. Default: `/admin`. |
| `data-tenant-id` | UUID | Static tenant dimension — attached to all events. |

---

## Platform & data-source integrations

Beyond the tracking script, CortIQ connects to the measurement and attribution tools you already run. Every connector is configured in-app under **Settings → Integrations** — no code changes on your site. OAuth tokens and API credentials are held as server-side secrets and never touch the browser.

### Google Search Console
Connect via Google OAuth to pull search visibility into CortIQ — impressions, clicks, average position and query-level data — plus an **AI-search view** that shows how your content performs for AI-driven queries. Powers the GSC visibility and AI-performance sections of the dashboard.

### Google Analytics 4 (server-side)
A server-side GA4 connection for teams keeping GA4 alongside CortIQ. Imports traffic sources, search terms, segments and conversions, and can sync conversions back to GA4 — so you keep familiar GA4 reporting while adding consent-gated first-party and AI-agent analytics on top. Google Site Kit data is also supported.

### Google Tag Manager & Consent Mode v2
Deploy the tracking script through GTM, and propagate consent state to Google via **Consent Mode v2** so Google tags respect the same consent signal as CortIQ.

### Google Ads — Enhanced Conversions
Closes the attribution loop: CRM-qualified lead quality flows back to Google Ads via the Conversion Adjustments API. Emails are SHA-256 hashed before upload, and uploads run only for sessions with marketing consent.

### HubSpot
A setup wizard connects HubSpot CRM. Lead-quality changes arrive by webhook (HMAC-verified), are hashed immediately, and feed both the Google Ads Enhanced Conversions loop and the Attribution Gap dashboard.

### Data warehouse
Scheduled export to BigQuery, Snowflake, Redshift, PostgreSQL and MySQL for teams that model analytics downstream — see the [Data Warehouse guide](./DATA_WAREHOUSE_GUIDE.md).

### Other channels
TikTok and additional paid-channel connectors live under the same Integrations tab; the dashboard shows the current list.

---

## Privacy & GDPR

Without consent, only the **AI-bot / security layer** runs: AI bot & agent detection, crawler classification (training / agentic / citation), bot probe, honeypot, canary, AI-search/citation detection, and server-side bot classification from Cloudflare edge logs (`cloudflare-ingest`). It is designed to run as strictly necessary security processing; the site operator makes the final legal assessment.

**All visitor analytics are consent-gated in both modes**:

| Data | Default | Legal basis |
|------|---------|-------------|
| AI-bot / security layer | On | Designed as strictly necessary security processing (operator's assessment) |
| Page views, sessions | Requires analytics consent | Art. 6.1.a GDPR / ePrivacy Art. 5.3 (consent) |
| Clicks, scroll depth, heatmaps, session replay, A/B tests | Requires analytics consent | Art. 6.1.a / ePrivacy Art. 5.3 |
| Conversions, e-commerce & form analytics | Requires analytics consent | Art. 6.1.a / ePrivacy Art. 5.3 |
| Marketing click IDs (gclid, fbclid, …) | Requires marketing consent | Art. 6.1.a |

- **Cookieless mode** — no cookies, no fingerprint, no cross-visit profile, no persistent IDs. Still requires consent.
- **Full mode** — persistent visitor ID and returning-visitor analysis after consent.
- **Consent expiry** — each choice is stored with `expiresAt` and is valid 12 months, then re-asked.

- **IP anonymisation** at ingest — raw IP addresses are never stored.
- **Emails SHA-256 hashed** in the browser before any ad-platform upload — raw PII never reaches CortIQ.
- **Configurable retention** with an automated retention job across sensitive tables.
- **Consent verified server-side**, not just a client flag — the consent banner writes an authoritative server-side ledger for Art. 7(1) proof.

See [consent-banner-strategy](./docs/consent-banner-strategy.md) for banner design and consent-rate guidance.

---

## Rate limits

Per company:
- **10,000 tracking events per hour**
- **1,000 analytics requests per hour**

---

## Debugging

Open browser console to view tracking logs:
```javascript
// Get session ID
console.log(WFATracker.getSessionId());

// Test manual tracking
WFATracker.trackView();
WFATracker.trackClick('test-content');
```

View raw events in the Supabase dashboard under **Table Editor → tracking_events**.

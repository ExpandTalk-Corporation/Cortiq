# CortIQ — Tracking Integration Guide

## Quick Start

### 1. Create a site

Sign in to the CortIQ dashboard and add your site (Settings → Sites, or the onboarding wizard). You get:
- **Site ID** (UUID)
- **Tracking key** (`tk_…`, one per site)

### 2. Add the tracking script

Place the snippet in `<head>` (or before `</body>`) on every page:

This is the snippet the dashboard shows. It sets the configuration and **loads the tracker only after analytics consent**, so the browser makes no request to cortiq.se — and sends it no IP address — before the visitor has chosen. It reads the CortIQ banner, Cookiebot and Google Consent Mode:

```html
<script>
  window.cortiqConfig = {
    siteId: '[YOUR_SITE_ID]',
    apiKey: '[YOUR_TRACKING_KEY]',
    cookieless: true
  };
  (function () {
    var done = false;
    function load() {
      if (done) return;
      done = true;
      var s = document.createElement('script');
      s.src = 'https://cortiq.se/spa-tracking.js';
      s.defer = true;
      document.head.appendChild(s);
    }
    function stored() {
      try {
        var c = JSON.parse(localStorage.getItem('site_cookie_consent') || 'null');
        if (!c || c.analytics !== true) return false;
        var e = typeof c.expiresAt === 'number' ? c.expiresAt : Date.parse(c.expiresAt);
        return !(e <= Date.now());
      } catch (err) { return false; }
    }
    function cookiebot() { return !!(window.Cookiebot && window.Cookiebot.consent && window.Cookiebot.consent.statistics); }
    function consentMode(entry) {
      return !!(entry && entry[0] === 'consent' && entry[1] === 'update' && entry[2] && entry[2].analytics_storage === 'granted');
    }
    var dl = window.dataLayer = window.dataLayer || [];
    if (stored() || cookiebot() || Array.prototype.some.call(dl, consentMode)) load();
    window.addEventListener('siteConsentUpdated', function (e) { if (e.detail && e.detail.analytics) load(); });
    window.addEventListener('CookiebotOnAccept', function () { if (cookiebot()) load(); });
    var push = dl.push;
    dl.push = function () {
      for (var i = 0; i < arguments.length; i++) if (consentMode(arguments[i])) load();
      return push.apply(dl, arguments);
    };
  })();
</script>
```

Using another CMP or Google Tag Manager? Load `https://cortiq.se/spa-tracking.js` (after setting `window.cortiqConfig`) from your CMP's analytics category or a GTM tag with an `analytics_storage` consent trigger. The WordPress plugin serves the tracker from your own site.

A plain tag (`<script src="https://cortiq.se/spa-tracking.js" data-site-id="…" data-api-key="…" defer>`) also works — the script collects nothing before consent — but the browser then requests the file from cortiq.se on every page load, before consent. Whether that is acceptable is your assessment; the loader above avoids it.

AI crawlers that never run JavaScript are measured server-side — see **Server-side agent measurement**.

Page views are tracked automatically. No additional calls required for standard navigation.

---

## Platform Examples

### Standard website (MPA)

```html
<!-- Place in <head> or before </body> -->
<script>
  window.cortiqConfig = {
    siteId: '[YOUR_SITE_ID]',
    apiKey: '[YOUR_TRACKING_KEY]',
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
  data-site-id="[YOUR_SITE_ID]"
  data-api-key="[YOUR_TRACKING_KEY]"
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
  data-api-key="[YOUR_TRACKING_KEY]"
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
    data-api-key="[TRACKING_KEY]"
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
    data-api-key="[TRACKING_KEY]"
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

Each attribute has a `window.cortiqConfig` equivalent (`siteId`, `apiKey`, `apiUrl`, `cookieless`, `excludeIframes`, `excludePaths`, `authPath`, `tenantId`). `data-*` attributes on the tag win when both are set.

| Attribute | Type | Description |
|-----------|------|-------------|
| `data-site-id` | UUID | **Required.** Identifies the site in CortIQ. |
| `data-api-key` | string | Site tracking key (`tk_…`). |
| `data-api-url` | URL | Override the ingest endpoint (default: CortIQ cloud). |
| `data-cookieless` | `"true"` | No visitor identification and no persistent IDs. Still requires consent. |
| `data-exclude-iframes` | `"true"` | Stops all tracking when the script runs inside an iframe. |
| `data-exclude-paths` | comma-separated | Path prefixes to ignore. Example: `"/embed/,/preview/"`. Matched with `startsWith`. |
| `data-auth-path` | string | Path prefix for authenticated mode. Default: `/admin`. |
| `data-tenant-id` | UUID | Static tenant dimension — attached to all events. |

---

## Server-side agent measurement

Most AI training and citation crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended…) never run JavaScript, so the browser script cannot see them. Server-side adapters run on your server or edge and send CortIQ only:

- requests whose User-Agent looks like a bot or AI agent,
- fetches of `/robots.txt`, `/llms.txt`, `/llms-full.txt`,
- hits on a hidden honeypot link (`/cortiq-trap/`) that `robots.txt` disallows.

Human requests are never sent. The IP is truncated (/24 IPv4, /48 IPv6) and the query string dropped before anything leaves your server. Nothing runs in the visitor's browser.

| Stack | Adapter |
|---|---|
| Next.js / Vercel (incl. v0) | `middleware.ts` (Next.js 16: `proxy.ts`) + [`cortiq-server.mjs`](https://cortiq.se/cortiq-server.mjs) |
| Netlify (incl. Lovable/Bolt static exports) | Edge Function + `cortiq-server.mjs` |
| Any site behind Cloudflare | [`cloudflare-worker.js`](https://cortiq.se/cloudflare-worker.js) — also injects the honeypot link and the robots.txt line |
| Node / Express | `app.use(cortiqExpress(createCortiq({ siteKey })))` |
| WordPress | Built into the plugin from 5.5.0 (on by default when the Tracking ID is set) |
| Anything else | `POST /functions/v1/server-hit` (below) |

All adapters authenticate with the site's tracking key (`tk_…`). The dashboard (**Install tracking → Server-side agent measurement**) shows every snippet with the key filled in and whether data has arrived.

### Next.js / Vercel

```ts
// middleware.ts — copy https://cortiq.se/cortiq-server.mjs to lib/cortiq-server.mjs
import { NextResponse, type NextRequest, type NextFetchEvent } from 'next/server';
import { createCortiq } from './lib/cortiq-server.mjs';

const cortiq = createCortiq({ siteKey: process.env.CORTIQ_SITE_KEY });

export function middleware(request: NextRequest, event: NextFetchEvent) {
  const waitUntil = (p: Promise<unknown>) => event.waitUntil(p);
  if (cortiq.isTrap(request)) return cortiq.trapResponse(request, waitUntil);
  cortiq.report(request, { waitUntil });
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
```

### Netlify Edge Function

```ts
// netlify/edge-functions/cortiq.ts
import { createCortiq } from '../../lib/cortiq-server.mjs';

const cortiq = createCortiq({ siteKey: Netlify.env.get('CORTIQ_SITE_KEY') });

export default async (request: Request, context) => {
  const waitUntil = (p: Promise<unknown>) => context.waitUntil(p);
  if (cortiq.isTrap(request)) return cortiq.trapResponse(request, waitUntil);
  const response = await context.next();
  cortiq.report(request, { status: response.status, waitUntil });
  return response;
};

export const config = { path: '/*', excludedPath: ['/*.css', '/*.js', '/*.png', '/*.jpg', '/*.svg', '/*.webp', '/*.woff2'] };
```

### Honeypot link and robots.txt

Cloudflare and WordPress add these automatically. Elsewhere, put the link once in your HTML template and the rule in `robots.txt`:

```html
<a href="/cortiq-trap/" rel="nofollow" tabindex="-1" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden">.</a>
```

```
User-agent: *
Disallow: /cortiq-trap/
```

### HTTP endpoint

```
POST https://[YOUR_PROJECT_REF].supabase.co/functions/v1/server-hit
Authorization: Bearer tk_…
Content-Type: application/json

{"hits":[{"url":"https://example.com/page","userAgent":"Mozilla/5.0 (compatible; GPTBot/1.2)","ip":"203.0.113.0","status":200,"referrer":"https://…"}]}
```

Up to 100 hits per request. Every hit's host must belong to the key's site (other hosts are rejected). Response: `{ accepted, stored, ignored, rejected }`. CortIQ stores AI-registry bots and honeypot visitors (`ai_bot_traffic`, `source = 'server_log'`, `server_signal = request | robots_txt | llms_txt | honeypot`) and discards everything else. The truncated IP is cleared after 30 days.

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

**The browser script does nothing before analytics consent** — in both modes, including in-browser bot/agent detection (bot probe, canary, honeypot). Reading device properties or loading a tracking pixel is device access under ePrivacy Art. 5.3 / LEK 9 kap. 28 § (EDPB Guidelines 2/2023), so it needs consent.

**Server-side agent measurement** reads only the HTTP request your server already receives. It doesn't touch the visitor's device, so in our assessment it is not covered by the cookie consent rule (ePrivacy Art. 5(3)); this is an interpretation that a supervisory authority may not share. The request data (truncated IP, user agent) is still personal data under the GDPR: you need a legal basis (typically legitimate interest, Art. 6(1)(f), with a documented balancing test) and **must** describe it, and the right to object, in your privacy policy. You make the final assessment.

| Data | Default | Legal basis |
|------|---------|-------------|
| Server-side agent measurement (bot/agent requests, robots.txt / llms.txt, honeypot) | On when an adapter is installed | No device access; GDPR basis decided by you (typically Art. 6.1.f) |
| In-browser bot/agent signals | Requires analytics consent | ePrivacy Art. 5.3 (consent) |
| Page views, sessions, AI referrals | Requires analytics consent | Art. 6.1.a GDPR / ePrivacy Art. 5.3 (consent) |
| Clicks, scroll depth, heatmaps, A/B tests | Requires analytics consent | Art. 6.1.a / ePrivacy Art. 5.3 |
| Conversions, e-commerce & form analytics | Requires analytics consent | Art. 6.1.a / ePrivacy Art. 5.3 |
| Marketing click IDs (gclid, fbclid, …) | Requires marketing consent | Art. 6.1.a |

- **Cookieless mode** — no cookies, no fingerprint, no cross-visit profile, no persistent IDs. Still requires consent.
- **Full mode** — persistent visitor ID and returning-visitor analysis after consent.
- **Consent expiry** — each choice is stored with `expiresAt` and is valid 12 months, then re-asked.

- **IP truncation** — server-side adapters truncate before sending, ingest truncates again; truncated IPs on bot records are cleared after 30 days.
- **Emails SHA-256 hashed** in the browser before any ad-platform upload — raw PII never reaches CortIQ.
- **Configurable retention** (default 365 days) with an automated daily retention job across sensitive tables.
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

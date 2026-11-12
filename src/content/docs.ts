import type { ContentPageData } from './types';

// Every statement on these pages was checked against the code on 2026-10-03.
// When behaviour changes, update the page in the same commit.

const MCP_ENDPOINT = 'https://cxmkdtgfocgbfizawlwa.supabase.co/functions/v1/mcp-server';
const API_BASE = 'https://cxmkdtgfocgbfizawlwa.supabase.co/functions/v1';

export const GETTING_STARTED: ContentPageData = {
  path: '/docs/',
  breadcrumb: [{ label: 'Docs', path: '/docs/' }],
  eyebrow: 'Documentation',
  h1: 'Getting started with CortIQ',
  lead: 'Install the tracking script, decide how consent reaches it, and check that data arrives. Most sites are done in a few minutes.',
  sections: [
    {
      id: 'what-you-install',
      heading: 'What you install',
      blocks: [
        { type: 'p', text: 'CortIQ measures in two places:' },
        {
          type: 'list',
          items: [
            '**On your server, for AI crawlers and agents:** a small [server-side adapter](/integrations/server-side/) (Next.js, Vercel, Netlify, Cloudflare, Node, WordPress or plain HTTP) reports bot and agent requests, `robots.txt` / `llms.txt` fetches and honeypot hits. Most AI crawlers never run JavaScript, so this is where they show up. Nothing runs in the visitor\'s browser.',
            '**In the browser, after analytics consent:** one JavaScript file, `cortiq.js` (about 30 KB, 9 KB gzipped), for page views, sessions, AI referrals, clicks, scroll depth, heatmaps, form analytics, conversions and in-browser agent signals. It does nothing before consent.',
          ],
        },
      ],
    },
    {
      id: 'install',
      heading: 'Install the script',
      blocks: [
        {
          type: 'steps',
          items: [
            '[Create an account](/auth) and add your site with a name and its domain.',
            'Open **Install tracking** in the dashboard. It shows the snippet with your Site ID and tracking key filled in.',
            'Paste the snippet into the `<head>` of every page, or into your site template.',
          ],
        },
        {
          type: 'code',
          lang: 'html',
          code: `<script>
  window.cortiqConfig = {
    apiUrl: '${API_BASE}',
    siteId: 'YOUR_SITE_ID',        // required, a UUID
    apiKey: 'YOUR_TRACKING_KEY',   // starts with tk_
    cookieless: true               // optional, see below
  };
</script>
<script src="https://cortiq.se/cortiq.js" defer></script>`,
        },
        { type: 'p', text: 'The script reads its settings from `window.cortiqConfig` or from `data-*` attributes on its own script tag (`data-site-id`, `data-api-key`, `data-cookieless`, `data-exclude-paths`). A `window.cortiqConfig` block must come before the script tag. Without a `siteId` it logs an error to the console and does nothing.' },
        { type: 'p', text: 'This tag always loads the latest version. To load one fixed version that the browser checks against a hash, use a [pinned install with Subresource Integrity](/security/sri/).' },
        { type: 'p', text: 'On WordPress, use the [WordPress plugin](/integrations/wordpress/) instead. It adds the script, a consent banner and Google Consent Mode v2.' },
      ],
    },
    {
      id: 'single-page-apps',
      heading: 'Single-page apps',
      blocks: [
        { type: 'p', text: 'The script hooks into `history.pushState`, `history.replaceState` and the `popstate` event, and records a page view whenever the path changes. This covers React Router, Vue Router, Next.js client navigation and similar routers without extra code.' },
        { type: 'p', text: 'A change to only the query string or the `#hash` is not counted as a new page view.' },
      ],
    },
    {
      id: 'consent',
      heading: 'How consent reaches the script',
      blocks: [
        { type: 'p', text: 'Analytics starts only once the visitor has given analytics (statistics) consent. The script looks for consent in this order:' },
        {
          type: 'steps',
          items: [
            'A `siteConsentUpdated` event dispatched on the current page.',
            '**Cookiebot:** `Cookiebot.consent.statistics` and `Cookiebot.consent.marketing` are read automatically, and the script listens for Cookiebot\'s consent events.',
            'A choice stored by the CortIQ consent banner (the WordPress plugin banner or the [CortIQ CMP](/cmp/)).',
            '**Google Consent Mode v2**, used when none of the above exists: the script reads `analytics_storage`, `ad_storage` and `ad_user_data` from `window.dataLayer` and follows later `consent` updates. CMPs set up for Consent Mode, such as OneTrust, Usercentrics and CookieYes, work without extra code.',
          ],
        },
        { type: 'p', text: 'Consent Mode defaults limited to certain regions are ignored, because the script cannot know the visitor\'s region. If your CMP does not use Consent Mode, dispatch this event from its callback on every page load, after the visitor\'s choice is known:' },
        {
          type: 'code',
          lang: 'js',
          code: `window.dispatchEvent(new CustomEvent('siteConsentUpdated', {
  detail: { analytics: true, marketing: false }
}));`,
        },
        { type: 'p', text: 'A withdrawal (`analytics: false`) stops analytics on the page immediately.' },
        { type: 'p', text: '**Marketing consent** is needed on top of analytics consent for: ad click IDs (`gclid`, `fbclid`, `msclkid`, `ttclid`, `li_fat_id`) and a SHA-256 hash of the email on conversions. The script does no canvas or WebGL fingerprinting.' },
      ],
    },
    {
      id: 'cookieless',
      heading: 'Cookieless mode',
      blocks: [
        { type: 'p', text: 'With `cookieless: true` the script sets no cookies, skips visitor identification and switches off all marketing features (click IDs, email hashing, fingerprinting). After analytics consent it keeps the session ID in sessionStorage until the tab is closed, so a visit lasts across page loads. Add `sessionStorage: false` (or `data-session-storage="false"` on the script tag) to keep it in memory only: the session ID is not stored, and every full page load starts a new visit.' },
        { type: 'note', tone: 'warning', text: 'Cookieless mode still requires analytics consent. It reduces what is stored; it is not a legal basis for tracking without consent.' },
        { type: 'p', text: 'Conversions are not recorded in cookieless mode.' },
      ],
    },
    {
      id: 'verify',
      heading: 'Check that it works',
      blocks: [
        { type: 'p', text: 'There is no automatic installation check yet. To check by hand:' },
        {
          type: 'steps',
          items: [
            'Open your site in a normal browser window and accept analytics in the consent banner.',
            'In the browser\'s developer tools, under Network, look for requests to `track-event` on `supabase.co`. A successful request returns status 200.',
            'Open the CortIQ dashboard and check that the page view appears.',
          ],
        },
        { type: 'p', text: 'No requests at all usually means analytics consent was not detected. Check the consent section above.' },
      ],
    },
    {
      id: 'tag-managers',
      heading: 'Google Tag Manager',
      blocks: [
        {
          type: 'steps',
          items: [
            'In GTM, create a **Custom HTML** tag and paste the whole snippet: the `window.cortiqConfig` block and the script tag.',
            'Trigger it on **All Pages**.',
            'Publish the container.',
          ],
        },
        { type: 'p', text: 'Use the consent trigger your CMP provides (for example analytics_storage granted in Google Consent Mode), so the tag — and with it the request to cortiq.se — only fires after analytics consent. The script itself also waits for analytics consent before collecting anything.' },
        { type: 'p', text: 'Consent Mode support needs tracking script 5.4.3 or later. There is no GTM Community Template yet.' },
      ],
    },
  ],
  related: [
    { label: 'Integrations', path: '/integrations/' },
    { label: 'WordPress plugin', path: '/integrations/wordpress/' },
    { label: 'How CortIQ counts', path: '/docs/metrics/' },
    { label: 'Privacy policy', path: '/privacy/' },
    { label: 'REST API', path: '/api/' },
  ],
};

export const INTEGRATIONS: ContentPageData = {
  path: '/integrations/',
  breadcrumb: [{ label: 'Integrations', path: '/integrations/' }],
  eyebrow: 'Integrations',
  h1: 'Integrations',
  lead: 'Ways to get data into CortIQ and to get it out again. This page lists what works today, and what is still being built.',
  sections: [
    {
      id: 'available',
      heading: 'Available',
      blocks: [
        {
          type: 'list',
          items: [
            '[WordPress plugin](/integrations/wordpress/): tracking script, consent banner (Swedish, English, German, French, Portuguese) and Google Consent Mode v2 in one plugin.',
            '[Server-side agent measurement](/integrations/server-side/): adapters for Next.js / Vercel, Netlify, Cloudflare, Node / Express, WordPress and any server. Classifies crawlers that never run JavaScript.',
            '[Cloudflare Worker](/integrations/cloudflare/): the zero-code option for any site behind Cloudflare, whatever builds or hosts it.',
            '[Google Analytics 4](/integrations/google-analytics/): read-only import of GA4 reports next to CortIQ data.',
            '[MCP server](/integrations/mcp/): let Claude Code and other MCP clients query your analytics.',
            '[REST API](/api/): read-only JSON or CSV endpoints for sessions, pages, referrers, AI agents, conversions and heatmaps.',
            '**Google Search Console:** connect with your Google account in the dashboard (read-only) to see queries, pages, clicks, impressions and position.',
            '**Google Tag Manager:** load the script through a Custom HTML tag. See [Google Tag Manager](/docs/#tag-managers).',
            '**Consent banners:** Cookiebot, and any CMP that sets Google Consent Mode v2 (OneTrust, Usercentrics, CookieYes and others), are read automatically. See [consent](/docs/#consent).',
          ],
        },
      ],
    },
    {
      id: 'in-development',
      heading: 'In development',
      blocks: [
        { type: 'p', text: 'These exist in the codebase but are not ready to recommend. We will publish a page for each when it is.' },
        {
          type: 'list',
          items: [
            '**HubSpot lead quality → Google Ads:** sending lead quality from HubSpot back to Google Ads as conversion adjustments.',
            '**Google Ads campaign import:** campaign cost and conversion data next to CortIQ conversions.',
            '**Server-side conversion signals:** Meta Conversions API and GA4 Measurement Protocol.',
            '**Bing Webmaster Tools** import.',
          ],
        },
        { type: 'p', text: 'Need one of these, or something else? [Tell us](/contact/). It affects what we build next.' },
      ],
    },
  ],
  related: [
    { label: 'Getting started', path: '/docs/' },
    { label: 'All features', path: '/features/' },
  ],
};

export const WORDPRESS: ContentPageData = {
  path: '/integrations/wordpress/',
  breadcrumb: [{ label: 'Integrations', path: '/integrations/' }, { label: 'WordPress', path: '/integrations/wordpress/' }],
  eyebrow: 'Integration',
  h1: 'CortIQ for WordPress',
  lead: 'One plugin adds the CortIQ tracking script, a consent banner and Google Consent Mode v2 to your WordPress site.',
  sections: [
    {
      id: 'what-it-does',
      heading: 'What the plugin does',
      blocks: [
        {
          type: 'list',
          items: [
            'Loads the CortIQ tracking script on every page. Logged-in administrators are not tracked.',
            'Shows a consent banner with necessary, statistics and marketing choices, a close button that saves "necessary only", and a link to reopen the settings.',
            'Stores each consent choice in CortIQ\'s consent log as well as in the browser.',
            'Optionally loads Google Analytics 4 with Google Consent Mode v2.',
            'Banner text in English, Swedish, German, French and Portuguese, or chosen automatically from the site language.',
          ],
        },
      ],
    },
    {
      id: 'install',
      heading: 'Install',
      blocks: [
        {
          type: 'steps',
          items: [
            'Download the plugin: [cortiq-wordpress-plugin.zip](https://cortiq.se/cortiq-wordpress-plugin.zip). It is not in the WordPress.org directory.',
            'In WordPress, go to **Plugins → Add New → Upload Plugin**, choose the zip file and activate it.',
            'Go to **Settings → CortIQ Analytics** and enter the Site ID and Tracking ID from your CortIQ dashboard (**Install tracking**).',
            'Choose a tracking mode and save.',
          ],
        },
        { type: 'p', text: 'Requires WordPress 5.6 or later and PHP 7.4 or later. Tested up to WordPress 6.8.' },
      ],
    },
    {
      id: 'settings',
      heading: 'Settings',
      blocks: [
        {
          type: 'list',
          items: [
            '**Tracking mode:** full (the default) or cookieless. Both modes wait for statistics consent. See [cookieless mode](/docs/#cookieless).',
            '**Geo-gating:** show the banner only to visitors in the EEA, the UK and Switzerland.',
            '**GA4 Measurement ID** and **Consent Mode:** basic or advanced (see below).',
            '**Consent region:** apply Consent Mode defaults to the EEA only, or globally.',
            '**Policy version** and **re-ask cooldown** (1 to 400 days): change the policy version to ask every visitor again.',
            '**Banner language** and **accent colour.**',
          ],
        },
      ],
    },
    {
      id: 'consent-mode',
      heading: 'Google Consent Mode v2',
      blocks: [
        { type: 'p', text: 'When you enter a GA4 Measurement ID, the plugin sets all Consent Mode v2 signals to denied by default (`security_storage` is granted), waits 500 ms for an update, and turns on `ads_data_redaction` and `url_passthrough`. The banner then updates the signals from the visitor\'s choice.' },
        {
          type: 'list',
          items: [
            '**Basic:** GA4 is not loaded until the visitor gives statistics consent.',
            '**Advanced:** GA4 loads at once in denied mode and sends cookieless pings until consent is given.',
          ],
        },
        { type: 'note', tone: 'warning', text: 'If you switch the banner off, GA4 loads without any consent defaults. Keep the banner on, or handle Consent Mode in another plugin.' },
      ],
    },
  ],
  related: [
    { label: 'Getting started', path: '/docs/' },
    { label: 'Consent banner (CMP)', path: '/cmp/' },
    { label: 'Google Analytics 4', path: '/integrations/google-analytics/' },
  ],
};

export const SERVER_SIDE: ContentPageData = {
  path: '/integrations/server-side/',
  breadcrumb: [{ label: 'Integrations', path: '/integrations/' }, { label: 'Server-side', path: '/integrations/server-side/' }],
  eyebrow: 'Integration',
  h1: 'Server-side AI agent measurement',
  lead: 'Most AI training and citation crawlers never run JavaScript, so no browser tag can see them. A small adapter on your server or edge reports them to CortIQ, without touching the visitor\'s device.',
  sections: [
    {
      id: 'why',
      heading: 'Why on the server',
      blocks: [
        { type: 'p', text: 'GPTBot, ClaudeBot, PerplexityBot, Google-Extended and most other crawlers fetch the HTML and leave. They appear in your server logs, not in JavaScript analytics. CortIQ classifies each request as a [training crawler, agentic fetch or citation crawler](/features/ai/) with the same registry the browser script uses.' },
        { type: 'p', text: 'Three signals are reported: requests with a bot or agent user agent, fetches of `/robots.txt`, `/llms.txt` and `/llms-full.txt`, and hits on a hidden honeypot link that `robots.txt` tells crawlers to skip. A honeypot hit means the visitor ignores `robots.txt`, whatever its user agent claims.' },
        { type: 'p', text: 'AI agents that run inside a normal browser and send a standard Chrome user agent cannot be identified from the request alone; the browser script measures those after consent.' },
      ],
    },
    {
      id: 'adapters',
      heading: 'Pick your adapter',
      blocks: [
        {
          type: 'list',
          items: [
            '**Next.js / Vercel (incl. v0 apps):** `middleware.ts` with the dependency-free [cortiq-server.mjs](https://cortiq.se/cortiq-server.mjs) helper.',
            '**Netlify (incl. static exports from Lovable or Bolt):** an Edge Function with the same helper.',
            '**Cloudflare:** the [Worker](/integrations/cloudflare/), for any site behind Cloudflare. It adds the honeypot link and the `robots.txt` line itself.',
            '**Node / Express:** `app.use(cortiqExpress(createCortiq({ siteKey })))` from the helper.',
            '**WordPress:** built into the [plugin](/integrations/wordpress/) from 5.5.0, on by default once the Tracking ID is set.',
            '**Any other server:** POST to the HTTP endpoint below.',
          ],
        },
        { type: 'p', text: 'The dashboard (**Install tracking → Server-side agent measurement**) shows each snippet with your tracking key filled in, and whether server-side data has arrived.' },
        { type: 'code', code: `// Next.js middleware.ts (Next.js 16: proxy.ts, export function proxy)
import { NextResponse, type NextRequest, type NextFetchEvent } from 'next/server';
import { createCortiq } from './lib/cortiq-server.mjs';

const cortiq = createCortiq({ siteKey: process.env.CORTIQ_SITE_KEY });

export function middleware(request: NextRequest, event: NextFetchEvent) {
  const waitUntil = (p: Promise<unknown>) => event.waitUntil(p);
  if (cortiq.isTrap(request)) return cortiq.trapResponse(request, waitUntil);
  cortiq.report(request, { waitUntil });
  return NextResponse.next();
}` },
        { type: 'p', text: 'Honeypot link for your HTML template (Next.js, Netlify, Node, any server), plus `Disallow: /cortiq-trap/` in `robots.txt`:' },
        { type: 'code', code: '<a href="/cortiq-trap/" rel="nofollow" tabindex="-1" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden">.</a>' },
      ],
    },
    {
      id: 'http',
      heading: 'HTTP endpoint',
      blocks: [
        { type: 'p', text: 'Authenticate with the site\'s tracking key (`tk_…`). Every hit\'s host must belong to that site; hits for other hosts are rejected. Up to 100 hits per request.' },
        { type: 'code', code: `POST ${API_BASE}/server-hit
Authorization: Bearer tk_…
Content-Type: application/json

{"hits":[{"url":"https://example.com/page","userAgent":"Mozilla/5.0 (compatible; GPTBot/1.2)","ip":"203.0.113.0","status":200}]}` },
      ],
    },
    {
      id: 'data',
      heading: 'What leaves your server, and what is stored',
      blocks: [
        {
          type: 'list',
          items: [
            'Only agent-like requests, the watched files and honeypot hits are sent. Ordinary human requests stay on your server.',
            'The adapter cuts the IP to its network (/24 for IPv4, /48 for IPv6) and drops the query string before sending.',
            'CortIQ stores AI-registry bots and honeypot visitors: URL path, user agent, referrer, truncated IP and time. Other requests are discarded. The truncated IP is cleared after 30 days; rows follow the site\'s retention (default 365 days).',
          ],
        },
        { type: 'p', text: 'Nothing is stored on the visitor\'s device and no code runs in the browser: the adapter only uses the HTTP request your server already receives. In our assessment this is not storage of, or access to, information on the visitor\'s device under ePrivacy Art. 5(3) (Swedish LEK chapter 9, section 28), so cookie consent is not required for it. This is not settled: the EDPB\'s Guidelines 2/2023 read "gaining access" broadly, including IP addresses and HTTP headers, and a supervisory authority may take a different view. The request data is personal data under the GDPR. As controller you need a legal basis – typically legitimate interest (Art. 6(1)(f)) backed by a documented balancing test – and your privacy policy must state the interest and the visitor\'s right to object (Art. 13 and 21). Public authorities cannot rely on legitimate interest for processing in the performance of their tasks. You make the final assessment for your site. See the [privacy policy](/privacy/).' },
      ],
    },
  ],
  related: [
    { label: 'Cloudflare Worker', path: '/integrations/cloudflare/' },
    { label: 'WordPress plugin', path: '/integrations/wordpress/' },
    { label: 'AI agent analytics', path: '/features/ai/' },
  ],
};

export const CLOUDFLARE: ContentPageData = {
  path: '/integrations/cloudflare/',
  breadcrumb: [{ label: 'Integrations', path: '/integrations/' }, { label: 'Cloudflare', path: '/integrations/cloudflare/' }],
  eyebrow: 'Integration',
  h1: 'Server-side AI crawler tracking with Cloudflare',
  lead: 'For any site behind Cloudflare, whatever builds or hosts it: a paste-ready Worker reports AI crawler traffic to CortIQ, including crawlers that never run JavaScript. No code changes on your site.',
  sections: [
    {
      id: 'setup',
      heading: 'Setup',
      blocks: [
        {
          type: 'steps',
          items: [
            'Make sure your domain is added as a site in CortIQ. Reports for hostnames that don\'t belong to the site are rejected.',
            'In Cloudflare, go to **Workers & Pages → Create Worker**, paste the code from [cloudflare-worker.js](https://cortiq.se/cloudflare-worker.js) and deploy it.',
            'Under the Worker\'s **Settings → Variables**, add `CORTIQ_SITE_KEY` with your site\'s tracking key (`tk_…`, shown under **Install tracking** in the dashboard).',
            'Under **Triggers**, add a route for your domain, for example `example.com/*`, and set its request limit failure mode to **Fail open (proceed)** so your site keeps working if the Workers request quota runs out.',
          ],
        },
      ],
    },
    {
      id: 'how-it-works',
      heading: 'How the Worker behaves',
      blocks: [
        {
          type: 'list',
          items: [
            'It passes every request on to your site and reports in the background, so visitors do not wait for CortIQ.',
            'It reports only requests with a bot or agent user agent, fetches of `robots.txt` / `llms.txt`, and hits on the honeypot link. Human requests never leave Cloudflare.',
            'It adds a hidden honeypot link to HTML pages and `Disallow: /cortiq-trap/` to every group in `robots.txt` (or serves a minimal `robots.txt` if your site has none), and answers the honeypot URL with a 404.',
            'It marks requests to your site so the CortIQ WordPress plugin does not report them a second time.',
            'Each request still runs the Worker, so it counts toward your Cloudflare Workers request quota.',
          ],
        },
        { type: 'p', text: 'Workers set up during the beta with an ingest key (`CORTIQ_INGEST_KEY`) keep working; switch to `CORTIQ_SITE_KEY` with the current Worker code when convenient.' },
      ],
    },
    {
      id: 'data',
      heading: 'What is stored',
      blocks: [
        { type: 'p', text: 'The Worker cuts the IP address to its network (/24 for IPv4, /48 for IPv6) and drops the query string before anything leaves Cloudflare. CortIQ stores AI-registry bots and honeypot visitors (path, user agent, referrer, truncated IP); the truncated IP is cleared after 30 days. Nothing runs in the visitor\'s browser. See [server-side agent measurement](/integrations/server-side/#data) for the legal assessment and the [privacy policy](/privacy/).' },
      ],
    },
  ],
  related: [
    { label: 'Server-side agent measurement', path: '/integrations/server-side/' },
    { label: 'AI agent analytics', path: '/features/ai/' },
    { label: 'Getting started', path: '/docs/' },
  ],
};

export const GOOGLE_ANALYTICS: ContentPageData = {
  path: '/integrations/google-analytics/',
  breadcrumb: [{ label: 'Integrations', path: '/integrations/' }, { label: 'Google Analytics 4', path: '/integrations/google-analytics/' }],
  eyebrow: 'Integration',
  h1: 'Google Analytics 4 in CortIQ',
  lead: 'See your GA4 reports next to CortIQ\'s AI traffic and visitor data. CortIQ reads from GA4 and never writes to it.',
  sections: [
    {
      id: 'connect',
      heading: 'Connect a GA4 property',
      blocks: [
        {
          type: 'steps',
          items: [
            'In the CortIQ dashboard, open the Google Analytics integration and enter your Measurement ID (`G-…`) and your numeric Property ID.',
            'Copy the CortIQ service account email shown there.',
            'In GA4, go to **Admin → Property access management** and add that email with the **Viewer** role.',
          ],
        },
        { type: 'p', text: 'CortIQ uses the GA4 Data API with read-only access. You do not sign in with your Google account, and you can revoke access at any time by removing the service account from the property.' },
      ],
    },
    {
      id: 'reports',
      heading: 'What you get',
      blocks: [
        {
          type: 'list',
          items: [
            'KPI overview by channel, with paid, social and newsletter traffic split out.',
            'AI traffic as GA4 sees it: sessions referred from ChatGPT, Perplexity, Gemini, Copilot, Claude and other AI assistants.',
            'Traffic sources, segments and month-by-month KPIs.',
          ],
        },
        { type: 'p', text: 'GA4 only counts visitors who run its JavaScript and, in most of Europe, gave consent. Comparing it with CortIQ\'s [server-side crawler data](/integrations/server-side/) shows how much AI traffic GA4 never sees.' },
      ],
    },
    {
      id: 'consent-mode',
      heading: 'Loading GA4 with consent',
      blocks: [
        { type: 'p', text: 'This integration only reads reports. If you also want CortIQ to load GA4 on your site with Google Consent Mode v2, use the [WordPress plugin](/integrations/wordpress/#consent-mode). The standalone script and banner do not load GA4.' },
      ],
    },
  ],
  related: [
    { label: 'Integrations', path: '/integrations/' },
    { label: 'WordPress plugin', path: '/integrations/wordpress/' },
  ],
};

export const MCP: ContentPageData = {
  path: '/integrations/mcp/',
  breadcrumb: [{ label: 'Integrations', path: '/integrations/' }, { label: 'MCP server', path: '/integrations/mcp/' }],
  eyebrow: 'Integration',
  h1: 'CortIQ MCP server',
  lead: 'Ask an AI assistant about your analytics. The CortIQ MCP server gives Claude Code and other MCP clients read-only access to one site\'s data through 22 tools.',
  sections: [
    {
      id: 'connect',
      heading: 'Connect',
      blocks: [
        {
          type: 'steps',
          items: [
            'In the CortIQ dashboard, open **CortIQ API & MCP** and create an API key for the site. Keys start with `ck_live_` and are shown once.',
            'Add the server to your MCP client. For Claude Code:',
          ],
        },
        {
          type: 'code',
          lang: 'bash',
          code: `claude mcp add cortiq-analytics \\
  --transport http \\
  ${MCP_ENDPOINT} \\
  --header "Authorization: Bearer ck_live_YOUR_KEY"`,
        },
        { type: 'p', text: 'Use the API key (`ck_live_…`), not the site\'s tracking key (`tk_…`). The tracking key is public, because it sits in your site\'s HTML, and it does not work here.' },
        { type: 'p', text: 'Clients that cannot send custom headers to a remote server, such as Claude Desktop, can connect through the [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) proxy (requires Node.js). In `claude_desktop_config.json`:' },
        {
          type: 'code',
          lang: 'json',
          code: `{
  "mcpServers": {
    "cortiq-analytics": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "${MCP_ENDPOINT}",
        "--header",
        "Authorization:\${AUTH_HEADER}"
      ],
      "env": { "AUTH_HEADER": "Bearer ck_live_YOUR_KEY" }
    }
  }
}`,
        },
        { type: 'p', text: 'There is no space after `Authorization:` because some clients on Windows split arguments at spaces; the `mcp-remote` documentation recommends this form. We document Claude Code and this configuration; we have not tested every client.' },
      ],
    },
    {
      id: 'tools',
      heading: 'Tools',
      blocks: [
        {
          type: 'list',
          items: [
            '**Site and schema:** `cortiq_list_sites`, `cortiq_describe_schema`.',
            '**Traffic:** `cortiq_sessions_summary`, `cortiq_daily_visitors`, `cortiq_bounce_rate`, `cortiq_top_pages`, `cortiq_top_sources`, `cortiq_top_entry_pages`, `cortiq_top_exit_pages`, `cortiq_pageviews_by_device`.',
            '**Engagement:** `cortiq_avg_engagement_time`, `cortiq_click_counts`, `cortiq_heatmap_grid`, `cortiq_top_rage_clicks`, `cortiq_top_outbound`, `cortiq_web_vitals`, `cortiq_form_analytics`, `cortiq_funnel_completion`.',
            '**AI traffic:** `cortiq_ai_agent_traffic`, `cortiq_ai_bot_analysis`, `cortiq_ai_agent_journey`, `cortiq_ai_vs_human`.',
          ],
        },
        { type: 'p', text: 'Every tool only reads data. There are no tools that write, delete or change settings.' },
        { type: 'p', text: 'The tools read the site\'s consented visitor analytics and its server-side AI agent data. Aggregate measurement counts are not available through the MCP server or the REST API.' },
      ],
    },
    {
      id: 'parameters',
      heading: 'Tool parameters',
      blocks: [
        {
          type: 'list',
          items: [
            '`since` and `until`: ISO dates (`2026-11-01`). Every tool except `cortiq_list_sites` and `cortiq_describe_schema` accepts them. Without them, a tool covers the last 7 days up to and including today. `until` is exclusive: `since=2026-11-01&until=2026-11-08` covers 1–7 November.',
            '`limit`: the number of rows in ranked lists. The default depends on the tool: 10 to 50, most often 15.',
            '`url_prefix`: limits `cortiq_top_pages`, `cortiq_avg_engagement_time` and `cortiq_click_counts` to URLs that start with the prefix.',
            '`cortiq_heatmap_grid` requires `url` (matched as a prefix) and accepts `device_type`: `mobile`, `tablet` or `desktop`.',
          ],
        },
        { type: 'p', text: '`tools/list` returns the full input schema for every tool.' },
      ],
    },
    {
      id: 'access',
      heading: 'Access and limits',
      blocks: [
        {
          type: 'list',
          items: [
            'Each key reads exactly one site. Create one key per site.',
            'The same key works for the MCP server and the [REST API](/api/).',
            'Keys are stored as SHA-256 hashes. You can disable or delete a key at any time.',
            'Rate limit per key, 1,000 requests per hour by default. You can change it when you create the key. Every authenticated MCP request counts, including `initialize` and `tools/list`, over a rolling hour shared with REST API calls made with the same key.',
            'Each request is logged with the method, response time, IP address and user agent. The IP address and user agent are cleared after 90 days; the rest of the log is deleted together with the key.',
          ],
        },
      ],
    },
    {
      id: 'errors',
      heading: 'Errors',
      blocks: [
        {
          type: 'list',
          items: [
            '`-32001` with HTTP 401: the key is missing, malformed, disabled or deleted.',
            '`-32002` with HTTP 429: the key has used its hourly limit. Wait, or raise the limit on a new key.',
            '`-32700`: the body is not valid JSON (HTTP 400), or the request is not a POST (HTTP 405).',
            '`-32601`: unknown JSON-RPC method. `-32602`: missing or unknown tool name.',
            '`-32603`: internal error.',
          ],
        },
        { type: 'p', text: 'A tool that is called without a required argument answers normally with an `error` field in its result, for example `cortiq_heatmap_grid` without `url`.' },
      ],
    },
    {
      id: 'protocol',
      heading: 'Protocol details',
      blocks: [
        { type: 'p', text: 'The server speaks JSON-RPC 2.0 over HTTP POST, with one JSON response per request. It reports MCP protocol version `2024-11-05` and supports `initialize`, `ping`, `tools/list` and `tools/call`. It does not stream (no SSE) and offers no resources or prompts.' },
      ],
    },
  ],
  related: [
    { label: 'REST API', path: '/api/' },
    { label: 'AI agent analytics', path: '/features/ai/' },
  ],
};

// Checked against ingest_pageview (20261108000001), get_overview_metrics, record_conversion_event,
// ingest_aggregate_hit (20261107000001), KpiRow.tsx, aggregateStats.ts and dashboard/filters.ts on 2026-11-07.
// Processing and custom dimensions checked against 20261109000004 (report RPCs), 20261111000001 and
// aggregateStats.ts on 2026-11-09.
export const METRICS: ContentPageData = {
  path: '/docs/metrics/',
  breadcrumb: [{ label: 'Docs', path: '/docs/' }, { label: 'Metrics', path: '/docs/metrics/' }],
  eyebrow: 'Documentation',
  h1: 'How CortIQ counts',
  lead: 'Definitions of the numbers in the dashboard: what a visit is, when it ends, how conversions and AI traffic are counted, how the aggregate figures differ, and what happens to the data before it is shown.',
  sections: [
    {
      id: 'visits',
      heading: 'Visits',
      blocks: [
        { type: 'p', text: 'A visit is a run of page views from one browser session. The tracking script sends a session identifier with every page view; it creates none before analytics consent.' },
        {
          type: 'list',
          items: [
            '**A visit ends after 30 minutes without activity** (the session timeout, as in GA4). Page views, clicks, scrolls, content interactions and form submits all count as activity. After a longer pause the tracking script switches to a new session identifier and the next page view starts a new visit.',
            '**Configurable per site:** Settings → GDPR → Configuration → Session timeout, 5 to 240 minutes (default 30). The tracking script picks up a change with the next page view; no snippet change is needed. Past visits are not recalculated.',
            '**Inactivity is the only rule.** A visit does not split at midnight or when the campaign changes; it keeps the source of its first page view.',
            '**Full and cookieless mode:** the identifier and its expiry time (`cortiq_session_expires`) live in sessionStorage, so a visit never outlasts the browser tab.',
            '**Cookieless with `sessionStorage: false`:** the identifier is held in memory only. Every full page load starts a new visit; route changes in a single-page app stay in the same visit.',
            '**Traffic source, UTM tags and country** are taken from the first page view of the visit.',
            '**Visit duration** is the time from the first to the last page view. Time on the last page is not counted, so a one-page visit has a duration of 0.',
            '**Bounced visit:** a visit with one page view. Used in the country breakdown and in the MCP tools.',
          ],
        },
        { type: 'note', tone: 'info', text: 'Visits recorded before the 30-minute rule was introduced (November 2026) are not split retroactively. Before tracking script 5.5.12, only page views extended a visit.' },
      ],
    },
    {
      id: 'overview',
      heading: 'Overview key figures',
      blocks: [
        {
          type: 'list',
          items: [
            '**Visits:** the number of visits that started in the period, counted on the day they started.',
            '**Page views:** every recorded page view. WordPress admin, login and preview URLs (`wp-admin`, `wp-login`, Elementor previews and `preview=true`) are left out.',
            '**Conversions:** recorded goal events. A goal counts at most once per visit, so repeat clicks or reloads do not add conversions.',
            '**Conversion rate:** conversions ÷ visits × 100. Each goal counts separately, so a site with several goals can show more conversions than visits.',
            '**AI visits:** hits from AI crawlers and agents, from the [server-side adapters](/integrations/server-side/) and from in-browser agent detection. One hit is one request. Hits are split into training, agentic and citation. Unclassified hits, mostly headless browsers and test tools, are shown separately and do not count as AI visits.',
            '**AI per 100 visits:** AI visits ÷ visits × 100. Hidden when a UTM segment is active, because bots carry no UTM tags.',
            '**Change vs previous period:** compared with the period of the same length immediately before.',
          ],
        },
      ],
    },
    {
      id: 'aggregate',
      heading: 'Aggregate figures',
      blocks: [
        { type: 'p', text: 'Sites that turn on aggregate measurement (off by default) also get counts that do not wait for consent. They come from a separate script and are shown in their own card, never added to the consent-based figures.' },
        {
          type: 'list',
          items: [
            '**Visitors:** distinct visitors per UTC day, from a hash of the IP address and User-Agent with a salt that changes every day. Someone who returns on two days counts twice; people who share an IP address and browser version count once.',
            '**Visits:** a new visit starts with the first page view of the day, after 30 minutes without activity, or when a page view arrives from a new referrer or UTM campaign.',
            '**Engaged visit** (GA4: engaged session): at least 10 seconds in the foreground, 2 or more page views, or a conversion.',
            '**Engagement rate:** engaged visits ÷ visits. **Average engagement time:** foreground time ÷ visitors.',
            '**Filtered hits:** direct, untagged first page views dropped because 3 new visitors had already started on the same page within the last 10 seconds, a pattern typical of crawlers.',
          ],
        },
        { type: 'p', text: 'Visitors who refuse analytics or send Global Privacy Control are not counted, and the figures are not available through the API or MCP server. The [privacy policy](/privacy/) describes what is processed.' },
      ],
    },
    {
      id: 'processing',
      heading: 'Processing: sampling, thresholds and bots',
      blocks: [
        {
          type: 'list',
          items: [
            '**No sampling.** The overview key figures, the analytics summary, top pages, traffic sources, page funnels, segments, geolocation, campaigns, navigation, social media, the aggregate card and custom dimensions are computed in the database from all recorded rows for the period, however long the range or however many filters are applied.',
            '**Previews:** the element and heatmap previews under content tracking read at most 500 rows for the period. They are examples, not totals.',
            '**No thresholds.** Small numbers are shown as they are. Nothing is withheld or rounded because a row has few visits.',
            '**No modelled data.** Visitors who refuse consent are not estimated or filled in. Consent-based figures cover consenting visitors only; the aggregate card is the only place that counts without consent.',
            '**Bots:** consent-based page views have no separate bot filter. A page view is recorded only when the tracking script runs and analytics consent is given, which most crawlers never do. AI crawlers and agents are counted as AI visits. Aggregate figures drop crawler bursts, as described above.',
            '**Top lists:** the Sources and Top pages lists in the aggregate card end with an **Other** row, so they add up to the totals above them. Other top lists in the dashboard show only the leading rows and can add up to less than the total.',
          ],
        },
      ],
    },
    {
      id: 'custom-dimensions',
      heading: 'Custom dimensions',
      blocks: [
        { type: 'p', text: 'Properties sent as the third argument of `CortIQ.track()` are stored with the event but are not reported until you register them under Report Builder → Custom dimensions (GA4: register custom dimension).' },
        {
          type: 'list',
          items: [
            '**Up to 25 dimensions per site.** Only properties with a text, number or true/false value can be registered.',
            '**Reserved keys** that identify a person or device, or hold full URLs, cannot be registered: for example `visitor_id`, `session_id`, `email`, `url`, `user_agent`, `referrer` and click IDs such as `gclid`.',
            '**Breakdown:** events and visits per value for the period. The 25 most common values are listed and the rest are grouped as **(other)**, so the rows add up to the number of events that carry the property. Values longer than 100 characters are cut.',
            '**Coverage:** events are counted per site from November 2026. Older events are included only if their page URL matches the site.',
          ],
        },
        { type: 'note', tone: 'warning', text: 'Never send names, email addresses or other personal data as properties. Use categories such as a plan or a form name.' },
      ],
    },
    {
      id: 'conventions',
      heading: 'Dates and other conventions',
      blocks: [
        {
          type: 'list',
          items: [
            '**Days are UTC days.** The default range is the last 30 days including today, which is still incomplete. The longest range is 366 days.',
            '**Device type** in consent-based analytics comes from the viewport width: under 768 px is mobile, under 1,024 px tablet, otherwise desktop. In aggregate figures it comes from the User-Agent, so the two can differ.',
            '**Country** comes from the hosting network\'s country header where it is available, otherwise from the browser time zone.',
          ],
        },
      ],
    },
  ],
  related: [
    { label: 'Glossary', path: '/glossary/' },
    { label: 'Getting started', path: '/docs/' },
    { label: 'MCP server', path: '/integrations/mcp/' },
    { label: 'REST API', path: '/api/' },
  ],
};

export const DOCS_PAGES: ContentPageData[] = [GETTING_STARTED, INTEGRATIONS, WORDPRESS, SERVER_SIDE, CLOUDFLARE, GOOGLE_ANALYTICS, MCP, METRICS];

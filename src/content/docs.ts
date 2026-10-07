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
        { type: 'p', text: 'CortIQ is one JavaScript file, `spa-tracking.js` (about 52 KB, 13 KB gzipped). It runs in two layers:' },
        {
          type: 'list',
          items: [
            '**Security layer, without consent:** AI bot and automation detection, a canary and a honeypot link. It sends data only when the visitor looks like a bot or automated browser.',
            '**Analytics layer, after analytics consent:** page views, sessions, AI referrals, clicks, scroll depth, heatmaps, form analytics and conversions.',
          ],
        },
        { type: 'p', text: 'If you would rather not run JavaScript for bot detection, the [Cloudflare Worker](/integrations/cloudflare/) classifies AI crawlers server-side, including crawlers that never execute JavaScript.' },
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
<script src="https://cortiq.se/spa-tracking.js" defer></script>`,
        },
        { type: 'p', text: 'The script reads its settings from `window.cortiqConfig` only, so the config block must come before the script tag. Without a `siteId` it logs an error to the console and does nothing.' },
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
        { type: 'p', text: '**Marketing consent** is needed on top of analytics consent for: ad click IDs (`gclid`, `fbclid`, `msclkid`, `ttclid`, `li_fat_id`), a SHA-256 hash of the email on conversions, and browser fingerprinting (which you must also switch on with `fingerprintConsent: true`).' },
      ],
    },
    {
      id: 'cookieless',
      heading: 'Cookieless mode',
      blocks: [
        { type: 'p', text: 'With `cookieless: true` the script keeps the session ID in memory instead of browser storage, skips visitor identification and switches off all marketing features (click IDs, email hashing, fingerprinting).' },
        { type: 'note', tone: 'warning', text: 'Cookieless mode still requires analytics consent. It reduces what is stored; it is not a legal basis for tracking without consent.' },
        { type: 'p', text: 'Conversions are not recorded in cookieless mode, and each full page load starts a new session.' },
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
        { type: 'p', text: 'The tag needs no consent settings of its own. The script runs its security layer at once and waits for analytics consent before any visitor analytics, reading the choice from your CMP or from Google Consent Mode as described above.' },
        { type: 'p', text: 'Consent Mode support needs tracking script 5.4.3 or later. There is no GTM Community Template yet.' },
      ],
    },
  ],
  related: [
    { label: 'Integrations', path: '/integrations/' },
    { label: 'WordPress plugin', path: '/integrations/wordpress/' },
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
            '[WordPress plugin](/integrations/wordpress/): tracking script, consent banner and Google Consent Mode v2 in one plugin.',
            '[Cloudflare Worker](/integrations/cloudflare/): server-side AI crawler classification, including crawlers that never run JavaScript. Set up together with us during the beta.',
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

export const CLOUDFLARE: ContentPageData = {
  path: '/integrations/cloudflare/',
  breadcrumb: [{ label: 'Integrations', path: '/integrations/' }, { label: 'Cloudflare', path: '/integrations/cloudflare/' }],
  eyebrow: 'Integration',
  status: 'Beta: set up with our help',
  h1: 'Server-side AI crawler tracking with Cloudflare',
  lead: 'Most AI training and citation crawlers never run JavaScript, so a JavaScript tag cannot see them. A Cloudflare Worker sees every request and sends the AI crawler traffic to CortIQ for classification.',
  sections: [
    {
      id: 'why',
      heading: 'Why server-side',
      blocks: [
        { type: 'p', text: 'GPTBot, ClaudeBot, PerplexityBot and most other crawlers fetch HTML and leave. They show up in your server logs but not in JavaScript analytics. The Worker sees them at the edge and CortIQ classifies each one as a [training crawler, agentic fetch or citation crawler](/features/ai/), using the same registry as the JavaScript tag.' },
        { type: 'p', text: 'Detection is based on the user agent. AI agents that run inside a normal browser and send a standard Chrome user agent cannot be identified this way; the JavaScript tag uses browser signals for those.' },
      ],
    },
    {
      id: 'setup',
      heading: 'Setup',
      blocks: [
        { type: 'note', text: 'During the beta, the ingest key is issued by us. [Contact us](/contact/) to get one before you start.' },
        {
          type: 'steps',
          items: [
            'Make sure your domain is added as a site in CortIQ. The Worker matches requests to sites by hostname; requests for unknown domains are ignored.',
            'In Cloudflare, go to **Workers & Pages → Create Worker**, paste the code from [cloudflare-worker.js](https://cortiq.se/cloudflare-worker.js) and deploy it.',
            'Under the Worker\'s **Settings → Variables**, add `CORTIQ_INGEST_URL` and `CORTIQ_INGEST_KEY` with the values we send you.',
            'Under **Triggers**, add a route for your domain, for example `example.com/*`.',
          ],
        },
        { type: 'code', code: `CORTIQ_INGEST_URL = ${API_BASE}/cloudflare-ingest` },
      ],
    },
    {
      id: 'how-it-works',
      heading: 'How the Worker behaves',
      blocks: [
        {
          type: 'list',
          items: [
            'It passes every request on to your site unchanged and reports to CortIQ in the background, so visitors do not wait for CortIQ.',
            'It skips static files (CSS, JavaScript, images, fonts, media) and Cloudflare\'s `/cdn-cgi/` paths.',
            'Each request still runs the Worker, so it counts toward your Cloudflare Workers request quota.',
          ],
        },
      ],
    },
    {
      id: 'data',
      heading: 'What is stored',
      blocks: [
        { type: 'p', text: 'The Worker cuts the IP address to its network (/24 for IPv4, /48 for IPv6) before anything leaves Cloudflare. CortIQ never receives full IP addresses from it.' },
        {
          type: 'list',
          items: [
            '**Bots and automated traffic:** path (without query string), user agent, referrer, the truncated network address and Cloudflare\'s Ray ID.',
            '**Human visitors:** counted only. No path, user agent, referrer or address is kept.',
          ],
        },
        { type: 'p', text: 'This runs without visitor consent because no personal data about human visitors is kept. Raw rows are deleted after 90 days. See the [privacy policy](/privacy/).' },
      ],
    },
  ],
  related: [
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
        { type: 'p', text: 'GA4 only counts visitors who run its JavaScript and, in most of Europe, gave consent. Comparing it with CortIQ\'s [server-side crawler data](/integrations/cloudflare/) shows how much AI traffic GA4 never sees.' },
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
        { type: 'p', text: 'Other clients need the endpoint URL and the `Authorization` header. We document Claude Code; we have not tested every client.' },
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
            'Rate limit per key, 1,000 requests per hour by default. You can change it when you create the key.',
          ],
        },
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

export const DOCS_PAGES: ContentPageData[] = [GETTING_STARTED, INTEGRATIONS, WORDPRESS, CLOUDFLARE, GOOGLE_ANALYTICS, MCP];

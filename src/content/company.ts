import type { ContentPageData } from './types';
import sriManifest from '../lib/sri-manifest.json' with { type: 'json' };

// Company and trust pages. Facts verified against the code, the live site and the
// Supabase project on 2026-10-03; subprocessor list re-checked against DPA.md on 2026-10-14. Update the page in the same commit as the change.

const REPO = 'https://github.com/ExpandTalk-Corporation/Cortiq';

export const SECURITY: ContentPageData = {
  path: '/security/',
  breadcrumb: [{ label: 'Security', path: '/security/' }],
  eyebrow: 'Trust',
  h1: 'Security and data protection',
  lead: 'Where your data is stored, how it is isolated from other customers, which services process it, and how to report a vulnerability.',
  sections: [
    {
      id: 'hosting',
      heading: 'Where data is stored',
      blocks: [
        { type: 'p', text: 'All analytics data is stored in the EU, in a Supabase project hosted on AWS in Stockholm (region eu-north-1). Supabase encrypts data at rest. All traffic to the dashboard, the tracking endpoints and the APIs uses HTTPS, and cortiq.se sends HSTS, so browsers only connect over HTTPS.' },
        { type: 'p', text: 'The website cortiq.se, which also serves the dashboard and the tracking script file, is hosted by Loopia in Sweden. It does not store analytics data, but like any web server it records the IP address of browsers that load a file in its access logs.' },
      ],
    },
    {
      id: 'isolation',
      heading: 'How customers are kept apart',
      blocks: [
        {
          type: 'list',
          items: [
            '**Row-level security on every table.** The database itself only returns rows for sites you own, regardless of what the application asks for.',
            '**Privileged access only on the server.** The key that bypasses row-level security exists only in server-side functions, never in the browser. Server functions that write on your behalf check that you own the site first.',
            '**Database functions locked down.** Functions that run with elevated rights cannot be called anonymously.',
            '**Secrets out of reach.** Google OAuth tokens and similar credentials are stored in columns the browser cannot read.',
          ],
        },
      ],
    },
    {
      id: 'keys',
      heading: 'API keys and access',
      blocks: [
        {
          type: 'list',
          items: [
            'API keys for the [REST API](/api/) and [MCP server](/integrations/mcp/) are stored only as SHA-256 hashes and shown once, when created.',
            'Each key reads exactly one site, read-only, and has its own rate limit. You can disable or delete a key at any time.',
            'Requests to the REST API and MCP server are logged with the endpoint, response time, and the caller\'s IP address and user agent. The log counts toward the key\'s rate limit and is deleted together with the key.',
            'Server-side fetches on your behalf (GEO audits, form detection) block private, loopback and cloud-metadata addresses.',
          ],
        },
      ],
    },
    {
      id: 'minimisation',
      heading: 'Data minimisation',
      blocks: [
        {
          type: 'list',
          items: [
            'Visitor analytics start only after analytics consent. Ad click IDs are stored only with marketing consent, which is checked on the server, not just in the browser.',
            'Heatmap points are stored without IP address or user agent, and with the page URL stripped of query strings.',
            'The [Cloudflare Worker](/integrations/cloudflare/) sends only requests from known crawler user agents, requests for robots.txt and llms.txt, and hits on its hidden honeypot link, with the IP address truncated before it leaves Cloudflare. CortIQ stores only those from classified AI bots and honeypot hits.',
            'Data is deleted automatically after the retention period set for each site. See the [privacy policy](/privacy/) for every retention period.',
          ],
        },
      ],
    },
    {
      id: 'subprocessors',
      heading: 'Subprocessors',
      blocks: [
        { type: 'p', text: 'Section 6 of the [Data Processing Agreement](' + REPO + '/blob/main/DPA.md) is the authoritative list, with the transfer basis for each provider. In short:' },
        { type: 'p', text: 'Always used:' },
        {
          type: 'list',
          items: [
            '**Supabase** (on AWS, Stockholm, EU): database, authentication and server functions.',
            '**Loopia** (Sweden): hosting of cortiq.se, the dashboard and the tracking script file.',
          ],
        },
        { type: 'p', text: 'Used only when you use the related feature:' },
        {
          type: 'list',
          items: [
            '**Cloudflare** (USA, EU-US Data Privacy Framework): edge analytics and geo lookup.',
            '**Resend** (USA, EU-US Data Privacy Framework): when you send a report export by email.',
            '**Anthropic** (USA, Standard Contractual Clauses): AI insights on the dashboard, which receive aggregated statistics only.',
          ],
        },
        { type: 'p', text: 'Services you connect with your own account act under your own agreement with them, not as our subprocessors: Google Analytics, Search Console and Google Ads, HubSpot, and Anthropic (AI features with your own API key).' },
        { type: 'p', text: 'The Data Processing Agreement also sets out how we process personal data on your behalf, including breach notification within 72 hours.' },
      ],
    },
    {
      id: 'script-integrity',
      heading: 'Tracking script integrity',
      blocks: [
        { type: 'p', text: 'The standard snippet loads `cortiq.js` from cortiq.se and always gets the latest version. If you want the browser to run only a file you have checked, you can [pin a version with Subresource Integrity](/security/sri/) instead. The WordPress plugin and the server-side adapters do not load the script from cortiq.se at all.' },
      ],
    },
    {
      id: 'certifications',
      heading: 'Certifications',
      blocks: [
        { type: 'p', text: 'CortIQ itself does not hold ISO 27001 or SOC 2 certification. Our infrastructure provider Supabase is SOC 2 Type 2 audited. The full source code is public on [GitHub](' + REPO + '), so you can review how data is handled.' },
      ],
    },
    {
      id: 'disclosure',
      heading: 'Report a vulnerability',
      blocks: [
        { type: 'p', text: 'Email info@expandtalk.se with a description, steps to reproduce and the potential impact. Please do not open a public GitHub issue for security problems. We respond within 48 hours. Scope and details are in [SECURITY.md](' + REPO + '/blob/main/SECURITY.md).' },
        { type: 'p', text: 'Testing must not access other customers\' data or degrade the service for others.' },
      ],
    },
  ],
  related: [
    { label: 'Privacy policy', path: '/privacy/' },
    { label: 'Cookies', path: '/cookies/' },
    { label: 'Terms of Service', path: '/terms/' },
  ],
};

// Every version, hash and URL below comes from src/lib/sri-manifest.json, so the page cannot
// drift from the pinned files. Facts verified against scripts/pin-tracker.mjs, snippetTemplate.ts,
// TrackingSnippetSetup.tsx and public/v/.htaccess on 2026-11-11.
const SRI_VERSION = sriManifest.latest;
const SRI_FILES: Record<string, string> = (sriManifest.versions as Record<string, { files: Record<string, string> }>)[SRI_VERSION].files;
const SRI_BASE = `https://cortiq.se/v/${SRI_VERSION}`;

export const SECURITY_SRI: ContentPageData = {
  path: '/security/sri/',
  breadcrumb: [{ label: 'Security', path: '/security/' }, { label: 'Subresource Integrity', path: '/security/sri/' }],
  eyebrow: 'Trust',
  h1: 'Pinned installs with Subresource Integrity',
  lead: 'An optional install where your site loads one fixed version of the CortIQ tracking script, and the browser refuses to run it if the file differs by a single byte from the version you installed.',
  sections: [
    {
      id: 'why',
      heading: 'Why it matters',
      blocks: [
        { type: 'p', text: 'A script tag that loads a file from another domain runs that file with the same access as your own code: it can read the page, forms included. With the standard snippet, whoever controls the file on cortiq.se controls what runs on your site. That is how the snippet gets updates without you doing anything, and it is also the risk if cortiq.se were ever compromised.' },
        { type: 'p', text: 'Subresource Integrity (SRI) is a browser standard that closes that gap. The script tag carries a cryptographic hash of the expected file. The browser downloads the file, computes its hash and runs it only if the two match. All current browsers support it.' },
      ],
    },
    {
      id: 'how',
      heading: 'How CortIQ implements it',
      blocks: [
        {
          type: 'list',
          items: [
            `**Fixed versions.** Every release of the tracking script and the consent banner is published under its own path, for example \`${SRI_BASE}/cortiq.js\`. A published version is never changed or removed: the build fails if the file for an already published version changes, and each version's files are committed to the [public repository](${REPO}/tree/main/public/v).`,
            `**SHA-384 hashes.** The hashes are kept in [sri-manifest.json](${REPO}/blob/main/src/lib/sri-manifest.json), and every build checks each hash against its file.`,
            '**CORS headers.** Files under `/v/` are sent with `Access-Control-Allow-Origin: *`, which the browser requires before it checks the hash of a file from another domain. The snippet loads them with `crossorigin="anonymous"`, so no cookies are sent.',
            '**Turned on in the dashboard.** Under **Install tracking**, tick **Pin version … with Subresource Integrity (SRI)**. The snippet then points at the fixed version with its hash. This works with your own consent banner and with the CortIQ banner; the banner file is pinned too.',
          ],
        },
        { type: 'p', text: 'The tracking script itself is loaded only after analytics consent, so the snippet sets the hash on the script element it creates:' },
        {
          type: 'code',
          lang: 'js',
          code: `s.src = '${SRI_BASE}/cortiq.js';
s.integrity = '${SRI_FILES['cortiq.js']}';
s.crossOrigin = 'anonymous';`,
        },
        { type: 'p', text: 'With the CortIQ consent banner, its script tag gets the same two attributes:' },
        {
          type: 'code',
          lang: 'html',
          code: `<script src="${SRI_BASE}/consent-banner.js"
  integrity="${SRI_FILES['consent-banner.js']}" crossorigin="anonymous"
  defer></script>`,
        },
        { type: 'note', tone: 'info', text: `These are the values for version ${SRI_VERSION}, the latest. Copy the full snippet from the dashboard rather than from this page: it also contains your Site ID and tracking key.` },
      ],
    },
    {
      id: 'trade-off',
      heading: 'The trade-off: no automatic updates',
      blocks: [
        { type: 'p', text: 'A pinned site keeps running the version it was installed with. New features and fixes reach it only when you copy a new snippet from the dashboard and replace the old one.' },
        {
          type: 'list',
          items: [
            'When you copy a pinned snippet, the dashboard records which version the site uses.',
            'If a newer version fixes a security issue, **Install tracking** shows a warning for that site, naming the version with the fix. Other new versions are shown as a short note.',
            'We do not yet notify you by email. Check **Install tracking** or the [changelog](/changelog/) when you update your site.',
          ],
        },
        { type: 'p', text: 'If the hash does not match, or the CORS header is missing, the browser blocks the file and logs an error in the console. Tracking then stops on that page. That is the intended behaviour: a missing page view is better than running a file you did not install.' },
      ],
    },
    {
      id: 'verify',
      heading: 'Check the hash yourself',
      blocks: [
        { type: 'p', text: 'You do not have to trust the hash we give you. Download the file and compute its hash:' },
        {
          type: 'code',
          lang: 'bash',
          code: `curl -s ${SRI_BASE}/cortiq.js | openssl dgst -sha384 -binary | openssl base64 -A`,
        },
        { type: 'p', text: 'Prefix the output with `sha384-` and compare it with the `integrity` value in your snippet. You can also compare the downloaded file with the copy in the public repository, and read the [source code](' + REPO + '/blob/main/public/spa-tracking.js) it is built from.' },
        { type: 'p', text: 'To check that the CORS header is sent:' },
        {
          type: 'code',
          lang: 'bash',
          code: `curl -sI ${SRI_BASE}/cortiq.js | grep -i access-control-allow-origin`,
        },
      ],
    },
    {
      id: 'limits',
      heading: 'What SRI does not cover',
      blocks: [
        {
          type: 'list',
          items: [
            '**The snippet itself.** SRI checks the file the snippet loads, not the snippet. If the snippet were altered before you copied it, the hash in it would be wrong too. Check the hash as above before you install.',
            '**Data sent to CortIQ.** SRI protects your visitors from a changed script. How the data is stored and protected afterwards is described on the [security page](/security/).',
            '**Your dashboard account.** Anyone with access to your account can change site settings. Use a strong, unique password.',
            '**Other scripts on your site.** SRI applies per script tag. Each third-party script you load needs its own `integrity` attribute.',
          ],
        },
      ],
    },
    {
      id: 'other-installs',
      heading: 'Installs that load nothing from cortiq.se',
      blocks: [
        {
          type: 'list',
          items: [
            '**WordPress plugin.** The plugin serves `cortiq.js` from your own WordPress site and renders its consent banner from the plugin itself. Since version 5.5.13 it no longer falls back to cortiq.se if the bundled file is missing. The code changes only when you update the plugin.',
            '**Server-side adapters.** The [server-side adapters](/integrations/server-side/) and the [Cloudflare Worker](/integrations/cloudflare/) run on your own server or Cloudflare account and send requests to the CortIQ API. They add no script to your pages.',
            '**Aggregate measurement without a banner.** The snippet for this mode contains the whole counting script inline, so nothing is loaded from cortiq.se.',
          ],
        },
      ],
    },
  ],
  related: [
    { label: 'Security and data protection', path: '/security/' },
    { label: 'Getting started', path: '/docs/' },
    { label: 'WordPress plugin', path: '/integrations/wordpress/' },
  ],
};

export const COOKIES: ContentPageData = {
  path: '/cookies/',
  breadcrumb: [{ label: 'Cookies', path: '/cookies/' }],
  eyebrow: 'Privacy',
  h1: 'Cookies and browser storage',
  lead: 'What cortiq.se stores in your browser (almost nothing), and what the CortIQ tracking script stores on our customers\' websites.',
  sections: [
    {
      id: 'cortiq-se',
      heading: 'On cortiq.se',
      blocks: [
        { type: 'p', text: 'cortiq.se does not use analytics or advertising cookies, and does not load Google Analytics, ad pixels or the CortIQ tracking script. Fonts are served from cortiq.se itself, so loading a page contacts no other company.' },
        { type: 'p', text: 'Before you make a choice in the consent banner, nothing is stored. After you choose, we store only your choice:' },
        {
          type: 'list',
          items: [
            '`site_consent`: a cookie with your consent choice. Expires after 12 months, when you are asked again. This is the only cookie cortiq.se sets.',
            '`site_cookie_consent`: the same choice in localStorage, with an expiry date of 12 months.',
            '`user_consent`: a copy of the choice for the current tab (sessionStorage), cleared when you close the tab.',
          ],
        },
        { type: 'p', text: 'Two more items appear only if you use a feature: `theme` (localStorage) if you switch between light and dark mode, and a Supabase `sb-…-auth-token` (localStorage) when you log in to the dashboard. Both are necessary for what you asked for.' },
        { type: 'p', text: 'You can change your choice at any time with the "Cookie settings" button in the bottom right corner of the page, or clear the items in your browser\'s settings.' },
      ],
    },
    {
      id: 'customer-sites',
      heading: 'On websites that use CortIQ',
      blocks: [
        { type: 'p', text: 'The CortIQ tracking script sets no cookies. What it stores depends on the visitor\'s consent and on the mode the site owner chose:' },
        {
          type: 'list',
          items: [
            '**Without consent:** nothing. The script does not read device properties, write storage or send requests before analytics consent. After consent, a page-depth counter (`_ciq_adp`, sessionStorage) is written only for visitors detected as bots or automated browsers.',
            '**With analytics consent, full mode:** a session identifier (`cortiq_session_id`, sessionStorage) and the time it expires after inactivity (`cortiq_session_expires`, sessionStorage), both cleared when the tab closes. In cookieless mode it is held in memory only and nothing is written.',
            '**With marketing consent, full mode:** ad click IDs from the landing URL (`cortiq_click_ids`, sessionStorage).',
          ],
        },
        { type: 'p', text: 'If the site uses the CortIQ consent banner, it also stores the visitor\'s choice as described above for cortiq.se. If it uses another consent tool, that tool\'s own storage applies. Withdrawing consent removes `cortiq_session_id`, `cortiq_session_expires` and `cortiq_click_ids`.' },
        { type: 'p', text: 'The site owner decides how CortIQ is used on their site and is responsible for informing visitors. See [how consent reaches the script](/docs/#consent) and the [privacy policy](/privacy/).' },
      ],
    },
    {
      id: 'why-a-page',
      heading: 'Why a cookie page for a cookieless product?',
      blocks: [
        { type: 'p', text: '"Cookieless" describes how CortIQ measures: without cookies, and in cookieless mode without writing anything to the visitor\'s device. Remembering a consent choice still requires storing that choice, and the law requires telling you about it. This page lists everything, so you do not have to take "cookieless" on trust.' },
      ],
    },
  ],
  related: [
    { label: 'Privacy policy', path: '/privacy/' },
    { label: 'Consent banner (CMP)', path: '/cmp/' },
    { label: 'Security', path: '/security/' },
  ],
};

export const ABOUT: ContentPageData = {
  path: '/about/',
  breadcrumb: [{ label: 'About', path: '/about/' }],
  eyebrow: 'Company',
  h1: 'About CortIQ',
  lead: 'CortIQ is web analytics for a web where a growing share of visitors are AI systems. It is built in Gothenburg, Sweden, by Expandtalk Corporation AB.',
  sections: [
    {
      id: 'why',
      heading: 'Why we built it',
      blocks: [
        { type: 'p', text: 'Standard analytics tools were built for people with browsers. They miss most AI traffic, because training and citation crawlers do not run JavaScript, and they lump the AI visits they do see together. Yet a crawler collecting training data, an assistant fetching a page because a user asked it to, and an AI search engine indexing content for citations are three different things, with different value to a website owner.' },
        { type: 'p', text: 'CortIQ [classifies that traffic](/features/ai/) into those three categories, alongside consent-first visitor analytics for the people who visit.' },
      ],
    },
    {
      id: 'principles',
      heading: 'How we work',
      blocks: [
        {
          type: 'list',
          items: [
            '**Consent first.** Visitor analytics, including cookieless mode and in-browser bot detection, waits for consent. Optional aggregate measurement stores nothing on the device and respects refusals and Global Privacy Control; the site owner decides whether to use it. AI crawlers are measured server-side.',
            '**EU-hosted.** Analytics data is stored in Stockholm.',
            '**Open source.** The source code is public under the AGPL-3.0 licence on [GitHub](https://github.com/ExpandTalk-Corporation/Cortiq).',
            '**Honest about status.** CortIQ is in beta. Features that are not ready are marked "in development", and the [changelog](/changelog/) shows what has shipped.',
          ],
        },
      ],
    },
    {
      id: 'company',
      heading: 'The company',
      blocks: [
        { type: 'p', text: 'Expandtalk Corporation AB is a Swedish company that builds software products and works as a consultant on digital and data projects.' },
        {
          type: 'list',
          items: [
            'Company registration number: 559358-8824',
            'Registered office: Göteborg, Sweden',
            'VAT number: SE559358882401',
            'Address: Parmmätaregatan 4B, 417 04 Göteborg, Sweden',
            'Email: info@expandtalk.se',
          ],
        },
      ],
    },
  ],
  related: [
    { label: 'Contact', path: '/contact/' },
    { label: 'Security', path: '/security/' },
    { label: 'Changelog', path: '/changelog/' },
  ],
};

export const CHANGELOG: ContentPageData = {
  path: '/changelog/',
  breadcrumb: [{ label: 'Changelog', path: '/changelog/' }],
  eyebrow: 'Product',
  h1: 'Changelog',
  lead: 'What has shipped in CortIQ, newest first. Tracking script and WordPress plugin versions share one number.',
  sections: [
    {
      id: '2026-11',
      heading: 'November 2026',
      blocks: [
        {
          type: 'list',
          items: [
            '**Pinned installs with Subresource Integrity (5.5.13).** An optional snippet loads a fixed version of the tracking script with a SHA-384 hash, so the browser refuses a changed file. The dashboard warns when a newer version fixes a security issue. The WordPress plugin no longer falls back to cortiq.se. [How it works](/security/sri/).',
            '**Consent banner in the install snippet.** The snippet can include the CortIQ consent banner, with Google Consent Mode v2 as an option. You choose cookieless or full mode; marketing consent is offered only in full mode.',
            '**Safari and iPhone visitors were logged as AI bots** by the in-browser checks. Fixed in 5.5.8, and the wrongly logged visits were deleted.',
            '**Tracking Check (private preview)** tests what a site loads before and after the cookie banner. Findings explain the cause and the fix, and the report can be exported as CSV or Excel.',
            '**Aggregate measurement.** Site owners can turn on an opt-in mode, off by default, that counts page views, visits, traffic sources and form goals without cookies or any storage on the visitor\'s device, designed to not require consent – the site owner makes the legal assessment. An analytics refusal in the CortIQ banner, Cookiebot or Google Consent Mode, or Global Privacy Control, stops it.',
          ],
        },
      ],
    },
    {
      id: '2026-10',
      heading: 'October 2026',
      blocks: [
        {
          type: 'list',
          items: [
            '**Server-side AI agent measurement (5.5.0).** Adapters for Next.js, Netlify, Node and the WordPress plugin, alongside the Cloudflare Worker, report AI crawlers without anything running in the visitor\'s browser.',
            '**Visitor country** is estimated from the browser time zone, with no IP lookup (5.5.4).',
            '**Navigation flow and content performance** in the dashboard (5.5.6).',
            '**Dashboard:** a new Overview with global filters, ten tabs that follow the global date range, and conversion goals that record real conversions.',
            '**Referrers are stored by default again.** From 16 July to 16 October, sites without saved GDPR settings stored no referrers.',
            '**Google Tag Manager and Consent Mode v2 (5.4.3).** The tracking script reads Google Consent Mode from the dataLayer, so consent banners connected to GTM work without extra code. [Setup](/docs/#tag-managers).',
            '**Heatmaps fixed.** Click and scroll heatmap points had stopped being stored in June. They are stored again, without IP address or query strings.',
            '**GEO audit v2.** Passage-level citability scores, checks for 14 AI crawlers, llms.txt validation, JavaScript-rendering and security-header checks.',
            '**Google Search Console** can be connected from the dashboard again.',
            '**New documentation:** [getting started](/docs/), [integrations](/integrations/), [security](/security/) and this changelog.',
            '**Security fixes:** a server-log import endpoint without authentication was removed, and Search Console tokens can no longer be read from the browser.',
          ],
        },
      ],
    },
    {
      id: '2026-09',
      heading: 'September 2026',
      blocks: [
        {
          type: 'list',
          items: [
            '**Server-side AI crawler tracking** through a [Cloudflare Worker](/integrations/cloudflare/), classified with the same registry as the tracking script.',
            '**Consent overhaul.** Visitor analytics, including AI-referral measurement, start only after analytics consent, in both cookieless and full mode (5.4.0–5.4.1).',
            '**Consent expiry.** Stored choices expire after 12 months, and the WordPress plugin and tracking script now share one version number.',
            '**Self-serve API keys** for the REST API and MCP server.',
            '**Database hardening:** owner-only access on AI agent and bot tables, and privileged database functions locked down.',
          ],
        },
      ],
    },
    {
      id: '2026-08',
      heading: 'August 2026',
      blocks: [
        {
          type: 'list',
          items: [
            '**Link click counter.** Anonymous, aggregate click counts per link, with no data about individual visitors.',
            '**KPI dashboard without GA4.** Falls back to CortIQ\'s own data when Google Analytics is not connected.',
            '**Cookieless sites never store conversion personal data**, enforced on the server.',
          ],
        },
      ],
    },
    {
      id: '2026-07',
      heading: 'July 2026',
      blocks: [
        {
          type: 'list',
          items: [
            '**WordPress plugin 5.3.** Consent banner with Google Consent Mode v2, cookieless mode, banner in English, Swedish, German, French and Portuguese, and optional geo-gating to the EEA, UK and Switzerland.',
            '**Server-side proof of consent.** The consent banner records each choice on the server.',
            '**Per-site tracking mode:** cookieless or full.',
            '**More AI bots classified**, including YouBot, DuckAssistBot and ChatGPT Atlas.',
            '**Delete a site** from the dashboard, with all its data.',
            '**Security review** across data isolation, ingest endpoints and server-side fetches.',
          ],
        },
      ],
    },
    {
      id: '2026-06',
      heading: 'June 2026',
      blocks: [
        {
          type: 'list',
          items: [
            '**Scroll-depth heatmaps.** Funnel of how far visitors scroll, at 25, 50, 75 and 100%.',
            '**"Show your work" for AI insights.** Every AI insight shows the tables, row counts and model behind it.',
            '**Prerendered marketing pages**, so search engines and AI crawlers can read them without running JavaScript.',
          ],
        },
      ],
    },
  ],
  related: [
    { label: 'Getting started', path: '/docs/' },
    { label: 'About CortIQ', path: '/about/' },
  ],
};

export const COMPANY_PAGES: ContentPageData[] = [SECURITY, SECURITY_SRI, COOKIES, ABOUT, CHANGELOG];

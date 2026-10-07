import type { ContentPageData } from './types';

// Company and trust pages. Facts verified against the code, the live site and the
// Supabase project on 2026-10-03. Update the page in the same commit as the change.

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
        { type: 'p', text: 'The marketing website cortiq.se is a static site hosted by Loopia in Sweden. It does not store analytics data.' },
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
            'The [Cloudflare Worker](/integrations/cloudflare/) truncates IP addresses before anything leaves Cloudflare, and keeps nothing about human visitors except a count.',
            'Data is deleted automatically after the retention period set for each site. See the [privacy policy](/privacy/) for every retention period.',
          ],
        },
      ],
    },
    {
      id: 'subprocessors',
      heading: 'Subprocessors',
      blocks: [
        { type: 'p', text: 'Always used:' },
        { type: 'list', items: ['**Supabase** (on AWS, Stockholm, EU): database, authentication and server functions.'] },
        { type: 'p', text: 'Used only when you enable the related feature:' },
        {
          type: 'list',
          items: [
            '**Cloudflare** (USA, EU-US Data Privacy Framework): the Cloudflare Worker and edge analytics.',
            '**Google** (USA): Google Analytics 4 and Search Console imports.',
            '**Anthropic** (USA): AI insights and GEO analysis, with your own API key.',
            '**Resend** (USA): when you send a report export by email.',
          ],
        },
        { type: 'p', text: 'The [Data Processing Agreement](' + REPO + '/blob/main/DPA.md) sets out how we process personal data on your behalf, including breach notification within 72 hours.' },
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
            '**Without consent:** nothing for analytics. A page-depth counter (`_ciq_adp`, sessionStorage) is written only for visitors detected as bots or automated browsers.',
            '**With analytics consent, full mode:** a session identifier (`cortiq_session_id`, sessionStorage), cleared when the tab closes. In cookieless mode it is held in memory only and nothing is written.',
            '**With marketing consent, full mode:** ad click IDs from the landing URL (`cortiq_click_ids`, sessionStorage).',
          ],
        },
        { type: 'p', text: 'If the site uses the CortIQ consent banner, it also stores the visitor\'s choice as described above for cortiq.se. If it uses another consent tool, that tool\'s own storage applies. Withdrawing consent removes `cortiq_session_id` and `cortiq_click_ids`.' },
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
            '**Consent first.** Visitor analytics wait for consent, including in cookieless mode. Only bot and security detection runs without it.',
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
      id: '2026-10',
      heading: 'October 2026',
      blocks: [
        {
          type: 'list',
          items: [
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

export const COMPANY_PAGES: ContentPageData[] = [SECURITY, COOKIES, ABOUT, CHANGELOG];

import type { ContentPageData } from './types';

// Problem-oriented guides. Statements about CortIQ are checked against docs.ts (consent, cookieless,
// aggregate, server-side) and public/spa-tracking.js (automation signals, honeypot) on 2026-11-08.
// Consent and ePrivacy wording follows the server-side section in docs.ts; have it legally reviewed
// before changing it. Statements about other tools stay at what their vendors publish.

const BREADCRUMB_ROOT = { label: 'Guides', path: '/guides/' };

export const WITHOUT_GA: ContentPageData = {
  path: '/guides/website-traffic-without-google-analytics/',
  breadcrumb: [BREADCRUMB_ROOT, { label: 'Traffic without Google Analytics', path: '/guides/website-traffic-without-google-analytics/' }],
  eyebrow: 'Guide',
  h1: 'How to measure website traffic without Google Analytics',
  lead: 'Four ways to count visitors without GA4, what each one sees and misses, and where consent comes in.',
  sections: [
    {
      id: 'why',
      heading: 'Why look beyond Google Analytics',
      blocks: [
        { type: 'p', text: 'GA4 only counts visitors who run its JavaScript. In most of Europe it also waits for consent, unless Consent Mode advanced sends cookieless pings that Google then models. Ad blockers stop it, and so does any bot or AI crawler that does not run JavaScript. On many European sites, GA4 therefore shows considerably less than the real traffic.' },
        { type: 'p', text: 'There is no single replacement that sees everything. Each method below counts a different slice, so pick by the question you need to answer.' },
      ],
    },
    {
      id: 'server-logs',
      heading: '1. Server logs',
      blocks: [
        { type: 'p', text: 'Your web server or CDN already logs every request: humans, search engines, AI crawlers and scanners. Nothing runs in the browser and nothing is stored on the device.' },
        {
          type: 'list',
          items: [
            '**Sees:** every request, including bots and visitors with JavaScript or cookies blocked.',
            '**Misses:** pages served from a cache in front of the server, and anything that happens on the page, such as clicks, scrolling and forms.',
            '**Watch out for:** bots make up a large share of raw requests. You have to filter them before the numbers mean anything; see [how to detect bot traffic](/guides/detect-bot-traffic/).',
          ],
        },
        { type: 'p', text: 'Log entries contain IP addresses, which are usually personal data under the GDPR, so you need a legal basis and a retention limit.' },
      ],
    },
    {
      id: 'cookieless-script',
      heading: '2. A cookieless analytics script',
      blocks: [
        { type: 'p', text: 'Privacy-focused tools such as Plausible, Fathom, Simple Analytics, Umami and Matomo (configured without cookies) use a small script that sets no cookies. They report page views, sources, UTM campaigns and goals.' },
        {
          type: 'list',
          items: [
            '**Sees:** human visitors whose browser runs the script.',
            '**Misses:** AI crawlers and most bots, which do not run JavaScript, and visitors who block the script.',
            '**Consent:** "cookieless" is not the same as "no consent needed". The ePrivacy rule covers any storage of, or access to, information on the device, not only cookies. Whether a given tool needs consent depends on what it reads and stores; see [cookieless analytics alternatives](/guides/cookieless-analytics-alternatives/).',
          ],
        },
      ],
    },
    {
      id: 'aggregate',
      heading: '3. Aggregate counting',
      blocks: [
        { type: 'p', text: 'Aggregate counting gives up individual visitor journeys in exchange for counts. CortIQ\'s [aggregate measurement](/docs/metrics/#aggregate) (off by default) uses a separate script that stores nothing in the browser and sends no identifier. The server recognises a visitor within one day from a hash of the IP address and browser, with a salt that is deleted when the day ends. It is designed to not require consent, and it stops when the visitor refuses analytics or sends Global Privacy Control. This is not settled: the EDPB's Guidelines 2/2023 treat client-side code that makes the browser send information as access to the device, and a supervisory authority may take a different view. The daily hash is personal data under the GDPR, so you need a legal basis, typically legitimate interest. You make the final assessment for your site.' },
        {
          type: 'list',
          items: [
            '**Sees:** page views, visits, daily visitors, sources, UTM campaigns and goals such as form submissions.',
            '**Misses:** anything that needs a visitor across days or a session in the browser: returning visitors, paths, heatmaps.',
          ],
        },
      ],
    },
    {
      id: 'consented',
      heading: '4. Full analytics after consent',
      blocks: [
        { type: 'p', text: 'For heatmaps, form analytics, conversion paths and ad attribution you need a script that remembers the session, and that runs after the visitor accepts analytics. The [CortIQ tracking script](/docs/) does nothing before analytics consent and reads the choice from your consent banner.' },
      ],
    },
    {
      id: 'compare',
      heading: 'Which method answers which question',
      blocks: [
        {
          type: 'list',
          items: [
            '**How much traffic does the site really get, bots included?** Server logs, or [server-side measurement](/integrations/server-side/).',
            '**Which AI crawlers and assistants read the site?** Server-side: most of them never run JavaScript. See [AI traffic analytics](/features/ai/).',
            '**How many people visit, and from where?** An aggregate or cookieless script – check whether it needs consent on your site.',
            '**What do visitors do on the page?** Full analytics after consent.',
          ],
        },
        { type: 'note', text: 'Whatever you choose, it is your assessment as controller whether a method needs consent on your site. The [privacy policy](/privacy/) describes how CortIQ processes data in each mode.' },
      ],
    },
  ],
  related: [
    { label: 'Cookieless analytics alternatives', path: '/guides/cookieless-analytics-alternatives/' },
    { label: 'How CortIQ counts', path: '/docs/metrics/' },
    { label: 'Analytics glossary', path: '/glossary/' },
  ],
};

export const DETECT_BOTS: ContentPageData = {
  path: '/guides/detect-bot-traffic/',
  breadcrumb: [BREADCRUMB_ROOT, { label: 'Detect bot traffic', path: '/guides/detect-bot-traffic/' }],
  eyebrow: 'Guide',
  h1: 'How to detect bot traffic in web analytics',
  lead: 'The signs of bots in your reports, the methods that catch them, and why AI crawlers need a different approach.',
  sections: [
    {
      id: 'signs',
      heading: 'Signs of bot traffic in your reports',
      blocks: [
        {
          type: 'list',
          items: [
            'A sudden spike of **direct** traffic to one page, with no campaign or link that explains it.',
            'Many visits with **one page view and no time on site**, often from the same country or city.',
            'Screen sizes or browsers that real visitors rarely have, or an unusual share of one browser version.',
            'Conversions or form submissions with nonsense content, or far more starts than any real campaign could produce.',
            'Referrers from domains nobody would link from (referrer spam).',
          ],
        },
      ],
    },
    {
      id: 'two-kinds',
      heading: 'Two kinds of bots',
      blocks: [
        { type: 'p', text: '**Declared bots** say what they are in the User-Agent header: search engines and AI crawlers such as GPTBot, ClaudeBot and PerplexityBot. Most of them never run JavaScript, so they do not show up in JavaScript analytics at all. To see them, measure on the server.' },
        { type: 'p', text: '**Disguised bots** run a real browser, often headless Chrome driven by Playwright or Puppeteer, and send an ordinary browser User-Agent. They execute your analytics script and inflate your numbers. Some AI agents that act in the user\'s own browser also look like ordinary Chrome.' },
      ],
    },
    {
      id: 'methods',
      heading: 'Detection methods',
      blocks: [
        {
          type: 'list',
          items: [
            '**User-Agent matching** against a list of known bots. Catches declared bots; anyone can copy a User-Agent, so for crawlers that matter, verify the IP address against the ranges the operator publishes, or with a reverse DNS lookup.',
            '**Automation flags** in the browser: `navigator.webdriver` is true in browsers controlled by automation tools, and headless Chrome may say `HeadlessChrome` in its User-Agent. Also look at screen sizes of zero or a default size.',
            '**Honeypots:** a link that is invisible to people. A visitor that clicks it is very likely automated.',
            '**Rate and burst patterns:** many new visitors landing on the same page within seconds, with no referrer, is a crawler pattern rather than human traffic.',
            '**Built-in filters:** GA4 excludes traffic from known bots and spiders automatically, and you cannot see how much it removed. It does not report AI crawlers that never run JavaScript.',
          ],
        },
      ],
    },
    {
      id: 'ai',
      heading: 'AI crawlers are not all the same',
      blocks: [
        { type: 'p', text: 'Blocking or filtering all AI traffic throws away useful information. CortIQ classifies it into three groups:' },
        {
          type: 'list',
          items: [
            '**Training crawlers** (GPTBot, ClaudeBot, Google-Extended) collect content for model training and send no visitors back.',
            '**Citation crawlers** (OAI-SearchBot, PerplexityBot) index pages for AI search; being crawled is a precondition for being cited.',
            '**Agentic fetches** (ChatGPT-User, Claude-User, Perplexity-User) happen when a person asks an assistant to read your page right now.',
          ],
        },
        { type: 'p', text: 'See the [glossary](/glossary/#ai-traffic) for how each is counted.' },
      ],
    },
    {
      id: 'cortiq',
      heading: 'How CortIQ does it',
      blocks: [
        {
          type: 'list',
          items: [
            '**On the server:** [adapters](/integrations/server-side/) for Next.js, Vercel, Netlify, Node, WordPress and [Cloudflare](/integrations/cloudflare/) classify crawlers by User-Agent against one bot registry, without any code in the browser.',
            '**In the browser, after analytics consent:** the tracking script checks for automation flags and places a hidden honeypot link, and reports automated sessions separately from human visits.',
            '**In aggregate figures:** direct first page views beyond 3 new visitors on the same page within 10 seconds are dropped and counted as filtered, so you can see how much was removed.',
          ],
        },
      ],
    },
  ],
  related: [
    { label: 'AI traffic analytics', path: '/features/ai/' },
    { label: 'Server-side measurement', path: '/integrations/server-side/' },
    { label: 'Bot detection', path: '/features/cyber/' },
  ],
};

export const ALTERNATIVES: ContentPageData = {
  path: '/guides/cookieless-analytics-alternatives/',
  breadcrumb: [BREADCRUMB_ROOT, { label: 'Cookieless analytics alternatives', path: '/guides/cookieless-analytics-alternatives/' }],
  eyebrow: 'Guide',
  h1: 'Cookieless analytics alternatives to Google Analytics',
  lead: 'What "cookieless" means, why it is not the same as consent-free, and how the main options differ.',
  sections: [
    {
      id: 'what',
      heading: 'What cookieless analytics means',
      blocks: [
        { type: 'p', text: 'A cookieless analytics tool sets no cookies in the visitor\'s browser. Some keep nothing at all on the device; others use sessionStorage, localStorage or a fingerprint instead. Ask what replaces the cookie, because that decides what the tool can count and what it needs.' },
      ],
    },
    {
      id: 'consent',
      heading: 'Cookieless is not the same as consent-free',
      blocks: [
        { type: 'p', text: 'The ePrivacy rule on consent (Art. 5(3), in Sweden LEK chapter 9, section 28) covers storing or reading any information on the visitor\'s device, not only cookies. The EDPB\'s Guidelines 2/2023, which are not binding, read it broadly: they include fingerprinting, some uses of IP addresses, and client-side code that makes the browser send information. Separately, the data is usually personal data under the GDPR and needs a legal basis.' },
        { type: 'p', text: 'Vendors make different claims about whether their tool needs a banner. Read how the tool works, not only the claim, and make your own assessment as controller.' },
      ],
    },
    {
      id: 'options',
      heading: 'The main options',
      blocks: [
        {
          type: 'list',
          items: [
            '**Plausible:** open source, cookieless, hosted in the EU or self-hosted. Simple dashboard with sources, pages and goals.',
            '**Fathom:** hosted, cookieless, with a simple dashboard.',
            '**Simple Analytics:** EU-based and cookieless, focused on collecting as little as possible.',
            '**Matomo:** open source, self-hosted or cloud. Can run without cookies, with fewer features in that mode.',
            '**Umami:** open source, self-hosted or cloud, cookieless.',
            '**Cloudflare Web Analytics:** free and cookieless, with automatic setup for sites proxied through Cloudflare and a JavaScript snippet for other sites.',
            '**GA4 with Consent Mode advanced:** loads before consent in denied mode and sends cookieless pings; Google models the missing data. The pings still go to Google, and whether sending them before consent needs consent is disputed.',
          ],
        },
        { type: 'p', text: 'Check each vendor\'s current documentation for features and pricing; they change often.' },
      ],
    },
    {
      id: 'what-they-miss',
      heading: 'What a script alone misses',
      blocks: [
        { type: 'p', text: 'In their standard setup, the options above count visits with JavaScript in the browser. AI crawlers such as GPTBot and ClaudeBot do not run it, so a script alone cannot tell you how often AI systems read your site. Some tools can also import server logs; check what each one offers. CortIQ uses [server-side measurement](/integrations/server-side/).' },
      ],
    },
    {
      id: 'cortiq',
      heading: 'Where CortIQ fits',
      blocks: [
        { type: 'p', text: 'CortIQ is open source, stores analytics data in the EU (Stockholm), and combines three layers you can turn on separately:' },
        {
          type: 'list',
          items: [
            '**Server-side AI agent measurement:** AI crawlers and assistants classified on your server, with no code in the browser.',
            '**Aggregate measurement** (off by default): page views, visits, daily visitors, sources and goals from a script that stores nothing in the browser. It is designed to not require consent; you make the legal assessment for your site. See [how it counts](/docs/metrics/#aggregate).',
            '**Visitor analytics after consent,** with heatmaps, form analytics and conversion attribution. [Cookieless mode](/docs/#cookieless) keeps the session in memory only, and still waits for analytics consent.',
          ],
        },
        { type: 'p', text: 'CortIQ is free during the beta. See [pricing](/pricing/).' },
      ],
    },
  ],
  related: [
    { label: 'Traffic without Google Analytics', path: '/guides/website-traffic-without-google-analytics/' },
    { label: 'Web analytics features', path: '/features/analytics/' },
    { label: 'Cookies & browser storage', path: '/cookies/' },
  ],
};

export const COOKIES_BEFORE_CONSENT: ContentPageData = {
  path: '/guides/find-cookies-before-consent/',
  breadcrumb: [BREADCRUMB_ROOT, { label: 'Cookies before consent', path: '/guides/find-cookies-before-consent/' }],
  eyebrow: 'Guide',
  h1: 'How to find cookies loaded before consent',
  lead: 'Check in your own browser which cookies and tracking requests your site sends before the visitor answers the banner, and after "Reject all".',
  sections: [
    {
      id: 'browser',
      heading: 'Check it in Chrome DevTools',
      blocks: [
        {
          type: 'steps',
          items: [
            'Open a new incognito window, so no earlier consent choice is stored.',
            'Open DevTools (F12), go to **Network** and tick **Preserve log**.',
            'Load the page and do not touch the banner.',
            'Go to **Application → Storage → Cookies** and look at the cookies listed for your domain. Check **Local storage** too.',
            'Back in **Network**, filter on `collect`, `facebook`, `linkedin` and `hubspot` to see tracking requests that went out.',
            'Click **Reject all**, reload the page, and repeat steps 4 and 5.',
          ],
        },
        { type: 'note', tone: 'warning', text: 'Chrome blocks third-party cookies in incognito, so some ad cookies do not appear in step 4 even though the tag fired. The network request in step 5 is the better evidence.' },
      ],
    },
    {
      id: 'common',
      heading: 'Cookies that often load too early',
      blocks: [
        {
          type: 'list',
          items: [
            '`_ga` and `_ga_<ID>`: Google Analytics 4.',
            '`_gcl_au`: Google Ads conversion linker.',
            '`_fbp`: Meta Pixel.',
            '`hubspotutk`, `__hstc`, `__hssc`: HubSpot.',
            '`_clck`, `_clsk`: Microsoft Clarity.',
            '`_hjSessionUser_<ID>`: Hotjar.',
          ],
        },
        { type: 'p', text: 'A cookie that stores the visitor\'s consent choice, or keeps a login or a shopping cart working, is usually strictly necessary. Analytics and advertising cookies generally are not; the Swedish rule has no exception for analytics.' },
      ],
    },
    {
      id: 'requests',
      heading: 'Look at requests, not only cookies',
      blocks: [
        { type: 'p', text: 'A tag can send data without setting a cookie. Requests to `google-analytics.com/g/collect`, `facebook.com/tr` or `px.ads.linkedin.com` before consent mean the tag is running.' },
        { type: 'p', text: 'For Google tags, read the `gcs` parameter in the request: `G100` means ad_storage and analytics_storage are denied, `G111` that both are granted. `G111` before the visitor has chosen means the Consent Mode defaults are set to granted.' },
      ],
    },
    {
      id: 'why',
      heading: 'Why it happens',
      blocks: [
        {
          type: 'list',
          items: [
            'A script hardcoded in the theme or template, outside the tag manager and the banner\'s control.',
            'A tag in Google Tag Manager without a consent requirement.',
            'Consent Mode defaults set to granted, or set after the Google tag has already loaded.',
            'A plugin that adds its own tracking code.',
            'The banner only shows in some regions, and the check ran from outside them.',
          ],
        },
      ],
    },
    {
      id: 'automate',
      heading: 'Check every consent state automatically',
      blocks: [
        { type: 'p', text: 'Checking by hand covers one page in one state. The free [cookie consent checker](/cookie-consent-checker/) loads up to five pages in a real browser before the choice, after "Reject all", after "Accept all" and per category, and lists every cookie, request and Consent Mode signal with the evidence and a fix.' },
        { type: 'p', text: 'A clean result shows what the site does technically; whether it is lawful depends on your purposes and legal basis, which you assess as controller.' },
      ],
    },
  ],
  related: [
    { label: 'Cookie consent checker', path: '/cookie-consent-checker/' },
    { label: 'Tracking Check', path: '/tracking-check/' },
    { label: 'Consent banner (CMP)', path: '/cmp/' },
  ],
};

export const GUIDES_INDEX: ContentPageData = {
  path: '/guides/',
  breadcrumb: [BREADCRUMB_ROOT],
  eyebrow: 'Guides',
  h1: 'Web analytics guides',
  lead: 'Practical answers to common measurement problems: consent, cookies, bots and life without Google Analytics.',
  sections: [
    {
      id: 'guides',
      heading: 'Guides',
      blocks: [
        {
          type: 'list',
          items: [
            '[How to measure website traffic without Google Analytics](/guides/website-traffic-without-google-analytics/): server logs, cookieless scripts, aggregate counting and full analytics, and what each one misses.',
            '[How to detect bot traffic in web analytics](/guides/detect-bot-traffic/): the signs in your reports and the methods that catch declared and disguised bots.',
            '[Cookieless analytics alternatives to Google Analytics](/guides/cookieless-analytics-alternatives/): what cookieless means, why it is not consent-free, and the main options.',
            '[How to find cookies loaded before consent](/guides/find-cookies-before-consent/): a step-by-step check in Chrome DevTools, and the usual causes.',
          ],
        },
      ],
    },
  ],
  related: [
    { label: 'Analytics glossary', path: '/glossary/' },
    { label: 'Getting started', path: '/docs/' },
  ],
};

export const GUIDE_PAGES: ContentPageData[] = [GUIDES_INDEX, WITHOUT_GA, DETECT_BOTS, ALTERNATIVES, COOKIES_BEFORE_CONSENT];

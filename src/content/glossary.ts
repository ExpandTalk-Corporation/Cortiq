import type { ContentPageData } from './types';

// Checked against get_analytics_summary and get_overview_metrics (20261109000004), builtin_segment_match
// (20261109000003), record_form_session (20261015120000), increment_link_click (20260830120000),
// get_attribution_gap, ingest_aggregate_hit (20261107000001), consentAcceptance.ts, pixelReadiness.ts,
// useConversionGoalHealth.ts, useAttributionGap.ts, spa-tracking.js and ai-bot-registry.ts on 2026-11-08.
// Metrics that exist in code but are not shown in the dashboard (Web Vitals, recordings) are left out.
export const GLOSSARY: ContentPageData = {
  path: '/glossary/',
  breadcrumb: [{ label: 'Docs', path: '/docs/' }, { label: 'Glossary', path: '/glossary/' }],
  eyebrow: 'Glossary',
  h1: 'Web analytics glossary',
  lead: 'The figures in the CortIQ dashboard: what each one means, how it is calculated and how it compares with GA4. The detailed counting rules are in [How CortIQ counts](/docs/metrics/).',
  sections: [
    {
      id: 'visits-and-engagement',
      heading: 'Visits and engagement',
      blocks: [
        {
          type: 'terms',
          items: [
            {
              id: 'visit',
              term: 'Visit',
              definition: 'A run of page views from one browser session. A visit ends after 30 minutes without a page view; the next page view starts a new one. Visits are counted on the day they start.',
              ga4: 'Session. GA4 also uses a 30-minute timeout by default.',
            },
            {
              id: 'page-view',
              term: 'Page view',
              definition: 'One recorded page load, or one route change in a single-page app. WordPress admin, login and preview URLs are left out.',
              ga4: 'Views (`page_view` events).',
            },
            {
              id: 'visit-duration',
              term: 'Visit duration',
              definition: 'The time from the first to the last page view of a visit. Time on the last page is not measured, so a one-page visit has a duration of 0. Shown as **Session time (all)**.',
              formula: 'last page view − first page view',
            },
            {
              id: 'bounced-visit',
              term: 'Bounced visit',
              definition: 'A visit with exactly one page view. Used in the country breakdown and the MCP tools; the overview shows engagement rate instead.',
              ga4: 'GA4 defines bounce rate as the share of sessions that were not engaged, which is not the same thing.',
            },
            {
              id: 'engaged-visit',
              term: 'Engaged visit',
              definition: 'A visit that lasted more than 10 seconds or had more than one page view. Because visit duration only grows with new page views, in practice this means a visit with at least two page views. [Aggregate figures](#aggregate-visit) also count foreground time and conversions.',
              formula: 'visit duration > 10 s OR page views > 1',
              ga4: 'Engaged session: 10 seconds in the foreground, 2 or more page views, or a key event.',
            },
            {
              id: 'engagement-rate',
              term: 'Engagement rate',
              definition: 'The share of visits that were engaged. The dashboard shows it in place of bounce rate.',
              formula: 'engaged visits ÷ visits × 100',
              ga4: 'Engagement rate.',
            },
            {
              id: 'average-engagement-time',
              term: 'Average engagement time',
              definition: 'The average visit duration of engaged visits only.',
              formula: 'sum of engaged visit durations ÷ engaged visits',
              ga4: 'GA4 divides foreground time by active users, so the figures are not directly comparable.',
            },
            {
              id: 'time-per-page-view',
              term: 'Time per page view',
              definition: 'Total visit duration spread over all page views in the period.',
              formula: 'average visit duration × visits ÷ page views',
            },
          ],
        },
      ],
    },
    {
      id: 'traffic-sources',
      heading: 'Traffic sources',
      blocks: [
        { type: 'p', text: 'The traffic source, UTM tags and country of a visit come from its first page view. The source segments below can be used as filters across the dashboard. They can overlap: a paid social visit is in both **Paid traffic** and **Social media**.' },
        {
          type: 'terms',
          items: [
            {
              id: 'utm-tags',
              term: 'UTM tags',
              definition: 'The `utm_source`, `utm_medium` and `utm_campaign` parameters in the landing page URL, stored with the visit.',
              ga4: 'Session source, medium and campaign.',
            },
            {
              id: 'direct',
              term: 'Direct',
              definition: 'A visit with no referrer and no UTM source or medium, such as a typed URL, a bookmark or a link from an app that hides the referrer.',
            },
            {
              id: 'organic-search',
              term: 'Organic search',
              definition: 'An unpaid visit referred by a search engine: Google, Bing, DuckDuckGo, Ecosia, Yandex, Baidu, Qwant, Startpage, Brave Search or Yahoo Search.',
            },
            {
              id: 'paid-traffic',
              term: 'Paid traffic',
              definition: 'A visit whose `utm_medium` is `cpc`, `ppc`, `paid`, `display` or `paid-social`.',
            },
            {
              id: 'social-media',
              term: 'Social media',
              definition: 'A visit referred by, or tagged with, a social network such as LinkedIn, Facebook, Instagram, X, TikTok, YouTube, Reddit or Pinterest. Includes paid social.',
            },
            {
              id: 'ai-referral',
              term: 'AI referral',
              definition: 'A human visit that arrived from an AI assistant: the referrer is ChatGPT, Perplexity, Claude or Gemini, or the UTM source names one of them. These are people clicking a link in an answer, not bots. See [AI traffic](#ai-traffic) for the bots themselves.',
            },
          ],
        },
      ],
    },
    {
      id: 'conversions',
      heading: 'Conversions and goals',
      blocks: [
        {
          type: 'terms',
          items: [
            {
              id: 'conversion',
              term: 'Conversion',
              definition: 'A recorded goal event, such as a form submission, a click on a chosen element or a visit to a thank-you page. A goal counts at most once per visit, so repeat clicks and reloads do not add conversions.',
              ga4: 'Key event, except that GA4 counts every occurrence by default.',
            },
            {
              id: 'conversion-rate',
              term: 'Conversion rate',
              definition: 'Conversions relative to visits. Each goal counts separately, so a site with several goals can have a rate above 100%.',
              formula: 'conversions ÷ visits × 100',
              ga4: 'Session key event rate counts sessions with at least one key event instead.',
            },
            {
              id: 'primary-goal',
              term: 'Primary goal',
              definition: 'The goal you want to optimise for, for example the one sent to an ad platform as the bidding signal. Other goals are **observation** goals: counted and reported, but not the main target. A site should have one primary goal.',
            },
            {
              id: 'goal-health',
              term: 'Goal health',
              definition: 'Automatic checks on each goal. **Duplicate primary:** more than one goal is marked primary. **Fires too often:** the goal fired in more than 30% of visits in the last 30 days, which usually means it tracks something routine rather than a real conversion. **Silent:** no conversions in the last 30 days, which usually means a broken tag.',
              formula: 'firing rate = goal conversions ÷ visits (last 30 days)',
            },
          ],
        },
      ],
    },
    {
      id: 'on-page-behaviour',
      heading: 'Clicks, scrolling and forms',
      blocks: [
        { type: 'p', text: 'These figures are recorded after analytics consent.' },
        {
          type: 'terms',
          items: [
            {
              id: 'click-heatmap',
              term: 'Click heatmap',
              definition: 'Where on a page visitors click, shown as points over the page. Each point is a position with its number of clicks (intensity).',
            },
            {
              id: 'scroll-depth',
              term: 'Scroll depth',
              definition: 'How far down a page visitors scroll. The tracking script records the 25%, 50%, 75% and 100% marks, each once per page view, measured as the bottom edge of the screen against the page height.',
              formula: '(scroll position + window height) ÷ page height × 100',
              ga4: 'GA4\'s enhanced measurement records only the 90% mark.',
            },
            {
              id: 'link-clicks',
              term: 'Link clicks',
              definition: 'Clicks per link or button, counted per page and day and split by device. Links are identified by their destination without query string; buttons by their label. No visitor or visit is attached to a click.',
            },
            {
              id: 'form-start',
              term: 'Form start',
              definition: 'The first time a visitor focuses a named field in a form. Hidden fields and buttons do not count.',
            },
            {
              id: 'form-completion',
              term: 'Form completion',
              definition: 'A started form that was submitted.',
            },
            {
              id: 'form-abandonment',
              term: 'Form abandonment',
              definition: 'A started form that was not submitted before the visitor left the page or switched away from the tab.',
            },
            {
              id: 'form-conversion-rate',
              term: 'Form conversion rate',
              definition: 'The share of form starts that ended in a submission.',
              formula: 'completions ÷ starts × 100',
            },
            {
              id: 'form-completion-time',
              term: 'Average completion time',
              definition: 'The average time from the first focused field to submission, for completed forms only.',
            },
          ],
        },
      ],
    },
    {
      id: 'ai-traffic',
      heading: 'AI traffic',
      blocks: [
        { type: 'p', text: 'AI traffic comes from the [server-side adapters](/integrations/server-side/), the [Cloudflare Worker](/integrations/cloudflare/) and in-browser agent detection. Bots are classified by user agent against one shared registry, listed on the [AI traffic page](/features/ai/).' },
        {
          type: 'terms',
          items: [
            {
              id: 'ai-visit',
              term: 'AI visit',
              definition: 'One request from an AI crawler or agent. Unlike a human visit, every request counts.',
            },
            {
              id: 'training-crawler',
              term: 'Training crawler',
              definition: 'A bot that collects content to train AI models, such as GPTBot, ClaudeBot or Google-Extended. It brings no visitors back.',
            },
            {
              id: 'agentic-fetch',
              term: 'Agentic fetch',
              definition: 'A request made by an AI assistant on behalf of a person, right now, such as ChatGPT-User, Claude-User or Perplexity-User. It is the closest thing to a visit from a real customer through an AI.',
            },
            {
              id: 'citation-crawler',
              term: 'Citation crawler',
              definition: 'A bot that indexes pages for AI search and answers, such as OAI-SearchBot or PerplexityBot. Being crawled is a precondition for being cited.',
            },
            {
              id: 'unclassified-ai',
              term: 'Unclassified',
              definition: 'AI hits that could not be placed in one of the three categories. They count in the AI total but not in any category.',
            },
            {
              id: 'ai-per-100-visits',
              term: 'AI per 100 visits',
              definition: 'How much AI traffic a site gets relative to human traffic. Hidden when a UTM segment is active, because bots carry no UTM tags.',
              formula: 'AI visits ÷ visits × 100',
            },
          ],
        },
      ],
    },
    {
      id: 'consent',
      heading: 'Consent',
      blocks: [
        {
          type: 'terms',
          items: [
            {
              id: 'banner-acceptance-rate',
              term: 'Banner acceptance rate',
              definition: 'The share of consent banner answers in the last 30 days that granted analytics. Visitors who never answer the banner are not part of the figure.',
              formula: 'answers granting analytics ÷ all answers × 100',
            },
            {
              id: 'ga4-estimate',
              term: 'GA4 estimate',
              definition: 'An estimate of the page views a consent-based tool such as GA4 would record, used to show how much a banner hides.',
              formula: 'page views × banner acceptance rate',
            },
          ],
        },
      ],
    },
    {
      id: 'aggregate',
      heading: 'Aggregate figures',
      blocks: [
        { type: 'p', text: 'Sites that turn on aggregate measurement (off by default) also get counts from a separate script that stores nothing in the browser. They are shown in their own card and never added to the figures above.' },
        {
          type: 'terms',
          items: [
            {
              id: 'aggregate-visitor',
              term: 'Visitor (aggregate)',
              definition: 'A distinct visitor within one UTC day, recognised by a hash of the IP address and browser with a salt that is deleted when the day ends. Someone who returns the next day counts again.',
              ga4: 'Closest to daily active users, without a persistent identifier.',
            },
            {
              id: 'aggregate-visit',
              term: 'Visit (aggregate)',
              definition: 'Starts with the first page view of the day, after 30 minutes without activity, or when a page view arrives from a new referrer or campaign. A visit is engaged after 10 seconds in the foreground, 2 or more page views, or a conversion.',
              ga4: 'Session and engaged session, with the same engagement rule.',
            },
            {
              id: 'filtered-hits',
              term: 'Filtered hits',
              definition: 'Direct, untagged first page views that were dropped because 3 new visitors had already started on the same page within 10 seconds, a pattern typical of crawlers.',
            },
          ],
        },
      ],
    },
    {
      id: 'advertising',
      heading: 'Advertising and attribution',
      blocks: [
        {
          type: 'terms',
          items: [
            {
              id: 'effective-conversions',
              term: 'Effective conversions',
              definition: 'The conversions an ad platform pixel could actually see in the last 30 days. Aggregate conversions are counted without consent, so they are scaled by the banner acceptance rate (50% when there is no banner data yet). Consent-based conversions are used as they are.',
              formula: 'aggregate conversions × banner acceptance rate',
            },
            {
              id: 'pixel-readiness',
              term: 'Pixel readiness',
              definition: 'Whether a primary goal has enough effective conversions for ad platforms to optimise on. Under about 30 per 30 days, aggregate counting is enough; 30–50 is borderline; from about 50, with Google Ads connected, consented click IDs and Enhanced Conversions pay off. A primary goal flagged by goal health has to be fixed first. The thresholds are a rule of thumb, not a platform requirement.',
            },
            {
              id: 'lead-quality',
              term: 'Lead quality',
              definition: 'The quality a CRM assigns to a lead after a form conversion. From HubSpot, CortIQ stores **Priority**, **Qualified** or **Challenge**, valued at 300, 100 and 0 when sent to Google Ads as conversion adjustments.',
            },
            {
              id: 'attribution-gap',
              term: 'Attribution gap',
              definition: 'The share of conversions in CortIQ that did not become qualified leads in HubSpot (Priority or Qualified) in the last 30 days. A high gap means the ad platform is optimising for conversions that sales does not value.',
              formula: '(conversions − qualified leads) ÷ conversions × 100',
            },
          ],
        },
      ],
    },
  ],
  related: [
    { label: 'How CortIQ counts', path: '/docs/metrics/' },
    { label: 'AI traffic analytics', path: '/features/ai/' },
    { label: 'Getting started', path: '/docs/' },
    { label: 'MCP server', path: '/integrations/mcp/' },
  ],
};

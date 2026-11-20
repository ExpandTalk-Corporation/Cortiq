import type { Market } from "@/lib/jurisdiction";

export const BANNER_POINTS = [
  {
    title: "13 languages",
    text: "Swedish, English, German, French, Portuguese, Dutch, Norwegian, Danish, Finnish, Polish, Italian, Spanish and Icelandic, picked from the page language or set with data-lang.",
  },
  {
    title: "Reject is as easy as accept",
    text: "\"Necessary only\" sits next to \"Accept all\" on the first layer. Nothing except the necessary is preselected.",
  },
  {
    title: "Consent log",
    text: "Every choice is logged with the policy version it was given under. By default, acceptance is asked again after 12 months and refusal after 6 months.",
  },
  {
    title: "Global Privacy Control",
    text: "When the browser sends GPC, marketing stays off and cannot be switched on in the banner.",
  },
  {
    title: "Google Consent Mode v2",
    text: "Opt-in per site: default denied, then updated per category when the visitor answers.",
  },
  {
    title: "Your own CMP works too",
    text: "Keep Cookiebot, or any CMP that sends Google Consent Mode. CortIQ waits for its analytics and marketing signals.",
  },
];

export const MODES = [
  {
    title: "Cookieless",
    short: "No cookies or fingerprint. Session ID in sessionStorage after consent.",
    text: "No cookies, no device fingerprint, no cross-visit profile. A per-tab session ID in sessionStorage after analytics consent.",
  },
  {
    title: "Full",
    short: "Visitor profile and, with marketing consent, ad click IDs. After analytics consent.",
    text: "Adds a salted device hash for a visitor profile and, with marketing consent, ad click IDs. Starts only after analytics consent.",
  },
  {
    title: "Aggregate (opt-in)",
    short: "Daily counts with no identifier on the device. Opt-in per site.",
    text: "Daily counts of page views, visits and sources. Nothing is stored on the device and no identifier is set. Designed to not require consent, but regulators may treat the script's request as access under ePrivacy Art. 5(3). Whether you need consent where you operate is your assessment.",
  },
];

export const LEGAL_BASES = [
  {
    title: "ePrivacy Art. 5(3)",
    text: "Storing information on the visitor's device, or gaining access to information already there, needs consent unless it is strictly necessary to transmit a communication or to provide a service the visitor explicitly asked for. Regulators generally do not treat analytics for the site owner as strictly necessary, so CortIQ's browser tracking waits for consent (EDPB Guidelines 2/2023). National laws implement the rule and differ in detail.",
  },
  {
    title: "GDPR Art. 6(1)(f)",
    text: "Server-side request data (truncated IP, user agent, path) is still personal data. Legitimate interest can support measuring bots and protecting the site when the site owner's balancing test shows the processing is proportionate and minimal.",
  },
  {
    title: "Data minimisation",
    text: "Server-side adapters truncate IPs on your server and send only bot-like requests. Truncated IPs are cleared after 30 days and records follow the site's retention (default 365 days). EU-hosted.",
  },
];

export const LEGAL_DOCS = [
  { to: "/privacy/", label: "Privacy policy" },
  { href: "https://github.com/ExpandTalk-Corporation/Cortiq/blob/main/DPA.md", label: "Data Processing Agreement" },
  { to: "/cookies/", label: "Cookie policy" },
  { to: "/security/", label: "Security" },
];

export const LEGAL_NOTES = [
  {
    lead: "Before the install code is shown,",
    text: "the site owner confirms a checklist of what the privacy policy must cover. The confirmation is logged with its version and asked again when the checklist changes.",
  },
  { lead: "", text: "CortIQ gives you the tools. The site operator makes the final legal assessment." },
];

// Routing per country. The flow follows decide() in supabase/functions/_shared/jurisdiction/;
// status per market is never written here, it comes from src/lib/marketStatus.ts.
export const ROUTING_ID = "routing";

export const ROUTING_FLOW = [
  {
    step: "Visitor request",
    text: "A page view, event, consent answer or server-side request reaches a CortIQ collector.",
  },
  {
    step: "Country",
    text: "Taken only from the signed edge location. Without one, CortIQ uses the markets you have selected, or EU/EEA, UK and Québec if you have selected none. Until you have answered where you operate, EU/EEA, UK and Québec are also checked.",
  },
  {
    step: "Purpose",
    text: "Each collector names its purpose: statistics, conversions, attribution, sharing with ad platforms or server-side AI-agent measurement.",
  },
  {
    step: "Rule",
    text: "The strictest matching rule decides. On customer sites only approved rules count; without one, the baseline is opt-in for every purpose. You can make a purpose stricter, never looser.",
  },
];

export const ROUTING_OUTCOMES = [
  {
    outcome: "Collect",
    text: "The data is stored.",
  },
  {
    outcome: "Drop",
    text: "Applied now for purposes you turn Off and for requests that carry GPC, as listed below. Opt-in and market rules are recorded only, not yet applied.",
  },
  {
    outcome: "Log decision",
    text: "Every decision is counted per day, country and purpose. Daily counts only.",
  },
];

export const ROUTING_TODAY_LINE =
  "Today CortIQ does the same in every market: browser analytics waits for consent, aggregate counting runs only on sites that turn it on, server-side AI-agent measurement runs from the site's own server, and the market rules below are logged, not applied.";

export const ROUTING_LAWS: Record<Market, string> = {
  eu: "ePrivacy Directive art. 5(3) as implemented in each country (Sweden: LEK 9 kap. 28 §), and the GDPR",
  uk: "PECR as amended by the Data (Use and Access) Act 2025, and the UK GDPR",
  ch: "Federal Act on Data Protection (FADP) and Telecommunications Act art. 45c",
  us_ca: "CCPA as amended by the CPRA",
  us_other: "State privacy laws; several require honouring a universal opt-out signal such as GPC",
  ca_qc: "Law 25 (CQLR c. P-39.1)",
  ca_other: "PIPEDA, or a substantially similar provincial law",
  br: "LGPD",
  other: "No rule pack yet. Local law is the site owner's assessment.",
};

export const ROUTING_RULES_NOTE =
  "Every rule on file is a working hypothesis. Draft rules and rules in review apply only on test sites CortIQ has flagged, never on customer sites.";

// The Off list is the dashboard's wording (RulesByMarketTab NOT_YET_APPLIED); a test keeps them equal.
export const ROUTING_OFF_COLLECTORS =
  "page views and events, aggregate counts, link clicks, AI-search referrals, e-commerce purchases, Core Web Vitals, content and media interactions, AI-bot detection in the browser and canary links, conversions, click IDs, server-side AI-agent requests, Cloudflare traffic, imported server logs and ad-platform uploads. Some other collectors do not check it yet.";

export const ROUTING_WORKS_TODAY = [
  {
    title: "Global Privacy Control",
    text: "When the browser sends GPC, the banner keeps marketing off, aggregate counting stops, and the server-side adapters (5.5.20 and later) do not send the request.",
  },
  {
    title: "Your own Off",
    text: `A purpose you turn off is dropped now in ${ROUTING_OFF_COLLECTORS}`,
  },
  {
    title: "Country of each consent",
    text: "CortIQ already records which country each consent was given from. It comes from the signed edge location, or the browser time zone when that is missing.",
  },
  {
    title: "Coverage per country",
    text: "Consent → Impact shows per country what the rules would allow, banner answers by language, and pixel readiness.",
  },
];

export const ATTRIBUTION = [
  { title: "Click IDs, consent-gated", text: "gclid, fbclid, msclkid, ttclid and li_fat_id are kept only with marketing consent." },
  { title: "Goal health", text: "Flags goals that fire on too many sessions, goals that went silent and duplicate primary goals." },
  { title: "Lead quality to Google Ads", text: "HubSpot lead quality is uploaded as click conversions, matched on gclid. Email is SHA-256 hashed on arrival. Only visits with marketing consent are uploaded." },
  { title: "Do you need the pixel?", text: "Compares aggregate-mode conversion counts with your banner acceptance to show whether an ad pixel has enough data to learn." },
];

export const OPERATIONS: { id: "server" | "uptime" | "sri" | "api"; title: string; text: string }[] = [
  { id: "server", title: "Server-side bot measurement", text: "Adapters for Next.js, Netlify, Cloudflare, Node, WordPress and PHP catch crawlers that never run JavaScript." },
  { id: "uptime", title: "Uptime and snippet check", text: "Every 5 minutes: is the site up, and is the CortIQ snippet still on the page?" },
  { id: "sri", title: "Pinned installs with SRI", text: "Optional versioned script URLs with integrity hashes, so a changed file is blocked by the browser." },
  { id: "api", title: "REST API and MCP", text: "Query your analytics from your own tools or from AI agents with read-only API keys." },
];
